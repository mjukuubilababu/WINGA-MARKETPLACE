# Growth Loops — Phase 4 and full-spec handoff

Date: 13 October 2026. Source baseline:
`5c0394b4b8f6d73811a182660a9240a78977c08f`.

**Phase 4 implementation/hardening complete; live acceptance remains open.**
The repository retains source coverage for all 106 sections. That is not full
production acceptance. Messages, genuine participation/value, independent
security review, deployed capacity/operations and mature retention remain the
explicit gates in [the readiness ledger](winga-growth-readiness.json).

## Audit and canonical owners

| Capability | Classification / resulting implementation | Boundary |
| --- | --- | --- |
| Public Profile, Collection, Reel/Short routes | IMPLEMENTED, reused | One validated growth contract/router; immediate public value and safe unavailable fallback. Opportunity remains seller-authorized. |
| Collection sharing | IMPLEMENTED, reused | Public published collection identity, common opaque share envelope and outbox. Legacy category links still browse a category; they are not counted as collection shares. |
| Collection → Product → Save | PARTIAL → IMPLEMENTED | A successfully opened member product retains a bounded parent context. Its save uses the existing `shared_content_saved` event, verified against current membership, public eligibility, nonself recipient ownership and post-share canonical like evidence. |
| Reel/Short save feedback | BROKEN → CONNECTED | The existing runtime method had no Save mutation call. It now runs only after the canonical like API confirms `liked:true`, while the originating account/session still owns the operation. |
| Creator value and next publication | PARTIAL → IMPLEMENTED MEASUREMENT | Existing content-loop admin reports now separate server-verified recipient follows/saves and later eligible public first approvals from view proxies. |
| Seller utility referral | IMPLEMENTED, reused | Existing opaque envelope, relevant Opportunity reason, expiry/revoke, blocks/report, quotas, five-minute reuse, durable measurement jobs and reconciliation remain canonical. |
| Seller first-value integrity | PARTIAL → HARDENED | Refunded order starts could be counted as value. The shared value predicate now requires an active, unblocked nonself buyer and matching product seller; cancelled/refunded orders are excluded. |
| Async account/navigation isolation | PARTIAL → HARDENED | Late save success/failure cannot attribute or roll back another account/session. Late creator reads cannot replace a newer destination. Closed Collection actions cannot share; failed product lookup remains retryable. |
| Follow auth return | IMPLEMENTED, explicit | Guest Follow retains a validated Collection/Profile return destination. Authentication is needed for Follow/Save, not for seeing public products. |
| Rich internal sharing | SOURCE PREPARED / LIVE BLOCKED | Existing structured cards and recipient search remain in Phase 2. No second message transport or Room membership system is introduced. |
| Contacts, rewards, generic invites, creator incentives/collaborations | SCOPED | No contacts upload, unsolicited invite, cash reward, urgency trick or automatic posting is added. These are conditional future capabilities. |

This phase reuses `growth_shares`, `growth_events`, the canonical public
Collections/items, likes, follow graph, product approval timestamps, Opportunity
referrals and existing outbox/jobs. There is no new migration, notification
provider, demand engine, ranking system, event queue or invite infrastructure.

## Collection save contract

The version-one `shared_content_saved` envelope may carry `productId` **only for
a Collection save**. The server validates that the product is still a current
public member, the recipient owns a canonical nonself post-share save and current
safety allows access. Membership validation follows the final share safety read;
an intervening removal cannot authorize value through an earlier snapshot.
The product ID is checked at intake, then discarded from the growth event row:
no private saved-list history or product payload is exported into analytics.

The browser preserves first/last journey context and chooses the latest relevant
Collection/creator Save source. It keeps at most 20 opened member-product contexts for 30
minutes. It records context only after the actual destination opens; failed
lookup, closed dialog and account change do not create it. Guest-to-auth transition
can retain the same-tab journey; logout/account switch clears it. This memory-only
context does not invent cross-device or reload linkage. Missing context/analytics
does not stop the product, Save, Follow or external share from working.

Native/clipboard Collection sharing snapshots the originating account/session
before an async collection read. A stale response cannot hand off a share or show
completion for a replacement account. Prepared share commit retains the existing
runtime actor check.

## Creator feedback report

`GET /api/admin/growth/content?type=REEL|SHORT` retains the existing authenticated,
no-store aggregate report and adds `creatorValue`:

| Field | Meaning |
| --- | --- |
| `sharedCreators` | Distinct active creators with currently public shareable content in the 30-day share cohort. |
| `withVerifiedRecipientValue` | Distinct creators receiving accepted authenticated server-verified Follow/Save evidence after their share. |
| `withVerifiedFollow` / `withVerifiedSave` | Separate creator counts; repeated events or multiple shares do not inflate these into additional creators. |
| `publishingAfterValue` | A later known first approval of currently public ready content exists after that creator's first observed verified value. |
| `timeToNextPublicationSeconds` | Nonnegative ledger interval to the earliest qualifying next publication, or null. |

This is an observed association, not proof of reach, content usefulness, causal
retention or revenue. Legacy approvals are unknown. Ordinary products need not
become sales content: ready video/Photo Reel eligibility remains canonical, and
no popularity signal is written to Feed/Search/Ads. D1/D7/D30 observations still
use the existing maturity-safe cohort reporting; no days of retention are invented.

## Seller referral integrity

One fixed-column value predicate is reused for candidate selection and final
measurement. A Save needs an active nonself saver, no symmetric seller block and
a canonical post-approval timestamp. An order start additionally needs matching
product seller, non-cancelled status and non-refunded payment status. This remains
a marketplace signal, **not a paid sale or delivery claim**. Existing stable event
IDs, bounded retries, creation reconciliation, expiry and source timestamps remain.

## Isolated verification and reproducibility

[Machine-readable evidence](evidence/growth-phase4-isolated-20261013.json) retains
source hashes, adapter provenance, pass counts and scope limits.

- Phase 4 SQL/runtime/UI contracts run with PGlite and disposable PostgreSQL 18.6.
  They cover public/private/empty Collections, canonical membership and post-share
  Save proof, duplicate events, bot/self rejection, follow values, creator count
  dedupe/publication eligibility, referral safety/expiry/analytics outage and
  inactive/blocked/refunded/foreign-seller value rejection.
- Frontend core includes canonical Save confirmation, analytics failure isolation,
  stale success/failure account/session handling and creator destination races.
- Native dialog behavior is checked in an isolated Chromium fixture: Collection
  public value/auth return and Collection → Product → confirmed Save retain the
  parent while attribution APIs return 503. This is a synthetic local exercise,
  not real acquisition, Messages delivery or a production canary.
- Dashboard, localization, static build and 98-module bundle synchronization are
  verified. New creator fields render as text; unavailable remains unknown.
- Phase 3's 23 isolated demand/restock/seller checks remain a regression gate.

Recorded local checks: 28/28 full sharing/auth Chromium scenarios (48.4s),
63 Phase 4 contracts on disposable PostgreSQL 18.6,
153/153 frontend core, 5/5 dashboard and four catalogs with 1,759 matching keys
(version `2026.10.13.5`, zero new hard-coded debt). The final membership-removal
guard and private Collection exclusion are explicit contracts. Source hashes and
adapter provenance are retained in the accompanying machine-readable evidence.

Run `npm run test:growth:phase4` for the isolated adapter, or
`npm run test:growth:phase4:postgres` to own a pinned loopback-only PostgreSQL 18.6
container. The runner does not read `DATABASE_URL`; it drops fixture schemas and
removes its owned container. Full Growth CI includes the new UI/SQL/runtime checks
and browser scenario; existing Messages/security checks remain mandatory.

## Post-CI auth-return hardening

The first Phase 4 CI run exposed a timing race in the existing member Search
scenario: login started a product return read, the user closed that product and
started a new Search, and the delayed read reopened the product over the Search
notification action. Product auth return now snapshots account/session, URL,
view and Search input and abandons an obsolete response after the context changes.
An unchanged context still resumes the original destination/action.

The browser regression deliberately holds the canonical product response during
login, starts Search, then releases it and observes auth-return completion before
asserting the notification action stays accessible. Reopening the internal Share
picker now removes the previous closed dialog synchronously, so queued native
close events cannot leave duplicate recipient selectors/heading IDs. Its browser
scenario asserts one picker after consecutive opens. These checks use ordinary clicks,
without forcing click-through or increasing the timeout. Frontend behavior checks
cover changed Search/navigation/view/session and a successful unchanged return.

## Full-spec completion boundary

All four implementation phases and all 106 specification sections have durable
source/evidence references. **Do not equate this with section 106 acceptance.**
Remaining mandatory evidence:

1. MSG-01: user-reported Messages completion, real individual delivery and native
   membership/device readiness; rich sharing cannot be accepted on mocks alone.
2. LIVE-01/02/03/04: genuine authorized Product/Room/Demand/Restock/Collection/Creator/
   Referral journeys with meaningful participation and value. User-supplied handles
   are not app sessions; no test-user impersonation or synthetic production demand.
3. SEC-01: exact final-source SARIF and actual independent source/crypto review.
   Previous triage/indexes are navigation evidence, not approval. No waiver or
   review-policy relaxation is introduced.
4. OPS-01/CAP-01: deployed regional timings, provider/restart/recovery and staged
   capacity/abuse exercises with budgets, cancellation and canonical alerts.
5. RET-01: real cohorts reach D1/D7/D30 maturity; evaluate network utility, trust,
   abuse and opt-outs separately from invitations or registrations.

These are recorded for later resumption in the ledger and main status report.
Historical local/CI evidence is preserved with its provenance. No live message,
order, invitation, notification, referral signup, Room participation, provider
outage or production load action is performed by this continuation.

## Rollout and rollback

Use the existing [rollout](growth-loops-rollout.md) and
[operations handoff](growth-operations-handoff.md). Phase 4 already has independent
creation flags `growthCollectionSharing`, `growthCreatorSharing`,
`growthProfileSharing`, `growthSellerReferral` and corresponding backend guards,
plus the canonical measurement/cohort policy. This release preserves their actual
configuration; an implementation is not automatically a broad rollout.

Disable affected creation/measurement through those canonical controls when
operationally authorized, preserving public destinations and existing link
resolution. Roll back code to the preceding verified source without deleting
shares, events, approval history or canonical user content. No schema rollback or
notification fan-out is needed for this phase.
