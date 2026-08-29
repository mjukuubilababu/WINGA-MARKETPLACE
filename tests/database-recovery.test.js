"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  REQUIRED_TABLES,
  assertRecoveryTarget,
  parseDatabaseName,
  validateRecoveryDatabase
} = require("../scripts/verify-database-recovery");

test("recovery validator accepts only explicitly isolated database targets", () => {
  assert.equal(parseDatabaseName("postgresql://user:secret@db.example.com/winga_recovery_20260829"), "winga_recovery_20260829");
  assert.equal(
    assertRecoveryTarget(
      "postgresql://user:secret@db.example.com/winga_recovery_20260829",
      "winga_recovery_20260829"
    ),
    "winga_recovery_20260829"
  );
  assert.throws(
    () => assertRecoveryTarget("postgresql://user:secret@db.example.com/winga"),
    /does not look isolated/
  );
  assert.throws(
    () => assertRecoveryTarget("postgresql://user:secret@db.example.com/winga_restore", "different_restore"),
    /does not match/
  );
});

test("recovery validator reports aggregate counts and rejects missing tables", async () => {
  const healthyClient = {
    async query(text) {
      if (String(text).includes("to_regclass")) {
        return { rows: REQUIRED_TABLES.map((name) => ({ name, present: true })) };
      }
      if (String(text).includes("orphan_orders")) {
        return { rows: [{ orphan_orders: 0, orphan_payments: 0, orphan_sessions: 0 }] };
      }
      return { rows: [{ value: 3 }] };
    }
  };
  const report = await validateRecoveryDatabase(healthyClient, "winga_restore");
  assert.equal(report.requiredTables, REQUIRED_TABLES.length);
  assert.equal(report.migrationCount, 3);
  assert.equal(report.counts.products, 3);
  assert.deepEqual(report.integrity, { orphanOrders: 0, orphanPayments: 0, orphanSessions: 0 });

  const incompleteClient = {
    async query(text) {
      if (String(text).includes("to_regclass")) {
        return { rows: REQUIRED_TABLES.map((name) => ({ name, present: name !== "orders" })) };
      }
      return { rows: [] };
    }
  };
  await assert.rejects(
    () => validateRecoveryDatabase(incompleteClient, "winga_restore"),
    /missing required tables: orders/
  );
});

test("recovery validator rejects restored data with orphaned commerce records", async () => {
  const client = {
    async query(text) {
      if (String(text).includes("to_regclass")) {
        return { rows: REQUIRED_TABLES.map((name) => ({ name, present: true })) };
      }
      if (String(text).includes("orphan_orders")) {
        return { rows: [{ orphan_orders: 1, orphan_payments: 0, orphan_sessions: 0 }] };
      }
      return { rows: [{ value: 1 }] };
    }
  };
  await assert.rejects(
    () => validateRecoveryDatabase(client, "winga_restore"),
    /orphanOrders=1/
  );
});

