const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('./database');
const Stripe = require('stripe');

// Load Stripe with secret key from env
const stripeKey = process.env.STRIPE_KEY || '';
let stripe;
try {
  stripe = Stripe(stripeKey);
} catch(e) {
  console.error('Stripe init error:', e.message);
  stripe = null;
}

const app = express();

// Debug: test network connectivity to Stripe
app.get('/api/test-net', (req, res) => {
  if (!stripeKey) return res.json({ error: 'No stripe key' });
  const https = require('https');
  const options = {
    hostname: 'api.stripe.com',
    path: '/v1/balance',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + stripeKey }
  };
  const req2 = https.request(options, (r) => {
    res.json({ stripeStatus: r.statusCode, hasKey: !!stripeKey });
  });
  req2.on('error', (e) => res.json({ stripeError: e.message }));
  req2.setTimeout(5000, () => { req2.destroy(); res.json({ stripeError: 'timeout' }); });
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
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
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

  try {
    // Create Stripe Checkout Session
    const sessionParams = {
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: v.productName,
              description: v.description + ' — Order ID: ' + orderId,
            },
            unit_amount: v.price * 100, // price in cents
          },
          quantity: 1,
        },
      ],
      success_url: 'https://order-api.intelpulse.net/order/return?session_id={CHECKOUT_SESSION_ID}&type=' + type,
      cancel_url: 'https://order-api.intelpulse.net/order/cancel?type=' + type,
      metadata: {
        order_id: orderId,
        type: type,
      },
    };

    // Timeout for Stripe API call (10 seconds)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Stripe API timeout')), 10000)
    );
    if (!stripeKey || !stripe) {
      console.error('STRIPE_KEY not configured - cannot create checkout session');
      return res.status(500).json({ error: 'Payment system not configured. Please contact hello@intelpulse.net' });
    }
    const session = await Promise.race([
      stripe.checkout.sessions.create(sessionParams),
      timeoutPromise
    ]);

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
