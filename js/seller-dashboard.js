import { supabase, getCurrentUser } from './config.js';
import { authGuard } from './auth-guard.js';

document.addEventListener('DOMContentLoaded', async () => {
  await authGuard('seller');
  await loadDashboard();
});

async function loadDashboard() {
  const user = await getCurrentUser();
  if (!user) return;

  // Get seller info
  const { data: seller, error: sellerError } = await supabase
    .from('sellers')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (sellerError || !seller) {
    console.error('Error fetching seller:', sellerError);
    return;
  }

  const sellerId = seller.id;

  // Load products
  await loadProducts(sellerId);

  // Load sales and earnings
  await loadSalesAndEarnings(sellerId);

  // Setup add product form
  setupAddProductForm(sellerId, seller.business_name);

  // Setup logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
  });
}

async function loadProducts(sellerId) {
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  const productsContainer = document.getElementById('products-list');
  productsContainer.innerHTML = '';

  products.forEach(product => {
    const productDiv = document.createElement('div');
    productDiv.className = 'product-card';
    productDiv.innerHTML = `
      <img src="${product.image_url}" alt="${product.name}">
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      <p>Price: ${product.price} GHS</p>
      <button class="edit-btn" data-id="${product.id}">Edit</button>
      <button class="delete-btn" data-id="${product.id}">Delete</button>
    `;
    productsContainer.appendChild(productDiv);
  });

  // Add event listeners for edit and delete
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => editProduct(e.target.dataset.id));
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => deleteProduct(e.target.dataset.id));
  });
}

async function setupAddProductForm(sellerId, businessName) {
  const form = document.getElementById('add-product-form');
  document.getElementById('business-name').value = businessName;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Check product limit
    const { count, error: countError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', sellerId)
      .eq('is_active', true);

    if (countError) {
      console.error('Error checking product count:', countError);
      return;
    }

    if (count >= 30) {
      alert('You have reached the maximum limit of 30 products.');
      return;
    }

    const formData = new FormData(form);
    const name = formData.get('name');
    const description = formData.get('description');
    const price = parseFloat(formData.get('price'));
    const imageFile = formData.get('image');

    if (!name || !description || !price || !imageFile) {
      alert('Please fill all fields.');
      return;
    }

    // Upload image
    const fileName = `${Date.now()}-${imageFile.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('products')
      .upload(fileName, imageFile);

    if (uploadError) {
      console.error('Error uploading image:', uploadError);
      return;
    }

    const imageUrl = supabase.storage.from('products').getPublicUrl(fileName).data.publicUrl;

    // Insert product
    const { error: insertError } = await supabase
      .from('products')
      .insert({
        seller_id: sellerId,
        name,
        description,
        price,
        image_url: imageUrl,
        business_name: businessName,
        is_active: true
      });

    if (insertError) {
      console.error('Error inserting product:', insertError);
      return;
    }

    alert('Product added successfully!');
    form.reset();
    await loadProducts(sellerId);
  });
}

async function editProduct(productId) {
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (error) {
    console.error('Error fetching product:', error);
    return;
  }

  // Pre-populate form
  document.getElementById('edit-name').value = product.name;
  document.getElementById('edit-description').value = product.description;
  document.getElementById('edit-price').value = product.price;
  document.getElementById('edit-business-name').value = product.business_name;

  // Show edit form
  document.getElementById('edit-product-section').style.display = 'block';

  const editForm = document.getElementById('edit-product-form');
  editForm.onsubmit = async (e) => {
    e.preventDefault();

    const formData = new FormData(editForm);
    const name = formData.get('name');
    const description = formData.get('description');
    const price = parseFloat(formData.get('price'));
    const imageFile = formData.get('image');

    let imageUrl = product.image_url;
    if (imageFile) {
      // Upload new image
      const fileName = `${Date.now()}-${imageFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('products')
        .upload(fileName, imageFile);

      if (uploadError) {
        console.error('Error uploading image:', uploadError);
        return;
      }

      imageUrl = supabase.storage.from('products').getPublicUrl(fileName).data.publicUrl;

      // Delete old image
      await supabase.storage.from('products').remove([product.image_url.split('/').pop()]);
    }

    // Update product
    const { error: updateError } = await supabase
      .from('products')
      .update({
        name,
        description,
        price,
        image_url: imageUrl,
        business_name: formData.get('business_name'),
        updated_at: new Date()
      })
      .eq('id', productId);

    if (updateError) {
      console.error('Error updating product:', updateError);
      return;
    }

    alert('Product updated successfully!');
    document.getElementById('edit-product-section').style.display = 'none';
    await loadProducts(product.seller_id);
  };
}

async function deleteProduct(productId) {
  if (!confirm('Are you sure you want to delete this product?')) return;

  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('image_url, seller_id')
    .eq('id', productId)
    .single();

  if (fetchError) {
    console.error('Error fetching product for deletion:', fetchError);
    return;
  }

  // Delete image
  await supabase.storage.from('products').remove([product.image_url.split('/').pop()]);

  // Delete product
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId);

  if (error) {
    console.error('Error deleting product:', error);
    return;
  }

  alert('Product deleted successfully!');
  await loadProducts(product.seller_id);
}

async function loadSalesAndEarnings(sellerId) {
  // Get seller's product IDs
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id')
    .eq('seller_id', sellerId);

  if (prodError) {
    console.error('Error fetching products for sales:', prodError);
    return;
  }

  const productIds = products.map(p => p.id);

  // Get transactions
  const { data: transactions, error: transError } = await supabase
    .from('transactions')
    .select('*')
    .in('product_id', productIds)
    .eq('payment_status', 'completed');

  if (transError) {
    console.error('Error fetching transactions:', transError);
    return;
  }

  // Display sales
  const salesContainer = document.getElementById('sales-list');
  salesContainer.innerHTML = '';
  transactions.forEach(trans => {
    const transDiv = document.createElement('div');
    transDiv.innerHTML = `
      <p>Product ID: ${trans.product_id}, Amount: ${trans.amount} GHS, Customer: ${trans.customer_name}</p>
    `;
    salesContainer.appendChild(transDiv);
  });

  // Calculate earnings (90% of transaction amount)
  const totalEarnings = transactions.reduce((sum, trans) => sum + (trans.amount * 0.9), 0);
  document.getElementById('total-earnings').textContent = `${totalEarnings.toFixed(2)} GHS`;

  // Breakdown by product
  const earningsByProduct = {};
  transactions.forEach(trans => {
    if (!earningsByProduct[trans.product_id]) earningsByProduct[trans.product_id] = 0;
    earningsByProduct[trans.product_id] += trans.amount * 0.9;
  });

  const breakdownContainer = document.getElementById('earnings-breakdown');
  breakdownContainer.innerHTML = '';
  for (const [prodId, earnings] of Object.entries(earningsByProduct)) {
    const div = document.createElement('div');
    div.textContent = `Product ${prodId}: ${earnings.toFixed(2)} GHS`;
    breakdownContainer.appendChild(div);
  }
}