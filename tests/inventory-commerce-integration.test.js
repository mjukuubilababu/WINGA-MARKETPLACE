const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const { createPostgresStore } = require("../backend/db");
let db, store;

before(async () => {
  db = new PGlite();
  store = createPostgresStore({
    databaseUrl: "postgres://isolated/inventory",
    queryClient: {
      query: (sql, params) => db.query(sql, params),
      connect: async () => ({ query: (sql, params) => db.query(sql, params), release() {} })
    }
  });
  await store.init();
  await db.exec(`
    INSERT INTO users(username,password,phone_number,primary_category,role,created_at)
    VALUES('seller','hash','255700000001','wanawake','seller',NOW()),
          ('buyer','hash','255700000002','wanawake','buyer',NOW());
    INSERT INTO products(id,name,price,shop,whatsapp,image,uploaded_by,category,status,availability,created_at,updated_at)
    VALUES('p1','Dress',25000,'seller','255700000001','image.webp','seller','wanawake','approved','available',NOW(),NOW()),
          ('p2','Shoes',40000,'seller','255700000001','image.webp','seller','viatu','approved','available',NOW(),NOW());
    INSERT INTO product_inventory_variants(id,product_id,size,color,stock_on_hand)
    VALUES('v1','p1','M','black',3),('v2','p2','42','white',2);
  `);
});
after(async () => db?.close());
beforeEach(async () => db.exec(`
  TRUNCATE orders, payments, payment_transaction_claims, notifications CASCADE;
  UPDATE product_inventory_variants SET stock_reserved=0, stock_on_hand=CASE WHEN id='v1' THEN 3 ELSE 2 END;
  UPDATE products SET availability='available';
`));

function input(id = "order-inventory") {
  const now = new Date().toISOString();
  return {
    order: { id, productId: "p1", productName: "Dress", price: 25000,
      buyerUsername: "buyer", sellerUsername: "seller", createdAt: now, updatedAt: now,
      reserveExpiresAt: new Date(Date.now() - 10000).toISOString() },
    payment: { id: "payment-" + id, orderId: id, buyerUsername: "buyer", transactionReference: "ref-" + id },
    context: { inventoryItems: [{ productId: "p1", variantId: "v1", quantity: 2 },
      { productId: "p2", variantId: "v2", quantity: 1 }], quotedTotal: 90000 }
  };
}
async function create(value = input()) {
  return store.createCommerceOrder(value.order, value.payment, null, value.context);
}
test("canonical order and payment use the full basket price", async () => {
  assert.equal((await create()).price, 90000);
  assert.equal(Number((await db.query("SELECT price FROM orders")).rows[0].price), 90000);
  assert.equal(Number((await db.query("SELECT amount_paid FROM payments")).rows[0].amount_paid), 90000);
  assert.equal((await db.query("SELECT id FROM order_items")).rows.length, 2);
  const loaded = await store.readStore(["orders"]);
  assert.equal(loaded.orders[0].items.length, 2);
  assert.deepEqual(loaded.orders[0].items.map(item => [item.productName, item.quantity, item.size]),
    [["Dress", 2, "M"], ["Shoes", 1, "42"]]);
  assert.equal("stock_reserved" in loaded.orders[0].items[0], false);
  assert.deepEqual((await db.query("SELECT availability FROM products ORDER BY id")).rows,
    [{ availability: "available" }, { availability: "available" }]);
});
test("stale quote rolls back order, payment claim and every stock reservation", async () => {
  const value = input(); value.context.quotedTotal = 1;
  await assert.rejects(create(value), /price_changed/);
  for (const table of ["orders", "payments", "payment_transaction_claims", "order_items"]) {
    assert.equal((await db.query("SELECT count(*)::int AS count FROM " + table)).rows[0].count, 0);
  }
  assert.equal((await db.query("SELECT sum(stock_reserved)::int AS count FROM product_inventory_variants")).rows[0].count, 0);
});
test("tracked product cannot bypass stock using legacy checkout", async () => {
  const value = input(); value.context = {};
  assert.equal((await create(value)).code, "variant_selection_required");
  assert.equal((await db.query("SELECT id FROM orders")).rows.length, 0);
});
test("reservation holds stock before payment and replays without another order", async () => {
  const value = input();
  value.context.reserveBeforePayment = true;
  value.context.idempotencyKey = "reservation-test-1";
  const created = await create(value);
  assert.equal(created.created, true);
  assert.equal((await store.applyPaymentResult(value.order.id, "", "paid")).code, "payment_reference_required");
  assert.ok(Date.parse(created.reserveExpiresAt) > Date.now());
  const replay = input("new-retry-order");
  replay.context = value.context;
  assert.equal((await create(replay)).orderId, value.order.id);
  assert.equal((await db.query("SELECT id FROM orders")).rows.length, 1);
  assert.equal((await db.query("SELECT transaction_reference FROM payments")).rows[0].transaction_reference, "");
  assert.equal((await db.query("SELECT transaction_reference FROM payment_transaction_claims")).rows.length, 0);
  assert.equal((await db.query("SELECT stock_reserved FROM product_inventory_variants WHERE id='v1'")).rows[0].stock_reserved, 2);
  replay.context = { ...value.context, quotedTotal: 1 };
  assert.equal((await create(replay)).code, "idempotency_conflict");
});
test("reference submission is buyer-owned, retry-safe and remains pending verification", async () => {
  const value = input();
  value.context = { ...value.context, reserveBeforePayment: true, idempotencyKey: "reservation-test-2" };
  await create(value);
  const submission = { orderId: value.order.id, buyerUsername: "buyer", transactionReference: "REFNEW123" };
  assert.equal((await store.submitReservedOrderReference({ ...submission, buyerUsername: "seller" })).code, "order_not_found");
  assert.equal((await store.submitReservedOrderReference(submission)).updated, true);
  assert.equal((await store.submitReservedOrderReference(submission)).duplicate, true);
  assert.equal((await store.submitReservedOrderReference({ ...submission, transactionReference: "OTHER123" })).code, "reference_already_submitted");
  const saved = (await db.query("SELECT payment_status,payment_intent_status,transaction_id FROM orders")).rows[0];
  assert.deepEqual(saved, { payment_status: "pending", payment_intent_status: "submitted", transaction_id: "REFNEW123" });
  assert.equal((await db.query("SELECT id FROM payments")).rows.length, 1);
  assert.equal((await db.query("SELECT id FROM notifications WHERE title='Reference ya malipo imetumwa'")).rows.length, 1);
});
test("expired reservation cannot accept a new payment reference", async () => {
  const value = input();
  value.context = { ...value.context, reserveBeforePayment: true, idempotencyKey: "reservation-test-3" };
  await create(value);
  await db.exec("UPDATE orders SET reserve_expires_at=NOW()-INTERVAL '1 minute'");
  assert.equal((await store.submitReservedOrderReference({
    orderId: value.order.id, buyerUsername: "buyer", transactionReference: "EXPIRED123"
  })).code, "reservation_expired");
  assert.equal((await db.query("SELECT transaction_reference FROM payment_transaction_claims")).rows.length, 0);
  await store.expireCommerceReservations();
  assert.equal((await db.query("SELECT sum(stock_reserved)::int AS count FROM product_inventory_variants")).rows[0].count, 0);
});
test("one payment reference cannot fund two reserved orders", async () => {
  const first = input();
  first.context = { ...first.context, reserveBeforePayment: true, idempotencyKey: "reservation-first" };
  await create(first);
  const second = input("second-order");
  second.order.productId = "p2";
  second.order.productName = "Shoes";
  second.context = { reserveBeforePayment: true, idempotencyKey: "reservation-second",
    inventoryItems: [{ productId: "p2", variantId: "v2", quantity: 1 }], quotedTotal: 40000 };
  await create(second);
  assert.equal((await store.submitReservedOrderReference({
    orderId: first.order.id, buyerUsername: "buyer", transactionReference: "SHARED123"
  })).updated, true);
  assert.equal((await store.submitReservedOrderReference({
    orderId: second.order.id, buyerUsername: "buyer", transactionReference: "SHARED123"
  })).code, "duplicate_transaction");
  assert.equal((await db.query("SELECT payment_intent_status FROM orders WHERE id='second-order'")).rows[0].payment_intent_status, "awaiting_reference");
  assert.equal((await db.query("SELECT id FROM notifications WHERE title='Reference ya malipo imetumwa'")).rows.length, 1);
});
test("expiry releases all basket lines without deleting historical items", async () => {
  await create();
  assert.equal((await store.expireCommerceReservations()).expired, 1);
  assert.equal((await db.query("SELECT sum(stock_reserved)::int AS count FROM product_inventory_variants")).rows[0].count, 0);
  assert.deepEqual((await db.query("SELECT inventory_state FROM order_items ORDER BY id")).rows,
    [{ inventory_state: "RELEASED" }, { inventory_state: "RELEASED" }]);
  assert.equal((await store.expireCommerceReservations()).expired, 0);
});
test("payment failure releases every item and retry cannot release twice", async () => {
  const value = input();
  await create(value);
  assert.equal((await store.applyPaymentResult(value.order.id, value.payment.transactionReference, "failed")).updated, true);
  assert.equal((await store.applyPaymentResult(value.order.id, value.payment.transactionReference, "failed")).idempotent, true);
  assert.deepEqual((await db.query("SELECT stock_on_hand,stock_reserved FROM product_inventory_variants ORDER BY id")).rows,
    [{ stock_on_hand: 3, stock_reserved: 0 }, { stock_on_hand: 2, stock_reserved: 0 }]);
});
test("automatic delivery consumes all items once and preserves remaining stock availability", async () => {
  await create();
  await db.exec("UPDATE orders SET status='shipped',payment_status='paid',delivery_confirm_by=NOW()-INTERVAL '1 minute'");
  assert.equal((await store.autoCompleteShippedOrders()).completed, 1);
  assert.equal((await store.autoCompleteShippedOrders()).completed, 0);
  assert.deepEqual((await db.query("SELECT stock_on_hand,stock_reserved FROM product_inventory_variants ORDER BY id")).rows,
    [{ stock_on_hand: 1, stock_reserved: 0 }, { stock_on_hand: 1, stock_reserved: 0 }]);
  assert.deepEqual((await db.query("SELECT availability FROM products ORDER BY id")).rows,
    [{ availability: "available" }, { availability: "available" }]);
});
test("exhausted variant stays reserved until delivery then becomes sold out", async () => {
  const value = input();
  value.context.inventoryItems = [{ productId: "p1", variantId: "v1", quantity: 3 }];
  value.context.quotedTotal = 75000;
  await create(value);
  assert.equal((await db.query("SELECT availability FROM products WHERE id='p1'")).rows[0].availability, "reserved");
  await db.exec("UPDATE orders SET status='shipped',payment_status='paid',delivery_confirm_by=NOW()-INTERVAL '1 minute'");
  await store.autoCompleteShippedOrders();
  assert.equal((await db.query("SELECT availability FROM products WHERE id='p1'")).rows[0].availability, "sold_out");
});
