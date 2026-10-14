# Conversations TLS diagnostics and operational client hardening

14 October 2026. Live preflight source: `a6fb17587f9883ec5f910d38b53338d16f5dd5cd`.

The current read-only Render preflight also failed; the provider cause is still
unknown because the Logs API returned HTTP 403. Production TLS activation remains
blocked. Separately, 13 operational PostgreSQL clients that disabled certificate
validation were fixed to reuse the existing strict TLS helper.

## Actual provider observations

The previous job `job-db7n4i2j9qps73d1sf40` has canonical status `failed`.
It does not provide an error code in the inspected job metadata.

One fresh backend job, `job-db7pd1id0e5s73emkuh0`, ran
`npm run verify:database-tls` on the deployed source. Render reports it started
at 14:49:42 UTC and failed at 14:49:53 UTC. The command forces certificate plus
configured-host verification, connects with bounded timeouts, runs only a
READ ONLY transaction/pg_stat_ssl query and requires both authorized TLS and
server SSL state before success. Its failure is **not proof of a certificate
error**; configuration, command/runtime or database availability can also fail.

Both job-filtered logs and service-filtered logs for the current time window
returned HTTP 403, using the configured account and an actual owner identifier.
No alternative identity, credential or logging authorization was used. The
operator has been asked for only the safe `winga-readonly-tls-preflight` JSON line,
or the command error if that JSON is absent. Do not paste database URLs, passwords,
tokens or arbitrary application logs into the report.

Direct service-specific environment entries did not contain a primary URL,
enabled SSL flag, CA or replica entry. This does **not** establish absence in
inherited environment groups or the actual runtime. No credential values were
printed, copied to repository evidence or changed.

## Operational clients now share the runtime TLS contract

Thirteen audit/backup/cutover/readiness CLIs previously supplied
`rejectUnauthorized:false` when SSL was requested. The affected commands are
listed in the [machine-readable record](evidence/conversations-tls-diagnostics-20261014.json).
They now use `backend/database-tls.js`, the same canonical helper used by the
runtime primary, replica and listener clients. Requested flag/URL TLS therefore
requires certificate trust and the configured hostname, including IP-host
verification. Approved optional CA handling, URL SSL-override rejection and
unsafe/conflicting mode rejection are shared rather than duplicated.

No SQL, media-copy eligibility, private/public visibility, backup/cutover
confirmation, storage probe policy or commerce behavior was changed. Existing
timeouts are retained. Six Conversation verifiers construct their client inside
the existing sanitized catch, so invalid configuration fails with aggregate JSON
and cannot skip cleanup or expose credentials. The dedicated TLS preflight also
loads its pg dependency inside that catch boundary, producing a safe
`MODULE_NOT_FOUND` code if dependency resolution fails.

Optional non-TLS configuration is not silently switched on by these source
changes. This fixes certificate-validation bypasses; it does not certify that
all live services currently use TLS.

## Verification and activation boundary

The CLI/TLS and existing audit, private backup, copy, cutover, inventory and
receipt regression group passed 133 checks without failures or skips. After the
preflight loader boundary change, the final TLS group passed 30 checks. These
groups overlap and must not be added together as distinct tests. The CLI tests
execute trusted command entrypoints with a fake pg transport, verifying strict
options, mismatched-host rejection, URL override rejection, zero SQL after a
rejected connection, safe missing-config output and cleanup. They do not claim
a successful handshake against Render's production PostgreSQL provider.

Matching-source CI, CodeQL and release evidence must be recorded after push.
The independent review manifest and deployment policy stay unchanged. The
earlier 55-finding triage remains historical evidence for its bound source;
source changes require fresh security review inputs.

Next activation steps, once the operator diagnostic arrives:

1. Identify configuration/dependency/connect/trust failure from the actual
   sanitized output. Fix that specific cause; do not guess a CA or disable trust.
2. Rerun strict read-only verification for the primary and any configured replica.
   Establish verified provider certificate/hostname/SSL evidence for each.
3. Only after success, activate the SSL setting consistently on the affected
   services, then verify health, listeners and reconnect behavior.

No production SSL flag, database URL, CA, retention deletion or paid Phoenix
instance was changed for this diagnostic. Physical devices/PWA, approved
retention/erasure/backups, independent crypto/CodeQL review and capacity evidence
remain open. Shopping Rooms §0 is still unaccepted. Rollback restores the prior
verified source and preserves durable data; bypassing trust is not a permanent fix.
