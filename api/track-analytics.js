import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { page_url, visitor_id } = req.body;

  if (!page_url) {
    return res.status(400).json({ error: 'page_url is required' });
  }

  // Use provided visitor_id or fallback to IP address
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress || req.socket?.remoteAddress;
  const vid = visitor_id || ip;

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  // Check if analytics record exists for today
  const { data: analytics, error: analyticsError } = await supabase
    .from('analytics')
    .select('id, page_views, unique_visitors')
    .eq('date', today)
    .single();

  if (analyticsError && analyticsError.code !== 'PGRST116') { // PGRST116: No rows found
    console.error('Error fetching analytics:', analyticsError);
    return res.status(500).json({ error: 'Database error' });
  }

  let isNewVisitor = false;

  // Check if visitor has already been logged for today
  const { data: existingVisitor, error: visitorError } = await supabase
    .from('visitor_sessions')
    .select('id')
    .eq('date', today)
    .eq('visitor_id', vid)
    .single();

  if (visitorError && visitorError.code !== 'PGRST116') {
    console.error('Error checking visitor:', visitorError);
    return res.status(500).json({ error: 'Database error' });
  }

  if (!existingVisitor) {
    // Log new visitor
    const { error: insertVisitorError } = await supabase
      .from('visitor_sessions')
      .insert({ date: today, visitor_id: vid });

    if (insertVisitorError) {
      console.error('Error inserting visitor:', insertVisitorError);
      return res.status(500).json({ error: 'Failed to log visitor' });
    }
    isNewVisitor = true;
  }

  if (analytics) {
    // Update existing analytics record
    const updateData = {
      page_views: analytics.page_views + 1,
      unique_visitors: isNewVisitor ? analytics.unique_visitors + 1 : analytics.unique_visitors
    };

    const { error: updateError } = await supabase
      .from('analytics')
      .update(updateData)
      .eq('date', today);

    if (updateError) {
      console.error('Error updating analytics:', updateError);
      return res.status(500).json({ error: 'Failed to update analytics' });
    }
  } else {
    // Create new analytics record
    const { error: insertAnalyticsError } = await supabase
      .from('analytics')
      .insert({
        date: today,
        page_views: 1,
        unique_visitors: 1,
        purchases_count: 0
      });

    if (insertAnalyticsError) {
      console.error('Error creating analytics:', insertAnalyticsError);
      return res.status(500).json({ error: 'Failed to create analytics' });
    }
  }

  res.status(200).json({ success: true });
}