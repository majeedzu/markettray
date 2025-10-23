import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { product_id } = req.query;

  if (!product_id) {
    return res.status(400).json({ error: 'Product ID required' });
  }

  // Authenticate the request
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  const { data: user, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const userId = user.user.id;

  // Fetch the product to verify ownership and get image URL
  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('seller_id, image_url')
    .eq('id', product_id)
    .single();

  if (fetchError || !product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Verify the user is the product owner
  if (product.seller_id !== userId) {
    return res.status(403).json({ error: 'Not authorized to delete this product' });
  }

  // Delete the product image from Supabase storage if it exists
  if (product.image_url) {
    try {
      const url = new URL(product.image_url);
      const pathParts = url.pathname.split('/storage/v1/object/public/');
      if (pathParts.length > 1) {
        const fullPath = pathParts[1];
        const [bucket, ...filePathParts] = fullPath.split('/');
        const filePath = filePathParts.join('/');
        await supabase.storage.from(bucket).remove([filePath]);
      }
    } catch (storageError) {
      // Log error but continue with deletion
      console.error('Error deleting image from storage:', storageError);
    }
  }

  // Soft delete the product by setting is_active to false
  const { error: updateError } = await supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', product_id);

  if (updateError) {
    return res.status(500).json({ error: 'Failed to delete product' });
  }

  // Decrement the product_count in the sellers table
  const { error: decrementError } = await supabase
    .from('sellers')
    .update({ product_count: supabase.raw('product_count - 1') })
    .eq('user_id', userId);

  if (decrementError) {
    // Log error but do not fail the request
    console.error('Error decrementing product count:', decrementError);
  }

  res.status(200).json({ message: 'Product deleted successfully' });
}