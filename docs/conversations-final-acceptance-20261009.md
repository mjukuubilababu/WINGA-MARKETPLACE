# Conversations Acceptance Follow-Up: 2026-10-09

This checkpoint follows sections 222-225. Implementation and isolated acceptance
are separate from authenticated production load, physical-device acceptance and
external cryptographic approval. The operator confirmed production accounts
`rey` and `wizad` remain Pending; their approvals are not bypassed or changed.

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
