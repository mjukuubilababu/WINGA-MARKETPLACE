# Winga Account Recovery Relay

This Worker is an isolated delivery boundary between the Render API and the configured SMS provider. It accepts signed recovery envelopes, writes them to Cloudflare Queues, retries transient delivery failures, and sends exhausted messages to a dead-letter queue.

## Required Cloudflare resources

Create these once from the source-of-truth repository:

```bash
cd ~/Desktop/Winga-App/.recovered-master
npx wrangler queues create winga-account-recovery-events
npx wrangler queues create winga-account-recovery-events-dlq
npx wrangler kv namespace create ACCOUNT_RECOVERY_DEDUPE --config wrangler.account-recovery.toml
```

Copy the returned KV namespace ID into `wrangler.account-recovery.toml`:

```toml
[[kv_namespaces]]
binding = "ACCOUNT_RECOVERY_DEDUPE"
id = "<returned-namespace-id>"
```

Create three independent secrets. Never reuse the account recovery signing secret as a provider credential.

```bash
npx wrangler secret put ACCOUNT_RECOVERY_DELIVERY_WEBHOOK_SECRET --config wrangler.account-recovery.toml
npx wrangler secret put SMS_PROVIDER_URL --config wrangler.account-recovery.toml
npx wrangler secret put SMS_PROVIDER_TOKEN --config wrangler.account-recovery.toml
```

`SMS_PROVIDER_URL` must accept the versioned `winga-sms-v1` JSON contract and honor the `Idempotency-Key` header. A successful delivery acceptance must return HTTP 2xx. Provider credentials, phone numbers, and OTP values must never be written to logs.

Deploy and verify:

```bash
npm run deploy:worker:account-recovery
curl https://winga-account-recovery-relay.<your-subdomain>.workers.dev/health
```

Healthy output must report `readiness: "ready"`, `queueEnabled: true`, `dedupeEnabled: true`, and `providerEnabled: true`.

## Required Render variables

```env
ACCOUNT_RECOVERY_SECRET=<independent-random-secret-at-least-32-characters>
ACCOUNT_RECOVERY_DELIVERY_WEBHOOK_URL=https://winga-account-recovery-relay.<your-subdomain>.workers.dev/v1/recovery/deliver
ACCOUNT_RECOVERY_DELIVERY_WEBHOOK_SECRET=<same-value-as-the-Worker-secret>
```

The Render and Worker webhook secrets must match. `ACCOUNT_RECOVERY_SECRET` must remain Render-only and must not be copied to Cloudflare.

## Failure behavior

- Missing Worker bindings or secrets: `/health` returns 503 and the relay refuses delivery.
- Queue unavailable: Render receives a non-2xx result and returns a generic recovery-unavailable response.
- SMS provider transient failure: the queue retries with delay.
- Repeated provider failure: the message moves to `winga-account-recovery-events-dlq`.
- Duplicate challenge: ingress and consumer dedupe suppress repeat delivery; the provider receives the challenge ID as an idempotency key.
- Unknown account: Render sends a signed privacy envelope that is acknowledged without sending SMS, keeping the public request path difficult to distinguish by timing.

Do not attach this Worker to `wingamarket.com`. It remains a dedicated `workers.dev` service and does not replace `mkubwa`, the frontend Pages project, intelligence workers, or the session-security relay.
