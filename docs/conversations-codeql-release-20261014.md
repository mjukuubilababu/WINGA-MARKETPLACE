# Conversations CodeQL triage and hardening release evidence

Runtime/source commit: `a6fb17587f9883ec5f910d38b53338d16f5dd5cd`.
The source fixes and baseline triage were committed and pushed to `master`.
This separate evidence branch records the immutable release without changing
the runtime source or its CodeQL source-tree binding.

All 55 findings received source/data-flow engineering assessments. Two local
I/O gaps were reproduced and fixed across six source paths: non-blocking open
before descriptor validation in three file readers, and proper directory
boundaries in three localhost static harnesses. The exact preconditions,
reproductions, local test groups and limitations are recorded in the
[triage report](conversations-codeql-triage-20261014.md) and
[verification record](evidence/conversations-codeql-triage-checks-20261014.json).
No remote exploit or independent cryptographic acceptance is claimed.

## Fresh scan and complete review inputs

The source-matching [acceptance run](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38579401617),
static-analysis job `115904968539`, reports **55 security findings: 22 error,
33 warning and zero reviewed**, with `CODEQL_REVIEW_STALE`.
Its source-tree fingerprint is
`819519bcbf216db8236c3f01a673807fdb849bc00b6ecb1a8122b260bdefaa1b`.
The reader fixes do not remove the general lstat/open scanner patterns; their
specific FIFO behavior is demonstrated by the passing regression tests.

Current review artifact `11903020316` is
`conversation-codeql-a6fb17587f9883ec5f910d38b53338d16f5dd5cd`, expiring
12 January 2027. GitHub reports archive metadata digest
`sha256:8726a2df2ba8e60a6bd4bbb9fd0c5e8c5003d93f50618f16478cbe3cd0185f4e`.
That metadata is not a claim of local archive checksum verification.

The existing isolated, read-only projection workflow retrieved the current
immutable artifact using the official download action. Its
[projection run](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38580418800)
and job `115908526641` succeeded at diagnostic commit
`48158d1739b8f8e2c45dc074108d5ba957759205`. The current SARIF report SHA-256 is
`ce6c2d9a031fe043e10992ebf2983230d24a09d5ff46a9516646f9c7f9dd75cb`.
The diagnostic workflow is confined to its evidence branch and was not added
to production master or its deployment policy.

[Current projected flows](evidence/conversations-codeql-current-flows-20261014.json)
retain all 55 messages, primary and related action locations, and code-flow
threads without truncation or embedded source snippets. All 55 messages and
path-flow shapes match the inspected baseline after normalizing coordinates
and artifact indexes; results 15 and 49 have coordinate/index changes.
Current rule/primary-path groups also match the baseline. Primary source
SHA-256 values were verified against the exact runtime commit; six results
reference changed sources: 0, 1, 13, 14, 15 and 49.

[Current gate/location evidence](evidence/conversations-codeql-rescan-20261014.json)
binds those observations to the fresh scan and its artifact.
[Baseline assessments](evidence/conversations-codeql-triage-20261014.json) retain
the individually documented assumptions and proposed dispositions. No current
result is accepted, and independent decisions remain null. Matching counts or
flow shapes do not establish security acceptance. An independent reviewer must
disposition the current artifact and source changes before updating the canonical
review manifest; prior reviewer names/fingerprints must not be copied to this tree.

## Final exact-source CI and deployment verification

Functional, dependencies and BEAM acceptance jobs succeeded. Functional CI
includes 54 secure-content browser checks, 27 sharing UI checks, 28 guest/auth-return
checks, seven actual Chromium DOM URL checks, frontend 153/153, four catalogs
with 1,777 keys each and 100 synchronized modules. The 52-test file/untrusted-key
regression step includes all three FIFO swaps and all three encoded sibling-root
cases. BEAM passed 20 tests and 15 Phoenix transport checks, including real
isolated PostgreSQL/native ciphertext/retry/node-loss evidence. These fixtures
do not establish physical-device or production regional-capacity acceptance.

The acceptance run's overall result remains **failure** because its static review
gate is open. The final
[production run](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38581328326)
and job `115911671779` succeeded under the unchanged policy requiring functional,
dependencies and BEAM. Production shell verification passed for Cloudflare final
build **`20261014143205`**. Do not describe all CI/security checks as green.

All eight verified runtime assets returned HTTP 200 and matching SHA-256 values:
MLS vendor, app, stylesheet, modules and four locale catalogs. Backend health
returned HTTP 200 with the exact source commit; Phoenix health returned HTTP 200.
Phoenix does not expose a commit in health, so Render deployment metadata supplies
its source identity. All four existing Render services were verified live at the
same runtime commit:

| Service | Verified deployment |
| --- | --- |
| Backend | `dep-db7ouivavr4c73fisof0` |
| Intelligence | `dep-db7ouivavr4c73fisqd0` |
| Video | `dep-db7ouivavr4c73fispug` |
| Phoenix | `dep-db7ouinavr4c73fiso90` |

[Machine-readable release evidence](evidence/conversations-codeql-release-20261014.json)
records the current deployments, build, asset hashes, health identity limits,
actual CI results and open foundational gates. This evidence is documentation
on a separate branch; the certified production runtime remains `a6fb1758`.

## Remaining foundation gates and rollout boundary

The canonical review manifest and production deployment policy are unchanged.
Engineering triage, tests and deployment do not accept Shopping Rooms §0 or the
full Conversations foundation. Still required are independent protocol/library
and CodeQL review, real foreground/background/PWA devices and recovery,
provider TLS/trust activation evidence, approved history/erasure/hold/backup
retention policy, and production capacity/regional soak evidence.

No second paid Phoenix instance, new dependent Shopping Room feature, blanket
production history purge or unverified production TLS toggle was introduced.
Checking the existing Video service deployment metadata does not resume the
deferred video-failure investigation. The supplied Conversations and Shopping
Rooms specifications remain incomplete at §54 and §61 respectively.

Rollback uses the preceding verified runtime commit
`50585d50deaa7ba4dacf65162104733f67ccbc31` while preserving durable data.
Neither fix changes database schema, crypto protocol or commerce state. A rollback
must retain the open review gate and must not treat restoration of unsafe file/path
behavior as a permanent resolution.
