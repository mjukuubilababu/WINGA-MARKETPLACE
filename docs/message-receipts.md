# Message Acceptance and Receipt Labels

## This increment

New message acceptance means Sent, not Delivered. POST `/api/messages`, durable
PostgreSQL insertion/NOTIFY, and the local/Firebase compatibility adapters now
start with `isDelivered: false`, empty `deliveredAt`, and unread state.
Normalization/import no longer invents a delivery timestamp from creation time.

Migration `2026092202_message_delivery_default` sets the database default to false.
It does not rewrite or delete historical rows. Older explicit delivery flags may
still exist in history/API responses; the UI does not treat them as recipient
evidence and displays Sent for unread messages.

The existing authenticated conversation-read action remains authoritative for
Read. Only incoming rows for that caller and counterpart are updated. It also
sets delivery fields at the read acknowledgement time, an upper bound on receipt,
not a measured device-arrival timestamp. Repeating the action does not change
already-read timestamps. No order/fulfillment delivery state is changed.

## Boundaries still outstanding

- No device identity or durable receiving-device acknowledgement protocol exists.
- No separate Delivered UI claim is made until such evidence exists.
- Read remains the existing conversation-wide acknowledgement, not per-message
  viewport evidence or a new bounded read-position protocol.
- Legacy historical flags are preserved; they must not be used for new delivery
  latency metrics or presented as device receipt evidence.
- Encrypted local storage, E2EE, BEAM and replay outbox remain separate work.
- Production migration and authenticated two-device behavior require runtime
  evidence; public health checks do not prove them.

## Tests

Focused tests cover HTTP acceptance before recipient read, sender inability to
mark outgoing messages read, PostgreSQL receipt transitions and idempotency,
acceptance NOTIFY payloads, non-destructive migration defaults, and UI handling
of legacy delivery flags versus canonical read state.

2026-09-22 verification: focused tests 127/127; complete `npm run test:ci`
passed on its first run, including frontend core 144/144, auxiliary frontend
tests 41/41, integration 200/200 and browser tests 136/136. No tests were skipped
or relaxed. Production migration status is not established by these local tests.
