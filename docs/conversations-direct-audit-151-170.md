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
| 155 | The local follow-on implements durable owner Archive, an archived view and explicit restore. New messages stay archived and do not delete history or suppress alerts. Production and cross-device UI acceptance remain open. |
| 156 | The next local increment adds account-level indefinite mute under the operator's 2026-10-06 override: one switch, no durations or automatic expiry. It is not part of the first published audit release. |
| 157 | Existing authoritative direct block checks retained. Room block/membership behavior is a separate future contract. |
| 158 | Local follow-on adds explicit selected-text disclosure and reason-gated moderator evidence reads. Encrypted attachments disclose a label and canonical metadata only, not file bytes. Binary media reporting, retention policy and production acceptance remain open. |
| 159 | No master decryption key or plaintext moderation fallback introduced. Existing authorization/quotas/blocks remain. |
| 160 | Static private push copy retained; provider failure cannot invalidate persisted messages. Permanent versus transient retry handling corrected. |
| 161 | Existing job/subscription dedupe retained. Complete active-device/foreground/multi-device alert behavior still needs acceptance. |
| 162 | Existing encrypted mutation projection retained and reused for recovery. Archive state reconciles on normal refresh; live cross-device preference fanout and group membership remain open. |
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

## Published Audit Release

Commit `73c74c1` was pushed to master. Frontend build `20261006124201` was
published to the existing `mkubwa` Worker with dashboard variables preserved.
Cloudflare version: `94dd8c10-42a8-456d-bb4e-e8da69628492`.
Eight deployed chat/module/catalog assets matched the prepared build by SHA-256.
The Worker-generated manifest matched the version; its metadata differs by design
from the static build manifest. Production shell/security/route checks passed.
Backend health returned HTTP 200, `ok=true`, `readiness=ready`; Phoenix health
returned HTTP 200, `ok=true`. Public health cannot prove the exact Render SHA.

## Follow-On: Indefinite Mute

The operator explicitly replaced duration choices with a single persistent
mute/unmute decision. No hour/week option, timed expiry, or automatic unmute is
implemented. The source spec is preserved; this records the newer policy.

The new additive migration `2026100601_conversation_notification_preferences`
stores one bounded, owner-scoped preference per peer. Authentication checks the
live active-user session again inside the transaction. Request owner/session
bindings prevent a delayed client action from applying to a different account.
Revision checks reject stale writes; owner advisory locking serializes writes
and enforces the 5,000-row safety cap. This does not claim independently tested
cross-connection concurrency.

Both direct chat surfaces bind one notification settings switch through the
existing authenticated API adapter. Settings reads/writes are POST requests with
private/no-store responses and existing CSRF/rate-limit controls. Backgrounding,
account changes or participant changes close/discard stale controls. Failed or
conflicting saves do not claim success.

Push enqueue skips muted pairs. Dispatch checks current mute state again, and
muting completes matching queued jobs rather than deferring them until unmute.
It does not delete subscriptions, messages, history or device receipt evidence.
Foreground message/request alerts use refreshed canonical notification metadata;
muted alerts do not toast, vibrate or create fallback device notifications.
Notification history and unread state remain visible. Order, follow and other
non-message alerts are not muted by this preference.

A notification already handed to the external provider cannot be recalled.
Unmuting does not replay suppressed alerts. During a rolling backend release,
older workers cannot be presumed to enforce the new preference; complete backend
rollout must precede production acceptance. JSON-only adapters do not pretend to
persist this server feature. No E2EE keys or plaintext content enter preferences.

Local verification: 27 push/encrypted SQL cases, 119 PostgreSQL adapter cases,
one additional real-SQL foreground notification isolation case, 52 full chat UI
cases and the final seven single-switch browser cases. The authenticated
cookie-only encrypted transport fixture passed again; it is not itself a real
server HTTP mute-route acceptance result. Frontend core/behavior checks passed
145/145 and 80/80. Four catalogs now have 1,472 keys with zero hard-coded UI debt.
Final build: `20261006130559`; 85 source modules are synchronized. The mobile
mute dialog screenshot was visually inspected. This follow-on feature has not
been pushed or deployed at this checkpoint.

## Follow-On: Owner Archive

Migration `2026100602_conversation_archive_preferences` adds Archive to the
same owner/peer preference row, retaining the shared revision, lock and cap.
Archive writes change only Archive; Mute writes change only Mute. Both routes
revalidate the authenticated live session and reject stale revisions. The
owner-only list is bounded to 5,000 peer identifiers and contains no messages,
keys, receipts or recovery data.

Policy: Archive stays set until the owner chooses Move to Inbox. Incoming
messages remain visible in Archived chats with their unread state; they still
deliver and notify unless independently muted or blocked. Archive never
deletes history, changes membership or claims delivered/read. Metadata refresh
runs independently of message refresh, so a failed preference endpoint does
not turn the conversation list into an unavailable-message gate. A failed
refresh retains this session's last snapshot with a visible retry state.
Preferences are refreshed rather than persisted in unencrypted browser storage.
Cross-device preference changes become visible on refresh, not guaranteed
instantaneous fanout. Pagination still applies to both views; older archived
conversations can require Load more conversations.

The approved three top tabs and four bottom destinations remain unchanged.
The Inbox has an Archived chats row; direct menus offer Archive / Move to Inbox.
Controls bind to the current account, session and peer; late responses cannot
apply another account's snapshot or reverse newer local writes. Archives do
not hide a mute decision or prevent opening chats from notifications/products.

This increment remains local, pending publication and real server HTTP /
production migration acceptance. It does not complete all sections 151-170,
physical-device media/recovery/replacement, or the independent crypto audit.

Final local evidence on 2026-10-06: 7/7 push/preference SQL cases, 141/141
PostgreSQL/encrypted conversation cases, 63/63 chat browser cases, and the final
3/3 Archive geometry/style cases at small mobile, desktop and RTL widths. The
final 8/8 Archive-only suite includes a no-op metadata refresh/render guard.
Frontend core/behavior passed 145/145 and 80/80; all four catalogs contain
1,476 matching keys with zero hard-coded UI debt. Build `20261006133513`
contains 86 synchronized modules. Mobile/desktop screenshots were inspected.
The task-owned preview on port 4318 serves that build identity. Production
migrations and authenticated HTTP Archive/Mute acceptance were not run.

## Follow-On: Selected Report Evidence

Migration `2026100603_conversation_report_evidence` adds a separate evidence
table and audited moderator-read table. Normal report metadata and the existing
open-report claim/review lifecycle are reused; evidence is not included in
ordinary store snapshots or automatically loaded with the moderation list.
The list adds only `hasSharedEvidence`; its evidence flags are bounded to the
latest 1,000 report records.

Direct chat menus and individual message actions open a selection dialog.
The user must select one to ten messages from at most fifty already loaded,
projected rows and explicitly check disclosure consent. A user report needs
at least one incoming selected message from the reported peer. Pending sends,
hidden/mutation records, unrelated chats and unknown reserved wire payloads
are excluded. This action does not load the rest of the vault or history.

Only selected text, canonical message IDs/parties/timestamps, available
ciphertext hashes and the user's report details are submitted. A media selection
shares a generic attachment label and canonical metadata, not its filename,
URL, bytes or decryption key. No device/recovery key is read. Other text the
user chooses to type in the report is user-provided; this is not a detector for
secrets pasted voluntarily into selected messages or free-form details.

The server rechecks the active primary session, strict field whitelists,
consent version, size limits and selected legacy/encrypted message membership
inside a transaction. It rejects outside-conversation IDs, ambiguous IDs,
unbacked encrypted-media claims and outgoing-only reports. Reporting remains
possible for retained historical chats even after blocking. Retired native
devices are not granted membership or keys by a report operation.

An owner-bound request UUID/hash makes exact retries return the existing
report; a changed intent needs a fresh UUID. The existing open claim prevents
duplicate concurrent open reports for the same owner/target. Evidence failure
rolls back both claim and report. Request bodies are bounded to 64 KiB and use
the existing CSRF/rate limiter. Private responses are no-store. No plaintext
report payload or provider error is added to report telemetry.

The moderator must have an active session and current primary admin/moderator
role, and must supply a reason for each evidence read. The read audit commits
before the selected evidence response. The viewer renders inert text only;
account/role changes, backgrounding and closure discard late responses and
clear the displayed evidence. Existing report-review actions remain manual.

Disclosed plaintext is the reporter's claim, not cryptographic proof of the
original message. `plaintextVerified=false` and `filesShared=false` are
explicit in the private response and viewer. The server verifies canonical
message parties but cannot infer that supplied text matches MLS ciphertext.
This is intentional selected disclosure, not a plaintext messaging fallback
or a master decryption key. There is no automatic punishment based on it.

Local verification: 155/155 combined PostgreSQL, encrypted conversation, push
and reporting cases, including seven dedicated report/adapter cases; 77/77
full chat browser cases, including thirteen reporting cases; 145 frontend core
and 80 behavior cases passed. Four catalogs contain 1,497 matching keys with
zero hard-coded UI debt. Mobile, desktop and Arabic RTL report screenshots
were inspected. Build `20261006140019` contains 87 synchronized modules; the
task-owned preview on port 4318 serves that identity and the report icon/module.

This follow-on is not committed, pushed or deployed at this checkpoint.
Production migrations, authenticated HTTP report acceptance and independent
crypto/security approval were not run. PGlite exercises real SQL semantics
but the advisory lock is stubbed, so this is not independent cross-connection
concurrency evidence. Dedicated binary-media evidence authorization/storage,
a decided retention/deletion policy, production moderation acceptance and
the remaining foundation gates are still open; section 158 as a whole is
not declared complete.
