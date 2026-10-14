# Conversations activity, device notices and infrastructure hardening

14 October 2026. Source baseline: `e3f4a8401d24bc3ec18700cecdbc92982ecb80a1`.

The three authorized workstreams now have implementation and isolated verification.
**Full Conversations production acceptance remains open.** Deployment is recorded
separately against its exact commit; source checks do not substitute for provider
trust, physical devices, capacity or an independent cryptographic review.

| Workstream | Completed source work | Remaining acceptance |
| --- | --- | --- |
| Presence and typing | Existing Phoenix Presence/PubSub, native signed activity, current session/device binding and canonical direct/Room membership/block checks; mutual opt-in account preference; aggregate user state; direct-chat privacy UI | Real foreground/background PWA devices, network switching and capacity; clustered Presence requires connected Phoenix nodes and its own acceptance |
| Device security notices | Native register/approve/revoke writes a deduped generic own-account notification in the registry transaction; existing notification/SSE inbox and device manager reused; stored registration dates shown | Real devices see and open notices outside the manager; user verifies fingerprints and approves devices; no agent performs that approval |
| TLS, retention and device acceptance | Requested primary/replica/listener TLS verifies certificate and configured host, including IP hosts; validated optional public CA; read-only TLS preflight and retention dry-run; existing ACK/staging sweep kill switch; operator device checklist | Production provider TLS preflight/trust activation, at-rest/backups/least privilege, approved full-history/erasure/backup durations, physical-device evidence and independent review |

## Activity contract

No second socket, message store or social graph was introduced. Native E2EE
membership remains authoritative. A marketplace socket device ID alone never
authorizes native activity; the signed actor must be active and bound to the
current account session. Native metadata proof is separate from MLS ciphertext.
Activity contains conversation/actor routing and booleans, never compose text.

Preferences default **off**. Both participants must opt in; an unrelated user
cannot query presence. Room authorization reuses existing native membership and
block policy without opening private history. Direct UI restores its original
Last message context when state is unknown. It never fabricates Offline or last
seen. Room activity authorization exists; this work adds no new Room UI/features.

Online leases last at most 12 seconds; typing lasts at most 6 seconds. Browser
pulses are foreground/focus-aware, expire locally and stop on account/context
changes. Per-user projection omits device IDs, device counts and timestamps.
Pending membership, blocked participants, revoked devices or failed authorization
cannot publish a new lease. Browser TTL bounds previously observed activity.

Activity has a separate 6-frame/10-second connection budget, 4 KiB frame limit,
one async authorization per channel, 16 bounded tasks, a small isolated HTTP pool
and 1.6-second authorization deadline. Durable message traffic retains priority.
Registry limits are 2,048 leases, 8,192 replay IDs, two scopes per connection and
four connections per native actor/scope. Replay IDs are retained 65 seconds,
covering the proof clock-skew window; a retry does not renew its lease. No database
heartbeat, durable activity journal, private analytics or notification is created.
These are bounded initial controls, **not a production capacity claim**.

The optional activity supervisor can restart independently of the core endpoint.
Presence's raw device metadata never goes to a channel subscription: channels
receive signal-only topics, reauthorize and project authorized user state.
`WINGA_CONVERSATION_ACTIVITY_ENABLED=false` kills publication/negotiation without
disabling canonical messages. It does not erase the explicit account preference.
Do not add a second paid Phoenix instance; the deployed service stays at one.

## Device notice contract

Only actual registry changes produce a notice. Exact retries, re-enrollment of an
existing device and new session bindings do not duplicate notifications. Durable
notice failure rolls back the registry change. `pg_notify` becomes visible after
commit; a missing live listener/provider does not erase the stored notification.
Lookup for live dispatch is by exact owned notification ID, not a recent-list
window. Notifications disclose generic security state and an own-management
target, not keys, fingerprints, IPs, message bodies or private room context.

Opening the notice returns to the existing device manager. Fingerprint confirmation
and explicit approval/revocation remain required. The manager displays the stored
registration date; it invents no device name/type or app version. Device private
keys remain on endpoints. This is an in-app/SSE notice, not an email/push preview
service or a universal E2EE claim.

## TLS rollout boundary

`backend/database-tls.js` replaces `rejectUnauthorized:false` for requested TLS
in primary, replica and listener clients. PostgreSQL URL SSL parameters cannot
replace the explicit verification object. `require`, `verify-ca` and `verify-full`
all use trust plus hostname verification; unsafe opportunistic modes, conflicting
configuration, URL certificate overrides and malformed public CA fail closed.
`DATABASE_SSL_CA` or `DATABASE_SSL_CA_BASE64` can supply an approved public CA;
configure one, never disable validation to resolve a trust error.

Disposable PostgreSQL 18 established verified TLSv1.3 with its explicit test CA.
Without that CA, the same endpoint rejected the connection with
`DEPTH_ZERO_SELF_SIGNED_CERT`. Host-binding checks reject a mismatched certificate,
including IP-host configuration. No test certificate is a production trust root.

Read-only Render job `job-db7n4i2j9qps73d1sf40` failed. Logs API returned 403;
operator log output is still requested. Its failure **does not prove a TLS error**:
the command/runtime/module path also needs diagnosis. No production SSL flag or
CA was changed blindly. Direct service environment inspection found no explicit
SSL flag, CA or SSL URL parameters for backend/intelligence/video; inherited
configuration and actual runtime trust must still be verified.

After diagnosing the job, run `npm run verify:database-tls` from the deployed
repository/service with its real private configuration. It uses a READ ONLY
transaction and outputs only verification/protocol/error code. Verify primary
and replica independently before activating `DATABASE_SSL=true` consistently
on affected services, then verify health and listener/reconnect behavior. Do not
print credentials, URLs or provider certificate private keys into reports.

## Retention boundary

`npm run verify:conversation-retention` is read-only and aggregate-only. It reuses
the exact canonical ACK eligibility predicate and reports pending work protected,
eligible acknowledged rows, expired history-transfer staging and accepted native
messages preserved. It performs no deletion or retention acceptance.

Existing ACK cleanup still requires that **the same device's contiguous cursor**
covers each acknowledged event. Pending/unoffered/cancelled obligations, canonical
accepted messages and the append-only replay ledger are preserved. Default ACK
retention remains 30 days (allowed 7–365); native history-transfer staging expires
after its existing 24 hours. Cleanup remains bounded with `SKIP LOCKED`, and
`CONVERSATION_RETENTION_SWEEP_ENABLED=false` pauses the existing ACK/staging worker.
It does not stop messages or unrelated media/commerce policies.

No unapproved blanket deletion policy was invented. Ciphertext history, replay
ledger/tombstones, moderation evidence, account erasure and backup expiry remain
separate duration/hold/recovery decisions. Their dry-run fields are null. Commerce
retention remains owned by Orders/Payments. Approval of a concrete policy must
precede a destructive purge implementation/rollout.

## Verification and physical-device acceptance

[Isolated evidence](evidence/conversations-activity-devices-isolated-20261014.json)
records actual checks and limitations. Real PostgreSQL/Phoenix tests include
lost replies, bounded overload, node loss/restart, native MLS activity consent,
membership, receipts and exact recovery. Independent local nodes intentionally
do not fabricate cross-node Presence; connected-cluster Presence acceptance is
separate from proven cross-node durable message recovery.

[Physical-device record template](evidence/conversations-device-acceptance-template.json)
is **unexecuted**. User handles `rey`, `wizad`, `riziki` do not supply authenticated
devices/sessions. Fill it only after an operator performs these checks on the
exact deployed commit/build with consented test accounts:

1. Two real endpoint devices/PWAs explicitly verify fingerprints, enable native
   membership, save activity consent and see online/typing. Remove focus, lock or
   suspend a phone: typing/online expire; private compose text never appears in
   server/push/growth payloads.
2. Switch Wi-Fi/mobile data and airplane mode. The same encrypted client message
   ID survives offline/reconnect; SENT follows durable persistence, DELIVERED a
   recipient's native acknowledgment, and READ an explicit authorized foreground
   action. Repeat exact retries and confirm one canonical message.
3. Add an unapproved native device. Trusted endpoints receive one generic notice
   while the manager is closed; open it into the exact device manager. Confirm
   date/fingerprint, approve explicitly and accept required membership transition.
4. Revoke a device and block a participant. Stale connections cannot publish new
   activity or receive/send future native messages. Existing historical copy and
   MLS membership/recovery consequences remain explicit, not silently changed.
5. With user-held recovery material, restore only supported encrypted history;
   password reset alone does not decrypt it. Without recovery material, explain
   the actual loss. Repeat background/foreground/installed-PWA behavior.

Record aggregate facts and timing, release/build, platform versions and selected
screen evidence privately; never commit sessions, private keys, recovery secrets
or message bodies. A physical run does not replace independent crypto/CodeQL
review or certify regional latency/load/battery targets.

## Rollout and rollback

Deploy the additive preference migration before/with the matching backend and
Phoenix/browser source. All existing preferences start off, and no contact is
invited or device approved automatically. Keep legacy message compatibility
explicit; activity is native-only. Monitor core health, native send/ACK failures,
activity drops, notice persistence and database trust errors.

Disable optional activity with its kill switch if needed; disable only the
retention sweeper to pause cleanup. For runtime rollback, deploy the preceding
verified source commit and retain the additive table/notifications. Do not delete
native registry/history, restore old TLS bypasses or falsify independent approval.
Production release evidence must verify final GitHub required jobs, all existing
Render commit IDs and Cloudflare bytes/build version. Video failure diagnosis
remains deferred; reading its release metadata creates no investigation scope.

Shopping Rooms §0 is still **not accepted**. Remaining foundation gates include
physical devices/PWA, production trust/backup/erasure policy, realistic soak and
independent cryptographic/static-analysis disposition. The received Security &
Realtime text still stops midway through §54; Shopping Rooms stops at §61's
heading. Neither partial contract is described as fully implemented or certified.
