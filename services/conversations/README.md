# Phoenix durable transport

Initial opt-in text transport for existing Winga conversations. This is **not
E2EE** and is not connected to the production browser client. REST/SSE remains
the default. PostgreSQL and the Node message writer remain authoritative.
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

The Phoenix test creates and drops a random database, launches the real Node
backend and two Phoenix nodes, simulates failure before write and lost reply
after commit, terminates one node, retries concurrently on the survivor, and
checks device ACK isolation, Stored/Read and revocation. It writes synthetic
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

Deploy as a separate service with synthetic accounts first. Keep the public
frontend on REST/SSE and preserve database migrations/outbox workers. Prove the
exact deployed commit, TLS/origin rules, ticket renewal, physical-device local
persistence, writer restart, load/backpressure and node-loss replay before an
explicit browser routing change. No production switch is implied by local tests.

Rollback: route clients back to REST/SSE, disable
`WINGA_PHOENIX_TRANSPORT_ENABLED` on Node and stop Phoenix. Keep PostgreSQL
messages, event queues, receipt rows and outbox data; do not roll them back.
Reuse outstanding client message IDs when retrying over REST. Confirm existing
chat, push and receipts remain healthy. Ticket/service secret rotation rejects
existing tickets/connections; never fall back to unauthenticated transport.
