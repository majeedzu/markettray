export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { search, min_price, max_price, page = 1, limit = 10 } = req.query;

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let query = supabase
    .from('products')
    .select('*, sellers(business_name)')
    .eq('is_active', true);

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  if (min_price) {
    query = query.gte('price', parseFloat(min_price));
  }

  if (max_price) {
    query = query.lte('price', parseFloat(max_price));
  }

  // Get total count
  const { count, error: countError } = await query.select('*', { count: 'exact', head: true });

  if (countError) {
    return res.status(500).json({ error: countError.message });
  }

  // Apply pagination
  const offset = (parseInt(page) - 1) * parseInt(limit);
  query = query.range(offset, offset + parseInt(limit) - 1);

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ products: data, total: count });
}