# Winga Session Security Relay

The session security relay receives account-security events from the backend and
forwards them to external providers without blocking login, session restore, or
session revocation.

## Architecture

```text
Render backend
  SESSION_SECURITY_NOTIFICATION_WEBHOOK_URL
  SESSION_SECURITY_NOTIFICATION_WEBHOOK_SECRET
        |
        v
Cloudflare Worker: winga-session-security-relay
        |
        +-- KV dedupe and rate limit
        +-- Cloudflare Queue retry path
        +-- Ops webhook / email provider
```

The relay is separate from:

- `mkubwa` frontend Worker
- `winga-intelligence-worker`

Do not deploy it with plain `npx wrangler deploy`. Use its dedicated config.

## Cloudflare Resources

Create the queue and DLQ:

```bash
npx wrangler queues create winga-session-security-events
npx wrangler queues create winga-session-security-events-dlq
```

Create the KV namespace:

```bash
npx wrangler kv namespace create SESSION_SECURITY_DEDUPE --config wrangler.session-security.toml
```

Copy the returned KV namespace id into `wrangler.session-security.toml`.

## Secrets

Set relay secrets:

```bash
npx wrangler secret put SESSION_SECURITY_WEBHOOK_SECRET --config wrangler.session-security.toml
npx wrangler secret put SESSION_SECURITY_OPS_WEBHOOK_URL --config wrangler.session-security.toml
npx wrangler secret put SESSION_SECURITY_OPS_WEBHOOK_SECRET --config wrangler.session-security.toml
```

Optional generic email-provider relay:

```bash
npx wrangler secret put EMAIL_PROVIDER_URL --config wrangler.session-security.toml
npx wrangler secret put EMAIL_PROVIDER_TOKEN --config wrangler.session-security.toml
npx wrangler secret put EMAIL_FROM --config wrangler.session-security.toml
```

## Backend Environment

Set these on Render:

```text
SESSION_SECURITY_NOTIFICATION_WEBHOOK_URL=https://<relay-domain>
SESSION_SECURITY_NOTIFICATION_WEBHOOK_SECRET=<same value as SESSION_SECURITY_WEBHOOK_SECRET>
SESSION_MFA_POLICY=optional
```

Use `SESSION_MFA_POLICY=staff` only after staff MFA is wired to a real OTP,
TOTP, or WebAuthn provider. Use `required` only after buyer/seller enrollment
and recovery flows exist.

## Deploy

```bash
npm run deploy:worker:session-security
```

The first deploy uses the Worker `workers.dev` URL so Render has a webhook
endpoint immediately. After a custom route is attached, `workers_dev` can be
disabled if desired.

Health check:

```bash
curl https://<relay-domain>/health
```

Expected:

```json
{
  "ok": true,
  "worker": "winga-session-security-relay"
}
```

## Safety Rules

- Login must never wait for email/SMS delivery.
- The relay must reject events without `X-Winga-Session-Security-Secret`.
- The relay dedupes repeated events in KV before queueing.
- Queue failures retry and eventually dead-letter.
- User-facing email/SMS should be enabled only after templates, consent, and
  provider delivery reports are ready.
