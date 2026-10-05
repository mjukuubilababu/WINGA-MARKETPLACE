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
This follow-on increment is prepared locally, not part of the published
`20261005121213` release. Production/audit acceptance gates below remain open.

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
