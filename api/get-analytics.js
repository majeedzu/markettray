import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate using Supabase auth token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No auth token provided' });
  }
  const token = authHeader.split(' ')[1];

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: user, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Check if user is admin
  const { data: userData, error: roleError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (roleError || userData.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Get query parameters
  const { time_range = 'daily' } = req.query;

  // Define date range and grouping based on time_range
  let startDate, groupBy;
  const now = new Date();
  switch (time_range) {
    case 'daily':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
      groupBy = 'day';
      break;
    case 'weekly':
      startDate = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000); // Last 12 weeks
      groupBy = 'week';
      break;
    case 'monthly':
      startDate = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000); // Last 12 months
      groupBy = 'month';
      break;
    case 'yearly':
      startDate = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000); // Last 5 years
      groupBy = 'year';
      break;
    default:
      return res.status(400).json({ error: 'Invalid time_range. Use daily, weekly, monthly, or yearly.' });
  }

  // Query analytics table for time series data
  const { data: analytics, error: analyticsError } = await supabase
    .from('analytics')
    .select('date, page_views, unique_visitors, purchases_count')
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: true });
  if (analyticsError) {
    return res.status(500).json({ error: analyticsError.message });
  }

  // Group analytics data by the specified period
  const grouped = {};
  analytics.forEach(row => {
    const d = new Date(row.date);
    let key;
    if (groupBy === 'day') {
      key = d.toISOString().split('T')[0];
    } else if (groupBy === 'week') {
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
      key = weekStart.toISOString().split('T')[0];
    } else if (groupBy === 'month') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (groupBy === 'year') {
      key = `${d.getFullYear()}-01-01`;
    }
    if (!grouped[key]) {
      grouped[key] = { page_views: 0, unique_visitors: 0, purchases_count: 0 };
    }
    grouped[key].page_views += row.page_views;
    grouped[key].unique_visitors += row.unique_visitors;
    grouped[key].purchases_count += row.purchases_count;
  });
  const time_series = Object.entries(grouped).map(([period, data]) => ({ period, ...data }));

  // Query for top products by revenue
  const { data: topProductsData, error: prodError } = await supabase
    .from('transactions')
    .select('product_id, amount, products!inner(name)')
    .eq('payment_status', 'completed')
    .gte('created_at', startDate.toISOString());
  if (prodError) {
    return res.status(500).json({ error: prodError.message });
  }
  const prodAgg = {};
  topProductsData.forEach(t => {
    const pid = t.product_id;
    if (!prodAgg[pid]) {
      prodAgg[pid] = { name: t.products.name, revenue: 0 };
    }
    prodAgg[pid].revenue += t.amount;
  });
  const top_products = Object.values(prodAgg)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Query for top sellers by revenue
  const { data: topSellersData, error: sellError } = await supabase
    .from('transactions')
    .select('amount, products!inner(sellers!inner(business_name))')
    .eq('payment_status', 'completed')
    .gte('created_at', startDate.toISOString());
  if (sellError) {
    return res.status(500).json({ error: sellError.message });
  }
  const sellAgg = {};
  topSellersData.forEach(t => {
    const sid = t.products.sellers.id; // Assuming sellers.id is the key
    if (!sellAgg[sid]) {
      sellAgg[sid] = { business_name: t.products.sellers.business_name, revenue: 0 };
    }
    sellAgg[sid].revenue += t.amount;
  });
  const top_sellers = Object.values(sellAgg)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Return JSON response
  res.status(200).json({
    time_series,
    top_products,
    top_sellers
  });
}