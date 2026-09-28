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

## Foreground reads and device notification privacy (2026-09-28)

The client now sends a conversation-read acknowledgement only when the document
is visible and focused, and the rendered inbox/modal message surface belongs to
the active counterpart. Missing, hidden and mismatched surfaces do not qualify.
Selecting an inbox thread renders it before requesting read acknowledgement.
Visibility/focus restoration retries an eligible unread conversation; switching
accounts or counterparts prevents an old acknowledgement from refreshing the
new account's view. Confirmed zero-unread summaries clear only matching row
badges, without replacing a compose field or interrupting message actions.

Device notifications for message/request events, and any notification carrying
a messageId, now contain only the Winga title and a localized generic new-message
body. Sender names, private text, product context and message IDs are not passed
to the browser Notification constructor. In-app previews and other notification
types retain their existing behavior. Unsupported notification constructors are
caught so their failure cannot interrupt the event handler. Four locale catalogs
include the generic content. No schema/API migration is added.

This is a client policy, not proof of human reading, a per-message viewport
protocol, a receipt preference, or a device-authenticated acknowledgement. The
server still uses conversation-wide read state, so hidden history/new arrivals
within that existing transaction are not bounded to the rendered message set.
Already-issued requests cannot be recalled when a tab loses focus. The app is
still plaintext on the server and in its local queue; notifications retained
in the database and in-app previews are not redacted by this change. No push
provider, background service-worker delivery or E2EE capability is introduced.

Final verification: frontend core 144/144; related frontend tests 67/67 including
nine receipt/privacy tests; eight targeted browser scenarios passed. Coverage
includes hidden/unfocused read suppression, initial foreground selection, focus
resumption, generic Notification constructor arguments, constructor failure,
and unchanged retry/reload/SSE/reply/forward/delete workflows. Browser tests
control visibility/focus and stub the OS constructor; physical-device lock-screen
rendering is not claimed. Localization passed for four locales/1321 keys each.
Full unrelated backend/browser suites were not rerun.

## Tests

Focused tests cover HTTP acceptance before recipient read, sender inability to
mark outgoing messages read, PostgreSQL receipt transitions and idempotency,
acceptance NOTIFY payloads, non-destructive migration defaults, and UI handling
of legacy delivery flags versus canonical read state.

2026-09-22 verification: focused tests 127/127; complete `npm run test:ci`
passed on its first run, including frontend core 144/144, auxiliary frontend
tests 41/41, integration 200/200 and browser tests 136/136. No tests were skipped
or relaxed. Production migration status is not established by these local tests.
