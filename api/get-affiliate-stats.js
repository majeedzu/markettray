import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id parameter' });
  }

  // Authenticate the request
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    if (user.id !== user_id) {
      return res.status(403).json({ error: 'Forbidden: User ID mismatch' });
    }

    // Check if user is an affiliate
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, referral_code')
      .eq('id', user_id)
      .single();

    if (userError || !userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userData.role !== 'affiliate') {
      return res.status(403).json({ error: 'Forbidden: User is not an affiliate' });
    }

    const referralCode = userData.referral_code;

    // Query commissions
    const { data: commissions, error: commissionsError } = await supabase
      .from('commissions')
      .select('amount, status')
      .eq('recipient_id', user_id);

    if (commissionsError) {
      return res.status(500).json({ error: 'Failed to fetch commissions' });
    }

    let totalEarnings = 0;
    let pendingEarnings = 0;
    let paidEarnings = 0;

    commissions.forEach(commission => {
      totalEarnings += commission.amount;
      if (commission.status === 'pending') {
        pendingEarnings += commission.amount;
      } else if (commission.status === 'paid') {
        paidEarnings += commission.amount;
      }
    });

    // Query referral-generated transactions
    const { data: referralSales, error: salesError } = await supabase
      .from('transactions')
      .select('*')
      .eq('affiliate_id', user_id)
      .order('created_at', { ascending: false });

    if (salesError) {
      return res.status(500).json({ error: 'Failed to fetch referral sales' });
    }

    // Query withdrawal history
    const { data: withdrawalHistory, error: withdrawalError } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('affiliate_id', user_id)
      .order('requested_at', { ascending: false });

    if (withdrawalError) {
      return res.status(500).json({ error: 'Failed to fetch withdrawal history' });
    }

    // Return the response
    res.status(200).json({
      referral_code: referralCode,
      total_earnings: totalEarnings,
      pending_earnings: pendingEarnings,
      paid_earnings: paidEarnings,
      referral_sales: referralSales,
      withdrawal_history: withdrawalHistory
    });

  } catch (error) {
    console.error('Error in get-affiliate-stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}