import { supabase, getCurrentUser } from './config.js';

export async function authGuard(requiredRole) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  // Query the users table for the role
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    console.error('Error fetching user role:', error);
    window.location.href = '/login.html';
    return;
  }

  if (data.role !== requiredRole) {
    window.location.href = '/index.html';
    return;
  }

  // If role matches, allow access (no redirect)
}