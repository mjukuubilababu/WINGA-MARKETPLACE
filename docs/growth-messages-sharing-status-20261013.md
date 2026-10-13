# Messages and internal sharing — source hardening, 13 October 2026

Status: canonical individual sharing source hardened; production Messages acceptance remains open.
Baseline: `26056ef1e3928a5d13199fb849ed0fe430b0fc3e` (Cloudflare build
`20261013223726`, all four Render services previously verified). This report
records subsequent source work, not a claim that all Conversations requirements
or the Growth definition of done are production accepted.

## Audit before changes

| Capability | Classification | Canonical owner and result |
| --- | --- | --- |
| Recent people / search / ready Rooms | IMPLEMENTED / PARTIAL | `src/growth/internal-share.js`; explicit recipient selection already existed. A stalled Room read could delay the recent people list. Reads now resolve independently with bounded deadlines. Failed reads show an unavailable state rather than inventing empty history. |
| Individual structured sharing | IMPLEMENTED SOURCE | `src/api/communications-client.js` → `src/chat/encryption-session.js`; Product/Reel/Short/Collection cards use the existing encrypted writer and device/membership controls. No second writer or plaintext fallback is introduced. |
| Send confirmation | BROKEN → FIXED | The picker previously accepted any fulfilled response. Both share surfaces now use `WingaRichContent.sendOutcome`, require the exact action ID, reject missing/rejected/unknown results and separate canonical acceptance from queued/failed state and recipient delivery. |
| Rich composer retry | PARTIAL → FIXED | `src/chat/rich-ui.js`; the same serialized content/reply selection retains one UUID within its dialog. Retry no longer creates another logical message merely because a reply was lost. Durable intent/ciphertext storage remains owned by the encryption session/vault. |
| Picker exact-ID retry | IMPLEMENTED / HARDENED | Existing per-recipient IDs remain stable across retry/filter/security setup. Queued and failed sends remain available for an exact-ID retry; only canonical acceptance removes that recipient choice. |
| Close / account / session races | PARTIAL → FIXED | Closed native dialogs are immediately ineligible, before the asynchronous close event removes DOM nodes. Content/contact lookup cannot trigger a late send. Late send results cannot clear a replacement session’s reply or claim success. |
| Live rich cards | IMPLEMENTED SOURCE | `src/chat/rich-ui.js`, `backend/conversation-references.js`; recipient cards resolve current canonical content/authorization. References stay encrypted; no product snapshot or message body enters growth telemetry. |
| Block / report / membership / rate limits | IMPLEMENTED CANONICAL / ACCEPTANCE OPEN | Existing transport and reference authorization continue to own these controls. `encrypted_membership_pending` now exposes existing secure setup from the share picker. No automatic peer trust or device approval is added. |
| Guest product / auth return | IMPLEMENTED / REGRESSION CHECKED | Existing public product-first and safe return contracts remain in place. Private conversations and Rooms remain authenticated. |
| Real independent sender/recipient and Room value | LIVE BLOCKED | No approved application sessions or actual participation observations were supplied. Handles and deployment API credentials are not application sessions. |

## Result and retry contract

Canonical `sent`/`delivered`/`read` with the requested message ID can finish the
share action. The product picker says **Sent. Recipient delivery is not
confirmed.** It does not manufacture a delivery receipt. `isQueued`, `pending`
and queued send state display a pending notice; failed state retains retry.
Missing IDs, another ID, `ok:false` and unknown results never finish sharing.
Actual recipient delivery/read remains owned by existing verified receipts.

Rich composer queued/failed results keep the dialog and reply context. Successful
acceptance closes the selection before optional rendering, so a refresh failure
cannot encourage another send. The ID map is temporary and scoped to that
selection; reopening a dialog is a new explicit action. Reload recovery and
cross-tab durability remain in the canonical encrypted intent/outbox, rather
than a new growth queue.

No feature flags, enrolled cohorts, production membership, notification policies,
crypto trust, review waivers or deployment gates are changed. External sharing
still requires user action. Failed growth measurement still cannot block content.

## Isolated verification

The machine evidence is [growth-messages-sharing-isolated-20261013.json](evidence/growth-messages-sharing-isolated-20261013.json).
Verified locally: 24 sharing UI browser cases, 28 guest sharing/auth-return cases,
50 encrypted browser cases, 153 frontend core cases, 12 rich-content unit cases,
8 encrypted intent and 4 transport unit cases. The final new encrypted card test
passed separately with its added signed-read assertion (1/1); the full 50-case run
preceded that last test assertion. Existing Growth and rich-content contract
commands passed. Four catalogs contain 1,762 matching keys, version
`2026.10.13.6`, with zero new hardcoded debt; all 98 modules are synchronized.

`npm run test:sharing-ui` is added to the functional acceptance workflow, alongside
existing encrypted and guest-sharing browser suites.

The new cookie-authenticated encrypted HTTP browser journey enrolls two disposable
native devices, verifies mutual membership, selects a product in the real rich
composer, deliberately loses the already-accepted send response and retries.
The receiver gets exactly one rich card, resolves the live product and sends a
verified read receipt. The server stores one ciphertext row and no new legacy
plaintext row. This is a synthetic local two-device journey, not human production
participation or an independent cryptographic review.

Earlier full guest-suite failures in this work were outdated synthetic response
shapes and English-only expectations after the new translated confirmation.
Fixtures now return canonical `status:sent` and assert the actual supported
English/Swahili text. No forced clicks, timeout increases, plaintext downgrade
or weakened production checks are used.

## Remaining gates and resumption

- **MSG-01 / LIVE-02:** actual approved sender and recipient sessions, secure
  readiness, direct delivery/reply/retry and native Room participation. User’s
  report of incomplete Messages stays open until reproduced gaps are resolved
  and meaningful product behavior is observed.
- **SEC-01:** independent review of the exact release’s current CodeQL report
  and cryptographic boundaries. The preceding release had 54 findings with no
  current independent review; that historical scan does not certify new source.
- **LIVE-01 / LIVE-03 / LIVE-04:** real public sharing, demand/restock, collection,
  creator and qualified seller-referral journeys. No fabricated buyer actions.
- **OPS-01 / CAP-01:** controlled staging failure/recovery, abuse/capacity and
  regional performance observations with operational ownership.
- **RET-01 / REL-01:** mature D1/D7/D30 and network utility/trust observations;
  the complete Growth production definition of done stays blocked.

Resume from `npm run growth:readiness`, this report and the canonical Conversations
handoff. Use synthetic fixtures for regressions; do not use deployment credentials
to impersonate app users. Preserve the earlier authorized canary scope.

## Rollout and rollback

Use existing required functional/dependency/Phoenix checks and the normal production
workflow. Verify all four Render commit identities, Cloudflare build/assets and
public health. CodeQL findings stay independently reviewable and never become
self-approved. Existing deploy policy and review ledger are unchanged.

For a confirmed regression, revert this source commit and deploy the resulting
revision through those checks. This change has no schema migration or rollout
flag dependency. Existing ciphertext, exact retry IDs, membership and review
history remain canonical. Never repair a sharing issue by weakening encryption,
blocks or recipient authorization.
