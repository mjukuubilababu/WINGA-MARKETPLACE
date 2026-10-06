# Conversations Spec Status: 2026-10-06

This is the current grouped implementation index for the preserved 0-109 and
110-238 contracts. It is not a completion percentage, security certification,
or a replacement for the source specification. Historical audit/handoff files
describe their dated checkpoints, not necessarily the current enabled runtime.

## Release Being Published

Latest device/history work is documented in
[conversations-device-history-acceptance-20261006.md](conversations-device-history-acceptance-20261006.md).
It adds native Remove/expanded replacement, paged nontruncating user-key recovery
and explicit same-owner historical attachment grants. The subsequent candidate
adds automatic own-native prior-epoch history reconciliation and historical Read
without false Delivered. Production acceptance, Shopping Rooms and independent
crypto review are not complete. The multi-device gate remains default-off.
The release and evidence paragraphs below are earlier dated checkpoints.

The operator requested commit/push/deploy of all pending conversation changes:
indefinite Mute, durable owner Archive, selected-text reporting, moderator
evidence viewing, four-language copy, source bundle and regression tests.
Prepared frontend build: 20261006140019; 87 synchronized source modules.
Local verification: 155 store/encryption/push/report tests, 77 chat browser
tests, 145 frontend core checks and 80 behavior tests. Four catalogs contain
1,497 matching keys and no hard-coded UI debt. The exact prepared assets and
Wrangler deployment dry-run passed.

Publication success and the exact commit/deployment IDs must be established
from release tool results, not inferred from this prepared record.
Three additive migrations run under the existing startup migration lock:

- 2026100601_conversation_notification_preferences
- 2026100602_conversation_archive_preferences
- 2026100603_conversation_report_evidence

The frontend is deployed to the existing mkubwa Worker, preserving dashboard
variables. WINGA backend is the existing Render Node service; Phoenix is a
separate transport service. No new secrets, encryption flags, CSP permissions,
instance increases or disk removal are requested by this release.
The operator has configured Render Auto-Deploy On Commit. There is no Render
API credential available in this workspace, and dashboard automation failed.
Public healthy responses alone do not prove the exact backend commit or new
migration/application-flow acceptance.

## Latest 158-189 Work

See [conversations-spec-158-189.md](conversations-spec-158-189.md) for the new local
search, explicit report subjects, opaque notification grouping, aggregate
transport metrics, foreground preference reconciliation, session-consistent
filtered history and exact open Shopping Room gates. The release record above
describes the preceding release, not deployment of these new changes.

## Foundation: 0-109

The integrated system has durable canonical acceptance, exact-ID retry,
ordering, bounded history/replay, device receipts, background push and Phoenix
transport. The operator reported working live delivery, Sent/Delivered/Read
and encrypted text between two different real accounts/devices. The earlier
operator-run REST/SSE cross-node exercise is separate from Phoenix evidence.

Native-bound device identity, MLS ciphertext transport, encrypted browser
vault/outbox, private encrypted attachments, approval/revocation, contact-verified
replacement and user-key/checkpoint recovery are implemented and tested locally.
Private R2 configuration and a synthetic storage roundtrip passed; media and
recovery activation were operator-reported. These facts do not certify every
production device/media/recovery flow or an independently audited protocol.

Section 109 Phase 6 remains open: independent cryptographic/security review,
physical-device attachment/recovery/replacement acceptance, approved retention
and erasure policy, complete fleet pressure/observability and measured
SLO/capacity/soak/dependency-failure evidence. Keep Phoenix at one instance;
the operator declined the additional paid production node-loss exercise.
Do not erase this distinction by calling the entire foundation complete.

## Product: 110-238

| Sections | Implemented scope | Still open / deliberately future |
| --- | --- | --- |
| 110-120 | Direct-first person-to-person inbox, canonical pair identity, summaries, ordering, cursor paging, unread and focused visible-message Read; refresh failures are isolated from a healthy inbox. | Full applicable direct-device/performance acceptance; no invented presence or verification signal. |
| 121-122 | All new direct messages bypass recipient approval under the operator override. Existing server auth, quotas, blocks and bounded exact retries remain. | Broader measured abuse/operational acceptance; do not introduce Message Requests. |
| 123-129 | Encrypted typed text, safe links, replies, reactions, sender-only text edits for 15 minutes and Delete for me. | Delete for everyone is not authorized. Production acceptance is distinct from local regressions. |
| 130-132 | Explicit private voice recording/playback, encrypted persistent draft, reload, cancellation and exact retry; native seek controls. | Whole-object retry is not resumable streaming; waveform/playback-speed enhancements are optional. |
| 133 | No external/private transcription processing. | Optional future transcription. |
| 134-144 | Private images/videos, approved public video references, canonical product/order/payment/delivery references and marketplace actions; context remains in the same direct pair. | Real-device private-media acceptance. Current private-media size is bounded to 2 MiB. Payment cards use existing canonical intents, not a new wallet/provider payment-request service. Historical product snapshots, new courier service and collaborative orders are not fabricated. |
| 145-149 | No silent extraction or external translation of private messages. Four-language UI localization exists. | Optional future smart context, provenance/correction and message translation; UI localization is not message translation. |
| 150 | Responsive universal text/plus/camera/send composer, approved rich choices, mobile/desktop/RTL layout. | Applicable physical-device/accessibility acceptance. |
| 151-154 | Human identity fallback, honest last-message timestamp, existing header/menu and canonical View Profile action. | No inferred online/verified badge or claim that every account-menu requirement is finished. |
| 155 | Owner-scoped durable Archive, archived view, explicit Move to Inbox; incoming messages retain history/unread and still notify unless muted. | New production migration and authenticated/cross-device UI acceptance. Archive refresh is not instantaneous multi-device fanout. |
| 156 | One indefinite account-level mute/unmute switch; enqueue, dispatch and foreground-alert suppression; unread/history unchanged. | New production migration/complete backend rollout and authenticated acceptance. Already provider-accepted push cannot be recalled. |
| 157 | Existing authoritative direct blocking and retained history protections. | Room-specific block/membership policy belongs to the group service. |
| 158-159 | Explicit selected-text report consent; canonical selected-message membership checks; idempotent submission; current-role, reason-gated audited moderator evidence reads; no master key/plaintext messaging fallback. | Encrypted-media reports share a label/metadata only, not file bytes. Binary-media evidence authorization/storage, retention policy and production moderation acceptance remain. Reporter plaintext is explicitly unverified; no automatic punishment. |
| 160-164 | Private push copy, exact retries, explicit receipts, native Add/Remove/expanded replacement, sealed paged cache and full retained user-key recovery within explicit archive bounds. Historical media uses separate signed same-original-owner/current-native grants. | Automatic continuous historical sync, production/physical-device acceptance and native-specific alert reconciliation remain open. Recovery never restores native identity/live ratchets or rewrites original-epoch grants. |
| 165 | Inbox/contact search exists; no server private-plaintext index. | On-device message-content indexing/search. |
| 166-167 | No staff access to private keys/history by business role alone. | Future business inbox and separately authorized shared staff access. |
| 168-169 | Content-free bounded send diagnostics and existing private/aggregate operational evidence. | Complete conversation usage/quality metrics and dashboard coverage. |
| 170 | Extensive local direct/encrypted/store/browser regression evidence. | Full direct acceptance gate, physical devices, measured resilience/scale and independent security review. |
| 171-189 | Agreed room presentation/empty state, kept separate from pairwise send/ACK. | Real server-backed Shopping Rooms: lists, invitations, membership/MLS epochs, group ciphertext/receipts, product board, shortlist, polls, comparisons, seller questions and group order contracts. Read-only room UI is not an implemented group service. |
| 190-192 | Optional services do not receive private plaintext or control commerce. | Optional intelligence/privacy/provenance design and independently tested failure isolation. |
| 193-201 | Four languages/RTL, bounded media, responsive/local-first draft and history behavior, scoped reconciliation and existing rollout flags. | Full accessibility/low-bandwidth acceptance and measured conversation-open/performance SLOs. |
| 202-207 | Existing kill switches, fail-closed no-downgrade guards, legacy separation and versioned startup migrations. | Remaining applicable rollout/retention/security acceptance; encrypted routes disabled must never fall back to plaintext. |
| 208-209 | Existing aggregate service health and durable queue evidence. | Complete privacy-safe observability dashboard and user-centric reliability metrics. |
| 210-221 | Existing tested message-ID, canonical ordering, auth, ciphertext/device and canonical commerce boundaries. | Fleet/failure/performance evidence and future room invariants are not proven by direct fixtures. |
| 222-226 | Direct, crypto, store and browser suites with recorded scope; synthetic accounts/storage stay separate from production. | Room suite, independent security review and realistic measured load/soak acceptance. |
| 227-238 | Source principles and Definition of Done are preserved. | Formal security/product/foundation acceptance and final handoff remain open. These are acceptance criteria, not 12 additional UI features. |

## Next Work

1. Confirm the exact Render commit is Live and the three migrations applied;
   exercise Mute/Archive/selected reporting with authenticated test accounts.
2. Decide retention/deletion and private binary-media report policy before
   extending moderator disclosure beyond selected text/metadata.
3. Consolidate physical-device media/recovery/replacement evidence and measured
   direct reliability/performance; obtain independent crypto review.
4. Continue server-backed Shopping Rooms only through their approved membership,
   ciphertext and canonical-commerce contracts. Do not invent wallet rules,
   mandatory member-voted leaving/removal or calling from prior brainstorming.

Detailed evidence remains in the product roadmap, rich-message 123-150 ledger,
direct 151-170 ledger and encrypted-chat acceptance record. Enabled features
and passing tests are not synonymous with full specification acceptance.
