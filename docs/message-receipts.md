# Message Acceptance and Receipt Labels

## Session-bound device receipts and exact viewport reads (2026-09-28)

This section supersedes the earlier outstanding boundaries below. The profile's
existing active-device list and revoke-session actions are the management surface.
The server-issued `sessionId` identifies a device login, stays stable across token
rotation, and changes on a new login. It is not a hardware fingerprint or E2EE key.

Migration `2026092803_message_device_receipts` adds an independent per-message,
per-session receipt ledger. It intentionally has no cascading foreign keys into
the legacy snapshot-rewritten tables. A message trigger preserves receipt flags
across snapshot replacement. No old delivery flags are converted into device proof.

Authenticated `GET /api/messages/device` negotiates the current device identity.
`POST /api/messages/receipts` accepts `stored` or `read`, a counterpart and at most
100 exact IDs. The server locks and validates the live session and active user,
checks participant ownership and both block directions, and requires same-device
stored evidence before read. Replays are idempotent. Exact-message notifications
and durable owner resync dispatch commit in the same transaction. Revoking a
session prevents subsequent receipts; it does not erase historical receipt proof.

The client commits the complete incoming message into native IndexedDB before
sending `stored`. A failed/aborted transaction or unavailable IndexedDB sends no
receipt. Only the server-derived `deviceDeliveredAt` enables the Delivered label;
Sent still means server acceptance and historical `isDelivered` is insufficient.
Read selects incoming IDs actually intersecting the focused visible chat viewport,
including ancestor clipping and overlay hit-testing, and rechecks after storage
before sending. Scrolling and returning to focus retry eligible messages. Hidden
history and concurrent later arrivals are never included via a conversation-wide
update. The refreshed client does not downgrade to the broad legacy read endpoint.

Storage is account/device scoped. Writes prune to 1,000 rows and remove entries
older than seven days; pruning is opportunistic, not a background expiry guarantee.
Logout and observed 401 revocation queue cleanup behind any in-flight write.
Browsers can evict storage later. Delivery means the client reported a committed
transaction, not permanent storage or hardware attestation. Unvisited history may
remain Sent until a recipient client actually receives and stores its body.

The inbox, server and send queue remain plaintext, not E2EE. Read is viewport
evidence, not proof of human comprehension. Already-issued requests cannot be
recalled on focus loss. The old conversation-read route remains for older clients
and can still create legacy read flags; refresh clients to use the new protocol.
An offline revoked device cannot be remotely wiped until it reconnects. No push
provider or background inbox delivery is introduced.

After Render finishes the new deploy, run from its backend shell:

```sh
npm run verify:message-device-receipts
```

This read-only, aggregate-only checker proves migration/table/trigger/index state,
not an authenticated physical-device flow. A real two-device check should show
Sent, then Delivered after recipient storage, then Read on reaching the message.
Local SQL tests do not claim to model PostgreSQL cross-connection lock scheduling.

Local verification for this increment passed: 14 targeted browser scenarios with
native IndexedDB, mobile viewport scrolling, storage aborts, ACK retry, account
isolation, revocation cleanup and existing chat workflows; 42 paging/replay/schema
tests; 46 realtime/session tests; 140 SQL/frontend receipt regression checks;
frontend core 144 and auxiliary frontend 67; two explicit HTTP authentication/CSRF
checks; the expanded receipt unit suite 12; localization and module synchronization.
These suites overlap. They are not evidence of a production migration or an
authenticated real-device run. The full unrelated test:ci suite was not rerun.

## Earlier acceptance increment

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

## Boundaries at the earlier acceptance increment

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
