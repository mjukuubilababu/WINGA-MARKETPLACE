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
```

From the repository root, after its dependencies are installed:

```sh
npx --no-install playwright test --config experiments/mls-protocol-spike/playwright.config.cjs --reporter=list
```

The Node and Edge tests cover create/join, encrypted application delivery,
serialized group-state restore, replay rejection, out-of-order delivery and a
removed member's inability to read a subsequent epoch. The Edge test uses an
ephemeral localhost origin, writes synthetic serialized state to IndexedDB,
and checks that the bytes remain after closing and reopening a tab. It does
not decrypt a new message after that tab restart; decryption after a
serialize/deserialize roundtrip is tested before the tab is closed.

## Security boundary

The library's own README says it has not received a formal security audit.
Its default authentication service accepts any credential. This spike does
not bind device keys to Winga accounts or provide key verification, recovery,
protected storage, multi-tab serialization, independent browser contexts, or
Android PWA validation. The IndexedDB sample stores raw serialized MLS state,
which includes secret material; it is deliberately unsuitable for production.
No code in this directory is imported by the live app.

Pinned browser bundle measured 139,868 bytes raw and 39,129 bytes gzip on
2026-10-01. `npm audit --omit=dev --audit-level=high` reported zero known
advisories for these runtime dependencies at that time; this is not a crypto
audit. The package imports `@noble/hashes` at runtime without declaring it as
a required dependency, so this spike pins it explicitly. A production library
decision still requires a reviewed identity service, key lifecycle and
recovery design, dependency/security review, and tests on actual devices.

Source: https://github.com/LukaJCB/ts-mls#readme
