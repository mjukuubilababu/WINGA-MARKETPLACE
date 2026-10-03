# Connected Encrypted Chat Integration

## Scope

The real communications client, data-service, chat headers, composers and
message renderer are now connected to the gated MLS text workflow. This is
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
- Existing plaintext chat remains compatible when gates are off. The fixed
  encrypted text path rejects attachments, product-reference payloads and replies;
  it does not silently send their contents through a plaintext route.

## Verification And Release Gates

Run `npm run test:secure-content`, `npm run test:secure-content-browser`,
`npm run test:frontend` and the focused real-chat Playwright regressions.
`tests/encrypted-conversation-concurrency.test.js` requires an explicit disposable
localhost `WINGA_TEST_POSTGRES_URL`; it never falls back to production credentials.
It tests opposite initiator races, exact retries and authorization after waits
on independent PostgreSQL connections.

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

Still required before production activation: independent protocol/library audit;
private encrypted media HTTP/grant/cleanup wiring; user recovery-key
confirmation/export/restore UI and retained freshness evidence; device approval
and member rekey/rejoin UX; Android closed-app acceptance; production capacity,
operational monitoring and deployed encrypted failover evidence. The text queue
currently uses one transaction advisory serialization guard; capacity evidence
must precede rollout. Do not label section 109 complete from local test passes.

The verification above preceded the user-authorized release. Deployment does
not enable the live encryption feature switches or relax CSP. Independent audit
and the remaining release gates still precede production E2EE activation.
