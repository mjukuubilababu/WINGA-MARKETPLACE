# Message Web Push

The PostgreSQL backend applies `2026092804_message_web_push` at startup.
No extra paid notification service or Render environment setup is required.
Set `WINGA_WEB_PUSH_ENABLED=false` to stop subscriptions and the push worker.

## Identity and privacy

- A single VAPID identity is generated with `web-push` and retained in the
  server-only `web_push_identity` table, shared by all backend nodes.
- Its private key is a secret. Restrict database and backup access. It is not
  encrypted separately from the database and must never enter store snapshots,
  API responses, logs, source control, or browser storage. Do not delete/rotate
  this table casually: existing subscriptions use its public key.
- Subscriptions are authenticated, CSRF-protected and bound to a live session.
  Logout unsubscribes locally; revoked/expired sessions are filtered before sends.
- Push content contains only a version, random job ID and locale. The service
  worker uses fixed generic copy, not server-provided message text or sender names.
- Clicking resolves the opaque ID through an authenticated, session-scoped route,
  with current message ownership and both block directions checked again.
  Expired/wrong-session links fall back to the inbox, not another person's chat.
- Browser/OS notifications already delivered cannot be remotely recalled.
  This is lock-screen privacy, not end-to-end encryption of chat storage.

## Delivery

- The message acceptance transaction enqueues one job per subscribed device.
- Workers claim leased jobs, retry transient errors with bounded backoff and remove
  subscriptions rejected with 404/410. Jobs expire after seven days; provider TTL
  is one day. The eight-attempt limit bounds permanent provider/config failures.
- Delivery is at-least-once. Stable notification tags/provider topics reduce
  duplicates after a crash; push acceptance never marks Delivered or Read.
- Pending jobs for read, deleted, blocked or revoked-session messages are skipped.
- Existing permission controls register the browser; login/reconnect recovers
  registration. A subscription failure retries after one minute.
- The user must grant notification permission. OS/browser settings can prevent
  delivery. iPhone/iPad require a supported Home Screen web app. Force-stopped
  browsers, battery restrictions and network loss are not delivery guarantees.

## Verification

`node --test tests/message-web-push.test.js` exercises actual PostgreSQL SQL with
PGlite and a mocked push provider, including rollback, leases, retries and revocation.
`npx playwright test tests/e2e/web-push.spec.js --workers=1` checks subscription
lifecycle and a real service-worker notification with all app windows closed.
Its PushEvent is synthetic; it does not prove external provider/phone delivery.

Physical check: enable notifications on the recipient device, close Winga, send a
message from a second account, inspect generic lock-screen copy, then tap it and
confirm the correct chat opens. Never use a private message body in test reports.
