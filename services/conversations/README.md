# Phoenix durable transport

Text transport for existing Winga conversations, with a browser adapter
behind explicit server rollout gates. This is **not E2EE**. The production
browser enables all accounts at `wss://winga-phoenix.onrender.com/socket`;
Node remains disabled until its environment explicitly enables enrollment.
REST/SSE remains available when the Phoenix channel is not ready.
PostgreSQL and the Node message writer remain authoritative.
Phoenix nodes keep no durable messages, credentials database or local files.

## Contract

1. The authenticated browser obtains a five-minute ticket with the existing
   CSRF-protected POST `/api/messages/transport-ticket`. Its existing session
   becomes a registered delivery device. The ticket contains a hash binding,
   not the reusable Winga session token.
2. Connect to `wss://<transport-host>/socket/websocket?vsn=2.0.0`, then join
   topic `device` with `{ticket}`. Never put credentials in a URL.
3. Phoenix delegates each operation to Node's service-authenticated POST
   `/api/internal/conversations/command`. Node validates the signature,
   audience, expiry, active session, token rotation and registered device.
   The service token alone does not authorize a user operation.
4. `message.send` accepts only `clientMessageId` (UUID), `receiverId` and
   `message` (up to 4,000 characters). Sender identity is derived on Node.
   Accepted replies require the canonical persisted ID and sequence. A lost
   response produces `outcome_unknown`; retry with the **same** client ID.
   The canonical transaction owns idempotency, message, sequence, notification,
   dispatch outbox and device fan-out. No second writer is introduced.
5. `events` pushes the existing device-queue projection, at most 50 events.
   Only one unacknowledged batch is held per channel. A client persists and
   deduplicates events before `events.ack` with `{eventIds}`. An ACK only
   advances that device's queue; it does not mean Delivered or Read.
6. Explicit `message.receipt` uses the existing `kind` (`stored` or `read`),
   `withUser` and `messageIds` contract. Phoenix supplies the authenticated
   device ID. Never generate these receipts merely because a socket is open.
7. Reconnect to any Phoenix node to replay unacknowledged events. Clients must
   request a fresh ticket before expiry and rejoin; an expired, revoked or
   unavailable authorization closes the channel. Reauthorization runs every
   10 seconds even while waiting for an ACK.

Phoenix uses bounded HTTP calls (4-second request budget, 512 KiB response),
32 KiB WebSocket frames, 24 KiB command payloads, a 20-command/10-second
per-channel budget, and one pending batch. Idle delivery polls every 2 seconds.
These are canary safeguards, **not** a capacity or denial-of-service guarantee.
Fleet-wide connection/rate budgets, telemetry, presence and load testing remain
release gates. A backend outage is never interpreted as successful persistence.

## Configuration

Node (disabled unless explicitly enabled):

- `WINGA_PHOENIX_TRANSPORT_ENABLED=true`
- `WINGA_PHOENIX_CANARY_USERS`: comma-separated exact usernames of designated
  test accounts. Empty means nobody can enroll unless all-user rollout is on.
- `WINGA_PHOENIX_ALL_USERS=true`: explicitly allow every authenticated account.
  The transport enable flag, ticket verification and session checks still apply.
  Omitted or any value other than literal `true` retains the exact canary list.
  Removing an account from that list, or turning off all-user rollout, revokes
  its ticket eligibility after the new Node configuration is deployed.
- `CONVERSATION_TICKET_SECRET`: random secret, at least 32 characters.
- `CONVERSATION_SERVICE_TOKEN`: separate random secret, at least 32 characters.

Phoenix:

- `CONVERSATION_SERVICE_TOKEN`: same service secret as Node; do not give Phoenix
  the ticket-signing secret, database URL, ops token or browser password.
- `CONVERSATION_BACKEND_URL`: Node HTTPS origin, no path or credentials.
  Plain HTTP is accepted only for explicit localhost development.
- `PHX_SERVER=true`, `PORT` (default 4100).
- Production: `MIX_ENV=prod`, `SECRET_KEY_BASE` (random, at least 64 characters),
  `CONVERSATION_ALLOWED_ORIGINS` (comma-separated exact HTTPS origins).

Provision secrets through the host secret manager. Do not commit or print them.
Restrict the adapter endpoint to the transport network where supported, use TLS
between hosts, preserve WebSocket upgrades and redact authorization/frame
payloads from proxy logs. The Node adapter rejects browser Origin/Cookie
credentials and is not a browser CSRF exception.

## Build And Test

Requires a supported Elixir/Erlang toolchain; this slice was built with Elixir
1.20.4 / OTP 28.4. Locked dependencies are in `mix.lock`.

```sh
cd services/conversations
mix deps.get
mix format --check-formatted
mix test --warnings-as-errors
mix compile --warnings-as-errors
```

From repository root:

```sh
npm run test:conversation-transport
# Explicit disposable localhost PostgreSQL only; never DATABASE_URL.
WINGA_TEST_POSTGRES_URL=postgresql://postgres@127.0.0.1:55439/postgres npm run test:phoenix-transport
WINGA_TEST_POSTGRES_URL=postgresql://postgres@127.0.0.1:55439/postgres npm run test:conversation-concurrency
```

The Phoenix test requires installed Microsoft Edge (Playwright's `msedge`
channel). It creates and drops a random database, launches the real Node
backend and two Phoenix nodes, simulates failure before write and lost reply
after commit, terminates one node, retries concurrently on the survivor, and
checks device ACK isolation, throttling, Stored/Read and revocation. It also runs
the pinned official Phoenix JS SDK in two real browser contexts with native
IndexedDB, sends without a REST fallback, loses an ACK and reloads the receiver
to prove deduplicated replay and explicit Read. It writes synthetic
fixture logs only into ignored `.tmp-phoenix-e2e-*` directories.

For a host with the toolchain installed, build a release:

```sh
MIX_ENV=prod mix deps.get --only prod
MIX_ENV=prod mix compile --warnings-as-errors
MIX_ENV=prod mix release
# Set runtime secrets above before starting:
_build/prod/rel/winga_conversations/bin/winga_conversations start
```

`GET /health` checks the Phoenix process only, not the Node writer or database.
No Render service, paid instances, DNS or public traffic are created by these
commands.

## Canary And Rollback

### Render service setup

Create a separate Web Service for this repository, without a persistent disk:

| Setting | Value |
| --- | --- |
| Branch | `master` |
| Root Directory | `services/conversations` |
| Language | `Elixir` |
| Build Command | `bash build.sh` |
| Start Command | `_build/prod/rel/winga_conversations/bin/winga_conversations start` |
| Health Check Path | `/health` |

Set the Phoenix runtime variables listed above, including `PHX_SERVER=true`
and `MIX_ENV=prod`. Pin `ELIXIR_VERSION` and `ERLANG_VERSION` to the tested
toolchain, then confirm those versions in the Render build log; local release
success alone does not prove availability on the host. Do not attach the Node
database credentials or run database migrations from this service.

This follows Render's [Phoenix service deployment](https://render.com/docs/deploy-phoenix)
and [runtime version configuration](https://render.com/docs/elixir-erlang-versions),
with this repository's release name and no frontend asset or Ecto build steps.
Do not replace the existing Winga Node service or change its start command.

### Browser activation

Preserve database migrations/outbox workers. Production configuration uses the
verified Phoenix host and explicit all-user browser rollout. Both Node flags
below must be set on the **Winga Node backend**, not on Phoenix:

```dotenv
WINGA_PHOENIX_TRANSPORT_ENABLED=true
WINGA_PHOENIX_ALL_USERS=true
```

The shared service token must match Phoenix; the distinct ticket secret stays
on Node only. The browser configuration is:

```js
phoenixTransportEnabled: true,
phoenixTransportUrl: "wss://winga-phoenix.onrender.com/socket",
phoenixAllUsers: true,
phoenixCanaryUsers: []
```

To restrict rollout again, set Node's `WINGA_PHOENIX_ALL_USERS=false` and its
exact canary list, and deploy browser configuration with `phoenixAllUsers:false`:

```js
phoenixTransportEnabled: true,
phoenixTransportUrl: "wss://<verified-transport-host>/socket",
phoenixAllUsers: false,
phoenixCanaryUsers: ["<designated-test-username>"]
```

For canary mode the account must also be in Node's server-side allowlist. Hostnames and account
names are configuration, not secrets. Never put a ticket or service secret in
frontend configuration. Self-hosted `/vendor/phoenix.min.js` is built from the
exact locked npm version; SDK loading does not contact an external CDN.

Before enabling a canary, add only the verified `wss://<transport-host>` to
the serving shell's CSP `connect-src` (Worker, static `_headers`, or Node as
applicable). Set the exact frontend HTTPS origin on Phoenix. Do not weaken CSP
or use wildcard origins to make a test connect. Provisioning the host, its TLS,
runtime secrets and the explicit CSP change remains an operator release step.

Plain text uses Phoenix only when the authenticated device channel is ready.
Rich/product/reply messages keep their existing REST path. SSE remains active
for legacy UI and commerce events. While the durable channel is ready, device
queue polling pauses; it resumes on the existing bounded timer after disconnect.
Both paths use the same serial IndexedDB consumer. Stored is sent only after
local transaction completion; Read still requires visible message IDs.

Tickets renew before expiry and on SDK resume. Commands have an eight-second
deadline with at most eight outstanding. An uncertain socket send never silently
retries over REST inside the adapter: the existing offline queue retains the
same client message ID for a later attempt. A stale account, revoked receipt,
failed storage transaction or unconfirmed ACK cannot advance the device queue.

Production verification still requires the exact deployed backend commit,
authenticated device persistence, writer restart, load/backpressure and
deployed Phoenix node-loss replay. Enabling all accounts does not mark these
checks complete; health, origin probes and local tests cannot prove them.

Rollback: route clients back to REST/SSE, disable
`WINGA_PHOENIX_TRANSPORT_ENABLED` on Node and stop Phoenix. Keep PostgreSQL
messages, event queues, receipt rows and outbox data; do not roll them back.
Reuse outstanding client message IDs when retrying over REST. Confirm existing
chat, push and receipts remain healthy. Ticket/service secret rotation rejects
existing tickets/connections; never fall back to unauthenticated transport.
