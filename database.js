const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://vvilnkzqdhydlwdxwokh.supabase.co',
  'sb_publishable_-GcjGLB9X2XqBHDmLy39zA_tdXPt_WO'
);

async function createOrder({ id, type, name, email, phone, business_name, location, competitors, notes }) {
  const { data, error } = await supabase
    .from('orders')
    .insert([{
      id,
      type,
      name: name || '',
      email: email || '',
      phone: phone || '',
      business_name: business_name || '',
      location: location || '',
      competitors: competitors || '',
      notes: notes || '',
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getOrder(id) {
  const { data, error } = await supabase.from('orders').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function setStripeSession(id, stripe_session_id) {
  const { error } = await supabase
    .from('orders')
    .update({ stripe_session_id, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function updateStatus(id, status, stripe_payment_status) {
  const { error } = await supabase
    .from('orders')
    .update({ status, stripe_payment_status: stripe_payment_status || '', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function markFulfilled(id, notes) {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'fulfilled', report_delivered_at: new Date().toISOString(), fulfillment_notes: notes || '', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function listOrders() {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

module.exports = { createOrder, getOrder, setStripeSession, updateStatus, markFulfilled, listOrders };
