# Winga Payment Refund Adapter

`winga-payment-refund-adapter` is an isolated Cloudflare Worker that translates Winga's signed refund outbox messages into Flutterwave v3 refunds. It is not part of the frontend Worker or Pages project.

## Runtime contract

- Winga Render backend sends `POST /v1/refunds` with an idempotency key and HMAC signature.
- A Durable Object serializes each refund by idempotency key.
- The adapter submits the refund to Flutterwave v3 and stores provider state.
- Flutterwave sends signed events to `POST /callbacks/flutterwave`.
- A Durable Object alarm polls pending refunds as a callback fallback.
- Only a provider-confirmed result is signed back to Render's `/api/payments/refunds/webhook` endpoint.
- Network-uncertain submissions enter `submission_unknown`; they are never blindly retried.

## Required Cloudflare secrets

Run each command from the repository root. Never put these values in Git.

```bash
npx wrangler secret put WINGA_REFUND_WEBHOOK_SECRET --config wrangler.payment-refund.jsonc
npx wrangler secret put WINGA_REFUND_CALLBACK_SECRET --config wrangler.payment-refund.jsonc
npx wrangler secret put FLUTTERWAVE_SECRET_KEY --config wrangler.payment-refund.jsonc
npx wrangler secret put FLUTTERWAVE_WEBHOOK_SECRET --config wrangler.payment-refund.jsonc
npx wrangler secret put CALLBACK_CONTEXT_SECRET --config wrangler.payment-refund.jsonc
```

`WINGA_REFUND_WEBHOOK_SECRET` must equal Render's `PAYMENT_REFUND_WEBHOOK_SECRET`.
`WINGA_REFUND_CALLBACK_SECRET` must equal Render's `PAYMENT_REFUND_CALLBACK_SECRET`.
`CALLBACK_CONTEXT_SECRET` is adapter-only and should be a new random value of at least 32 bytes.

## Required Render environment

```text
PAYMENT_REFUND_WEBHOOK_URL=https://winga-payment-refund-adapter.<account-subdomain>.workers.dev/v1/refunds
PAYMENT_REFUND_WEBHOOK_SECRET=<same value as Cloudflare WINGA_REFUND_WEBHOOK_SECRET>
PAYMENT_REFUND_CALLBACK_SECRET=<same value as Cloudflare WINGA_REFUND_CALLBACK_SECRET>
```

The backend must be redeployed after changing these values.

## Flutterwave setup

Use a Flutterwave v3 live secret key. The adapter supplies a signed, per-refund `callbackurl` containing non-guessable callback context; do not replace it with a bare dashboard URL. Set `FLUTTERWAVE_WEBHOOK_SECRET` to the exact secret configured for Flutterwave webhook signatures. Durable Object alarms also poll pending refunds, so final confirmation does not depend on webhook delivery alone.

Winga payments must persist the Flutterwave numeric transaction ID in `payments.raw_gateway_response` (`data.id`, `transaction_id`, or equivalent). A merchant reference alone is not sufficient to issue a provider refund.

## Deploy and verify

```bash
npx wrangler deploy --config wrangler.payment-refund.jsonc --dry-run
npm run deploy:worker:payment-refund
curl https://winga-payment-refund-adapter.<account-subdomain>.workers.dev/health
```

A production-ready health response has HTTP 200, `readiness: "ready"`, and all configuration fields set to `true`. A 503 is intentional while any secret or binding is missing.

Before enabling real refunds, complete one sandbox full-refund test, one partial-refund test, one duplicate submission test using the same idempotency key, one callback replay test, and one simulated timeout reconciliation test. Then repeat a low-value live transaction and refund under operator supervision.
