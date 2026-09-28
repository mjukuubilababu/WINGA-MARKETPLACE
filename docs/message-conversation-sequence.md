# Conversation message sequence

## Contract

PostgreSQL assigns `conversationSequence`, a positive BIGINT represented in every
API/live payload as a decimal string. Its scope is the unordered sender/receiver
pair, not a product or a caller-supplied conversation ID. JavaScript must not
coerce it to Number. Sequences from different pairs cannot be compared.

The `winga_message_sequence` BEFORE trigger allocates from
`message_conversation_streams` with an atomic upsert, inside the same transaction
as message insertion. This row remains locked until commit/rollback, serializing
acceptance within one pair. The binding ledger stores message ID, pair and
position, without content. A matching durable send retry returns the original
message/sequence and does not allocate another position. A failed transaction
rolls back allocation, message, replay, idempotency and wake-up work together.

Database assignment also covers older binaries that omit the new column during
rolling deployment. Client-supplied sequence metadata is discarded by the API;
the trigger ignores a supplied value in direct inserts/sequence updates. A
message ID cannot be renamed or reassigned to a different pair. Historical
conversation IDs, message IDs, contents and timestamps are unchanged.

## Historical Data

Migration `2026092802_message_conversation_sequence` runs under the existing
transactional migration lock. Existing messages receive deterministic positions
by timestamp then ID within each pair. This reconstructs display order, not
proof of historical commit order. Schema changes/backfill lock message writes
until commit. Deployment time therefore depends on message count and competing
transactions; it is not claimed to be zero-downtime or benchmarked at scale.

Deleted messages leave their position bindings and stream counter intact, so
deletion cannot reset/reuse a position. Legacy snapshot restoration of the same
message ID/pair reuses its position. These are routing metadata, not anonymous
data. Retention/identity-erasure policy still needs the broader spec decision;
do not independently prune counters/bindings or promise complete metadata erasure.

## Read And Display

`GET /api/messages/history?withUser=...&order=sequence` uses a bounded descending
sequence query, returns each page oldest-first and emits a v2 cursor scoped to
owner and partner. The cursor carries a string boundary and still works if that
message is deleted. Blocks and participant authorization remain enforced.

The response's `order` distinguishes sequence and timestamp pages. Existing v1
timestamp cursors finish under the old order, and the default API order remains
timestamp for compatibility. The new client requests sequence order and resets
extended history when it observes a change of ordering. Legacy file-mode clients
retain timestamp ordering and report no sequence capability.

Inbox summaries choose the latest message by sequence within each pair but sort
different conversations by activity timestamp, never by unrelated sequences.
Inbox and modal message bubbles share a string-safe sequence comparator. Pending
local drafts remain separate from accepted canonical messages.

Missing sequence numbers do not prove missing delivery: deletion can create
holes. Reconnect/recovery continues to use the existing owner-scoped replay and
read/delete resync barrier. This increment sequences accepted messages, not all
future conversation events, device receipts, membership events or ciphertext.
It does not implement E2EE, BEAM or the entire proposed Conversations model.

## Rollout And Verification

Deploy backend/migration before relying on the new frontend ordering. Older
binaries keep writing safely through the trigger but do not expose the new field.
A code rollback can leave the additive schema/trigger in place; do not drop the
sequence column or ledger while new code may still be active. Frontend Worker
deployment is separate from pushing the Render backend branch.

Tests cover repeatable migration, history preservation, product-independent pair
ordering, reverse timestamps, invalid mutation, rollback, deletion/restore,
large integers, retry/live payload propagation, owner-scoped paging, blocked
reads, old cursors and client order transition. Browser tests verify inbox/modal
ordering at mobile/desktop sizes while retaining reply/delete/reconnect flows.
PGlite validates executable PostgreSQL SQL, not real multi-connection contention.
No new live production sequencing/load exercise is claimed.

Primary references: PostgreSQL documents atomic upsert behavior in
[INSERT](https://www.postgresql.org/docs/16/sql-insert.html) and BEFORE-trigger
row assignment with RETURNING in
[Trigger Functions](https://www.postgresql.org/docs/16/plpgsql-trigger.html).
