# Message Retry Client Increment

The authenticated GET `/api/messages/capabilities` advertises PostgreSQL durable
message retry support. Clients generate a cryptographic `clientMessageId` only
when supported. Existing keyed payloads retain their ID across retries. A 404
supports older deployments; transient capability failures do not silently downgrade.

The offline queue persists the prepared payload before replay, retains failures,
rejects storage corruption/quota failures, coalesces concurrent flushes, and
preserves arrivals while another send is pending. Queue ownership remains scoped
to the captured account. Web Locks serialize flushes across supporting tabs.
Canonical acceptance still comes from POST `/api/messages`; reconciliation remains.

Supported online sends now enter this same queue before their first POST. The
sender returns the canonical acknowledgement, or a queued result on retryable
failure. Background replay skips in-flight messages within the tab; Web Locks
serialize foreground/replay sends across supporting tabs. Account ownership is
checked again after acquiring the lock. Storage failure prevents the POST.
Acknowledged messages remain successful if local cleanup fails; their retained
logical ID can be replayed idempotently. Legacy adapters keep their existing path.

## Limits

- This is not an encrypted outbox: the existing localStorage queue remains.
- Persistence-before-POST applies only to payloads with durable retry IDs. Legacy
  adapters retain the prior network-failure fallback, including its crash gap.
- The existing plaintext queue is now also used briefly for supported online
  sends. It is not protection against same-origin script access, XSS or device
  compromise; encrypted local storage/key lifecycle remains a separate gate.
- Cross-tab enqueue is not a fully transactional storage operation.
- Failed entries are retained for explicit Retry in the matching conversation;
  background flush skips FAILED entries. Transient failures remain queued.
- Legacy/non-PostgreSQL adapters do not promise durable idempotency.
- Server acceptance does not establish recipient-device delivery or read status.
- This increment does not complete the 0-109 architecture contract.

## Explicit retry UI

The conversation renders local pending/failed sends separately from canonical
history, scoped to the signed-in account and current counterpart. Retry uses the
stored payload and existing clientMessageId, never the normal new-send path.
Buttons disable during the operation, and queue flush coalescing prevents duplicate
same-tab attempts. A targeted retry does not flush unrelated entries. Successful
reconciliation removes the local entry and reloads canonical messages; failed
entries remain visible. Read receipts and server-side authorization are unchanged.

Queue corruption must not hide canonical history. Private message content is not
added to telemetry. This is a plaintext local queue bridge, not an encrypted
outbox or device acknowledgement protocol. Dedicated discard/edit controls,
transactional cross-tab enqueue, and richer pending media previews remain work.

Verification (2026-09-22): focused retry/receipt tests 19/19; final full
`npm run test:ci` passed, including integration 200/200 and browser 137/137.
The first CI attempt stopped on the old exact function-signature assertion;
it was updated for the optional retry ID parameter before the full passing run.
The new browser scenario verifies a rejected send remains visible and Retry
reuses its client ID. No assertion was skipped. Authenticated production
two-account verification remains a separate rollout check.

## Verification

Focused tests cover lost acknowledgements, concurrent flush, new arrivals, account
switch, permanent rejection, invalid acknowledgement, corruption/quota failure,
capability caching, legacy fallback, and transient lookup failure. HTTP integration
checks capability authentication and the legacy store response.

2026-09-22: complete `npm run test:ci` passed on the second full run, including
135/135 browser tests, 200/200 integration tests and 144/144 frontend core tests.
The first full run had one Home bottom-navigation visibility failure (134/135);
the unchanged test passed three isolated repetitions before the full green run.
All eight new retry tests passed. No browser assertion was weakened or skipped.

Persistence-before-send follow-up: all 14 queue tests and the browser reload test
passed. Complete `npm run test:ci` passed with 136/136 browser tests on the second
run (integration 200/200, frontend core 144/144). The first run had one existing
mobile-header upward-scroll visibility failure (135/136); the unchanged test
passed three isolated repetitions and then the full run. This records a transient
test failure, not a navigation fix. No backend schema or receipt state changed.
