# Conversation Audit And Production Public Soak: 2026-10-08

This records the earlier deployed release. A subsequent authorized
[fixes and separate-agent review follow-up](conversations-audit-fixes-20261008.md)
addresses the findings below; this historical evidence is preserved unchanged.

## Scope And Independence

Source release: `50dc862c19defda8a2260e11b30ae448d2ad7d71`.
Backend health reported that exact SHA throughout the measurement. Frontend
reported build `20261007224751`. Phoenix public health does not expose a SHA.

This is a fresh source review and targeted adversarial reproduction by the
implementing agent. It is NOT an independently commissioned cryptographic audit.
Permission for a separate reviewer-agent was requested but was not received
during this run. Independent review and external crypto approval remain open.
No application fix, feature flag, secret, CSP, instance count or customer
account/data was changed. New files are an operational probe, its tests and
this evidence; the probe's offline tests are included in the realtime CI suite.

## Findings

### P1: Singleton native confirmation cannot complete

`src/chat/mls-room-operations.mjs:289` requires at least two native signatures
even though Room removal and server activation now support one remaining native.
A genuine three-native group was reduced to Alice only through a real Remove
commit. Confirming the one valid remaining signature returned
`mls_room_acceptance_required`; local group `confirmed=false` and the membership
journal remained pending. This prevents future native sends and membership work.

The current lifecycle service test (`tests/shopping-rooms-service.test.mjs:102`)
checks server epoch 3 and then closes the singleton Room, but never asserts
successful local confirmation or a usable native send after the shrink. Its
passing result does not cover this failure.

Recommended correction: allow one proof only for an exactly one-native canonical
roster, retain the exact proof-count/signature/activation checks, and add a real
singleton confirmation/send/reload regression. Do not weaken initial three-owner
Room creation or the all-native barrier. Not fixed in this audit-only increment.

### P1: Same removed native cannot be re-admitted, freezing the next transition

`src/chat/room-session.js:78` chooses applyCommit whenever a local Room exists.
A removed native retains its old group state, so after a valid re-add reservation
its epoch no longer matches the new transition's previous epoch. Actual MLS
reproduction returned `mls_room_epoch_conflict`. Trying the supplied fresh
Welcome instead also fails at `src/chat/mls-room-operations.mjs:216` with
`mls_group_exists`. The new native acceptance never arrives; retained participants
remain frozen by the all-native activation barrier.

Reproduction: activate Alice/Bob/Carol at epoch 1; remove Carol and activate
Alice/Bob at epoch 2; let Carol publish a fresh one-time package; reserve and
generate a genuine Add commit for Carol at epoch 3; try both entry paths.
Neither path can complete without discarding/resetting state, which must not
be done silently.

Recommended correction: a deliberate fresh-Welcome re-admission path bound to
the own-native Add entry and exact canonical intent, preserving history and
rejecting unresolved old outboxes. Test removal/re-add/reload/retry and future
decryption. Not fixed in this audit-only increment.

### P2: A single global encrypted lock couples unrelated Room/direct traffic

`backend/encrypted-conversations.js:108` takes the same transaction advisory lock
for every encrypted operation, including polling, before authorization. Private
media authorization takes the same lock. Different Rooms/accounts cannot execute
these transactions concurrently even with multiple stores/instances. One slow
transaction blocks unrelated sends/receipts/polls. The signed proof's 30-second
freshness check runs after acquiring that lock (`:40`), so sufficiently long
lock/pool waits can also reject requests that were fresh when they arrived.

This is a source-confirmed serialization risk, not a measured production capacity
failure. The existing six-connection test proves integrity while serializing
through this lock; it does not prove scalable parallel Room throughput.

Recommended correction: design and test scoped group/admission locks and global
ordering constraints before removing the safety lock, plus bounded lock-wait
behavior and independent-Room contention tests. Never simply disable this lock
on production or weaken proof expiry. Not fixed in this audit-only increment.

## Live Public Soak And Bounded Load

[Machine-readable evidence](evidence/conversation-public-soak-20261008.json).

Default five-minute soak plus 12 read-only bounded-load requests completed in
312,953 ms. There were 87 soak probes and 12 load probes: 99 total, zero failures,
33 requests per target, all HTTP 200. No credentials were supplied. Only GETs
to the three fixed public endpoints were used; no redirects or customer reads.
Bounded-load starts were spaced at least one second apart, with at most two
requests in flight. This was a small liveness exercise, NOT a capacity benchmark.

| Endpoint | p50 | p95 |
| --- | --- | --- |
| WINGA backend public health | 316 ms | 902 ms |
| Frontend build-version JSON | 48 ms | 82 ms |
| Phoenix public health | 208 ms | 512 ms |

Probe safeguards: explicit confirmation, duration cap 30 minutes, load cap 60,
10-second timeout, 16 KiB response cap, no arbitrary target URL, no cookies or
secrets, no retry, stop on 429, three consecutive failures or a release change.
After the live run, per-service consecutive failure detection was strengthened
so healthy peers cannot conceal one failing service; its offline regression
passed. No second live run was necessary for that failure-only change.

Repeat manually only when appropriate; the command never runs automatically:

```powershell
npm run verify:conversation-soak -- --confirm=read-only-production-soak
```

Do not run overlapping probes or reinterpret latency as messaging SLOs.

## Other Verification

- Root and backend `npm audit --json`: zero reported advisories, not proof of
  cryptographic correctness or absence of undisclosed dependency defects.
- New public-soak safety unit suite: 9/9, no live network in these tests.
- Realtime/reconnect/dispatch suite: 69/69 before the final additional slow-probe
  concurrency regression (that extra unit test passed separately).
- Shared encryption/private media/recovery suite: 145/145.
- Current native/Room suite: 42 passed, six PostgreSQL-only cases skipped in the
  embedded run; those same six passed separately on real disposable PostgreSQL.
- Real PostgreSQL: two stores, six connections, three owners, 48 unique actual MLS
  messages, 96 send attempts/decryptions, 192 receipts and 192 receipt ACKs,
  zero duplicate rows, three converged boards. Bounded store p50 82 ms / p95
  170 ms. Twenty-four concurrent leave retries and leave/send races also passed.
- Disposable PostgreSQL was stopped; no listener remained on port 55443.
- The two additional adversarial native reproductions above failed as described;
  normal passing suites must not hide those findings.

## Still Required

Fix and re-audit the two reproducible native lifecycle bugs before declaring
Rooms complete. An independent reviewer and genuine external crypto review are
still required; no `cryptographicAuditApproved` field has been set true.

Authenticated production messaging/Rooms/media/recovery soak is NOT performed.
It requires operator-designated synthetic accounts and approved test devices,
not existing customer accounts, real orders or production database resets.
The operator was asked to identify that safe test setup without posting secrets.

After those prerequisites: use dedicated browser profiles, create only synthetic
Room/direct content, measure send acceptance/decryption/receipt convergence,
withhold/recover ACKs, check exact retries and reconnect, test membership loss,
and monitor aggregate protected queue/lock/pool health before/after a bounded run.
Keep Phoenix at the operator-approved one instance. No paid scaling, forced
outage, permanent data erasure or automated shopping transaction is authorized
by this run. Traffic volume and duration must be stated before the exercise.
