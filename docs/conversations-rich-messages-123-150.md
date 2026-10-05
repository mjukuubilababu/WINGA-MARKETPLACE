# Rich Messages: Contract 123-150

Updated: 2026-10-05. Implementation/evidence ledger, not a cryptographic
certification or acceptance of every production/device requirement.

## Policy And Boundaries

- Every new direct chat remains direct: no recipient-acceptance queue.
- Editing is original-sender-only, text-only, within 15 minutes of the original
  durable server acceptance. Stable message IDs and an Edited indicator remain.
  The server returns its original timestamp on exact retries. Older backend
  responses retain the existing timestamp for rollout compatibility.
- Delete for me is an owner-scoped encrypted history event. It is not Delete for
  everyone, remote erasure, deletion of exported backups, or retraction of a copy
  another device has already decrypted.
- Existing ciphertext transport, authenticated membership, key verification,
  quotas, blocks, session guards, private storage, and CSP stay in effect.
- No plaintext fallback, automatic device trust, room membership expansion,
  production secret/flag change, or paid instance increase.

## Contract Map

| Contract | Implemented scope and limits |
| --- | --- |
| 123 | Strict versioned encrypted rich-content envelope. Text, product, Reel, Short, collection, location, contact, reaction/edit/hide events; typed image, voice, video and file descriptors use the existing separate encrypted-media envelope. Unknown reserved versions fail closed without exposing raw JSON. |
| 124 | Unicode, emoji, multiline text, encrypted replies and bounded text (4,096 characters; rich envelope at most 12,000 bytes). Existing accessible composer and four-language UI retained. |
| 125 | Existing escaped text, safe URL rendering and external-link confirmation retained. No private-text unfurling or external preview provider. |
| 126 | Encrypted reply ID and bounded optional quote; unavailable targets show a graceful fallback. No server plaintext quote. |
| 127 | Structured encrypted reaction events; latest per actor wins deterministically and toggling removes the owner's reaction. Events do not become ordinary conversation bubbles. Existing admitted-device history replay is reused. |
| 128 | Approved sender-only 15-minute edit window; explicit encrypted event; stable target ID, sender checks, deterministic projection and Edited indicator. Pending/unaccepted events cannot alter accepted history. |
| 129 | Delete for me implemented and synchronized through the existing encrypted history. Delete for everyone deliberately absent. |
| 130 | User-triggered microphone permission; Record, Stop, native preview, Cancel, encrypted local draft, upload, encrypted reference, and authenticated playback. Recording bounded to 120 seconds and 2 MiB. |
| 131 | Draft persists before remote work. Reload restores it; upload failure retains encrypted pending data and logical request ID for manual retry. Explicit cancellation removes an unsent draft. Upload progress is indeterminate, not invented byte percentages. Whole-object retry, not resumable/chunked upload. |
| 132 | Native audio controls provide duration, play/pause and seeking. Signature/MIME validation and bounded authenticated download. Playback speed/waveform are future/optional; whole-file AEAD does not claim encrypted streaming. |
| 133 | OPTIONAL FUTURE: transcription not enabled. No private voice sent to external AI. Messaging works without it. |
| 134 | Private encrypted image upload, preview/full view, integrity-checked download and retry. PNG/JPEG/WebP/GIF previews bounded to 16 megapixels; executable HTML/SVG download only. Local restored generic image drafts also enforce the decoded-pixel bound. |
| 135 | Private encrypted MP4/WebM video with native playback, caption, local draft and retry. No public transcoding/moderation upload path used. Current private-media limit remains 2 MiB. |
| 136 | Encrypted canonical Reel/Short reference; ready, permitted public-video lookup and native product/detail action. Not a private duplicate or separate video asset. |
| 137 | Current authorized product card with image, name, price, View, Save and Add to order. Actions hydrate the exact approved product and invoke existing canonical marketplace flows. |
| 138 | Lazy authorized reads, explicit refresh and bounded 30-second visible-card refresh. Removed/restricted items become unavailable; no immortal embedded price/availability. No new historical-price snapshot or stock-transition event stream is claimed. |
| 139 | Authorized canonical order card with amount, status and item size/color/quantity where supplied; View order uses existing order UI. Participant checks remain server-side. |
| 140 | Payment reference card uses an existing canonical order payment intent/reservation and current state/amount. Eligible buyer can submit its existing payment reference. This is NOT a new standalone provider payment-request service, arbitrary money transfer or wallet. |
| 141 | Delivery reference reads the existing canonical order fulfillment lifecycle. No duplicated delivery state, invented courier tracking, or new Delivery service. |
| 142 | Canonical product View/Save/Order, View order/Submit reference, location/contact sharing and public-reference actions. Optional offers, scheduling, comparisons and Shopping Rooms are not fabricated by this increment. |
| 143 | Ordinary human text remains primary; replies, reactions and private voice/media are optional composer actions, not a mandatory checkout form. |
| 144 | References preserve context without creating a second conversation for the same participant pair. Canonical pair identity and history remain unchanged. |
| 145 | FUTURE: smart context extraction not enabled; no server-side plaintext extraction. |
| 146 | FUTURE: no inferred context requiring provenance is shown; no inferred financial truth. |
| 147 | CONDITIONAL FUTURE: correction UI depends on the future smart-context feature. No uncorrectable AI memory is introduced. |
| 148 | FUTURE: message translation not implemented or silently sent to a provider. Four-language interface localization is not claimed as message translation. |
| 149 | FUTURE: auto-translation not enabled; E2EE remains unchanged. |
| 150 | One plus menu, text composer, camera and send. Picker choices expose active rich types without ten permanent toolbar buttons. Mobile/desktop/RTL supported. |

## Technical Verification

- Rich-content, canonical-reference and persistent-media tests: 19 passed.
- Secure-content backend/runtime suite: 106 passed; final acceptance-timestamp
  focused regressions: 48 passed.
- Message pages/receipts/replay: 66 passed.
- Frontend: 145 core checks and 80 behavior tests passed.
- PostgreSQL pagination/API integration: 136 passed, including real HTTP
  canonical-reference authorization/current-state and exact-product regressions.
- Chat UI: 37 passed, including the restored-image decoded-pixel regression;
  screenshots visually checked at mobile and RTL sizes.
- Complete native encrypted browser suite: 32 passed.
- Native authenticated browser exercises use cookie-only HTTP, local PostgreSQL
  semantics and synthetic private storage. Typed cards, replies, edits, reactions,
  owner-only deletion, persisted voice drafts/reload, media and recovery are
  covered without asserting production-device acceptance.
- Device approval regression originally checked while its asynchronous request
  was still running. It now waits for actual active status; focused rerun passed.
- Four catalogs contain 1,464 matching keys with zero hard-coded UI debt.
- Static release has 84 synchronized source modules. The optional bounded
  `WINGA_BUILD_OUTPUT=.tmp-frontend-release` destination allows building without
  stopping an existing local preview. Default builds still use `public/`.
- Prepared build: `20261005164242`. Deployment and live byte verification
  follow the operator-requested commit/push; public readiness alone cannot
  establish the exact Render commit SHA.

## Still Requires Separate Evidence

Independent cryptographic audit/approval; authenticated physical-device image,
voice, video, recovery and replacement acceptance; load/soak measurements;
future intelligence/privacy design; multi-member Shopping Rooms and their MLS
epoch/membership protocol. Existing history recovery does not restore group keys
to an unapproved replacement device. No production secrets or recovery keys are
included in this ledger.
