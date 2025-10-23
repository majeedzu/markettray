const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Function to determine bank code from phone prefix
function getBankCode(phone) {
  const prefix = phone.substring(0, 3);
  if (['024', '054', '055', '059'].includes(prefix)) {
    return '057'; // MTN Money
  } else if (['020', '050'].includes(prefix)) {
    return '110'; // Vodafone Cash
  } else if (['027', '057', '026'].includes(prefix)) {
    return '100'; // AirtelTigo Money
  } else {
    throw new Error('Unsupported phone prefix for mobile money');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { transaction_id } = req.body;

  if (!transaction_id) {
    return res.status(400).json({ error: 'Transaction ID is required' });
  }

  // Fetch pending commissions for the transaction
  const { data: commissions, error: commError } = await supabase
    .from('commissions')
    .select('*')
    .eq('transaction_id', transaction_id)
    .eq('status', 'pending');

  if (commError) {
    console.error('Error fetching commissions:', commError);
    return res.status(500).json({ error: 'Failed to fetch commissions' });
  }

  if (!commissions || commissions.length === 0) {
    return res.status(200).json({ message: 'No pending commissions to distribute' });
  }

  // Process each commission
  for (const commission of commissions) {
    try {
      // Get recipient details
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('full_name, phone')
        .eq('id', commission.recipient_id)
        .single();

      if (userError || !user) {
        console.error(`User not found for recipient ${commission.recipient_id}:`, userError);
        continue; // Log and skip
      }

      const { full_name, phone } = user;
      const bankCode = getBankCode(phone);

      // Create transfer recipient
      const recipientResponse = await fetch('https://api.paystack.co/transferrecipient', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'mobile_money',
          name: full_name,
          account_number: phone,
          bank_code: bankCode,
          currency: 'GHS'
        })
      });

      if (!recipientResponse.ok) {
        const errorData = await recipientResponse.text();
        console.error(`Failed to create transfer recipient for ${phone}:`, errorData);
        continue; // Log and skip
      }

      const recipientData = await recipientResponse.json();
      const recipientCode = recipientData.data.recipient_code;

      // Initiate transfer
      const transferResponse = await fetch('https://api.paystack.co/transfer', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source: 'balance',
          amount: Math.round(commission.amount * 100), // Convert to kobo
          recipient: recipientCode,
          reason: 'Commission payment'
        })
      });

      if (!transferResponse.ok) {
        const errorData = await transferResponse.text();
        console.error(`Failed to initiate transfer for commission ${commission.id}:`, errorData);
        continue; // Log and skip
      }

      const transferData = await transferResponse.json();

      // Assuming transfer is queued successfully, update status to 'paid'
      // In production, you might want to wait for transfer.success webhook or check status
      const { error: updateError } = await supabase
        .from('commissions')
        .update({ status: 'paid' })
        .eq('id', commission.id);

      if (updateError) {
        console.error(`Failed to update commission ${commission.id} status:`, updateError);
      }

    } catch (err) {
      console.error(`Error processing commission ${commission.id}:`, err);
    }
  }

  res.status(200).json({ message: 'Commission distribution processed' });
}