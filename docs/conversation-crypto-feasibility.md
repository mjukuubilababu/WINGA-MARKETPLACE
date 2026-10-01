# Browser device crypto feasibility

Status: isolated evaluation on 2026-10-01. No production E2EE, key registration,
protocol selection or new chat security claim is made by this work.

The live device queue uses an authenticated session ID. That is not a
cryptographic device identity. Existing message bodies and local retry data are
still plaintext. Adding a public key field to the current session table without
a reviewed protocol, authorization and recovery model would not close that gap.

## Candidate boundary

- Signal's libsignal README says outside use is unsupported and its TypeScript
  API wraps native Rust code. Browser/PWA compatibility and licensing therefore
  remain unproven for Winga.
- OpenMLS documents a WebAssembly build with the `js` feature, but its own
  `openmls-wasm` README calls the bindings an experiment. A successful WASM build
  is not evidence of complete browser API, persistence or device interoperability.
- MLS RFC 9420 provides group cryptography, including per-member credentials and
  key packages. The application still owns identity verification, delivery,
  recovery and authorization.

Sources checked: [libsignal README](https://github.com/signalapp/libsignal/blob/main/README.md),
[OpenMLS WebAssembly guide](https://book.openmls.tech/user_manual/wasm.html),
[OpenMLS WASM experiment](https://github.com/openmls/openmls/tree/main/openmls-wasm),
[MLS RFC 9420](https://datatracker.ietf.org/doc/html/rfc9420), and
[W3C Web Crypto](https://www.w3.org/TR/WebCryptoAPI/).

## Browser result

The isolated `crypto-storage-feasibility.spec.js` test passed in the project's
headless Microsoft Edge on Windows. It generated a synthetic non-extractable
Web Crypto key, committed it to a separate IndexedDB database, closed the tab,
opened a new tab in the same browser context and retrieved the key. `exportKey`
was rejected and no key was written to localStorage.

This only proves that browser storage path in that test environment. It does not
prove persistence across app reinstall, storage eviction, full browser shutdown,
Android Home Screen/PWA behavior or key recovery. A non-extractable `CryptoKey`
is still usable by malicious same-origin script, and the W3C specification warns
that origin storage can be cleared. This test does not show that OpenMLS can store
its protocol state as a non-extractable `CryptoKey`; its storage adapter needs
separate evaluation. These remain security design constraints.

## Next gate

Build a separate pinned OpenMLS browser prototype with synthetic accounts and
two independent device stores. Prove create/join, encrypted send/open, persisted
state after restart, out-of-order/replayed events, revoked-device exclusion and
multi-tab write serialization on desktop and the actual Android PWA. Measure
bundle size, startup cost and memory. Select a protocol only after exact-version
license, dependency, audit and recovery review. Keep existing direct chat on its
current mode until that gate passes; never silently downgrade an encrypted mode.

## Isolated TypeScript protocol spike

On 2026-10-01, `experiments/mls-protocol-spike/` pinned `ts-mls@1.6.4` for an
additional, non-production API experiment because it runs in browsers without
a local Rust/WASM toolchain. The synthetic Node and headless Edge tests passed:
group create/join, encrypted delivery, serialized-state restore, replay
rejection, out-of-order delivery and post-removal message exclusion. The Edge
test also confirmed that synthetic serialized state bytes remain in IndexedDB
after a tab is closed and reopened. Its minified bundle was 139,868 bytes raw
and 39,129 bytes gzip in this configuration.

A second Edge test passed with Alice and Bob in independent browser contexts
and IndexedDB stores. Bob decrypted a new message after his tab reopened. Two
Alice tabs sent concurrently under a Web Locks guard, and Bob decrypted both;
this test also passed three repeated runs. The separate-device bundle measured
139,475 bytes raw and 38,997 bytes gzip.

On 2026-10-02, a third Edge test passed with two separate persistent browser
profiles. After both Edge processes closed and reopened, Alice recovered a
pending ciphertext from IndexedDB, Bob decrypted it, Alice removed it from the
local outbox, and the next message also decrypted. A forced IndexedDB abort
left no partial outbox entry and the subsequent message remained decryptable.
In this harness, new MLS state and outgoing ciphertext are written in one
IndexedDB transaction. The updated device bundle measured 140,559 bytes raw
and 39,300 bytes gzip.

This does not replace the OpenMLS evaluation or pass the production gate.
`ts-mls` explicitly says it has no formal security audit, and its default
authentication service accepts any credential. The sample puts raw serialized
secret state into IndexedDB, so its storage pattern must not be copied into
the app. The first test uses two logical members in one runtime; the second
uses independent browser contexts and guarded multi-tab writes, but not
separate physical devices. Desktop Edge process restart passed; browser
restart on an actual Android PWA, identity binding, device verification and
recovery have not been tested. The synthetic local outbox is not a production
delivery/retry design: Web Locks and
IndexedDB cannot make remote send and acknowledgement atomic with local state.
No Winga message endpoint or UI was changed.
