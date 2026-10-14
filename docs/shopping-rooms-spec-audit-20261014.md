# Shopping Rooms — received-spec audit and foundation gate

Date: 14 October 2026. Source baseline: `633c6b7d786d33e654d4820c26083a930a183da1`.

**New Shopping Rooms features are blocked by §0: Conversations is not
production accepted.** This audit inventories already integrated canonical
Rooms without creating another messaging, realtime, media, social, product or
commerce system.

Input: “WINGA SHOPPING ROOMS — PRODUCTION-GRADE COLLABORATIVE COMMERCE SYSTEM —
SPECIFICATION v1.0”, supplied in this chat. **Sections 0–60 contain text; section
61 INVITE SECURITY is a heading only.** No later wording, final invariants or
Definition of Done were supplied. This is a normalized source-evidence map,
not a verbatim restoration or an invented continuation. New section numbering
must not be substituted by the stored Conversations 0–238 or Growth contracts.

[Machine-readable ledger](shopping-rooms-readiness-20261014.json) preserves every
received section, source references and open gate IDs. IMPLEMENTED means source
exists, not real-user acceptance or independent security approval. FUTURE records
explicitly optional/future/possible scope. Counts are not completion percentages.

## §0 foundation assessment

[Current Conversations audit](conversations-security-realtime-audit-20261014.md)
retains underlying source and acceptance gaps. The operator's reported Messages
incompleteness is not resolved by documentation or a successful deployment.

| Required capability | Assessment | Finding |
| --- | --- | --- |
| conversation identity | ACCEPTANCE_OPEN | Canonical direct vs shopping-room identities exist; no duplicate messaging system. |
| messages | ACCEPTANCE_OPEN | Durable ciphertext routing/store and verified endpoint decrypt exist; real live user flow remains open. |
| realtime delivery | ACCEPTANCE_OPEN | Phoenix routing is integrated; authenticated deployed failure/capacity acceptance remains open. |
| offline/retry behavior | ACCEPTANCE_OPEN | Encrypted outbox/resume/history source exists; real PWA offline/reload acceptance remains open. |
| idempotency | ACCEPTANCE_OPEN | Stable IDs/exact ciphertext, reservations and transition retries exist; fixture proof does not certify all live flows. |
| message ordering | SOURCE_GAP | Room projection uses canonical sequences; direct/mixed timestamp sorting remains a foundation gap. |
| media/voice | ACCEPTANCE_OPEN | Canonical encrypted media and direct voice exist; actual device/media acceptance is open. Room voice/composer integration is a separate downstream Room gap. |
| product cards | ACCEPTANCE_OPEN | Canonical current product references/cards and Room board/comparison exist; real internal sharing acceptance remains open. Room-specific command/card UX is downstream integration. |
| participant identity | ACCEPTANCE_OPEN | Native signed account/device membership and UI identity exist; physical trust approval remains open. |
| unread state | ACCEPTANCE_OPEN | Canonical receipts/current viewport visibility guards exist; real multi-device acceptance remains open. |
| notifications | ACCEPTANCE_OPEN | Generic durable room delivery/mute source exists; granular notification policies/provider acceptance remain open. |
| block/report | ACCEPTANCE_OPEN | Canonical direct block/report source exists; real acceptance remains open. Room-specific report authorization and shared-room block policy are separate downstream gaps. |
| pagination | ACCEPTANCE_OPEN | Bounded canonical paging, replay and endpoint history exist; projection/retention bounds need review. |
| multi-device sync where implemented | ACCEPTANCE_OPEN | Own-native encrypted history sync/recovery source exists; approvals and physical-device acceptance remain open. |

Applicable foundation gaps include direct/mixed timestamp ordering,
presence/typing, device-security notices, reviewed protocol/library and device
key custody, infrastructure TLS verification, retention/erasure policy and actual
trusted-device/media/recovery/load/failure acceptance. Some have existing source;
others require implementation or policy work. This audit does not call all of
them merely “testing”. Independent security/crypto approval remains open.

## Canonical work already present

- Explicit encrypted Room Conversations, signed account/device membership,
  immutable epochs, native approval, exact-ID retries, durable storage/ACK,
  bounded queues/paging, private media and own-native history use Conversations.
- Products/polls/shortlist are encrypted structured commands, deterministically
  projected from committed sender-verified sequence-ordered history. This is
  persistent event-sourced state, not a reason to add duplicate plaintext SQL
  state. Canonical Products/Orders remain external authorities.
- Current catalog hydration and two-to-four-product comparison preserve unknown
  attributes instead of inventing data.
- Ask Seller discloses only selected product/question/requester through existing
  encrypted direct chat. Explicit seller consent and requester relay return a
  verified answer card; seller is not admitted to the room.
- Shared Product/Reel/Short/Collection rich reference cards already exist in
  room chat and reuse WingaRichUi for hydration/navigation.
- Growth invitations reuse opaque links, expiry/revocation, quotas, blocks,
  selected-public-product preview, auth return and native admission.
- Own mute/archive, admin handoff and voluntary leave preserve history and
  canonical commerce obligations.
- Orders shows explicitly shared, individually authorized order references.
  It does not implement group quantities, shared wallets or automatic checkout.

Dated native-only/initial UI reports are historical checkpoints. Later
history/lifecycle/Seller/Growth integration supersedes their older “missing”
descriptions. Existing infrastructure must be reused.

## Actual gaps and decisions required

1. **Creation:** Product/Collection/Reel/Short share-to-create and exact-retry
   first structured product are absent. Current initial creation needs three
   accounts and native device approval. Define personal room creation before
   inviting friends without fake members or weakened native admission.
2. **Shared decisions:** shortlist is per-account/per-share. Repeated product
   shares are separate records. Global product dedupe, shared shortlist policy,
   FINALIST/SELECTED and the full decision summary are absent. User actions
   remain authoritative; hearts/votes are not inferred purchase intent.
3. **Poll authority (§24):** server validates membership/ciphertext/sequences/
   durable acceptance, not encrypted choices. Ballot replacement/withdrawal and
   closure are enforced by verified endpoint projections. The literal
   server-validation requirement is not satisfied by this design. Resolve the
   trust/protocol contract before product/image/multiple-selection extensions.
   Do not introduce server decryption, plaintext-choice upload or client totals.
4. **Safety:** current report store binds direct creator/recipient pairs; room
   subject/member/epoch authorization and UI are missing. Extend canonical
   Safety with explicit selected-content disclosure. Current Room access denies
   an active roster containing a blocked pair; define/test the effect on other
   members. Voluntary leave has its own checks.
5. **Failure isolation:** Room refresh awaits board/catalog/Seller work before
   final UI reconciliation; unknown projection errors can escape the refresh.
   AI being absent alone does not prove dependency-failure isolation.
6. **Product/Seller events:** added-at-price capture, room price/low-stock/
   restock alerts, consent/frequency/dedupe and shared Seller-question reuse/
   expiry are incomplete. Existing Demand subscriptions and exact request retry
   do not establish those full Room workflows.
7. **Notifications/lifecycle:** mentions, granular event preferences, timed mute,
   owner-wide close/archive, historic vote/shortlist treatment and approved
   retention/erasure policy are incomplete. Own archive is not global closure.
8. **Group orders (§34–37):** variant/quantity participants, group-order states
   and commerce integration are absent. Commerce-owned fulfillment,
   cancellation, authorization and payment rules must determine final states.
9. **Optional scope:** budget, AI, in-room search and similar suggestions stay
   future/conditional. Budget is planning information; AI requires confirmed
   context and reviewed E2EE disclosure and can never block core use.

## Complete received-section ledger

Source classifications: BLOCKED 1; PARTIAL 31; IMPLEMENTED 15; MISSING 8; FUTURE 6; INPUT_INCOMPLETE 1.
These are not passed acceptance gates.

| § | Requirement | Source classification | Finding |
| --- | --- | --- | --- |
| 0 | IMPLEMENTATION PRECONDITION | BLOCKED | Conversations source exists, but production-ready foundation is not accepted. Audit existing Rooms only; new dependent feature implementation waits for applicable foundation acceptance. |
| 1 | PRODUCT MISSION | PARTIAL | Private decision-space guidance, chat, board, comparison and polls exist. Complete decision workflow and purchase/group-order experience remain open. |
| 2 | CORE PRODUCT PRINCIPLE | IMPLEMENTED | Versioned encrypted commands produce deterministic persistent board/poll/shortlist projections from committed verified history. This is structured event-sourced state, distinct from free chat. Canonical Products and Orders remain external authorities; no duplicate plaintext product/poll database is required. |
| 3 | EXAMPLE EXPERIENCE | PARTIAL | Five conceptual tabs and product/poll/shortlist surfaces exist. Product reactions/discussion, live rich chat cards and complete decision UX are not equivalent to the illustrated example. |
| 4 | ROOM TYPES | PARTIAL | One generic canonical room architecture exists. Optional template configuration and roomType UX metadata are absent; WEDDING/BABY/etc. must never become separate backends. |
| 5 | ROOM CREATION | PARTIAL | Rooms list creation and sharing into existing rooms exist. Product/Collection/Reel/Short share-to-create entry and exact-retry initial structured product attachment are absent. Initial creation currently requires three accounts and device approval; this differs from creating a personal room before inviting friends. |
| 6 | ROOM MODEL | PARTIAL | Canonical encrypted conversation plus encrypted_shopping_rooms identity/name/revision/createdAt exists. Templates, explicit owner lifecycle/status and update metadata are not the full proposed conceptual model; per-account archive is not room closure. |
| 7 | MEMBERSHIP | IMPLEMENTED | Signed account roles admin/member, native admission, immutable epoch membership, admin transfer and voluntary leave exist. Conceptual OWNER maps to existing admin authority; do not add a second membership/social graph. |
| 8 | INVITATIONS | IMPLEMENTED | Canonical native admission and shared Growth invitations have expiry, revocation, quotas, blocks and selected-public-product preview. Link creation is admin-only, which is an explicit current permission boundary. |
| 9 | NON-USER INVITATION / ACQUISITION LOOP | PARTIAL | Guest scoped product preview, auth return, join request and invite/participation attribution source exist. A request is not canonical membership or activation; real room participation/continuation acceptance is open. |
| 10 | PRIVACY | IMPLEMENTED | Sharing a seller product does not grant room membership. Ask Seller bridges selected question/product through encrypted direct chat with consent, without room history/roster/title disclosure. |
| 11 | ROOM NAVIGATION | IMPLEMENTED | CHAT/PRODUCTS/POLLS/SHORTLIST/ORDERS tabs exist. The Orders surface contains authorized canonical references, not collective purchasing. |
| 12 | CHAT | PARTIAL | Canonical encrypted room messages/files, typed room commands and shared product/Reel/Short/Collection reference cards exist. Room composer does not expose the complete direct voice/reply/reaction/translation workflows. |
| 13 | SOCIAL BEHAVIOR MUST REMAIN NATURAL | PARTIAL | Text/files and rich discovery references support natural conversation. Voice recording/playback, reactions and replies still need shared canonical composer integration. |
| 14 | PERSISTENT PRODUCT BOARD | IMPLEMENTED | Committed verified product-share commands project to the persistent Products surface independently of chronological scrolling. Optimistic/pending sends never count as committed products. |
| 15 | ROOM PRODUCT MODEL | IMPLEMENTED | Product share records preserve canonical productId, sender, logical message/share ID, sequence, optional historical snapshot and removal state. Existing encrypted projections are canonical; no duplicate plaintext product table is needed. |
| 16 | LIVE PRODUCT STATE | PARTIAL | Products hydrate current authorized catalog price/availability/stock, and missing products remain unavailable. This is view refresh, not a proven realtime room subscription for price/low-stock/restock transitions. |
| 17 | PRODUCT SNAPSHOT VS CURRENT STATE | PARTIAL | Codec supports an explicitly historical lightweight snapshot and keeps catalog truth separate. Current product-share UI/internal share sends snapshot:null, so added-at-price capture and price-drop event truth are not complete. |
| 18 | PRODUCT INTERACTIONS | PARTIAL | View/shortlist/compare/Ask Seller/remove exist. Product-scoped social reactions/discussion, product-linked polls, buy/reserve integration and complete context-aware actions remain open. |
| 19 | SHORTLIST | PARTIAL | Per-account shortlist selection is persistent and replacement-safe for each shareId. UI filters the caller's selections. Repeated shares of one product are distinct records, so room-global dedupe and shared-shortlist policy are unresolved. |
| 20 | DECISION FUNNEL | MISSING | No explicit persistent FINALIST/SELECTED room decisions were found. Likes/votes/shortlist are not purchase intent; define authorized user actions and shared state without inference. |
| 21 | DO NOT OVER-AUTOMATE DECISIONS | IMPLEMENTED | Current shortlist and votes follow explicit user commands; no automatic selected state or inferred order is introduced. |
| 22 | POLLS | PARTIAL | Text options with one account-scoped ballot, replacement/withdrawal and close exist. Structured PRODUCT_OPTIONS/IMAGE_OPTIONS and multiple selection are absent. |
| 23 | POLL MODEL | PARTIAL | Encrypted structured poll records contain creator/question/options/deadline/closure/ballots. No pollType, allowsMultiple or authorized encrypted image/product option schema is implemented. |
| 24 | POLL CONSISTENCY | PARTIAL | Committed server sequences and verified epoch senders make projection deterministic; one ballot per account is enforced by clients. Server currently validates access/ciphertext/durable send, not encrypted vote semantics. Resolve the literal server-validation requirement without server decryption or trusting client totals. |
| 25 | PRODUCT COMPARISON | IMPLEMENTED | Compare two to four canonical products using actual typed price/currency/stock/availability/size/color/brand/category fields. Shortlist counts are labeled distinctly; product votes are not inferred from text poll labels. |
| 26 | COMPARISON MUST BE DYNAMIC | IMPLEMENTED | Current catalog data is hydrated and explicitly missing fields remain unknown/omitted. No inferred material/quality/stock is substituted. |
| 27 | DECISION SUMMARY | PARTIAL | Product/poll/shortlist counts and comparison exist. A complete shared summary with finalists/selected counts needs the explicit decision model. |
| 28 | ASK SELLER — MAJOR FEATURE | IMPLEMENTED | Explicit selected-product question uses the canonical encrypted direct flow; no seller admission or automatic room disclosure. |
| 29 | STRUCTURED SELLER REQUEST | PARTIAL | Immutable correlated request/answer metadata, signed proofs and ciphertext references exist. Full CLOSED/EXPIRED request lifecycle and expiry policy are absent; do not store question plaintext just to copy the suggested model. |
| 30 | SELLER PRIVACY BOUNDARY | IMPLEMENTED | Seller receives chosen product/question/requester through direct E2EE. No room title/ID/roster/history is disclosed to the seller by the bridge. |
| 31 | SELLER RESPONSE CARD | IMPLEMENTED | Seller consents to sharing; requester explicitly relays answer into the Room. Canonical accepted message ID, signer, product/question and hashes are verified before structured projection. |
| 32 | AVOID DUPLICATE SELLER QUESTIONS | PARTIAL | Exact IDs prevent duplicate retries of one request; different members can still create different requests for the same question. Room-level semantic request reuse/suppression is not implemented and must preserve encrypted privacy. |
| 33 | INDIVIDUAL PURCHASE | PARTIAL | Explicit canonical order-reference sharing and per-viewer authorized hydration preserve private order details. Complete Room Buy/Reserve entry remains open; references do not grant other members buyer/seller access. |
| 34 | GROUP ORDER | MISSING | No shared quantity/variant collection or canonical group-order service was found. Existing Orders tab is not evidence of collective purchasing. |
| 35 | GROUP ORDER MODEL | MISSING | Canonical group-order and participant quantities/variant references plus Order integration are absent. Requires commerce-owned business rules after foundation acceptance; no message-only order/payment truth. |
| 36 | GROUP ORDER STATES | MISSING | DRAFT/COLLECTING/READY/SUBMITTED/etc. are not implemented as a group-order state machine. Adopt only states justified by approved fulfillment/cancellation/payment requirements. |
| 37 | VARIANT COLLECTION | MISSING | No Room group-order variant/quantity collection was found. Future implementation must use actual canonical Product Variant IDs and validated quantities. |
| 38 | SHARED BUDGET — OPTIONAL V1/FUTURE | FUTURE | Optional planning-only budget is not implemented. It must never become a wallet balance, payment authorization or escrow truth. |
| 39 | ROOM INTELLIGENCE | PARTIAL | Real shortlist/poll counts and current price/stock comparisons exist. A distinct lightweight intelligence module for price changes/common favorites/restock/similar options is incomplete. |
| 40 | INTELLIGENCE MUST NOT BLOCK ROOM | PARTIAL | Optional intelligence is not a prerequisite for chat. Current Room refresh still computes board/catalog work before its final UI refresh; complete dependency-failure/latency isolation is not established. |
| 41 | DECISION ASSISTANT — FUTURE AI | FUTURE | Not implemented. Future assistant is optional and must obey reviewed E2EE disclosure/consent policy; no private content sent to AI. |
| 42 | AI MUST USE STRUCTURED CONFIRMED CONTEXT | FUTURE | No confirmed-criteria/AI context system exists. If implemented, distinguish MENTIONED/INFERRED/CONFIRMED and keep explicit user decisions authoritative. |
| 43 | AI MAY SUMMARIZE ROOM | FUTURE | Catch-me-up AI is future scope. No speculative room summary or server plaintext extraction is introduced. |
| 44 | AI IS NEVER REQUIRED FOR CORE ROOM | IMPLEMENTED | Current room chat/board/polls/shortlist do not require an AI provider. |
| 45 | PRICE DROP ALERT | MISSING | No canonical price-change-to-room alert workflow with opted scope, event identity, dedupe and frequency controls was found. Historical optional snapshots are not price-change events. |
| 46 | LOW STOCK ALERT | MISSING | Stock display exists; room-specific bounded low-stock notification events are absent. Do not manufacture urgency or notify every member repeatedly. |
| 47 | SOLD OUT | PARTIAL | Current unavailable/sold-out state does not automatically remove the committed room share. Room-specific Notify on Restock/Find Similar action wiring remains incomplete. |
| 48 | RESTOCK | PARTIAL | Canonical Demand/restock subscription infrastructure exists outside Rooms. Room opted-in restock event linkage and notifications are not implemented. |
| 49 | SIMILAR PRODUCT DISCOVERY | FUTURE | Optional room similarity module is absent. Reuse canonical discovery later; suggestions must not replace existing shortlist or decisions. |
| 50 | ROOM REELS / SHORTS | IMPLEMENTED | Internal sharing sends canonical structured Reel/Short references; Room chat creates rich cards and reuses WingaRichUi in references-only mode for current authorized hydration/navigation. No multiple-video autoplay is introduced. |
| 51 | VOICE IN SHOPPING ROOMS | PARTIAL | Canonical Conversations voice/encrypted-media infrastructure exists. Room UI currently offers text/file attachment, not the complete shared voice recorder/player workflow. |
| 52 | REACTIONS | PARTIAL | Canonical rich message reaction infrastructure exists elsewhere. Room-native reactions/product preference signals are not fully wired; no reaction is promoted to shortlist/selected/order. |
| 53 | ROOM SEARCH | FUTURE | Rooms list can be searched by name; this is not private in-room message/product/poll search. The latter remains future scoped, authorized endpoint-side search. |
| 54 | ROOM NOTIFICATIONS | PARTIAL | Durable generic room push, own mute, dedupe/retries and exact room destination exist. Mention/poll-end/seller/product/group-order categories, per-event preferences and frequency controls remain incomplete. |
| 55 | MENTIONS | MISSING | No canonical Room @mention parser/recipient binding and privacy-safe prioritized notification path was found. |
| 56 | MUTE | PARTIAL | Canonical account-scoped indefinite mute is implemented with enqueue/dispatch suppression and revision-safe retries. 1-hour/8-hour/week timed expiry and policy-separated critical events are not implemented. |
| 57 | LEAVE ROOM | PARTIAL | Signed voluntary leave revokes server access immediately, rotates membership through retained admin, supports handoff and preserves history. Product/vote state remains historical; treatment of former-member ballots, shortlist and future group-order obligations needs explicit policy. |
| 58 | DELETE / CLOSE ROOM | PARTIAL | Per-account archive and terminal final-owner departure exist. Owner close/archive-for-everyone lifecycle and approved erasure/transactional retention policies are absent; own archive must not masquerade as room closure. |
| 59 | BLOCKING | PARTIAL | Current native room access rejects a blocked pair among active roster owners; it does not silently bypass blocking. This can deny access to otherwise uninvolved members. Explicit shared-room visibility/routing policy and acceptance remain open; voluntary self-leave has separate checks. |
| 60 | REPORTING / SAFETY | PARTIAL | Canonical explicit-consent report store exists for direct pairs, selected messages/media and reporter authorization. Its current SQL binds creator/recipient pairs; no complete Shopping Room/member/epoch report subject or room UI path is implemented. Reuse Safety after defining exact user-selected disclosure; never add universal decryption. |
| 61 | INVITE SECURITY | INPUT_INCOMPLETE | Only the section heading was supplied. Existing invite controls are audited under 8/9; they do not substitute for missing section 61 wording or any later sections. |

## Existing evidence and documentary verification

Per-section paths and open gates are in the JSON ledger. Existing records:

- [Current foundation audit](conversations-security-realtime-audit-20261014.md).
- [Backend/UI integration](shopping-rooms-backend-ui-20261007.md).
- [Bounded actual PostgreSQL Room tests](shopping-rooms-postgres-acceptance-20261008.md).
- [Comparison and consented Seller bridge](conversations-spec-180-181-20261007.md).
- [Own-device Room history](conversations-room-history-20261008.md).
- [Mute/archive](conversations-room-preferences-20261007.md).
- [Voluntary leave/admin handoff](conversations-room-lifecycle-20261008.md).

No fresh runtime tests, live user actions, provider acceptance, physical-device
tests, capacity measurements or independent security results are claimed here.
Prior evidence keeps its exact date and fixture limits. Documentary validation
checks section continuity, source existence, classifications and explicit false
readiness/precondition fields; it does not certify runtime behavior.

## Resumption and publication

1. Close applicable Conversations foundation source/security/operational
   acceptance before implementing new dependent Room features.
2. Resolve poll authority, shared shortlist/dedupe, block/report, room creation
   before invitations and lifecycle using existing canonical domains.
3. After acceptance, extend shared share/create and composer paths, then existing
   encrypted decisions/polls, Safety and notifications.
4. Connect canonical product events and consented Seller reuse/lifecycle.
5. Implement group orders through commerce-owned contracts; keep optional
   intelligence, budget and private room search separately gated.
6. Append received §61+ verbatim when available and re-audit. Existing invite
   controls do not substitute for unknown requirements.

This documentation-only intake needs no application deployment/migration.
Publish on a documentation branch so audit publication does not falsely become
feature activation or foundation acceptance. Existing deployment remains
separate evidence. Device approvals, live messages/invites/load, CA/CSP/library
changes and the one deployed Phoenix instance remain under their canonical
controls. Video failure work remains deferred.
