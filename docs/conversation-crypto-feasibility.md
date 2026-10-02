# Browser device crypto feasibility

Status: isolated evaluation on 2026-10-01. No production E2EE, key registration,
protocol selection or new chat security claim is made by this work.

Follow-up on 2026-10-02: the operator explicitly required production CSP to remain
unchanged. WASM candidates that require `wasm-unsafe-eval` are therefore not
deployable under the accepted configuration. A native Web Crypto media/recovery
codec and disabled owner-scoped backup API have been implemented separately;
see `encrypted-content-and-recovery.md`. This does not select a messaging protocol
or turn the isolated `ts-mls` experiment into production E2EE.

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

The stock pinned OpenMLS v0.9.0 WASM binding is not ready for Winga's browser
gate. Its exposed group API covers creation, joining and message processing,
but does not expose a provider/group persistence and restore API. Its own README
still describes the binding as an experiment. A Winga-specific binding and
reviewed storage adapter would be required before a restart test is meaningful.
The local workspace also has no Rust/WASM build toolchain. These are engineering
constraints, not a security verdict on the underlying OpenMLS library.

Wire CoreCrypto offers browser WASM and persistent storage, but its GPL-3.0
license requires a separate compatibility review before adoption in Winga.
The isolated `ts-mls` spike below is not a substitute: its upstream project
disclaims a formal security audit. No candidate has passed the production
selection gate, so the current chat remains in its existing plaintext mode.

The next protocol gate is a separately reviewed, pinned browser implementation
with two independent device stores. It must prove create/join, encrypted
send/open, persisted state after browser and Android PWA restart,
out-of-order/replayed events, revoked-device exclusion, multi-tab write
serialization, identity binding and recovery. Measure bundle size, startup cost
and memory. Select a protocol only after exact-version license, dependency and
security review. An encrypted conversation must never silently downgrade.

Binding sources: [OpenMLS v0.9.0 binding](https://github.com/openmls/openmls/blob/openmls-v0.9.0/openmls-wasm/src/lib.rs),
[OpenMLS WASM status](https://github.com/openmls/openmls/blob/main/openmls-wasm/README.md),
[Wire CoreCrypto](https://github.com/wireapp/core-crypto), and
[Wire CoreCrypto license](https://github.com/wireapp/core-crypto/blob/main/LICENSE).

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

The next isolated test added a localhost-only, in-memory idempotent delivery
endpoint. It stored ciphertext by outbox ID, then deliberately returned 503.
Alice retained the pending entry through a full Edge process restart and
retried the same bytes; the server kept one logical entry and Bob decrypted
it. A conflicting payload with the same ID returned 409. A separate forced
crash after a successful ACK but before local deletion left the pending entry
for retry after a tab restart, again with one logical server entry. These
tests passed in headless Edge. The server map is not durable, the 503 is an
ambiguous outcome rather than a literal dropped response, and no production
transport was changed.
The separate-device test bundle measured 140,925 bytes raw and 39,433 bytes
gzip after this addition.

The recipient-side retry gate then committed decoded MLS state and a
synthetic inbox record in one IndexedDB transaction. A forced abort left no
record and allowed processing the same ciphertext again. After Bob's full
Edge process restart, a repeated event ID with the same ciphertext returned
`duplicate` from the inbox instead of attempting MLS decryption again; a
different ciphertext under that ID was rejected. Two Bob tabs racing on one
event produced one `new` and one `duplicate`. The device bundle measured
142,375 bytes raw and 39,780 bytes gzip. Existing plaintext message sends
already use durable PostgreSQL `message_idempotency`; this experiment does
not exercise that production path or the conversation event queue ACK.

The latest separate-device harness wraps serialized MLS group state and
decrypted inbox content with AES-GCM before IndexedDB writes. A persisted
non-extractable Web Crypto key survived a full Edge process restart; export
was denied. Direct IndexedDB inspection found encrypted envelopes instead
of the original inbox text, tampering caused decryption to fail, and deleting
the local key caused state loading to fail closed. Its bundle measured
143,955 bytes raw and 40,252 bytes gzip. The previous raw-state experiment
records are not migrated: this reader rejects them. This is a desktop
storage-adapter feasibility result, not a claim of hardware-backed keys,
Android persistence, recovery, or protection from same-origin script
injection. [Web Crypto](https://www.w3.org/TR/WebCryptoAPI/) documents the
key storage model and the script-injection threat.

This does not replace the OpenMLS evaluation or pass the production gate.
`ts-mls` explicitly says it has no formal security audit, and its default
authentication service accepts any credential. Earlier versions of this
sample stored raw secret state and inbox content; the current wrapper still
keeps a usable decryption key in the same origin and cannot establish safe
production key custody. The first test uses two logical members in one
runtime; the second uses independent browser contexts and guarded multi-tab
writes, but not
separate physical devices. Desktop Edge process restart passed; browser
restart on an actual Android PWA, identity binding, device verification and
recovery have not been tested. The synthetic local outbox is not a production
delivery/retry design: Web Locks and
IndexedDB cannot make remote send and acknowledgement atomic with local state.
No Winga message endpoint or UI was changed.

## Pinned device authentication experiment (2026-10-02)

The isolated sample now also tests a restrictive authentication adapter using
independently supplied synthetic account/device/public-signing-key pins.
The selected suite uses 32-byte Ed25519 signing keys. Malformed/versioned or
non-canonical credentials, owner/device mismatches, duplicate registrations,
substituted keys and revoked pins fail closed. Input pin bytes are copied so
later fixture mutation cannot silently replace the trusted key.

Actual library calls reject impostor initial group creation, unknown or
substituted add proposals, revoked membership, a welcome with an untrusted
signer, and revoked members during restore. Trusted members exchange an
encrypted message. Restored state reinstates the explicit authentication
adapter rather than reverting to the library's accept-all default.
The initial-create wrapper is necessary: `ts-mls@1.6.4` does not invoke the
credential validator for its first group leaf.

`npm test` in the spike passed 15/15. The complete Edge spike suite passed
4/4, including the new identity boundaries and the previous independent
contexts, atomic inbox/outbox and process-restart cases. No production keys,
accounts, servers or messages were used. The older separate-device harness
still uses default authentication; the new identity flow is a distinct test.

These pins do not solve trust establishment: no Winga enrollment, existing
device approval, QR/safety-code ceremony, key transparency, compromised
server defense or encrypted recovery is implemented. Pin revocation alone
cannot revoke future content within an already established epoch; MLS
membership removal must advance the group. The dependency's audit and
production-selection gates remain open. No live transport change is needed.
