# Product Share canary through authenticated account capabilities

The operator confirmed three participants' opt-in in the task and selected three
approved public products. Participant names belong in the hosting cohort settings
and private operator handoff, not a public repository or unauthenticated config.
This exercise covers share/view/save; it does not place an order or fabricate a
purchase for products whose price is negotiated.

`GET /api/growth/capabilities` reuses the canonical cohort. It returns only the
current authenticated account's Product Sharing/Measurement booleans. It accepts
no actor query parameter, has private/no-store and Cookie/Authorization variation,
and denies guests, crawlers, excluded accounts and disabled rollout. It requires
an active marketplace account. It does not reveal cohort members or counts.

Production clients load this optional capability after session restoration/login,
then refresh every minute with a three-second transport deadline. Account or
session replacement rejects stale replies; logout turns the flags off immediately.
Failure leaves exact public content and plain sharing available. Guest clients
make no capability request and emit no growth observations. Explicit local test
browser overrides retain their existing fixture behavior.

Before account activation, an incoming validated product/share reference can stay
in memory for 30 minutes. Nothing is journaled or measured while the guest is
unenrolled. Transient Home navigation during auth must not consume this intended
context. Once the authenticated recipient returns to the matching visible product,
measurement may begin. Pre-auth timing is unknown and is excluded from latency
samples; the two-second meaningful-view dwell begins after activation. Native
membership, public eligibility and canonical value authorization remain unchanged.

## Hosting configuration

Keep `WINGA_GROWTH_COHORT_MODE=allowlist`, preserve previously enrolled/consented
accounts and add only the explicitly confirmed participant usernames to
`WINGA_GROWTH_COHORT_USERS`. Set:

- `WINGA_GROWTH_ACCOUNT_ROLLOUT_ENABLED=true`
- `WINGA_GROWTH_PRODUCT_SHARING_ENABLED=true`
- `WINGA_GROWTH_MEASUREMENT_ENABLED=true`
- `WINGA_GROWTH_COHORT_GUEST_MEASUREMENT=false`

Other loop flags keep their current rollout state. Public product/share destinations
remain available if the capability or measurement service is unavailable. A client
flag cannot override server cohort, safety, value proof or rate limits.

## Natural participant exercise

1. A participant signs in with their own account and opens a selected public
   product. Copy/share its link explicitly; the activated link includes an opaque
   `share` UUID.
2. Another opted-in participant opens that actual copied link. Guests see the
   product before authentication, and remain unmeasured. After login the exact
   product context returns and a visible two-second dwell is an observed view.
3. Save only if the participant wants to keep the product. A save must be a real,
   canonical new save after share creation, for someone else's product. Existing
   saves and seller self-saves are not new value evidence; do not unsave/resave
   merely to manufacture a conversion. Optional onward sharing demonstrates the
   continuation with a new opaque share linked to its parent.

These are deliberate live canary observations, not proof of causal organic
acquisition, regional capacity or D1/D7/D30 retention. No automatic messages,
reminders, contacts, rewards, fake user actions or new memberships are involved.

## Read-only baseline and subsequent comparison

An operator may run `backend/growth-canary-reader.js` in the backend service's
existing environment. It requires `WINGA_CANARY_READ_ONLY=true`, an explicitly
selected set of at most five accounts/products and `WINGA_CANARY_SINCE` (UTC, at
most 30 days old). Example with operator-supplied placeholders:

```sh
WINGA_CANARY_READ_ONLY=true WINGA_CANARY_ACCOUNTS='<consented usernames>' WINGA_CANARY_PRODUCT_IDS='<selected public IDs>' WINGA_CANARY_SINCE='<rollout UTC timestamp>' node growth-canary-reader.js
```

The reader uses one connection, a repeatable read-only transaction and five-second
SQL deadlines. It neither initializes/migrates the store nor changes records. The
JSON contains only scoped aggregate counts and verification labels, never cohort
names, share/session/message/Room IDs, message bodies or private order details.
Counts begin with new shares in the selected window; anonymous and out-of-scope
recipients are excluded. A successful read does not certify a completed canary.

Rollback: use the existing `WINGA_GROWTH_PRODUCT_SHARING_ENABLED=false` and
`WINGA_GROWTH_MEASUREMENT_ENABLED=false` flags for an immediate stop to creation
and recipient-event intake once the backend configuration is running. Disabling
`WINGA_GROWTH_ACCOUNT_ROLLOUT_ENABLED` alone stops new client activation and makes
clients follow the disabled capability within one minute plus the bounded
transport deadline; it is not an independent server-write kill switch. Preserve valid
link routes and schema. Restore the private pre-change cohort snapshot if reversing
new enrollments, without removing unrelated already-consented accounts.

Current independent CodeQL review, regional capacity/operations and mature real
retention remain separate production-readiness gates.
