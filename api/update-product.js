import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Only allow PUT requests
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Initialize Supabase client with service role key for server-side operations
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Extract and validate authorization token
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  // Authenticate user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }

  // Extract request body
  const { product_id, name, description, price, image } = req.body;

  // Validate required product_id
  if (!product_id) {
    return res.status(400).json({ error: 'Product ID is required' });
  }

  // Validate price if provided
  if (price !== undefined && (isNaN(price) || price <= 0)) {
    return res.status(400).json({ error: 'Invalid price: must be a positive number' });
  }

  // Fetch product to verify ownership and get current image URL
  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('seller_id, image_url')
    .eq('id', product_id)
    .single();

  if (fetchError || !product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Verify user is the seller of the product
  const { data: seller, error: sellerError } = await supabase
    .from('sellers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (sellerError || !seller) {
    return res.status(403).json({ error: 'Forbidden: User is not a seller' });
  }

  if (product.seller_id !== seller.id) {
    return res.status(403).json({ error: 'Forbidden: Not the product owner' });
  }

  let image_url = product.image_url;

  // Handle image upload if provided (assuming base64 encoded string)
  if (image) {
    try {
      // Decode base64 image
      const buffer = Buffer.from(image, 'base64');
      const fileName = `product-${product_id}-${Date.now()}.jpg`; // Assuming JPEG format

      // Upload new image to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('products') // Assuming 'products' bucket
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        return res.status(500).json({ error: 'Image upload failed' });
      }

      // Get public URL for the uploaded image
      const { data: publicUrlData } = supabase.storage
        .from('products')
        .getPublicUrl(fileName);
      image_url = publicUrlData.publicUrl;

      // Delete old image if it exists
      if (product.image_url) {
        const oldFileName = product.image_url.split('/').pop();
        await supabase.storage.from('products').remove([oldFileName]);
      }
    } catch (error) {
      return res.status(500).json({ error: 'Image processing failed' });
    }
  }

  // Prepare update data
  const updateData = { updated_at: new Date().toISOString() };
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (price !== undefined) updateData.price = price;
  if (image) updateData.image_url = image_url;

  // Update product in database
  const { error: updateError } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', product_id);

  if (updateError) {
    return res.status(500).json({ error: 'Product update failed' });
  }

  // Return success response
  res.status(200).json({ message: 'Product updated successfully' });
}