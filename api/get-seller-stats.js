import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  // Authenticate the request
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (user.id !== user_id) {
    return res.status(403).json({ error: 'Forbidden: Not the seller' });
  }

  try {
    // Fetch products for the seller
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('seller_id', user_id)
      .eq('is_active', true);
    if (productsError) throw productsError;

    const product_count = products.length;
    const products_details = products;

    // Fetch transactions for the seller's products
    const { data: transactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('*, products!inner(name, business_name)')
      .eq('products.seller_id', user_id)
      .eq('payment_status', 'completed')
      .order('created_at', { ascending: false });
    if (transactionsError) throw transactionsError;

    const total_sales = transactions.length;
    const total_revenue = transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const recent_transactions = transactions.slice(0, 10);

    res.status(200).json({
      product_count,
      products: products_details,
      total_sales,
      total_revenue,
      recent_transactions
    });
  } catch (error) {
    console.error('Error fetching seller stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}