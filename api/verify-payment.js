const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify webhook signature
  const signature = req.headers['x-paystack-signature'];
  const body = JSON.stringify(req.body);
  const expectedSignature = crypto.createHmac('sha512', PAYSTACK_SECRET).update(body).digest('hex');

  if (signature !== expectedSignature) {
    console.error('Invalid webhook signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = req.body;

  // Only handle charge.success events
  if (event.event !== 'charge.success') {
    return res.status(200).json({ message: 'Event not handled' });
  }

  const { reference, status } = event.data;

  if (status !== 'success') {
    return res.status(200).json({ message: 'Payment not successful' });
  }

  // Query transaction by payment reference
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('payment_reference', reference)
    .single();

  if (txError || !transaction) {
    console.error('Transaction not found:', txError);
    return res.status(200).json({ message: 'Transaction not found' });
  }

  if (transaction.payment_status !== 'pending') {
    return res.status(200).json({ message: 'Transaction already processed' });
  }

  // Update transaction status to completed
  const { error: updateError } = await supabase
    .from('transactions')
    .update({ payment_status: 'completed' })
    .eq('id', transaction.id);

  if (updateError) {
    console.error('Error updating transaction:', updateError);
    return res.status(200).json({ message: 'Error updating transaction' });
  }

  // Get product details to find seller
  const { data: product, error: prodError } = await supabase
    .from('products')
    .select('seller_id')
    .eq('id', transaction.product_id)
    .single();

  if (prodError || !product) {
    console.error('Product not found:', prodError);
    return res.status(200).json({ message: 'Product not found' });
  }

  const sellerId = product.seller_id;
  const amount = transaction.amount;
  let commissions = [];

  // Get admin user ID (assuming single admin)
  const { data: admin, error: adminError } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .single();

  if (adminError || !admin) {
    console.error('Admin user not found:', adminError);
    return res.status(200).json({ message: 'Admin not found' });
  }

  if (transaction.affiliate_id) {
    // With affiliate: affiliate 8%, admin 2%, seller 90%
    const affiliateAmount = Math.round(amount * 0.08 * 100) / 100; // Round to 2 decimals
    const adminAmount = Math.round(amount * 0.02 * 100) / 100;
    const sellerAmount = Math.round(amount * 0.90 * 100) / 100;
    commissions = [
      { recipient_id: transaction.affiliate_id, amount: affiliateAmount, commission_type: 'affiliate' },
      { recipient_id: admin.id, amount: adminAmount, commission_type: 'admin_affiliate' },
      { recipient_id: sellerId, amount: sellerAmount, commission_type: 'seller' }
    ];
  } else {
    // No affiliate: admin 10%, seller 90%
    const adminAmount = Math.round(amount * 0.10 * 100) / 100;
    const sellerAmount = Math.round(amount * 0.90 * 100) / 100;
    commissions = [
      { recipient_id: admin.id, amount: adminAmount, commission_type: 'admin_direct' },
      { recipient_id: sellerId, amount: sellerAmount, commission_type: 'seller' }
    ];
  }

  // Insert commission records
  const commissionInserts = commissions.map(c => ({
    transaction_id: transaction.id,
    recipient_id: c.recipient_id,
    amount: c.amount,
    commission_type: c.commission_type,
    status: 'pending'
  }));

  const { error: commError } = await supabase
    .from('commissions')
    .insert(commissionInserts);

  if (commError) {
    console.error('Error inserting commissions:', commError);
    return res.status(200).json({ message: 'Error inserting commissions' });
  }

  // Call /api/distribute-commissions to handle fund transfers
  try {
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/distribute-commissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: transaction.id })
    });
    if (!response.ok) {
      console.error('Error calling distribute-commissions:', response.status, await response.text());
    }
  } catch (err) {
    console.error('Error calling distribute-commissions:', err);
  }

  // Return 200 to Paystack
  res.status(200).json({ message: 'Payment verified successfully' });
}