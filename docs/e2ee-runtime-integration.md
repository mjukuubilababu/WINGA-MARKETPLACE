# Connected Encrypted Chat Integration

## Scope

The real communications client, data-service, chat headers, composers and
message renderer are now connected to the gated MLS text and attachment workflow. This is
local implementation and regression evidence, not independent audit approval
or production E2EE activation. CSP is unchanged.

The self-hosted `ts-mls@1.6.4` candidate bundle loads only when the authenticated
server capability enables encryption. Native device and package gates plus
`WINGA_ENCRYPTED_CONVERSATIONS_ENABLED` are required; all example defaults remain
false. Migration `2026100304_encrypted_conversations` is additive and does not
activate any conversation. No production database or deployment was changed.

## Membership And Identity

- Native nonextractable Ed25519 identity attests the account/session/device and
  serialized MLS package. The browser independently verifies both MLS signatures,
  lifetime, credential and signing key; directory metadata alone is insufficient.
- The chat security dialog requires the contact's full native fingerprint,
  obtained through a separate trusted channel. Pins are encrypted in the vault.
  A wrong fingerprint or substituted MLS signing key cannot activate membership.
- Server reservation serializes package consumption and admits exactly one
  canonical pair/group. Both packages are consumed once. The creator's signed
  transfer and selected recipient's signed acceptance are persisted. The creator
  verifies recipient evidence before confirming local membership.
- Canonical mode becomes encrypted only after authenticated recipient acceptance.
  Historical plaintext stays historical plaintext; new encrypted text never
  uses the legacy message writer. Mode is monotonic.
- One selected active native device per participant belongs to a conversation.
  Fresh admission packages preserve the pinned signing identity and support
  additional conversations. Pending/revoked/nonmember devices fail closed.
  Member replacement, removal/rekey/rejoin and full multi-device history access
  are not implemented by this text integration.

## Ciphertext, Persistence And Receipts

- Application contents and a detached sender identity signature travel inside
  MLS private messages. The authenticated HTTP queue stores ciphertext, hashes,
  routing metadata and native signed proofs only, never message text or keys.
- Encrypted IndexedDB atomically commits ratchet state, history and exact outbox
  before transport. Lost responses/reload/reconnect retain the same operation ID
  and ciphertext. Replay cannot substitute content or duplicate the logical send.
- Authenticated network acceptance means Sent. The recipient's independently verified
  native Stored proof means Delivered; visible-message Read proof means Read.
  The sender ACKs receipts only after local persistence. Verified recipient
  evidence can resolve an ambiguous accepted send without downgrading Read.
- Invalid sender proofs/ciphertext are quarantined per receiving device, without
  Delivered/Read or ratchet advancement. Storage/authentication errors are not
  treated as invalid packets and do not discard content.
- Generic background web push uses the existing session-bound queue and fixed
  notification copy. Provider payloads carry no sender, text, product or keys.
- Legacy offline queues/device inboxes never persist decrypted encrypted text.
  Decrypted history is merged in memory for actual inbox/chat rendering.
  A current initialized chat retains encrypted queued history during network
  loss and retries on reconnect. Authenticated crypto startup requires online
  enrollment/publication; cold offline recovery is not claimed.
- The metadata-only local policy and always-authenticated canonical mode lookup
  block plaintext transport after reload, local storage wipe or nonmember-device
  use. An unavailable configured database cannot authorize a legacy fallback.
- Existing plaintext chat remains compatible when gates are off. Attachments
  require the separate media capability. Product-reference payloads and quoted
  replies remain unsupported; none silently use a plaintext route.

## Encrypted Attachments And User Recovery

The follow-up implementation is included in this release, with feature switches
unchanged. Migration `2026100305_encrypted_conversation_media` is additive.

- The real chat composer accepts attachments up to 2 MiB. The existing native
  AES-256-GCM codec encrypts file contents and metadata before upload. Its key
  and filename descriptor travel only inside the signed MLS private message.
  The storage protocol limit remains 8 MiB; the UI limit preserves vault bounds.
- A durable encrypted local journal retains exact ciphertext through offline
  sends, lost HTTP replies and reload. After upload, the existing MLS outbox owns
  exact message retries and the normal Sent/Delivered/Read receipt progression.
- Authenticated binary PUT/GET routes require native signed object proofs,
  current selected membership, exact digest/size and the isolated private R2
  bucket. GET releases no plaintext; full hash and AEAD checks precede download.
  Files download as octet-stream, never execute as HTML or SVG in the app.
- Reservations are bounded by pending-upload quotas. Attachment binding and
  message insertion share a transaction. Orphan cleanup uses expiring exclusive
  row leases, bounded provider operations and retained deletion tombstones.
  Attached files cannot be claimed by the orphan cleaner.
- The recovery dialog exports a provisional user-held key file before the first
  backup. It requires key confirmation and acknowledgement of file retention.
  After encrypted backup acceptance it exports the latest independent freshness
  checkpoint, which must also be retained. A key-only file cannot restore.
- Restore rejects wrong owner/key, rollback and conflicting immutable history.
  Receipt progress merges monotonically. Restored history contains attachment
  descriptors, but never live MLS group secrets or automatic device admission.
  A pending new device can view its restored archive; live attachment downloads
  still require an admitted device. Rekey/rejoin remains a separate release gate.
- Recovery is gated by `WINGA_ENCRYPTED_BACKUP_ENABLED`; media by
  `WINGA_ENCRYPTED_MEDIA_ENABLED` plus the three existing crypto gates.
  Every example switch remains false. Private storage needs the documented
  `R2_CONVERSATION_*` isolation credentials, not the public asset bucket.

Follow-up verification: 80 secure-content Node tests and 23 strict-CSP browser
tests with actual attachment UI/download, offline reload and pending-device
recovery, plus a full-server binary-route/CSRF regression. Frontend checks passed
144 core and 68 behavior cases; the synchronized bundle now contains 80 modules.
All four localization catalogs pass with 1359 keys each and no hard-coded UI debt.
These use local disposable databases and a private-storage SDK fixture, not a
live R2 acceptance test or independent cryptographic audit.

## Native Device Approval UI

The local follow-up adds an owner-scoped device dialog to the actual chat
header. It uses the existing gated native-device API, independently of MLS
initialization, so pending devices can show their own full fingerprint.

- An active device must confirm the target's full independently obtained
  fingerprint before approving or revoking it. Directory public keys are
  canonically decoded, hashed and checked; own-device substitutions fail closed.
- Approval and revocation use the existing session-bound native Ed25519 proof.
  The exact signed operation is retained in IndexedDB before HTTP, survives
  reload/lost responses and is reconciled with a fresh authenticated directory.
- Pending devices cannot approve themselves. Self-revocation is explicitly
  labelled and warned; only its retained exact operation can reconcile a lost
  accepted reply after that device becomes revoked.
- A changed session cannot replay the old session's signed intent. The explicit
  stop-retrying action retires only the local journal; it never reverses a
  server approval or revocation. A fresh action needs current authorization.
- Approval does not add an MLS member, copy group secrets or restore access to
  an existing encrypted conversation. Server replacement/rekey/rejoin and its
  UX are still unimplemented and remain a separate audited protocol change.

The device UI uses the existing native-device flag, changes neither CSP nor
the server membership protocol, and has not been deployed in this follow-up.
Final verification: 28/28 strict-CSP browser tests, 29/29 focused native-device
and MLS Node tests, 144 frontend core checks plus 68 behavior tests, and four
locales with 1375 keys each passed. The generated bundle contains 81 synchronized
modules. Mobile screenshots were inspected and dialog hidden-state CSS fixed.
The first full browser run hit a Node/V8 test-worker fatal error; a fresh final
run passed every case. These are local test results, not independent audit.

## Local MLS Replacement Primitive

The candidate runtime now exposes `replacePeer(groupId, retiringDeviceId,
expectedEpoch, newPackage)`. It uses ts-mls Remove plus Add, a fresh UpdatePath
and Welcome, and advances exactly one epoch. This is not wired to the server
membership API or chat UI and is not a production rejoin feature.

- Only the exact previously pinned peer leaf may be loaded after revocation,
  solely to remove it. Authentication of the replacement and the resulting
  group still requires active, independently pinned credentials.
- A replacement requires a confirmed two-member group, the expected epoch,
  a different native identity/signing key and a valid unused admission package
  on the joining device. Self removal, another owner, revoked/unpinned packages
  and mismatched epochs fail closed.
- Existing text outbox and encrypted attachment journals block replacement.
  New group state and exact membership transfer are written atomically; sends
  remain blocked until membership confirmation. A storage abort leaves the
  old epoch unchanged and reload retains the exact transfer.
- Fresh-device Welcome imports no old ratchet/history. Local tests verify both
  directions of new traffic, reject old ciphertext on the new device, and show
  old retained secrets cannot decrypt new ciphertext even when the test bypasses
  the runtime epoch gate.

The ts-mls 1.6.4 removed-device edge case has a tracked local correction in
`scripts/patch-ts-mls.js`. Previously `selfRemoved` tested whether the old leaf
slot was empty after applying Add. Reusing that slot incorrectly kept the old
device active and caused an UpdatePath error. Detection now checks the validated
Remove proposals against the client's original leaf index. The authenticated
removed member returns `removedFromGroup` without deriving new epoch keys.

The correction accepts only exact version 1.6.4 and the recorded whole-file
SHA-256 before/after hashes, normalizing CRLF. Unexpected version or source
drift fails closed. Root/backend postinstall applies it idempotently; frontend
bundling, secure-content tests and backend npm prestart require its verified
presence. Skipping install scripts requires explicitly running the patch before
these operations. This is a local dependency correction, not an upstream release
or independent cryptographic audit, and must be reviewed when updating ts-mls.

Regressions cover same-slot replacement in two- and three-member groups,
plain removal, unaffected member/new member decryption, refusal to send after
removal, old-key decryption failure, malformed Commit authentication, rejection
callbacks and invalid committer self-removal. The fixture uses real MLS crypto.

The primitive-only browser test uses native browser cryptography and strict `script-src
'self'`, with in-memory identity/publication/transport fixtures. It is not evidence
of server-authorized replacement, signed acceptance or live failover. Those need
an epoch-bound replacement transaction, exact retry/acceptance proofs, recovery
discovery, historical media access policy and authenticated end-to-end UI tests.

Replacement follow-up verification on 2026-10-03: 25/25 MLS Node tests (six new
replacement cases) passed on the final focused run; the secure-content suite
passed 86/86 before the additional raw-library exclusion assertions, which the
final focused run then verified. Complete strict-CSP browser suite: 29/29 passed,
including the new replacement test. Local frontend build `20261003124859`,
81-module synchronization and CRLF-aware whitespace check passed. No live flags,
database migration, server membership endpoint, push or deploy changed here.
Protocol reference: [RFC 9420, Sections 12 and 16](https://www.rfc-editor.org/rfc/rfc9420.html).

Dependency correction verification on 2026-10-03: secure-content suite 92/92,
final focused patch/MLS suite 31/31 (including forged Commit, ordinary removal
and rejection-callback assertions), and complete strict-CSP browser suite 29/29
passed. Root/backend npm postinstall are idempotent; backend prestart verifies
the patched source. Local build `20261003125900`, 81-module synchronization and
CRLF-aware whitespace checks passed. The library edge-case gate above is resolved
locally. The server replacement protocol and rejoin UI were implemented in the
follow-up below; independent audit remains a release requirement. This dependency
correction was not pushed or deployed.

## Authorized Device Replacement And Rejoin

The additive `2026100306_encrypted_conversation_replacement` migration records
epoch-specific membership and durable replacement reservations. A selected,
active surviving device can replace the other account's selected device with a
fresh, approved native device. The target must not have participated in this
conversation before. Account status and blocks are checked again inside the
serialized transaction; revocation of the removed device does not prevent its
authorized removal. Creator/recipient account ownership does not change.

Reservation drains the initiator's inbound epoch first and then freezes sends
and media reservations. The client persists the exact intent before HTTP,
verifies the target's native-attested MLS package and independently entered full
fingerprint, and journals one Remove+Add Commit with its new state. Transfer and
acceptance retain exact retry identities. Only the selected replacement can
accept; its Welcome must contain exactly its own device and the pinned surviving
device. Signed acceptance is verified before the initiator confirms the epoch.

The actual chat security dialog supports replacement and incoming rejoin. A
fresh approved native device discovers the existing conversation through the
authenticated directory, without receiving old ciphertext. Lost HTTP responses,
reload and a previously rejected pending-device initialization can retry safely.
Current-epoch message polling excludes old ciphertext; historical receipts and
media downloads additionally require membership in the original message epoch.
The surviving device retains its local history. Approval alone does not copy
history or grant the replacement access to historical media.

Operational limits remain explicit: an unfinished reservation has no automatic
cancel or timeout rollback. Loss of the initiator's vault or expiry of admission
material before completing the transfer requires recovery investigation, not
silent epoch rollback. Returning devices with an existing group state must use a
fresh native identity for this flow. Recovery-authorized historical media access
is not implemented by membership replacement and needs a separately audited
policy. These are release gates, not reasons to weaken cryptographic checks.

The local recovery follow-up adds an explicit Resume action. It verifies the
initiator's retained native-signed reservation proof against its own pinned
public identity, binds the reservation to the local intent and exact journal,
and checks that the saved route/group still exists. A pending reservation blocks
new text and attachment staging before an old-epoch outbox can be created,
rather than relying only on the server's frozen-send rejection. A reserved,
not-yet-created Commit can be completed only using the previously verified target pin and a
valid MLS admission package. A durably staged Commit is reused byte for byte;
temporary transfer failures leave the session inspectable and resumable after
reload. Membership confirmation still requires the new device's signed acceptance.

Missing keys, missing or conflicting journals, changed intent and expired or
invalid admission material expose a recovery-required state rather than an
endless waiting prompt. There is no cancel/reset endpoint, fingerprint bypass,
server-generated key reconstruction, or plaintext fallback. The original device
with its encrypted vault is required; a history-only user recovery capsule is
not a backup of live MLS group secrets. Loss of that vault does not have an
automatic cryptographic recovery path in this implementation.

Recovery follow-up verification on 2026-10-03: 95/95 secure-content Node tests,
the final complete strict-CSP browser suite 29/29, and frontend regressions
(144 core checks plus 68 behavior tests) passed. The real browser integration
exercises a lost accepted reservation reply before Commit creation, a temporary
transfer rejection after durable staging, reload, tampered reservation proof,
loss of local route/group keys, and refusal to stage text/media while paused.
Existing offline send/reconnect, native revocation and new-device exclusion
remain covered. Build `20261003135304`, all 81 bundled modules, four catalogs
with 1382 keys each and Windows-aware whitespace checks passed. This recovery
follow-up is local, uncommitted and undeployed; production gates and CSP were
not changed. These results are not an independent cryptographic audit.

Local tests cover both member roles, revoked-device replacement, exact retries,
foreign/pending/blocked admission, old-epoch receipt and media exclusion, and real
HTTP/browser UI with actual MLS crypto. Independent PostgreSQL connections test
competing target reservations, undrained inbox rejection and a send waiting
behind the membership freeze. No live flags, production data or CSP changed.

Final local replacement/rejoin verification on 2026-10-03: secure-content Node
suite 95/95, complete strict-CSP browser suite 29/29, and independent-connection
event/encrypted PostgreSQL suite 29/29 passed. Frontend regressions passed 144
core checks and 68 behavior tests. All four catalogs have 1380 keys with zero
hard-coded UI debt. Build `20261003133028`, synchronization of all 81 frontend
modules and CRLF-aware whitespace checks passed. The mobile rejoin dialog was
visually inspected. This follow-up has not been committed, pushed or deployed.

## Verification And Release Gates

Run `npm run test:secure-content`, `npm run test:secure-content-browser`,
`npm run test:frontend` and the focused real-chat Playwright regressions.
`tests/encrypted-conversation-concurrency.test.js` requires an explicit disposable
localhost `WINGA_TEST_POSTGRES_URL`; it never falls back to production credentials.
It tests opposite initiator races, exact retries and authorization after waits
on independent PostgreSQL connections.

Run `npm run test:encrypted-concurrency` against that disposable localhost URL.
The media extension additionally holds transactions open to test both outcomes
of send-versus-cleanup, an upload authorization protecting an expired orphan,
exclusive multi-worker cleanup claims, lease expiry/reclaim and stale-worker
completion, uploader quota under concurrent reservations, and revocation while
media authorization waits. The tests use isolated random schemas and drop them
after each case; no production credentials or bucket operations are used.

The authenticated browser integration uses actual HTTP routes, native browser
signatures, the real database store, encrypted IndexedDB, the real chat message
renderer and security dialog. It covers independent fingerprint verification,
directory key substitution, Sent/Delivered/Read, lost response, reload,
offline reconnect, revocation and mobile dialog layout.

Local verification on 2026-10-03 (frontend asset version `20261003105556`):

- Secure-content Node suite: 76/76 passed.
- Complete strict-CSP browser suite: 22/22 passed on the final run.
- Independent-connection PostgreSQL concurrency suite: 20/20 passed,
  including the two new encrypted membership race tests. Disposable server stopped.
- Frontend regression suites: 144 core checks and 68 behavior tests passed.
- Legacy push/realtime/message-page focused suite: 21/21 passed.
- Six focused real-chat browser cases passed across runs; the modal case was
  rerun successfully after an initial detached-element race during screenshot scroll.
- Four localization catalogs: 1336 keys each, zero new hard-coded UI debt.
- Frontend module synchronization: 77 modules; runtime dependency audit:
  zero reported vulnerabilities. Git whitespace check passed with CRLF handling.

The encrypted browser fixture now waits for each rejected fingerprint request
to settle before changing directory policy, avoiding stale error-text assertions.
These are local tests, not production/device acceptance or a cryptographic audit.

Independent-connection media follow-up on 2026-10-03: all eight tests passed,
including six new media race/quota cases. A fresh combined event and encrypted
concurrency run passed 26/26. The disposable PostgreSQL server was stopped
after verification; production databases and feature switches were unchanged.

Still required before production activation: independent protocol/library audit;
live private-bucket acceptance; deployed member rekey/rejoin acceptance and
unfinished-replacement recovery policy;
Android closed-app acceptance; production capacity,
operational monitoring and deployed encrypted failover evidence. The text queue
currently uses one transaction advisory serialization guard; capacity evidence
must precede rollout. Do not label section 109 complete from local test passes.

The verification above preceded the user-authorized release. Deployment does
not enable the live encryption feature switches or relax CSP. Independent audit
and the remaining release gates still precede production E2EE activation.
