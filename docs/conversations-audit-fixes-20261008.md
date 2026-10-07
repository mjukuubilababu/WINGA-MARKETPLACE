# Conversation Audit Fixes And Separate-Agent Review: 2026-10-08

## Scope

This reviewed fix candidate follows the three findings recorded in
[the original audit](conversations-audit-soak-20261008.md) against source
`50dc862c19defda8a2260e11b30ae448d2ad7d71`. The dated original report is preserved;
its open findings describe that earlier release, not this working-tree candidate.
At the verification checkpoint, no commit, push or deploy had been performed.
The operator subsequently authorized commit and push of this candidate. Exact
publication identity must come from Git; a deployment is not certified by this
report. No production account action, feature flag, secret, CSP, instance count
or production data was changed by the verification/fix work.

## Corrections

1. Singleton Room confirmation now permits one native proof only when the exact
   canonical roster contains one native. Exact count, native signatures, transfer
   digest and durable activation remain mandatory. Genuine MLS regression covers
   empty/forged proofs, confirmation, runtime reload and a usable singleton send.
   The backend lifecycle regression now asserts local confirmation and sends
   before the last owner leaves, rather than checking only a server epoch.
2. Same-native re-admission selects a fresh own-native Add Welcome instead of
   applying a missed commit to the removed endpoint's stale state. It requires
   an exact new one-time package, a confirmed older Room and no unresolved text,
   media or lifecycle journal. History is retained; vault abort does not consume
   the package. Reload and exact retry work, excluded-epoch ciphertext remains
   inaccessible and a second genuine local Room remains byte-for-byte unchanged.
   Service regression checks that sync before explicit Join leaves both retained
   and returning native vaults untouched. The all-native activation barrier is
   retained; new admissions are not silently approved.
3. New operations share the old global compatibility key and acquire sorted,
   deduplicated group/pair/message/media/seller scopes. Old exclusive writers and
   the bounded history pruner still exclude new transactions during mixed-fleet
   operation. Polls and history-task reads hold group row snapshots without
   changing keyset cursor order. Private media authorization follows the same
   scope-before-actor order and retains its existing signed-body error contract.
   A three-second database lock timeout returns a stable retryable 503; signature
   freshness is still checked after waiting and is never extended.

## Independent Reviewer Follow-Up

The human explicitly authorized a different read-only reviewer-agent, James,
agent `01a118aa-5a57-7f43-98b0-2c88365b020b`. That reviewer inspected code and
surrounding contracts independently, without editing files, using secrets,
accessing production accounts or sharing the implementing agent's test cluster.

The first review found an additional P2: Alice reserving A-B and Bob reserving
B-C could contend for Bob's fresh package while the account `FOR UPDATE` lock
blocked Alice's foreign-key insertion. A barrier-controlled actual PostgreSQL
test reproduced the pre-correction failure as `40P01`, not merely a model.

Correction: authenticated account locking now uses `FOR NO KEY UPDATE` while
sessions retain `FOR SHARE`. Account operations still serialize; status changes,
deletion and key updates still conflict, but foreign-key `KEY SHARE` reads are
compatible. This lock behavior is defined by
[PostgreSQL's row-lock documentation](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).
Residual deadlocks and lock timeouts map to `encrypted_operation_busy`; the
transaction rolls back before the caller can retry its exact logical request.
No automatic mutation replay or weaker signature expiry has been introduced.

The new PostgreSQL regression demonstrates one successful cross-pair reservation,
one safe package-unavailable rejection, no losing quota charge, a single package
consumption and stable exact retries. A separate actual lock-matrix test checks
compatible key-share reads, conflicting concurrent auth/update locks, a waiting
suspension and denied authentication after that suspension commits.

Final separate-agent re-review found no residual actionable findings in the
requested scope. The reviewer independently passed the four small lock tests;
the full suites below were run by the implementing agent, not independently
duplicated. Separate-agent review is not external cryptographic approval.

## Verification

| Check | Evidence |
| --- | --- |
| Native Room crypto plus lock helper, final changes | 27/27 passed, no skips |
| Final complete real PostgreSQL run | 73/73 passed, no skips, including cross-pair and account-lock regressions |
| Initial Room crypto/projection/service/configuration suite | 75 passed, nine PostgreSQL-only skips; those nine passed in the actual PostgreSQL run |
| Encryption/private media/recovery, final common lock change | 145/145 passed, no skips |
| Actual HTTP browser Room/history/seller scenarios, final common lock change | 3/3 passed |
| Realtime/reconnect/dispatch/public-probe safety | 70/70 passed |
| Frontend core and behavior | Passed, including 80/80 behavior checks |
| Localization | Four catalogs, 1,612 matching keys each; zero new hard-coded UI debt |
| Static frontend build and source bundle | Build passed; 93 synchronized modules; prepared version `20261007232058` |
| Patch whitespace | `git diff --check` passed |

The lock helper's regressions are included in `test:ci`. The disposable
PostgreSQL runner supports a name filter for reproductions and never uses the
production `DATABASE_URL` or downloads a database executable.
Both disposable clusters stopped; no listener remains on ports 55445/55446.
The final cluster's fast shutdown reached the runner's deadline; its existing
immediate-stop fallback stopped only that fresh synthetic data directory.

The final local Room load used two stores, six connections and three owners:
48 unique ciphertexts, 96 send attempts/decryptions, 192 receipts/ACKs, zero
duplicate rows and three converged boards. Its 2,049 ms duration and 282 ms
p95 store attempt are bounded local observations, not production capacity/SLOs.

## Boundaries

These are implementation regressions and a separate-agent code review, not an
externally commissioned cryptographic certification. `cryptographicAuditApproved`
remains false. No production encrypted throughput, physical-device media/recovery
acceptance or fleet failure SLO is certified by local measurements.

The earlier public production soak remains 99 public GET requests with zero
failures. It measured the earlier deployed release, not this fix candidate.
Authenticated production soak requires designated synthetic accounts/devices and
an agreed traffic budget; existing customer accounts, real orders, wallet actions,
forced outages and paid scaling are outside this follow-up.
