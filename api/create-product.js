import { createClient } from '@supabase/supabase-js';
import Busboy from 'busboy';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate user
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Check if user is a seller
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userError || userData.role !== 'seller') {
    return res.status(403).json({ error: 'Forbidden: Seller role required' });
  }

  // Get seller details and check product limit
  const { data: sellerData, error: sellerError } = await supabase
    .from('sellers')
    .select('id, product_count')
    .eq('user_id', user.id)
    .single();
  if (sellerError) {
    return res.status(500).json({ error: 'Seller profile not found' });
  }
  if (sellerData.product_count >= 30) {
    return res.status(400).json({ error: 'Product limit of 30 exceeded' });
  }

  // Parse multipart form data
  const fields = {};
  let fileBuffer = null;
  let fileMimeType = '';
  let fileName = '';
  const busboy = Busboy({ headers: req.headers });
  busboy.on('field', (fieldname, val) => {
    fields[fieldname] = val;
  });
  busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    if (fieldname === 'image') {
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
        fileMimeType = mimetype;
        fileName = filename;
      });
    }
  });
  busboy.on('finish', async () => {
    try {
      // Validate required fields
      const { name, description, price, business_name } = fields;
      if (!name || !description || !price || !business_name || !fileBuffer) {
        return res.status(400).json({ error: 'Missing required fields: name, description, price, business_name, image' });
      }

      // Validate price
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        return res.status(400).json({ error: 'Invalid price: must be a positive number' });
      }

      // Upload image to Supabase storage
      const ext = fileName.split('.').pop() || 'jpg';
      const uploadFileName = `product_${Date.now()}_${user.id}.${ext}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('products')
        .upload(uploadFileName, fileBuffer, {
          contentType: fileMimeType || 'image/jpeg',
          upsert: false
        });
      if (uploadError) {
        console.error('Image upload error:', uploadError);
        return res.status(500).json({ error: 'Image upload failed' });
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('products')
        .getPublicUrl(uploadFileName);

      // Insert product into database
      const { data: productData, error: productError } = await supabase
        .from('products')
        .insert({
          seller_id: sellerData.id,
          name: name.trim(),
          description: description.trim(),
          price: parsedPrice,
          image_url: publicUrl,
          business_name: business_name.trim(),
          is_active: true
        })
        .select('id')
        .single();
      if (productError) {
        console.error('Product insert error:', productError);
        // Optionally delete uploaded image on failure
        await supabase.storage.from('products').remove([uploadFileName]);
        return res.status(500).json({ error: 'Failed to create product' });
      }

      // Increment product count
      const { error: updateError } = await supabase
        .from('sellers')
        .update({ product_count: sellerData.product_count + 1 })
        .eq('id', sellerData.id);
      if (updateError) {
        console.error('Product count update error:', updateError);
        // Note: Product is created, but count not updated; may need manual fix
      }

      // Return success
      res.status(201).json({ product_id: productData.id });
    } catch (error) {
      console.error('Unexpected error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  busboy.on('error', (error) => {
    console.error('Busboy error:', error);
    res.status(500).json({ error: 'File upload error' });
  });
  req.pipe(busboy);
}