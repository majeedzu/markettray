import { supabase } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('remember-me') ? document.getElementById('remember-me').checked : false;

        // Clear previous error messages
        errorMessage.textContent = '';
        errorMessage.style.display = 'none';

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            // Fetch user role from users table
            const { data: userData, error: roleError } = await supabase
                .from('users')
                .select('role')
                .eq('id', data.user.id)
                .single();

            if (roleError) throw roleError;

            const role = userData.role;

            // Redirect based on role
            if (role === 'admin') {
                window.location.href = 'admin-dashboard.html';
            } else if (role === 'seller') {
                window.location.href = 'seller-dashboard.html';
            } else if (role === 'affiliate') {
                window.location.href = 'affiliate-dashboard.html';
            } else {
                throw new Error('Invalid user role. Please contact support.');
            }

        } catch (error) {
            errorMessage.textContent = error.message || 'Login failed. Please try again.';
            errorMessage.style.display = 'block';
        }
    });
});