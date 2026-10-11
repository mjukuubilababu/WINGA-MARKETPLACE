# Growth Production Verification And Bounded Soak

Date: 2026-10-09. No additional agents used. Review performed by the implementing engineer; this is not an independent audit.

## Scope

- Reused canonical Growth store, policy, SQL fixtures and public soak runner.
- Added `backend/verify-growth-production.js` / `npm run verify:growth-production` for Render.
- The verifier uses a repeatable-read, read-only transaction and reports only aggregates: required migrations, schema presence, primary keys, semantic event uniqueness, the validated cascade foreign key, duplicate/orphan events, canonical entries, parent consistency, verified-value provenance, timing bounds, server rollout and canonical metrics.
- It does not change flags, create orders, prune records, send notifications or infer authenticated acceptance from existing metrics.
- `ok` means checked database invariants are healthy, not that Growth is enabled. `canaryReady` additionally requires both server flags and an allowlist of at least two accounts. Frontend rollout and actual user actions remain separate acceptance requirements.

## Isolated Load And Failure Recovery

`npm run test:growth` exercises twelve synthetic recipient/share journeys in waves of four. Each entry is retried three times; each open/view/save is retried twice. A deliberate post-insert transaction failure must leave no event and subsequently recover using the same event ID. Twelve canonical reshares link continuation to the parent.

Expected final state: 24 shares, 72 events, 12 opens, 12 views, 12 confirmed saves, 12 continuations, 12 unchanged timing samples, zero orders. Twenty repeated verifier reads must preserve this state. A deliberate change to value provenance must fail the integrity gate.

Local execution uses PGlite, not independent PostgreSQL connections or production capacity. The same tests are included in the existing real-PostgreSQL acceptance runner, but that runner has not been rerun for this new change on this Windows host. Docker, psql and an installed WSL distribution are unavailable here. Prior release PostgreSQL acceptance is historical evidence, not acceptance for newly added tests.

## Public Production Soak

Targets: backend health, frontend build manifest, Phoenix health. Only fixed HTTPS GET endpoints are permitted. No cookies, tokens or application mutations are sent. Maximum two requests in flight and at least one second between load starts. Each response is bounded to 16 KiB with a ten-second timeout.

The runner stops on 429, changed release, or three consecutive failures. Review added a stricter gate: **any intermittent baseline failure also prevents the load phase**. Network diagnostics expose fixed codes only; never raw error messages, request URLs or credentials.

The first two runs did not pass: one stopped on consecutive request failures; the next completed with three frontend timeouts. Before the stricter gate was added, the second run also made 24 bounded public load requests. Backend and Phoenix each returned 25 successful responses; frontend returned 22 successes and 3 timeouts. These are public liveness observations, not Growth conversions or messaging capacity.

One subsequent IPv4-only curl request returned 200 in 834 ms. A default curl request timed out before TCP/TLS connection; an IPv6-only request could not resolve the host. This does not establish the failure's root cause. Do not fix production routing or weaken timeouts solely from these observations.

Detailed outcomes, including the final IPv4-first diagnostic run, are recorded in `docs/evidence/growth-public-soak-20261009.json`.

Final diagnostic: five-minute baseline, 51 requests, backend 17/17 successful, Phoenix 17/17 successful, frontend 15/17 successful with two ten-second timeouts. The corrected gate returned `SOAK_BASELINE_FAILED` and issued zero load requests. IPv4-first did not resolve the observed failure. Larger production load remains blocked; do not increase traffic or assert production readiness from these results.

## Render Command After This Tooling Is Deployed

```sh
cd /opt/render/project/src/backend
npm run verify:growth-production
```

No password, OPS token or recovery key is required in the command or output. Do not run production load or create synthetic orders merely to make metrics nonzero.

For the currently live release, this snapshot uses existing canonical modules only. It reads rollout and metrics; it is **not** the new full integrity verifier and does not claim canary acceptance:

```sh
cd /opt/render/project/src/backend
node <<'NODE'
const { Client } = require('pg');
const { createGrowthStore } = require('./growth-store');
const { createGrowthPolicy } = require('./growth-policy');
const c = new Client({ connectionString: process.env.DATABASE_URL,
  ssl: String(process.env.DATABASE_SSL).toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000, statement_timeout: 10000 });
(async () => {
  await c.connect();
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const store = createGrowthStore({ query: (...a) => c.query(...a), withTransaction: async () => { throw new Error('READ_ONLY'); } });
  const metrics = await store.readGrowthHealth();
  await c.query('COMMIT');
  console.log(JSON.stringify({ ok: true, mode: 'growth-production-snapshot', privacy: 'aggregate-only',
    databaseChanged: false, remoteWrites: false, flagsChanged: false,
    authenticatedGrowthCanaryVerified: false, productionLoadVerified: false,
    features: { productSharing: process.env.WINGA_GROWTH_PRODUCT_SHARING_ENABLED === 'true',
      measurement: process.env.WINGA_GROWTH_MEASUREMENT_ENABLED === 'true' },
    rollout: createGrowthPolicy(process.env).summary, metrics }, null, 2));
})().catch(() => { console.log('{"ok":false,"errorCode":"GROWTH_SNAPSHOT_FAILED","databaseChanged":false}'); process.exitCode = 1; })
  .finally(() => c.end().catch(() => {}));
NODE
```

## Remaining Acceptance

- Default-path frontend soak must pass without unexplained timeouts before increasing traffic.
- A selected-account canary must prove the authenticated share/open/save/reshare path and frontend flags, with before/after aggregate metrics.
- Guest-first/auth-return browser behavior and rollback have prior isolated evidence, not new live recipient acceptance here.
- Real PostgreSQL acceptance for this patch and larger regional capacity/chaos testing remain separate work.
- Later Growth phases (room invite tokens, Demand/Supply linkage, collections/creator/referral loops) are not completed by this verifier or public soak.

## Local Review And Release State

31 Growth tests and 75 realtime tests (including 12 soak safety tests) passed, with no skips. `git diff --check` passed. The strict module-sync check failed on this Windows checkout: all 95 modules match when CRLF is normalized to LF, but byte-for-byte comparison fails. No frontend source or generated bundle was changed to hide that failure.

This patch has not been committed, pushed or deployed. Full CI/real PostgreSQL acceptance and the existing strict CodeQL source-tree binding have not been refreshed for these changes. The currently live release remains `3e291ab242838bdebeca08972e4633b86907cf29`; the live-compatible Render snapshot above does not require deploying this patch.

## Subsequent Frontend Flags Rollout

The user supplied a successful Render aggregate snapshot with both server flags off and empty metrics, then confirmed setting the requested server canary environment and explicitly requested enabling frontend config. On that request, production frontend defaults were enabled; local/file defaults and browser kill-switch overrides remain intact. No additional agents were used.

Frontend build `20261009150025` is deployed as Worker version `ef3ae34f-5562-4910-bfcf-fa4cef49fc92`. The prior rollback version is `199977f3-13c9-41b8-9e38-cf602c95d378`. Both non-secret build-version aliases were updated with `--keep-vars`; secrets, CSP and backend cohort policy were not changed.

The remote versioned config matches the tested built asset byte-for-byte. Both production default Growth flags evaluate to true in the tested local config; downloaded JavaScript was not executed. Production smoke passed 8/8; Growth passed 33 tests; frontend core passed 145/145 and frontend regressions passed 80 tests. After the canonical build, strict module sync passed for all 95 modules, resolving the earlier local CRLF mismatch without weakening that check.

A two-minute predeployment zero-load public soak passed 18/18 requests against the previous frontend build. This short pass does not invalidate earlier recorded timeouts. Authenticated Growth journeys, independent backend rollout verification and larger production load remain unverified.

This is a **frontend-only deployment**: the new backend verifier and other pending tooling are not deployed, and these changes have not been committed or pushed. Full CI/real PostgreSQL/strict CodeQL acceptance for the pending patch remains outstanding. Details are in `docs/evidence/growth-frontend-flags-20261009.json`.
