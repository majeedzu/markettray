import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function getBankCode(phone) {
  const prefix = phone.substring(0, 3);
  if (['024', '054', '055', '059'].includes(prefix)) return 'MTN';
  if (['020', '050'].includes(prefix)) return 'VODAFONE';
  if (['027', '057', '026', '056'].includes(prefix)) return 'AIRTELTIGO';
  return null; // Invalid or unsupported
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { user_id, amount } = req.body;
  if (!user_id || !amount || typeof amount !== 'number') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  if (user_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Check role
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('role, phone, full_name')
    .eq('id', user_id)
    .single();
  if (userError || userData.role !== 'affiliate') {
    return res.status(403).json({ error: 'User is not an affiliate' });
  }

  if (amount < 10) {
    return res.status(400).json({ error: 'Minimum withdrawal amount is 10 GHS' });
  }

  // Calculate available balance
  const { data: commissions, error: commError } = await supabase
    .from('commissions')
    .select('amount')
    .eq('recipient_id', user_id)
    .eq('status', 'paid');
  if (commError) {
    return res.status(500).json({ error: 'Failed to fetch commissions' });
  }
  const totalEarned = commissions.reduce((sum, c) => sum + parseFloat(c.amount), 0);

  const { data: withdrawals, error: withError } = await supabase
    .from('withdrawals')
    .select('amount')
    .eq('affiliate_id', user_id)
    .eq('status', 'completed');
  if (withError) {
    return res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
  const totalWithdrawn = withdrawals.reduce((sum, w) => sum + parseFloat(w.amount), 0);

  const availableBalance = totalEarned - totalWithdrawn;
  if (amount > availableBalance) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  // Create withdrawal record
  const { data: withdrawal, error: insertError } = await supabase
    .from('withdrawals')
    .insert({
      affiliate_id: user_id,
      amount,
      status: 'pending'
    })
    .select()
    .single();
  if (insertError) {
    return res.status(500).json({ error: 'Failed to create withdrawal request' });
  }

  // Optionally process immediately
  try {
    const bankCode = getBankCode(userData.phone);
    if (!bankCode) {
      return res.status(400).json({ error: 'Unsupported phone number for mobile money' });
    }

    // Create recipient
    const recipientResponse = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'mobile_money',
        name: userData.full_name,
        account_number: userData.phone,
        bank_code: bankCode,
        currency: 'GHS'
      })
    });
    const recipientData = await recipientResponse.json();
    if (!recipientResponse.ok) {
      throw new Error(recipientData.message || 'Failed to create recipient');
    }
    const recipientCode = recipientData.data.recipient_code;

    // Initiate transfer
    const transferResponse = await fetch('https://api.paystack.co/transfer', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: 'balance',
        amount: Math.round(amount * 100), // pesewas
        recipient: recipientCode,
        reason: 'Affiliate withdrawal'
      })
    });
    const transferData = await transferResponse.json();
    if (!transferResponse.ok) {
      throw new Error(transferData.message || 'Failed to initiate transfer');
    }

    // Update withdrawal to completed
    await supabase
      .from('withdrawals')
      .update({ status: 'completed', completed_at: new Date() })
      .eq('id', withdrawal.id);

    withdrawal.status = 'completed';
    withdrawal.completed_at = new Date();
  } catch (transferError) {
    console.error('Transfer failed:', transferError.message);
    // Keep as pending for manual processing
  }

  res.status(200).json({ success: true, withdrawal });
}