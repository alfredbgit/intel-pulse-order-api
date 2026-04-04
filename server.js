const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const db = require('./database');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Vertical configurations
const verticals = {
  auto: {
    name: 'Auto Repair Shops',
    stripeLink: 'https://buy.stripe.com/3cIcN5efZbCB06ra2S0x200',
    price: '$97',
    deliveryTime: '24 hours',
    productName: 'Auto Repair Competitive Intel Report',
    heroTitle: 'Auto Repair Competitive Intel',
    heroSubtitle: 'Know what your local competitors are charging. Full pricing analysis delivered in 24 hours.',
  },
  // Future: hvac: { ... }, dental: { ... }
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

// Stripe return — update order to paid
app.get('/order/return', (req, res) => {
  const { order_id, type } = req.query;
  if (order_id) {
    const order = db.getOrder(order_id);
    if (order) {
      db.updateStatus(order_id, 'paid', 'paid');
    }
  }
  res.redirect('/order/success?order_id=' + (order_id || '') + '&type=' + (type || 'auto'));
});

// Create order and redirect to Stripe
app.post('/api/order', (req, res) => {
  const { type, name, email, phone, business_name, location, competitors, notes } = req.body;

  const v = getVertical(type);
  if (!v) return res.status(400).send('Invalid type');

  if (!name || !email || !business_name || !location) {
    return res.status(400).send('Missing required fields: name, email, business_name, location');
  }

  const orderId = uuidv4();
  db.createOrder({ id: orderId, type, name, email, phone, business_name, location, competitors, notes });

  // Redirect to Stripe with order ID as a query param
  const stripeUrl = new URL(v.stripeLink);
  stripeUrl.searchParams.set('order_id', orderId);
  stripeUrl.searchParams.set('type', type);

  res.redirect(stripeUrl.toString());
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
    created_at: order.created_at,
  });
});

// Mark order as paid (called from return URL with session data)
app.post('/api/order/:id/confirm-payment', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  db.updateStatus(order.id, 'paid', 'paid');
  res.json({ success: true, status: 'paid' });
});

// Cancel URL — back to order form
app.get('/order/cancel', (req, res) => {
  res.redirect('/order?type=' + (req.query.type || 'auto'));
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IntelPulse Order API running on port ${PORT}`);
});
