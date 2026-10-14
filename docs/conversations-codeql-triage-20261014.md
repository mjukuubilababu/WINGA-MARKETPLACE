# Conversations CodeQL triage and local I/O hardening

14 October 2026. Audited baseline: `50585d50deaa7ba4dacf65162104733f67ccbc31`.

All **55** baseline findings now have individually recorded source/data-flow
assessments. Two related local I/O gaps were reproduced and fixed across six
readers/harnesses. This is engineering triage and remediation, **not independent
cryptographic approval or a green CodeQL security gate**. The review manifest,
its source-tree binding and the production release policy were not changed.

## Actual evidence recovered

The baseline CodeQL run `38570266426`, job `115873736818`, reported 55 security
findings: 22 error and 33 warning, zero reviewed, with `CODEQL_REVIEW_STALE`.
Artifact `11897467051` is the immutable source input. Its report SHA-256 is
`2b6b8e95a01e307a96e84bf080b68d0d8ef787024d86a4185224029c2658f8e4`.

A read-only job on the isolated branch `codex/codeql-triage-evidence-20261014`
downloaded that existing artifact using the official action and projected only
finding messages, primary/related action locations and code-flow locations. The
completed projection run is
[38576027914](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38576027914),
job `115893233298`, at `464c1aa39a2818dac039f90cde4995589760103d`.
The underlying baseline report remained unchanged across both projection runs.

[Projected baseline flows](evidence/conversations-codeql-baseline-flows-20261014.json)
contain all 55 results with no truncated threads. Primary source bytes were
checked against their baseline Git files and the source SHA-256 values from the
canonical gate. Embedded source snippets/unreferenced artifact contents were not
dumped. This supplies actual scan messages/paths for triage; it does not claim that
the full archive or all embedded source blobs received independent review.

[Per-finding ledger](evidence/conversations-codeql-triage-20261014.json) retains
baseline index, rule, severity, exact result/source fingerprints, observed
guards, proposed disposition, related fix and any generated duplicate. Every
independent decision is **null** and every acceptance flag remains **false**.

| Proposed source assessment | Baseline findings |
| --- | ---: |
| Guarded production flow requiring review | 30 |
| Test/diagnostic fixture flow requiring review | 15 |
| Generated duplicate requiring review with canonical source | 4 |
| Confirmed related FIFO hardening gap; fix and rescan required | 3 |
| Telemetry randomness outside an access/crypto boundary | 1 |
| Conservative poster exclusion, not hostname authorization | 2 |
| Total | 55 |

These labels do not suppress a scanner result or declare a false positive. A
reviewer must assess the actual current artifact, source assumptions and tests.
The six modified source paths need new review fingerprints; previous reviewer
names/decisions are not copied to the new tree.

## Fix 1: non-blocking regular-file validation

Affected readers:

- `backend/stable-local-file.js`
- `backend/legacy-public-media.js`
- `backend/backup-legacy-private-media.js`

The previous code checked a regular file with `lstat`, then opened its pathname
with `O_RDONLY | O_NOFOLLOW`. A process with write access to that local directory
could replace the file with a FIFO between the check and open. POSIX read-only
FIFO open waits for a writer, so descriptor validation could never run.

The isolated reproduction timed out all three old readers at 900 ms and forcibly
terminated only the synthetic child processes. This demonstrates a **local
filesystem-mutation resource-safety gap**, not an unauthenticated remote exploit.

The readers now add `O_NONBLOCK` where supported. Existing descriptor checks
reject the FIFO, then close it; no FIFO bytes are accepted. Regular-file size,
inode/device, change detection, `O_NOFOLLOW`, error/null behavior and bounded
reads remain in place. All three post-fix regressions reject promptly and observe
exactly one descriptor close. On platforms without POSIX FIFOs the dedicated
regression is explicitly skipped; existing regular-file tests still apply.

The change does not claim atomic filesystem immutability, defend against arbitrary
privileged ancestor changes, or guarantee storage/network I/O deadlines. Trusted
directory ancestry and existing snapshot/checksum assumptions remain explicit.

## Fix 2: static harness directory boundaries

During the loopback/file-flow assessment, three development/test servers accepted
an encoded traversal into a sibling whose name began with the static root's name.
`resolvedPath.startsWith(root)` is not a directory boundary. For example, a root
ending in `/root` incorrectly accepted `/root-neighbor/sentinel.txt`.

Synthetic requests `/..%2froot-neighbor%2fsentinel.txt` returned the outside sentinel
with HTTP 200 on all three previous handlers. The fix uses `path.relative` and
rejects `..`, a leading parent-directory segment or an absolute/different-drive
result before any file read. Each handler now returns HTTP 403 for the same
request and still serves the inside fixture normally.

Affected harnesses are `tmp-bootstrap-integrity-check.mjs`,
`tmp-image-viewport-check.mjs` and `tests/e2e/start-servers.js`. All continue to
bind to localhost. Their loopback upstream authority and `redirect:error` policy
remain unchanged; existing SSRF/redirect negatives pass. This fixes a local
harness boundary and does not resume the deferred production video investigation.

## Activity dispatch assessment

For baseline result 27, CodeQL's actual related sensitive action is
`authorizeConversationActivity` at `backend/conversation-transport.js:95`.
The reported condition selects a command handler; it is not a grant of presence
or native message permission.

The internal route checks the service credential before parsing, then validates
bounded JSON and a supported command, and authenticates the live scoped
ticket/session before `execute`. The activity branch always calls the canonical
authorizer. That authorizer requires the current native signature and session
binding, active group/device, membership/block policy and mutual consent. A
different command does not return activity; each canonical message/history
handler has its own authority. Wrong action/capability, kill switch, substituted
proof, revoked actor, nonmember and block negatives passed. No activity auth
bypass was confirmed. **Independent disposition remains open.**

## Other groups and assumptions

DOM findings trace locally minted Blob URLs into image/audio/video previews, not
HTML concatenation or arbitrary navigation; MIME/decode/type checks, textContent
and the browser/CSP boundary are documented. Bundle copies are linked to their
canonical source instead of counted as independent vulnerabilities.

Room/history/invite dispatch conditions retain mandatory native authentication,
current membership, exact transfer/group/epoch binding and token/admin policy.
Cookie dictionaries have null prototypes. Preference fields are restricted to
`muted`/`archived` booleans; known canonical intelligence events are required
before signal-counter assignment. Login/admin/step-up branches still require
actual password/role checks; admin routes select UI presentation rather than
grant backend access.

Build findings trace remote product HTML **contents** into expected generated
files; filename IDs are separately bounded and allowlisted. Test seed responses
write to a fixed synthetic test filename. Test regex/assertion and deliberate
mutation cases are recorded as fixtures, not production sanitizers.

Playback randomness identifies telemetry, not credentials or cryptographic
secrets. The loose provider-host expressions suppress poster fallback rather
than establish origin trust. Encoded-host/privacy policy remains a review
consideration; no production video playback change was made to silence queries.

## Verification and remaining acceptance

The source fixes were verified with real POSIX FIFO substitution, synthetic
outside-root files and existing reader/descriptor/redirect/build/authorization
regressions. Selected native history, Room preferences/invitation, cookie and
DOM parser checks add evidence for the guarded flows. Exact results are recorded
in [local verification](evidence/conversations-codeql-triage-checks-20261014.json).
Fresh matching-source CI/CodeQL and final Render/Cloudflare release evidence must
be recorded separately after source push.

Do not equate unchanged or reduced finding counts with security acceptance. An
independent reviewer must disposition the fresh results and assess the changes
before rebinding a reviewed manifest. Full Conversations still also needs real
PWA/device, provider TLS/trust, approved retention/erasure/backup and independent
protocol/library acceptance. Shopping Rooms §0 remains unaccepted.

Rollback uses the preceding verified runtime commit while retaining all durable
message/device data. Neither fix changes cryptography, schema, private media
visibility or commerce truth. Do not weaken the review gate, remove negative
tests, restore an unsafe descriptor/path behavior as a permanent solution, or
create a new paid Phoenix instance for this work.
