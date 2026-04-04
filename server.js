const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('./database');


// Load Stripe with secret key from env
const stripeKey = process.env.STRIPE_KEY || '';
const https = require('https');

// Helper: create Stripe Checkout Session via raw HTTPS
function createStripeCheckoutSession(params) {
  console.log('createStripeCheckoutSession called, key prefix:', stripeKey ? stripeKey.substring(0,7) : 'NONE');
  return new Promise((resolve, reject) => {
    // URL-encode nested Stripe params
    const body = [
      'payment_method_types[0]=card',
      'mode=payment',
      'customer_email=' + encodeURIComponent(params.customerEmail),
      'line_items[0][price_data][currency]=usd',
      'line_items[0][price_data][product_data][name]=' + encodeURIComponent(params.productName),
      'line_items[0][price_data][product_data][description]=' + encodeURIComponent(params.productDescription),
      'line_items[0][price_data][unit_amount]=' + params.unitAmount,
      'line_items[0][quantity]=1',
      'success_url=' + encodeURIComponent(params.successUrl),
      'cancel_url=' + encodeURIComponent(params.cancelUrl),
      'metadata[order_id]=' + encodeURIComponent(params.orderId),
      'metadata[type]=' + encodeURIComponent(params.type),
    ].join('&');

    const options = {
      hostname: 'api.stripe.com',
      path: '/v1/checkout/sessions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + stripeKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      }
    };

    console.log('Creating HTTPS request to Stripe, body length:', Buffer.byteLength(body));
    const req = https.request(options, (res) => {
      console.log('Stripe response status:', res.statusCode);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('Stripe response data:', data.substring(0, 200));
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed);
        } catch(e) { reject(new Error('Failed to parse Stripe response')); }
      });
    });
    req.on('error', (e) => { console.error('HTTPS request error:', e.message); reject(e); });
    req.setTimeout(10000, () => { console.error('Stripe API timeout'); req.destroy(); reject(new Error('Stripe API timeout')); });
    console.log('Writing body to Stripe...');
    req.write(body);
    req.end();
    console.log('Request sent');
  });
}

function retrieveStripeSession(sessionId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.stripe.com',
      path: '/v1/checkout/sessions/' + sessionId,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + stripeKey }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed);
        } catch(e) { reject(new Error('Failed to parse Stripe response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Stripe API timeout')); });
    req.end();
  });
}

const app = express();

// Debug: test network connectivity to Stripe
app.post('/api/test-net-post', (req, res) => {
  console.log('POST test-net-post body:', JSON.stringify(req.body));
  try {
    const https = require('https');
    const body = 'payment_method_types[0]=card&mode=payment&customer_email=' + encodeURIComponent(req.body.email || 'test@test.com') + '&line_items[0][price_data][currency]=usd&line_items[0][price_data][product_data][name]=Test&line_items[0][price_data][unit_amount]=9700&line_items[0][quantity]=1&success_url=https://test.com&cancel_url=https://test.com';
    const options = {
      hostname: 'api.stripe.com',
      path: '/v1/checkout/sessions',
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + stripeKey, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    };
    const req2 = https.request(options, (r) => {
      let data = '';
      r.on('data', chunk => data += chunk);
      r.on('end', () => { res.json({ stripeStatus: r.statusCode, body: data.substring(0, 200) }); });
    });
    req2.on('error', (e) => { console.error('HTTPS error:', e.message); res.json({ error: e.message }); });
    req2.setTimeout(10000, () => { req2.destroy(); res.json({ error: 'timeout' }); });
    req2.write(body);
    req2.end();
  } catch(e) { console.error('Handler error:', e.message); res.json({ error: e.message }); }
});

app.get('/api/test-net', (req, res) => {
  if (!stripeKey) return res.json({ error: 'No stripe key' });
  const https = require('https');
  
  // Test POST to Stripe
  const postData = JSON.stringify({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Test' }, unit_amount: 100 }, quantity: 1 }],
    success_url: 'https://test.com/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://test.com/cancel'
  });
  
  const options = {
    hostname: 'api.stripe.com',
    path: '/v1/checkout/sessions',
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + stripeKey,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const req2 = https.request(options, (r) => {
    let data = '';
    r.on('data', chunk => data += chunk);
    r.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        res.json({ stripePOST: r.statusCode, hasSession: !!parsed.id, sessionId: parsed.id || parsed.error?.message });
      } catch(e) {
        res.json({ stripePOST: r.statusCode, raw: data.substring(0, 200) });
      }
    });
  });
  req2.on('error', (e) => res.json({ stripeError: e.message }));
  req2.setTimeout(10000, () => { req2.destroy(); res.json({ stripeError: 'timeout' }); });
  req2.write(postData);
  req2.end();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Vertical configurations
const verticals = {
  auto: {
    name: 'Auto Repair Shops',
    price: 97, // in cents
    priceId: null, // set if using Stripe Price ID (for subscription/recurring)
    productName: 'Auto Repair Competitive Intel Report',
    description: 'Full competitive intel report for auto repair shops. Delivered as PDF within 24 hours.',
    deliveryTime: '24 hours',
  },
  // Future: hvac: { price: 97, productName: 'HVAC Competitive Intel Report', ... }
};

function getVertical(type) {
  return verticals[type] || null;
}

// Serve order form page
app.post('/api/test-post-json', async (req, res) => {
  console.log('test-post-json body:', JSON.stringify(req.body));
  await new Promise(r => setTimeout(r, 100));
  res.json({ received: true, body: req.body });
});

app.get('/order', (req, res) => {
  const v = getVertical(req.query.type);
  if (!v) {
    return res.send('Invalid vertical type. Use ?type=auto');
  }
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// Serve thank-you / success page
app.get('/order/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'thank-you.html'));
});

// Stripe return — verify session and mark order paid
app.get('/order/return', async (req, res) => {
  const { session_id, type } = req.query;
  if (!session_id) {
    return res.redirect('/order/success?error=no_session');
  }

  try {
    // Verify the session with Stripe
    const session = await retrieveStripeSession(session_id);
    
    if (session.payment_status === 'paid') {
      // Find order by stripe session ID and mark paid
      const orders = db.listOrders();
      const order = orders.find(o => o.stripe_session_id === session_id);
      if (order) {
        db.updateStatus(order.id, 'paid', 'paid');
      }
      return res.redirect('/order/success?order_id=' + (order ? order.id : '') + '&status=paid&type=' + (type || 'auto'));
    } else {
      return res.redirect('/order/success?status=' + session.payment_status + '&type=' + (type || 'auto'));
    }
  } catch (err) {
    console.error('Stripe session retrieval error:', err.message);
    return res.redirect('/order/success?error=verification_failed');
  }
});

// Create order and redirect to Stripe Checkout
app.post('/api/order', async (req, res) => {
  console.log('=== /api/order called ===');
  res.json({ received: true });
  return;

  const { type, name, email, phone, business_name, location, competitors, notes } = req.body;

  const v = getVertical(type);
  if (!v) return res.status(400).json({ error: 'Invalid type' });

  if (!name || !email || !business_name || !location) {
    return res.status(400).json({ error: 'Missing required fields: name, email, business_name, location' });
  }

  const orderId = uuidv4();
  const stripeSessionId = 'cs_' + uuidv4().replace(/-/g, '');

  // Create order in DB first (pending)
  db.createOrder({ 
    id: orderId, 
    type, 
    name, 
    email, 
    phone, 
    business_name, 
    location, 
    competitors, 
    notes 
  });

  console.log('ORDER REQUEST: type=' + type + ', email=' + email + ', business=' + business_name);
  try {
    if (!stripeKey) {
      console.error('STRIPE_KEY not configured');
      return res.status(500).json({ error: 'Payment system not configured. Please contact hello@intelpulse.net' });
    }

    // Create checkout session via raw HTTPS (Stripe SDK hangs in Vercel serverless)
    let session;
    try {
      session = await createStripeCheckoutSession({
        customerEmail: email,
        productName: v.productName,
        productDescription: v.description + ' — Order ID: ' + orderId,
        unitAmount: v.price * 100,
        successUrl: 'https://order-api.intelpulse.net/order/return?session_id={CHECKOUT_SESSION_ID}&type=' + type,
        cancelUrl: 'https://order-api.intelpulse.net/order/cancel?type=' + type,
        orderId,
        type,
      });
    } catch (err) {
      console.error('Stripe error:', err.message);
      return res.status(500).json({ error: 'Failed to create checkout session: ' + err.message });
    }

    // Update order with stripe session ID
    db.setStripeSession(orderId, session.id);

    // Return the checkout URL to the frontend
    res.json({ checkoutUrl: session.url, orderId });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session: ' + err.message });
  }
});

// Get order status (for thank-you page polling)
app.get('/api/order/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({
    id: order.id,
    status: order.status,
    type: order.type,
    business_name: order.business_name,
    email: order.email,
    created_at: order.created_at,
  });
});

// Cancel URL — back to order form
app.get('/order/cancel', (req, res) => {
  res.redirect('/order?type=' + (req.query.type || 'auto') + '&cancelled=1');
});

// Fulfill an order (manual for beta)
app.post('/api/order/:id/fulfill', (req, res) => {
  const { notes } = req.body;
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  db.markFulfilled(order.id, notes || '');
  res.json({ success: true });
});

// List all orders (for admin)
app.get('/api/orders', (req, res) => {
  const orders = db.listOrders();
  res.json(orders);
});

// Test POST endpoint
app.post('/api/test-post', (req, res) => {
  console.log('POST /api/test-post called');
  res.json({ ok: true, method: 'POST', body: req.body });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IntelPulse Order API running on port ${PORT}`);
});
