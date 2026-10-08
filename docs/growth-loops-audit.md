# Growth loops audit — 8 October 2026

Audited baseline: `a2391bb0`, default branch `master`. Status describes source behavior, not a production certification. No deployment was performed. The supplied Growth Loops v1.0 contract requires phased rollout; this change starts with Phase 1.

| Capability | Status | Evidence and consequence |
| --- | --- | --- |
| Product external sharing | IMPLEMENTED / PARTIAL | `app.js:handleShareProduct` uses the native share sheet, clipboard, and a fallback. Canonical `/product/:id` links exist. No durable share envelope or funnel. |
| WhatsApp | PARTIAL | Native share supports installed WhatsApp. `handleOpenProductWhatsapp` contacts a seller; that is distinct from sharing a product to a friend. No dedicated product-to-friend action. |
| Guest product links | IMPLEMENTED / UNSAFE | `openDeepLinkedProductRouteIfNeeded` opens product detail before authentication. Backend `/product/:id` preview reads raw products without public eligibility; private/moderated content can leak preview metadata. |
| Deep-link routing | PARTIAL / DUPLICATED | Product path functions in `app.js` and detail controller; collection sharing uses category query parameters. No shared validated growth destination contract for all requested types. Keep existing UI handlers and centralize public product parsing first. |
| Auth return | PARTIAL / BROKEN | Existing `pendingGuestIntent` is persisted and consumed after login. Product actions reset path to Home; `focus-product` scrolls the feed. Stored intents have no allowlist/expiry. |
| Referral links / seller referral | MISSING | No canonical referral token, recipient lifecycle, reward, or seller referral cohort. Do not add incentive or automatic invitation infrastructure. |
| Conversation rich sharing | IMPLEMENTED | `src/chat/rich-content.js`, `backend/conversation-references.js` support product/reel/short/collection and authorized order/payment/delivery references. Reuse these live cards. |
| Conversation invitation | MISSING | Conversations require canonical participants/devices. Public links must never confer private access. |
| Shopping Rooms | IMPLEMENTED / PARTIAL | `backend/encrypted-shopping-rooms.js`, `src/chat/room-session.js`, `src/chat/rooms-ui.js` implement encrypted roster transitions, admin membership changes, consent/acceptance, polls, products, history boundaries and blocks. External bearer invitations and scoped guest previews are missing. A token must not substitute for MLS admission. |
| Demand / Opportunity | IMPLEMENTED / PARTIAL | `backend/search-demand-service.js`, `backend/db.js:recordSupplyResponse`, rediscovery eligibility and commerce goals link search cohorts, opportunity, response and product. Full per-buyer resolution funnel/reporting is absent; DB minimum-audience configuration currently clamps to two although the pure demand service supports one. |
| Seller onboarding / activation | PARTIAL | User verification, product publishing, orders and Opportunities exist. No canonical first-marketplace-value cohort or liquidity dashboard. |
| Creator / Reel sharing | PARTIAL | Video products, playback commerce attribution and rich Reel/Short references exist. Public creator-specific deep links and growth cohorts are missing. |
| Saved / collections | IMPLEMENTED / PARTIAL | Saved likes and public collection tables/API exist. `handleShareCollection` shares a category feed rather than a collection identity. Do not equate a category browse link with a collection conversion. |
| Person follow graph | IMPLEMENTED | Canonical `user_follows`, blocks, public suggestions and `social_analytics_daily` exist. No need for another graph. |
| Notifications | IMPLEMENTED / PARTIAL | Social daily limits, canonical message push outbox, room preference/mute handling exist. Growth reminders/suppression are absent; none should be sent automatically. |
| Attribution / analytics | PARTIAL | Commerce, video, Ads and social analytics have separate domains. No organic share envelope, multi-touch journal or deduped product-share funnel. Never feed growth clicks into Search Demand or paid ranking. |
| Anti-spam / abuse | IMPLEMENTED / PARTIAL | API user/IP limits, CSRF, canonical user blocks and encrypted room quotas exist. Public share creation needs durable per-actor and per-IP quotas. |
| Review / trust | IMPLEMENTED / PARTIAL | Reviews require delivered buyer orders and dedupe in `backend/server.js` and DB. Review-driven acquisition measurement is absent. |

## Implementation boundary

Phase 1 adds opt-in, durable public product-share records and versioned events; a validated public product destination; bounded browser event retries; human/crawler and self-touch filtering; multi-touch storage; consent-driven external sharing; safe auth intent validation and product context restoration; an admin aggregate report; and preview eligibility protection. Existing links work without growth services. No notifications are generated.

Phases 2–4 remain gated. In particular, external room invites need expiring/revocable tokens *and* device-bound MLS admission, current block/room checks, scoped guest preview policy and canonical acceptance before success. Existing rich cards and room transitions remain the implementation owners. A generic public `SHOPPING_ROOM` redirect is not an admission mechanism.

## Production evidence still required

Real PostgreSQL concurrency/load tests, regional deep-link timing, production flag/config verification, privacy/block checks under concurrent moderation, cross-device attribution policy, full loop cohorts/retention, all later-phase dashboards and load/chaos tests remain release gates. Source/unit/browser evidence must not be described as production traffic evidence. Registration/opening alone is not a sale or verified marketplace value.
