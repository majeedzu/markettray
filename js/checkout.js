import { supabase, paystackPublicKey } from './config.js';

// Get product ID from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('product_id');

if (!productId) {
  alert('Product ID is missing. Redirecting to products page.');
  window.location.href = 'products.html';
}

// Elements
const productInfoDiv = document.getElementById('product-info');
const checkoutForm = document.getElementById('checkout-form');
const makePaymentBtn = document.getElementById('make-payment-btn');
const loadingDiv = document.getElementById('loading');

// Fetch and display product details
async function loadProductDetails() {
  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('name, description, price, image_url, business_name')
      .eq('id', productId)
      .single();

    if (error || !product) {
      throw new Error('Product not found');
    }

    productInfoDiv.innerHTML = `
      <img src="${product.image_url}" alt="${product.name}" style="max-width: 200px;">
      <h2>${product.name}</h2>
      <p>${product.description}</p>
      <p><strong>Price:</strong> GHS ${product.price}</p>
      <p><strong>Seller:</strong> ${product.business_name}</p>
    `;
  } catch (err) {
    console.error('Error loading product:', err);
    productInfoDiv.innerHTML = '<p>Error loading product details.</p>';
  }
}

// Form validation
function validateForm(formData) {
  const { customer_name, customer_email, customer_phone, shipping_address, payment_number } = formData;

  if (!customer_name.trim()) return 'Customer name is required.';
  if (!customer_email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) return 'Valid email is required.';
  if (!customer_phone.trim() || !/^0\d{9}$/.test(customer_phone)) return 'Valid phone number is required (10 digits starting with 0).';
  if (!shipping_address.trim()) return 'Shipping address is required.';
  if (!payment_number.trim() || !/^0\d{9}$/.test(payment_number)) return 'Valid payment number is required (10 digits starting with 0).';

  return null; // No errors
}

// Handle payment initiation
async function initiatePayment(formData) {
  const referralCode = sessionStorage.getItem('referral_code');

  const payload = {
    product_id: productId,
    customer_name: formData.get('customer_name'),
    customer_email: formData.get('customer_email'),
    customer_phone: formData.get('customer_phone'),
    shipping_address: formData.get('shipping_address'),
    payment_number: formData.get('payment_number'),
    ...(referralCode && { referral_code: referralCode })
  };

  try {
    const response = await fetch('/api/initiate-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Payment initiation failed');
    }

    return data;
  } catch (err) {
    console.error('Error initiating payment:', err);
    throw err;
  }
}

// Handle form submission
checkoutForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(checkoutForm);
  const validationError = validateForm(formData);

  if (validationError) {
    alert(validationError);
    return;
  }

  makePaymentBtn.disabled = true;
  loadingDiv.style.display = 'block';

  try {
    const paymentData = await initiatePayment(formData);

    // Use Paystack inline popup
    PaystackPop.setup({
      key: paystackPublicKey,
      reference: paymentData.reference,
      email: formData.get('customer_email'),
      amount: parseFloat(formData.get('amount')) * 100, // Assuming amount is in form, but actually from product
      currency: 'GHS',
      onSuccess: (transaction) => {
        alert('Payment successful! Redirecting to homepage.');
        window.location.href = 'index.html';
      },
      onClose: () => {
        alert('Payment cancelled.');
        makePaymentBtn.disabled = false;
        loadingDiv.style.display = 'none';
      }
    });
  } catch (err) {
    alert('Error: ' + err.message);
    makePaymentBtn.disabled = false;
    loadingDiv.style.display = 'none';
  }
});

// Load product details on page load
loadProductDetails();