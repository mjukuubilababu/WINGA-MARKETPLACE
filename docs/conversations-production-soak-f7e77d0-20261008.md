# Production Soak And Local Load Follow-Up: 2026-10-08

## Scope

The operator authorized production soak/load after reporting the protected
production verifier as ready, with all seven conversation flags enabled,
dispatch/push enabled and no alerts. That operator-provided snapshot did not
certify authenticated device flows, load capacity or an external crypto audit.

This follow-up tests the deployed release independently through the existing
fixed-target public probe, and runs the genuine PostgreSQL concurrency/load
suite locally. These are separate measurements. Neither reads customer chats,
creates production test accounts, sends production messages, changes flags,
scales services, resets databases or causes an intentional outage.

## Live Public Soak

The completed live run passed 117 requests, zero failures, all HTTP 200,
in 330,325 ms: 87 soak probes plus 30 paced load requests. Every service
received 39 probes. There was no rate limit, failure stop or release change.
Backend identity remained `f7e77d0559e5528884da3b2615685e0b5348f117` and frontend
build remained `20261008153000`. Phoenix public health does not expose a SHA.

[Machine-readable live evidence](evidence/conversation-production-soak-f7e77d0-20261008.json).

| Endpoint | p50 | p95 |
| --- | --- | --- |
| Backend public health | 207 ms | 907 ms |
| Frontend build-version | 47 ms | 104 ms |
| Phoenix public health | 203 ms | 471 ms |

The configured measurement was five minutes plus 30 paced load requests:

```powershell
npm run verify:conversation-soak -- --confirm=read-only-production-soak --duration-seconds=300 --interval-seconds=10 --load-requests=30
```

Targets are backend public health, frontend build-version JSON and Phoenix
public health. Traffic is read-only, capped at two in-flight requests and one
load start per second. The runner stops on rate limiting, repeated failures or
a backend/frontend release change. Nine offline safety tests passed before
the live run. Public health latency is not encrypted-message delivery latency.

## Actual Local PostgreSQL Load

All 80 tests passed, zero failures and zero skips, using PostgreSQL 18 on a
fresh disposable loopback cluster. The test suite completed in 131,188 ms.
Two independent stores and six connections exercise actual concurrent SQL;
this is not a multi-host deployment or production HTTP benchmark.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-local-conversation-db-tests.ps1 -Port 55448
```

| Measurement | Observed result |
| --- | --- |
| Direct encrypted messages | 64 unique, 74 attempts, 64 recipient decryptions, 0 duplicates |
| Direct store attempt latency | p95 467 ms; bounded send batch 952 ms |
| Shopping Room messages | 48 unique, 96 attempts, 96 decryptions, 0 duplicates |
| Room receipts | 192 rows and 192 acknowledgements |
| Encrypted Room boards | All three converged |
| Room store attempt latency | p50 85 ms, p95 164 ms; bounded send batch 1,524 ms |
| Encrypted history pages | 64 unique, 384 accepted write attempts, one root revision |
| History page write latency | p50 13 ms, p95 76 ms |
| Own-native history | 64 unique pages, 256 writes, 12 publication and 12 acceptance attempts |
| Own-native page write latency | p50 64 ms, p95 161 ms |

Coverage also passed contiguous sequences, exact retries, account/device
revocation races, native admission/removal, membership freeze, Room leave and
re-admission, admin transfer, archive authorization, mute/push enforcement,
media cleanup/upload/attachment races, independent-Room progress and bounded
retryable lock contention. The telemetry publication and health SQL tests ran
against that same actual PostgreSQL engine.

The runner exited successfully, stopped its own disposable cluster, and a
subsequent listener check found no listener on port 55448. The retained test
cluster is ignored workspace data; no existing database service was stopped.

## Acceptance Still Open

At the public soak checkpoint, no designated production test credentials or ops
token were available. Subsequently, the operator explicitly authorized the
existing `rey` and `wizad` accounts and privately prepared separate browser
profiles. Both sessions were independently verified against the production
`/api/auth/session` endpoint; no password, token or recovery key was printed.

The encrypted preflight stopped on `mls_device_not_active` for both profiles.
The last successful own-native check was pending: rey had one active and one pending
device; wizad has one active and three pending devices. Both existing device
dialogs rendered the own fingerprint and correctly disabled approval from the
pending device. No native was approved/revoked/reset and no test message was
sent. Only the exact matching new native may be approved from the account's
trusted existing device. Account login is not encryption-device approval;
native approval alone does not restore old conversation keys.

The private login helper now confirms server identity before closing a window,
supports retrying wizad alone, and has a `--devices` review mode that opens the
existing Winga device UI and verifies actual active state. Nine offline helper
regressions passed. It never automatically approves a native, sends a message,
accepts contact fingerprints or resets history. Authenticated encrypted
production messaging/Rooms/media/recovery load was not exercised.

The later [device Pending display fix](conversations-device-pending-fix-20261008.md)
addresses stale status after an accepted approval and misleading selection of
another pending native. Its isolated fixture is not a fresh production-native
approval observation; the authenticated-load gate remains open.

A genuine capacity/long-duration soak still needs operator-designated test
accounts/devices, a bounded authenticated workload and target SLOs, with
protected queue/worker/pool health observed during and after the workload.
Keep Phoenix at its approved one instance. Do not substitute public liveness
or local store timings for those results, or set production load, physical
device or cryptographic audit approval flags true based on this evidence.
