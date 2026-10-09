# Conversations Acceptance Follow-Up: 2026-10-09

This checkpoint follows sections 222-225. Implementation and isolated acceptance
are separate from authenticated production load, physical-device acceptance and
external cryptographic approval. The operator confirmed production accounts
`rey` and `wizad` remain Pending; their approvals are not bypassed or changed.

## Latest Verified Checkpoint

The chronological checkpoints below describe earlier candidates; this section
records the verified final release and supersedes their pending CI/deploy status.
It does not supersede the remaining external acceptance gates.

Release `2da2d93f74d0cf93c9eac4f054e17e3808cb54d3` is pushed to `master`.
[Regular acceptance run 37869633494](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/37869633494)
actually executes and passes all four jobs: static-analysis (113624489521),
dependencies (113624489708), functional (113624489724), and beam (113624489866).
The functional job includes real PostgreSQL and browser execution; BEAM includes
native transport acceptance. The independently reviewed ledger accepts exactly
50 findings for tree
`7c6f6404a0fedf9e49b92862e81ee08102a5179040b114c247d0106233971c43`;
unreviewed findings and changed runtime fingerprints still block acceptance.
This ledger is not an external cryptographic audit.

Backend public health returns HTTP 200 and identifies the exact release above.
Frontend build `20261008220542` is published with Cloudflare version
`1fe25437-4de3-47a5-ae80-e2613c279fd4`; production smoke checks pass 8/8.
Public deployed module bundle, Phoenix browser transport, and Rooms UI bytes
match their prepared local files after CRLF/LF normalization. Phoenix public
health returns HTTP 200 but exposes no commit SHA; exact Phoenix deployment
identity remains independently unverified.

The final-release read-only public soak completes in 312148 ms: 87 GETs
(75 soak and 12 paced load samples), zero failures, all HTTP 200, maximum
concurrency two. Backend commit and frontend build remain stable. Per-service
p95 latency is backend 4424 ms, frontend 3325 ms, Phoenix 3039 ms; these are
client-observed public-request timings, not isolated server processing times or
certified messaging SLOs. No application writes, authenticated encrypted-message
flow, encrypted Room flow, or production capacity are proven by this soak.

A fresh disposable localhost PostgreSQL run on this release passes 93/93 tests
with zero failures, cancellations or skips. Its cluster is stopped afterward;
production accounts, approvals, credentials and data are untouched. Bounded
concurrency results include:

- Direct encrypted pair: six connections, two stores, 64 unique messages,
  74 attempts, 64 recipient decryptions, zero duplicate rows; terminated test
  connection recovery succeeds. Store-attempt p95 is 337 ms.
- Encrypted history pages: 64 unique pages, 384 accepted write attempts and
  one published root revision across two stores. Store-write p95 is 97 ms.
- Own-native archive: 64 unique pages, 256 write attempts, 12 publication and
  12 acceptance attempts. Store-write p95 is 170 ms.
- Shopping Room: three owners, six connections, two stores, 48 unique messages,
  96 send attempts, 96 decryptions, 192 receipt rows and ACKs, zero duplicate
  rows, and three converged boards. Store-attempt p95 is 189 ms.

The same suite passes approval/admission, revoke/leave boundaries, admin handoff,
media authorization/cleanup races, retry idempotency and history integrity cases.
These bounded synthetic results do not certify production throughput, physical
devices or external cryptographic approval. No runtime change or repeat deploy
is required by this documentation update.

## Local Telemetry Follow-Up: Not Deployed

Code inspection confirms that process pool gauges, Phoenix connection/queue and
BEAM memory/scheduler gauges, durable ciphertext delivery/read observations,
verified native sync delays and client-reported offline/reconnect/resume outcomes
already exist. The earlier spec index overstated these as unimplemented.

The remaining projection defect discarded existing `native_confirmed` and
`native_unknown` Phoenix counters. The local fix preserves these fixed outcomes
and supported operation modes, clarifies the legacy-only security-mode scope,
rejects duplicate/invalid count observations and impossible gauges, and keeps
unknown values as null. Zero samples cannot fabricate an average duration.
No new metrics publisher, migration, native protocol or feature flag is added.
Reconnect/resume observations remain client-reported; node joins are not used to
invent per-device reconnect rates, human-message counts or delivery guarantees.

The operations profile passes 64/64 with no skips or failures, including actual
localhost HTTP partial-response cancellation after the existing deadline.
Independent review then finds and resolves a test-only cleanup defect: if the
fetch deadline regressed, the stalled fixture could keep the test process open.
Cleanup now also responds to test cancellation and an independent watchdog.
The final focused profile passes 8/8; the reviewer independently removes the
fetch signal in memory and observes expected failure with natural process exit
after approximately 10.25 seconds, rather than forced termination. The reviewer
reports no remaining actionable findings in the scoped reader/test diff.
This changed reader and its tests are not deployed and are not certified by the
Live release's previous CI or CodeQL tree binding. Independent scoped review and
fresh candidate CI/ledger verification remain necessary before promotion; the
existing review ledger is not silently rebound. Production devices, capacity,
external cryptographic approval and retention policy remain separate gates.

Telemetry QA commit `96de6b7f752aa5dace5e1b2bfa8c53d4d166f4f7`, regular run
`37882832707`, adds the operations suite to the functional job and requires its
presence in the release-profile regression. Actual static job `113666168564`
completes CodeQL analysis and emits exactly 50 eligible findings; its gate fails
only because the prior release tree binding is stale. Linux and local candidate
tree both equal
`77bfe5a0d57951fed64ff02f0a3ad93171378582bcdea84b712c9323b806ca55`.

Godel independently fetches that fresh job and certified prior-release job
`113624489521`. All 50 unique bindings retain identical result fingerprints,
referenced-record hashes, source hashes and complete raw result/rule/tool hashes;
every existing ledger entry matches with multiplicity one. Godel approves only
the exact new tree binding after scoped patch review. All 50 reviews, reasons,
fingerprints and occurrence caps remain unchanged; no new or changed finding is
approved. The manifest's sole changed field is `sourceTreeSha256`. The final
regular candidate must still execute and pass all four CI jobs before promotion.
This binding approval is not deployment, crypto or capacity acceptance.

## Next Acceptance Session

Use approved devices only; the last operator-confirmed account status is still
Pending, and must be rechecked rather than assumed Active. Never self-approve a
pending identity or weaken a membership guard to obtain a successful test.

1. Confirm `rey` and `wizad` have Active devices through the existing authorized
   approval or recovery flow. Passwords, operations tokens and recovery keys
   stay inside their intended application or service, not this report or chat.
2. With explicit operator consent, exercise direct messages and one Shopping
   Room using real devices. Verify exact retries, offline return, receipts,
   encrypted image/file delivery and history sync without plaintext fallback.
3. Exercise user-held-key recovery and verified replacement on a fresh device;
   check the documented historical-media access policy rather than assuming a
   recovery key grants live membership or access to every old attachment.
4. Agree production traffic bounds and measurable SLOs before a sustained load
   run. Keep Phoenix at the agreed one instance; no paid fleet expansion or
   deliberate production node termination is implied by local load acceptance.
5. Obtain independent external cryptographic/security review. Local agents,
   CodeQL, successful flags and synthetic tests cannot mark this gate approved.

Sections 228-229 and 237-238 remain externally unaccepted until the applicable
device, production capacity/SLO and independent review gates have evidence.

## Room Order References

The encrypted Room protocol now accepts an ID-only `order-reference`. Projection
converges duplicate and reordered references. Room membership never grants
access to the canonical order: only its current buyer/seller can read details
from the existing authorized reference endpoint. There is no wallet, automatic
checkout, payment authority or group-order state derived from chat snapshots.

The Orders tab includes explicit sharing consent, searchable canonical order
selection and fresh authorization before opening an order. An uncertain share
recovers the existing native journal ID after closing/reopening its dialog;
retry retains ciphertext and logical identity. Canonical metadata is bound to
the current UI session, cleared across session replacement, and discarded on
authorization failure in both interactive and background refresh paths.

Local evidence: nine UI regressions and seven native transport unit tests pass;
the real encrypted Room browser case passes on mobile/desktop layouts. It checks
unchanged committed ciphertext after a lost response, no private canonical data
for nonparticipants, and denial after removal of an existing order participant.
A separate reviewer found no remaining actionable finding in the scoped Room
runtime/privacy re-review. These checks use synthetic accounts only.

## Native Phoenix Transport

The candidate negotiates optional signed native operations over Phoenix while
retaining the existing canonical encrypted operation authority. Tickets bind
the authenticated session; the canonical handler still verifies native actor,
signature, device, membership, operation limits and revocation. Socket failures
recover over HTTP with the same signed envelope, never legacy plaintext send.
Older Phoenix deployments that do not negotiate this capability retain HTTP.

The native BEAM acceptance fixture must independently prove live delivery
between two nodes and ciphertext replay following real process termination.
The independent reviewer identified the earlier fixture's same-node setup as
insufficient evidence for live cross-node delivery; that finding is addressed
in the revised candidate, not waived. Final CI results are recorded below only
after execution. Local unit tests cannot replace genuine BEAM execution.

## Actual Static-Analysis Gate

CodeQL security-extended output is now checked with a fail-closed SARIF gate.
All unreviewed security findings, including suppressed/baseline findings, block
the candidate. Missing, incomplete, unsuccessful or malformed scans do not pass.
Triage output contains only safe rule/path/line metadata, never source snippets.
The gate has dedicated regressions and uses the actual analyze output in CI.

Actual candidate run `37848028618` at `76d3f41` passed the functional profile
(including real PostgreSQL and browser execution) and the dependency scan.
CodeQL analysis completed and reported 53 security findings; its gate correctly
failed. The native BEAM run passed 15 Mix tests but failed the negative sender
receipt assertion because a test fault injector withheld receipts from the
forbidden sender as well as the receiver. This is not a successful native
failover certification. The revised injector targets only the receiver and
retains the canonical 403 denial assertion.

The operator approved recording only independently reviewed false positives,
with a reason, exact rule/location and code fingerprint. New findings and
changed source fingerprints must still fail. No blanket rule/path exclusions
or automatic baseline acceptance are authorized. The review ledger is not
permission to waive a real vulnerability or external cryptographic approval.

Security follow-up fixes use checked, bounded file descriptors for public
legacy copying and local product-image metadata, exclusive local seed creation,
prototype-safe demand/cookie dictionaries, and explicit webhook signature
fields. Remote product IDs are validated before writing generated share pages.
Focused local media/security regressions pass 61/61; actual server startup,
cookie-only authentication and intelligence regressions pass 15/15; frontend
core passes 145/145. Fresh CI must verify the revised candidate before promotion.

QA run `37851516983` at `e2b853f` subsequently passed functional, dependencies
and genuine BEAM jobs. The transport job passed 9/9 with zero skips, including
signed MLS delivery across two live nodes and exact-ciphertext recovery after
real node loss. Its bounded 65-message load is the separate legacy transport
fixture, not a claim of encrypted production throughput or saturation capacity.
CodeQL completed with 46 emitted findings and zero approved reviews; the static
gate remains failed until valid independent triage is recorded.

Follow-up independent review reproduced same-size in-place source mutations
that filesystem timestamps alone cannot distinguish. Public-copy preflight now
captures SHA-256 only for the approved public subset and requires a matching
hash before any R2 read/write. Ordinary inventory/audit calls remain metadata
only. No broad claim of immutable local files is made. Loopback-only test proxies
now reject redirects explicitly. Separate review also identified a same-sink
approval reuse risk in the first review-ledger implementation; approvals remain
empty while exact result/flow identity, multiplicity and whole-source-tree
binding are added and independently checked.

Independent public-copy reproduction now rejects 20/20 natural same-size
overwrites (including four identical-stat collisions) and 20/20 forced stat
collisions, with zero R2 calls. The focused preflight suite passes 26/26 and
related backup/coverage/local-guard/proxy checks pass 42/42. These are bounded
preflight-snapshot protections, not a transactional multi-file copy guarantee.

The encryption reviewer also found a real history-transfer defect: a signed
request could name another authorized conversation while accessing an existing
transfer with the same epoch. The shared transfer authorization now requires
the stored conversation ID to match the authorized conversation before any
existing-transfer data access or mutation. A real MLS/signed regression covers
reservation retries, upload, publication, download, acceptance and cancellation
against two same-owner, same-epoch conversations, with no mutation on rejection.

The frontend build `20261008220542` passes Wrangler's deployment dry-run, but is
not yet published. The review gate binds all tracked runtime/config/native and
binary files (including file modes), exact SARIF result/flow/rule metadata and
global finding multiplicity. Local gate regressions passed 65 with two Windows
file-symlink privilege skips; Linux CI must run those cases before acceptance.

QA run `37854411766` at `a2843f8` passes dependencies and genuine BEAM tests.
Its complete static scan emits 49 findings, including five narrowly reviewed
synthetic filesystem-race test sites; the empty ledger correctly blocks them.
All 49 exact sites now have separate-review classifications. A six-config
CRLF/LF fingerprint discrepancy was corrected without excluding runtime files
or normalizing binary assets. Three focused portability tests pass, and the
Windows and Linux-equivalent complete-tree digests agree. A fresh actual scan
is required before writing the reviewed finding fingerprints.

Fresh QA run `37855535222` at `cba9313` passes functional, dependencies and BEAM.
The BEAM job again passes 15 Mix tests and 9/9 Node acceptance cases with zero
skips. The complete CodeQL scan emits the same 49 exact sites and its Linux
tree digest matches the Windows/Linux-equivalent digest
`3ba1c50489588f36ce18edc7242411aa4c2b6b631c434ba94bbbf8b79f37a51a`.
The operator-approved ledger now records only these independently reviewed
sites, with exact source/result fingerprints, reasons, reviewer and evidence;
each permits one occurrence. A separate final manifest review verifies all 49
source hashes and unique sites, generated-source correspondence and the fixed
history binding. Actual ledger-only CI must still prove stable result digests
and gate success before production promotion; no scan findings are suppressed.

The ledger-only commit `fb95e39` exposed a real workflow coverage gap: narrow
path filters did not start verification for a ledger-only change. Both push/PR
path filters are removed, preserving master/QA branch restrictions, dispatch,
permissions and every job. Two focused trigger regressions pass independently
and are wired into static-analysis CI. This intentional tracked-tree change
invalidates the previous ledger tree until fresh hosted scan provenance is
reviewed; it does not authorize automatic rebinding or deployment.

Hosted run `37857609956` / static job `113585454727` at `38de74a` starts with
the corrected trigger and correctly rejects the stale tree. Its actual digest
`fd1dc3d0a3ddc719143c884df073872253ec6d397231e014bf8452c7d9a5f26e`
matches local verification. All 49 exact sites and all 21 source-file hashes
remain unchanged. Separate review explicitly approves rebinding the ledger to
this scan after inspecting the workflow/regression-only changes, preserving
prior source-review evidence and occurrence caps. Same-code result stability
is not yet proven: the next ledger-only scan must match every result digest;
any further drift blocks promotion and must be diagnosed, not auto-approved.

The ledger-only verification at `fb9020a`, run `37858338366`, passes functional,
dependencies and genuine BEAM acceptance. Its successful static scan nevertheless
rejects all 49 review fingerprints. The tracked-tree digest, exact finding sites
and all source hashes are unchanged: result-fingerprint volatility is therefore
a gate defect requiring diagnosis, not permission for another automatic ledger
rebind. Production promotion remains blocked. Bounded component/field hashes
will identify the drifting SARIF metadata without logging source snippets or
arbitrary property values; no fingerprint semantics or review approval is
relaxed by that diagnostic work.

Diagnostic-only candidate `b7f62c4` adds fixed-label, hash/shape-only SARIF
provenance, globally capped at 64 findings. Separate reviewers report no
actionable findings; local gate/trigger tests pass 84 with two Windows symlink
privilege skips (86 total). Fingerprint and approval semantics are unchanged.
Its first actual scan emits 49 findings and correctly rejects the changed
tracked tree. A same-commit rerun is needed to identify unstable components.
The BEAM job passes 15 Mix cases but its initial Phoenix fixture exits before
readiness; the child log is unavailable, so the underlying cause is not yet
claimed. No encrypted acceptance or production promotion is inferred from it.

Paired actual scans of the same `b7f62c4` commit, static jobs `113591773547`
and `113595012658` in run `37859556701`, both bind tree
`28785d93e675f9a36ea7be371266cbf4626feb8d45c39d3057f4871d77662c93`.
All 49 result, rule and tool-component hashes match exactly. Only the shared
505-entry `run.artifacts` collection differs, changing every combined digest.
No specific artifact field or ordering cause is yet proven. The correct next
step is bounded fixed-field artifact diagnostics, not GUID normalization,
blanket artifact exclusion or another automatic ledger rebind. Functional and
dependency jobs pass; the separate Phoenix fixture-start failure stays open.

The fixture-only startup patch is independently reviewed and passes 12 isolated
startup/native-operation cases. It reserves three ports simultaneously, reads
at most 16 KiB of a checked regular-file log, and emits only allowlisted startup
metadata. CI includes its helper tests. No retry, timeout or ciphertext delivery
assertion is weakened; actual hosted startup and native acceptance remain
required before claiming the previous startup failure is resolved.

QA candidate `a875c6c`, run `37861448189`, passes dependencies and BEAM:
15 Mix tests and 14 Node cases, zero skips, including signed MLS traffic through
real node loss and exact ciphertext recovery. Startup failure does not recur
in this run; the earlier root cause is still not claimed. The first successful
static scan binds the same Linux/Windows tree
`28b01183671d9e697a36de67f5662a304a6e3d183ed2951964154d70797ad44d`
and emits 50 findings. Its 507 artifacts contain only `location`; timestamps,
contents, hashes, properties and unknown artifact fields are absent. Ordering
still requires paired sorted-hash proof before any canonicalization.

The new exact `js/file-system-race` site at
`tests/helpers/phoenix-fixture-startup.js:24`, source SHA-256
`916f56bc46daad160733d7bd61e67710385d2b95e084eec2f27525fa4da78ca8`,
is independently classified by Godel (not its author Hubble) as a mitigated
test-only read. The generated fixture directory remains trusted; descriptor
checks are not a claim of arbitrary ancestor safety or atomic immutability.
Independent 5/5 tests verify read bounds, substitutions, cleanup and output
privacy. This classification does not yet approve a result digest or new ledger.

The same-commit rerun, static job `113600951689`, binds the same tree and
emits the same 50 findings. Both ordered and sorted whole-artifact hashes differ;
only artifact `location` differs, including its sorted hash. Therefore ordering
alone is not the cause, and an artifact-sorting fix is explicitly not approved.
Nested URI/base/index provenance must identify the actual location volatility
without logging arbitrary URI values. No normalization or new ledger binding
has been applied. Functional, dependencies and BEAM pass for `a875c6c`; the
security gate correctly remains blocking until the provenance defect is fixed.

To bound investigation time and cost, the additional non-deployment branch
`codex/conversation-codeql-diagnostics` runs static analysis on push without
repeating the three already-passing acceptance jobs. The condition is limited
to that exact branch push; master/acceptance pushes, PRs and manual dispatch on
every branch retain all four jobs. Static analysis and its failure-path gate
remain unconditional, with unchanged permissions and no path filters. A green
diagnostic run is not acceptance evidence: final promotion requires functional,
dependencies, BEAM and static analysis actually executed and passing for the
candidate SHA on the regular acceptance branch. Render backend/Phoenix remain
configured for master On Commit; no production deployment is initiated here.

Paired diagnostic scans of `660f4fa` (jobs `113604379123` and `113605582498`)
bind the same tree `0ea6869acb8530b4c2568bfb173aa2a7caa2247d91b4d18c269b14b503aca3dc`.
All 50 complete result hashes match. Artifact URIs have different ordered hashes
but equal sorted hashes; URI bases and index arrays are identical. Every one of
507 artifact indices equals its containing array position, with no other fields.
This proves URI-to-table-position churn, not changed source URIs or timestamps.
A strict v2 fingerprint must retain complete records actually referenced by
the result/rule/tool/shared metadata, all parent/reference chains, every original
index and URI/base dependency. No referenced record field is removed. Malformed,
dangling, inconsistent, ambiguous or cyclic references must block. Independent
code review and actual paired v2 stability remain required before a fresh exact
ledger binding; this diagnostic evidence alone does not approve deployment.

Independent v2 source review found additional closure defects before release:
URI-index caches could outlive an inspection, URI aliases could omit referenced
records, and branching base dependencies could consume exponential work.
Regression fixes use fresh per-inspection caches, per-closure completed-base
tracking with a shared bounded work budget, and a closed URI-only identity subset.
Unsupported, unmatched, ambiguous and noncanonical identities remain ineligible;
raw result, URI, index and selected-record fields are never rewritten or removed.
The scoped local gate/workflow suite passes 107 tests with two Windows-only
symlink privilege skips. These fixes do not prove actual scanner compatibility
or stability. Paired actual scans and independent final review remain required
before a fresh ledger can be approved; the existing ledger remains stale.

Actual v2 diagnostic candidate `9aeac3157dfc109e64234dfcda9058fec473e29c`
(run `37866851735`, static job `113615504780`) passes the Linux gate regressions
and completes CodeQL analysis. Its tree matches the local hash
`d6e1ad2bd2794ebcada5d67285de31ea90e0f514d90e06925c0e69816196d66a`.
All 50 findings remain blocked: the tool component has two absolute `file` URIs
without base IDs, indices, percent escapes or dot segments; the closed subset
rejects them as `reference.unsupported-uri`. This is compatibility evidence,
not stability or review acceptance. No ledger is rebound and no production
deployment is initiated. A sound resolver extension must retain raw tool fields
and every potentially matching artifact dependency, or remain ineligible.

The reviewed narrow compatibility extension accepts checked local absolute
file URI shapes without a supplied base table. It decodes once, rejects encoded
separators, residual escapes, dot segments, unsupported bases and identities,
and validates every candidate table identity. Since the source root is unknown,
it conservatively includes all complete segment-suffix matches, including case
aliases; it never assumes tool paths are external. Raw tool URIs, complete
selected records and original indices remain in the fingerprint. Supplied base
tables are rejected before this branch; indexed behavior remains unchanged.
Godel independently passes 17/17 focused tests and signs off the scoped source;
Darwin passes 31/31 focused regressions. Neither review approves a new ledger.
The three changed-test-file alert sites at lines 981, 1021 and 1369 are separately
reconfirmed as isolated negative fixtures by Godel, with 3/3 focused tests.

Actual compatibility candidate `3a48e60ebd1353b5978754a7803d3f27b238d6a3`
passes 116/116 Linux gate/workflow regressions without skips. Paired jobs
`113620696399` and `113621771520` (run `37868454559`) bind tree
`7c6f6404a0fedf9e49b92862e81ee08102a5179040b114c247d0106233971c43`.
All 50 findings are eligible and have identical complete v2 fingerprints,
referenced-record hashes and source hashes across the pair, despite different
global artifact ordering. All 50 raw result/rule/tool hashes also match the
earlier independently classified report; no new flow is silently approved.

Godel independently fetches both job logs and verifies every pending ledger
entry against them and the local tree. The 49 existing reasons and reviewers
remain unchanged; only the three reviewed test-file source hashes change and
the separately classified fixture helper at line 24 is added. Every occurrence
cap is one. The exact 50-entry ledger is finalized only after this approval.
Partial editing uses an invalid `pendingReviews` schema so it cannot approve
any finding. New sites, changed flows, source/tree drift, multiplicity, invalid
closures or unsuccessful scans continue to block. This supersedes the stale
ledger status above, but does not approve production promotion: all four jobs
must actually execute and pass for the finalized regular acceptance candidate.
The local integration suite passes 114 tests with two Windows privilege skips.

A bounded read-only production soak completes in 312111 ms: 99 public GETs,
zero failures, HTTP 200 for all three services, maximum concurrency two.
Backend identity remains `6e3277edd57229f751c5fe3609d95db8741405ae`;
frontend build remains `20261008193054`. Per-service p95 latency is backend
893 ms, frontend 69 ms, Phoenix 894 ms. No application writes occur. This is
public liveness evidence only, not authenticated encrypted messaging or
production capacity acceptance, and does not identify the Phoenix commit.

The candidate is first published to `codex/conversations-final-acceptance` so
the backend's On Commit deploy does not publish unverified native runtime code.
No production flags, credentials, CSP, recovery keys or pending approvals are
changed. Promotion to master requires passing candidate verification.

## Remaining External Acceptance

- Authenticated production messaging/load with approved user devices.
- Physical-device media, recovery and replacement acceptance.
- Sustained production capacity/SLO acceptance; bounded public read-only soak is
  not proof of encrypted messaging throughput or saturation capacity.
- Independent external cryptographic/security approval.

Until these gates pass, sections 228-229 and 237-238 are not certified as
PRODUCTION ACCEPTED. Separate coding agents and scanner results are useful
review evidence, not external cryptographic certification.

## Growth Phase 1 Hardening Candidate

Candidate `989ece4b95963cc4f9794ff133bdbecaaaad20dd` adds server-side
account cohort controls, truthful user-handoff share counting and bounded,
optional client-observed deep-link timing. Source and recipient enrollment are
rechecked before measurement; an excluded parent does not prevent enrolled
child sharing or acquire a retroactive continuation metric on replay.
Production growth flags remain unchanged. No private room history, messages,
credentials, pending-device approvals or CSP settings are changed.

Actual QA run `37905330406` passes functional, dependencies and BEAM jobs.
Functional evidence includes 28 growth contract tests, 115 real PostgreSQL
tests without skips, 49 secure-content browser cases and two guest-share/auth
return browser cases. CodeQL completes with 50 findings, but the old ledger
correctly fails closed on the new source-tree fingerprint
`b4407c0325d65e821582b9f3cb3ef220c7921cf7ba4b07fd9bca531a6cef1daa`.

Separate diagnostic run `37915881184`, job `113771811845`, compares all 50
source/result/closure bindings to the actual candidate scan. It derives line
mappings from exact baseline/candidate Git blobs, verifies unchanged segments,
rejects changed/crossing spans and translates only recognized SARIF physical
line coordinates. All 31 changed result fields hash exactly to the certified
prior fields after translation. No raw source bodies are printed, and arbitrary
metadata is retained verbatim. The diagnostic branch is not promoted.

Independent exact rebinding approval and a fresh, regular four-job acceptance
run remain mandatory. A pending ledger uses an invalid `pendingReviews` schema
until approval, so it cannot silently approve any finding. No parser, matcher,
review reason or occurrence cap is relaxed. Real PostgreSQL/browser acceptance
does not certify a live growth canary, regional SLO, production load capacity
or any later-phase loop in the separate Growth Loops specification.

Planck independently verifies all 50 pending identities against the actual
candidate and prior jobs, all 31 changed-field proofs, unchanged closures and
non-coordinate metadata, the candidate source tree and affected-source
classifications. All 25 focused diagnostic-helper guard probes pass. Narrow
ledger activation is approved with reasons, original reviewers and caps of one
preserved. This approval activates `reviews`; the regular four-job CI and
deployment identity checks still remain required before promotion.

Regular run `37922381635` at `7aaace1` again passes functional, dependencies
and BEAM. Its CodeQL job `113793149451` uses CLI 2.27.2 and correctly rejects
all old result fingerprints despite an identical source tree. All 50 raw
result and rule component hashes, source identities and referenced closures
remain identical to the independently reviewed candidate; only tool
semanticVersion/locations and global unreferenced run-table metadata differ.
Exact new fingerprints are prepared as inactive `pendingReviews` for another
independent metadata-only check. No tool data is omitted from fingerprints,
and no failed regular candidate is promoted.

Planck independently approves the metadata-only refresh after matching all 50
pending entries to actual job `113793149451`. CLI changes from 2.27.1 to
2.27.2; result/rule/source/primary/closure bindings are unchanged, and the
artifact URI multiset remains identical despite ordering changes. The prior
31-field coordinate proof remains valid. Entries are activated without parser,
matcher, reason, reviewer or cap changes. Fresh four-job acceptance is required.


## Cloud reconstruction after the October 9 operator handoff

Baseline: fresh `origin/master` and local HEAD both
`3149198349e7274321cf923a5c09796ab0825a86`. Accessible remote refs and commit
history did not contain the operator's unpushed computer changes. The operator
requested reconstruction when they could not recover those files. This candidate
is reconstructed from the handoff; it is not a byte-for-byte recovery of the
manually deployed frontend.

The operator-reported live identity remains build `20261009150025`, Worker
`mkubwa`, version `ef3ae34f-5562-4910-bfcf-fa4cef49fc92`. No fresh production
readback establishes that identity. The candidate build is `20261009163000`,
with both `BUILD_VERSION` and `WINGA_BUILD_VERSION` synchronized. Wrangler's
normal frontend deployment command was exercised with `--dry-run` and
`--keep-vars`; no production deployment was performed. The generated 95-module
bundle remains synchronized and unchanged. Frontend Growth defaults match the
latest handoff's enabled intent; backend flags/cohort are neither changed nor
verified by this work.

Reconstructed operations:

- `verify:growth:production` requires explicit expected backend commit, frontend
  build and flag intent before four fixed-host, credential-free GETs. It checks
  apex/www release manifests and parses bounded literal frontend defaults without
  executing downloaded JavaScript. Its public success explicitly leaves backend
  flags/cohort, authenticated canary and messaging acceptance unverified.
- `verify:conversation-soak` retains hard traffic limits and reports timeout
  counts and first/last failure offsets. Optional `--min-samples-per-target` and
  `--max-p95-ms` gates fail incomplete or slow runs. A later healthy sample does
  not erase an earlier failure. Coverage counts both soak and bounded-load
  probes; an omitted latency gate does not establish a production latency SLO.
- `test:production-verifiers` runs in functional CI without production traffic.

Fresh isolated evidence (all fixtures synthetic, no production credentials):

| Check | Result |
| --- | --- |
| PostgreSQL 18.6 canonical suite, pinned official image | 115 passed, 0 skipped; fixture schemas and owned container removed |
| Direct messages, receipts, replay and transport clients | 166 passed, 0 skipped |
| Secure content, devices, MLS, encrypted media/history | 160 passed, 0 skipped |
| Security regression gates | 161 passed, 0 skipped |
| Browser secure content/devices/recovery/encrypted Rooms | 49 passed under unchanged CSP |
| Conversation operations | 64 passed, 0 skipped |
| Rooms and rich content | 103 passed; 9 PostgreSQL-specific cases skipped in this separate no-database invocation, covered by canonical PostgreSQL suite |
| Growth isolated contracts | 28 passed, 0 skipped |
| Reconstructed verifier/soak/build regressions | 28 passed, 0 skipped |
| Workflow trigger/gate regressions | 4 passed, 0 skipped |
| Dependency scan | Frontend/backend: 0 reported vulnerabilities |
| Frontend module synchronization and Worker dry-run | Passed; both Worker version bindings match |

Detailed local logs are `/tmp/winga-messaging-{postgres,direct,secure,security,
browser,operations,rooms}.log` and `/tmp/winga-handoff-{verifiers,dependencies,
growth,workflow,build}.log`; screenshots are outside the repository in
`/tmp/winga-messaging-browser-screenshots`. Generated logs/reports/screenshots,
secrets and recovery files are not staged.

Production blockers remain explicit: the current task's managed environment
reported no ready secrets/runtime variables and no custom allowed hosts.
A proxied request to `wingamarket.com` failed CONNECT with HTTP 403, so this
candidate cannot independently verify the current production commit, Worker
version, backend cohort or device statuses. Last operator-confirmed rey/wizad
devices were Pending; no approval bypass or database trust change occurred.
Phone/PC acceptance remains deferred. Native BEAM and fresh CodeQL acceptance
must be established by the candidate's four-job CI; the prior exact-tree review
ledger is preserved and must not be treated as a reviewed binding for this new
source tree. No independent cryptographic audit or sustained authenticated
production capacity certification is claimed. Keep Phoenix at one instance.
