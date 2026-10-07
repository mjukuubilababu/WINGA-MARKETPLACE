# Shopping Room Mute and Archive

## Implemented

Shopping Rooms now have independent, owner-scoped durable notification and
archive preferences. The Room header Settings menu offers one indefinite mute
checkbox and Archive or Move to Inbox. The Room list has an Archived chats view
and shows muted status without hiding the Room. Archive never deletes ciphertext,
sealed local history, unread state, receipts or membership. Incoming messages do
not automatically unarchive it. Archive alone does not suppress notifications.

Preferences are shared by the account's authorized Room devices, not by all Room
members. Room polling returns only the caller's own revision, muted and archived
metadata. Visible Room surfaces reconcile on the existing five-second poll;
there is no claim of instantaneous cross-device preference fanout. Open Settings
controls also reconcile, and a session/account change stops the surface.

All reads and writes require the existing authenticated, active native device,
signed Room operation and current membership checks. Other owners cannot be
supplied in the payload. Revoked devices and removed members cannot use the
preference endpoint. An ended-access list row may still return the owner's own
archive/mute metadata, without protected content or another member's settings.

Writes use a shared row revision for mute and archive. Stale writes fail with a
conflict instead of overwriting newer device state. The last accepted request ID
and payload hash allow an exact lost-response retry; reusing that ID with changed
content or replaying an older write after another update cannot undo new state.
Preferences do not modify immutable MLS membership, epoch grants or ratchets.

Room mute is checked both at push enqueue and at dispatch. Muting also completes
already queued, not-yet-completed Room jobs for that owner; unmuting does not
resurrect old alerts. A notification already accepted by the provider cannot be
recalled. An in-flight provider call still has an unavoidable race with a later
mute. Private-chat mute no longer cancels or suppresses an unrelated Room alert
from the same sender. Private chats keep their separate existing preference
table. Provider grouping remains opaque and now uses the Room, not its sender,
so different senders in one Room share an alert topic without exposing Room IDs.

## Migration and Rollout

The additive, repeatable migration is
`2026100702_encrypted_room_preferences`. It creates only the small metadata table;
it does not rewrite messages, membership, devices, keys or grants. The existing
startup migration runner applies it under its normal transactional lock.
Deploy the backend first, verify ready health and the exact release commit, then
publish the frontend. No new secret, feature flag, CSP change, provider setup or
instance-count change is required.

Older frontends safely ignore the new polling metadata. The new frontend only
shows preference controls when the server supplies preferences, so it does not
present unsupported actions against an older backend. Rollback leaves the
additive table intact; do not drop it or delete preference state.

The read-only aggregate `verify:shopping-rooms` now requires and reports the
preference migration with `preferencesReady`. It does not claim authenticated
acceptance, independent cryptographic audit or production load proof.

## Evidence and Remaining Work

SQL/native tests cover account/session isolation, exact retries, stale writes,
changed request IDs, migration replay, removed membership, muted encrypted
delivery/read receipts, queued and dispatch-time suppression, direct/Room mute
separation, archive-only alerts and opaque grouping. Browser acceptance exercises
the real mobile Room menu, mute, Archive, archived incoming encrypted text,
automatic settings reconciliation and Move to Inbox, then continues encrypted
file, product, poll, removal and responsive/RTL checks.

This closes the Room-specific mute/archive preference gap. It does not claim
Room old-history transfer/recovery, role/leave governance, wallet/group orders,
independent crypto audit, physical-device production acceptance or PostgreSQL
cross-connection/fleet load completion.

Local release checks passed: 61/61 Shopping Room tests, 145/145 secure-content
tests, 40/40 secure browser tests, 128/128 direct push/PostgreSQL regression
tests, and the frontend core/behavior suites. Four catalogs have 1604 matching
keys with no new visible-string debt; 93 modules are synchronized. Prepared
frontend build `20261007205316` passed the deployment dry-run. Publication and
the exact backend SHA must be checked after push, not inferred from these tests.
