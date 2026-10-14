# Winga Growth Loops — full specification status

Updated 14 October 2026. Covers the complete v1.0 specification, sections 1–106.
**Source implementation is prepared across all four phases. Full production
acceptance is still open.** Coverage of 106 sections is an evidence map, not 106
passed production checks. The [canonical ledger](winga-growth-readiness.json)
retains each section, classification, evidence and remaining work IDs.

The user deferred live Messages/Room testing because Messages is incomplete, and
explicitly deferred video failure investigation. This report does not override
those instructions. No live buyer demand, purchase, message, referral, Room
participation, notification delivery or mature retention is fabricated.

## Completed implementation by phase

| Phase | Implemented / prepared in canonical source | What remains for acceptance |
| --- | --- | --- |
| 1 | One validated deep-link contract/router; direct guest-first public Product; internal/external/WhatsApp/copy sharing; opaque versioned attribution, first/last relevant touches; safe auth return; asynchronous measurement; quotas, dedupe, current safety/block checks; crawler exclusion; legacy URLs and unavailable fallback. | Real opted-in human Product journey and confirmed value; regional performance, actual operations and independent review. |
| 2 | Individual/recent conversation/Room recipient picker and search; rich live cards; same-ID retry with accurate pending/accepted states; stale account/session/dialog guards; native Room invite preview/token expiry/revoke/quotas and canonical MLS admission; Room participation attribution and useful purpose/design. | Complete Messages and trusted-device/native membership readiness; actual individual delivery/reply/read, first real Room and meaningful participation. Source fixtures are not live completion. |
| 3 | Legitimate N=1 Demand with confidence semantics; owned Search→Demand→Opportunity→Response→Product→Resolution lineage; seller response/value/repeat reports; notify-me and Restock source/availability validation; preference-aware bounded/deduped notices and outage/retry isolation; canonical paid/delivered evidence distinguished from starts. | Actual buyer need, relevant seller response/restock, buyer return and resolution; provider delivery/preferences, relevance/liquidity and mature seller retention. |
| 4 | Public Collections and collection-member save attribution; Profile/Reel/Short routes and save/follow feedback; creator value versus later public publication; utility-based seller referrals with safety/expiry/quotas; canonical first approved product and nonself value; maturity-safe acquisition/return reporting. | Real collection/creator/referral utility, subsequent activity and acquisition cohorts. No earnings or causal impact inferred from upload, click or signup. |

## Every loop: source and remaining proof

| Loop | Existing implementation / measurement | Remaining proof |
| --- | --- | --- |
| 1 Product Share | Entry/open/meaningful view/canonical save or order-start/reshare; guest-first exact Product; auth return. | LIVE-01: real recipient value and onward action; order-start is not sale. |
| 2 Shopping Room | Scoped preview, secure native invite/admission, vote/comment/product/shortlist/order-start/continuation metadata. | MSG-01 + LIVE-02: first actual Room, confirmed membership and meaningful collaborative choice. |
| 3 Conversation | Structured encrypted content cards, stable retry IDs, accepted/read/reply metadata; no private bodies in analytics. | MSG-01: working real individual delivery/reply and meaningful conversation. |
| 4 Seller liquidity | Eligible available supply, category/region search-result proxies, known-first-approval seller activation and nonself marketplace signals. | LIVE-03 + RET-01: relevance, response, genuine fulfillment and improved local liquidity, beyond listing count. |
| 5 Demand→Opportunity→Supply | Canonical source lineage, N=1 confidence, seller response and owned buyer resolution/outcome. | LIVE-03: actual useful supply response resolves an authentic need. |
| 6 Seller Opportunity retention | Qualified response and attributed paid/delivered value; mature distinct repeat-response windows. | LIVE-03 + RET-01: relevance, genuine first value and observed repeat seller behavior. |
| 7 Creator/content | Public ready content share routes; verified recipient follow/save feedback and subsequent publication aggregates. | LIVE-04: meaningful engagement and creator return; reach/revenue/collaboration remain conditional or unproved. |
| 8 Person follow graph | Canonical Person→Person follow, eligible public discovery and nonself save pairs; explainable safe suggestions. | Real useful discovery and repeat engagement; potential supply is not proved impression/notification delivery. |
| 9 Saved/Collection | Canonical public collection visibility/membership, share and verified follow/member-product save. | LIVE-04: real shared curation produces recipient value. |
| 10 Search resolution | Explicit notify-me subscription, matched supply, exact-context return and owner-scoped outcome. | LIVE-03: authentic failed need, actual useful notice and return/resolution. |
| 11 Restock | Legitimate sold-out request, existing Opportunity response, actual public availability and buyer outcome linkage. | LIVE-03: genuine restock/return/order; no artificial demand. |
| 12 Review/trust | Nonself delivered-order eligibility, public moderation/visibility, deduped canonical reviews and aggregate trust report. | Real verified review and downstream trust/utility; ratings alone do not prove conversion lift. |
| 13 Seller referral | Useful actual category Opportunity reason, common opaque link, observed signup/first approved positive-price product/nonself value. | LIVE-04: actual colleague activation and first value; no rewards, self-referral or invented signup. |
| 14 Buyer referral | Reuses utility Product/Room/Collection/content sharing and their value transitions. | Genuine value in the underlying loop; a second generic points/contact-invite system is intentionally absent. |

## Complete section coverage

| Sections | Implemented / bounded evidence | Still open or conditional |
| --- | --- | --- |
| 1–3 | Audit, canonical owners and measurable entry/activation/value/continuation contracts retained. | Real value observation for each deployed loop. |
| 4–7 | Product links, privacy-safe attribution, guest-first open, separate view/save/message/order-start/reshare events. | LIVE-01 human journey. |
| 8–12 | Purposeful Room preview/invite, opaque expiry/revoke token, canonical membership, participation events. | MSG-01/LIVE-02; guest comments/votes conditional, public preview scoped. |
| 13–14 | Canonical encrypted rich sharing and reply/read aggregates, exact-ID retry and late-action guards. | Complete Messages and meaningful live individual delivery. |
| 15–21 | Supply eligibility, activation, N=1 lineage, seller Opportunity value/repeat semantics. | Actual relevance/liquidity/need resolution and mature return. |
| 22–31 | Creator/follow/Collection/Search/Restock/review/utility referral source contracts. | Real utility/retention; creator collaboration/incentives are future scoped work. |
| 32–35 | One deep-link router, safe exact auth return, versioned attribution and bounded multi-touch. | Live cross-surface/context acceptance; no guessed cross-device identity merge. |
| 36–40 | Separate per-loop funnel/activation/value/continuation/time/repeat dashboards. | Genuine value and baseline; no synthetic K-factor or aggregate vanity health score. |
| 41–50 | Consent, quotas/dedupe/preferences, blocks/report/mute/leave/privacy, destination validation and safe fallback. | Production abuse/fatigue observations and independent security; future contacts permission conditional. |
| 51–54 | Failure-isolated destination access, async jobs, stable-ID dedupe, six attempts/backoff/24h TTL, DLQ/replay. Real owned PostgreSQL worker crash/backlog/uncertain-commit cases passed. | Deployed staging/provider outage and operator recovery evidence. |
| 55–63 | No weak-metric rewards; canonical safety/quality/relevance/fairness and category/region/cold-start boundaries remain intact. | Real network quality/density and fairness; incentive fraud defenses conditional until incentives exist. |
| 64–69 | Canonical preference/cap/dedupe and exact destinations; quick internal recipient picker/rich sharing and context guards. | Real provider/recipient behavior, Messages/Rooms and cross-surface acceptance. |
| 70–75 | Feed/Search Demand/Ads separate from attribution; private order boundaries and metadata-only encrypted messaging. | Current independent review and actual native Messages acceptance. |
| 76–79 | Versioned event envelope, stable retry IDs, server dedupe and known crawler/preview exclusion. | Unknown bot/farm detection and production abuse calibration; no universal bot-proof claim. |
| 80–83 | Bounded timing instrumentation, canonical membership before success, revoke/duplicate/block/close races covered in fixtures. | Regional SLO/baseline and actual Room acceptance. |
| 84–89 | Independent flags/kill switches, no deceptive flows, current trust/safety enforcement. | Actual rollout/operator drill; experimentation/guardrails conditional until an experiment exists. |
| 90–94 | Canonical dashboards/cohorts, maturity-safe rates and now read-only aggregate snapshot export; operational runbook. | OPS-01 owner/baseline/scrape/alerts, RET-01 real retention and marketplace utility. |
| 95–97 | Phased implementation, measurement-first reuse, compatibility and rollback procedure. | Controlled live acceptance before scale; deployment is not product acceptance. |
| 98–101 | Isolated browser/SQL/native tests for guest/auth/unavailable/expired/duplicate/blocked/privacy/attribution. | Real journeys, current independent security/crypto review and larger staging abuse exercises. |
| 102–103 | Bounded concurrent resolutions, real PostgreSQL workers/crash/rollback/backlog, local analytics failure/cache/storage/notification rollback evidence. | Controlled deployed capacity, full provider outages and regional performance. |
| 104–106 | Invariants and complete evidence/dependency ledger maintained; final per-loop product questions documented in prior evidence map. | Full production declaration remains blocked by the gates below. |

## Section 106 definition of done

| Required evidence | Current status |
| --- | --- |
| Existing sharing/invite architecture audited | Source audit retained; canonical infrastructure reused. |
| One canonical deep-link system | Implemented; legacy public links retained. |
| Attribution contract | Implemented and isolated tests; real accepted journeys pending. |
| Guest-first shared Product | Isolated browser verified; live cohort pending. |
| Auth return to context | Isolated exact-context/race browser and frontend tests; live pending. |
| Product Share measured end-to-end | Isolated canonical view/save/order-start/reshare proof; LIVE-01 pending. |
| Shopping Room Invite measured end-to-end | Native/SQL fixtures; MSG-01 and LIVE-02 pending. |
| Demand→Opportunity→Supply attribution | Canonical source linked; actual resolution LIVE-03 pending. |
| Seller liquidity metrics | Available, with proxy and confidence limitations; real quality/density pending. |
| Anti-spam/rate limits | Implemented/tested with canonical quotas/preferences; production calibration pending. |
| Duplicate protection | SQL/native/browser retry and concurrency evidence. |
| Block/report/privacy | Canonical rules and isolated tests; independent review and real acceptance pending. |
| Crawler/bot exclusion | Known preview/crawler/self traffic filtered; unknown bots not universally excluded. |
| Notification frequency/dedupe | Canonical policies and isolated rollback tests; actual routing/provider evidence pending. |
| Feature flags/kill switches | Implemented; operator rollout/recovery drill pending. |
| Failure isolation | Local browser and real owned PostgreSQL workers verified; broader staging pending. |
| Deep-link performance | Bounded timing samples; regional SLO/baseline not yet accepted. |
| Load/chaos/security tests | Bounded isolated evidence; CAP-01 and SEC-01 not accepted. |
| Loop dashboards | Canonical dashboards plus allowlisted portable snapshot; OPS-01 still open. |
| No critical Feed/Search/Auth/Conversations regression | Automated isolated gates; Messages remains user-reported incomplete. |
| Rollout and rollback documented | Canonical runbook retained; actual drill/acceptance pending. |

## Remaining gates and order of work

1. **MSG-01:** finish canonical Messages/native readiness; then real individual
   rich-card delivery, reply/read and first Room participation can be accepted.
2. **SEC-01:** obtain actual independent current-source CodeQL/crypto review.
   The previously verified `4d499a5d` scan still reported 54 findings (21 error,
   33 warning), zero independently reviewed, `CODEQL_REVIEW_STALE`. Levels alone
   do not establish exploitability. Source changes require a new exact scan;
   no waiver, forged review or self-approval is introduced.
3. **LIVE-01/02/03/04:** real opted-in Product, Room, Demand/Restock and
   Collection/Creator/Seller Referral journeys with meaningful value. Provided
   handles are not authenticated app sessions. Existing consent need not be
   requested again; access/readiness and genuine actions are still required.
4. **OPS-01:** actual ownership, approved collection/storage, minimum sample,
   regional baseline and calibrated existing alert integration. Manual export is
   implemented; no recurring monitor or external alert is activated.
5. **CAP-01:** controlled deployed staging, explicit traffic budget/stop
   conditions, native burst/abuse/provider/cache/restart/recovery exercises.
6. **RET-01:** real mature D1/D7/D30 cohorts, seller repeat response, opt-outs,
   abuse and regional/category utility. Waiting windows cannot be replaced by fixtures.
7. **REL-01:** full production definition of done only after the above evidence.

Video failure work remains deferred. Optional rewards, address-book uploads,
guest Room mutation, public private-conversation invites, creator collaborations
and experiments are conditional future product work, not missing mandatory V1
infrastructure to build without a policy or actual use case.

OPS snapshot implementation, exact local verification and resume procedure:
[growth-observability-status-20261014.md](growth-observability-status-20261014.md).
Every open gate remains recorded in the [106-section ledger](winga-growth-readiness.json).
