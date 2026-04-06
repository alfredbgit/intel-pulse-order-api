# PRD — IntelPulse Order API: Database Migration to Vercel Postgres

## What we're changing

Replace the JSON file database (`/tmp/orders.json`) with Vercel Postgres. The JSON file is ephemeral on Vercel serverless — it gets wiped on every cold start and redeploy. Orders are currently being lost.

## Why it matters

Every order that comes through the Stripe Checkout flow is supposed to be stored so we can:
- Track fulfillment (did we send the PDF report?)
- See order history
- Handle disputes or customer service

Right now that's all in memory, which means it's gone when Vercel wipes `/tmp/`.

## What needs to change

### 1. Install `@vercel/postgres`
Add the Vercel Postgres SDK to the project.

### 2. Replace `database.js` with Postgres queries

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(36) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  name VARCHAR(255) DEFAULT '',
  email VARCHAR(255) DEFAULT '',
  phone VARCHAR(50) DEFAULT '',
  business_name VARCHAR(255) DEFAULT '',
  location VARCHAR(255) DEFAULT '',
  competitors TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  stripe_session_id VARCHAR(255) DEFAULT '',
  stripe_payment_status VARCHAR(50) DEFAULT '',
  report_delivered_at TIMESTAMP NULL,
  fulfillment_notes TEXT DEFAULT ''
);
```

**Functions to replace** (same signatures, different implementation):

| Function | What it does |
|----------|--------------|
| `createOrder({...})` | Insert new order into `orders` table |
| `getOrder(id)` | SELECT from orders WHERE id = ? |
| `setStripeSession(id, sessionId)` | UPDATE stripe_session_id |
| `updateStatus(id, status, stripe_payment_status)` | UPDATE status + stripe_payment_status |
| `markFulfilled(id, notes)` | UPDATE status='fulfilled', report_delivered_at, fulfillment_notes |
| `listOrders()` | SELECT * FROM orders ORDER BY created_at DESC |

**Vercel Postgres patterns:**
```javascript
import { sql } from '@vercel/postgres';

async function createOrder({ id, type, name, email, phone, business_name, location, competitors, notes }) {
  const result = await sql`
    INSERT INTO orders (id, type, name, email, phone, business_name, location, competitors, notes)
    VALUES (${id}, ${type}, ${name}, ${email}, ${phone}, ${business_name}, ${location}, ${competitors}, ${notes})
    RETURNING *
  `;
  return result.rows[0];
}

async function getOrder(id) {
  const result = await sql`SELECT * FROM orders WHERE id = ${id}`;
  return result.rows[0] || null;
}
```

### 3. No changes to `server.js`
The `db.*` function signatures stay the same. Ralph just swaps the implementation in `database.js`. The Express routes that call `await db.createOrder(...)`, `await db.getOrder(...)`, etc. should work unchanged.

### 4. Environment variables
No new env vars needed — Vercel Postgres is auto-attached to the project via the Vercel dashboard (no credential management needed in code).

## What done looks like

1. `database.js` uses `import { sql } from '@vercel/postgres'` — no more `fs.readFile/writeFile`
2. All `db.*` functions are async and return the same data shapes as before
3. `vercel --token ... env pull` pulls a `.env.local` with `POSTGRES_URL` (managed by Vercel, not in code)
4. Existing orders (if any) are not migrated — fresh start is fine
5. `GET /api/orders` returns orders from Postgres
6. `POST /api/order` creates an order in Postgres
7. Payment webhook handler updates order status in Postgres
8. No code changes outside `database.js` and the new import in `server.js`

## Tech notes

- Use `@vercel/postgres` (official Vercel package), NOT `pg` directly
- Use tagged template literals: `` sql`SELECT * FROM orders` `` (not raw strings)
- Keep all function signatures the same — Ralph only swaps the DB layer
- No ORM needed — raw SQL via `sql` tagged template is the Vercel Postgres pattern
- Vercel handles connection pooling automatically with `@vercel/postgres`

## Timeline

Do it now. Orders are being lost on every deploy.
