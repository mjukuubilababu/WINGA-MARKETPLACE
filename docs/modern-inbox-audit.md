# Modern Inbox: audit and first presentation slice

## Reuse and ownership

- `src/chat/ui.js` renders both Profile Inbox and product-context chat.
- `src/chat/controller.js` owns interaction and calls the existing data layer.
- `app.js:getConversationSummaries` groups messages by the other participant, not by product. Context is independent of person identity. Latest activity orders summaries; incoming unread messages supply counts.
- `src/api/communications-client.js` implements messages GET/POST, read PATCH and EventSource SSE. `data-service.js` retains offline queuing. Existing refresh/polling remains reconciliation.
- `backend/db.js` persists messages with participant IDs, conversation ID, product references, server timestamp and delivered/read fields. No destructive migration is introduced.
- Existing order, offer, availability and goal cards continue consuming their canonical domains. They remain inside the conversation, not duplicated on every Inbox row.

## Presentation contract

ConversationSummary reuses `key`, `withUser`, `displayName`, `latestMessage`, `timestamp`, `unreadCount`, `productId` and `productName`. No public API or identity migration is required for this slice. Existing messages remain accessible.

The UI displays All/Unread, debounced local search, human-friendly generated-name fallback, short dates, thumbnail context and unread counts. Search uses only messages already authorized for this user's Inbox, never telemetry. Date separators and stable timestamp/ID ordering are shared across conversation renderers. Canonical read actions are unchanged; listing/filtering does not mark messages read.

The duplicate floating Profile back control is removed. Bottom navigation is unchanged. Existing responsive image helpers provide fallbacks. Product context is optional: missing products do not prevent conversation opening.

## Explicit remaining gaps

- PostgreSQL-backed Inbox now uses authorized summary/history pagination, with legacy API fallback only for unsupported backends. See `message-pagination.md` for its contract and tests. Transfer is bounded; large-volume SQL performance and authenticated production rollout remain unverified. Search currently filters loaded summaries, not the entire account.
- Archive/mute/manual-unread are not existing canonical conversation settings. No fake Archived tab or browser-only archive is introduced. Implement per-participant persistence and define incoming-message reactivation before exposing it.
- Buyers/Sellers filters would require context-based semantics, not mutually exclusive account roles; omitted for now.
- Sending remains immediate after server acknowledgment, plus existing offline queue behavior. Pre-ack pending bubbles require an end-to-end client message ID/idempotency contract first.
- No unreliable online presence, fabricated verification or new unsupported camera/file actions are added.
- Full composer/action-menu modernization, responsive desktop split view, expanded safety controls and aggregate observability still require separate tested integration.
- Latest full CI: 133/135 browser tests passed; lower-row locator and Worker test playback-token failures remain recorded in `message-pagination.md`. User authorized release despite these on 2026-09-16. Do not equate scoped passing tests with fully verified production readiness.

## Verification

### Regression investigation: 2026-09-16

- The data-service seller guard and product repost/own-Inbox controls still checked the legacy seller role. They now use the existing commerce capability policy for buyer/seller accounts. Guest/staff restrictions and backend authorization remain unchanged; own products open Inbox, never self-chat.
- Passive profile social/product/collection hydration and scheduled view refreshes could replace a form after interaction began. They now cache the response and defer the full render once the same account's current profile has been interacted with or contains focus. The next explicit render consumes cached enrichment; forced collection mutations still render their result. A delayed-response browser test, after session restoration, verifies the open WhatsApp form, draft and input node survive both enrichment and a scheduled render. It does not claim to cover editing during initial session restoration.
- Several navigation tests assumed the first ranked card was a photo owned by another person. Video taps intentionally start playback; own-product Message intentionally opens Inbox. Tests now select the relevant photo/other-person surface without changing feed ranking or removing those behaviors. Admin review uses the card's supported keyboard action rather than clicking a nested moderation control.
- Automatic reel publication timed out once in full CI, then passed three isolated repetitions without a code or timeout change. Its intermittent cause remains unproven; do not describe those repetitions as a production fix.
- The passive-product-view test now holds the legitimate page-two prefetch response while checking that views neither reload page one nor reset its cursor. It then releases the response and still verifies exactly two collection requests and all 24 products. No production feed behavior changed for this test.

Run localization, frontend core, module-sync, and the focused modern Inbox/mobile conversation/person-grouping browser tests. The new browser regression covers grouping, generated identities, search, unread filtering, context fallback, date separators, duplicate back removal and overflow at 320/390/768/1280px plus RTL layout.
