# Growth canary: local rehearsal and live handoff

**The local rehearsal passed. A live staging/production canary has not started.**
The current managed environment has no configured deployment credentials,
staging target or selected live accounts. The target/cohort clarification is
pending. Production feature flags remain off.

## Rehearsal evidence

Run `npm run canary:growth:local` with the local Docker daemon, installed Node
dependencies and `/usr/bin/chromium`. The runner creates the pinned PostgreSQL
18.6 container from the database acceptance suite, bound to localhost on a
random port. The canonical backend initializes its full schema and migrations;
the existing E2E harness seeds three synthetic accounts and one photo listing.
The normal E2E file-store mode remains the default.

The browser-to-HTTP-to-PostgreSQL journey uses the actual frontend, CSRF/auth
handling, share/event API, save/order repositories and admin aggregate report.
No growth or commerce responses are mocked. Clipboard handoff is captured
locally instead of sending anything externally. Chromium uses a simulated
desktop user agent for these synthetic human journeys; the ordinary headless
agent was correctly rejected by the existing crawler filter. This is not
evidence of real-user behavior or a comprehensive bot test.

Final [machine-readable evidence](evidence/growth-canary-local-20261008.json):

| Observation | Result |
| --- | --- |
| Synthetic cohort | Three accounts, two independent recipient browser journeys; one extra control browser |
| Durable shares | Two: original share and recipient reshare |
| Guest opens / meaningful views | Two / two, with two-second visible detail dwell |
| Authentication return | Both recipients returned to the exact product detail |
| Confirmed canonical values | One save and one synthetic order start; no payment or purchase claimed |
| Continuation | One parent-linked recipient reshare |
| Reporting | Admin aggregate counts match both recipient journeys; guest report access denied |
| Growth HTTP responses | 12 observed responses, zero failures |
| Browser outboxes | Zero pending items, dead letters or observed retry signals at sampled drain points |
| Control browser | Guest product and plain copy remain usable; zero growth requests |
| Rollback contract | Disabled API handler rejects new creation/measurement while resolving the existing PostgreSQL envelope; frontend flags restore plain sharing |

The rollback check constructs the real API handler with flags disabled against
the same database. It does not restart a deployed backend, change hosting
configuration or establish a deployed rollback time. Test account sessions are
not included in the report. The runner stops its servers and removes the
disposable database container/volume. Final schema-leak checking passed.

The rehearsal found no product defect. Its initial attempts exposed fixture
assumptions: fake video readiness is invalid on PostgreSQL, browser restoration
needs the established session hint, and headless agents are intentionally
excluded. The final fixture uses one photo product and the canonical E2E
session setup. Control traffic is measured per browser because participating
browsers can emit legitimate, deduplicated dwell retries.

## Live canary prerequisites

Select the deployment target and three to five opted-in test accounts, identify
the exact backend/frontend release, confirm staging migrations and a restore
point, and provide deployment and admin-report access through configured
credentials. Do not send secrets in chat.

The original rehearsal used global server booleans and browser overrides;
that was not production cohort enforcement. The Phase 1 hardening now adds
server `WINGA_GROWTH_COHORT_MODE=allowlist` with exact enrolled usernames in
`WINGA_GROWTH_COHORT_USERS`. Use it together with the existing independent
creation/measurement flags, never browser overrides alone. Invalid/empty
allowlists deny writes; old public links remain usable. New cohort/migration
acceptance on real PostgreSQL and a live deployment are still required.

Guest observation is off by default in allowlist mode. Enabling
`WINGA_GROWTH_COHORT_GUEST_MEASUREMENT=true` admits anonymous observations for
enrolled-source shares, not a fixed recipient-account cohort. Those public
links can travel beyond test accounts. Prefer isolated staging for strict
guest-canary isolation. See the current [rollout contract](growth-loops-rollout.md).

Use one approved, public test listing. Record aggregate metrics before and after
normal manual sharing, guest viewing, save and order-start actions by the
selected accounts. Monitor actual growth API errors, route/auth-return failures,
outbox/dead-letter counts and canonical save/order counts. Keep values distinct
from purchases and opens distinct from acquisition. No automatic messages,
invites, payments or scheduled monitors were created by this work.

For this small run, stop on any privacy leak, wrong-account attribution,
duplicate canonical mutation, failed product/auth return, unexpected growth
HTTP error or an outbox that fails to drain within the bounded observation
window. Investigate before increasing the cohort. With only a few synthetic
journeys, success rates are acceptance observations, not production SLOs or
growth effectiveness measurements.

To stop the rollout, turn off server `WINGA_GROWTH_MEASUREMENT_ENABLED` and
`WINGA_GROWTH_PRODUCT_SHARING_ENABLED` plus frontend `growthMeasurement` and
`growthProductSharing`. Confirm new growth writes stop while existing public
links and authorized envelope resolution still work. Retain the additive
schema and migration history. Record the deployed rollback separately.
