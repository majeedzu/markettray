import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { product_id, customer_name, customer_email, customer_phone, shipping_address, payment_number, referral_code } = req.body;

  // Validate required fields
  if (!product_id || !customer_name || !customer_email || !customer_phone || !shipping_address || !payment_number) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Initialize Supabase client with service role key for server-side operations
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Fetch product details
    const { data: product, error: prodError } = await supabase
      .from('products')
      .select('price, seller_id')
      .eq('id', product_id)
      .single();

    if (prodError || !product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Validate referral code if provided
    let affiliate_id = null;
    if (referral_code) {
      const { data: affiliate, error: affError } = await supabase
        .from('users')
        .select('id')
        .eq('referral_code', referral_code)
        .eq('role', 'affiliate')
        .single();

      if (affError || !affiliate) {
        return res.status(400).json({ error: 'Invalid referral code' });
      }
      affiliate_id = affiliate.id;
    }

    // Determine mobile money provider based on phone prefix (assuming format 0XXXXXXXXX)
    const prefix = payment_number.slice(1, 4);
    let provider;
    if (['024', '054', '055', '059', '025', '053'].includes(prefix)) {
      provider = 'mtn';
    } else if (['026', '056', '027', '057'].includes(prefix)) {
      provider = 'tigo';
    } else if (['020', '050'].includes(prefix)) {
      provider = 'vodafone';
    } else {
      return res.status(400).json({ error: 'Invalid mobile money number prefix' });
    }

    // Create transaction record
    const { data: transaction, error: transError } = await supabase
      .from('transactions')
      .insert({
        product_id,
        customer_name,
        customer_phone,
        shipping_address,
        amount: product.price,
        payment_status: 'pending',
        affiliate_id,
        payment_reference: null // Will be updated after Paystack init
      })
      .select()
      .single();

    if (transError) {
      return res.status(500).json({ error: 'Failed to create transaction record' });
    }

    // Generate unique payment reference
    const reference = `txn_${transaction.id}_${Date.now()}`;

    // Initialize Paystack transaction
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: customer_email,
        amount: product.price * 100, // Amount in pesewas (GHS smallest unit)
        currency: 'GHS',
        reference,
        callback_url: `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/verify-payment`,
        channels: ['mobile_money'],
        mobile_money: {
          phone: payment_number,
          provider
        }
      })
    });

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok) {
      return res.status(500).json({ error: 'Payment initialization failed', details: paystackData });
    }

    // Update transaction with Paystack reference
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ payment_reference: reference })
      .eq('id', transaction.id);

    if (updateError) {
      console.error('Failed to update transaction reference:', updateError);
      // Continue anyway, as transaction is created
    }

    // Return authorization URL and reference to client
    res.status(200).json({
      authorization_url: paystackData.data.authorization_url,
      reference
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}