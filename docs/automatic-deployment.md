# Automatic production deployment

Push production changes to `master`.

Render's existing services are configured to deploy automatically from `master`:
the backend services, Phoenix conversations service, intelligence worker, and
video background worker. These deployments start independently of GitHub checks.
All four services use `autoDeployTrigger: commit` on `master`. Backend (`WINGA`)
and Phoenix retain their service root directories but explicitly include `**/*`
in Render's build filters, with no ignored paths. This allows changes anywhere
in the repository to trigger those services too, including shared files and
deployment configuration outside their root directories. The two background
workers already use the repository root and have no restrictive build filters.

To restore these settings in Render, use Settings → Build & Deploy: select
On Commit, link `master`, and set Included Paths to `**/*` with no Ignored Paths
for `WINGA` and `winga-phoenix`. Build filter paths are relative to the repository
root ([Render monorepo documentation](https://render.com/docs/monorepo-support)).

Cloudflare deployment runs after the `Winga Conversation Acceptance And Security`
workflow completes for a push to `master`, provided its `functional`,
`dependencies`, and `beam` jobs all succeeded. CodeQL findings and the
`static-analysis` job do not block Cloudflare deployment; they remain visible in
the acceptance workflow. It deploys the exact tested commit, skips commits
already superseded on `master`, and serializes deployments. Failed, cancelled,
skipped, or missing required jobs prevent Cloudflare deployment.

The workflow updates the five existing Workers: `mkubwa`,
`winga-intelligence-worker`, `winga-session-security-relay`,
`winga-account-recovery-relay`, and `winga-video-safety-adapter`. It preserves
remote variables and secrets and explicitly updates both frontend build version
bindings (`BUILD_VERSION` and `WINGA_BUILD_VERSION`) to the same asset version.
It checks the production shell and confirms the published build version.
The same HTTPS verifier checks both shell consistency and the expected deployment
version. Verification retries up to five times, with 15 seconds between attempts,
to allow the new deployment to propagate; an older or inconsistent build fails.
Worker updates are sequential; a failure can leave some Workers updated. Review
the failed run before retrying with a new push.

## One-time GitHub configuration

Set these under repository Settings → Secrets and variables → Actions:

- Secret `CLOUDFLARE_API_TOKEN`: a real Cloudflare token with permission to deploy
  these Workers and manage their existing routes, assets, queues, KV, and bindings.
- Secret or variable `CLOUDFLARE_ACCOUNT_ID`: the production Cloudflare account ID.

Credentials injected into a Codex cloud session are not automatically available
to GitHub Actions. Do not copy session proxy placeholders into GitHub secrets.
Render does not require an Actions API key for its existing Git integration.

Monitor the `Winga Production Deployment` run in GitHub Actions and service
deployments in Render. No chat session is needed once the workflow is on `master`
and the GitHub credential configuration is complete.
## Cloudflare transient API failures

The Worker deploy step uses `scripts/deploy-cloudflare-worker.js` with the
previously verified Wrangler version 4.149.0. Each Worker has at most three
attempts, waiting five and fifteen seconds for transient HTTP/network failures
or malformed API responses. Authentication, permission and configuration errors
fail immediately. Retries preserve the same config, `--keep-vars` and frontend
build bindings; a failed Worker never advances the job to production verification.
The existing required CI checks, commit pinning, superseded-head check and
expected-build verification remain mandatory. Tests cover bounded exhaustion,
transient recovery, exact arguments and non-retryable failures.
