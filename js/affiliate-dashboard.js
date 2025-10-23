import { supabase, getCurrentUser } from './config.js';
import { authGuard } from './auth-guard.js';

// Auth guard for affiliate role
authGuard('affiliate');

document.addEventListener('DOMContentLoaded', async () => {
  const user = await getCurrentUser();
  if (!user) return; // Auth guard should handle redirect

  // Fetch and display referral code and link
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('referral_code')
    .eq('id', user.id)
    .single();

  if (userError) {
    console.error('Error fetching referral code:', userError);
    return;
  }

  const referralCode = userData.referral_code;
  const shareableLink = `${window.location.origin}/products.html?ref=${referralCode}`;
  document.getElementById('referral-link').textContent = shareableLink;

  // Copy to clipboard functionality
  document.getElementById('copy-link').addEventListener('click', () => {
    navigator.clipboard.writeText(shareableLink).then(() => {
      alert('Referral link copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy link:', err);
    });
  });

  // Fetch and display commissions
  const { data: commissions, error: commError } = await supabase
    .from('commissions')
    .select('amount, status, transaction_id')
    .eq('recipient_id', user.id);

  if (commError) {
    console.error('Error fetching commissions:', commError);
    return;
  }

  const totalEarnings = commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + parseFloat(c.amount), 0);
  const pendingAmount = commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + parseFloat(c.amount), 0);
  const paidAmount = totalEarnings;

  document.getElementById('total-earnings').textContent = `GHS ${totalEarnings.toFixed(2)}`;
  document.getElementById('pending-commissions').textContent = `GHS ${pendingAmount.toFixed(2)}`;
  document.getElementById('paid-commissions').textContent = `GHS ${paidAmount.toFixed(2)}`;

  // Display commissions list
  const commissionsList = document.getElementById('commissions-list');
  commissions.forEach(comm => {
    const li = document.createElement('li');
    li.textContent = `Transaction ${comm.transaction_id}: GHS ${comm.amount} (${comm.status})`;
    commissionsList.appendChild(li);
  });

  // Fetch and display transactions that generated commissions
  const transactionIds = commissions.map(c => c.transaction_id);
  if (transactionIds.length > 0) {
    const { data: transactions, error: transError } = await supabase
      .from('transactions')
      .select('id, product_id, customer_name, amount, created_at')
      .in('id', transactionIds);

    if (transError) {
      console.error('Error fetching transactions:', transError);
    } else {
      const transactionsList = document.getElementById('transactions-list');
      transactions.forEach(trans => {
        const li = document.createElement('li');
        li.textContent = `ID: ${trans.id}, Product: ${trans.product_id}, Customer: ${trans.customer_name}, Amount: GHS ${trans.amount}, Date: ${new Date(trans.created_at).toLocaleDateString()}`;
        transactionsList.appendChild(li);
      });
    }
  }

  // Handle withdrawal form submission
  const withdrawalForm = document.getElementById('withdrawal-form');
  withdrawalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('withdrawal-amount').value);
    if (isNaN(amount) || amount < 10) {
      alert('Minimum withdrawal amount is 10 GHS');
      return;
    }

    const { data: session } = await supabase.auth.getSession();
    if (!session) {
      alert('Session expired. Please log in again.');
      window.location.href = '/login.html';
      return;
    }

    try {
      const response = await fetch('/api/request-withdrawal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ user_id: user.id, amount })
      });

      const result = await response.json();
      if (response.ok) {
        alert('Withdrawal request submitted successfully!');
        location.reload(); // Refresh to update history
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error submitting withdrawal:', error);
      alert('Failed to submit withdrawal request.');
    }
  });

  // Fetch and display withdrawal history
  const { data: withdrawals, error: withError } = await supabase
    .from('withdrawals')
    .select('amount, status, requested_at, completed_at')
    .eq('affiliate_id', user.id)
    .order('requested_at', { ascending: false });

  if (withError) {
    console.error('Error fetching withdrawals:', withError);
  } else {
    const withdrawalsHistory = document.getElementById('withdrawals-history');
    withdrawals.forEach(withdrawal => {
      const li = document.createElement('li');
      li.textContent = `Amount: GHS ${withdrawal.amount}, Status: ${withdrawal.status}, Requested: ${new Date(withdrawal.requested_at).toLocaleDateString()}${withdrawal.completed_at ? `, Completed: ${new Date(withdrawal.completed_at).toLocaleDateString()}` : ''}`;
      withdrawalsHistory.appendChild(li);
    });
  }

  // Logout functionality
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
  });
});