const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresStore, resolveDatabasePoolMax } = require("../backend/db");
const { MIGRATIONS, runSchemaMigrations } = require("../backend/migrations");

test("PostgreSQL pool max uses a safe default and accepts positive environment overrides", () => {
  assert.equal(resolveDatabasePoolMax(undefined), 20);
  assert.equal(resolveDatabasePoolMax("40"), 40);
  assert.equal(resolveDatabasePoolMax("0"), 20);
  assert.equal(resolveDatabasePoolMax("-5"), 20);
  assert.equal(resolveDatabasePoolMax("invalid"), 20);
});

test("PostgreSQL catalog reads retry one transient primary failover error", async () => {
  const attemptsByQuery = new Map();
  const queryClient = {
    async query(text) {
      const sql = String(text);
      const attempts = (attemptsByQuery.get(sql) || 0) + 1;
      attemptsByQuery.set(sql, attempts);
      if (attempts === 1) {
        const error = new Error("terminating connection due to administrator command");
        error.code = "57P01";
        throw error;
      }
      if (sql.includes("COUNT(*)")) return { rows: [{ total: 0 }] };
      return { rows: [], rowCount: 0 };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://primary.invalid/winga",
    queryClient,
    readRetryDelayMs: 0
  });

  const page = await store.readProductsPage({ limit: 12, usePrimary: true });
  assert.deepEqual(page.items, []);
  assert.equal(page.hasMore, false);
  assert.equal(Array.from(attemptsByQuery.values()).every((attempts) => attempts === 2), true);
  const health = store.getDatabaseHealth();
  assert.equal(health.primary.metrics.transientReadRetries, 2);
  assert.equal(health.primary.metrics.transientReadRetrySuccesses, 2);
  assert.equal(health.primary.metrics.transientReadRetryFailures, 0);
});

test("PostgreSQL catalog reads do not retry non-transient query failures", async () => {
  let attempts = 0;
  const queryClient = {
    async query() {
      attempts += 1;
      const error = new Error("invalid catalog query");
      error.code = "42601";
      throw error;
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://primary.invalid/winga",
    queryClient,
    readRetryDelayMs: 0
  });

  await assert.rejects(store.readStore(["categories"]), /invalid catalog query/);
  assert.equal(attempts, 1);
  const health = store.getDatabaseHealth();
  assert.equal(health.primary.metrics.transientReadRetries, 0);
});
test("PostgreSQL schema migrations are locked, transactional, and versioned", async () => {
  const calls = [];
  let released = false;
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      if (String(text).includes("SELECT migration_id")) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      released = true;
    }
  };
  const pool = {
    query: client.query.bind(client),
    async connect() {
      return client;
    }
  };

  const result = await runSchemaMigrations({
    pool,
    logger: { info() {} },
    beforeMigrations: async (migrationClient) => {
      await migrationClient.query("SELECT 'baseline_schema' AS phase");
    }
  });

  assert.deepEqual(result.applied, MIGRATIONS.map((migration) => migration.id));
  assert.equal(calls.some((call) => call.text.includes("pg_advisory_lock")), true);
  const lockIndex = calls.findIndex((call) => call.text.includes("pg_advisory_lock"));
  const baselineIndex = calls.findIndex((call) => call.text.includes("baseline_schema"));
  const ledgerIndex = calls.findIndex((call) => call.text.includes("CREATE TABLE IF NOT EXISTS schema_migrations"));
  assert.equal(lockIndex < baselineIndex && baselineIndex < ledgerIndex, true);
  assert.equal(calls.some((call) => call.text === "BEGIN"), true);
  assert.equal(calls.some((call) => call.text.includes("ADD COLUMN IF NOT EXISTS row_version")), true);
  assert.equal(calls.some((call) => call.text.includes("idx_sessions_username_active")), true);
  assert.equal(calls.some((call) => call.text.includes("CREATE TABLE IF NOT EXISTS user_locale_preferences")), true);
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO schema_migrations")), true);
  assert.equal(calls.some((call) => call.text === "COMMIT"), true);
  assert.equal(calls.some((call) => call.text.includes("pg_advisory_unlock")), true);
  assert.equal(released, true);
});

test("PostgreSQL fresh bootstrap binds every persisted user column", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });
  await store.writeStore({
    categories: [],
    users: [{
      username: "bootstrap-admin", fullName: "Bootstrap Admin", password: "hash",
      phoneNumber: "255700000001", whatsappNumber: "255700000002",
      whatsappVerificationStatus: "verified", paymentProvider: "mpesa",
      paymentNumber: "123456", paymentRecipientName: "Bootstrap Admin",
      primaryCategory: "", role: "admin", status: "active",
      sharedPhoneViewerIds: [], createdAt: "2026-07-19T00:00:00.000Z"
    }],
    products: [], orders: [], payments: [], messages: [], notifications: [],
    sessions: [], promotions: [], reviews: [], reports: [], moderationActions: [],
    demandEvents: [], productDemandSummaries: [], searchDemandEvents: [],
    settings: {}
  });

  const userInsert = calls.find((call) => call.text.includes("INSERT INTO users"));
  assert.ok(userInsert);
  assert.equal(userInsert.params.length, 33);
  assert.equal(userInsert.params[4], "255700000002");
  assert.equal(userInsert.params[11], "mpesa");
  assert.equal(userInsert.params[32], "[]");
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL readStore skips unrequested tables while preserving the complete store shape", async () => {
  const calls = [];
  const queryClient = {
    async query(text) {
      const sql = String(text);
      calls.push(sql);
      if (sql.includes("FROM users")) {
        return { rows: [{ username: "buyer-one", sharedPhoneViewerIds: "[]" }] };
      }
      if (sql.includes("FROM sessions")) {
        return { rows: [{ token: "session-token", username: "buyer-one", expiresAt: Date.now() + 60000 }] };
      }
      throw new Error(`Unexpected table query: ${sql}`);
    }
  };
  const store = createPostgresStore({ databaseUrl: "postgres://test.invalid/winga", queryClient });

  const result = await store.readStore(["users", "sessions", "unknown-table"]);

  assert.equal(calls.length, 2);
  assert.equal(calls.some((sql) => sql.includes("FROM users")), true);
  assert.equal(calls.some((sql) => sql.includes("FROM sessions")), true);
  assert.equal(result.users.length, 1);
  assert.equal(result.sessions.length, 1);
  for (const key of ["categories", "products", "orders", "payments", "messages", "notifications", "promotions", "reviews", "reports", "moderationActions"]) {
    assert.deepEqual(result[key], []);
  }
  assert.deepEqual(result.settings, {});
});

test("PostgreSQL product actions update one row atomically", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      return {
        rows: [{
          likes: 7,
          views: 11,
          viewedBy: ["buyer-one"],
          updatedAt: new Date("2026-07-19T18:00:00.000Z"),
          rowVersion: 4
        }],
        rowCount: 1
      };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const result = await store.recordProductAction("product-1", "buyer-one", "view");

  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /^UPDATE products/m);
  assert.match(calls[0].text, /row_version = row_version \+ 1/);
  assert.match(calls[0].text, /NOT \(COALESCE\(viewed_by/);
  assert.deepEqual(calls[0].params, ["product-1", "buyer-one", "view"]);
  assert.deepEqual(result, {
    likes: 7,
    views: 11,
    viewedBy: ["buyer-one"],
    updatedAt: "2026-07-19T18:00:00.000Z",
    rowVersion: 4
  });
});

test("PostgreSQL session rotation and security notification commit atomically", async () => {
  const calls = [];
  let released = false;
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      if (String(text).includes("UPDATE sessions")) {
        return { rows: [{ rowVersion: 6 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {
      released = true;
    }
  };
  const queryClient = {
    query: client.query.bind(client),
    async connect() {
      return client;
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });
  const session = {
    token: "next-token",
    sessionId: "session-1",
    username: "buyer-one",
    fullName: "Buyer One",
    primaryCategory: "fashion",
    role: "buyer",
    status: "active",
    createdAt: "2026-07-19T17:00:00.000Z",
    lastSeenAt: "2026-07-19T18:00:00.000Z",
    lastRotatedAt: "2026-07-19T18:00:00.000Z",
    expiresAt: 1785098400000
  };
  const notification = {
    id: "notification-1",
    userId: "buyer-one",
    title: "Security check needed",
    body: "Verify this session",
    createdAt: "2026-07-19T18:00:00.000Z"
  };

  const result = await store.replaceSession("current-token", session, { notification });

  assert.deepEqual(result, { updated: true, rowVersion: 6 });
  assert.equal(calls[0].text, "BEGIN");
  assert.match(calls[1].text, /UPDATE sessions/);
  assert.match(calls[1].text, /row_version = row_version \+ 1/);
  assert.deepEqual(calls[1].params.slice(0, 4), ["current-token", "next-token", "session-1", "buyer-one"]);
  assert.match(calls[2].text, /INSERT INTO notifications/);
  assert.equal(calls[3].text, "COMMIT");
  assert.equal(released, true);
});

test("PostgreSQL session revocation is scoped and can notify in one transaction", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const queryClient = {
    query: client.query.bind(client),
    async connect() {
      return client;
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const result = await store.deleteSessionById("session-2", {
    username: "buyer-two",
    notification: {
      id: "notification-2",
      userId: "buyer-two",
      title: "Session revoked",
      body: "A session was revoked"
    }
  });

  assert.deepEqual(result, { deleted: true });
  assert.match(calls[1].text, /DELETE FROM sessions WHERE session_id = \$1 AND username = \$2/);
  assert.deepEqual(calls[1].params, ["session-2", "buyer-two"]);
  assert.match(calls[2].text, /INSERT INTO notifications/);
  assert.equal(calls[3].text, "COMMIT");
});

test("PostgreSQL signup creates user and session in one bounded transaction", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const queryClient = {
    query: client.query.bind(client),
    async connect() {
      return client;
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });
  const user = {
    username: "seller-one",
    fullName: "Seller One",
    password: "scrypt:salt:hash",
    phoneNumber: "255700000001",
    primaryCategory: "",
    role: "seller",
    status: "active",
    createdAt: "2026-07-19T18:00:00.000Z"
  };
  const session = {
    token: "signup-token",
    sessionId: "signup-session",
    username: "seller-one",
    fullName: "Seller One",
    role: "seller",
    status: "active",
    createdAt: "2026-07-19T18:00:00.000Z",
    expiresAt: 1785098400000
  };

  const result = await store.createUserWithSession(user, session, { maxActiveSessions: 5 });

  assert.deepEqual(result, { created: true, conflict: "" });
  assert.equal(calls[0].text, "BEGIN");
  assert.match(calls[1].text, /INSERT INTO users/);
  assert.match(calls[2].text, /UPDATE users/);
  assert.match(calls[3].text, /INSERT INTO sessions/);
  assert.match(calls[4].text, /DELETE FROM sessions/);
  assert.deepEqual(calls[4].params, ["seller-one", "signup-token", 4]);
  assert.equal(calls[5].text, "COMMIT");
});

test("PostgreSQL signup converts unique races into a safe conflict and rolls back", async () => {
  const calls = [];
  let insertAttempted = false;
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      if (String(text).includes("INSERT INTO users") && !insertAttempted) {
        insertAttempted = true;
        const error = new Error("duplicate phone");
        error.code = "23505";
        error.constraint = "users_phone_number_key";
        throw error;
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const queryClient = {
    query: client.query.bind(client),
    async connect() {
      return client;
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const result = await store.createUserWithSession({
    username: "seller-two",
    password: "hash",
    phoneNumber: "255700000002"
  }, {
    token: "token-two",
    sessionId: "session-two",
    username: "seller-two",
    expiresAt: 1785098400000
  });

  assert.deepEqual(result, { created: false, conflict: "phoneNumber" });
  assert.equal(calls[0].text, "BEGIN");
  assert.equal(calls.at(-1).text, "ROLLBACK");
  assert.equal(calls.some((call) => call.text === "COMMIT"), false);
});

test("PostgreSQL login upgrades password, caps sessions, and notifies atomically", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const queryClient = {
    query: client.query.bind(client),
    async connect() {
      return client;
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const result = await store.createLoginSession({ username: "buyer-three" }, {
    token: "login-token",
    sessionId: "login-session",
    username: "buyer-three",
    role: "buyer",
    expiresAt: 1785098400000
  }, {
    passwordHash: "scrypt:new:hash",
    maxActiveSessions: 3,
    notification: {
      id: "login-notification",
      userId: "buyer-three",
      title: "New login",
      body: "New device"
    }
  });

  assert.deepEqual(result, { created: true });
  assert.equal(calls[0].text, "BEGIN");
  assert.match(calls[1].text, /UPDATE users/);
  assert.match(calls[2].text, /DELETE FROM sessions WHERE expires_at/);
  assert.match(calls[3].text, /INSERT INTO sessions/);
  assert.deepEqual(calls[4].params, ["buyer-three", "login-token", 2]);
  assert.match(calls[5].text, /INSERT INTO notifications/);
  assert.equal(calls[6].text, "COMMIT");
});

test("PostgreSQL product create is transactional and does not rewrite the catalog", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      if (String(text).includes("INSERT INTO products")) {
        return { rows: [{ rowVersion: 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.createProduct({
    id: "product-row-1",
    name: "Dress",
    price: 20000,
    shop: "Seller",
    uploadedBy: "seller-one",
    category: "fashion",
    images: ["https://example.com/dress.jpg"]
  });

  assert.deepEqual(result, { created: true, rowVersion: 1 });
  assert.equal(calls[0].text, "BEGIN");
  assert.match(calls[1].text, /INSERT INTO categories/);
  assert.match(calls[2].text, /INSERT INTO products/);
  assert.equal(calls.some((call) => /DELETE FROM products/.test(call.text)), false);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL product update enforces owner and optimistic row version", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      if (String(text).includes("UPDATE products")) {
        return { rows: [{ rowVersion: 8 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.updateProduct("product-row-2", "seller-two", {
    name: "Updated shirt",
    uploadedBy: "seller-two",
    category: "fashion",
    images: []
  }, { expectedRowVersion: 7 });

  assert.deepEqual(result, { updated: true, conflict: false, rowVersion: 8 });
  const update = calls.find((call) => call.text.includes("UPDATE products"));
  assert.match(update.text, /uploaded_by = \$2/);
  assert.match(update.text, /row_version = \$27::bigint/);
  assert.equal(update.params[0], "product-row-2");
  assert.equal(update.params[1], "seller-two");
  assert.equal(update.params[26], 7);
});

test("PostgreSQL product moderation and seller notification commit atomically", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      if (String(text).includes("UPDATE products")) {
        return { rows: [{ rowVersion: 3 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.moderateProduct("product-row-3", {
    status: "approved",
    moderatedBy: "admin-one"
  }, {
    id: "moderation-note-1",
    userId: "seller-three",
    title: "Approved",
    body: "Product approved"
  });

  assert.deepEqual(result, { updated: true, rowVersion: 3 });
  assert.equal(calls[0].text, "BEGIN");
  assert.match(calls[1].text, /UPDATE products/);
  assert.match(calls[2].text, /INSERT INTO notifications/);
  assert.equal(calls[3].text, "COMMIT");
});

test("PostgreSQL product delete is owner-scoped", async () => {
  const calls = [];
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: {
      async query(text, params = []) {
        calls.push({ text: String(text), params });
        return { rows: [], rowCount: 1 };
      }
    }
  });

  const result = await store.deleteProduct("product-row-4", "seller-four");
  assert.deepEqual(result, { deleted: true });
  assert.match(calls[0].text, /DELETE FROM products WHERE id = \$1 AND uploaded_by = \$2/);
  assert.deepEqual(calls[0].params, ["product-row-4", "seller-four"]);
});

test("PostgreSQL commerce order locks inventory and commits receipt, order, payment, and notification atomically", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM products WHERE id") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "p1", price: 25000, uploadedBy: "seller", status: "approved", availability: "available" }], rowCount: 1 };
      }
      if (sql.includes("SELECT 1 FROM orders")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO payment_transaction_claims")) return { rows: [{ transaction_reference: "TX12345" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });
  const order = {
    id: "o1", productId: "p1", productName: "Dress", price: 25000,
    buyerUsername: "buyer", sellerUsername: "seller", status: "placed",
    paymentStatus: "pending", transactionId: "TX12345", createdAt: "2026-07-19T20:00:00.000Z"
  };
  const payment = {
    id: "pay1", orderId: "o1", buyerUsername: "buyer", amountPaid: 25000,
    transactionReference: "TX12345", paymentStatus: "pending"
  };

  const result = await store.createCommerceOrder(order, payment, {
    id: "n1", userId: "seller", title: "Order", body: "New order"
  });

  assert.equal(result.created, true);
  assert.equal(calls[0].text, "BEGIN");
  assert.match(calls[1].text, /FOR UPDATE/);
  assert.ok(calls.findIndex((call) => call.text.includes("payment_transaction_claims")) < calls.findIndex((call) => call.text.includes("INSERT INTO orders")));
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO payments")), true);
  assert.equal(calls.some((call) => call.text.includes("availability = 'reserved'")), true);
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO notifications")), true);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL commerce order rejects a duplicate transaction before business rows are written", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM products WHERE id")) {
        return { rows: [{ price: 1000, uploadedBy: "seller", status: "approved", availability: "available" }], rowCount: 1 };
      }
      if (sql.includes("SELECT 1 FROM orders")) return { rows: [], rowCount: 0 };
      if (sql.includes("payment_transaction_claims")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.createCommerceOrder({
    id: "o2", productId: "p2", price: 1000, buyerUsername: "buyer", sellerUsername: "seller"
  }, {
    id: "pay2", orderId: "o2", transactionReference: "USED123"
  });

  assert.deepEqual(result, { created: false, code: "duplicate_transaction" });
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO orders")), false);
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO payments")), false);
});

test("PostgreSQL payment webhook updates payment, order, and inventory in one lock-bound transaction", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM payments") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "pay3", orderId: "o3", paymentStatus: "pending" }], rowCount: 1 };
      }
      if (sql.includes("FROM orders WHERE id") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "o3", productId: "p3", status: "placed", paymentStatus: "pending" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.applyPaymentResult("o3", "", "paid", { provider: "gateway" });

  assert.equal(result.updated, true);
  assert.equal(result.orderStatus, "paid");
  assert.match(calls[1].text, /FOR UPDATE/);
  assert.match(calls[2].text, /FOR UPDATE/);
  assert.equal(calls.some((call) => call.text.includes("UPDATE payments")), true);
  assert.equal(calls.some((call) => call.text.includes("UPDATE orders")), true);
  assert.equal(calls.some((call) => call.text.includes("UPDATE products")), true);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL payment webhook dedupes identical provider events and rejects payload conflicts", async () => {
  function createEventStore(existingPayloadHash) {
    const calls = [];
    const client = {
      async query(text, params = []) {
        const sql = String(text);
        calls.push({ text: sql, params });
        if (sql.includes("FROM payments") && sql.includes("FOR UPDATE")) {
          return { rows: [{
            id: "pay-event", orderId: "order-event", paymentStatus: "pending",
            transactionReference: "TX-EVENT", amountPaid: 25000, currency: "TZS"
          }], rowCount: 1 };
        }
        if (sql.includes("FROM orders WHERE id") && sql.includes("FOR UPDATE")) {
          return { rows: [{ id: "order-event", productId: "product-event", status: "placed", paymentStatus: "pending" }], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO payment_webhook_events")) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("FROM payment_webhook_events WHERE event_id")) {
          return { rows: [{
            paymentId: "pay-event", orderId: "order-event", paymentStatus: "paid",
            payloadHash: existingPayloadHash
          }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      release() {}
    };
    return {
      calls,
      store: createPostgresStore({
        databaseUrl: "postgres://test.invalid/winga",
        queryClient: { query: client.query.bind(client), connect: async () => client }
      })
    };
  }

  const matching = createEventStore("payload-hash-1");
  const replay = await matching.store.applyPaymentResult(
    "order-event", "TX-EVENT", "paid", { provider: "gateway" },
    { eventId: "provider-event-1", amount: 25000, currency: "TZS", payloadHash: "payload-hash-1" }
  );
  assert.equal(replay.updated, true);
  assert.equal(replay.duplicate, true);
  assert.equal(matching.calls.some((call) => call.text.includes("UPDATE payments")), false);

  const conflicting = createEventStore("different-payload-hash");
  const conflict = await conflicting.store.applyPaymentResult(
    "order-event", "TX-EVENT", "paid", { provider: "gateway" },
    { eventId: "provider-event-1", amount: 25000, currency: "TZS", payloadHash: "payload-hash-1" }
  );
  assert.equal(conflict.updated, false);
  assert.equal(conflict.code, "payment_event_conflict");
  assert.equal(conflicting.calls.some((call) => call.text.includes("UPDATE payments")), false);
});
test("PostgreSQL payment state machine rejects stale callbacks after payment is final", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM payments") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "pay-final", orderId: "order-final", paymentStatus: "paid" }], rowCount: 1 };
      }
      if (sql.includes("FROM orders WHERE id")) {
        return { rows: [{ id: "order-final", productId: "p-final", status: "confirmed", paymentStatus: "paid" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.applyPaymentResult("order-final", "", "failed");

  assert.equal(result.updated, false);
  assert.equal(result.code, "payment_state_conflict");
  assert.equal(calls.some((call) => call.text.includes("UPDATE payments")), false);
  assert.equal(calls.some((call) => call.text.includes("UPDATE products")), false);
});

test("PostgreSQL order transition rejects stale state without partial writes", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      if (String(text).includes("UPDATE orders")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.transitionCommerceOrder(
    { id: "o4", status: "placed", paymentStatus: "pending" },
    { status: "paid", paymentStatus: "paid" },
    { paymentStatus: "paid" },
    "reserved"
  );

  assert.deepEqual(result, { updated: false, conflict: true, code: "order_state_conflict" });
  assert.equal(calls.some((call) => call.text.includes("DELETE FROM order_lifecycle_events")), true);
  assert.equal(calls.some((call) => call.text.includes("UPDATE payments")), false);
  assert.equal(calls.some((call) => call.text.includes("UPDATE products")), false);
});

test("PostgreSQL disputed transition opens reconciliation without releasing inventory", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("UPDATE orders") && sql.includes("RETURNING product_id")) {
        return { rows: [{ productId: "product-disputed", rowVersion: 8 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.transitionCommerceOrder(
    { id: "order-disputed", status: "shipped", paymentStatus: "paid", rowVersion: 7 },
    { status: "disputed", paymentStatus: "paid", disputedAt: "2026-08-23T12:00:00.000Z", disputeReason: "Package arrived damaged" },
    { paymentStatus: "paid" },
    "reserved",
    { id: "notification-dispute", userId: "seller", title: "Dispute", body: "Review required" },
    { actorUsername: "buyer", actorRole: "buyer", expectedVersion: 7, idempotencyKey: "order-disputed:7:disputed" }
  );

  assert.deepEqual(result, { updated: true, conflict: false, rowVersion: 8 });
  assert.equal(calls.some((call) => call.text.includes("case_type, status") && call.text.includes("'order_dispute', 'open'")), true);
  assert.equal(calls.some((call) => call.text.includes("UPDATE products SET availability = $2") && call.params[1] === "reserved"), true);
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO notifications")), true);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL auto delivery completes due shipped orders with lifecycle and notifications atomically", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM orders WHERE status = 'shipped'")) {
        return { rows: [{ id: "order-due", productId: "product-due", productName: "Dress", buyerUsername: "buyer", sellerUsername: "seller" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.autoCompleteShippedOrders({ batchSize: 10, disputeWindowSeconds: 172800 });

  assert.deepEqual(result, { completed: 1, hasMore: false });
  assert.equal(calls.some((call) => call.text.includes("status = 'delivered'")), true);
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO order_lifecycle_events")), true);
  assert.equal(calls.filter((call) => call.text.includes("INSERT INTO notifications")).length, 2);
});
test("PostgreSQL late payment after cancellation is retained for reconciliation without resurrecting commerce state", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM payments") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "payment-late", orderId: "order-cancelled", paymentStatus: "cancelled" }], rowCount: 1 };
      }
      if (sql.includes("FROM orders WHERE id") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "order-cancelled", productId: "product-released", status: "cancelled", paymentStatus: "cancelled" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.applyPaymentResult("order-cancelled", "", "paid", { providerEventId: "late-event" });

  assert.equal(result.updated, false);
  assert.equal(result.reconciliationRequired, true);
  assert.equal(result.code, "late_payment_requires_reconciliation");
  assert.match(calls[3].text, /INSERT INTO payment_reconciliation_cases/);
  assert.match(calls[4].text, /raw_gateway_response/);
  assert.match(calls[5].text, /payment_intent_status = 'reconciliation_required'/);
  assert.equal(calls.some((call) => /SET payment_status = \$2/.test(call.text)), false);
  assert.equal(calls.some((call) => call.text.includes("UPDATE products")), false);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL payment reconciliation listing is cursor bounded and returns normalized cases", async () => {
  const rows = [1, 2, 3].map((index) => ({
    id: `case-${index}`,
    orderId: `order-${index}`,
    paymentId: `payment-${index}`,
    status: "open",
    amount: "1200.50",
    evidence: { callbackCount: index },
    resolution: {},
    updatedAt: new Date(`2026-08-13T12:0${4 - index}:00.000Z`),
    createdAt: new Date("2026-08-13T11:00:00.000Z"),
    rowVersion: "1"
  }));
  const calls = [];
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: {
      async query(text, params = []) {
        calls.push({ text: String(text), params });
        return { rows, rowCount: rows.length };
      }
    }
  });

  const page = await store.readPaymentReconciliationPage({ status: "open", limit: 2 });

  assert.equal(page.items.length, 2);
  assert.equal(page.hasMore, true);
  assert.equal(page.items[0].amount, 1200.5);
  assert.equal(page.items[0].rowVersion, 1);
  assert.equal(page.nextCursor, "2026-08-13T12:02:00.000Z|case-2");
  assert.match(calls[0].text, /LEFT JOIN payment_refund_outbox/);
  assert.match(calls[0].text, /ORDER BY prc.updated_at DESC, prc.id DESC/);
  assert.deepEqual(calls[0].params, ["open", 3]);
});

test("PostgreSQL payment reconciliation transition locks the case and enforces row version", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM payment_reconciliation_cases") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "late_payment:pay-1", status: "open", rowVersion: 4 }], rowCount: 1 };
      }
      if (sql.includes("UPDATE payment_reconciliation_cases")) {
        return {
          rows: [{
            id: "late_payment:pay-1", orderId: "order-1", paymentId: "pay-1",
            status: "in_review", assignedTo: "admin", resolution: { note: "Reviewing" },
            resolvedBy: "", resolvedAt: null, updatedAt: new Date("2026-08-13T12:00:00.000Z"), rowVersion: 5
          }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const conflict = await store.transitionPaymentReconciliationCase("late_payment:pay-1", {
    status: "in_review", actor: "admin", expectedVersion: 3, resolution: { note: "Reviewing" }
  });
  assert.equal(conflict.code, "reconciliation_version_conflict");
  assert.equal(calls.some((call) => call.text.includes("UPDATE payment_reconciliation_cases")), false);

  calls.length = 0;
  const updated = await store.transitionPaymentReconciliationCase("late_payment:pay-1", {
    status: "in_review", actor: "admin", expectedVersion: 4, resolution: { note: "Reviewing" }
  });
  assert.equal(updated.updated, true);
  assert.equal(updated.item.rowVersion, 5);
  assert.match(calls[2].text, /row_version = row_version \+ 1/);
  assert.equal(calls.at(-1).text, "COMMIT");
});
test("PostgreSQL reservation expiry is idempotent when no stale reservations remain", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.expireCommerceReservations({ now: "2026-08-13T12:00:00.000Z" });

  assert.deepEqual(result, { expired: 0, releasedProducts: 0, hasMore: false });
  assert.equal(calls.filter((call) => call.text.startsWith("UPDATE ")).length, 0);
  assert.equal(calls.at(-1).text, "COMMIT");
});
test("PostgreSQL reservation expiry cancels stale commerce state and safely releases inventory", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM orders") && sql.includes("FOR UPDATE SKIP LOCKED")) {
        return { rows: [{ id: "expired-order", productId: "expired-product" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE orders") && sql.includes("payment_intent_status = 'expired'")) {
        return { rows: [{ id: "expired-order", productId: "expired-product" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.expireCommerceReservations({
    now: "2026-08-13T12:00:00.000Z",
    batchSize: 100
  });

  assert.deepEqual(result, { expired: 1, releasedProducts: 1, hasMore: false });
  assert.match(calls[1].text, /FOR UPDATE SKIP LOCKED/);
  assert.match(calls[2].text, /FROM products.*FOR UPDATE/s);
  assert.match(calls[3].text, /status = 'cancelled'/);
  assert.match(calls[4].text, /UPDATE payments/);
  assert.match(calls[5].text, /NOT EXISTS/);
  assert.equal(calls.at(-1).text, "COMMIT");
});
test("PostgreSQL message send serializes conversation pressure and commits notification atomically", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes('AS "burstCount"')) return { rows: [{ burstCount: 1, duplicate: false }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });
  const message = {
    id: "msg-1", senderId: "buyer", receiverId: "seller", conversationId: "buyer:seller:p1",
    message: "Is this available?", messageType: "product_inquiry", productId: "p1",
    productItems: [], createdAt: "2026-07-19T21:00:00.000Z", isDelivered: true, isRead: false
  };

  const result = await store.createMessageWithNotification(message, {
    id: "msg-note-1", userId: "seller", title: "Message", body: "New message"
  });

  assert.deepEqual(result, { created: true, code: "" });
  assert.equal(calls[0].text, "BEGIN");
  assert.match(calls[1].text, /pg_advisory_xact_lock/);
  assert.match(calls[3].text, /INSERT INTO messages/);
  assert.match(calls[4].text, /INSERT INTO notifications/);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL message send rejects duplicate pressure before inserting rows", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes('AS "burstCount"')) return { rows: [{ burstCount: 2, duplicate: true }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.createMessageWithNotification({
    id: "msg-dup", senderId: "buyer", receiverId: "seller", message: "Again"
  });

  assert.deepEqual(result, { created: false, code: "duplicate_message" });
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO messages")), false);
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO notifications")), false);
});

test("PostgreSQL conversation read updates only receiver rows and related notifications", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("UPDATE messages")) {
        return { rows: [{ conversationId: "buyer:seller:p1" }], rowCount: 2 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.markConversationRead("buyer", "seller");

  assert.equal(result.changed, true);
  assert.match(calls[1].text, /receiver_id = \$1 AND sender_id = \$2/);
  assert.deepEqual(calls[1].params.slice(0, 2), ["buyer", "seller"]);
  assert.match(calls[2].text, /UPDATE notifications/);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL notification read is user scoped", async () => {
  const calls = [];
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: {
      async query(text, params = []) {
        calls.push({ text: String(text), params });
        return { rows: [{ readAt: new Date("2026-07-19T21:30:00.000Z") }], rowCount: 1 };
      }
    }
  });

  const result = await store.markNotificationRead("note-1", "buyer");
  assert.equal(result.updated, true);
  assert.match(calls[0].text, /id = \$1 AND user_id = \$2/);
  assert.deepEqual(calls[0].params.slice(0, 2), ["note-1", "buyer"]);
});

test("PostgreSQL password recovery updates one user and revokes sessions atomically", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("UPDATE users")) return { rows: [{ rowVersion: 7 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.resetUserPassword("buyer", "scrypt:new-password-hash", { expectedRowVersion: 6 });

  assert.deepEqual(result, { updated: true, conflict: false, rowVersion: 7 });
  assert.equal(calls[0].text, "BEGIN");
  assert.match(calls[1].text, /WHERE username = \$1/);
  assert.match(calls[1].text, /row_version = \$3::bigint/);
  assert.deepEqual(calls[1].params, ["buyer", "scrypt:new-password-hash", 6]);
  assert.match(calls[2].text, /DELETE FROM sessions WHERE username = \$1/);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL password recovery challenge supersedes prior codes and stores only hashes", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.createPasswordRecoveryChallenge({
    challengeId: "recovery-123456789012345678901234",
    username: "buyer",
    destinationHash: "destination-hash",
    codeHash: "code-hash",
    requestedIpHash: "ip-hash",
    maxAttempts: 5,
    expiresAt: "2026-07-20T12:10:00.000Z",
    createdAt: "2026-07-20T12:00:00.000Z"
  });

  assert.deepEqual(result, { created: true });
  assert.equal(calls[0].text, "BEGIN");
  assert.match(calls[1].text, /UPDATE password_recovery_challenges/);
  assert.match(calls[2].text, /INSERT INTO password_recovery_challenges/);
  assert.equal(calls[2].params.includes("123456"), false);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL OTP completion locks challenge, resets password, revokes sessions, and notifies atomically", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM password_recovery_challenges") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            challengeId: "recovery-123456789012345678901234",
            username: "buyer",
            codeHash: "expected-code-hash",
            attempts: 1,
            maxAttempts: 5,
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            consumedAt: null
          }],
          rowCount: 1
        };
      }
      if (sql.includes("UPDATE users")) return { rows: [{ username: "buyer" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.completePasswordRecoveryChallenge(
    "recovery-123456789012345678901234",
    "expected-code-hash",
    "scrypt:new-password-hash",
    { notification: { id: "note-recovery", userId: "placeholder", title: "Password changed", createdAt: new Date().toISOString() } }
  );

  assert.equal(result.completed, true);
  assert.equal(result.username, "buyer");
  assert.ok(calls.some((call) => /DELETE FROM sessions WHERE username=\$1/.test(call.text)));
  assert.ok(calls.some((call) => /delivery_status='consumed'/.test(call.text)));
  const notificationInsert = calls.find((call) => call.text.includes("INSERT INTO notifications"));
  assert.equal(notificationInsert.params[1], "buyer");
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL OTP mismatch consumes the attempt without changing user state", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM password_recovery_challenges") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            challengeId: "recovery-123456789012345678901234",
            username: "buyer",
            codeHash: "expected-code-hash",
            attempts: 4,
            maxAttempts: 5,
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            consumedAt: null
          }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.completePasswordRecoveryChallenge(
    "recovery-123456789012345678901234",
    "wrong-code-hash",
    "scrypt:must-not-be-written"
  );

  assert.equal(result.completed, false);
  assert.equal(result.code, "attempts_exhausted");
  assert.equal(result.attemptsRemaining, 0);
  assert.equal(calls.some((call) => call.text.includes("UPDATE users")), false);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL boot maintenance prunes sessions and syncs one admin without replacing collections", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("DELETE FROM sessions")) return { rows: [], rowCount: 3 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.runBootMaintenance({
    nowMs: 1784500000000,
    adminUser: {
      username: "admin",
      fullName: "Winga Admin",
      password: "scrypt:admin-hash",
      phoneNumber: "255700000001",
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z"
    }
  });

  assert.deepEqual(result, { expiredSessions: 3, adminSynced: true });
  assert.match(calls[1].text, /pg_advisory_xact_lock/);
  assert.match(calls[2].text, /DELETE FROM sessions WHERE expires_at <= \$1/);
  assert.match(calls[3].text, /INSERT INTO users/);
  assert.match(calls[3].text, /ON CONFLICT \(username\) DO UPDATE/);
  assert.equal(calls.some((call) => /DELETE FROM (products|users|orders)/.test(call.text)), false);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL profile update persists commerce fields and synchronizes sessions and listings atomically", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("UPDATE users")) return { rows: [{ rowVersion: 5 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });
  const user = {
    username: "seller-profile", fullName: "Seller Profile", phoneNumber: "255700000010",
    whatsappNumber: "255700000011", whatsappVerificationStatus: "verified",
    paymentProvider: "mpesa", paymentNumber: "123456", paymentRecipientName: "Seller Profile",
    paymentInstructions: "Use business number", role: "seller", status: "active",
    primaryCategory: "fashion", sharedPhoneViewerIds: [], updatedAt: "2026-07-19T22:00:00.000Z"
  };

  const result = await store.updateUserRecord(user, { expectedRowVersion: 4, syncWhatsapp: true });

  assert.deepEqual(result, { updated: true, conflict: false, rowVersion: 5 });
  assert.equal(calls[0].text, "BEGIN");
  const userUpdate = calls.find((call) => call.text.includes("UPDATE users"));
  assert.match(userUpdate.text, /payment_provider = \$11/);
  assert.match(userUpdate.text, /row_version = \$32::bigint/);
  assert.equal(userUpdate.params[31], 4);
  assert.equal(calls.some((call) => call.text.includes("UPDATE sessions")), true);
  assert.equal(calls.some((call) => call.text.includes("UPDATE products SET whatsapp")), true);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL user moderation revokes sessions, hides listings, and records evidence atomically", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("UPDATE users")) return { rows: [{ rowVersion: 9 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });
  const user = {
    username: "seller-blocked", fullName: "Blocked Seller", phoneNumber: "255700000012",
    role: "seller", status: "banned", moderatedBy: "admin", moderationReason: "fraud",
    updatedAt: "2026-07-19T22:10:00.000Z", sharedPhoneViewerIds: []
  };

  const result = await store.updateUserRecord(user, {
    expectedRowVersion: 8,
    revokeSessions: true,
    hideProducts: true,
    notification: { id: "ban-note", userId: user.username, title: "Account", body: "Banned" },
    moderationAction: {
      id: "ban-action", adminUsername: "admin", actionType: "user_banned",
      targetUserId: user.username, reason: "fraud"
    }
  });

  assert.equal(result.updated, true);
  assert.equal(calls.some((call) => call.text.includes("DELETE FROM sessions WHERE username")), true);
  assert.equal(calls.some((call) => call.text.includes("UPDATE products") && call.text.includes("status = 'rejected'")), true);
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO notifications")), true);
  assert.equal(calls.some((call) => call.text.includes("INSERT INTO moderation_actions")), true);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL promotion creation claims transaction and prevents concurrent duplicate state", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM products")) return { rows: [{ uploadedBy: "seller" }], rowCount: 1 };
      if (sql.includes("FROM promotions") || sql.includes("payment_transaction_claims")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO promotion_transaction_claims")) return { rows: [{ transaction_reference: "PROMO1" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({ databaseUrl: "postgres://test.invalid/winga", queryClient: { query: client.query.bind(client), connect: async () => client } });
  const result = await store.createPromotion({
    id: "promo-1", productId: "p1", sellerUsername: "seller", type: "starter_day",
    transactionReference: "PROMO1", startDate: "2026-07-19T00:00:00Z",
    endDate: "2026-07-20T00:00:00Z", createdAt: "2026-07-19T00:00:00Z", updatedAt: "2026-07-19T00:00:00Z"
  });
  assert.equal(result.created, true);
  assert.match(calls[1].text, /pg_advisory_xact_lock/);
  assert.ok(calls.findIndex((call) => call.text.includes("promotion_transaction_claims")) < calls.findIndex((call) => call.text.includes("INSERT INTO promotions")));
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL review creation verifies delivery and claims one review per buyer-product", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM orders")) return { rows: [{}], rowCount: 1 };
      if (sql.includes("INSERT INTO review_claims")) return { rows: [{ review_id: "r1" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({ databaseUrl: "postgres://test.invalid/winga", queryClient: { query: client.query.bind(client), connect: async () => client } });
  const result = await store.createReview({
    id: "r1", userId: "buyer", productId: "p1", sellerId: "seller",
    rating: 5, comment: "Great", verifiedBuyer: true, date: "2026-07-19T00:00:00Z"
  });
  assert.deepEqual(result, { created: true, code: "" });
  assert.match(calls[1].text, /status='delivered'/);
  assert.match(calls[2].text, /review_claims/);
  assert.match(calls[3].text, /INSERT INTO reviews/);
});

test("PostgreSQL report lifecycle holds and releases the open-report claim atomically", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("INSERT INTO open_report_claims")) return { rows: [{ report_id: "rep1" }], rowCount: 1 };
      if (sql.includes("UPDATE reports")) return {
        rows: [{ reporterUserId: "buyer", targetType: "product", targetUserId: "seller", targetProductId: "p1", rowVersion: 2 }], rowCount: 1
      };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({ databaseUrl: "postgres://test.invalid/winga", queryClient: { query: client.query.bind(client), connect: async () => client } });
  const report = {
    id: "rep1", reporterUserId: "buyer", targetType: "product", targetUserId: "seller",
    targetProductId: "p1", reason: "fraud", status: "open",
    createdAt: "2026-07-19T00:00:00Z", updatedAt: "2026-07-19T00:00:00Z"
  };
  assert.deepEqual(await store.createReport(report), { created: true, code: "" });
  const reviewed = await store.reviewReport({ ...report, status: "resolved", reviewedBy: "admin" }, "open");
  assert.equal(reviewed.updated, true);
  assert.equal(calls.some((call) => call.text.includes("DELETE FROM open_report_claims")), true);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL app settings use one versioned upsert", async () => {
  const calls = [];
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { async query(text, params = []) { calls.push({ text: String(text), params }); return { rows: [{ rowVersion: 4 }], rowCount: 1 }; } }
  });
  const result = await store.saveAppSettings({ heroSectionVisible: true, updatedBy: "admin", updatedAt: "2026-07-19T00:00:00Z" });
  assert.deepEqual(result, { updated: true, rowVersion: 4 });
  assert.match(calls[0].text, /ON CONFLICT \(id\) DO UPDATE/);
  assert.match(calls[0].text, /row_version = app_settings.row_version \+ 1/);
});

test("PostgreSQL cursor pagination keeps cursor parameters out of the count query", async () => {
  const calls = [];
  const cursorCreatedAt = "2026-06-24T20:00:00.000Z";
  const cursorId = "product-cursor";
  const rows = [
    {
      id: "product-3",
      name: "Newest",
      createdAt: new Date("2026-06-24T19:00:00.000Z"),
      updatedAt: new Date("2026-06-24T19:00:00.000Z"),
      images: []
    },
    {
      id: "product-2",
      name: "Middle",
      createdAt: new Date("2026-06-24T18:00:00.000Z"),
      updatedAt: new Date("2026-06-24T18:00:00.000Z"),
      images: []
    },
    {
      id: "product-1",
      name: "Lookahead",
      createdAt: new Date("2026-06-24T17:00:00.000Z"),
      updatedAt: new Date("2026-06-24T17:00:00.000Z"),
      images: []
    }
  ];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("COUNT(*)")) {
        return { rows: [{ total: 9 }] };
      }
      return { rows };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const page = await store.readProductsPage({
    limit: 2,
    page: 2,
    cursor: `${cursorCreatedAt}|${cursorId}`,
    viewerUsername: "seller-one",
    isStaffViewer: false
  });

  assert.equal(calls.length, 2);
  const itemsCall = calls.find((call) => call.text.includes("ORDER BY p.created_at DESC, p.id DESC"));
  const countCall = calls.find((call) => call.text.includes("COUNT(*)"));

  assert.ok(itemsCall);
  assert.ok(countCall);
  assert.match(itemsCall.text, /\(created_at, id\) < \(\$2::timestamptz, \$3::text\)/);
  assert.match(itemsCall.text, /LEFT JOIN product_demand_summaries pds ON pds.product_id = p.id/);
  assert.match(itemsCall.text, /ORDER BY p.created_at DESC, p.id DESC/);
  assert.match(itemsCall.text, /LIMIT \$4/);
  assert.deepEqual(itemsCall.params, [
    "seller-one",
    cursorCreatedAt,
    cursorId,
    3
  ]);

  assert.doesNotMatch(countCall.text, /\(created_at, id\) </);
  assert.deepEqual(countCall.params, ["seller-one"]);

  assert.deepEqual(page.items.map((product) => product.id), ["product-3", "product-2"]);
  assert.equal(page.hasMore, true);
  assert.equal(page.total, 9);
  assert.equal(page.nextCursor, "2026-06-24T18:00:00.000Z|product-2");
});

test("anonymous cursor pagination binds only item query cursor parameters", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("COUNT(*)")) {
        return { rows: [{ total: 1 }] };
      }
      return {
        rows: [{
          id: "product-1",
          name: "Only product",
          createdAt: new Date("2026-06-23T12:00:00.000Z"),
          updatedAt: new Date("2026-06-23T12:00:00.000Z"),
          images: []
        }]
      };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const page = await store.readProductsPage({
    limit: 12,
    cursor: "2026-06-24T12:00:00.000Z|product-cursor"
  });

  const itemsCall = calls.find((call) => call.text.includes("ORDER BY p.created_at DESC, p.id DESC"));
  const countCall = calls.find((call) => call.text.includes("COUNT(*)"));

  assert.match(itemsCall.text, /\(created_at, id\) < \(\$1::timestamptz, \$2::text\)/);
  assert.match(itemsCall.text, /LIMIT \$3/);
  assert.deepEqual(itemsCall.params, [
    "2026-06-24T12:00:00.000Z",
    "product-cursor",
    13
  ]);
  assert.doesNotMatch(countCall.text, /\(created_at, id\) </);
  assert.deepEqual(countCall.params, []);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, "");
});

test("PostgreSQL product pages expose compact demand summaries for ranking", async () => {
  const queryClient = {
    async query(text) {
      if (text.includes("COUNT(*)")) {
        return { rows: [{ total: 1 }] };
      }
      return {
        rows: [{
          id: "product-demand-1",
          name: "Sold out dress",
          createdAt: new Date("2026-06-30T12:00:00.000Z"),
          updatedAt: new Date("2026-06-30T12:00:00.000Z"),
          images: [],
          demandTotalDemand: 4,
          demandWaitingUsers: 3,
          demandRestockInterest: 2,
          demandScore: 19,
          demandActionCounts: { want_back: 2, notify_when_available: 2 },
          demandTopColors: [{ color: "white", count: 3 }],
          demandTopSizes: [{ size: "M", count: 2 }],
          demandLastDemandAt: new Date("2026-06-30T13:00:00.000Z")
        }]
      };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const page = await store.readProductsPage({ limit: 12 });

  assert.equal(page.items[0].demandSummary.waitingUsers, 3);
  assert.equal(page.items[0].demandSummary.restockInterest, 2);
  assert.equal(page.items[0].demandSummary.topColors[0].color, "white");
  assert.equal(page.items[0].demandSummary.lastDemandAt, "2026-06-30T13:00:00.000Z");
});

test("product query filters share stable count predicates without cursor leakage", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      return text.includes("COUNT(*)")
        ? { rows: [{ total: 4 }] }
        : { rows: [] };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  await store.readProductsPage({
    limit: 12,
    cursor: "2026-06-24T12:00:00.000Z|product-cursor",
    query: "simu",
    category: "electronics",
    seller: "seller-one"
  });

  const itemsCall = calls.find((call) => call.text.includes('ORDER BY "searchRank" DESC, p.created_at DESC, p.id DESC'));
  const countCall = calls.find((call) => call.text.includes("COUNT(*)"));

  assert.match(itemsCall.text, /p\.search_vector @@ plainto_tsquery\('simple', \$1\)/);
  assert.match(itemsCall.text, /ts_rank_cd\(p\.search_vector, plainto_tsquery\('simple', \$1\)\)::float8 AS "searchRank"/);
  assert.match(itemsCall.text, /ORDER BY "searchRank" DESC, p\.created_at DESC, p\.id DESC/);
  assert.match(itemsCall.text, /category = \$2 OR category LIKE \$3/);
  assert.match(itemsCall.text, /uploaded_by = \$4/);
  assert.match(itemsCall.text, /cursor_product\.id = \$6::text/);
  assert.match(itemsCall.text, /\$5::timestamptz,\s+\$6::text/);
  assert.match(itemsCall.text, /LIMIT \$7/);
  assert.deepEqual(itemsCall.params, [
    "simu",
    "electronics",
    "electronics-%",
    "seller-one",
    "2026-06-24T12:00:00.000Z",
    "product-cursor",
    13
  ]);
  assert.doesNotMatch(countCall.text, /\(created_at, id\) </);
  assert.deepEqual(countCall.params, [
    "simu",
    "electronics",
    "electronics-%",
    "seller-one"
  ]);
});

test("PostgreSQL product full-text search migration maintains a weighted GIN-indexed vector", () => {
  const migration = MIGRATIONS.find((candidate) => candidate.id === "2026082401_product_full_text_search");

  assert.ok(migration);
  const sql = migration.statements.join("\n");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS search_vector tsvector/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION winga_products_search_vector_update\(\)/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF name, category, shop, uploaded_by/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_products_search\s+ON products USING GIN \(search_vector\)/);
});

test("PostgreSQL API rate limiter uses atomic shared buckets", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("INSERT INTO api_rate_limit_buckets")) {
        return {
          rows: [{
            count: 4,
            expiresAt: new Date("2026-07-19T12:01:00.000Z")
          }]
        };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const result = await store.recordApiRateLimitHit("rate-limit-key", {
    limit: 3,
    windowMs: 60000,
    scope: "/api/auth/login",
    now: new Date("2026-07-19T12:00:15.000Z").getTime()
  });

  assert.equal(result.limited, true);
  assert.equal(result.count, 4);
  assert.equal(result.limit, 3);
  assert.equal(result.remaining, 0);
  assert.equal(result.retryAfterSeconds, 45);
  assert.equal(result.resetAt, "2026-07-19T12:01:00.000Z");
  assert.match(calls[0].text, /INSERT INTO api_rate_limit_buckets/);
  assert.match(calls[0].text, /ON CONFLICT \(key_hash, bucket_id\)/);
  assert.match(calls[0].text, /count = api_rate_limit_buckets\.count \+ 1/);
  assert.deepEqual(calls[0].params.slice(0, 3), [
    "rate-limit-key",
    29741040,
    "/api/auth/login"
  ]);
});

test("PostgreSQL intelligence persistence appends events and upserts score tables", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      return { rows: [] };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  await store.appendIntelligenceEvent({
    eventId: "intel-test-1",
    eventType: "product_purchased",
    sourceEvent: "order_created",
    timestamp: "2026-06-30T09:00:00.000Z",
    productId: "product-1",
    sellerId: "seller-1",
    buyerId: "buyer-1",
    sessionId: "session-1",
    feedContext: "home-feed",
    location: "TZ",
    deviceType: "mobile",
    appVersion: "20260630090000",
    level: "info",
    category: "orders",
    alertSeverity: "low",
    metadata: { surface: "home-feed" },
    platformVersion: "2026-06-30.1"
  }, {
    productScore: {
      id: "product-1",
      score: 12,
      signals: { product_purchased: 1 },
      firstSeenAt: "2026-06-30T09:00:00.000Z",
      lastSeenAt: "2026-06-30T09:00:00.000Z"
    },
    sellerScore: {
      id: "seller-1",
      score: 5,
      signals: { product_purchased: 1 },
      firstSeenAt: "2026-06-30T09:00:00.000Z",
      lastSeenAt: "2026-06-30T09:00:00.000Z"
    }
  });

  assert.equal(calls.length, 3);
  assert.match(calls[0].text, /INSERT INTO intelligence_events/);
  assert.match(calls[0].text, /ON CONFLICT \(event_id\) DO NOTHING/);
  assert.deepEqual(calls[0].params.slice(0, 6), [
    "intel-test-1",
    "product_purchased",
    "order_created",
    "2026-06-30T09:00:00.000Z",
    "product-1",
    "seller-1"
  ]);
  assert.match(calls[1].text, /INSERT INTO product_intelligence_scores/);
  assert.match(calls[1].text, /ON CONFLICT \(product_id\) DO UPDATE SET/);
  assert.equal(calls[1].params[0], "product-1");
  assert.match(calls[2].text, /INSERT INTO seller_intelligence_scores/);
  assert.match(calls[2].text, /ON CONFLICT \(seller_id\) DO UPDATE SET/);
  assert.equal(calls[2].params[0], "seller-1");
});

test("PostgreSQL intelligence summary reads dedicated intelligence tables", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("FROM intelligence_events")) {
        return { rows: [{ eventType: "product_purchased", count: 2 }] };
      }
      if (text.includes("FROM product_intelligence_scores")) {
        return { rows: [{ id: "product-1", score: 12, signals: { product_purchased: 2 }, lastSeenAt: new Date("2026-06-30T09:00:00.000Z") }] };
      }
      if (text.includes("FROM seller_intelligence_scores")) {
        return { rows: [{ id: "seller-1", score: 5, signals: { product_purchased: 2 }, lastSeenAt: new Date("2026-06-30T09:00:00.000Z") }] };
      }
      if (text.includes("FROM intelligence_daily_snapshots")) {
        return { rows: [{ snapshotType: "event_type", snapshotKey: "product_purchased", count: 2, score: 2, metric: { lastMetric: {} }, updatedAt: new Date("2026-06-30T10:00:00.000Z") }] };
      }
      return { rows: [] };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const summary = await store.readIntelligenceSummary(5);

  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call.params), [[5], [5], [5], ["14", 5]]);
  assert.equal(summary.topEventTypes[0].eventType, "product_purchased");
  assert.equal(summary.topProducts[0].id, "product-1");
  assert.equal(summary.topSellers[0].id, "seller-1");
  assert.equal(summary.trendSnapshots[0].snapshotType, "event_type");
});

test("PostgreSQL intelligence retention prunes raw events without deleting summaries", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      return { rows: [], rowCount: 2 };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const result = await store.pruneIntelligenceRawEvents({
    intelligenceDays: 90,
    demandDays: 365,
    searchDays: 120
  });

  assert.equal(result.intelligenceEvents, 2);
  assert.equal(result.demandEvents, 2);
  assert.equal(result.searchDemandEvents, 2);
  assert.deepEqual(result.retentionDays, {
    intelligence: 90,
    demand: 365,
    search: 120
  });
  assert.match(calls[0].text, /DELETE FROM intelligence_events/);
  assert.match(calls[1].text, /DELETE FROM demand_events/);
  assert.match(calls[2].text, /DELETE FROM search_demand_events/);
  assert.equal(calls[0].params[0], "90");
  assert.equal(calls[1].params[0], "365");
  assert.equal(calls[2].params[0], "120");
  assert.equal(calls.some((call) => /DELETE FROM product_intelligence_scores|DELETE FROM seller_intelligence_scores|DELETE FROM product_demand_summaries/.test(call.text)), false);
});

test("PostgreSQL intelligence init creates time-only indexes for global raw event scans", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "backend", "db.js"), "utf8");

  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_intelligence_events_happened_at\s+ON intelligence_events \(happened_at DESC\)/);
  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_demand_events_created_at\s+ON demand_events \(created_at DESC\)/);
  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_search_demand_events_happened_at\s+ON search_demand_events \(happened_at DESC\)/);
});

test("PostgreSQL intelligence init creates partial indexes for global queue health", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "backend", "db.js"), "utf8");

  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_intelligence_event_queue_pending_created\s+ON intelligence_event_queue \(created_at, queue_id\)\s+WHERE status = 'pending'/);
  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_intelligence_event_queue_failed_updated\s+ON intelligence_event_queue \(updated_at, queue_id\)\s+WHERE status = 'failed'/);
  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_intelligence_event_queue_processing_locked\s+ON intelligence_event_queue \(locked_at, queue_id\)\s+WHERE status = 'processing'/);
  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_intelligence_event_queue_completed_processed\s+ON intelligence_event_queue \(processed_at, queue_id\)\s+WHERE status = 'completed'/);
  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_intelligence_event_queue_dead_updated\s+ON intelligence_event_queue \(updated_at, queue_id\)\s+WHERE status = 'dead'/);
  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_intelligence_event_queue_updated_at\s+ON intelligence_event_queue \(updated_at DESC\)/);
  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_intelligence_event_queue_attempts\s+ON intelligence_event_queue \(attempts DESC\)/);
  assert.doesNotMatch(source, /GROUP BY status/);
});

test("PostgreSQL intelligence snapshots aggregate raw signals before pruning", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("FROM intelligence_daily_snapshots") && text.includes("GROUP BY snapshot_type")) {
        return {
          rows: [{
            snapshotType: "search_query",
            snapshotKey: "white-dress",
            count: 3,
            score: 9,
            metric: { lastMetric: { query: "white dress" } },
            updatedAt: new Date("2026-07-06T09:00:00.000Z")
          }]
        };
      }
      return { rows: [], rowCount: 2 };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const refresh = await store.refreshIntelligenceDailySnapshots({
    windowDays: 10,
    retentionDays: 365
  });
  const summary = await store.readIntelligenceSnapshotSummary({ days: 7, limit: 5 });

  assert.equal(refresh.eventTypes, 2);
  assert.equal(refresh.demandProducts, 2);
  assert.equal(refresh.searchQueries, 2);
  assert.equal(refresh.prunedSnapshots, 2);
  assert.equal(refresh.windowDays, 10);
  assert.equal(refresh.retentionDays, 365);
  assert.match(calls[0].text, /INSERT INTO intelligence_daily_snapshots/);
  assert.match(calls[0].text, /FROM intelligence_events/);
  assert.match(calls[1].text, /FROM demand_events/);
  assert.match(calls[2].text, /FROM search_demand_events/);
  assert.match(calls[3].text, /DELETE FROM intelligence_daily_snapshots/);
  assert.deepEqual(calls.slice(0, 4).map((call) => call.params[0]), ["10", "10", "10", "365"]);
  assert.equal(summary[0].snapshotType, "search_query");
  assert.equal(summary[0].snapshotKey, "white-dress");
  assert.equal(summary[0].score, 9);
  assert.deepEqual(calls.at(-1).params, ["7", 5]);
});

test("PostgreSQL intelligence snapshot health compares aggregates with recent raw events", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("estimated_total_snapshots")) {
        return {
          rows: [{
            estimated_total_snapshots: 1200000
          }]
        };
      }
      if (text.includes("COUNT(*)::int AS recent_snapshots")) {
        return {
          rows: [{
            recent_snapshots: 5
          }]
        };
      }
      if (text.includes("ORDER BY updated_at DESC")) {
        return {
          rows: [{
            latest_snapshot_date: "2026-07-06",
            latest_updated_at: new Date("2026-07-06T10:00:00.000Z"),
            seconds_since_latest_update: 3600
          }]
        };
      }
      return {
        rows: [{
          intelligence_events: 4,
          demand_events: 2,
          search_demand_events: 3
        }]
      };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const health = await store.readIntelligenceSnapshotHealth({ windowDays: 10 });

  assert.equal(health.estimatedTotalSnapshots, 1200000);
  assert.equal(health.recentSnapshots, 5);
  assert.equal(health.recentRawEventCount, 9);
  assert.equal(health.recentRawEvents.intelligenceEvents, 4);
  assert.equal(health.latestSnapshotDate, "2026-07-06");
  assert.equal(health.latestUpdatedAt, "2026-07-06T10:00:00.000Z");
  assert.equal(health.secondsSinceLatestUpdate, 3600);
  assert.equal(health.windowDays, 10);
  assert.match(calls[0].text, /FROM pg_class/);
  assert.match(calls[0].text, /intelligence_daily_snapshots'::regclass/);
  assert.match(calls[1].text, /COUNT\(\*\)::int AS recent_snapshots/);
  assert.match(calls[1].text, /WHERE snapshot_date >=/);
  assert.match(calls[2].text, /ORDER BY updated_at DESC/);
  assert.match(calls[3].text, /FROM intelligence_events/);
  assert.match(calls[3].text, /FROM demand_events/);
  assert.match(calls[3].text, /FROM search_demand_events/);
  assert.deepEqual(calls.map((call) => call.params), [[], ["10"], [], ["10"]]);
});

test("PostgreSQL durable intelligence queue claims, retries, and completes jobs", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("INSERT INTO intelligence_event_queue")) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("RETURNING") && text.includes("q.queue_id")) {
        return {
          rows: [{
            queueId: 9,
            eventId: "intel-queued-1",
            event: { eventId: "intel-queued-1", eventType: "product_viewed" },
            scores: { productScore: { id: "product-1", score: 1 } },
            attempts: 2
          }]
        };
      }
      if (text.includes("oldest_pending_age_seconds")) {
        return {
          rows: [{
            pending: 3,
            processing: 0,
            failed: 1,
            completed: 2,
            dead: 0,
            oldest_pending_age_seconds: 360,
            oldest_failed_age_seconds: 120,
            oldest_processing_age_seconds: 0,
            seconds_since_last_completed: 18,
            last_completed_at: new Date("2026-07-05T08:00:00.000Z"),
            last_changed_at: new Date("2026-07-05T08:01:00.000Z"),
            max_attempts_seen: 2
          }]
        };
      }
      if (text.includes("event_payload->>'eventType'")) {
        return {
          rows: [
            {
              queue_id: 9,
              event_id: "intel-queued-1",
              status: "dead",
              attempts: 5,
              available_at: new Date("2026-07-05T08:00:00.000Z"),
              locked_at: null,
              locked_by: "",
              processed_at: null,
              last_error: "terminal",
              created_at: new Date("2026-07-05T07:00:00.000Z"),
              updated_at: new Date("2026-07-05T08:00:00.000Z"),
              event_type: "product_viewed",
              product_id: "product-1",
              seller_id: "seller-1",
              source_event: "product_viewed"
            }
          ]
        };
      }
      return { rows: [], rowCount: 1 };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const enqueueResult = await store.enqueueIntelligenceEvent({
    eventId: "intel-queued-1",
    eventType: "product_viewed"
  }, {
    productScore: { id: "product-1", score: 1 }
  });
  const jobs = await store.claimIntelligenceQueueBatch({ limit: 5, workerId: "worker-a" });
  await store.completeIntelligenceQueueItem(jobs[0].queueId);
  await store.failIntelligenceQueueItem(jobs[0].queueId, new Error("temporary"), { attempts: 2, maxAttempts: 5 });
  const recovery = await store.recoverStaleIntelligenceQueueJobs({ staleSeconds: 120 });
  const prune = await store.pruneCompletedIntelligenceQueueJobs({ retentionHours: 24 });
  const health = await store.readIntelligenceQueueHealth();
  const failedJobs = await store.readIntelligenceQueueJobs({ statuses: ["dead"], limit: 10 });
  const retry = await store.retryIntelligenceQueueItems([9, 9, "bad"]);
  const markedDead = await store.markIntelligenceQueueItemsDead([9], "manual stop");

  assert.equal(enqueueResult.enqueued, true);
  assert.match(calls[0].text, /INSERT INTO intelligence_event_queue/);
  assert.match(calls[0].text, /ON CONFLICT \(event_id\) DO NOTHING/);
  assert.match(calls[1].text, /FOR UPDATE SKIP LOCKED/);
  assert.equal(calls[1].params[0], 5);
  assert.equal(calls[1].params[1], "worker-a");
  assert.equal(jobs[0].eventId, "intel-queued-1");
  assert.match(calls[2].text, /status = 'completed'/);
  assert.match(calls[3].text, /status = \$2/);
  assert.match(calls[4].text, /Recovered stale processing job/);
  assert.equal(calls[4].params[0], "120");
  assert.match(calls[5].text, /DELETE FROM intelligence_event_queue/);
  assert.equal(calls[5].params[0], "24");
  assert.doesNotMatch(calls[6].text, /GROUP BY status/);
  assert.match(calls[6].text, /SELECT COUNT\(\*\)::int FROM intelligence_event_queue WHERE status = 'pending'/);
  assert.match(calls[6].text, /ORDER BY created_at ASC/);
  assert.match(calls[6].text, /ORDER BY updated_at ASC/);
  assert.match(calls[6].text, /ORDER BY locked_at ASC/);
  assert.match(calls[6].text, /ORDER BY processed_at DESC/);
  assert.equal(recovery.recovered, 1);
  assert.equal(prune.pruned, 1);
  assert.equal(health.pending, 3);
  assert.equal(health.failed, 1);
  assert.equal(health.dead, 0);
  assert.equal(health.oldestPendingAgeSeconds, 360);
  assert.equal(health.oldestFailedAgeSeconds, 120);
  assert.equal(health.secondsSinceLastCompleted, 18);
  assert.equal(health.maxAttemptsSeen, 2);
  assert.equal(failedJobs.items[0].queueId, 9);
  assert.equal(failedJobs.items[0].eventType, "product_viewed");
  assert.equal(failedJobs.items[0].productId, "product-1");
  assert.equal(failedJobs.items[0].eventPayload, undefined);
  assert.equal(retry.retried, 1);
  assert.equal(retry.requested, 1);
  assert.equal(markedDead.markedDead, 1);
  assert.match(calls.at(-2).text, /status = 'pending'/);
  assert.match(calls.at(-1).text, /status = 'dead'/);
});

test("PostgreSQL demand persistence dedupes events and refreshes seller summaries", async () => {
  const calls = [];
  const summaryRow = {
    productId: "product-demand-1",
    sellerId: "seller-1",
    totalDemand: 2,
    waitingUsers: 1,
    restockInterest: 1,
    demandScore: 7,
    actionCounts: { want_back: 1, show_similar: 1 },
    topColors: [{ color: "white", count: 1 }],
    topSizes: [{ size: "M", count: 1 }],
    firstDemandAt: new Date("2026-06-30T09:00:00.000Z"),
    lastDemandAt: new Date("2026-06-30T09:05:00.000Z"),
    updatedAt: new Date("2026-06-30T09:05:00.000Z")
  };
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("INSERT INTO demand_events")) {
        return { rowCount: 1, rows: [{ demand_id: "demand-1" }] };
      }
      if (text.includes("INSERT INTO product_demand_summaries")) {
        return { rows: [summaryRow] };
      }
      if (text.includes("FROM product_demand_summaries")) {
        return { rows: [summaryRow] };
      }
      return { rows: [] };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const result = await store.appendDemandEvent({
    demandId: "demand-1",
    dedupeKey: "dedupe-1",
    productId: "product-demand-1",
    sellerId: "seller-1",
    buyerId: "buyer-1",
    sessionId: "",
    action: "want_back",
    color: "white",
    size: "M",
    country: "TZ",
    region: "Dar es Salaam",
    demandScore: 6,
    metadata: { source: "product_detail" },
    createdAt: "2026-06-30T09:00:00.000Z"
  });

  assert.equal(result.inserted, true);
  assert.equal(result.summary.productId, "product-demand-1");
  assert.match(calls[0].text, /INSERT INTO demand_events/);
  assert.match(calls[0].text, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
  assert.equal(calls[0].params[1], "dedupe-1");
  assert.match(calls[1].text, /INSERT INTO product_demand_summaries/);
  assert.match(calls[1].text, /COUNT\(DISTINCT/);

  const sellerSummary = await store.readSellerDemandSummary("seller-1", 5);
  assert.equal(sellerSummary[0].sellerId, "seller-1");
  assert.equal(sellerSummary[0].waitingUsers, 1);
  assert.deepEqual(calls.at(-1).params, ["seller-1", 5]);
});

test("PostgreSQL search demand persistence stores anonymous events and reads aggregate opportunities", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes("INSERT INTO search_demand_events")) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("GROUP BY query, query_key") && text.includes("zero_result IS TRUE")) {
        return {
          rows: [{
            query: "white dress",
            queryKey: "white-dress",
            category: "fashion-dress",
            location: "dar-es-salaam",
            searches: 2
          }]
        };
      }
      if (text.includes("GROUP BY query, query_key") && text.includes("result_count BETWEEN 1 AND 3")) {
        return {
          rows: [{
            query: "linen shirt",
            queryKey: "linen-shirt",
            category: "mens-shirts",
            searches: 3
          }]
        };
      }
      if (text.includes("MAX(detected_category)")) {
        return {
          rows: [{
            query: "white dress",
            queryKey: "white-dress",
            category: "fashion-dress",
            location: "dar-es-salaam",
            searches: 4,
            score: 7
          }]
        };
      }
      if (text.includes("detected_category AS category")) {
        return { rows: [{ category: "fashion-dress", searches: 4 }] };
      }
      if (text.includes("detected_color AS color")) {
        return { rows: [{ color: "white", searches: 4 }] };
      }
      if (text.includes("location AS region")) {
        return { rows: [{ region: "dar-es-salaam", searches: 4 }] };
      }
      return { rows: [] };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient
  });

  const insertResult = await store.appendSearchDemandEvents([{
    eventId: "search-event-1",
    dedupeKey: "search-dedupe-1",
    timestamp: "2026-07-04T09:00:00.000Z",
    query: "white dress",
    queryKey: "white-dress",
    detectedCategory: "fashion-dress",
    detectedColor: "white",
    location: "dar-es-salaam",
    source: "text",
    resultCount: 0,
    zeroResult: true,
    noClick: true,
    metadata: { anonymous: true }
  }]);
  const summary = await store.readSearchDemandSummary(5);

  assert.equal(insertResult.inserted, 1);
  assert.match(calls[0].text, /INSERT INTO search_demand_events/);
  assert.match(calls[0].text, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
  assert.equal(calls[0].params[0], "search-event-1");
  assert.equal(calls[0].params[1], "search-dedupe-1");
  assert.equal(calls[0].params[4], "white-dress");
  assert.equal(summary.privacy, "anonymous-aggregate-only");
  assert.equal(summary.trendingSearches[0].queryKey, "white-dress");
  assert.equal(summary.zeroResultOpportunities[0].opportunity, "high");
  assert.equal(summary.lowSupplyOpportunities[0].supply, "low");
  assert.equal(summary.regionalDemand[0].region, "dar-es-salaam");
});
test("PostgreSQL locale preferences use one versioned upsert and detect conflicts", async () => {
  const calls = [];
  let conflictMode = false;
  const queryClient = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      if (String(text).includes("SELECT language")) {
        return { rows: [{ language: "sw-TZ", useDeviceLanguage: false, currency: "TZS", timezone: "Africa/Dar_es_Salaam", rowVersion: 3, updatedAt: "2026-07-26T00:00:00.000Z" }] };
      }
      if (String(text).includes("INSERT INTO user_locale_preferences")) {
        if (conflictMode) return { rows: [], rowCount: 0 };
        return { rows: [{ language: "fr-FR", useDeviceLanguage: false, currency: "EUR", timezone: "Europe/Paris", rowVersion: 4, updatedAt: "2026-07-26T01:00:00.000Z" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  const store = createPostgresStore({ databaseUrl: "postgres://test.invalid/winga", queryClient });
  const current = await store.readUserLocalePreference("buyer");
  const saved = await store.saveUserLocalePreference("buyer", {
    language: "fr-FR", useDeviceLanguage: false, currency: "EUR", timezone: "Europe/Paris"
  }, { expectedRowVersion: 3 });
  conflictMode = true;
  const conflict = await store.saveUserLocalePreference("buyer", {
    language: "ar-SA", useDeviceLanguage: false, currency: "SAR", timezone: "Asia/Riyadh"
  }, { expectedRowVersion: 3 });

  assert.equal(current.rowVersion, 3);
  assert.equal(saved.updated, true);
  assert.equal(saved.preference.rowVersion, 4);
  assert.equal(conflict.updated, false);
  assert.equal(conflict.conflict, true);
  const upsert = calls.find((call) => call.text.includes("INSERT INTO user_locale_preferences"));
  assert.match(upsert.text, /ON CONFLICT \(username\) DO UPDATE/);
  assert.match(upsert.text, /user_locale_preferences\.row_version = \$6::bigint/);
  assert.equal(upsert.params[0], "buyer");
  assert.equal(upsert.params[5], 3);
});
test("PostgreSQL refund request atomically creates an idempotent provider outbox job", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM payment_reconciliation_cases prc") && sql.includes("FOR UPDATE OF prc")) {
        return { rows: [{
          id: "late_payment:pay-1", orderId: "order-1", paymentId: "pay-1",
          transactionReference: "TX-1", amount: 25000, paymentProvider: "flutterwave",
          rawGatewayResponse: { data: { id: 88442211 } },
          status: "in_review", rowVersion: 7
        }], rowCount: 1 };
      }
      if (sql.includes("UPDATE payment_reconciliation_cases")) {
        return { rows: [{
          id: "late_payment:pay-1", orderId: "order-1", paymentId: "pay-1",
          status: "refund_pending", assignedTo: "admin", resolution: { action: "request_refund" },
          resolvedBy: "", resolvedAt: null, updatedAt: new Date("2026-08-13T20:00:00.000Z"), rowVersion: 8
        }], rowCount: 1 };
      }
      return { rows: [], rowCount: sql.includes("INSERT INTO payment_refund_outbox") ? 1 : 0 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.transitionPaymentReconciliationCase("late_payment:pay-1", {
    status: "refund_pending", actor: "admin", expectedVersion: 7,
    resolution: { action: "request_refund", note: "Return late payment" }
  });

  assert.equal(result.updated, true);
  assert.equal(result.item.refundRequestId, "refund:late_payment:pay-1");
  const outboxCall = calls.find((call) => call.text.includes("INSERT INTO payment_refund_outbox"));
  assert.ok(outboxCall);
  assert.match(outboxCall.text, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
  assert.equal(outboxCall.params[7], "refund:late_payment:pay-1");
  assert.equal(JSON.parse(outboxCall.params[8]).providerTransactionId, "88442211");
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL refund worker claims ready and stale jobs without cross-worker duplication", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      return { rows: [{
        id: "refund:case-1", reconciliationCaseId: "case-1", orderId: "order-1",
        paymentId: "pay-1", transactionReference: "TX-1", paymentProvider: "mpesa",
        amount: "25000.00", idempotencyKey: "refund:case-1",
        requestPayload: { schemaVersion: 1 }, attempts: 2, maxAttempts: 8
      }] };
    }
  };
  const store = createPostgresStore({ databaseUrl: "postgres://test.invalid/winga", queryClient });
  const jobs = await store.claimPaymentRefundBatch({ limit: 20, workerId: "instance-a" });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].amount, 25000);
  assert.equal(jobs[0].attempts, 2);
  assert.match(calls[0].text, /FOR UPDATE SKIP LOCKED/);
  assert.match(calls[0].text, /status = 'processing'.*processing_started_at/s);
  assert.match(calls[0].text, /processing_started_at < NOW\(\) - INTERVAL '15 minutes'/);
  assert.deepEqual(calls[0].params, [20, "instance-a"]);
});

test("PostgreSQL refund delivery uses bounded retry and never equates submission with confirmation", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      return { rows: [{ id: params[0], status: params[1], attempts: 3, maxAttempts: 8, nextAttemptAt: new Date("2026-08-13T20:15:00.000Z") }] };
    }
  };
  const store = createPostgresStore({ databaseUrl: "postgres://test.invalid/winga", queryClient });
  const submitted = await store.completePaymentRefundDelivery("refund:case-1", {
    submitted: true, providerRefundId: "provider-1", providerResponse: { accepted: true }, attempts: 3, maxAttempts: 8
  });
  const failed = await store.completePaymentRefundDelivery("refund:case-2", {
    submitted: false, error: "timeout", attempts: 3, maxAttempts: 8
  });
  const confirmationTimedOut = await store.completePaymentRefundDelivery("refund:case-3", {
    submitted: true, providerRefundId: "provider-3", attempts: 8, maxAttempts: 8
  });

  assert.equal(submitted.status, "submitted");
  assert.equal(failed.status, "failed");
  assert.equal(confirmationTimedOut.status, "confirmation_timeout");
  assert.match(calls[0].text, /WHEN \$2 = 'submitted' THEN NOW\(\) \+ INTERVAL '15 minutes'/);
  assert.equal(calls[1].params[5], 60);
  assert.equal(calls.some((call) => call.text.includes("UPDATE payment_reconciliation_cases")), false);
});

test("PostgreSQL confirmed refund callback resolves reconciliation exactly once", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("FROM payment_refund_outbox") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: "refund:case-1",
            reconciliationCaseId: "case-1",
            orderId: "order-1",
            paymentId: "payment-1",
            status: "submitted"
          }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.applyPaymentRefundResult("refund:case-1", {
    status: "confirmed", providerRefundId: "provider-refund-1", providerResponse: { status: "confirmed" }
  });

  assert.equal(result.updated, true);
  assert.equal(result.confirmed, true);
  const caseUpdate = calls.find((call) => call.text.includes("UPDATE payment_reconciliation_cases"));
  assert.ok(caseUpdate);
  assert.match(caseUpdate.text, /status = 'resolved'/);
  assert.match(caseUpdate.params[1], /"outcome":"refunded"/);
  const paymentUpdate = calls.find((call) => call.text.includes("UPDATE payments SET payment_status = 'refunded'"));
  assert.ok(paymentUpdate);
  assert.deepEqual(paymentUpdate.params, ["payment-1"]);
  const orderUpdate = calls.find((call) => call.text.includes("UPDATE orders SET status = 'cancelled', payment_status = 'refunded'"));
  assert.ok(orderUpdate);
  assert.deepEqual(orderUpdate.params, ["order-1"]);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL message events publish after persistence and reach a dedicated listener", async () => {
  const { EventEmitter } = require("node:events");
  const calls = [];
  const queryClient = {
    async connect() { return this; },
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      if (String(text).includes("COUNT(*)::int")) return { rows: [{ burstCount: 0, duplicate: false }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const listener = new EventEmitter();
  listener.connect = async () => {};
  listener.query = async (text) => { calls.push({ text: String(text), params: [] }); return { rows: [] }; };
  listener.end = async () => {};
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient,
    listenClientFactory: () => listener
  });
  const received = [];
  const subscription = store.subscribeToMessageEvents((event) => received.push(event));
  await subscription.ready;
  assert.equal(calls.some((call) => call.text === "LISTEN winga_messages"), true);

  const message = { id: "message-live-1", senderId: "seller", receiverId: "buyer", message: "Hello", productItems: [], createdAt: new Date().toISOString() };
  const notification = { id: "notification-live-1", userId: "buyer", messageId: message.id };
  const result = await store.createMessageWithNotification(message, notification);
  assert.equal(result.created, true);
  const notifyCall = calls.find((call) => call.text.includes("pg_notify('winga_messages'"));
  assert.ok(notifyCall);
  listener.emit("notification", { channel: "winga_messages", payload: notifyCall.params[0] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(received[0].message.id, message.id);
  await store.close();
  assert.equal(listener.listenerCount("notification"), 0);
});

test("PostgreSQL read replica serves public catalog reads while strong reads stay primary", async () => {
  const primaryCalls = [];
  const replicaCalls = [];
  const primary = {
    async query(text, params = []) {
      const sql = String(text);
      primaryCalls.push({ text: sql, params });
      if (sql.includes("COUNT(*)")) return { rows: [{ total: 0 }] };
      if (sql.includes("FROM users")) return { rows: [{ username: "buyer-one", sharedPhoneViewerIds: [] }] };
      return { rows: [], rowCount: 0 };
    }
  };
  const replica = {
    async query(text, params = []) {
      replicaCalls.push({ text: String(text), params });
      if (String(text).includes("COUNT(*)")) return { rows: [{ total: 0 }] };
      return { rows: [], rowCount: 0 };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://primary.invalid/winga",
    queryClient: primary,
    readQueryClient: replica,
    readReplicaDatabaseUrl: "postgres://replica.invalid/winga"
  });

  await store.readStore(["categories", "products", "users"]);
  assert.equal(replicaCalls.some((call) => call.text.includes("FROM categories")), true);
  assert.equal(replicaCalls.some((call) => call.text.includes("FROM products")), true);
  assert.equal(primaryCalls.some((call) => call.text.includes("FROM users")), true);

  primaryCalls.length = 0;
  replicaCalls.length = 0;
  await store.readProductsPage({ limit: 12 });
  assert.equal(replicaCalls.length, 2);
  assert.equal(primaryCalls.length, 0);
  const healthyReplica = store.getReadReplicaHealth();
  assert.equal(healthyReplica.status, "ready");
  assert.equal(healthyReplica.metrics.attempts, 4);
  assert.equal(healthyReplica.metrics.successes, 4);
  assert.equal(healthyReplica.metrics.failures, 0);
  assert.equal(JSON.stringify(healthyReplica).includes("replica.invalid"), false);

  primaryCalls.length = 0;
  replicaCalls.length = 0;
  await store.readProductsPage({ limit: 12, usePrimary: true, viewerUsername: "buyer-one" });
  assert.equal(primaryCalls.length, 2);
  assert.equal(replicaCalls.length, 0);
});
test("PostgreSQL read replica fails open to primary without interrupting public pagination", async () => {
  const primaryCalls = [];
  const primary = {
    async query(text, params = []) {
      const sql = String(text);
      primaryCalls.push({ text: sql, params });
      if (sql.includes("COUNT(*)")) return { rows: [{ total: 0 }] };
      return { rows: [], rowCount: 0 };
    }
  };
  const replica = {
    async query() {
      throw new Error("replica unavailable");
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://primary.invalid/winga",
    queryClient: primary,
    readQueryClient: replica
  });

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const page = await store.readProductsPage({ limit: 12 });
    assert.deepEqual(page.items, []);
    assert.equal(page.hasMore, false);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(primaryCalls.length, 2);
  assert.equal(warnings.some((message) => message.includes("Read replica unavailable")), true);
  const degradedReplica = store.getReadReplicaHealth();
  assert.equal(degradedReplica.status, "degraded");
  assert.equal(degradedReplica.cooldownActive, true);
  assert.equal(degradedReplica.metrics.failures, 2);
  assert.equal(degradedReplica.metrics.fallbackReads, 2);
  assert.equal(degradedReplica.metrics.lastFailureCode, "read_replica_error");
});
test("PostgreSQL database health reports slow queries and live pool saturation without SQL details", async () => {
  const primary = {
    totalCount: 20,
    idleCount: 0,
    waitingCount: 2,
    async query(text) {
      await new Promise((resolve) => setTimeout(resolve, 110));
      if (String(text).includes("COUNT(*)")) return { rows: [{ total: 0 }] };
      return { rows: [], rowCount: 0 };
    }
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://primary.invalid/winga",
    queryClient: primary,
    slowQueryThreshold: 100
  });

  await store.readProductsPage({ limit: 12, usePrimary: true });
  const health = store.getDatabaseHealth();
  assert.equal(health.status, "degraded");
  assert.equal(health.slowQueryThresholdMs, 100);
  assert.equal(health.primary.pool.saturated, true);
  assert.equal(health.primary.pool.waitingClients, 2);
  assert.equal(health.primary.metrics.queries, 2);
  assert.equal(health.primary.metrics.slowQueries, 2);
  assert.equal(JSON.stringify(health).includes("SELECT"), false);
  assert.equal(JSON.stringify(health).includes("primary.invalid"), false);
});
test("PostgreSQL read replica pool errors activate primary fallback without crashing", () => {
  const { EventEmitter } = require("node:events");
  const replica = new EventEmitter();
  replica.query = async () => ({ rows: [], rowCount: 0 });
  const primary = { query: async () => ({ rows: [], rowCount: 0 }) };
  const store = createPostgresStore({
    databaseUrl: "postgres://primary.invalid/winga",
    queryClient: primary,
    readQueryClient: replica
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const poolError = new Error("replica idle connection failed");
    poolError.code = "ECONNRESET";
    replica.emit("error", poolError);
  } finally {
    console.error = originalError;
  }
  const health = store.getReadReplicaHealth();
  assert.equal(health.status, "degraded");
  assert.equal(health.cooldownActive, true);
  assert.equal(health.metrics.poolErrors, 1);
  assert.equal(health.metrics.lastPoolErrorCode, "ECONNRESET");
});

test("PostgreSQL video upload intents preserve owner scope and webhook state", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("INSERT INTO video_upload_intents")) {
        return { rows: [{ providerId: params[0], sellerId: params[1], uploadId: params[2], status: "uploading", rowVersion: 1 }], rowCount: 1 };
      }
      if (sql.includes("SELECT provider_id") && sql.includes("video_upload_intents")) {
        return { rows: [{ providerId: params[0], sellerId: params[1], status: "uploading", rowVersion: 1 }], rowCount: 1 };
      }
      if (sql.includes("UPDATE video_upload_intents")) {
        return { rows: [{ providerId: params[0], sellerId: "seller-one", status: params[1], rowVersion: 2 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  const store = createPostgresStore({ databaseUrl: "postgres://primary.invalid/winga", queryClient });
  const created = await store.createVideoUploadIntent({
    providerId: "stream-video-123",
    sellerId: "seller-one",
    uploadId: "upload-one",
    uploadExpiresAt: "2026-08-30T12:00:00.000Z"
  });
  const owned = await store.readVideoUploadIntent("stream-video-123", "seller-one");
  const updated = await store.applyVideoUploadWebhook({
    providerId: "stream-video-123",
    status: "ready",
    duration: 12.5,
    width: 1080,
    height: 1920,
    posterUrl: "https://video.example/thumb.jpg",
    hlsUrl: "https://video.example/manifest.m3u8",
    providerPayload: { readyToStream: true }
  });

  assert.equal(created.status, "uploading");
  assert.equal(owned.sellerId, "seller-one");
  assert.equal(updated.status, "ready");
  const ownerRead = calls.find((call) => call.text.includes("SELECT provider_id") && call.text.includes("video_upload_intents"));
  assert.match(ownerRead.text, /seller_id = \$2/);
  assert.deepEqual(ownerRead.params, ["stream-video-123", "seller-one"]);
  const webhookUpdate = calls.find((call) => call.text.includes("UPDATE video_upload_intents"));
  assert.equal(webhookUpdate.params[1], "ready");
  assert.equal(JSON.parse(webhookUpdate.params[10]).readyToStream, true);
});
test("PostgreSQL playable video lookup preserves public product visibility context", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      return {
        rows: [{
          providerId: params[0], sellerId: "seller-one", status: "ready",
          productId: "product-video-1", claimedAt: "2026-08-30T12:00:00.000Z",
          productStatus: "approved"
        }],
        rowCount: 1
      };
    }
  };
  const store = createPostgresStore({ databaseUrl: "postgres://primary.invalid/winga", queryClient });
  const playable = await store.readPlayableVideo("stream-video-123");

  assert.equal(playable.productStatus, "approved");
  assert.equal(playable.productId, "product-video-1");
  assert.match(calls[0].text, /LEFT JOIN products p ON p\.id = vui\.product_id/);
  assert.deepEqual(calls[0].params, ["stream-video-123"]);
});
test("PostgreSQL video pipeline health is durable, aggregate-only, and threshold aware", async () => {
  const calls = [];
  const queryClient = {
    async query(text, params = []) {
      calls.push({ text: String(text), params });
      return {
        rows: [{
          total: 40, uploading: 2, processing: 3, ready: 30, failed: 5, failedRecent: 2, failedRecent: 2,
          readyUnclaimed: 4, stalled: 1, oldestPendingAgeSeconds: 1200.5,
          averageReadyLatencySeconds: 42.25, lastChangedAt: "2026-08-30T15:00:00.000Z"
        }],
        rowCount: 1
      };
    }
  };
  const store = createPostgresStore({ databaseUrl: "postgres://primary.invalid/winga", queryClient });
  const health = await store.readVideoPipelineHealth({ processingAgeSeconds: 600 });

  assert.deepEqual(health, {
    total: 40, uploading: 2, processing: 3, ready: 30, failed: 5, failedRecent: 2,
    readyUnclaimed: 4, stalled: 1, oldestPendingAgeSeconds: 1200.5,
    averageReadyLatencySeconds: 42.25, lastChangedAt: "2026-08-30T15:00:00.000Z"
  });
  assert.match(calls[0].text, /COUNT\(\*\) FILTER \(WHERE status = 'processing'\)/);
  assert.match(calls[0].text, /updated_at < NOW\(\) - \(\$1::int \* INTERVAL '1 second'\)/);
  assert.deepEqual(calls[0].params, [600]);
  assert.doesNotMatch(calls[0].text, /provider_id|seller_id|upload_id/);
});
test("PostgreSQL product create atomically claims only a ready seller-owned video", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("UPDATE video_upload_intents")) {
        return { rows: [{ provider_id: params[0] }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO products")) {
        return { rows: [{ rowVersion: 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  const result = await store.createProduct({
    id: "product-video-1",
    name: "Video dress",
    price: 25000,
    shop: "Seller",
    uploadedBy: "seller-one",
    category: "fashion",
    image: "https://example.com/dress.jpg",
    images: ["https://example.com/dress.jpg"],
    mediaItems: [
      { type: "image", url: "https://example.com/dress.jpg" },
      { type: "video", provider: "cloudflare-stream", providerId: "stream-video-ready", status: "ready" }
    ]
  });

  assert.deepEqual(result, { created: true, rowVersion: 1 });
  const claimIndex = calls.findIndex((call) => call.text.includes("UPDATE video_upload_intents"));
  const insertIndex = calls.findIndex((call) => call.text.includes("INSERT INTO products"));
  assert.equal(calls[0].text, "BEGIN");
  assert.ok(claimIndex > 0 && claimIndex < insertIndex);
  assert.match(calls[claimIndex].text, /seller_id = \$2 AND status = 'ready'/);
  assert.deepEqual(calls[claimIndex].params, ["stream-video-ready", "seller-one", "product-video-1"]);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("PostgreSQL product create rolls back when video claim is rejected", async () => {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      calls.push({ text: sql, params });
      if (sql.includes("UPDATE video_upload_intents")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };
  const store = createPostgresStore({
    databaseUrl: "postgres://test.invalid/winga",
    queryClient: { query: client.query.bind(client), connect: async () => client }
  });

  await assert.rejects(
    store.createProduct({
      id: "product-video-rejected",
      name: "Rejected video dress",
      uploadedBy: "seller-one",
      category: "fashion",
      images: ["https://example.com/dress.jpg"],
      mediaItems: [
        { type: "image", url: "https://example.com/dress.jpg" },
        { type: "video", provider: "cloudflare-stream", providerId: "stream-video-other-owner", status: "ready" }
      ]
    }),
    (error) => error?.code === "VIDEO_CLAIM_REJECTED"
  );

  assert.equal(calls.some((call) => call.text.includes("INSERT INTO products")), false);
  assert.equal(calls.at(-1).text, "ROLLBACK");
});
