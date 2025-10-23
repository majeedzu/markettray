import { supabase } from './config.js';

// Check if we are in confirm mode (access_token in URL hash)
const urlParams = new URLSearchParams(window.location.hash.substring(1));
const accessToken = urlParams.get('access_token');

if (accessToken) {
    // Confirm mode
    document.addEventListener('DOMContentLoaded', () => {
        const confirmForm = document.getElementById('confirm-reset-form');
        const errorMessage = document.getElementById('error-message');
        const successMessage = document.getElementById('success-message');

        confirmForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (newPassword !== confirmPassword) {
                errorMessage.textContent = 'Passwords do not match.';
                return;
            }

            if (newPassword.length < 6) {
                errorMessage.textContent = 'Password must be at least 6 characters long.';
                return;
            }

            try {
                const { error } = await supabase.auth.updateUser({
                    password: newPassword
                });

                if (error) {
                    errorMessage.textContent = error.message;
                } else {
                    successMessage.textContent = 'Password reset successfully!';
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 2000);
                }
            } catch (err) {
                errorMessage.textContent = 'An error occurred. Please try again.';
            }
        });
    });
} else {
    // Request mode
    document.addEventListener('DOMContentLoaded', () => {
        const requestForm = document.getElementById('request-reset-form');
        const errorMessage = document.getElementById('error-message');
        const successMessage = document.getElementById('success-message');

        requestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;

            try {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.href
                });

                if (error) {
                    errorMessage.textContent = error.message;
                } else {
                    successMessage.textContent = 'Password reset email sent! Check your inbox.';
                }
            } catch (err) {
                errorMessage.textContent = 'An error occurred. Please try again.';
            }
        });
    });
}