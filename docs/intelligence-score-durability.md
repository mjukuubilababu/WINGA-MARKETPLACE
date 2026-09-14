# Durable Intelligence Scores

## Contract

`appendIntelligenceEvent` persists a canonical event, replay receipt, contribution
budget and both score deltas in one PostgreSQL transaction. Producer snapshots
remain accepted as a legacy argument but never replace durable totals.

- Existing signal weights and the three-contributions-per-actor/target/event-type
  limit in each fixed ten-minute bucket are unchanged. The limit now lives in
  PostgreSQL, so independent processes share it.
- Signed `score_total` preserves negative contributions regardless of delivery
  order. Public `score` is bounded to 0 through 9999999999.99, matching its existing
  numeric column. First/last timestamps use event time, not arrival order.
- Replaying a committed event ID does not increment totals. Any failure rolls
  back its receipt, budget, raw event and scores together. A retry can complete.
- `order_created` means order intent, not a purchase. Failed product saves,
  promotion submissions, image searches and chat actions remain diagnostic events
  with no positive score. The consumer re-normalizes the original source event,
  including queued messages produced by older application versions.
- Feed SQL ordering, ranking weights, pagination and frontend code are unchanged.
  Corrected durable scores can still affect the existing bounded feed bonus.

Local platform Maps remain process-local diagnostics, not durable/global totals.
This change does not turn client telemetry into authoritative payment evidence.
Payment and order outcomes belong to the separate commerce outcome ledger.

## Migration and Baseline

Migration `2026091403_atomic_intelligence_scores` adds signed accumulators,
receipts and contribution windows. It preserves existing scores as a legacy
baseline and seeds receipts for existing raw event IDs. It does not claim that
historical scores were accurate, repair past lost increments or replay history.
Old raw events without receipts after migration can be completed by the new
writer, which handles an old worker's raw INSERT followed by a rejected snapshot.

The migration updates both score tables and seeds receipts from the raw ledger.
Measure migration duration and locks against a restored production database
before a large deployment. It uses the existing migration runner/transaction.

## Retention

New score contributions require an event timestamp within 180 days of database
time, with at most five minutes of future clock skew. Outside that range, an
event remains auditable but does not change scores. Event IDs and timestamps
must stay immutable during queue retries.

Receipts survive configurable raw-event deletion. Worker maintenance removes
at most 10,000 expired receipts and 10,000 expired contribution windows per hourly
pass. Window cleanup includes an extra ten-minute safety margin. Replaying an
expired event cannot bypass protection after its receipt is removed. A cleanup
backlog affects storage, not score correctness; monitor table growth and tune
cleanup throughput separately if expired volume exceeds that capacity.

## Rollout

1. Confirm a database recovery point and the target commit for the API and every
   standalone intelligence worker. No new environment secret is required.
2. Drain/pause old intelligence consumers, then deploy the API and all intelligence
   workers to the same commit. Resume consumers only after migration succeeds.
3. Verify migration `2026091403_atomic_intelligence_scores` is recorded and worker
   logs show successful processing, without rising retries/dead letters.
4. Verify an ordinary event changes the durable score once; replay its same event
   ID in staging and confirm no second increment. Check product and seller totals.
5. Verify order creation/failure diagnostics do not create purchase/success scores.

A database trigger rejects legacy snapshot writers with SQLSTATE `55000` and
`Intelligence score writer upgrade required`. This protects totals during mixed
versions, but old consumers can exhaust retries if left running. Resolve version
skew before requeueing affected jobs through existing operational procedures.
Do not drop this guard to make an old worker appear healthy.

After migration, rolling back only the application to a snapshot-writing commit
is not a supported rollback. Pause consumers and roll forward a compatible fix,
or use a separately reviewed database/application recovery plan. Never reset
receipt tables or reconstruct payment evidence from score totals.

## Verification Boundaries

`tests/intelligence-score-store.test.js` runs the actual SQL and triggers in
PGlite, covering independent producer snapshots, replay, shared contribution
budgets, event ordering, transaction rollback, failed aliases, database reopen,
old-writer rejection, retention and legacy baseline migration.

PGlite uses one leased connection. These tests verify PostgreSQL semantics but
are not a live multi-connection PostgreSQL load, lock-contention or failover test.
Run those checks on staging before claiming global-capacity validation.

`npm run test:ci` includes this suite plus existing commerce, frontend,
localization, API and browser regression gates. A successful Git push, public
health response or frontend deployment is not proof that Render's API and
background workers run the target revision. Confirm both Render deployments and
their migration/queue logs before marking production rollout verified.
