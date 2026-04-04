const fs = require('fs').promises;
const path = require('path');

const DB_FILE = path.join('/tmp', 'orders.json');

async function loadDb() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch(e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function saveDb(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

async function findById(id) {
  const db = await loadDb();
  return db.find(o => o.id === id) || null;
}

module.exports = {
  createOrder: async ({ id, type, name, email, phone, business_name, location, competitors, notes }) => {
    const db = await loadDb();
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
    await saveDb(db);
    return order;
  },

  getOrder: (id) => findById(id),

  setStripeSession: async (id, stripe_session_id) => {
    const db = await loadDb();
    const order = db.find(o => o.id === id);
    if (order) {
      order.stripe_session_id = stripe_session_id;
      order.updated_at = new Date().toISOString();
      await saveDb(db);
    }
  },

  updateStatus: async (id, status, stripe_payment_status) => {
    const db = await loadDb();
    const order = db.find(o => o.id === id);
    if (order) {
      order.status = status;
      order.stripe_payment_status = stripe_payment_status || '';
      order.updated_at = new Date().toISOString();
      await saveDb(db);
    }
  },

  markFulfilled: async (id, notes) => {
    const db = await loadDb();
    const order = db.find(o => o.id === id);
    if (order) {
      order.status = 'fulfilled';
      order.report_delivered_at = new Date().toISOString();
      order.fulfillment_notes = notes || '';
      order.updated_at = new Date().toISOString();
      await saveDb(db);
    }
  },

  listOrders: async () => {
    const db = await loadDb();
    return db.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },
};
