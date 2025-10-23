import { supabase } from './config.js';

// Function to generate a unique referral code
function generateReferralCode() {
  return 'REF' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Function to validate password strength (simple check: at least 8 characters, one number, one uppercase)
function validatePasswordStrength(password) {
  const minLength = 8;
  const hasNumber = /\d/;
  const hasUppercase = /[A-Z]/;
  return password.length >= minLength && hasNumber.test(password) && hasUppercase.test(password);
}

// Function to handle form submission
async function handleRegister(event) {
  event.preventDefault();

  const role = document.querySelector('input[name="role"]:checked').value;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const fullName = document.getElementById('fullName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const businessName = role === 'seller' ? document.getElementById('businessName').value.trim() : null;

  // Validation
  if (!email || !password || !confirmPassword || !fullName || !phone) {
    alert('Please fill in all required fields.');
    return;
  }

  if (password !== confirmPassword) {
    alert('Passwords do not match.');
    return;
  }

  if (!validatePasswordStrength(password)) {
    alert('Password must be at least 8 characters long, contain at least one number and one uppercase letter.');
    return;
  }

  if (role === 'seller' && !businessName) {
    alert('Business name is required for sellers.');
    return;
  }

  try {
    // Sign up with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert('Registration failed: ' + error.message);
      return;
    }

    const user = data.user;
    if (!user) {
      alert('Registration failed: No user data returned.');
      return;
    }

    // Insert into users table
    const referralCode = role === 'affiliate' ? generateReferralCode() : null;
    const { error: insertError } = await supabase
      .from('users')
      .insert({
        id: user.id,
        email,
        role,
        full_name: fullName,
        phone,
        referral_code: referralCode,
      });

    if (insertError) {
      alert('Failed to save user data: ' + insertError.message);
      return;
    }

    // If seller, insert into sellers table
    if (role === 'seller') {
      const { error: sellerError } = await supabase
        .from('sellers')
        .insert({
          user_id: user.id,
          business_name: businessName,
        });

      if (sellerError) {
        alert('Failed to save seller data: ' + sellerError.message);
        return;
      }
    }

    // Success message
    if (role === 'affiliate') {
      const referralLink = `https://markettray.com/products?ref=${referralCode}`;
      alert(`Registration successful! Your referral link is: ${referralLink}`);
    } else {
      alert('Registration successful!');
    }

    // Redirect to appropriate dashboard
    const dashboard = role === 'seller' ? 'seller-dashboard.html' : 'affiliate-dashboard.html';
    window.location.href = dashboard;

  } catch (err) {
    console.error('Unexpected error:', err);
    alert('An unexpected error occurred. Please try again.');
  }
}

// Add event listener on DOM load
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('register-form');
  if (form) {
    form.addEventListener('submit', handleRegister);
  }
});