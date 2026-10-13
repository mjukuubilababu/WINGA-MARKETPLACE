# Growth security triage — reviewer handoff

This is implementation-side triage, **not independent security or cryptographic
approval**. No review ledger, waiver, scanner severity or deployment gate is
changed. Phase 2 admission and full §106 acceptance remain open.

The latest scan available at the start of this continuation was commit
`e1e9a41d6db3fc3c6c0e24f083f664f1d78d8b4a`, Actions run `38457948968`, artifact
`11844551374`: 54 findings, 21 error / 33 warning, zero current independently
reviewed findings, `CODEQL_REVIEW_STALE`. Retrieve the artifact from the
[run](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38457948968).
The checked-in [navigation index](evidence/growth-security-review-input-20261013.json)
belongs to an earlier scan; its line numbers and fingerprints are not approval of
the current source. The next pushed scan must be used for exact-source closure.

## Boundary checks and independent review questions

All 54 navigation entries are accounted for below. Generated bundle entries are
paired with their canonical source, but remain separate scanner results. The
observations identify controls and follow-up questions; they do not assign a
false-positive waiver or assert exploitability from a severity label alone.

| Navigation result indexes | Surface / observed control | Review needed |
| --- | --- | --- |
| 0–1 | Local visual-check proxy scripts construct the target from fixed loopback origins and pathname/search, with redirect errors. | Verify absolute/network-path request targets and header forwarding cannot change the destination or expose credentials. See loopback proxy regressions; these scripts are not deployed endpoints. |
| 2 | Feed video markup uses escaped attributes and canonical image sanitization before HTML rendering. | Trace all product/poster sources into the actual browser parser; escaping alone is not URL eligibility. |
| 3–6 | Encrypted media preview creates object URLs from the supplied blob; media/image type and bitmap limits are checked. Bundle results correspond to `src/chat/voice-ui.js`. | Review MIME spoofing, object URL lifecycle, parser behavior and account cancellation. Private contents must remain local. |
| 7–9, 12 | Test fixtures strip/render strings or assert URL behavior. | Distinguish fixture simplification from production sanitization. Do not remove adversarial tests to silence a finding. |
| 10–11 | Video lifecycle telemetry prefers `crypto.randomUUID`; its fallback uses time/randomness. | This identifier must never authorize access or serve as an invite/auth token. Review collision/dedupe assumptions; the generated result duplicates canonical playback source. |
| 13–15 | Local media readers use a file handle, `O_NOFOLLOW`, inode/device/size checks and post-read identity checks. | Confirm trusted parent-directory ownership, replacement/hard-link threat model and fail-closed behavior on supported platforms. |
| 16 | Local seed initialization uses exclusive `wx` creation and restrictive mode, after existence checking. | Check the surrounding path configuration and concurrent startup; an existence check alone is not the protection. |
| 17–22 | Copy/media, CodeQL and Phoenix startup test helpers operate on isolated fixture files. | Check helper reachability, temporary directory ownership and cleanup; production file controls cannot be inferred from fixture-only assertions. |
| 23 | Room preference field is allowlisted to `muted`/`archived`; value and revision are typed before computed-property assignment. | Verify device signature, canonical room access, replay/revision handling and object prototype behavior together. |
| 24 | Intelligence signal counting receives normalized event types and weighted scoreable events. | Trace event weights and known-type checks into the dynamic property; verify prototype names cannot become scoreable signals. Growth must not write Search Demand or ranking. |
| 25–26 | Cookie parsing accumulates into `Object.create(null)`. | Verify duplicate-cookie policy, bounds and the downstream session lookup. Prototype isolation does not replace session authentication. |
| 27–28 | Native history action branches execute under the encrypted operation dispatcher; task/transfer reads recheck device owner, current membership, epoch and expiry. | Independently trace signature verification through every history path and concurrent device removal. Routing by action is not authority by itself. |
| 29–32 | Shopping Room branches retain canonical access and typed preference/receipt/pin validation. | Review admin/member distinctions, replay, epoch changes, blocks, closed rooms and native admission races; real Room participation is still unaccepted. |
| 33–37 | Invite create/list/revoke/decline/confirm use native room authority; public request requires token hash, current invite state and block checks. | Independently trace every operation from signed dispatch to canonical membership confirmation, including revocation/expiry and replay. A token must not grant private history. |
| 38 | Conversation transport requires service authorization plus command/ticket authorization before dispatch. | Verify that command routing cannot bypass owner/device scope or reach unsigned transport; test actual caller boundaries. |
| 39, 43–44 | App permission/state branches affect presentation and navigation. | Client checks must never be the only security decision; verify server enforcement and stale-account async cancellation. |
| 40–42 | Public/admin login and step-up validate request shape before verifying credentials/session. | Invalid-input rejection is not authentication; inspect subsequent password/status/session checks and rate limits. |
| 45 | Product creation checks the server-selected seller and payload ownership. | Trace server-bound identity, approval policy, repost ownership and rejected-account behavior. |
| 46–48 | Static build/fixture servers perform URL-to-file mapping. | Verify root confinement, decoding, symlink handling, private asset exclusion and method rules; localhost serving still needs traversal protection. |
| 49–53 | Stream poster provider checks use substring regexes in gallery/worker and related fixtures; bundle duplicates gallery. | These checks suppress provider posters, not an allowlist for trusted URLs. Verify canonical URL sanitization separately; never reinterpret substring matching as host authentication. |

## Phase 3 controls verified in this continuation

The new seller report is read-only, behind the existing authenticated admin report
route, and returns aggregates only. Isolated SQL tests reject mismatched
seller/product/audience lineage, missing order-created evidence, self orders,
cancelled/refunded orders, current blocks, inactive accounts and private/zero-price
inventory. No message contents or payment details are exported.

The demand processor retains explicit consent, canonical product eligibility,
symmetric blocks, stable notification identity, transaction rollback and the
shared two-notice/day recipient cap. Tracked variant requests now require an
active matching variant with unreserved inventory before notifying. These tests
support source correctness; they do not prove real recipient relevance, deployed
regional capacity, independent fulfillment or cryptographic safety.

For closure, retrieve the scan for the final pushed source, check the result and
source-tree fingerprints, inspect applicable source/crypto paths and record an
actual independent review through the existing review policy. Do not copy old
approval fingerprints, invent a reviewer or change the policy to make CI green.
