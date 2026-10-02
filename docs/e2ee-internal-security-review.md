# Winga E2EE Internal Security Review

Date: 2026-10-02. Initial reviewed implementation: `2d5138f`.
Follow-up remediation: AUD-001 through AUD-004 are **fixed and locally retested**
in the current working tree; all 14 security regression tests pass normally.
Verdict: **not ready for production**. Independent cryptographic review, the
production private-media/durable-transport integration and the separate root
dependency advisory remain open. No plaintext disclosure or cryptographic break
was demonstrated by this bounded review; that is not a claim that none exists.

This is an internal code review with adversarial tests by the same coding agent
that implemented the prototype. It is not an independent audit, certification,
complete RFC conformance review, or authorization to enable production E2EE.

## Scope And Method

Reviewed the experimental browser client, HTTP server, device identity helper,
native media/recovery codec, existing backup contract, UI boundaries and pinned
MLS integration. Inspected relevant installed library validation and current
primary-source protocol/library documentation. Tested through separate Edge
profiles and isolated in-memory PGlite databases. No live account, production
database, production secret, Render scaling action or security setting was used.

The initial review added reproducible probes and this report without changing
the implementation. The operator subsequently authorized fixing all four defects.
The remediation changes only the local experimental workbench and its tests/docs;
the production enable switches and CSP remain unchanged. Probes use isolated
databases, not the localhost demo database. Historical locations below refer to
the original `2d5138f` baseline. See Remediation And Retest for the current behavior.

## Confirmed Findings

### AUD-001 P1 Isolate Invalid Events By Conversation

Locations: `experiments/mls-protocol-spike/audit/client.mjs:301` and `:362`.

`sync()` processes one globally ordered batch and acknowledges it only after
every event succeeds. A legitimate joined peer can send an MLS-authenticated,
correctly signed application envelope that violates the application schema.
For example, a custom client can sign an empty text payload. It passes server
ciphertext framing but fails recipient `validateContent()`.

Reproduction: join Alice/Bob and Alice/Eve rooms; Bob sends the authenticated
invalid envelope; Eve sends a valid message in the other room. Two consecutive
Alice sync attempts throw `invalid_content`; Eve's history remains empty and
both message events remain unacknowledged. The invalid event is fetched forever,
blocking unrelated rooms for the device, not merely the sender's own room.

Impact: authenticated peer denial of service across the recipient's conversations.
No decryption oracle or plaintext leak was demonstrated.

Required fix: isolate processing by room, durably record rejected-event evidence,
and allow healthy rooms to progress. Define a bounded rejected-event/quarantine
policy with explicit ratchet handling and fresh-Welcome recovery where needed.
Do not accept invalid plaintext, rewind ratchets, or blindly acknowledge an
unprocessed cryptographic event as Stored. Earlier successfully persisted events
must have an independent durable ACK path.

Retest gate: the valid other-room message arrives exactly once, while the bad
room remains quarantined/rejected with no receipt claiming that its bad message
was stored or read. Repeat with AEAD damage, bad inner signature, unsupported
schema, an untrusted Add and batches larger than 64.

### AUD-002 P1 Route Historical Receipts Only To Eligible Devices

Locations: `experiments/mls-protocol-spike/audit/server.cjs:319` and
`experiments/mls-protocol-spike/audit/client.mjs:357`.

The server broadcasts Stored/Read to every currently joined device belonging to
the original sender. A newly added device can therefore receive a receipt for
a message sent before it joined, without ever receiving that message or restoring
its history. The recipient client requires a matching history row and throws
`receipt_binding_mismatch`; the event remains unacknowledged and repeats.

Reproduction: Alice sends before Alice2 joins; Alice2 is properly approved and
gets a fresh Welcome but has no old history; Bob synchronizes the old message
and emits Stored. Alice2 receives that old receipt and its next sync fails. This
requires no malicious participant or corrupted ciphertext.

Impact: normal device enrollment can break synchronization permanently through
the public client workflow. It shares the global blocking mechanism in AUD-001
but has a separate server-side routing cause and a benign trigger.

Required fix: route receipts using per-message device eligibility, not only the
current owner roster. Define how restored-history devices subscribe to updates.
Unknown historical receipts must be safely deferred or isolated without inventing
a message, weakening owner/room checks, or blocking healthy traffic.

Retest gate: add a sender's second device before the receiver consumes older
messages, with and without recovery history. Old receipts cannot stall it; newly
sent messages and valid receipts still reach both eligible sender devices.

### AUD-003 P2 Preserve Read And Delivered During Canonical Retry

Location: `experiments/mls-protocol-spike/audit/client.mjs:193`.

`flushLocked()` unconditionally sets outgoing history to `sent` when retrying a
pending message. If the first send committed but its HTTP reply was lost, the
receiver can already store/read it. `sync()` first applies those receipts and
then flushes the uncertain send, overwriting Read with Sent. Since the receipt
has been acknowledged and the retry is idempotent, no new receipt repairs it.

Reproduction: accept Alice's send and drop its reply; Bob synchronizes and reads;
Alice's event batch contains Read; Alice synchronizes. There is exactly one
canonical server message, but her final local status is `sent`, not `read`.

Impact: receipt integrity and user-visible state regression, not duplicate send
or cryptographic compromise.

Required fix: centralize monotonic status merging for canonical send acknowledgements
and receipts. A Sent acknowledgement may upgrade Pending but never downgrade
Delivered/Read. Preserve this ordering across reloads and own-device copies.

Retest gate: repeat lost-response retries with Stored and Read arriving before,
during and after the retry; final state never regresses and message IDs remain
canonical and unique.

### AUD-004 P2 Provide Explicit Recovery From Backup Revision Conflict

Locations: `experiments/mls-protocol-spike/audit/client.mjs:387` and `:399`.

The encrypted pending capsule is removed only after a successful PUT. If another
approved device writes a backup first, its expected revision becomes stale.
Every later Back Up action reuses the same stale capsule and returns
`backup_revision_conflict`. There is no supported client/UI action to discard
or reconcile that pending backup. Server CAS correctly prevents overwrite;
client recovery from the conflict is missing.

Reproduction: Bob prepares revision 0 and its PUT is blocked before reaching the
server. Bob2 writes revision 1. Bob retries twice; both receive 409 and the local
pending capsule remains pinned to revision 0. This does not require losing the
user's recovery key or tampering with the database.

Impact: future backups from that profile are blocked until manual internal vault
manipulation or profile replacement. Existing accepted backup remains intact.

Required fix: expose an explicitly confirmed conflict-resolution action that
discards/reconciles only the local pending capsule, rereads the remote revision,
and seals a new user-key-confirmed snapshot. Do not silently overwrite another
accepted capsule, regenerate ciphertext for an ambiguous accepted retry, or
delete the remote backup to hide the conflict.

Retest gate: conflict after another device's write, after a tombstone, and after
an accepted-but-lost response. Existing recovery remains usable and a subsequent
user-confirmed backup can complete at the correct revision.

## Safeguards And Dependency Results

The duplicate-signature-key probe was rejected by the pinned MLS implementation
with `Commit cannot contain an Add proposal for someone already in the group`.
The initially suspected key-uniqueness issue is **not a confirmed finding**.
RFC 9420 requires unique group keys; this specific probe passed, but it does not
prove every Add/Update/path validation case. See
[RFC 9420 section 16.7](https://www.rfc-editor.org/rfc/rfc9420.html#section-16.7).

The baseline normal-flow suite was rerun after adding the audit probes: **5/5 passed**.
It covers native AEAD damage/wrong-key rejection,
account and device denial, unchanged strict CSP, transactional abort, key-free
server storage, offline sends, browser/server restart and fresh-Welcome rejoin.
These safeguards do not negate the newly reproduced adversarial failures.

`npm audit --omit=dev --prefix experiments/mls-protocol-spike --json` reported zero
known advisories in that lockfile's production dependencies. This is an advisory
database check, not a cryptographic audit. The library's current
[security disclaimer](https://github.com/LukaJCB/ts-mls#security-disclaimer)
still states that no formal security audit has been performed.

A separate repository-root `npm audit --json` returned one High advisory for
`sharp` locked at **0.35.3**. The backend manifest and lockfile already select
**0.35.4**, the patched version. This is a root developer/test dependency follow-up,
not evidence that the live backend runs the vulnerable decoder. The encrypted
workbench stores ciphertext and does not decode images with sharp. No native
exploit or live deployment version inspection was performed. Update the root
manifest/lockfile and test relevant image tooling. The advisory describes affected
libheif decoding under specific conditions:
[GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c).

## Reproduce And Interpret The Results

```powershell
npm run test:audit-security --prefix experiments/mls-protocol-spike
npm run test:audit --prefix experiments/mls-protocol-spike
```

Initial probe result at the baseline: four reproduced expected failures and one
passing safeguard. After remediation the same four cases and additional edge
cases are ordinary regression tests: **14/14 passed, zero expected failures or
skips**. The tests assert the desired behavior; no failed assertion is annotated
as acceptable. Structured results are in the gitignored experiment
`test-results/security-audit/results.json`. These local passes do not constitute
independent security acceptance or authorize production rollout.

## Remediation And Retest

- **AUD-001:** durable, encrypted per-room quarantine records bind the rejected
  event ID and fingerprint. Healthy events are persisted and ACKed independently.
  The authenticated server excludes the quarantined room before applying its
  64-event limit; it never acknowledges rejected messages as Stored. Only a
  healthy peer removal, local Prepare Rejoin and a fresh Welcome resume that room.
  No rejected ratchet state is persisted or rolled back. Transient storage/network
  failures remain retryable, rather than being mistaken for hostile content.
- **AUD-002:** receipt eligibility is recorded per message and sender device.
  Joining later does not subscribe a device to unknown older history. Authenticated
  history recovery explicitly subscribes only to the owner's canonical messages
  and replays their current receipt state. Unknown legacy receipts do not invent
  history or block sync; known receipts retain owner/room binding checks.
- **AUD-003:** canonical send acknowledgements and receipts use one monotonic
  Pending/Sent/Delivered/Read merge. Read and Delivered survive exact retries,
  duplicate older receipts and browser reload. Accepted IDs remain unique.
- **AUD-004:** `discardPendingBackup({ confirmed: true })` resolves observed
  conflicts by removing only the device's pending capsule. It never mutates the
  remote backup; unchanged ambiguous sends keep their exact ciphertext. A capsule
  already accepted remotely is recognized without creating a new revision. The
  recovery panel exposes confirmation/cancel, retains result notices across
  background polling and prevents busy actions from silently swallowing clicks.

The 14 security tests cover the original four cases, invalid AEAD/signature and
untrusted Add, a backlog exceeding 64 events with a lost rejection response,
transaction abort, historical-receipt owner isolation, Delivered/Read monotonicity,
backup tombstone conflicts, exact accepted-response retries and real desktop/mobile
confirmation UI. The pinned-library duplicate-signing-key safeguard still passes.
Desktop/mobile screenshots were inspected without overflow or overlapping controls.

Final current checks: 14/14 security regressions, 5/5 integrated scenarios,
15/15 MLS/device-identity baseline tests, 16/16 native crypto/backup contract tests
and 4/4 strict-CSP native browser tests pass: **54 passing local test cases**.
An initial concurrent integrated run hit its 90-second timeout during browser/server
restart; all five scenarios passed when rerun alone without changing the timeout.
The existing localhost demo was restarted with its database retained and returned
HTTP 200, unauthenticated session HTTP 401 and the unchanged strict CSP. No
production database, rollout flag or Render service was changed.

## Release Decision

Keep production E2EE disabled. AUD-001 through AUD-004 are remediated locally;
retain their regression gates and remediate the separate root dependency advisory. Continue the
separate private-object-store/durable-transport integration and independent
cryptographic review gates. Formal library conformance, exhaustive fuzzing,
side channels, native memory exploitation, production load, deployed failover,
and compromised-browser/XSS resistance were not established by this review.
