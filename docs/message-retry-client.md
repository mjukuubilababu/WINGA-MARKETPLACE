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

## Limits

- This is not an encrypted outbox: the existing localStorage queue remains.
- An online send is queued on network failure, not persisted before its first
  request. Closing the page before fallback persistence can still lose retry state.
- Cross-tab enqueue is not a fully transactional storage operation.
- Failed entries are retained and retried on a later flush; a dedicated manual
  failed-message management interface remains outstanding.
- Legacy/non-PostgreSQL adapters do not promise durable idempotency.
- Server acceptance does not establish recipient-device delivery or read status.
- This increment does not complete the 0-109 architecture contract.

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
