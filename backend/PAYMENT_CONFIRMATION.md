# Payment Confirmation Contract

Winga treats provider payment confirmation as a server-to-server operation. Browser clients cannot confirm provider-managed payments.

## Signed webhook

`POST /api/payments/webhook` requires these production headers:

- `X-Winga-Payment-Timestamp`: Unix timestamp in seconds, no older or newer than five minutes.
- `X-Winga-Payment-Signature`: `sha256=<hex HMAC>` over `<timestamp>.<exact raw JSON body>`.
- `X-Winga-Payment-Event-Id`: provider event identifier, matching `eventId` in the body when both are supplied.

The HMAC key is Render's `PAYMENT_WEBHOOK_SECRET`, which must contain at least 32 characters and must be distinct from refund and CSRF secrets.

Example body:

```json
{
  "eventId": "provider-event-unique-id",
  "orderId": "order-123",
  "transactionReference": "TX-123",
  "paymentStatus": "paid",
  "amount": 25000,
  "currency": "TZS",
  "rawGatewayResponse": {
    "id": 123456789,
    "status": "successful"
  }
}
```

The backend verifies the stored order and payment. It rejects mismatched transaction references, amounts, currencies, event IDs, stale timestamps, invalid signatures, and stale state transitions.

## Replay behavior

Provider event IDs are claimed in `payment_webhook_events` inside the same PostgreSQL transaction that updates payment, order, and inventory state.

- Same event ID and same payload hash: accepted as an idempotent duplicate without a second mutation.
- Same event ID and different payload: rejected as `payment_event_conflict`.
- Late successful payment after cancellation: retained as a reconciliation case; it never silently revives the order.

## Manual mobile-money flow

The existing seller verification path remains available only for Winga's current manual mobile-money proof workflow. It does not represent provider confirmation. When a provider integration is enabled, its adapter must call the signed webhook and frontend code must never mark that provider payment as paid.

## Release verification

Before enabling a provider, test valid confirmation, invalid signature, stale timestamp, wrong amount, wrong currency, wrong transaction reference, identical replay, conflicting replay, late success after cancellation, and provider retry after a network timeout.
