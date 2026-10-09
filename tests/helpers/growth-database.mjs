import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as pause } from 'node:timers/promises';
import { roomDatabase } from './shopping-room-database.mjs';
const require = createRequire(import.meta.url);
const { createGrowthStore } = require('../../backend/growth-store');
const migration = require('../../backend/migrations/growth-loops');

export async function growthFixture(t, {migrate = true} = {}) {
  const db = await roomDatabase(t);
  await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY,status TEXT NOT NULL);
    CREATE TABLE products(id TEXT PRIMARY KEY,uploaded_by TEXT,status TEXT);
    CREATE TABLE public_content_visibility(content_type TEXT,content_id TEXT,visibility TEXT);
    CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT);
    CREATE TABLE product_likes(product_id TEXT,user_id TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE orders(id TEXT PRIMARY KEY,product_id TEXT,buyer_username TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    INSERT INTO users VALUES('seller','active'),('sender','active'),('recipient','active'),('other','active');
    INSERT INTO products VALUES('p1','seller','approved'),('p2','seller','approved'),('private','seller','approved'),('pending','seller','pending');
    INSERT INTO public_content_visibility VALUES('product','private','private');`);
  if (migrate) for (const step of [migration, require('../../backend/migrations/growth-event-timing')])
    for (const sql of step.statements) await db.exec(sql);
  // Fixed-window quota assertions need their small workload in one real server
  // minute. Avoid starting in its final ten seconds; do not mock database time.
  const window = (await db.query('SELECT 60000-MOD(FLOOR(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint,60000) AS remaining')).rows[0];
  if (Number(window.remaining) < 10000) await pause(Number(window.remaining) + 100);
  const store = createGrowthStore({ query: (...args) => db.query(...args), withTransaction: fn => db.transaction(fn) });
  const source = { username: 'sender', ip: '127.0.0.1', bot: false };
  const recipient = { username: 'recipient', ip: '127.0.0.2', bot: false };
  const payload = { shareId: randomUUID(), sessionId: randomUUID(), contentType: 'PRODUCT', contentId: 'p1', sourceSurface: 'product_detail', parentShareId: '', schemaVersion: 1 };
  const event = type => ({ eventId: randomUUID(), sessionId: randomUUID(), shareId: payload.shareId, eventType: type, schemaVersion: 1 });
  return { db, store, source, recipient, payload, event };
}
