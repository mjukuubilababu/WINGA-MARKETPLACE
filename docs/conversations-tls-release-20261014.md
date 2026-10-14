# Conversations operational TLS hardening release

Runtime/source commit: `73487b95bb1e970e5d8adf28c5568d947f244caa`, pushed to
`master`. This evidence branch records release observations without changing
that runtime/source commit or rebinding independent security decisions.

Thirteen audit/backup/cutover/readiness PostgreSQL clients now use the canonical
strict certificate/hostname helper. Six Conversation CLI entrypoints preserve
aggregate-only failure and cleanup behavior when configuration is rejected.
The dedicated provider preflight emits safe JSON for dependency loader failures.
The [diagnostic and implementation report](conversations-tls-diagnostics-20261014.md)
and [local evidence](evidence/conversations-tls-diagnostics-20261014.json) record
scope, actual local checks and limitations. No SQL or storage business logic,
schema, protocol, commerce flow or production SSL/CA/database URL was changed.

## Provider activation remains blocked

The source-`a6fb1758` live job `job-db7pd1id0e5s73emkuh0` ran the registered
read-only preflight command and failed. Previous job `job-db7n4i2j9qps73d1sf40`
also failed. Logs API returned 403 for both the old job filter and a service/time
filter of the current preflight. The actual failure cause is still unknown;
neither status establishes a certificate error or provider trust failure.

The operator diagnostics question is pending. Required input is only the safe
`winga-readonly-tls-preflight` JSON line, or the command error if no JSON exists.
Do not copy provider credentials or arbitrary logs. Direct service-specific
environment observations do not establish inherited runtime configuration.

Production TLS activation requires successful trust/hostname/SSL evidence for
the primary and any replica first. Do not fix an unknown error by disabling
certificate validation, guessing a CA or silently changing endpoints. These
source fixes do not prove that all live services currently use database TLS.

## Matching-source functional acceptance

Acceptance run `38585697377` passed functional job `115927011865`, BEAM job
`115927012198` and dependency job `115927012613`. The overall acceptance result
is **failure** because independent CodeQL review remains open. No release/security
policy was changed to call all CI green.

The new CLI trust, override, failure/cleanup and preflight loader regressions
passed within CI's operations step. Functional evidence also includes 54
secure-content browser checks, 27 sharing UI checks, 28 guest/auth-return checks,
frontend 153/153, four 1,777-key catalogs and 100 synchronized modules. The 106
section readiness ledger validates documentation/source coverage, not production
acceptance. BEAM passed 20 tests and 15 Phoenix transport checks; local node-loss
and PostgreSQL fixtures do not establish physical-device/provider-capacity acceptance.

## Final deployment and health verification

The [production run](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38587267558)
and job `115932474056` succeeded under the unchanged functional/dependencies/BEAM
release policy. Cloudflare final build **`20261014151230`** passed production shell
verification. All eight checked assets returned HTTP 200 and matching SHA-256
values: MLS vendor, app, stylesheet, module bundle and four locale catalogs.

All four existing Render services are live at the runtime/source commit:

| Service | Verified deployment |
| --- | --- |
| Backend | `dep-db7piktbedkc738u9urg` |
| Intelligence | `dep-db7piktbedkc738ua0b0` |
| Video | `dep-db7piktbedkc738u9ud0` |
| Phoenix | `dep-db7piktbedkc738u9u70` |

Backend and Phoenix health returned HTTP 200. Backend supplied the exact source
commit; Phoenix health has no commit, so its identity was verified through Render
live deployment metadata. [Machine-readable release evidence](evidence/conversations-tls-release-20261014.json)
preserves asset hashes, deployment/CI identities and open provider/foundation gates.
Successful deployment does not establish PostgreSQL TLS provider acceptance.

## Fresh matching-source security review inputs

The [acceptance run](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38585697377),
static job `115927012097`, reports **55 findings: 22 error, 33 warning and zero
reviewed**, with `CODEQL_REVIEW_STALE`. Its source-tree fingerprint is
`54f94c8b5de673324c850ef8e7e57aff75bdb49e296fb9bae97c000400f07b4c`.
No independent decision is copied or rebound to accept the source changes.

Current artifact `11904908320`,
`conversation-codeql-73487b95bb1e970e5d8adf28c5568d947f244caa`, expires
12 January 2027. GitHub's archive metadata digest is
`sha256:d17d2172d7a8f0f12930ff539649dc3981f546fc5562fe367bf678c17743650d`;
this is not a claim of local archive checksum verification.

The established isolated read-only projection
[run](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38586563121)
and job `115929998516` succeeded at diagnostic commit
`25dd900afbadf39972b148c39b89b7701020d782`. The actual SARIF report SHA-256 is
`57683b5ae9ed11212fe77e4968c4232ec5983212159a85d0c07e1d22e69b64e2`.
[Projected messages and flows](evidence/conversations-tls-codeql-flows-20261014.json)
include all 55 results without truncation or embedded source snippets. Their
messages and path-flow shapes match the individually inspected baseline after
normalizing coordinates/artifact indexes. This observation is engineering
evidence, not a false-positive decision or independent approval.

[Current gate and source records](evidence/conversations-tls-codeql-20261014.json)
retain current fingerprints, primary source hashes verified against the runtime
commit and null independent decisions. All rule/primary-path groups match the
baseline; six results have changed primary source bytes since `50585d50`.
An independent reviewer must assess the current artifact and actual source changes.

## Foundation and rollback limits

The canonical CodeQL review manifest and deployment policy remain unchanged.
Independent protocol/library and CodeQL decisions, physical-device/PWA/recovery,
approved history/erasure/hold/backup retention and provider/capacity evidence
remain open. Shopping Rooms §0 is not accepted; no new dependent Room feature,
production deletion or paid second Phoenix instance was introduced. Checking
Video deploy metadata does not resume the deferred video-failure investigation.

The preceding verified runtime is `a6fb17587f9883ec5f910d38b53338d16f5dd5cd`.
Rollback preserves durable data and retains the open provider/security gates.
Restoring certificate-validation bypasses is not a permanent resolution.
