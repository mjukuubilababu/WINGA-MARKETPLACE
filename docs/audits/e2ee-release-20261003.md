# E2EE Post-Deployment Release Audit

Date: 2026-10-03 (Africa/Nairobi)
Reviewed implementation: `63077e6fca38369850a5daeed3613e34c1046449`
Frontend build: `20261003142910`
Audit recommendation: **NO-GO pending external release gates; local implementation tests passed.**

Operator override: after receiving the outstanding-risk explanation, the operator
explicitly requested early E2EE activation and confirmed the Render deployment
Live. This does not close the review or acceptance blockers below.

This is an internal implementation re-audit, not an independent cryptographic
assessment. No production account, message, environment flag, bucket policy or
CSP was changed. Backend commit Live was confirmed by the operator; public
backend health does not establish its SHA or applied migrations.

## Findings And Release Blockers

1. **High release risk: cryptographic approval is outstanding.** The installed
   `ts-mls@1.6.4` README explicitly says the library has not undergone a formal
   security audit. Review must cover the pinned library, Winga authentication
   adapter and locally validated proposal-membership correction, not just the
   upstream protocol. Passing tests and zero npm advisories are not this review.
2. **High rollout risk: the proposed test-account-only pilot is not implemented.**
   Production API factories in `backend/server.js` use service-wide environment
   booleans. There is no enforced account allowlist for the pilot. Enabling these
   flags on the shared service is not a restricted test-account release. Use an
   isolated staging service/database/private bucket first, or implement and test
   server-enforced pilot authorization across participants, device/package
   enrollment, transport, media and recovery before a production canary.
3. **External acceptance evidence is incomplete.** Production migration state,
   real private-bucket isolation and scoped credentials, encrypted production
   cross-node delivery/failover, physical Android PWA restart/recovery and load
   acceptance have not been established in this audit. Earlier plaintext
   cross-node evidence does not establish encrypted cross-node behavior.

No additional confirmed implementation defect was found in the reviewed
retirement, repeated replacement, blocked-state reconciliation, signed poll
paging, journal migration/CAS, private media and history recovery paths.
This statement is limited to inspected paths and executed regressions.

## Fresh Verification

All commands below ran against this checkout after deployment, without skipped
tests or production database writes:

| Verification | Result | Scope |
| --- | --- | --- |
| `npm run test:secure-content` | 98/98 | Actual MLS plus device, codec, store and policy regressions |
| `npm run test:secure-content-browser` | 31/31 | Headless Edge, independent browser contexts/profiles, unchanged strict CSP |
| Event and encrypted concurrency suites | 30/30 | Independent connections to disposable localhost PostgreSQL 18 |
| Root `npm audit --omit=dev --json` | 0 reported vulnerabilities | Current registry advisories for installed production dependency graph |
| Backend `npm audit --omit=dev --json` | 0 reported vulnerabilities | Separate backend installed production dependency graph |
| `node scripts/verify-production-shell.js` | Passed | Live shell, versioned assets, CSRF/products endpoints and hardened headers |

The operator explicitly authorized dependency name/version metadata export for
both npm audits. No source or secrets were exported by these commands.

Browser evidence includes ciphertext-only HTTP and the real chat renderer,
Sent/Delivered/Read receipts, lost accepted send/upload responses with exact
retry after reload, attachment rendering/download, recovery UI on a fresh
browser, wrong key/checkpoint and server rollback rejection, account/session
switch isolation, two successive peer replacements and exclusion of retired
devices. It also covers 2,500 journal history records plus replay markers beyond
the old 32 MiB limit, v1 migration and a real MLS conversation beyond 100 queue
fixtures. The fixture uses PGlite and fake private object storage; it is not real
R2, Render failover or 101 independent cryptographic admissions.

The PostgreSQL suite separately covers reserve/retire races, competing initiators,
authorization after revocation/block/logout, pending-inbox replacement refusal,
old-epoch sends behind a membership freeze, media quotas, attachment/cleanup
races and lease ownership. The disposable database was stopped after testing.

## Recovery And Device-Loss Limits

- Recovery archives contain the latest 1,999 messages within a 2 MiB window.
  Older local history is not deleted, but it is not guaranteed recoverable after
  loss of the device. This is not unlimited history backup.
- User recovery key and latest independently retained checkpoint are required.
  Password reset is not decryption or recovery.
- History restore does not restore native identity, live MLS ratchet/group
  secrets, pending outboxes or membership rights. New device approval and fresh
  verified Welcome are separate steps.
- A recovered attachment descriptor/key does not itself authorize a fresh device
  to fetch historical media. That access policy requires separate acceptance.
- Losing all active identity devices has no automatic secure group rejoin.
  Expiry of admission after a replacement reservation has no automatic rollback.
  Do not reset epochs, remove immutable mode guards or downgrade to plaintext.
- Same-origin malicious scripts, compromised devices/browsers, storage eviction
  and malicious application updates remain outside the protection claim.

## Production Read-Only Schema Check

Run in Render Web Shell for the WINGA backend, without pasting environment secrets
into chat. This checks schema evidence only; `ok:true` is not activation approval.

```bash
cd /opt/render/project/src/backend
node <<'NODE'
const { Client } = require('pg');
const ids = [
  '2026100201_encrypted_conversation_backups',
  '2026100301_conversation_crypto_devices',
  '2026100302_conversation_security_mode',
  '2026100303_conversation_crypto_key_packages',
  '2026100304_encrypted_conversations',
  '2026100305_encrypted_conversation_media',
  '2026100306_encrypted_conversation_replacement',
  '2026100307_encrypted_replacement_retirements'
];
const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: String(process.env.DATABASE_SSL).toLowerCase() === 'true'
    ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000, statement_timeout: 10000
});
(async () => {
  try {
    if (!process.env.DATABASE_URL) throw new Error();
    await c.connect();
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: [r] } = await c.query(`SELECT
      (SELECT COUNT(*)::int FROM schema_migrations
        WHERE migration_id=ANY($1::text[])) AS migrations,
      (SELECT COUNT(*)::int FROM pg_trigger
        WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND (
          (tgname='guard_conversation_security_mode'
            AND tgrelid=to_regclass('conversation_event_streams')) OR
          (tgname='guard_legacy_message' AND tgrelid=to_regclass('messages'))
        )) AS guards,
      to_regclass('encrypted_replacement_retirements') IS NOT NULL AS retirements
    `, [ids]);
    await c.query('COMMIT');
    const ok = r.migrations === ids.length && r.guards === 2 && r.retirements;
    console.log(JSON.stringify({ ok, privacy:'aggregate-only', scope:'schema-only',
      migrationsApplied:r.migrations, migrationsRequired:ids.length,
      guardTriggersEnabled:r.guards, retirementTablePresent:r.retirements,
      databaseChanged:false, productionActivationApproved:false }, null, 2));
    if (!ok) process.exitCode=1;
  } catch {
    console.log(JSON.stringify({ ok:false, errorCode:'ENCRYPTED_SCHEMA_CHECK_FAILED',
      databaseChanged:false, productionActivationApproved:false }));
    process.exitCode=1;
  } finally { await c.end().catch(() => {}); }
})();
NODE
npm run verify:encrypted-conversation-backups
```

## Controlled Acceptance Sequence

Keep all production gates unchanged until independent review and staging pass.

1. Use isolated staging resources and synthetic accounts; reproduce this build,
   migration checks and strict CSP. Establish a dedicated private conversation
   bucket with separate bucket-scoped credentials, no managed public URL and no
   custom domain. Verify access both before and after real I/O; do not treat
   `R2_CONVERSATION_ISOLATION_CONFIRMED=true` as proof by itself.
2. On two actual Android devices, enroll/approve native identities and compare
   fingerprints independently. Enable only their staging conversation. Check
   text, image/file ciphertext, no plaintext network/push/log content, receipt
   progression, offline/reconnect and full PWA/browser restart.
3. Save recovery key and latest checkpoint outside Winga. Restore bounded history
   on a fresh authorized device. Confirm wrong key, old checkpoint and server
   rollback fail; no live group state transfers. Separately approve/rejoin,
   replace twice and prove each retired device cannot decrypt future messages.
4. Test actual encrypted delivery across two staging backend processes sharing
   durable storage, then drain one and retry uncertain send/upload/receipt ACKs.
   Prove one logical message, monotonic receipts, revocation enforcement and no
   disk/plaintext fallback. Exercise real object cleanup and worker lease races.
5. Record Android/bucket/failover/load evidence and independent review outcome.
   After a server-enforced pilot boundary exists, obtain release approval and
   enable only the approved participants. Expand only after monitored acceptance.

Stop expansion on incorrect identity, lost state, duplicate logical messages,
plaintext fallback, unauthorized media access or stalled replacement. Disabling
an API flag is a kill switch, not a rollback to plaintext: already encrypted
conversations remain irreversible and will be unavailable while gates are off.
Preserve ciphertext, epochs, tombstones and recovery checkpoints during repair.

## Current Release State

### Cookie-Only Production Incident

After activation, the operator reported Conversations showing Try again and new
messages failing with `crypto_vault_session_required`. The production data layer
deliberately removes bearer tokens from browser session storage; authentication
uses an HttpOnly cookie. Four browser crypto components incorrectly required a
JavaScript-visible token despite having the authenticated owner/session ID.

The integrated HTTP/browser fixture was changed to use a real HttpOnly cookie
and a token-free public session. Before the fix it reproduced exactly
`crypto_vault_session_required` at Alice's first enrollment. The correction
removes only the required public-token precondition in device, vault, MLS and
recovery startup. Owner/session-ID checks remain, and any supplied legacy token
still participates in continuity comparisons. Server cookie/session/account
authentication and native signatures are unchanged. No bearer is returned to
JavaScript, and no plaintext fallback, CSP or production gate change is added.

Hotfix verification: 98/98 secure-content Node tests, 31/31 strict-CSP browser
tests, 144 frontend core checks and 68/68 frontend behavior tests passed. A final
focused cookie-only HTTP/browser run passed after adding explicit inbox-load
and cleared-cookie denial assertions; an absent cookie permits neither inbox
access nor another encrypted send. The new static build is `20261003151719`,
with all 81 modules synchronized. Production authenticated roundtrip remains
operator acceptance, not established by synthetic test accounts.

The deployed frontend/backend are available. Following the operator's early
activation request, read-only probes on 2026-10-03 returned HTTP 200/ready for
health and HTTP 401/session-required for crypto devices and encrypted chat
capabilities on both the backend origin and marketplace proxy. Those routes no
longer return their disabled-gate errors. Recovery remains HTTP 404 with
`encrypted_backup_disabled`. No authenticated production capability response,
device enrollment or encrypted message roundtrip was verified by these probes;
they also do not establish private-media configuration or migration state.

Activation is service-wide availability, not the audited test-account-only pilot.
No flags were changed by the agent. External review, production/device acceptance
and the pilot authorization boundary remain outstanding despite activation.
