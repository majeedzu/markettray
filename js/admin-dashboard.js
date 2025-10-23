import { supabase, getCurrentUser } from './config.js';
import { authGuard } from './auth-guard.js';

// Initialize Chart.js if not already loaded (assuming CDN in HTML)
if (typeof Chart === 'undefined') {
  console.error('Chart.js library not loaded. Please include Chart.js CDN in admin-dashboard.html');
}

// Run auth guard on page load
document.addEventListener('DOMContentLoaded', async () => {
  await authGuard('admin');
  await loadDashboardData();
});

// Function to load all dashboard data
async function loadDashboardData() {
  try {
    // Fetch overview metrics
    const overviewData = await fetchOverviewMetrics();
    renderOverview(overviewData);

    // Fetch time-series analytics
    const timeSeriesData = await fetchTimeSeriesAnalytics();
    renderTimeSeriesCharts(timeSeriesData);

    // Fetch top products and sellers
    const topProducts = await fetchTopProducts();
    const topSellers = await fetchTopSellers();
    renderTopLists(topProducts, topSellers);

  } catch (error) {
    console.error('Error loading dashboard data:', error);
    // Display error message to user
    document.getElementById('error-message').textContent = 'Failed to load dashboard data. Please try again.';
  }
}

// Fetch overview metrics
async function fetchOverviewMetrics() {
  const [usersRes, productsRes, transactionsRes, revenueRes] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('payment_status', 'completed'),
    supabase.from('transactions').select('amount').eq('payment_status', 'completed')
  ]);

  const totalRevenue = revenueRes.data ? revenueRes.data.reduce((sum, t) => sum + t.amount, 0) : 0;

  return {
    totalUsers: usersRes.count,
    totalProducts: productsRes.count,
    totalTransactions: transactionsRes.count,
    totalRevenue
  };
}

// Render overview section
function renderOverview(data) {
  document.getElementById('total-users').textContent = data.totalUsers;
  document.getElementById('total-products').textContent = data.totalProducts;
  document.getElementById('total-transactions').textContent = data.totalTransactions;
  document.getElementById('total-revenue').textContent = `GHS ${data.totalRevenue.toFixed(2)}`;
}

// Fetch time-series analytics data
async function fetchTimeSeriesAnalytics() {
  // Fetch last 30 days for daily, or adjust for other periods
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 30);

  const { data, error } = await supabase
    .from('analytics')
    .select('date, page_views, unique_visitors, purchases_count')
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', endDate.toISOString().split('T')[0])
    .order('date');

  if (error) throw error;

  // Aggregate for different periods
  const daily = data;
  const weekly = aggregateByPeriod(data, 'week');
  const monthly = aggregateByPeriod(data, 'month');
  const yearly = aggregateByPeriod(data, 'year');

  return { daily, weekly, monthly, yearly };
}

// Helper to aggregate data by period
function aggregateByPeriod(data, period) {
  const grouped = {};
  data.forEach(item => {
    const date = new Date(item.date);
    let key;
    if (period === 'week') {
      const weekStart = new Date(date.setDate(date.getDate() - date.getDay()));
      key = weekStart.toISOString().split('T')[0];
    } else if (period === 'month') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    } else if (period === 'year') {
      key = date.getFullYear().toString();
    }

    if (!grouped[key]) {
      grouped[key] = { page_views: 0, unique_visitors: 0, purchases_count: 0, count: 0 };
    }
    grouped[key].page_views += item.page_views;
    grouped[key].unique_visitors += item.unique_visitors;
    grouped[key].purchases_count += item.purchases_count;
    grouped[key].count += 1;
  });

  return Object.keys(grouped).map(key => ({
    date: key,
    page_views: grouped[key].page_views,
    unique_visitors: grouped[key].unique_visitors,
    purchases_count: grouped[key].purchases_count
  }));
}

// Render time-series charts
function renderTimeSeriesCharts(data) {
  // Assuming HTML has canvas elements with ids: daily-views-chart, etc.
  renderChart('daily-views-chart', data.daily, 'Page Views (Daily)', 'line', 'page_views');
  renderChart('weekly-views-chart', data.weekly, 'Page Views (Weekly)', 'line', 'page_views');
  renderChart('monthly-views-chart', data.monthly, 'Page Views (Monthly)', 'line', 'page_views');
  renderChart('yearly-views-chart', data.yearly, 'Page Views (Yearly)', 'line', 'page_views');

  // Similar for purchases
  renderChart('daily-purchases-chart', data.daily, 'Purchases (Daily)', 'bar', 'purchases_count');
  renderChart('weekly-purchases-chart', data.weekly, 'Purchases (Weekly)', 'bar', 'purchases_count');
  renderChart('monthly-purchases-chart', data.monthly, 'Purchases (Monthly)', 'bar', 'purchases_count');
  renderChart('yearly-purchases-chart', data.yearly, 'Purchases (Yearly)', 'bar', 'purchases_count');
}

// Helper to render a chart
function renderChart(canvasId, data, label, type, key) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  new Chart(ctx, {
    type: type,
    data: {
      labels: data.map(d => d.date),
      datasets: [{
        label: label,
        data: data.map(d => d[key]),
        borderColor: '#0d9488',
        backgroundColor: 'rgba(13, 148, 136, 0.2)',
        fill: true
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

// Fetch top 10 products by sales count
async function fetchTopProducts() {
  const { data, error } = await supabase
    .rpc('get_top_products_by_sales', { limit_count: 10 });

  if (error) {
    // Fallback if RPC not available
    console.warn('RPC not available, using alternative query');
    const { data: altData, error: altError } = await supabase
      .from('transactions')
      .select('product_id, products(name)')
      .eq('payment_status', 'completed');

    if (altError) throw altError;

    const counts = {};
    altData.forEach(t => {
      counts[t.product_id] = (counts[t.product_id] || 0) + 1;
    });

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ product_id: id, name: 'Product ' + id, sales_count: count }));

    return sorted;
  }

  return data;
}

// Fetch top 10 sellers by revenue
async function fetchTopSellers() {
  const { data, error } = await supabase
    .rpc('get_top_sellers_by_revenue', { limit_count: 10 });

  if (error) {
    // Fallback
    console.warn('RPC not available, using alternative query');
    const { data: altData, error: altError } = await supabase
      .from('transactions')
      .select('amount, products(seller_id, sellers(business_name))')
      .eq('payment_status', 'completed');

    if (altError) throw altError;

    const revenues = {};
    altData.forEach(t => {
      const sellerId = t.products.seller_id;
      revenues[sellerId] = {
        business_name: t.products.sellers.business_name,
        revenue: (revenues[sellerId]?.revenue || 0) + t.amount
      };
    });

    const sorted = Object.entries(revenues)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([id, data]) => ({ seller_id: id, business_name: data.business_name, revenue: data.revenue }));

    return sorted;
  }

  return data;
}

// Render top lists
function renderTopLists(products, sellers) {
  const productsList = document.getElementById('top-products-list');
  products.forEach(p => {
    const li = document.createElement('li');
    li.textContent = `${p.name} - ${p.sales_count} sales`;
    productsList.appendChild(li);
  });

  const sellersList = document.getElementById('top-sellers-list');
  sellers.forEach(s => {
    const li = document.createElement('li');
    li.textContent = `${s.business_name} - GHS ${s.revenue.toFixed(2)}`;
    sellersList.appendChild(li);
  });
}

// Logout functionality
document.getElementById('logout-btn').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error logging out:', error);
  } else {
    window.location.href = '/login.html';
  }
});