# Growth operations and security handoff

Prepared 13 October 2026. This is a runbook and acceptance plan, not evidence that
these procedures have run. Messages are user-reported incomplete. No alerts,
reminders, provider calls, disruptive exercise or live message test is activated.
Current tracker: [winga-growth-status.md](winga-growth-status.md).

## Canonical report access

Use the existing admin session and CSRF/auth mechanisms. Never put a token in a
URL, committed file, screenshot, report or chat. Do not reuse the deployment API
credentials as a Winga application admin session. Read-only access is separate
from replay/maintenance mutation permissions.

| Existing surface | Meaning / caution |
| --- | --- |
| Admin Growth dashboard (`src/admin/ui.js`) | Separate product, Room, content, referral, marketplace/network, delivery and cohort reports. Unavailable is unknown, not zero. |
| `GET /api/admin/growth/health` | Product funnel plus canonical rollout summary; opens, activation and value are distinct. |
| `GET /api/admin/growth/events` | Shared event jobs, enabled flag, states, attempt/age aggregates and eligible creation reconciliation gaps. |
| `GET /api/admin/growth/marketplace` | Category/regional liquidity and seller activation; relevance/fulfillment/causality not inferred from listing quantity. |
| `GET /api/admin/growth/network` | Conversation/trust/follow source aggregates; no private message bodies or purchases as public follow content. |
| `GET /api/admin/growth/cohorts` | Authenticated acquisition and maturity-safe retention, not a claim of new causal signup. |
| `GET /api/admin/growth/content?type=…` | Canonical content-specific funnels; only supported types, no invented creator earnings. |
| `GET /api/admin/growth/referrals` | Utility-based seller referral evidence; incentives/future rewards remain absent. |
| Browser `WingaGrowth.getHealth()` | Scoped local pending/DLQ counts; not server delivery or a marketplace-wide dashboard. |
| Browser `WingaGrowth.getTimingSamples()` | Bounded local timing samples; client observations, not trusted regional SLOs. |

No read-only report should automatically replay events, notify recipients or
change rollout configuration. HTTP401/403/503 must be reported as unavailable.
An empty/missing cohort is not a completed healthy loop.

## Manual metrics snapshot (source prepared 14 October)

In the existing admin Growth dashboard, choose **Export metrics snapshot** after
reports load. This writes a local aggregate JSON file on explicit user action;
it does not replay, send alerts or mutate flags. The projection excludes private
IDs/tokens/free text/raw events and small regional/category segments, caps cohort
rows at 60 and retains null/unavailable. Job attempts/age and mature retention
denominators are preserved. Report collection is independent, not atomic.

Record environment and exact deployed source/frontend build beside each file in
the approved operations store. Compare like windows/definitions and maturity.
The download source is tested, but no real admin export, ownership, calibrated
baseline, scrape or alert integration was executed here. See
[growth-observability-status-20261014.md](growth-observability-status-20261014.md)
and the [complete spec status](growth-full-spec-status-20261014.md).

## Baseline and alert proposals

Before activation, assign an owner, environment, measurement window, minimum
sample size and a destination for existing approved operational alerts. Do not
send a new notification or configure a recurring monitor in this work.

Suggested investigation triggers, **not calibrated production SLOs**:

- any sustained dead job population or growing expired/missing eligible source
  gaps; first inspect whether measurement is disabled or the source is excluded;
- pending age approaching the canonical 24-hour deadline, repeated attempts near
  the limit, or growth that outpaces observed processing;
- changes in share creation/deep-link/auth-return/join error rate relative to the
  same controlled cohort and real regional baseline;
- rising blocks/reports/opt-outs alongside invitations; suspend the relevant
  optional reminder/referral path rather than core public access;
- provider failures, unavailable reports or missing timing samples: signal unknown
  evidence and investigate, rather than emitting a zero-value healthy score.

Set actual numeric targets only after regional observations and agreed operational
budgets. Compare organic share/invite metrics separately from paid distribution.

## Replay and reconciliation boundaries

Canonical server jobs use stable event IDs, at-least-once delivery with canonical
ledger dedupe, at most six attempts, bounded exponential delay and a 24-hour
lifetime. They store allowlisted metadata/actor hashes, not plaintext messages,
private tokens, payment fields or copied private histories.

- `POST /api/admin/growth/events/replay` accepts only `eventIds`, at most 50 valid
  IDs; only dead records with a current deadline can return to pending.
- `POST /api/admin/growth/events/reconcile` accepts an empty JSON object and
  reconstructs bounded eligible creation/request/acceptance obligations from
  canonical records. It does not create membership or human participation.
- Browser `WingaGrowth.retryDeadLetters()` replays only current-account eligible
  records with original IDs/lifetimes; it is not a bulk cross-account replay tool.

Require explicit existing admin authorization/CSRF, inspect one bounded batch,
record aggregate before/after and the exact code version, and stop on revoked or
ineligible context. Do not reset lifetimes, forge a source actor, publish event
payloads, resurrect expired invites or count a replay as a new value action.
These procedures are prepared here, not executed.

## Security review packet

Baseline snapshot: commit `32891c76c82914684f5f0ddeb979d2c911e9be8c`,
[workflow run 38423056933](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38423056933),
CodeQL job `115385159157`. The gate reported `CODEQL_REVIEW_STALE`, 54 security
findings (21 error, 33 warning), zero current independently reviewed findings.
Those levels alone do not establish exploitability. No SARIF workflow artifact
was listed for that baseline; detailed triage is not completed by this snapshot.

The workflow now preserves `conversation-codeql-<exact SHA>` SARIF artifacts for
90 days with `if: always()`, including failed review gates. This was observed for
commit `3f3a0314ae2b3a14c3ffd8d7a3c53070d4d69de0`,
[run 38432721903](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38432721903),
job `115418776140`, [artifact 11831752409](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38432721903/artifacts/11831752409).
The scan still reported 54 findings and `CODEQL_REVIEW_STALE`, zero reviewed.

[Safe exact-scan input index](evidence/growth-security-review-input-20261013.json)
retains all 54 gate-emitted locations/fingerprints and the ZIP digest/expiry.
It omits raw SARIF messages/snippets and private payloads. It is historical
navigation evidence; source changes require a new current scan/review. Download
the actual artifact before its 11 January 2027 expiry if continued retention is
needed. Do not import this index into the approval manifest or forge approvals.
A failed scan that produces no complete SARIF remains failed; archive availability
is not a pass.

Reviewer procedure:

1. Select a completed scan of the exact source to review. Record SHA, run/job IDs,
   analysis outcome, tool version and artifact digest. Export/retrieve actual
   SARIF; never reconstruct findings from aggregate counts or hand-written data.
2. Check completeness and current source closure with the existing bounded
   `scripts/check-conversation-codeql.js`. It requires the real analysis outcome
   and uses the source-bound review manifest. Missing/partial/stale remains failed.
3. For each actual occurrence, record rule/location/fingerprint, trust boundary,
   exploit prerequisites, source evidence, disposition and remediation reference.
   Separate a confirmed issue from a reasoned false positive. Crypto protocol,
   identity/recovery, storage and browser/XSS boundaries require appropriate review.
4. Obtain real independent review. Never alter the tree digest alone, attribute a
   new review to historical reviewers, increase occurrence caps to hide findings,
   suppress the parser/gate, or fabricate reviewer identity.
5. Retain the reviewed packet in the approved repository/security evidence store
   before the 90-day archive expires. If it expires or source changes, rerun/export
   the current scan; keep this report as the stable index, not an approval ledger.

[Historical internal E2EE review](e2ee-internal-security-review.md) is a dated
internal report, not current independent cryptographic approval. The production
workflow's functional/BEAM/dependency deployment gates remain distinct from
this unresolved security review. No review waiver is introduced.

## Deferred validation matrix

Run only when prerequisites are ready; capture real evidence at that time.
Synthetic inputs, fixtures and rehearsals must be labeled as such.

| Work ID | Prerequisite / later scenario | Evidence to retain |
| --- | --- | --- |
| MSG-01 | Trusted device/native membership; send/reply, retry after uncertainty, reconnect, revocation, block | Canonical IDs/acceptance/receipt metadata, exact versions, no private bodies or automatic success. |
| LIVE-01 | Opted-in cohort; direct guest product, authenticated save/message/reshare, deleted/suspended content and auth return | Separate public value, activation and confirmed value; crawler opens excluded; zero fabricated purchases. |
| LIVE-02 | Native Room readiness + authorized invite configuration; valid/expired/revoked/duplicate/blocked/private/closed/join races | Canonical membership before UI success, explicit preview scope, real vote/comment/add-product value. |
| LIVE-03 | Legitimate N=1 search evidence + eligible seller response/restock/resolution | Exact owned source lineage, confidence semantics, relevance, nonself activity and actual resolution. |
| OPS-01 | Admin/operational ownership; unavailable reports, bounded dead-letter/reconcile, provider routing/preferences | Unknown remains unknown, original event/action IDs, real baseline and approved alert policy. |
| CAP-01 | Approved isolated staging; explicit traffic budget and stop condition | Viral product/creator bursts, large Room invitation bursts, bot/farm/spam/block/rate-limit probes, analytics/provider outage, cache loss, restart/backlog; core access stays independent. |
| RET-01 | Genuine acquisition and mature calendar windows | D1/D7/D30 denominator/maturity, real utility, opt-outs/abuse, country/category-safe density; no synthetic retention. |

Do not exercise provider outages, node termination, large invitation fan-out or
load against live users. Use owned staging data and the existing canonical runners
when this work is resumed; do not build a parallel messaging or invitation service.

## Rollout and rollback

Retain the [canonical rollout procedure](growth-loops-rollout.md). Read actual
capabilities/configuration before enabling an optional loop; do not presume all
flags are off or silently change the already-consented cohort. Room invitation
signing/configuration and membership approval stay with the native owners.

To halt measurement/optional loop creation, use existing kill switches and retain
public product/legacy link resolution. Never delete durable migration history,
rewrite canonical event IDs, remove membership checks or fall back to plaintext.
Rollback the affected source/services to a verified release while preserving
compatible public URLs and durable records. Record the exact deployed SHA/build,
configuration action and evidence window. No rollback or flag change is performed
by this preparation work.
