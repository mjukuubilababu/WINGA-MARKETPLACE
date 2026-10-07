# Shopping Rooms: Real PostgreSQL Acceptance

This is bounded localhost acceptance, not production capacity, physical-device
acceptance or independent cryptographic approval. No product code, migrations,
production database, feature flags, secrets or frontend assets change here.

## Harness

The existing disposable Windows runner now includes the Room service fixture.
It uses already installed PostgreSQL binaries, a fresh cluster bound to
127.0.0.1, a random schema per test and a pool of six independent connections.
Two independently constructed encrypted stores use the real signed operations
and actual MLS packages, Welcome, commits and native acceptances.

The adapter refuses missing test URLs and non-localhost URLs before connecting.
It never falls back to DATABASE_URL. Each schema is dropped after its test;
the runner restores its environment and stops only its own fresh cluster.
Synthetic cluster directories remain ignored for diagnostics. Production or
existing Windows PostgreSQL services are not stopped or deleted.

```powershell
# Full canonical/direct/Room PostgreSQL coverage:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-local-conversation-db-tests.ps1
# All Room service tests on PostgreSQL:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-local-conversation-db-tests.ps1 -RoomsOnly
# Four new real-connection race/load cases only:
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-local-conversation-db-tests.ps1 -RoomConcurrencyOnly
```

The default npm Room suite still uses PGlite and explicitly skips these four
PostgreSQL-only cases. A skipped case is not successful PostgreSQL evidence.

## Contracts Exercised

- Three real native owners prepare 48 MLS application ciphertexts. Six workers
  submit 96 signed sends across two stores. Exactly 48 rows and 48 canonical
  creation events persist, with contiguous sequences and no duplicate rows.
- Each message decrypts on the other two native endpoints: 96 decryptions.
  The final workload contains a product share, a poll and account-scoped votes;
  the three decrypted board projections must be identical.
- Concurrent Read/Delivered retries converge to 192 receipt rows and 192
  sender ACKs. Receiver inboxes and sender receipt queues drain, while push
  enqueue happens once per other owner: 96 enqueues, not provider deliveries.
- Twelve reservation and twelve transfer attempts consume one package per
  native endpoint. Two accepted endpoints cannot activate the Room; eight
  acceptance retries per endpoint produce one transition, one epoch and three
  original epoch grants only after all three native signatures are present.
- Racing Mute/Archive writes share one owner revision. One wins, the other
  conflicts; 24 exact lost-response retries do not increment the revision or
  modify another owner's preferences.
- A held membership-freeze transaction visibly blocks a second PostgreSQL
  backend PID. After commit, the waiting old-epoch send rechecks access and is
  rejected; no message, sequence increment or old-grant mutation occurs.

## Measurement Boundaries

Local results on 2026-10-08: existing canonical/direct PostgreSQL cases passed
39/39; the Room service suite passed 21/21 on real PostgreSQL. The final expanded
commerce-board/race rerun passed 4/4 with no skips. The default Room regression
run passed 66 cases, with its PostgreSQL-only cases explicitly skipped. URL
guards rejected remote and missing test URLs before any database contact.

Final commerce workload: 96 attempts persisted 48 messages, 96 native decryptions
and three identical boards. The send-attempt interval was 1,304 ms; empirical
p50/p95 attempt latency was 70/174 ms. These are observations, not SLO gates.
An initial test-only assertion expected a pending Room instead of its reserved
state and was corrected. A rerun interrupted by cluster shutdown is excluded;
the final focused runner owned its cluster lifecycle and exited successfully.

For load preparation only, the synthetic native transport fails before sending
and the test clears that synthetic pending journal while retaining the actual
MLS ratchet advance. It does not claim an end-user successful sender flow.
Sender history is confirmed only against the subsequent real store response;
other endpoints independently decrypt and verify the signed native content.

Diagnostics measure database send attempts only, including signing, pool wait,
serialization and commit. Packet preparation, decryption, receipt convergence
and browser/network/Phoenix latency are outside that timing interval.
The existing global encrypted-transport advisory lock is unchanged. These
small bounded tests do not establish concurrent throughput across many rooms.

## Still Open

Production HTTP/Phoenix/R2 integration under sustained load, realistic room and
device distributions, process/network/database failure injection, SLO/soak
measurements, physical-device acceptance and independent crypto review remain
separate gates. Role/leave policy and retention/erasure approval remain open.
This test-only release does not enable a feature or require a frontend rebuild.
