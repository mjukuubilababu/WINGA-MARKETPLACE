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
