# Cloud Handoff: Pending Growth Changes

Date: 2026-10-09. Branch: `codex/cloud-handoff-growth`.
Base: `3e291ab242838bdebeca08972e4633b86907cf29` on `master`.

This branch publishes formerly local changes for continuation in Cloud. It is
not a production promotion. Do not merge to `master` or deploy merely because
the handoff is available. No agents were used for this handoff.

## Source Inventory

- `backend/verify-growth-production.js`: aggregate-only, read-only repeatable-read
  verifier using existing Growth store/policy. Checks migrations, schema,
  constraints, canonical events, value provenance, parent links and timing bounds.
- `backend/package.json`: adds `verify:growth-production`.
- `scripts/production-conversation-soak.js`: sanitized network failure codes and
  a baseline gate that prevents load after any intermittent baseline failure.
- `tests/growth-loops.test.mjs`: verifier, transaction rollback and bounded
  synthetic retry/load/provenance regressions.
- `tests/growth-policy.test.js`: production config, local/file defaults and
  independent explicit overrides.
- `tests/production-conversation-soak.test.js`: sanitized diagnostics and
  baseline/circuit safety regressions.
- `winga-config.js`: production Growth defaults on; local/file defaults off.
  Existing backend cohort policy remains authoritative.
- `wrangler.toml`: records the already-deployed frontend build.
- `docs/growth-production-soak-20261009.md` and the corresponding
  `docs/evidence/growth-public-soak-20261009.json` and
  `docs/evidence/growth-frontend-flags-20261009.json`: historical evidence and limits.

The local `winga-modules.js` status had no Git content diff; canonical module
verification passes for 95 modules. Unrelated screenshots, secrets, recovery
files, generated public assets and browser profiles are not part of this handoff.

## Live Deployment Difference

Frontend was manually deployed before source publication:
build `20261009150025`, Worker `mkubwa`, version
`ef3ae34f-5562-4910-bfcf-fa4cef49fc92`.
Historical rollback version: `199977f3-13c9-41b8-9e38-cf602c95d378`.
The backend verifier/tooling was not deployed by that frontend operation.
Existing statements that source was uncommitted describe that earlier checkpoint.

Future frontend deployments must update both `BUILD_VERSION` and
`WINGA_BUILD_VERSION`, preserve dashboard variables/secrets, and verify the served
manifest/config. Do not revert the frontend by deploying old `master` blindly.

## Continue In Cloud

Checkout this branch, inspect its diff against the base, and preserve newer work.
Dependencies and deployment credentials are not transferred by this branch.
Run `npm run test:growth`, `npm run test:conversation-soak`,
`npm run test:frontend` and `npm run verify:modules-sync`.
Then obtain fresh full CI, real PostgreSQL and strict CodeQL acceptance for this
source before promotion. Do not reuse an old source-tree security binding.
Do not weaken gates or fabricate missing historical evidence.

After an authorized backend deployment, Render can run:

```sh
cd /opt/render/project/src/backend
npm run verify:growth-production
```

`ok` is database invariant health, not authenticated acceptance. `canaryReady`
also needs server flags and an allowlist of at least two accounts. Public soak
is liveness only, not encrypted messaging capacity. Earlier frontend timeouts
remain unresolved by a short clean run; do not increase load on that basis.

## Messaging Blockers And Constraints

Read the canonical Conversations specs 0-109 and 110-238, final acceptance report
dated 2026-10-09 and device Pending fix report dated 2026-10-08. Older checkpoints
must not override later implementation evidence.
Devices for `rey` and `wizad` were last operator-reported Pending, not Active.
Resolve legitimate approval before authenticated production messaging tests.
Never bypass device trust, silently downgrade encryption or relax CSP.
Physical-device flows, authenticated media/recovery, production soak/load and
independent cryptographic audit remain separate acceptance gates.
Keep Phoenix at one instance; do not increase cost without permission.
No agents/subagents. Review your own changes and report ready versus outstanding.

## Handoff Verification

Fresh local checks before publication: Growth 33/33; soak safety 12/12;
realtime 75/75 (includes soak safety); frontend core 145/145 and regressions
80/80; module synchronization 95 modules. Staged diff whitespace checks pass.
Own review completed; this is not an independent security or protocol audit.

The current conversation CI push filter does not include this handoff branch.
Publishing it therefore does not imply automatic full CI execution or approval.
Use the established candidate acceptance workflow before production promotion;
new real PostgreSQL/full CI/CodeQL evidence for this source remains outstanding.
