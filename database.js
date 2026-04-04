const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'orders.json');

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function findById(id) {
  const db = loadDb();
  return db.find(o => o.id === id) || null;
}

module.exports = {
  createOrder: ({ id, type, name, email, phone, business_name, location, competitors, notes }) => {
    const db = loadDb();
    const order = {
      id,
      type,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      name: name || '',
      email: email || '',
      phone: phone || '',
      business_name: business_name || '',
      location: location || '',
      competitors: competitors || '',
      notes: notes || '',
      stripe_session_id: '',
      stripe_payment_status: '',
      report_delivered_at: null,
      fulfillment_notes: '',
    };
    db.push(order);
    saveDb(db);
    return order;
  },

  getOrder: (id) => findById(id),

  setStripeSession: (id, stripe_session_id) => {
    const db = loadDb();
    const order = db.find(o => o.id === id);
    if (order) {
      order.stripe_session_id = stripe_session_id;
      order.updated_at = new Date().toISOString();
      saveDb(db);
    }
  },

  updateStatus: (id, status, stripe_payment_status) => {
    const db = loadDb();
    const order = db.find(o => o.id === id);
    if (order) {
      order.status = status;
      order.stripe_payment_status = stripe_payment_status || '';
      order.updated_at = new Date().toISOString();
      saveDb(db);
    }
  },

  markFulfilled: (id, notes) => {
    const db = loadDb();
    const order = db.find(o => o.id === id);
    if (order) {
      order.status = 'fulfilled';
      order.report_delivered_at = new Date().toISOString();
      order.fulfillment_notes = notes || '';
      order.updated_at = new Date().toISOString();
      saveDb(db);
    }
  },

  listOrders: () => loadDb().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
};
