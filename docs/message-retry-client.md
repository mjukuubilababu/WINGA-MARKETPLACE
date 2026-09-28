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
- Updated tabs use an owner-scoped Web Lock for every queue read/modify/write.
  Browsers without Web Locks retain the single-tab fallback, without a cross-tab
  write guarantee. Old tabs must reload to participate in the new storage lock.
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
transactional storage on browsers without Web Locks, and richer pending media
previews remain work.

Concurrent retry coordination: when an unrelated flush is active, explicit Retry
waits for it and then attempts the selected entry if that operation did not already
attempt it. Same-target taps coalesce, and account ownership is rechecked after
waiting. An attempt already handled by the active operation is not immediately
repeated, including a rejected attempt. This does not make localStorage writes
transactional across tabs in the original increment; see the follow-up below.

## Cross-tab queue serialization (2026-09-28)

Enqueue, payload preparation, failure-state updates and accepted-send cleanup now
share a short owner/queue-key-scoped Web Lock. Network sends keep the existing
separate owner send lock, so a slow POST cannot prevent another tab from saving
a new message. Enqueue is asynchronous and callers await persistence before
reporting queued state or making a POST. Read/modify/write runs synchronously
inside the storage lock; no whole-queue writer is exposed to callers.

Account ownership is rechecked after acquiring the enqueue lock and before each
send. Cleanup remains scoped to the captured original owner. Lock acquisition
failure does not fall back to unlocked writes. Corrupt storage is preserved;
write failure prevents new sends. An unconfirmed replay ACK stays QUEUED with
its original logical ID, and a confirmed ACK is not turned into FAILED merely
because cleanup could not write storage. Failed deletion of the last queue entry
is detected instead of silently claiming local cleanup succeeded.

This is cooperative coordination for updated same-origin tabs with Web Locks,
not encrypted storage, protection from hostile scripts, or an IndexedDB
transaction. Old still-open tabs do not acquire the new storage lock. Storage
eviction, disabled storage, secure key lifecycle and encrypted outbox remain
separate concerns. Retries are still at-least-once; canonical server idempotency,
not locks alone, prevents duplicate accepted messages after an uncertain outcome.

Verification: queue unit tests 26/26; frontend core 144/144 and related frontend
tests 62/62 (including the queue suite). Eight focused browser tests passed,
including two real same-origin tab tests with native Web Locks/shared localStorage:
81 simultaneous queued entries retained, a blocked storage writer, enqueue during
network I/O, and serialized sender/background-flush cleanup. Existing retry,
reload, SSE, inbox/modal reply/forward/delete workflows also passed. Module sync
passed. Full unrelated integration/browser suites were not rerun.

Coordination follow-up verification (2026-09-22): queue tests 19/19 and the
complete CI passed on the first run, including integration 200/200 and browser
137/137. Tests cover a selected retry behind unrelated background work, duplicate
retry taps, account change while waiting, and rejection during an existing attempt.

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
