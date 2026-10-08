# Conversations 222-225: Test Suites And Security

The [2026-10-09 follow-up](conversations-final-acceptance-20261009.md) records
the subsequent Room order-reference/native Phoenix/SARIF candidate. The dated
unsupported-feature and untriaged-scan descriptions below describe this earlier
checkpoint, not permission to treat the new candidate as production accepted.

These sections specify verification, not permission to bypass native approval,
force-read accounts, introduce message requests or certify cryptography. All
new execution here uses synthetic accounts and disposable local databases.
Production device/load acceptance remains deferred by the operator.

## Published Application Checkpoint

Sections 210-221 were committed and pushed as
`bfe996102dfa5cf0e769fc15cd82bf41ee496691`. Render returned that exact
`X-Winga-Commit` with HTTP 200 and ready on 2026-10-08. The frontend was deployed
as build `20261008184751`, Worker version
`ebc9b8fb-96c6-439d-8eb3-38da0a080ed0`; production shell, service worker, assets,
public catalog and CSRF smoke checks passed. No production flags, secrets,
pending approvals, CSP or recovery keys were changed.

## 222: Direct Messaging

| Required case | Executable evidence | Boundary |
| --- | --- | --- |
| Text, offline sender, retry and duplicate retry | `test:conversation-direct`; encrypted HTTP browser fixture; retained local intent tests | Original logical IDs and ciphertext, no plaintext downgrade or premature Sent. |
| Offline/online recipient, reconnect and missed-message resume | Added `offline encrypted recipient` browser case | Three canonical messages remain Sent offline, decrypt once in sequence on reconnect, become Delivered then explicit Read. |
| Multi-device sender/recipient and read receipts | `mls-runtime.test.mjs`, `encrypted-conversations.test.js`, native admission HTTP case | Sibling synchronization does not falsely prove peer Delivered/Read. |
| Device revoke and block | Native direct service, concurrency and protected-event tests | No future protected content or ACK using revoked membership. |
| Message request | Superseded by the operator's direct-message policy | No new request/wait-for-accept workflow is introduced. Cryptographic native membership verification remains separate from message requests. |
| Media failure | Real HTTP upload-lost-reply/reload and offline media cases; media-draft tests | Retain exact sealed bytes and retry identity, never expose plaintext to storage. |
| Temporary database failure | Genuine PostgreSQL load test terminates its own borrowed connection after INSERT, before COMMIT | Termination and expected driver failure are asserted independently; canonical record, witness, outbox and sequence roll back. Exact native proof/ciphertext retries successfully. This is not a full production database outage. |
| BEAM node failure | Existing `test:phoenix-transport`, now wired into BEAM CI | Actual node loss/restart test covers legacy canonical sends/replay. Combined encrypted-native delivery across BEAM node loss still needs a dedicated authenticated exercise. |

## 223: E2EE

- `test:conversation-e2ee` runs the existing secure-content/native MLS suites:
  ciphertext-only storage/transport, intended recipient decryption, wrong-key
  failure, replay/substitution rejection, key replacement, native multi-device
  admission/removal, encrypted attachments and tamper detection.
- The added browser case attempts an actual send against minimum protocol 2
  while the client uses signed v1. Inspection/send reject with upgrade required;
  canonical messages and legacy plaintext counts remain unchanged. The gate is
  kept closed while its rejected local intent is retained.
- Attachment/recovery fuzz corpora check every single-byte mutation of bounded
  frames, every truncation, wrong bindings and strict descriptor/capsule schema.
  These are deterministic functional corpora, not exhaustive fuzzing or proof
  against an arbitrary malicious server.
- User-held recovery keys do not approve a pending device or restore MLS live
  ratchets. Functional tests are not an independent cryptographic audit.

## 224: Shopping Rooms

`test:conversation-rooms` covers native creation, all-member acceptance,
add/remove epochs, fan-out, board/poll/shortlist convergence, consented Ask Seller
privacy, signed seller response, indefinite mute, admin handoff, voluntary leave
and blocked-member behavior. Genuine PostgreSQL tests exercise independent
connections, contention, admission races and receipt convergence.

New revoked-native cases use actual MLS messages and assert denial of poll,
intent/read checks, receipts, ACKs, future sends, attached-media downloads and
reserved-upload completion. Canonical messages, sequences, events, receipts,
ACKs and media rows do not change after rejected operations.

**Group-order references are not implemented in the Room content protocol.**
The new projection test proves unsupported order references fail closed rather
than acquiring order/payment authority. Direct canonical commerce references
have separate participant-authorization tests; they do not imply group orders
exist. This remains an explicit 224 feature/acceptance gap.

## 225: Security Gates

- `test:conversation-security`: API/native authorization, signed protocol
  rejection, private object access, report consent, malformed payloads, transport
  lock deadlines, rate controls, replay/tamper corpora and gate-policy tests.
- `verify:conversation-dependencies`: root and backend npm audits; aggregate
  counters only, no source code or secrets sent. High/critical findings or an
  unavailable/inconsistent report fail the gate; lesser findings stay visible.
- `.github/workflows/conversation-tests.yml`: automatic push/PR plus manual CI,
  Node 24, disposable PostgreSQL 18, all test profiles and Chromium browser tests.
  A separate BEAM job installs Elixir/OTP, runs channel authentication/abuse/
  command-budget tests, then the genuine two-node/lost-reply/restart exercise.
- CodeQL security-extended JavaScript/TypeScript analysis runs as a separate
  job. CodeQL/BEAM are not installed on this Windows host; both CI jobs completed
  successfully in the final run below. Findings still need triage before security approval. CodeQL
  job success means analysis completed, not that all reported alerts are resolved.
- No owned C/C++ source was found in `src`, `backend` or `services`. Sanitizers
  are not applicable to owned conversation code in this checkpoint; no sanitizer
  pass is claimed for third-party native dependencies.
- The strict PostgreSQL runner refuses missing/remote/ambiguous targets and
  inherited `NODE_OPTIONS` that could filter all tests into an empty success.
  The Windows harness creates and stops a fresh localhost cluster; never point
  it at a production database. CI needs no production secrets or URLs.

## Local Results

- Direct messaging profile: 165 passed, no skips.
- Secure-content Node profile: 159 passed on the unchanged application release.
- Security profile: 48 passed, no skips; final scanner/gate and fixture policies tested.
- Rooms native/service/projection profile: 80 passed, nine PostgreSQL-only cases
  skipped outside a real cluster; canonical reference/rich-content profile:
  14 passed. All nine concurrency cases ran in the strict PostgreSQL suite.
- Full genuine PostgreSQL gate: 93 passed, no skips; cluster stopped. Final
  termination-proof correction passed a separate focused real regression.
- Synthetic native-device/encrypted HTTP browser suite: 38 passed at release;
  later-page corruption passed separately. Added recipient-offline/protocol-send
  browser case passed separately after isolating its retained rejected intent.
- Chromium strict-CSP/recovery browser profile: four passed, including complete
  persistent-browser restart. Default Windows Edge remains supported.
- Root/backend npm vulnerability counts: zero at this checkpoint.

Separate worker and read-only reviewer agents checked disjoint coverage and
test-gate risks. Their reviews are not external cryptographic certification.
Remaining approval: CodeQL alert triage, encrypted BEAM-loss acceptance,
group-order reference support, deferred physical-device/production load and
independent crypto/security audit. No pending item is reported as verified.

## Integrated Publication

Remote commit `fddf22d` arrived during acceptance tests and was preserved through
normal merge `60cbff9`, without force-pushing. The merged tree passed direct
messaging 165/165, security 46/46, genuine PostgreSQL 93/93, the actual encrypted
recipient-offline/protocol browser regression and growth runtime/service tests
6/6 plus 9/9. A scoped second reviewer found no P1/P2 integration issues.
The existing build script regenerated frontend assets as `20261008193054`;
95-module synchronization passed. This preserves growth changes but does not
enable growth flags or certify their production acceptance.

Initial CI run `37832889259` completed dependency scanning and CodeQL analysis;
direct, E2EE, Rooms, security and real PostgreSQL gates passed. All 48 browser
cases passed in that functional CI job. BEAM Mix tests
and compilation passed, but its browser fixture dropped the `peer` query when
proxying encryption-mode inspection. The fixture now preserves `url.search`;
a behavioral route-callback regression verifies encoded queries and original
authentication headers (4/4 gate tests, independently repeated by the reviewer).
This repair does not change production authorization. BEAM acceptance required
a rerun, recorded below; CodeQL findings still require triage rather than treating job success as
cryptographic approval. Public code-scanning alert access was unavailable.

The next BEAM run exposed a second fixture-only timing assertion: a global ACK
failure counter could come from an older queued message while the target stored
receipt was in flight. Failed ACKs now retain their batch message IDs, and the
fixture waits at most 15 seconds for the target message's ACK failure after its
stored receipt is confirmed. It then independently asserts the exact bob2
canonical stored proof, no Read proof, Delivered/Read flags and target pending
event ACK. A behavioral regression holds the target storage response while an
older ACK fails; the fixture stays blocked until that target response resolves.
All five gate regressions passed locally and independently with the reviewer.
Neither fix changes runtime receipt semantics or creates a synthetic receipt.

## Final Release Evidence

The application is ready on Render at
`6e3277edd57229f751c5fe3609d95db8741405ae` (exact `X-Winga-Commit`, HTTP 200).
Frontend build `20261008193054`, Worker version
`436a4d63-2fdc-4aa2-b80b-095911ece4d3`, passed all eight public production smoke
routes. Subsequent fixture repairs affect tests/evidence only; no
application behavior, CSP, secrets, approvals or feature flags changed.

CI checkpoint: https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/37835056834

- Dependencies: passed.
- CodeQL security-extended analysis/upload: passed; alert triage remains open.
- BEAM: nine Mix tests passed, zero failures; genuine two-node PostgreSQL/browser
  transport exercise passed with lost replies, node loss, replay and writer
  restart. It still does not claim encrypted-native BEAM-loss acceptance.
- Functional: all Node/real PostgreSQL gates passed, but 47/48 browser cases
  passed. The earlier full run passed 48/48. A focused original repeat produced
  one failure and one pass: an earlier approved recovery device remains in the
  replacement dropdown, whose package-hash ordering varies. The fixture typed
  a new device's fingerprint without selecting that device, so verification
  correctly rejected the mismatch before any reservation. The corrected test
  explicitly selects/asserts that device ID and asserts the same accepted
  reservation target; no timeout was raised or runtime check weakened.
  A separate reviewer confirmed this fixture cause and reviewed the patch.
  Both patched focused repeats passed in fresh Chromium contexts (2/2).

## Completed Acceptance CI

Final tested commit: `69136e5500b98ecd041bb0669bad5295e0c16cb4`.
Run: https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/37837456327

All four jobs completed successfully on 2026-10-08:

- Functional: direct messaging 165/165, E2EE 159/159, native Rooms 89/89,
  canonical reference content 14/14, security 48/48, genuine PostgreSQL 93/93
  and Chromium browser 48/48. No skipped cases in these final profiles.
- BEAM: nine Mix tests, zero failures; genuine two-node browser/PostgreSQL
  transport test passed. It replayed/acknowledged 65 canonical messages after
  retries and node loss, with zero canonical duplicates; writer restart passed.
  These synthetic bounded results are not production capacity or dedicated
  encrypted-native BEAM-loss acceptance.
- Dependencies: root and backend aggregate audits passed with zero vulnerabilities.
- Static analysis: CodeQL security-extended analysis and upload completed;
  access to private code-scanning alerts remains unavailable, so findings are
  not independently triaged and no security/cryptographic approval is claimed.

The final public Render check still returned ready, HTTP 200 and exact commit
`6e3277edd57229f751c5fe3609d95db8741405ae`. Git comparison confirms the accepted
`69136e5` tree differs only in the browser fixture and two evidence documents;
application runtime files are unchanged. The latest fixture/docs commit is
pushed, not claimed Live. Frontend build `20261008193054` remains deployed.
No production accounts, approvals, secrets, CSP or feature flags were changed.
