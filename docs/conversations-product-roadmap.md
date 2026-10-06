# Conversations: Contract 110-238 Execution

Updated: 2026-10-06. This is an execution/evidence ledger, not acceptance of the
whole contract and not a replacement for the user's requirements.

## Authoritative Sources

- `winga-conversations-spec-0-109.txt`: unchanged foundation source. Its final
  section 110 heading is completed by the new continuation, not a second feature.
- `winga-conversations-spec-110-238.txt`: exact user-supplied continuation after
  newline normalization, with all 129 headings from 110 through 238 verified.
- `encrypted-chat-acceptance-20261004.md`: latest recorded crypto/media/recovery
  evidence and limits, including operator-reported real-device encrypted text.
- `conversations-ui-20261004.md`: current agreed inbox/navigation and room boundary.

The continuation ends with named future Product & Experience and Shopping Rooms
documents. It does not provide those documents, wallet rules, mandatory leave
approval, removal voting rules or a calling protocol. Earlier brainstorming is
not substituted for an approved policy.

## Ordered Work

| Stage | Contract | Scope and gate |
| --- | --- | --- |
| Foundation acceptance | 110, 170, 227-238; existing 0-109 | Close applicable reliability, device/media/recovery, security review and measured acceptance gaps. Existing enabled features are not evidence of full acceptance. |
| Direct and universal inbox | 111-120, 151-169 | Audit existing pairwise identity, summaries, cursor history, read visibility, contact presentation, safety, notification isolation and multi-device reconciliation. Preserve historical semantics; do not reset identities or rewrite history. |
| Rich messages and commerce | 123-150 | Incrementally extend the reviewed encrypted versioned payload, replies/reactions, policy-defined edits/deletes, voice, private media and canonical product/order references. Do not implement fields marked future as mandatory now. |
| Direct delivery and safety | 121-122, 157-159 | Operator override of 121: no Message Requests or recipient-acceptance gate for any new direct chat, including customer, seller and person-to-person entry. Preserve server authorization, quotas, blocks and consented report disclosure. |
| Private Shopping Rooms | 171-189, 216, 224, 234 | Only after stable direct acceptance. Extend canonical conversations with membership authorization, routing, notifications and MLS epoch transitions. Then add products, shortlist, polls and bounded seller interactions. Never expose room history to a seller merely because a product is shared. |
| Optional intelligence | 145-149, 183-185, 190-192, 235 | Future, separately reviewed and privacy-compatible. No server plaintext extraction, silent external AI processing or transactional authority. |
| Experience and rollout | 193-201 | Preserve multilingual/RTL accessibility, bandwidth controls, local-first reconciliation, measured latency and staged feature flags. No invented production SLO result. |
| Cross-cutting invariants | 202-221, 236 | Apply throughout: kill switches, no plaintext fallback, staged legacy migration, privacy-safe observability, durable SENT, exact retry identity, deterministic ordering and canonical commerce authority. |
| Acceptance suites | 222-226, 227-238 | Distinguish unit/browser/local-concurrency results from physical-device production acceptance, load/soak/failure tests and independent review. Do not count passing tests as completed spec sections. |

## First Increment: Read Visibility

Requirement 120 says rendering the inbox is not evidence that a message was read.
The existing focused/visible-tab, matching-thread, bubble intersection, ancestor
clipping and hit-test guards are retained. The exposed defect was the remaining
use of layout viewport dimensions when the visual viewport shrinks or pans.

`app.js` now intersects message visibility with finite positive visual-viewport
width/height and its layout-relative offsets. Browsers without that API keep the
existing layout fallback. Zero/invalid measurements fail closed. Viewport resize
and scroll recheck reads through the existing throttled scroll behavior, allowing
newly visible messages to advance without acknowledging covered ones.

The minimum visible vertical slice remains 40 CSS pixels or the full height of
a shorter bubble, with horizontal intersection and a non-occluded hit-test point.
Focus/visibility/account/thread checks still apply at receipt submission time.
This is a visibility rule, not a claim of human comprehension or a dwell-time rule.
See [VisualViewport API](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)
for the browser's layout-relative viewport measurements.

Regression scope: simulated keyboard/zoom offsets, horizontal clipping, partially
visible bubbles, collapsed/invalid viewport data, throttled viewport changes,
existing account/focus/occlusion guards and actual browser bubble geometry.
These tests are local fixtures, not evidence of a physical Android keyboard test.

No schema, server authorization, protocol, CSP, secret, production flag, room
membership policy or marketplace navigation is changed in this increment.

## Verification: 2026-10-05

- Frontend: 145/145 core checks and 72/72 behavior tests, including all four new
  mobile viewport regressions. The Read tests first reproduced the defect and
  passed after the visibility fix.
- Chat UI: 12/12 browser scenarios, including actual bubble hit testing, keyboard
  layout, desktop, small mobile and RTL. Screenshots retain the approved layout.
- Realtime: 61/61 local transport/reconnect/failure-isolation tests.
- Message pages: 59/59 local ledger, ordering, pagination, replay, receipt and push
  tests. An outdated replay fixture initially lacked `setInterval`/`clearInterval`
  used by encrypted sync; the fixture now models those browser timers separately
  from replay timeouts. A new case proves close clears the interval and a retained
  callback cannot issue late requests. Production replay behavior was not changed.
- Authenticated encrypted browser scenario: passed using cookie-only HTTP, local
  database and synthetic storage, retaining ciphertext-only send, receipts,
  reload, exact retries, media and recovery regressions. This is not a production
  account, private R2 or independent crypto acceptance result.
- Four localization catalogs: 1,404 matching keys each; zero hard-coded UI debt.
- Static build: `20261005121213`; 81 source modules synchronized. No release,
  production migration or feature activation had been performed at that
  verification checkpoint. The subsequent requested release is recorded below.

## Requested Release: 2026-10-05

The operator requested push/deploy before further implementation. The initial
push found two newer remote moderation commits, `d8c451f` and `1256b6e`. The
unpublished local change was rebased onto them without a force-push or dropping
remote work; their focused adapter/dispatcher tests passed 40/40.

Release commit `e6f937b7fad924651a9c981e67c089c241b5ab2b` was pushed to master.
The frontend was deployed with `wrangler.toml --keep-vars`, preserving dashboard
variables and secrets. Live version `20261005121213` matched the built `app.js`
by SHA-256. Cloudflare deployment ID: `11590e9f-6e31-46a3-a53a-b6eb88f4d7e1`.
The existing shell/security-header/route verifier passed. Node `/api/health`
returned HTTP 200, `ok=true`, `readiness=ready`; Phoenix `/health` returned HTTP
200, `ok=true`. Public health does not prove the exact Render commit SHA. No
production schema, encryption flag, room policy or instance count was changed.

## Next Increment: Human Identity Presentation

The direct/inbox audit retains participant-based grouping across product
contexts, bounded summaries/history and scoped cursors; existing tests cover
these boundaries. No canonical identity or legacy-history migration is added.

Requirements 151-152 and 193 exposed two presentation defects: new-contact lookup
ignored canonical profile `fullName`, and generated identity suffixes bypassed
the existing human-name filter. Tests reproduced both before the correction.
New contacts now use the existing display-name resolver with profile `fullName`
as fallback. The existing technical-identity predicate recognizes the reserved
buyer/user/guest/seller timestamp form with optional alphanumeric suffixes.
Chat headers and inbox rows receive that predicate instead of using a weaker
separate rule. Phone-shaped names remain excluded by the existing predicate.
Missing human names use the existing localized `inbox.person` label.

Canonical `username`/`withUser`, read routing, receipt IDs, account validation,
history, keys and transport are unchanged. Ordinary usernames remain usable;
this filter is presentation-only, not proof of identity or verification status.

Local verification passed: 145 frontend core checks, 75 behavior cases (including
three new identity tests now in the CI command), 14 chat-UI browser scenarios,
five full-app inbox/navigation/product-finder regressions and the cookie-only
encrypted HTTP workflow. Four catalogs still have 1,404 matching keys with zero
hard-coded UI debt; 81 modules match local build `20261005123530`.
This follow-on increment was subsequently pushed as `26fb703` and deployed as
version `20261005123530`. Cloudflare version ID:
`8ecd3373-a68a-47f3-aecd-bcc949e898f9`. The production shell verifier passed and
live `app.js` matched the prepared asset byte-for-byte. Backend `/api/health`
reported ready and Phoenix `/health` returned `ok=true`, both HTTP 200. These
public endpoints still do not establish an exact Render SHA. Production/audit
acceptance gates below remain open.

## Next Increment: Refresh Without Interrupting Work

Full-app browser regressions reproduced loss of composer focus on inbox refresh.
Product-context refresh moved the caret to the end instead of preserving the
selected range. The product dialog also clipped long content with hidden
overflow, rather than providing a usable scroll surface.

Inbox refresh now retains focus, selection direction and textarea scroll for
the composer in the same canonical thread. Inbox search retains focus and
selection in the same view. It does not focus a field that was not active before
replacement or carry composer focus into a different participant's thread.
Product chat retains the corresponding selection and dialog reading position
for the same participant. Long product dialogs scroll within their existing
viewport constraints; scroll does not propagate into the marketplace behind.
Readers away from the end stay at their reading position; those already at the
end continue following new content. No server receipt, ciphertext, key,
authorization, schema or feature flag changes are included.

Verification: 145 frontend core checks, 75 frontend behavior cases, 59 message
page/receipt/replay cases and seven real-app browser scenarios passed. Four new
browser cases cover incoming messages while composing and reading at mobile
390px and desktop 1280px, with screenshots. Existing inbox search now tests
selection retention during refresh; pagination retry and mobile navigation also
pass. Localization remains four catalogs of 1,404 keys and zero new UI debt.
The 14 approved-layout browser cases also passed, including small mobile and
RTL. The cookie-only authenticated encrypted browser workflow passed, covering
server membership, ciphertext-only HTTP, chat, receipts, reload and exact retry.
Build `20261005130440` contains 81 synchronized modules. This verification uses
local synthetic data, not a new physical-device production acceptance result.

## Direct Audit Checkpoint: 111-120

| Contract | Evidence and remaining boundary |
| --- | --- |
| 111, direct first | No group service is introduced. Foundation acceptance stays open before Shopping Rooms depend on it. |
| 112-113, people and stable identity | Existing pair-based grouping spans product contexts; immutable sequence bindings and duplicate-group rejection are covered locally. Generated account identifiers are hidden in human presentation only. Canonical identities and old history are not rewritten. |
| 114, universal inbox | Approved navigation is present. Production rooms and calling are not supplied by placeholder tabs. Message Requests are excluded by the latest operator policy. |
| 115, summaries | Paged inbox reads bounded summaries without requesting histories. Future archive and mute fields are not presumed implemented. No request-state partition is required under the current policy. |
| 116-117, ordering and pagination | Timestamp-based inbox order, sequence-based pair preview selection, scoped cursors, ID deduplication and refresh races pass existing tests. This is not evidence of capacity at 10,000 conversations. |
| 118, bounded history | Initial recent-window and older-page routes are covered; older-page retry retains messages. Product dialog overflow and same-thread refresh selection are corrected. Edited/reaction event policy is still a later reviewed stage. |
| 119-120, unread and visibility | Server unread totals, durable device receipt/ACK isolation and non-read paging pass. Rendering the inbox does not mark history read. Visual viewport guards were released separately. Physical multi-device media/recovery acceptance remains open. |

These are scoped evidence checkpoints, not full section acceptance. The legacy
fallback is not a claim that every encrypted room or multi-device lifecycle has
the same protocol contract. Security, capacity and product policy gates below
are retained rather than bypassed with UI-only completion.

## Request Safety Increment: New Encrypted Chats

The 121-122 audit found that cryptographic membership acceptance is distinct from
product consent to a conversation. The operator initially selected direct entry
for Message Seller, then explicitly superseded that distinction with direct entry
for every direct chat: no Message Requests or recipient-acceptance queue. Existing
conversations remain unchanged. The current override is recorded below; the
creation quota is an anti-abuse control, not a request-acceptance policy.

Independent of that policy, new encrypted-group reservation now has an atomic
owner-wide creation quota in the existing PostgreSQL `api_rate_limit_buckets`
table. Default: 20 newly committed encrypted direct groups per fixed UTC hour.
Optional backend configuration: `WINGA_ENCRYPTED_NEW_CONVERSATIONS_PER_HOUR`, an
integer from 1 to 1,000; invalid configuration fails startup rather than silently
disabling enforcement. This is an anti-abuse resource limit, not a reputation
score or plaintext surveillance system. Fixed windows may allow bursts on either
side of an hour boundary; this is not a rolling-window claim.

The hash binds the quota to the account, not a device, session or server process.
The database counter and group/key-package mutations share the same transaction.
Exact retries of an existing reservation bypass new-creation charging. Failed
reservations roll back the charge; blocked pairs fail before consuming it. Existing
messages, receipts, polling, media and device replacement do not use this quota.
An exhausted quota returns HTTP 429 and bounded `Retry-After`, with no provider
details. Chat security shows the localized new-chat limit message and retains
explicit retry without sending plaintext. No new production schema migration,
CSP change, secret or encryption flag is required.

Local verification: 106 encrypted-content checks passed, including the three new
quota cases and rollback, owner/device isolation, block priority and hour renewal.
The 15 UI cases passed; the quota dialog also passed a targeted recheck with the
final dedicated translation. The cookie-only authenticated encrypted browser
workflow passed, retaining native membership, ciphertext-only chat, receipts,
reload and exact retry. Four catalogs now have 1,405 matching keys and zero
hard-coded UI debt. Build: `20261005134108`; 81 modules are synchronized.
The independent-connection PostgreSQL regression has also been added, but cannot
be executed here: no explicit disposable `WINGA_TEST_POSTGRES_URL` or PostgreSQL
launcher is available. Shared-store PGlite SQL tests are not reported as that
missing cross-connection result. This increment is prepared for the requested
push/deploy. Release commit `8b3a358` was pushed and frontend build `20261005134108`
was deployed with dashboard variables preserved. All eight checked live assets
matched the prepared release and the production shell verifier passed. Cloudflare
version ID: `5568f541-efab-4b7d-8a4d-69f6246ddf0a`. Backend and Phoenix health
returned HTTP 200; the operator subsequently confirmed the Render commit Live.
This does not establish acceptance of the overall anti-spam product. Message
Requests are not required under the subsequently revised operator policy.

## Approved Direct Delivery Policy

On 2026-10-05 the operator explicitly replaced the earlier Message Seller-only
exception with direct delivery for every customer, seller and person-to-person
chat. This overrides the Message Requests product requirement in section 121.
Do not add REQUESTED/ACCEPTED/DECLINED routing, an accept/decline inbox, a trusted
commerce-entry exception or a recipient-approval step before direct delivery.
The source spec remains preserved; this ledger records the operator's revision.

The existing implementation has no product-consent request queue to migrate or
remove. Existing chats and identities remain unchanged. Account/session/device
authorization, explicit user blocks, anti-spam quotas, encryption checks and
durable retry remain enforced. Offline delivery and encryption-device setup are
not product-approval queues: do not claim delivery while offline, remove crypto
verification, auto-trust a replacement device or fall back to plaintext to bypass
them. The revised policy removes recipient approval, not these safety boundaries.

## Text And Link Safety Increment: 124-125

The shared inbox/product-chat renderer now preserves line breaks and keeps
Unicode text as text, including markup-looking content. Explicit HTTP(S) links
are parsed locally with the browser URL parser. Credentials, unsupported schemes,
ambiguous backslashes, controls/bidi markers and oversized destinations stay
non-interactive. Balanced URL path punctuation is retained; surrounding sentence
punctuation is not included in the destination.

Links first open a localized confirmation dialog showing the parsed ASCII host
and full destination, including punycode for international hostnames. Both HTTP
and HTTPS destinations require this confirmation. Cancel makes no destination
request and returns focus. No server-side unfurling, external preview service,
image embed or automated plaintext disclosure is introduced. Explicit navigation
uses `noopener noreferrer` and `referrerpolicy=no-referrer`; see the browser
contracts for [noopener](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/noopener)
and [noreferrer](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/noreferrer).
The dialog closes when its owner, session, participant or visible source changes,
and checks again synchronously before ordinary navigation. This is not a malware
scanner or proof that a destination is trustworthy.

Local verification: five dedicated URL/rendering cases, 25 chat UI browser cases
(ten new link scenarios), 145 frontend core checks and 80 behavior cases passed.
Browser checks covered no destination request before confirmation, cancellation,
keyboard activation, empty referrer/null opener in an intercepted destination,
immediate stale-account refusal and small mobile/desktop/RTL geometry. Screenshots
were visually reviewed. The cookie-only authenticated encrypted HTTP workflow
also passed, retaining membership, ciphertext-only send, receipts, reload and exact
retry. Four catalogs contain 1,408 matching keys with zero hard-coded UI debt;
local build `20261005142132` contains 81 synchronized modules. No production
deployment, encryption/schema change or whole-section acceptance is claimed by
this increment. Message Requests are excluded by the subsequent operator policy;
continue with the remaining rich-message contract instead of adding an approval
queue.

## Conversations Inbox Failure Isolation

The operator reported "Try again" on the Conversations list. Local regression
tests reproduced a failure mode where crypto startup or group synchronization
rejected the entire healthy inbox. This is a verified code defect, not a claim
that an authenticated production trace established the exact phone-side cause.

Canonical inbox reads now run independently of encrypted synchronization. A
non-authentication crypto refresh failure preserves the canonical list and
previously verified local encrypted history, with a scoped localized refresh
warning. The refresh action reloads the inbox head rather than attempting an
exhausted older-page cursor. Successful recovery clears the warning. Canonical
HTTP failures are not disguised as a successful empty list; authentication and
session changes still fail closed. Partial refresh retains cached encrypted rows
without resurrecting removed legacy rows. Deferred runtime startup checks server
membership before selecting send transport, so a pending encrypted membership
cannot become a plaintext send. No Message Requests or recipient-consent queue
is introduced for new customer, seller or person-to-person messages.

Local verification: 66 message-page/receipt/replay cases, 26 chat UI browser
cases, 145 frontend core checks and 80 behavior cases passed. The authenticated
cookie-only encrypted browser workflow passed, including the deferred-startup
no-plaintext regression, send, delivery/read, retry, media and recovery. The
recovered inbox screenshot was visually reviewed. Four catalogs contain 1,410
matching keys with zero hard-coded UI debt. Build `20261005145432` contains 81
synchronized modules. This increment was pushed as `d7e1350` and published as
Cloudflare version `59be9975-e409-4b0b-83ca-c158ca8f28bc`. Production phone
acceptance and independent cryptographic approval are not claimed.

## Rich Messages: 123-150

The implemented scope, explicit future exclusions, edit/delete policy and local
release evidence are recorded in [Rich messages 123-150](conversations-rich-messages-123-150.md).
Typed references and mutation events remain inside the existing signed MLS
payload. Native voice/image/video use the private encrypted-media path, not the
public product-video pipeline. No schema migration or feature-flag change is
required by this increment.

## Gates Still Open

The follow-on header, recovery-preview, push and telemetry audit is tracked in
[Direct audit 151-170](conversations-direct-audit-151-170.md). That ledger keeps
account-level Archive/Mute, selective reporting and foundation acceptance open;
it does not declare the whole 151-170 range complete.

- Independent crypto review/approval; passing local tests do not certify ts-mls.
- Authenticated physical-device private media, recovery and replacement evidence
  beyond the recorded real-device text delivery and synthetic R2 storage probe.
- Measured capacity/SLO, soak and relevant failure evidence. The previously
  declined paid Phoenix two-node production exercise stays deferred; do not
  increase instance count automatically or relabel REST/SSE evidence as Phoenix.
- Server-backed room lists, multi-member authorization, epoch changes and group
  ciphertext transport. The existing read-only room presentation is not a service.
- Remaining anti-abuse evidence and future collaborative commerce. Sender-only
  text edits have the operator-approved 15-minute window; deletion is for the
  current owner only. Direct chats do not require recipient approval; no payment
  truth or wallet is created in chat.

Continue by auditing the existing direct routes against 111-120 and 170, and
recording concrete defects/evidence. New product stages must not depend on an
unaccepted foundation or manufacture completion of the above gates.
