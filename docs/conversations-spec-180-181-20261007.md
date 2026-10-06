# Spec 180-181: Product Comparison and Ask Seller

## Implemented

180: Select two to four different shared products in Products or Shortlist.
The comparison reads each exact currently authorized approved catalog product,
not a historical message snapshot. Two products fit side by side on mobile;
larger selections scroll within the dialog. Current price, explicit currency,
availability, stock, size/color arrays, brand, category and seller are shown only
when those canonical fields exist and pass their types. Missing/restricted
products and missing fields remain unknown. Product votes are not inferred from
poll labels, likes, demand analytics or shortlist counts. Shortlist counts have
their own explicitly labeled row. The catalog currently does not expose every
attribute, so unknown rows are expected rather than fabricated data.

181: A member explicitly selects the product and question to disclose. The
question uses the existing native-approved encrypted direct chat. A new contact
still needs its existing encryption/fingerprint setup; no automatic trust or
plaintext fallback is introduced. An encrypted-vault draft survives that setup,
then retries the same question and Room activity IDs. The seller sees product ID,
question and requester, never Room ID/name, roster, notes, history or invitation.

The seller explicitly consents to a structured response being shared. The response
is sent through the same encrypted direct transport and its exact content hash is
attested by the existing native operation signer after durable ciphertext storage.
The requester explicitly selects Share response to room. The actual decrypted
sender, existing approved direct pin, original request/product, accepted message
ID and native signature/hash must match before re-encryption into the Room.
Other Room members verify the native attestation and exact content hash before
projecting a Seller Response Card. The card names the source seller and sharer;
it is not a new identity-verification badge or canonical inventory update.

The bridge uses the additive `2026100701_encrypted_room_sellers` migration,
existing authenticated operation endpoint, transaction/advisory lock, current
direct/Room access rules, original native epoch grants, quotas and blocks. The
immutable tables contain metadata, hashes and public native proof/anchor material,
not question/answer plaintext or keys. There is one immutable answer per question;
a follow-up is a new question, not an overwrite. Room response retries preserve
their encrypted-vault IDs. Up to 512 immutable evidence records are cached in the
current native session; new responses still require evidence retrieval/verification.

## Tests and Acceptance Boundaries

Pure tests cover current/unknown/restricted attributes, selection bounds, strict
disclosure schemas, no Room metadata/quotes, oversized content and verified
requester/answer projection. The actual HTTP browser fixture uses four isolated
native MLS contexts, HttpOnly authenticated sessions, strict existing CSP and
actual PostgreSQL-compatible SQL (PGlite). It covers mobile/desktop/RTL comparison,
unchecked consent, saved question before encryption setup, accepted-send and
accepted-answer acknowledgement loss, exact retries, seller denial of Room access,
wrong-author/changed/absent answer rejection, tampered native signature rejection,
explicit seller/requester response-sharing dialogs, forged Room activity, immutable
evidence, direct/Room blocks, plaintext absence in the bridge and read-only checks.
This is local acceptance, not real Render/R2 devices or multi-connection fleet load.

Local verification passed: Shopping Rooms 50/50, secure-content unit tests
145/145, rich-content 19/19, frontend core 145 plus 80 behavior tests, and the
complete secure-content browser suite 40/40. Localization has four matching
catalogs with 1601 keys and no new hard-coded UI debt. The release bundle is
synchronized with all 93 source modules. The production asset build includes
the Lucide comparison icon, rather than relying on the test fixture's assets.

Independent cryptographic audit, physical production acceptance and broader
Shopping Rooms operational/load requirements remain open. No secrets, CSP,
feature flags, bucket access or instance counts are changed. No orders, wallet,
payments, automatic checkout, public rooms or calling are introduced.

## Rollout Check

Deploy this backend commit to WINGA (the existing Node service). Its normal startup
migration runner applies the additive migration; no maintenance rewrite is needed.
After it is Live, run in the Render backend shell:

```sh
cd /opt/render/project/src/backend
npm run verify:shopping-rooms
npm run verify:room-seller-requests
```

The latter checks migration/tables, enabled immutable guards and aggregate direct
and answer bindings under a repeatable-read read-only transaction. A successful
schema check does not set `authenticatedSellerFlowVerified` or audit approval.
Keep the existing Room/MLS/device/conversation prerequisites; no new secret is
required. Test with a seller outside a real three-account Room, then record the
production evidence separately from these local fixtures.
