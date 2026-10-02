# Winga Integrated E2EE Audit Workbench

Status: **experimental, audit pending, local synthetic accounts only**.
This is a complete interactive audit flow, not production Winga E2EE, a formal
security audit, or acceptance of every requirement in specification 0-109.

## Run

From the repository's `active-work` directory:

```powershell
npm ci
npm ci --prefix experiments/mls-protocol-spike
npm run start:audit --prefix experiments/mls-protocol-spike
```

Open `http://127.0.0.1:4317` in separate browser profiles for `alice` and `bob`.
The synthetic password is `local-audit-only`; do not use actual Winga credentials,
production secrets, personal messages, or private real-world attachments here.
The default database persists in the gitignored experiment `.audit-data` folder.
Stop the process with Ctrl+C. Existing records keep the original password hash.

The server binds only to 127.0.0.1, requires an explicit `--audit-only` argument,
rejects unexpected Host/Origin headers, and refuses production/Render/Vercel.
Never expose it through a reverse proxy, tunnel, LAN listener or cloud deployment.
No production routes, rollout flags, CSP, Phoenix instance count or Winga UI are
changed by this experiment. `WINGA_ENCRYPTED_BACKUP_ENABLED` must remain disabled
in production until the separately reviewed production integration is ready.

## One End-To-End Flow

1. Sign in to Alice and Bob in independent profiles. Exchange each profile's
   full **My Fingerprint** through an independently trusted channel. Paste the
   other device's expected fingerprint and select Verify. The directory is not
   an independent source of trust; do not copy its key and call that verification.
2. Alice creates a conversation with Bob, then selects Bob's verified device
   and Join Conversation. Bob synchronizes and authenticates the MLS Welcome.
3. Send text or a file. Sent means a canonical server acknowledgement; Delivered
   means another owner's device durably stored the decrypted message and sent
   Stored. Read requires an explicit visible, focused conversation. Background
   polling, an own-device copy and decrypting an attachment do not imply Read.
4. Add a new profile for an existing account. It is pending until an existing
   approved device verifies and approves its fingerprint. Every existing group
   device independently verifies the new fingerprint before processing its Add
   commit. The new device verifies the group's devices before accepting Welcome.
5. Revoke a device from another approved device of that owner. Its server access
   ends immediately. A remaining group member removes the revoked MLS leaf;
   sends are blocked until the new epoch excludes every revoked leaf. Previously
   disclosed messages and keys cannot be revoked from that device.
6. Generate/download a recovery key, store it outside the browser, confirm that
   it is safe, and Back Up. The key is never sent to the server or persisted by
   the application. Enter it on a newly approved profile to Restore History.
   Restoring does not restore the former signing identity or MLS state. Verify
   the new device and give it a fresh Welcome to receive future messages.
7. An epoch conflict quarantines the local MLS state and retains uncertain work.
   A healthy peer must Remove From Conversation first. The affected profile
   selects Prepare Rejoin, explicitly discarding that group's pending sends
   without rewinding its ratchets. The peer adds it again with a fresh key
   package/Welcome. Pending unsent history is marked failed, not silently resent.

Two tabs share an owner-scoped Web Lock and encrypted IndexedDB vault. Ratchet
state, history, deduplication evidence and outbox entries commit in one native
IndexedDB transaction. Stable logical IDs/ciphertext survive lost HTTP responses.
An aborted transaction leaves both the previous ratchet and outbox intact.
There is no transition to plaintext on encryption or transport failure.

## Cryptographic And Storage Boundaries

- The isolated package pins `ts-mls@1.6.4` and its Noble dependencies. The suite
  is `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`. The current library is an
  unaudited candidate, not an audited protocol implementation selection.
- Canonical device credentials bind account, device ID and independently pinned
  Ed25519 public key. Signed requests bind the live session, route, method, body
  digest, nonce and timestamp. Server authorization is rechecked for each call.
- Because the candidate's application API does not expose an authenticated
  sender to the integration, each encrypted application envelope additionally
  carries a canonical Ed25519 signature. The recipient checks the pinned signer,
  group membership, logical ID, owner, room, epoch and attachment bindings. This
  extra integration protocol needs independent review; no new cryptographic
  primitive is implemented here.
- Media uses native Web Crypto AES-256-GCM with a fresh key and nonce per file.
  The filename, MIME metadata and content are encrypted; its descriptor/key is
  inside the signed MLS application message. HTTP only uploads ciphertext and
  routing identifiers. Media GET rechecks an approved device and owner-room ACL,
  including history restored onto a newly approved device. Integrity is checked
  before returning plaintext. Active HTML/SVG is never embedded as a preview.
- The local database stores private ciphertext BYTEA for attachments, not public
  R2 URLs. This bounded audit adapter is deliberately not production media
  storage. A private object-store adapter, lifecycle/retention policy, content
  length enforcement, production authorization and capacity tests remain part
  of production integration. Existing public product media stays unchanged.
- The vault's AES key is a non-extractable native CryptoKey. Device private keys,
  MLS state, plaintext history and pending descriptors are encrypted records.
  A missing vault key never causes a silent overwrite. This protects raw record
  inspection; it does not defend against same-origin XSS, browser extensions,
  a compromised device or an attacker controlling the browser profile.
- Recovery is an owner-bound, generation-bound AES-GCM history-only capsule.
  It contains message history and historical attachment descriptors, never
  signing private keys, group state, session tokens or the local vault key.
  Wrong keys/authentication fail before any restore write. CAS revisions,
  exact-ciphertext retry and deletion tombstones reuse the existing backup
  contract. The key grants access to backed-up history; losing it loses recovery.
  An already downloaded capsule cannot be revoked by deleting the server copy.

Limits: eight joined devices per room, 4,000 text characters, 8 MiB attachment,
4 MiB recovery plaintext, 1,000 recovery rows, 256 queued operations and 32 MiB
queued attachment ciphertext. Sync batches at most 64 events; the UI polls every
three seconds. Event/proof/key-package retention, account provisioning, push
notifications, abuse controls and deployment capacity are not production-ready
in this localhost fixture. Receipts and routing metadata remain server-visible;
the delivery server is trusted for availability, ACLs and receipt assertions.
JavaScript garbage collection cannot guarantee erasure of every secret copy.

## Reproducible Verification

```powershell
npm run test:audit --prefix experiments/mls-protocol-spike
npm test --prefix experiments/mls-protocol-spike
npm run test:secure-content
npm run test:secure-content-browser
```

The audit suite runs five integrated Edge scenarios through the real localhost
HTTP server and isolated persistent PostgreSQL-compatible PGlite databases:

- Text, Stored/Read, encrypted file, outsider denial, device approval/revocation,
  wrong-key rejection, history restore and transaction-abort atomicity.
- Offline queuing, successful send with lost response, lost receiver ACK/replay,
  two-tab sends, a complete browser-process and server restart, fresh-profile
  history-only recovery and own-device receipt isolation.
- Strict unchanged-CSP principles, plaintext rejection, media tamper detection,
  session/account isolation and authenticated requests.
- Production startup guard and real encrypted-image desktop/mobile rendering.
- Stale-epoch quarantine, no plaintext fallback and healthy-peer fresh-Welcome
  recovery without ratchet rollback.

Screenshots are generated in the gitignored experiment test-results directory.
The tests do not constitute a formal audit, real PostgreSQL multi-node concurrency
proof, production load test, deployed E2EE rollout or private-R2 authorization test.

Final local run on 2026-10-02: 5/5 integrated Edge scenarios, 15/15 pinned MLS
baseline tests, 16/16 native crypto/PGlite backup tests and 4/4 strict-CSP native
browser tests passed. Both rendered viewport screenshots were inspected.

## Independent Audit Handoff

Review the pinned library and dependencies, RFC 9420 conformance, identity
verification/enrollment/reset, the additional signed-envelope protocol, MLS
state and key-package lifetime handling, all epoch conflict/rejoin boundaries,
native AEAD framing, recovery key UX, browser storage/XSS threat model, media
authorization and receipt semantics. Record findings with versions, reproduction,
severity and retest evidence. Resolve blocking findings before selecting an
audited production implementation and designing its durable transport adapter.

Sources: [ts-mls project](https://github.com/LukaJCB/ts-mls),
[MLS RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html),
[Web Crypto](https://www.w3.org/TR/webcrypto/),
[OpenMLS audit](https://blog.phnx.im/openmls-independent-security-audit/).
No audit has been commissioned or scheduled automatically by this task.

## Internal Security Review

The follow-up internal review found four reproducible integration defects, now
fixed and locally retested. Production approval still requires independent review
and the separate integration gates. Read `docs/e2ee-internal-security-review.md`
at the repository root for original findings and remediation evidence. Run
`npm run test:audit-security --prefix experiments/mls-protocol-spike` from the
repository root. All 14 probes are ordinary passing regressions, with no expected
failures or skips. Quarantine isolates invalid rooms without Stored receipts or
ratchet rollback; historical receipts are device-eligible and history recovery
explicitly subscribes to canonical receipt state. Retries preserve Read/Delivered.
Backup conflicts offer a confirmed local-only discard that preserves the remote
capsule and exact ambiguous retries. This review does not replace an independent
audit or enable production E2EE.

Post-remediation verification: 14/14 security, 5/5 integrated, 15/15 pinned MLS,
16/16 native crypto/backup and 4/4 strict-CSP browser cases passed (54 local tests).
Run browser suites sequentially on constrained Windows machines; a concurrent
integrated run exceeded its existing timeout, while the standalone rerun passed.

## Full-Spec Audit Repair Follow-Up

The four additional full-spec findings F02-F05 are repaired: per-room outbox
isolation/rekey retry, unsent recovery history without phantom subscriptions,
bounded admission KeyPackage lifetimes, and focused viewport-visible Read IDs.
The rekey guard distinguishes explicit non-acceptance from accepted-but-lost
responses; it never rewinds a ratchet or marks an accepted canonical send Failed.
Old trusted members may remain in a historical tree after admission expiry;
fresh admission and actual Add proposals still enforce expiry and maximum age.

Run `npm test` and `npm run test:audit-repairs` in this experiment. The combined
browser suite includes positive repair/flow regressions and two explicitly named
trust-limit demonstrations: server-authored receipts and fresh-device snapshot
rollback. Those two observations do not count as security acceptance. See the
Repair Follow-Up in `docs/conversations-spec-0-109-audit-2026-10-02.md` for scope.
This workbench remains localhost-only, experimental and excluded from production
E2EE rollout. No CSP permission, production crypto flag or private-media pipeline
was enabled by these repairs.
