# MLS protocol spike (synthetic only)

This directory is independent from Winga's production frontend and backend.
It exercises `ts-mls@1.6.4` with synthetic members and no external network service,
real users, production keys, or production message data. It is evidence of
protocol API feasibility, not an E2EE implementation or product selection.

## Run

From this directory:

```sh
npm ci
npm test
npm run build:browser
npm run build:devices
```

From the repository root, after its dependencies are installed:

```sh
npx --no-install playwright test --config experiments/mls-protocol-spike/playwright.config.cjs --reporter=list
```

The Node and Edge tests cover create/join, encrypted application delivery,
serialized group-state restore, replay rejection, out-of-order delivery and a
removed member's inability to read a subsequent epoch. One Edge test uses an
ephemeral localhost origin, writes synthetic serialized state to IndexedDB,
and checks that the bytes remain after closing and reopening a tab. A second
Edge test runs Alice and Bob in separate browser contexts, with separate
IndexedDB stores. Bob closes and reopens a tab, then decrypts a new message
from the stored state. Two Alice tabs send concurrently through a Web Locks
guard; Bob decrypts both. The second test passed three repeated runs.
A third Edge test closes both browser processes, reopens their separate
persistent profiles, delivers a message recovered from Alice's outbox, and
confirms Bob can decrypt a subsequent message. It also aborts a synthetic
IndexedDB transaction and confirms no partial outbox entry remains.
The localhost test server stores ciphertext by outbox ID before returning a
synthetic 503. After a full Edge restart, Alice retries the same ciphertext;
the server retains one logical entry and Bob decrypts it. A conflicting
ciphertext under the same ID is rejected. A second synthetic crash after a
successful server ACK but before local outbox deletion is recovered after a
tab restart, again without a second logical server entry.

## Security boundary

The library's own README says it has not received a formal security audit.
Its default authentication service accepts any credential. This spike does
not bind device keys to Winga accounts or provide key verification, recovery,
protected storage, or Android PWA validation. Web Locks serialize writes in
this local harness. One IndexedDB transaction commits the new MLS state and
outgoing ciphertext together, but network delivery and remote acknowledgement
are outside that transaction. The local outbox does not provide a production
retry policy, server idempotency or crash-safe remote ACK reconciliation. The
synthetic server's idempotency map is only in memory, and the deliberate 503
does not prove how every browser handles a dropped HTTP response. No durable
server state or Winga message endpoint is exercised. The
IndexedDB sample stores raw serialized MLS state, which includes secret
material; it is deliberately unsuitable for production. No code in this
directory is imported by the live app.

Pinned browser bundle measured 139,868 bytes raw and 39,129 bytes gzip on
2026-10-01; after adding the local outbox, the separate-device bundle measured
140,559 bytes raw and 39,300 bytes gzip on 2026-10-02.
After the synthetic delivery/ACK test, the separate-device bundle measured
140,925 bytes raw and 39,433 bytes gzip on 2026-10-02.
`npm audit --omit=dev --audit-level=high` reported zero known
advisories for these runtime dependencies at that time; this is not a crypto
audit. The package imports `@noble/hashes` at runtime without declaring it as
a required dependency, so this spike pins it explicitly. A production library
decision still requires a reviewed identity service, key lifecycle and
recovery design, dependency/security review, and tests on actual devices.

Source: https://github.com/LukaJCB/ts-mls#readme
