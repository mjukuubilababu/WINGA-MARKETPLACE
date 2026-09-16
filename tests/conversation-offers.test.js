const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { canAct, normalizeAmount, normalizeAction, statusForAction } = require("../backend/conversation-offers-domain");
const migration = require("../backend/migrations/conversation-offers");

const offer = { status:"PROPOSED", buyerUsername:"buyer", sellerUsername:"seller", lastActorUsername:"buyer" };

test("conversation offer amounts and actions are bounded", () => {
  assert.equal(normalizeAmount(499),0);
  assert.equal(normalizeAmount(500),500);
  assert.equal(normalizeAmount(1000000001),0);
  assert.equal(normalizeAction("counter"),"COUNTER");
  assert.equal(normalizeAction("convert"),"");
});

test("conversation offer state machine enforces participant turns and terminal states", () => {
  assert.equal(canAct(offer,"seller","COUNTER"),true);
  assert.equal(canAct(offer,"seller","ACCEPT"),true);
  assert.equal(canAct(offer,"buyer","ACCEPT"),false);
  assert.equal(canAct(offer,"intruder","DECLINE"),false);
  assert.equal(canAct({...offer,status:"ACCEPTED"},"seller","COUNTER"),false);
  assert.equal(canAct(offer,"buyer","CANCEL"),true);
  assert.equal(statusForAction("counter"),"COUNTERED");
  assert.equal(statusForAction("accept"),"ACCEPTED");
});

test("conversation offers migration preserves canonical state and append-only transition history", () => {
  assert.equal(migration.id,"2026091602_conversation_offers");
  const sql=migration.statements.join("\n");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS conversation_offers/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS conversation_offer_events/);
  assert.match(sql,/idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(sql,/converted_order_id TEXT REFERENCES orders/);
  assert.match(sql,/buyer_username <> seller_username/);
});

test("conversation offers API and store enforce authentication ownership and idempotency", () => {
  const api=fs.readFileSync(require.resolve("../backend/conversation-offers-api.js"),"utf8");
  const store=fs.readFileSync(require.resolve("../backend/conversation-offers-store.js"),"utf8");
  const server=fs.readFileSync(require.resolve("../backend/server.js"),"utf8");
  assert.match(api,/ensureMarketplaceUser/);
  assert.match(api,/idempotency-key/);
  assert.match(store,/product\.sellerUsername!==input\.expectedSellerUsername/);
  assert.match(store,/FOR UPDATE/);
  assert.match(store,/conversation_offer_events/);
  assert.match(store,/notifications/);
  assert.match(store,/FROM user_blocks WHERE/);
  assert.doesNotMatch(store,/user_blocks WHERE status=/);
  assert.match(store,/status='EXPIRED'/);
  assert.match(server,/createConversationOffersApi/);
  assert.doesNotMatch(store,/INSERT INTO orders/);
});

test("accepted offer conversion stays inside the canonical order transaction", () => {
  const database=fs.readFileSync(require.resolve("../backend/db.js"),"utf8");
  const server=fs.readFileSync(require.resolve("../backend/server.js"),"utf8");
  assert.match(database,/FROM conversation_offers WHERE id = \$1 FOR UPDATE/);
  assert.match(database,/status = 'CONVERTED_TO_ORDER'/);
  assert.match(database,/'CONVERT_TO_ORDER'/);
  assert.match(database,/effectivePrice/);
  assert.match(server,/acceptedOfferId/);
  assert.match(server,/offer_not_convertible/);
});
