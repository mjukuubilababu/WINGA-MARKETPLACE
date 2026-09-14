# Authoritative commerce outcomes

Migration: `2026091402_authoritative_commerce_outcomes`.

Orders created through `createCommerceOrder` opt into capture. The server supplies
the existing HMAC audience key from the authenticated session, never the request
body. Legacy orders are not backfilled. Guest-to-user identity stitching is not
implemented: experiment order metrics explicitly cover authenticated assignments
created after this migration, not anonymous cohorts.

PostgreSQL AFTER triggers persist created, paid, delivered, cancelled and refunded
milestones in the same transaction as authoritative status changes. The primary key
is order ID plus milestone. Repeated callbacks/status updates do not double-count.
Provider-confirmed refunds also capture refunds whose order status remains unchanged
(for example, late-payment reconciliation). Failed/submitted refunds do not count.

An order's eligible experiment assignment is selected once at creation, matching
buyer key, product and seller, and requiring a prior unexpired assignment within
seven days. Subsequent outcomes reuse that snapshot. No exposure is required.
The lookup is indexed; withdrawn responses do not retroactively remove cohorts.
Order deletion cascades its measurement history under the existing data lifecycle.

`GET /api/analytics/summary` returns `commerceLearning.outcomes` with seller-scoped
aggregates (admin can see global aggregates). The 30-day window is the order-created
cohort; all recorded milestones of those orders are counted. retainedPaidOrders
excludes orders with cancellation or confirmed refund, but is not net revenue.

`commerceLearning.experiment` reads order milestones independently of exposures.
Existing order fields describe creation, not payment. Paid/delivered/cancelled/refunded
audiences are separate. Events outside the seven-day observation window remain in
the durable ledger but are excluded from experiment outcomes. Lift remains null
until both cohorts meet the sample and complete-window guards. It is descriptive,
not a causal claim: SRM/uncertainty analysis and a fixed experimental cohort release
remain future work. Ongoing new assignments can keep the readiness guard collecting.

Delivered means the authoritative order status, including existing automatic
completion. It is NOT independent physical delivery verification. Existing legacy
commerceLearning.metrics and platform score aliases are not replaced in this phase;
do not treat their order/requester-satisfaction proxies as paid or fulfilled truth.

## Verification and rollout

- Run `npm run test:ci`. The new PGlite tests execute PostgreSQL SQL/PLpgSQL locally,
  including triggers, rollback, replay, window/identity checks and both arms without
  exposure. PGlite is a dev dependency, not a production database replacement.
- These tests do not prove network failover, production concurrency or replica lag.
- Deploy backend normally; the migration runner serializes and applies the additive
  migration transactionally. No frontend asset/Worker deployment is required.
- Verify the migration in Render logs, then an authorized analytics response with
  measurementVersion `authoritative-commerce-outcomes-v1` and outcomes.version.
- Use staging accounts for order/payment/refund lifecycle verification. Do not
  generate production purchases merely to make counters nonzero.
- Code rollback may leave the additive schema/triggers installed. Older code creates
  untracked orders by default. Do not drop the ledger to roll back application code.

Known independent finding: npm audit reports a high severity advisory for the
existing sharp version (<0.35.4, GHSA-rgj7-g3m4-5g8c). No unrelated media dependency
change is included here. Address it in a focused upload/media security follow-up.
