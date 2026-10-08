# Growth Phase 1: Real PostgreSQL Acceptance

Local acceptance completed on 2026-10-08 against PostgreSQL **18.6**, matching
the PostgreSQL 18 major version in `docker-compose.production.yml`. This uses
the actual growth migration, SQL store and canonical migration runner. All
18 checks passed: nine existing SQL/API contracts and nine PostgreSQL-only
concurrency, failure and rollback tests, with no skips.

## Reproduce

On Linux with Node dependencies installed and the local Docker daemon available:

```sh
npm run test:growth:postgres
```

The runner pins the official image to:
`postgres:18@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336`.
It creates a unique disposable container, publishes a random port on 127.0.0.1,
and uses synthetic data with a random schema per fixture. It uses the local
Docker socket explicitly and never reads `DATABASE_URL`. The shared adapter
refuses missing or non-localhost test URLs before connecting. Test schemas are
dropped and checked for leaks; the EXIT trap removes the container and its
anonymous volume, including on test failure. No production flags are enabled.

`node tests/growth-postgres.test.mjs` without the explicit PostgreSQL test
environment skips its nine cases; those skips are not PostgreSQL evidence.
The regular `npm run test:growth` continues to exercise browser runtime
contracts and the existing SQL/API cases using PGlite.

## Verified behavior

| Contract | Real PostgreSQL evidence |
| --- | --- |
| Concurrent share retries | Six distinct backend PIDs; two store instances submit 48 identical requests. One share, one entry event and one increment per quota bucket persist. Twenty-four conflicting payload retries return conflicts. |
| Event dedupe | Forty-eight identical event requests produce one row; 48 new IDs for the same logical event are duplicates. Racing conflicting uses of one event ID produce one winner and one conflict; the rejected quota increment rolls back. |
| Share rate limits | 48 simultaneous account requests using different sessions yield 30 accepted and 18 rejected. Seventy-two anonymous requests from one IP yield 60 accepted and 12 rejected. With a seeded daily count of 299, 12 requests yield one acceptance at 300; rejected earlier minute/IP increments roll back. |
| Event rate limits | 144 authenticated requests yield 120 accepted and 24 rejected. Another 264 anonymous requests from one IP yield 240 accepted and 24 rejected. No rejected events or quota increments persist. |
| Late transaction failure | Injecting a failure after the actual event insert rolls back share, event and quotas. Retrying the same share ID succeeds, proving advisory-lock release. |
| Privacy changes during waits | A held quota-row transaction visibly blocks another backend PID. Changes to private/followers visibility, seller suspension, product moderation/deletion and blocks in either direction commit on another connection. The waiting share/event rejects after release; no share/event or service quota increment persists. Events also reject revocation and expiry committed while waiting. |
| Real database timeout | A held advisory lock causes PostgreSQL's actual lock timeout. The growth API returns generic retryable 503, with no partial writes. Releasing the lock and retrying the same payload succeeds. |
| Migration failure and retries | The canonical runner encounters an actual PostgreSQL SQL error after creating both growth tables. DDL and the new ledger row roll back; historical ledger rows and canonical users remain. A held migration transaction visibly blocks a concurrent runner; after release, exactly one runner records the migration and the other skips it. A third run changes nothing. |
| Schema enforcement | Real CHECK, FK and unique violations reject invalid writes; both secondary indexes exist. Share deletion cascades to its events. |

Existing contracts also cover public eligibility, revocation/expiry, bots and
self-touches, confirmed save/order ownership and timestamps, parent reshares,
anonymous-to-login attribution continuity, cohort reporting, API failure
isolation and kill switches.

## Bug found and fixed

The initial run passed seven of eight additional cases but exposed a queued-write
privacy race: share creation read public eligibility, waited on a quota-row lock,
then persisted after another transaction made the product private. The store now
takes a fresh eligibility snapshot after quota waits. Event recording also
reloads the share and its eligibility after quota/evidence waits. The expanded
privacy race regression passes under the verified READ COMMITTED isolation.

These checks reject changes committed before that final authorization read.
They do not promise that every in-flight operation is canceled by changes
committed after the read; product/visibility/block mutation paths are not made
serializable by this change. Existing resolution continues to check current
safety. Browser caches and cross-node propagation require staging acceptance.

## Rollback and acceptance boundaries

Migration rollback here means **failed application rolls back transactionally**.
There is no destructive production down migration. Backend rollback keeps this
additive schema and migration history, and the existing independent feature
flags stop creation/measurement. Deployed-version rollback and database restore
drills remain staging tasks.

The canonical runner fixture seeds the preceding migration IDs to represent an
already-migrated database, then executes only the new growth migration. It does
not recreate every historical production schema or run production startup.
This bounded six-connection workload proves the listed concurrency contracts;
it does not establish production capacity, load/soak SLOs, crawler resistance,
regional latency or canary outcomes. No staging or production deployment occurred.
