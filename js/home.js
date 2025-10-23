import { supabase } from './config.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Track page view
  await trackPageView();

  // Fetch and render featured products
  await loadFeaturedProducts();

  // Add event listeners for navigation links if needed (e.g., for dynamic behavior)
  // Assuming navigation links are static in HTML, no additional listeners required unless specified
});

async function trackPageView() {
  try {
    const response = await fetch('/api/track-analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        page_url: window.location.pathname
      })
    });
    if (!response.ok) {
      console.error('Failed to track page view');
    }
  } catch (error) {
    console.error('Error tracking page view:', error);
  }
}

async function loadFeaturedProducts() {
  try {
    // Attempt to get top products by sales count
    const { data: transactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('product_id')
      .eq('payment_status', 'completed');

    if (transactionsError) {
      console.error('Error fetching transactions:', transactionsError);
      // Fallback to ordering by created_at
      await loadProductsByCreatedAt();
      return;
    }

    // Count sales per product
    const salesCount = {};
    transactions.forEach(transaction => {
      salesCount[transaction.product_id] = (salesCount[transaction.product_id] || 0) + 1;
    });

    // Get top product IDs sorted by sales descending
    const topProductIds = Object.keys(salesCount)
      .sort((a, b) => salesCount[b] - salesCount[a])
      .slice(0, 10);

    let products;
    if (topProductIds.length > 0) {
      // Fetch products by top IDs
      const { data: fetchedProducts, error: productsError } = await supabase
        .from('products')
        .select('*')
        .in('id', topProductIds)
        .eq('is_active', true);

      if (productsError) {
        console.error('Error fetching products by sales:', productsError);
        await loadProductsByCreatedAt();
        return;
      }

      // Sort fetched products by sales count
      products = fetchedProducts.sort((a, b) => salesCount[b.id] - salesCount[a.id]);
    } else {
      // No sales data, fallback to created_at
      await loadProductsByCreatedAt();
      return;
    }

    renderProducts(products);
  } catch (error) {
    console.error('Error loading featured products:', error);
  }
}

async function loadProductsByCreatedAt() {
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching products by created_at:', error);
    return;
  }

  renderProducts(products);
}

function renderProducts(products) {
  const container = document.getElementById('featured-products');
  if (!container) {
    console.error('Featured products container not found');
    return;
  }

  container.innerHTML = '';

  products.forEach(product => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <img src="${product.image_url}" alt="${product.name}" loading="lazy">
      <h3>${product.name}</h3>
      <p>${product.business_name}</p>
      <p>Price: ${product.price} GHS</p>
      <a href="products.html">View Details</a>
    `;
    container.appendChild(card);
  });
}