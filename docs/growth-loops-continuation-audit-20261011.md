# Growth Loops v1.0 continuation audit — 11 October 2026

This audits the supplied 106-section contract against candidate
`45552257c6c9acc702cb58e1a672abd77d1b629f` on `codex/cloud-handoff-growth`.
Read `cloud-handoff-growth-20261009.md` first. Read-only remote inspection
confirms that branch still points to the candidate and master still points to
`e8296dd7c0701fb6f42de44e9a0381bb3ab45cda`; newer master work is preserved.
Managed network policy is enforced and the Render/Cloudflare credentials report
ready. The initial audit and tests were read-only in production. The operator
subsequently authorized commit, push and deployment of the reviewed repair.
Frontend-only promotion requires fresh full CI, real PostgreSQL and strict
CodeQL acceptance. No merge, Growth configuration change, device approval,
CSP change or Phoenix scaling is authorized.
No agents were used. The operator deferred physical-device tests.

`IMPLEMENTED` means the described source contract exists, not production
acceptance. `PARTIAL` identifies a concrete missing part. Historical defects in
the 8 October baseline audit are not treated as current defects after their
Phase 1 corrections. The matrix below records the current code before this
continuation's fixes.

## Canonical capability inventory

| Capability | Classification | Current evidence and boundary |
| --- | --- | --- |
| Product external share | IMPLEMENTED | `app.js:handleShareProduct` reuses native sharing, copy and plain-link fallback. `src/growth/runtime.js:prepareShare` queues a durable envelope only after handoff/copy. Native cancellation and alert-only fallback do not count as creation. |
| WhatsApp product share | IMPLEMENTED | The explicit `share-whatsapp` action opens a user-controlled composer with a public product link. It does not choose recipients, send a message or prove delivery. Seller contact is a separate canonical action. |
| Public product deep links / guest first | IMPLEMENTED | `src/growth/contract.js` validates PRODUCT destinations; the app opens detail directly with a bounded direct lookup. Backend eligibility checks protect previews. Product access is independent of attribution, flags and login. |
| Deep links across other types | PARTIAL | PROFILE, REEL, SHORT, COLLECTION, OPPORTUNITY, CONVERSATION and SHOPPING_ROOM are deliberately rejected by the Growth destination contract until their canonical destination/access handlers are connected. Existing app routing must be reused rather than duplicated. |
| Auth return | IMPLEMENTED / PARTIAL | The canonical bounded, expiring auth-intent allowlist returns to product/person context. There are no accepted public room-invite handlers to return to. Real-device auth-return acceptance remains deferred. |
| Common envelope and multi-touch attribution | IMPLEMENTED / BROKEN | Versioned opaque share IDs, bounded first/last-touch journal, server-created entry/reshare events and independent organic attribution exist. Synthetic reproduction confirms a prepared share can complete under a different account and a reload can retain the former account's journey. These are the selected repair boundaries. |
| External invite links / shared token infrastructure | MISSING | No reusable public room invitation/token admission flow exists. Private access must continue through canonical device/MLS membership. Do not treat a public room redirect as admission. |
| Buyer / seller referral links | MISSING | No referral-token lifecycle or first-value cohort. Seller shop sharing points to an existing approved product; it is not seller-referral attribution. No incentives or automatic invites are introduced. |
| Conversations structured cards | IMPLEMENTED / PARTIAL | `src/chat/rich-content.js`, `rich-ui.js`, `backend/conversation-references.js` and the existing encrypted send path support product/reel/short/collection and authorized order/payment/delivery references. Product-surface selection of recent canonical contacts/rooms is missing. No alternative message writer is needed. |
| Shopping Room invitation architecture | IMPLEMENTED / PARTIAL | `backend/encrypted-shopping-rooms.js`, `src/chat/room-session.js` and `rooms-ui.js` own roster review, device-bound admission, accepted membership, encrypted products/polls, preferences and leave/remove. External expiry/revocation tokens and scoped guest invitation previews are missing. Room history remains private. |
| Meaningful Conversation / Room loop attribution | PARTIAL | `shared_product_message_started` records intent, not a verified reply. Room invite/accept/first-participation loops and full meaningful-message continuation attribution are absent. Growth must not inspect encrypted bodies. |
| Demand / Opportunity / supply response | IMPLEMENTED / PARTIAL | `backend/search-demand-service.js` and `backend/db.js:recordSupplyResponse` own search signals, opportunity/response/product linkage and commerce goals. The complete per-buyer resolution graph/cohort is missing. DB audience normalization still clamps to two while the pure service permits one. One signal must remain distinct from high confidence. |
| Seller onboarding / activation / liquidity | PARTIAL | Publishing, verification, inventory, orders and opportunities exist. First-useful-value seller cohorts and complete category/region liquidity reports are absent. Listing totals are not evidence of supply quality. |
| Creator / Reel / Short sharing | PARTIAL | Canonical video/product playback, commerce attribution and rich references exist. Dedicated public creator/content destinations and creator-value cohorts are missing. Upload or view counts do not establish creator value. |
| Saved / collections | IMPLEMENTED / PARTIAL | Canonical likes/saved state and authorized collection catalog/reader exist. `app.js:handleShareCollection` still shares a category feed, not a specific collection identity. Preserve old links and do not label them collection conversions. |
| Person-to-person following | IMPLEMENTED / PARTIAL | `user_follows`, symmetric blocks, public suggestions and `social_analytics_daily` already exist in `backend/db.js`. Explainable future creator/category recommendations and Growth follow cohorts are separate missing work; another follow graph would duplicate the owner. |
| Notifications / exact return destinations | IMPLEMENTED / PARTIAL | Existing notification handling, durable message push jobs, muted Room/direct preferences and social limits exist. Growth-specific recipient fatigue, cross-channel frequency policy and invite reminder suppression are missing. This continuation schedules/sends no notifications. |
| Analytics / loop-health reporting | IMPLEMENTED / PARTIAL | `backend/growth-store.js:readGrowthHealth` and admin-only `/api/admin/growth/health` report aggregate product funnel, canonical save/order-start evidence, cohort rates and observed deep-link timing. Viral coefficient is null because actual delivery is unknown. Full per-loop dashboards and D1/D7/D30 cohorts are missing. |
| Anti-spam / abuse | IMPLEMENTED / PARTIAL | Growth actor/IP/day quotas, event dedupe, known crawler/self-touch exclusions, CSRF, canonical blocks, eligibility, revocation and room creation limits exist. Account-farm resistance and future invite/referral-specific recipient suppression require further evidence/design. Existing filters are not comprehensive fraud certification. |
| Reviews / trust | IMPLEMENTED / PARTIAL | Canonical review authorization requires eligible delivered buyer orders and dedupe. Review-driven acquisition/retention reporting is absent; Growth must not synthesize reviews or purchase truth. |
| Performance / retry / failure isolation | IMPLEMENTED / PARTIAL | Core destination/plain sharing survives unavailable analytics; bounded durable retry/dead letters and deep-link client timing exist. Share-sheet/link-creation/auth-return/invite-accept instrumentation, regional SLOs, sustained load and full chaos acceptance remain open. |

Existing rich cards, follow graph, device admission, notification outboxes and
Search Demand already have canonical owners. Building parallel replacements
would create duplicate infrastructure; no such replacement is introduced.

## Fresh readiness evidence and its limits

The operator supplied Render Shell screenshots of the exact hash-checked
`45552257` verifier running in the existing WINGA backend. Visible aggregate
output reports `ok: true`, `canaryReady: true`, two required/applied migrations,
zero issues in all seven integrity counters, no alerts, sharing/measurement
enabled, allowlist size two and guest measurement disabled. It reports no
database writes or flag changes. This is transcribed operator evidence, not an
independently captured complete stdout/exit status.

The reported 30-day window has zero shares, recipient journeys, canonical
values and timing samples. Therefore it does not prove an end-to-end product
loop, conversion, meaningful participation, real-device authentication return,
regional performance, production capacity or the full Definition of Done.
It binds to the reviewed verifier, not any subsequent changed source.

## Selected increment and release boundary

Repair Phase 1 attribution identity isolation before adding another loop:

1. Bind a prepared share to the account/auth-session that initiated it. A late
   native/clipboard completion after logout, account change or session replacement
   must not create an attributed share for the new identity. Plain destination
   access/sharing remains usable.
2. Persist only the journey's account owner with the existing session-scoped
   journal, clear a former authenticated owner's journey across reload and
   preserve intended anonymous-to-login continuity. Do not persist auth tokens
   or device credentials in Growth storage.
3. Keep client preparation/commit idempotent and stop late work after runtime
   close or the existing creation kill switch. Existing durable event IDs and
   server dedupe remain authoritative.

These boundaries address sections 34–35, 46, 51–54, 84–85, 100 and invariant 8.
Tests use synthetic local identities; this is not phone or production acceptance.
Changes are prepared on the handoff worktree. Frontend promotion is separately
authorized and gated as described above; no backend deployment or merge is
part of this increment.

## Prepared repair and verification

The selected increment is implemented locally in `src/growth/runtime.js` and
`app.js`, with the canonical generated `winga-modules.js` synchronized. The
account owner is persisted alongside the existing session-scoped journey;
auth-session credentials remain only in memory. App login/logout transitions
notify the optional Growth runtime without making authentication depend on
analytics. A native/copy completion is bound to its initiating account/session,
commits at most once and cannot enqueue after close or a disabled creation flag.

Same-owner reload and the known guest-to-login journey retain attribution.
An old journal without an owner is discarded instead of guessing who owned it;
this drops that unverifiable local attribution history, not product access or
valid shared URLs. A removed authenticated owner's journal is cleared and its
anonymous attribution session rotated before another account can use it.

| Local check | Result |
| --- | --- |
| Growth policy / external handoff / runtime / SQL-API-verifier | 43 passed: 5 + 3 + 19 + 16, zero failures or skips |
| Runtime regression baseline before repair | 8 failed / 10 passed in the initial 18-case run; the final 19-case runtime suite passes |
| Actual app native/copy and session-transition handlers | Included in the runtime suite: changed-account completion is rejected; analytics-hook failure does not break session changes |
| Frontend core and behavior | 145 + 80 passed |
| Chromium guest sharing under attribution outage / exact auth return | 2 passed against disposable localhost file-store backend |
| Public-soak safety regressions | 12 passed; no production load generated |
| Localization | Four catalogs, 1,635 matching keys, zero new hard-coded UI debt |
| Canonical frontend module bundle | 95 modules synchronized |
| Diff whitespace / protected configuration / newer-master files | Passed; backend, Growth configuration, CSP shell and workflow untouched; master deployment workflow/docs and video harness preserved exactly |

Detailed sanitized counts and source hashes are in
[`evidence/growth-attribution-identity-20261011.json`](evidence/growth-attribution-identity-20261011.json).
The first browser attempt stopped before tests because backend dependencies
were absent (`ioredis`); installing the locked local test dependencies resolved
startup and the two cases then passed. Leaf Node suites were also invoked
directly because this runtime's `node --test` summaries count some files instead
of reporting their individual tests.

The SQL/API suite uses PGlite and no SQL/backend contract was changed. These
checks are not fresh independent PostgreSQL contention, a new candidate CI or
CodeQL source binding, an independent audit, or physical-device production
acceptance. The prior successful CI and one-time production verifier remain
evidence for `45552257`, not certification of this local patch. Fresh candidate
CI/security acceptance is required before any later promotion.

Phase 2 should subsequently connect product-surface recent canonical
contacts/rooms to existing rich send/product commands. External room invites
need a separately reviewed token/preview/admission design before rollout.
Phases 3–4, complete dashboards/cohorts, production canary/load/chaos and
independent cryptographic acceptance remain unfinished. Deferring the phone
tests does not satisfy those gates or require enabling a new production loop.
