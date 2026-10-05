# Conversations: Contract 110-238 Execution

Updated: 2026-10-05. This is an execution/evidence ledger, not acceptance of the
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
| Requests and safety | 121-122, 157-159 | Define trusted commerce entry versus unsolicited requests, server-enforced transitions, quotas, blocks and consented report disclosure. Do not turn an untrusted request into an accepted conversation implicitly. |
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
| 114, universal inbox | Approved navigation is present. Production rooms, requests and calling are not supplied by placeholder tabs. |
| 115, summaries | Paged inbox reads bounded summaries without requesting histories. Future request, archive and mute fields are not presumed implemented. |
| 116-117, ordering and pagination | Timestamp-based inbox order, sequence-based pair preview selection, scoped cursors, ID deduplication and refresh races pass existing tests. This is not evidence of capacity at 10,000 conversations. |
| 118, bounded history | Initial recent-window and older-page routes are covered; older-page retry retains messages. Product dialog overflow and same-thread refresh selection are corrected. Edited/reaction event policy is still a later reviewed stage. |
| 119-120, unread and visibility | Server unread totals, durable device receipt/ACK isolation and non-read paging pass. Rendering the inbox does not mark history read. Visual viewport guards were released separately. Physical multi-device media/recovery acceptance remains open. |

These are scoped evidence checkpoints, not full section acceptance. The legacy
fallback is not a claim that every encrypted room or multi-device lifecycle has
the same protocol contract. Security, capacity and product policy gates below
are retained rather than bypassed with UI-only completion.

## Gates Still Open

- Independent crypto review/approval; passing local tests do not certify ts-mls.
- Authenticated physical-device private media, recovery and replacement evidence
  beyond the recorded real-device text delivery and synthetic R2 storage probe.
- Measured capacity/SLO, soak and relevant failure evidence. The previously
  declined paid Phoenix two-node production exercise stays deferred; do not
  increase instance count automatically or relabel REST/SSE evidence as Phoenix.
- Server-backed room lists, multi-member authorization, epoch changes and group
  ciphertext transport. The existing read-only room presentation is not a service.
- Product policy for requested/accepted conversations, edit/delete windows and
  future collaborative commerce. No payment truth or wallet is created in chat.

Continue by auditing the existing direct routes against 111-120 and 170, and
recording concrete defects/evidence. New product stages must not depend on an
unaccepted foundation or manufacture completion of the above gates.
