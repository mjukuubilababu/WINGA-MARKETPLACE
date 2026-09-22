# Message pagination: server contract

## Implemented

- `GET /api/messages/inbox?limit=25&cursor=...` returns `items`, `nextCursor`, `hasMore`, `limit`, `totalUnread`, `totalConversations`.
- `GET /api/messages/history?withUser=...&limit=25&cursor=...` returns the newest bounded window, in chronological display order, plus the cursor for older messages.
- Limit is 1..50. Invalid limits/cursors/participants return 400; guests return 401; non-PostgreSQL stores return explicit 503 instead of pretending to support scalable paging.
- Inbox groups by counterpart person, regardless of historical product/conversation IDs. Context comes from the newest message. It returns only public participant display name/avatar, latest text/context and unread count, not full profile records or histories.
- Both directions of block relationships are excluded. The authenticated session, never query parameters or cursor contents, owns every SQL read.
- Cursor timestamps preserve PostgreSQL microseconds. History uses timestamp/ID and Inbox uses timestamp/partner keyset ordering. Cursors are opaque navigation positions, not authorization tokens.
- Counts and Inbox page are computed in one database statement. Reads do not mutate read receipts.
- New routes load only users/sessions into the existing request authentication store, avoiding a full messages/products/orders store load. There is still an existing users/sessions load; this is not yet a constant-cost authentication path.
- Additive indexes support both participant directions. No old data is deleted or identity migrated. Index creation should be scheduled with table size/lock impact in mind before large production rollout.
- `loadInboxPage` and `loadConversationPage` are exposed through the existing communications client and data-service adapter. Old `loadMessages`, POST, read receipts, SSE and polling remain unchanged.

## Frontend integration

The existing profile controller now uses the shared `refreshMessagesState()` entry point. Supported backends load 25 person summaries first, then 30 messages for the opened conversation. The UI exposes load-more and load-older controls, with retry while retaining visible data. Summary and history caches are separate; at most eight histories are retained. Global unread comes from the server total, not the loaded page.

POST/SSE messages are merged immediately by ID. Background reconciliation remains; responses predating an instant insertion are discarded rather than overwriting newer state. Account resets invalidate outstanding responses, and history results remain scoped to the requested person. Unsupported stores explicitly fall back to the old API; transient failures do not silently download all history. The backend's existing read-receipt operation remains authoritative.

Inbox search and unread filtering currently apply to loaded summaries; load more expands that scope. This is not server-wide conversation search. Archive/mute and unsupported delivery states are not fabricated. Authenticated production rollout and large-volume performance still require runtime verification.

## Consistency and scale limits

Inbox is a live view, not a frozen snapshot. A conversation updated between page requests can move to the first page; the client must reconcile SSE/newest-page refreshes and deduplicate partners. Older-message history cursors do not shift when new messages arrive. Summary aggregation currently scans the authenticated participant's visible history; it bounds transfer/materialization, not all database work. A persisted summary projection should only follow measured volume/query plans.

## Verification

### Local run: 2026-09-16

- Release-time `npm run test:ci`: FAILED at browser suite, 133 passed / 2 failed (135 total). User authorized release with these recorded test failures on 2026-09-16; this was not a fully green CI release.
- Message pagination: 18/18; commerce outcomes: 71/71; frontend core: 144/144; additional frontend tests: 25/25; integration: 196/196.
- Localization: four catalogs, 1316 keys each; hard-coded UI gate passed. Generated bundle synchronized, 67 modules.
- Focused Inbox browser run: 5/5, also passed in full CI. Mobile screenshot inspected; no horizontal overflow at tested widths and RTL.
- Remaining failures: the lower-row test waits for a showcase image under a broad recommendation selector; Worker reel publication test forwards a fabricated provider playback-token request and receives ECONNRESET. Neither proves a production outage, but their production impact is not conclusively excluded. No tests were skipped or timeouts raised. Profile and passive-view pagination regressions passed three repetitions each and the final full run.
- Release verification must be recorded separately; authenticated production pagination and database load remain unverified by these local tests.

`npm run test:message-pages` runs PostgreSQL semantics through PGlite and client state tests: grouping, cursor ties/microseconds, global unread totals, cursor ownership, blocks, malformed inputs, insertion boundaries, non-mutating reads, dedup, SSE/GET races, account switching, fallback and bounded history cache. It is wired into normal CI. Browser tests exercise summary-only initial loading, lazy history, older-page retries and compatibility with the legacy API. HTTP integration tests verify guest rejection. Production PostgreSQL multi-connection concurrency/load and authenticated runtime rollout remain unverified.

### CI stabilization: 2026-09-22

- Full `npm run test:ci`: PASS, including all 135 browser tests, with no skipped tests or increased timeouts.
- Focused horizontal-row, ordinary reel publication and Worker-rendered reel publication scenarios: 9/9 across three repetitions each.
- The horizontal-row test waits for authenticated restoration and explicitly selects a product showcase containing an image, not an arbitrary people recommendation.
- Reel fixtures wait for authenticated restoration and return a deterministic unavailable-token response for the fictional `reel-browser-test` provider. They no longer forward that fictional asset to the real fixture backend. Actual generated-video playback and publication/dedup assertions remain intact; production Stream playback is not claimed by this fixture.
- Only tests and audit notes changed in this follow-up. These local results do not replace authenticated production/load verification.
