# Automatic production deployment

Push production changes to `master`.

Render's existing services are configured to deploy automatically from `master`:
the backend services, Phoenix conversations service, intelligence worker, and
video background worker. These deployments start independently of GitHub checks.

Cloudflare deployment runs after the `Winga Conversation Acceptance And Security`
workflow succeeds for a push to `master`. It deploys the exact tested commit,
skips commits already superseded on `master`, and serializes deployments. Failed
acceptance checks prevent Cloudflare deployment.

The workflow updates the five existing Workers: `mkubwa`,
`winga-intelligence-worker`, `winga-session-security-relay`,
`winga-account-recovery-relay`, and `winga-video-safety-adapter`. It preserves
remote variables and secrets and explicitly updates the frontend build version.
It checks the production shell and confirms the published build version.
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
