const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });

const COLLECTION = 'orders';

async function createOrder({ id, type, name, email, phone, business_name, location, competitors, notes }) {
  const result = await pool.query(
    `INSERT INTO ${COLLECTION} (id, type, name, email, phone, business_name, location, competitors, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [id, type, name || '', email || '', phone || '', business_name || '', location || '', competitors || '', notes || '']
  );
  return result.rows[0];
}

async function getOrder(id) {
  const result = await pool.query(`SELECT * FROM ${COLLECTION} WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function setStripeSession(id, stripe_session_id) {
  await pool.query(
    `UPDATE ${COLLECTION} SET stripe_session_id = $1, updated_at = NOW() WHERE id = $2`,
    [stripe_session_id, id]
  );
}

async function updateStatus(id, status, stripe_payment_status) {
  await pool.query(
    `UPDATE ${COLLECTION} SET status = $1, stripe_payment_status = $2, updated_at = NOW() WHERE id = $3`,
    [status, stripe_payment_status || '', id]
  );
}

async function markFulfilled(id, notes) {
  await pool.query(
    `UPDATE ${COLLECTION} SET status = 'fulfilled', report_delivered_at = NOW(), fulfillment_notes = $1, updated_at = NOW() WHERE id = $2`,
    [notes || '', id]
  );
}

async function listOrders() {
  const result = await pool.query(`SELECT * FROM ${COLLECTION} ORDER BY created_at DESC`);
  return result.rows;
}

module.exports = {
  createOrder,
  getOrder,
  setStripeSession,
  updateStatus,
  markFulfilled,
  listOrders,
};
