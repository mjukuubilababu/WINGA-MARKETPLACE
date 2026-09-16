const { createHash, randomUUID } = require("crypto");

async function lockCheckoutReservation(client, order, context) {
  const key = String(context.idempotencyKey || "");
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key)) return { code: "idempotency_key_required" };
  const hash = createHash("sha256").update(JSON.stringify({
    productId: order.productId,
    acceptedOfferId: context.acceptedOfferId || "",
    items: context.inventoryItems || null,
    quotedTotal: context.quotedTotal ?? null
  })).digest("hex");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    "checkout-reservation:" + order.buyerUsername + ":" + key
  ]);
  const existing = await client.query(
    `SELECT r.request_hash, o.id, o.price, o.reserve_expires_at
     FROM checkout_reservation_requests r JOIN orders o ON o.id=r.order_id
     WHERE r.buyer_username=$1 AND r.request_key=$2`, [order.buyerUsername, key]
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    return row.request_hash !== hash ? { code: "idempotency_conflict" } : {
      existing: { created: true, duplicate: true, orderId: row.id,
        price: Number(row.price), reserveExpiresAt: row.reserve_expires_at }
    };
  }
  return { key, hash };
}

function reservationWindowSeconds() {
  const configured = Number(process.env.CHECKOUT_RESERVATION_SECONDS || 900);
  return Number.isFinite(configured) ? Math.max(300, Math.min(3600, Math.trunc(configured))) : 900;
}

function createCheckoutReservationStore({ withTransaction, insertNotificationRow }) {
  async function submitReservedOrderReference({ orderId, buyerUsername, transactionReference }) {
    const reference = String(transactionReference || "").trim().toUpperCase();
    if (!/^[A-Z0-9._/-]{4,80}$/.test(reference)) {
      return { updated: false, code: "invalid_transaction_reference" };
    }
    return withTransaction(async client => {
      const result = await client.query(`
        SELECT o.id, o.status, o.payment_status, o.payment_intent_status,
          o.reserve_expires_at, o.reserve_expires_at>NOW() AS unexpired,
          o.seller_username, o.product_name, p.id AS payment_id, p.transaction_reference
        FROM orders o JOIN payments p ON p.order_id=o.id
        WHERE o.id=$1 AND o.buyer_username=$2 FOR UPDATE OF o,p
      `, [orderId, buyerUsername]);
      const row = result.rows[0];
      if (!row) return { updated: false, code: "order_not_found" };
      if (row.transaction_reference === reference) {
        return { updated: true, duplicate: true, orderId: row.id };
      }
      if (row.transaction_reference || row.payment_intent_status !== "awaiting_reference") {
        return { updated: false, code: "reference_already_submitted" };
      }
      if (row.status !== "placed" || row.payment_status !== "pending" || !row.unexpired) {
        return { updated: false, code: "reservation_expired" };
      }
      const claimed = await client.query(`
        INSERT INTO payment_transaction_claims(transaction_reference,payment_id,order_id)
        VALUES($1,$2,$3) ON CONFLICT(transaction_reference) DO NOTHING
        RETURNING transaction_reference
      `, [reference, row.payment_id, row.id]);
      if (!claimed.rowCount) return { updated: false, code: "duplicate_transaction" };
      await client.query(`
        UPDATE payments SET transaction_reference=$2,receipt_number=$2,
          updated_at=NOW(),row_version=row_version+1 WHERE id=$1
      `, [row.payment_id, reference]);
      // Submission is evidence awaiting verification, never confirmation of payment.
      await client.query(`
        UPDATE orders SET transaction_id=$2,payment_submitted_at=NOW(),
          payment_intent_status='submitted',
          reserve_expires_at=NOW()+INTERVAL '24 hours',
          updated_at=NOW(),row_version=row_version+1 WHERE id=$1
      `, [row.id, reference]);
      const notification = {
        id: "notification-" + randomUUID(), userId: row.seller_username,
        actorUsername: buyerUsername, type: "order", conversationId: row.id,
        title: "Reference ya malipo imetumwa",
        body: row.product_name + ": hakiki malipo kabla ya kuthibitisha order.",
        variant: "info", read: false, createdAt: new Date().toISOString()
      };
      await insertNotificationRow(client, notification);
      return { updated: true, duplicate: false, orderId: row.id, notification };
    });
  }
  return { submitReservedOrderReference };
}

module.exports = { lockCheckoutReservation, reservationWindowSeconds, createCheckoutReservationStore };
