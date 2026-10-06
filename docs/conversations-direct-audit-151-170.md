# Direct Conversations Audit: 151-170

Updated: 2026-10-06. This is a scoped implementation and evidence ledger, not
acceptance of all twenty sections or independent cryptographic certification.
The preserved source is `winga-conversations-spec-110-238.txt`.

## Corrections In This Increment

- The direct header labels the latest message timestamp as "Last message", not
  "Last active". Message arrival is not proof of a person's presence. Missing
  history does not fabricate an activity timestamp.
- View Profile uses the existing canonical person-profile entry action. Human
  display names stay separate from the username used for authorization/routing.
  No verification badge is inferred from messaging or crypto enrollment.
- Recovery projects the complete saved rich-message history before limiting its
  preview to twenty visible rows. Sender edits and this owner's Delete for me
  apply; reaction/mutation records do not appear as message bubbles. Typed cards
  show localized labels instead of embedded IDs or wire envelopes. Unknown
  reserved payload versions remain unavailable rather than displaying their JSON.
- A missing rich projector fails the preview closed. An unreadable preview does
  not falsely label a completed history restore as failed. Restore still does
  not grant live MLS membership or copy another device's identity/group keys.
- Recovery rechecks its account/session after asynchronous work, closes and clears
  the dialog when backgrounded, and cannot export a late backup after closure.
- Push HTTP 400/413 are permanent payload failures and do not consume repeated
  retries or remove otherwise valid subscriptions. Transient failures retain the
  existing bounded retry policy; 404/410 still retire the exact failed subscription.
  Push provider success/failure does not advance message delivery/read receipts.
- Chat send-failure telemetry supplies a fixed diagnostic and bounded status,
  excluding the original error text, stack and explicit recipient identifier.
  This is not a claim that every application telemetry path has been audited.

## Section Map

| Section | Current scope and remaining boundary |
| --- | --- |
| 151 | Existing back/avatar/name/menu retained. Message time is now honest. Presence and canonical verification presentation are not invented. |
| 152 | Existing human-safe identity resolver and missing-name fallback retained; canonical routing is unchanged. |
| 153 | Server verification remains authoritative. No messaging-derived badge added. |
| 154 | View Profile added through the existing profile handler. A complete account-level menu is not claimed. |
| 155 | Archive remains unimplemented. It needs durable owner preferences, an archived view and an explicit new-message return policy. |
| 156 | Mute remains unimplemented. It needs account-level duration preferences and push suppression without suppressing delivery or hiding chats. |
| 157 | Existing authoritative direct block checks retained. Room block/membership behavior is a separate future contract. |
| 158 | Existing account/product reports remain. Explicit selective message/media disclosure and its moderation evidence path are still open. |
| 159 | No master decryption key or plaintext moderation fallback introduced. Existing authorization/quotas/blocks remain. |
| 160 | Static private push copy retained; provider failure cannot invalidate persisted messages. Permanent versus transient retry handling corrected. |
| 161 | Existing job/subscription dedupe retained. Complete active-device/foreground/multi-device alert behavior still needs acceptance. |
| 162 | Existing encrypted mutation projection retained and reused for recovery. Archive/mute reconciliation and group membership remain open. |
| 163 | Recovery restores bounded history only, not live membership. A new device is not promised every historical message. |
| 164 | Existing encrypted IndexedDB vault, eviction and fail-closed identity behavior retained. Background/account-switch recovery UI boundaries strengthened. OS-profile backups are not treated as hardware protection. |
| 165 | On-device message indexing is explicitly a future direction; no server plaintext search added. |
| 166 | Business inbox is future scope, not implemented during the direct foundation. |
| 167 | Staff role does not grant private history or keys. Future shared inbox authorization remains separate. |
| 168-169 | Send-failure diagnostics hardened against private error content. Full usage instrumentation is not claimed. |
| 170 | Local regression evidence is recorded below. Physical-device media/recovery/replacement, measured load/soak and independent crypto acceptance remain open. |

## Verification And Release Boundary

Focused push tests: 5/5 passed, including a ten-case provider-failure matrix.
Frontend checks: 145/145 core and 80/80 behavior cases passed.
Localization: four catalogs with 1,467 matching keys, zero hard-coded UI debt.
Chat browser suite: 45/45 passed; the final recovery-only suite passed 7/7,
including the added late-backup export guard. Mobile, desktop and RTL geometry
checks passed, and small-mobile/desktop screenshots were visually inspected.
Native crypto browser suite: 32/32 passed, including unchanged CSP, device
identity, ciphertext-only transport, recovery and encrypted-media restart.
Static build: `20261006124201`. These are local synthetic fixtures, not fresh
production-account, physical-device or independent crypto audit evidence.

No database migration, production secret, feature flag, CSP or instance count
was changed. Direct delivery remains immediate without Message Requests or
recipient approval. Edits remain sender-only within fifteen minutes; deletion
remains Delete for me. Optional AI and private Shopping Rooms are not activated.
The operator subsequently requested commit, push and deploy before the next
spec increment. Live release evidence is recorded after publication.
