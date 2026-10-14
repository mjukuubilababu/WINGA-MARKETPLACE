# Conversations canonical history ordering — 14 October 2026

## Result and scope

Direct encrypted history, merged legacy/encrypted pages, paged/SSE/local updates,
chat rendering and encrypted inbox latest-message selection now preserve the
server sequence within its own stream. Previously, a later accepted message
with an earlier committed timestamp could move above an older message or leave
the inbox showing the wrong latest text. Values above JavaScript Number precision
are compared as validated decimal strings, never converted to Number.

This is Conversations foundation hardening, not implementation of new dependent
Shopping Room features. [The Shopping Rooms precondition remains blocked](shopping-rooms-spec-audit-20261014.md).

## Canonical rule

`src/chat/history-ordering.js` supplies the shared endpoint ordering contract.
It is bundled before API/pagination/UI use and imported by the native MLS runtime.
No alternate ciphertext writer, conversation identity, protocol, ratchet,
encryption library, ACK/receipt semantics or server sequence counter is added.

- A stream is scoped by encrypted/legacy domain and conversation ID. Older
  records without an explicit ID use their endpoint participant pair.
- Valid sequence metadata is a positive decimal string of at most 19 digits.
  If both aliases exist they must agree. Unknown/invalid metadata is never
  promoted to a fabricated canonical sequence.
- Within a stream, historical records without sequence precede sequenced
  committed records; pending records follow committed records. Pending ties
  retain timestamp/ID order rather than treating uncertain metadata as acceptance.
- For a mixed list, first establish deterministic timestamp/ID slots, then order
  each stream's own rows within its slots. Unrelated sequence values are never
  compared. This avoids a non-transitive global comparator mixing sequence
  comparisons with timestamp comparisons.
- `compareConversationMessages` is only the scoped pair/boundary/latest-record
  comparison. General list sorting uses `orderConversationMessages`.
- Inbox chooses each native stream's latest record before comparing separate
  stream summaries by time. Inbox conversation ranking is not a global message
  sequence. Sequence, scope and pending-to-Sent status survive local summary ACK
  updates, allowing the next canonical message to become latest.

The displayed timestamp remains the recorded timestamp. This may visibly go
backward when a server clock does; it is not rewritten to manufacture chronology.
No message/body/history/receipt/outbox is deleted or rewritten by the sorter.
Unknown recovered metadata remains unknown. Legacy/native migration and real
multi-device chronological expectations still require applicable acceptance.

## Verification

Local focused checks:

- Native MLS runtime: **58/58**, including actual encryption/decryption of two
  messages with large sequential counters, reversed committed times and vault
  reload preserving the same IDs and order with only two sends.
- Pagination/ordering: **20/20**, including deterministic mixed streams,
  unrelated counters, input immutability, historical unknown sequence, pending
  placement and next-message selection after a pending-to-Sent ACK.
- Encrypted inbox/API: **11/11**, including canonical latest text under clock
  rollback and cursor/order metadata preserved in mixed history.
- Receipt UI: **14/14**. The older isolated VM fixture was updated to load the
  shared ordering helper before pagination/UI, as the actual build does.
- Actual Chromium chat DOM regression: **1/1**, confirming canonical order with
  retained legacy content and unrelated sequence scope.
- Complete local encrypted Chromium checkpoint: **51/51** (3.6 minutes), covering
  strict CSP, device trust, exact retries, direct/Room transport, media, history,
  recovery, receipts and canonical writer fixtures. Final source acceptance is
  also required on the pushed exact tree; this checkpoint is not live acceptance.
- Message-page regression command passed all **13 files** in this executor.
  Its Node child-output limitation reports files, not the internal test count.
- Frontend core **153/153** and all **7 behavior files** passed. Four catalogs
  retain **1,766 keys**, zero new hardcoded UI debt; **99 modules** synchronize.

The DOM and HTTP/SQL browser fixtures use synthetic accounts/native devices;
private object storage is synthetic where used. They do not prove physical
Android/PWA, authenticated production-user acceptance, sustained fleet capacity,
independent crypto approval or real provider delivery. No live user action or
video-failure investigation was performed.

The earlier receipt fixture failure reflected its missing shared module; the
original ordering expectation was retained. No production outage is inferred.
See [local evidence](evidence/conversations-ordering-isolated-20261014.json).

## Release and remaining gates

Commit/push the exact source and generated module bundle; use the existing
functional/dependency/Phoenix acceptance and Render/Cloudflare release pipeline.
Verify the actual release SHA and eight static assets including the native MLS
vendor bundle. Source presence or deployment alone does not make the foundation
production-ready. Independent CodeQL and cryptographic review remain separate
unresolved gates; do not waive/rebind approvals to changed source automatically.

No database migration, production flag, TLS/CA/CSP permission, crypto library or
Phoenix instance change is required. A rollback reverts this client ordering
change and redeploys the matching frontend; canonical ciphertext/message IDs,
membership, ACKs and stored sequences remain intact. Do not reset keys or outboxes.

Foundation work still includes presence/typing, durable device security notices,
reviewed crypto/web storage, infrastructure TLS, retention/erasure and real
device/media/recovery/capacity/failure acceptance. The new Conversations contract
is still incomplete at section 54; Shopping Rooms still ends at heading-only 61.
