# Growth failure isolation and worker resilience — 14 October 2026

Scope: Growth spec **51–54, 77, 102–103** and evidence requirements in **106**.
Source baseline: `7fd26609abc9f42adbaab17e25af240c8644b0c8`, previously deployed
on all four Render services and Cloudflare build `20261014000145`.
The user explicitly deferred video failure work; no video source, provider
configuration, moderation decision or dead-letter replay is changed here.

## Audit and selected gap

Canonical infrastructure already exists in `backend/growth-event-jobs.js` and
`backend/growth-infrastructure.js`: transactional claim/ack, at most 50 jobs per
batch, `SKIP LOCKED`, per-event savepoints, six attempts, exponential backoff,
24-hour deadline, canonical event dedupe and scoped replay. Existing component
cases cover expiry, retries/DLQ, exact IDs and timestamps. Existing PostgreSQL
cases cover share/event quotas, lock timeouts and committed privacy races.

Missing evidence was independent PostgreSQL job-worker contention and an actual
owned worker process dying after an uncommitted insert. The source implements
these boundaries; verification now exercises them directly. No replacement
queue, share/invite service, analytics domain or notification system is added.

## Isolated evidence

`npm run test:growth:resilience:postgres` creates an owned loopback-only disposable
PostgreSQL 18.6 container using the existing canonical runner. It ignores
production `DATABASE_URL`, uses random owned schemas and removes them/container
on exit. Final result: **7 passed, 0 failed, 0 skipped**.

| Scenario | Actual observation | Evidence limit |
| --- | --- | --- |
| Analytics SQL failure | 8 queued writes fail under real savepoints. 24 concurrent public share-handler resolutions return the exact destination. Fresh worker recovers original IDs/occurrence times/deadlines. No orders or saves are created. | Synthetic metadata and canonical handler, not regional HTTP throughput or real people. |
| Bounded backlog / two workers | One worker holds its transaction after insertion; public reads remain accessible. A second worker skips locked jobs and processes 10; the first processes 50. All 60 events appear once with no extra attempts. Requested batch 999 remains capped at 50. | Two controlled workers and a 60-event fixture, not viral capacity acceptance. |
| Actual worker process crash | The test forks its own loopback/schema-guarded Node worker, waits for its canonical uncommitted insertion, then sends SIGKILL only to that child. It observes the actual PostgreSQL backend disconnect/rollback. Fresh worker accepts the original event once. Public destination resolves during and after the fault. | Owned worker-process crash, not a production Render restart, provider outage or complete DB loss. |
| Lost commit response | A transaction commits, then the test deliberately loses its response. Successor sees completed state; enqueue retry is deduped and the event/creation/deadline do not change. | Synthetic response-loss injection after a real commit. The event is an open measurement, not a fabricated value conversion. |

The existing three retry/expiry/DLQ cases now also run on real PostgreSQL.
The component command without explicit PostgreSQL runs **3 passed / 4 skipped**;
those skips must never be cited as completed crash/concurrency verification.
Test-runner safety guards passed **6/6**, and all **98 frontend modules** remain
synchronized. Machine evidence and source hashes:
[growth-resilience-isolated-20261014.json](evidence/growth-resilience-isolated-20261014.json).

Delayed retry is made eligible by updating only the synthetic fixture's schedule;
occurrence/deadline are retained. No retry timing/SLO or production baseline is
inferred from this shortcut. All actor hashes and events are synthetic; no
registration, human activation, paid reach, order or meaningful Room value is
invented. Private message content is absent.

## Durable regression gate

The existing `scripts/run-conversation-postgres-tests.js` now includes
`tests/growth-event-jobs.test.mjs`, so the required functional CI executes these
four cases against its disposable PostgreSQL service with genuine connections.
The shared local runner gains a `resilience` mode rather than another container
or invitation runner. Production runtime code, schema, flags, cohorts, safety
policy and independent review ledger remain unchanged.

## Remaining spec work

- **CAP-01:** approved deployed staging, region-safe performance/budgets, full
  provider/cache/server exercises and larger native invitation bursts still need
  real execution. This isolated evidence does not close CAP-01.
- **OPS-01:** actual operator ownership, scrape/alert integration and calibrated
  baselines remain open; no recurring alert or external message is activated.
- **MSG-01 / LIVE-02:** approved sessions and actual direct Messages/Room
  participation remain user-reported incomplete. No real messaging is tested.
- **SEC-01:** current-source independent security/crypto review remains pending.
  Previous CodeQL 54 findings and stale review are historical until the next scan;
  no finding is self-approved by these tests.
- **LIVE-01 / LIVE-03 / LIVE-04 / RET-01 / REL-01:** real loop utility, mature
  retention and overall production definition of done remain open.

The previous release's exact deployment/security observations are preserved in
[release handoff](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/blob/codex/growth-release-evidence-20261014/docs/growth-messages-release-20261014.md).
Video investigation/replay is deferred by user instruction.

## Rollout / rollback

Use existing required functional/dependency/Phoenix checks and deployment
workflow, then verify commit/build/asset identities. Never weaken a security
review gate to make evidence appear accepted. This change has no runtime
migration or rollout flag. If the isolated fixture itself regresses, revert its
commit and rerun the existing checks; preserve canonical records and event IDs.
