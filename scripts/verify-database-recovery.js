#!/usr/bin/env node
"use strict";

const { Pool } = require("pg");

const REQUIRED_TABLES = Object.freeze([
  "schema_migrations",
  "users",
  "products",
  "sessions",
  "orders",
  "payments",
  "messages",
  "notifications",
  "audit_logs"
]);

function readEnv(name, fallback = "") {
  return String(process.env[name] || fallback || "").trim();
}

function parseDatabaseName(connectionString) {
  try {
    const parsed = new URL(connectionString);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, "")).trim();
  } catch (_error) {
    return "";
  }
}

function assertRecoveryTarget(connectionString, expectedName = "", allowUnsafe = false) {
  const databaseName = parseDatabaseName(connectionString);
  if (!databaseName) throw new Error("RECOVERY_DATABASE_URL must contain a valid database name.");
  if (expectedName && databaseName !== expectedName) {
    throw new Error("Recovery target database name does not match RECOVERY_EXPECTED_DATABASE.");
  }
  if (!allowUnsafe && !/(recovery|restore|drill|clone)/i.test(databaseName)) {
    throw new Error("Recovery validation refuses a target whose database name does not look isolated.");
  }
  return databaseName;
}

async function queryScalar(client, text, params = []) {
  const result = await client.query(text, params);
  return Number(result.rows[0]?.value || 0);
}

async function validateRecoveryDatabase(client, databaseName) {
  const tableResult = await client.query(
    `SELECT required.name,
            to_regclass('public.' || required.name) IS NOT NULL AS present
       FROM unnest($1::text[]) AS required(name)
       ORDER BY required.name ASC`,
    [REQUIRED_TABLES]
  );
  const missingTables = tableResult.rows
    .filter((row) => !row.present)
    .map((row) => String(row.name));
  if (missingTables.length) {
    throw new Error(`Recovery target is missing required tables: ${missingTables.join(", ")}`);
  }

  const counts = {};
  for (const table of ["schema_migrations", "users", "products", "orders", "payments", "messages"]) {
    counts[table] = await queryScalar(client, `SELECT COUNT(*)::bigint AS value FROM ${table}`);
  }
  const integrityResult = await client.query(
    `SELECT
       (SELECT COUNT(*)::bigint
          FROM orders o
          LEFT JOIN products p ON p.id = o.product_id
         WHERE p.id IS NULL) AS orphan_orders,
       (SELECT COUNT(*)::bigint
          FROM payments pay
          LEFT JOIN orders o ON o.id = pay.order_id
         WHERE o.id IS NULL) AS orphan_payments,
       (SELECT COUNT(*)::bigint
          FROM sessions s
          LEFT JOIN users u ON u.username = s.username
         WHERE u.username IS NULL) AS orphan_sessions`
  );
  const integrity = {
    orphanOrders: Number(integrityResult.rows[0]?.orphan_orders || 0),
    orphanPayments: Number(integrityResult.rows[0]?.orphan_payments || 0),
    orphanSessions: Number(integrityResult.rows[0]?.orphan_sessions || 0)
  };
  const integrityFailures = Object.entries(integrity).filter(([, value]) => value > 0);
  if (integrityFailures.length) {
    throw new Error(`Recovery target has referential integrity failures: ${integrityFailures.map(([key, value]) => `${key}=${value}`).join(", ")}`);
  }

  return {
    schemaVersion: "database-recovery-validation-v1",
    privacy: "aggregate-only",
    databaseName,
    requiredTables: REQUIRED_TABLES.length,
    migrationCount: counts.schema_migrations,
    counts: {
      users: counts.users,
      products: counts.products,
      orders: counts.orders,
      payments: counts.payments,
      messages: counts.messages
    },
    integrity
  };
}

async function main() {
  const connectionString = readEnv("RECOVERY_DATABASE_URL");
  const expectedName = readEnv("RECOVERY_EXPECTED_DATABASE");
  const allowUnsafe = readEnv("ALLOW_UNSAFE_RECOVERY_TARGET").toLowerCase() === "true";
  const databaseName = assertRecoveryTarget(connectionString, expectedName, allowUnsafe);
  const pool = new Pool({
    connectionString,
    ssl: readEnv("RECOVERY_DATABASE_SSL", "true").toLowerCase() === "true"
      ? { rejectUnauthorized: false }
      : false,
    max: 2,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 5000,
    application_name: "winga-recovery-validator"
  });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const identity = await client.query("SELECT current_database() AS database_name, pg_is_in_recovery() AS server_in_recovery");
      if (String(identity.rows[0]?.database_name || "") !== databaseName) {
        throw new Error("Connected database identity does not match the approved recovery target.");
      }
      const report = await validateRecoveryDatabase(client, databaseName);
      await client.query("ROLLBACK");
      process.stdout.write(`${JSON.stringify({ ok: true, checkedAt: new Date().toISOString(), ...report }, null, 2)}\n`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[WINGA] Recovery validation failed: ${String(error.message || error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { REQUIRED_TABLES, assertRecoveryTarget, parseDatabaseName, validateRecoveryDatabase };

