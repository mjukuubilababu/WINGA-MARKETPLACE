# Conversations 193-209: 2026-10-08

Scope: the preserved `winga-conversations-spec-110-238.txt`, sections 193-209.
This record describes the reviewed code candidate, not a claim that local tests
certify production capacity or cryptography. Production native approvals and
authenticated device/load exercises are deferred by the operator until evening.

## Implementation Matrix

| Spec | Implemented contract | Remaining acceptance |
| --- | --- | --- |
| 193 | Four-language UI/operations catalogs, Unicode message direction, RTL layouts, locale time and existing notification preferences. Canonical identities are unchanged. | Physical-device assistive/notification checks. |
| 194 | Manual encrypted media retrieval, lazy images and constrained-network/data-saver suppression of automatic non-avatar previews. Text has an encrypted local intent and exact durable retry. | Constrained real-device network measurements. |
| 195 | Keyboard/focus states, 44px message targets, semantic compose/status labels, reduced motion, existing explicit voice playback controls, stable content-free incoming announcements. Initial history and pagination do not reannounce the thread. | TalkBack/VoiceOver and actual voice-control acceptance. No plaintext transcription service was added. |
| 196 | Local intent creation does not wait behind optional metadata or account polling. Only durable server ACK becomes Sent. Optional refresh failure cannot turn accepted profile/context sends into Failed. | Production latency profile. |
| 197 | Tap-to-shell and open-to-first-usable-recent samples, aggregates and admin visibility. Cached shell renders immediately with independent history/commerce loading. | Numeric SLO targets must come from authenticated production measurements; none are invented. |
| 198 | Encrypted vault intents, cached pager reconciliation, immediate safe shell, bounded CAS retries and strict owner/session/navigation guards. No pending ciphertext or plaintext persistence is fabricated. | Real-device offline/resume soak. |
| 199 | Durable logical IDs and canonical sequence ordering for direct rich mutations; sequence survives native history transfer. Read/archive/Room preferences retain their existing authenticated revision/event rules. | Physical multi-device acceptance. |
| 200 | Deterministic percentage/explicit-account admission for new secure groups, fixed content-free observations and rollback controls. Existing accepted traffic is not silently downgraded or re-enrolled. | Operator-selected cohort progression and observed release health. Current production flags were not changed. |
| 201 | Existing independent devices, MLS, Conversations, media, recovery, multi-device and Rooms flags remain enforced. New incompatible protocol controls fail closed. Disabled/unimplemented requests, translations and calls are not falsely enabled. | Independent crypto approval remains open even though the operator previously enabled E2EE. |
| 202 | Signed v1 compatibility minimum/block controls, media authorization/completion gate, existing device/session revocation and capability switches. Server-only orphan cleanup retains lease authorization and survives client kill switches. | Operational rollback exercise on production. |
| 203 | Canonical security mode is resolved before either legacy transport; missing runtime, unknown mode, session/membership failure or unsupported crypto never permits plaintext fallback. | External cryptographic/security assessment. |
| 204 | Read-only legacy classification and explicit compatible import with malformed, self-addressed and obsolete rows retained outside the canonical ledger. | Production classification sample review; no old history deleted. |
| 205 | Existing legacy plaintext history stays honestly labeled; new secure content is not used to relabel historical plaintext. | User-facing device acceptance. |
| 206 | Existing native fingerprint verification, explicit secure upgrade and durable membership/security events are preserved. | Physical-device transition acceptance. |
| 207 | Frozen historical ledger remains hash-pinned; safe compatible fresh backfill precedes guards. Completeness checks roll back failed imports and already-applied ledgers bypass backfill. New receipt/experience schema is additive. No destructive legacy removal. | Production migration/rollback observation. |
| 208 | Dedicated admin Conversations Operations section: Phoenix connections/queue/BEAM/scheduler, backend pool, server attempt acceptance, direct durable transaction latency, receipt latency, reconnect observations, bounded resume outcomes, committed direct duplicate suppression, protocol errors, media upload/download outcomes, cleanup backlog. | Real deployed publisher samples. Missing samples/gauges remain unavailable, not healthy zero. |
| 209 | Scoped send/retry/sync/offline/resume confirmation ratios, pending outcomes included in denominators, delivered ciphertext-record ratio, timestamped delivery samples and native sync-ACK delay. Late prior-session outcomes cannot enter another owner's run. | Production user-centric SLO/capacity acceptance. |

## Observation Boundaries

- Server attempt counts include retries. Auxiliary protocol/duplicate/commit
  observations are excluded from attempt denominators. Direct `send-commit`
  measures the durable transaction including authorization/locks/commit, not
  pure SQL execution or peer delivery. Direct duplicate suppression does not
  pretend to measure every Room/transport duplicate.
- Receipt counts are ciphertext records, not human-message delivery guarantees.
  Legacy receipts without observation timestamps are excluded from latency
  averages, never backfilled with fake current times.
- Client counters are bounded, authenticated, cumulative per-run UTC-hour
  buckets. Pending is distinct from failed. Resume attempts include ticket/join
  failures; a joined connection without a persisted replay batch becomes an
  unconfirmed sample after 15 seconds, not a fabricated success.
- Pool/Phoenix gauges have process/node scope; fleet server/client aggregates
  cover the current and previous 23 UTC hours. Reconnect frequency is observed
  per hour over this window, not normalized by unknown active-device time.
- Metrics contain no message text, attachment content, fingerprints, private
  errors or recipient IDs. Internal authenticated publisher bindings are not
  returned by the aggregate dashboard.

## Rollout Controls

`WINGA_CONVERSATION_MIN_PROTOCOL` defaults to `1`.
`WINGA_CONVERSATION_BLOCKED_PROTOCOLS` defaults to empty.
`WINGA_CONVERSATION_ROLLOUT_PERCENT` defaults to `100` and governs new groups.
`WINGA_CONVERSATION_ROLLOUT_USERS` permits explicit canonical account IDs.
Invalid configuration fails closed. Protocol version is the signed protocol,
not a spoofable client header. Existing production switches and CSP are unchanged.

Deploy the additive backend migrations before collecting the new experience
buckets. Deploy the Phoenix release for its authenticated `/ops/health` gauges.
Keep the legacy path for retained legacy history; do not drop its tables/files.

## Verification And Review

Separate reviewer Ampere performed repeated read-only reviews. Identified
ordering, CAS, cleanup, status, account ownership and misleading-observation
issues were reproduced and fixed with focused tests before publication.
This is a separate-agent code review, not independent cryptographic certification.

Actual disposable PostgreSQL verification passed 84 tests without skips,
including two-store/six-connection encrypted direct/Room concurrency, migrations,
lease cleanup, native history publication and preserved legacy guards. The test
server stopped. Frontend core and 80 behavioral tests passed; focused actual MLS,
intent/transport/operations verification passed 73 tests; Phoenix passed 9 tests.
The three previously failing synthetic encrypted browser scenarios were repaired
and passed targeted reruns, including real native crypto, seller replies,
third-device CAS retry and HttpOnly replacement/media/reload flows.
Final candidate checks passed 34 operations tests, 54 actual MLS/intent tests,
and 31 focused retry/offline observation tests. The four catalogs have 1632
keys each with no new hard-coded UI debt. The final build has asset version
`20261008130226`; the final synchronization check passed for all 93 generated
frontend modules.

The expanded 111-case UI run passed 110 cases and encountered an Edge browser
context crash in one rich-composer case. All 11 rich-composer cases passed on
the fresh-browser rerun; the earlier focused 53-case chat/rich suite also passed.
Mobile, 320px, desktop and RTL screenshots were visually inspected, and the
message-menu text overlap was corrected. This records the infrastructure failure
instead of representing the combined run as an uninterrupted pass.

The reviewer's final bounded re-review found no remaining P1/P2 findings and
passed 36 focused tests. Its bundle-sync checkpoint preceded the final rebuild;
the fresh publication check passed after that rebuild. All reported findings,
including retry/offline attribution after same-account re-login, are covered by
regression tests. This conclusion does not certify production or cryptography.

No production messages were sent, profiles reset, devices force-approved,
recovery keys inspected, flags changed or cryptographic acceptance fabricated.
