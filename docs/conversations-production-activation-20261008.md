# Conversations Production Activation

The production profile enables the implemented encrypted direct chat, private
media, user-key recovery, own-approved-device history and small private Rooms.
Device testing is deferred at the operator's request. Operational readiness is
not an independent cryptographic audit or completed physical-device acceptance.
No payment wallet, public-community contract, calling service or private AI
processing is enabled by this profile.

## Render Settings

Use the existing **WINGA Node backend**, not the separate Phoenix service.
In Render, open **Environment**, edit these existing flags (or add missing ones),
then choose **Save, rebuild, and deploy**:

```dotenv
WINGA_CRYPTO_DEVICES_ENABLED=true
WINGA_MLS_CANDIDATE_ENABLED=true
WINGA_ENCRYPTED_CONVERSATIONS_ENABLED=true
WINGA_ENCRYPTED_MEDIA_ENABLED=true
WINGA_ENCRYPTED_BACKUP_ENABLED=true
WINGA_ENCRYPTED_MULTIDEVICE_ENABLED=true
WINGA_ENCRYPTED_ROOMS_ENABLED=true
NODE_VERSION=24
```

Keep `WINGA_MESSAGE_DISPATCH_ENABLED` and `WINGA_WEB_PUSH_ENABLED` enabled
(both default to enabled when unset). Preserve existing R2 credentials,
`OPS_HEALTH_TOKEN`, database configuration and Phoenix secrets. Never put these
secrets in frontend variables or send them in chat. No CSP change, disk deletion,
extra Phoenix instance or new secret is required by this release.

The flags expose capabilities; they do not bypass native-device approval,
contact verification, membership freezes, block policy, size limits or quotas.
An existing encrypted conversation can never silently downgrade to plaintext.
Keep Phoenix at the agreed one instance. Existing Phoenix rollout/URL settings
are separate from these encrypted-feature flags.

Render's environment deployment controls are documented in
[Environment Variables and Secrets](https://render.com/docs/configure-environment-variables).
The native backend's `.node-version` and package engine now select Node 24,
matching local regression tests. `NODE_VERSION` takes precedence, so an existing
Node 20 dashboard override must be changed too. See
[Render Node versions](https://render.com/docs/node-version) and
[Node supported release lines](https://nodejs.org/en/about/previous-releases).

## Production Verification

After the exact release is Live, run once in the WINGA backend Web Shell:

```sh
cd /opt/render/project/src/backend
npm run verify:conversation-production
```

This reads the live process on loopback using the existing operations token.
It does not modify flags, accounts, messages, database rows or remote objects.
Its operational `ok` requires the full profile, encrypted schema/guard checks,
Room invariants, verified private bucket, an active metrics publisher and healthy
dispatch/push/media-cleanup backlogs. Missing credentials or an unavailable
check fail closed. A verifier with `preflightReady:true` alone does not establish
that production features are enabled.

The additive startup migration is
`2026100802_conversation_operation_metrics`. Wait for startup completion and the
publisher's first heartbeat before checking. Publisher failures are reported
without preventing durable message acceptance. Do not disable security or
increase health thresholds just to obtain a green response.

## Operations

`GET /api/ops/conversations/health` requires `X-Ops-Health-Token`, is no-store and
returns aggregate-only data. It checks bucket privacy outside the database
transaction and coalesces concurrent reads. Successful results are cached for
30 seconds; degraded results for 5 seconds.
The existing administrator-only Operations dashboard now shows conversation
status, active publishers, durable records, attempts, queue counts and alerts.
It uses the existing authenticated admin summary, not a browser-exposed ops
token. Slow health reads are isolated by a two-second dashboard deadline.

Hourly aggregate operation buckets persist across backend restarts and combine
independent instances. Cumulative per-boot writes are idempotent after uncertain
commits. The reported window is the current UTC hour and previous 23 hours, not
an exact rolling 24-hour window. Retention is seven days, with bounded pruning.
The tail since the latest successful background flush can be lost on abrupt
process termination; these are sampled operational metrics, not the message
ledger. No user IDs, plaintext, queries, ciphertext or attachment names enter
metric dimensions.

Operation counts include retries and successful reads. The separate
`ciphertextRecordsAccepted` count reads actual durable encrypted-message rows
once per record, including encrypted control events. It is not a count of unique
human-written texts, active users or recipients who have read a message.

Alerts cover an incompatible runtime, absent schema/guards/publisher, disabled production flags,
unverified storage, dispatch older than 60 seconds, push due more than 300
seconds, exhausted pending push jobs and orphan cleanup older than 600 seconds.
Operation and send-specific unavailable rates alert above 10 percent with at
least 20 attempts. These are operational warning thresholds, not certified
delivery/performance SLOs. Zero samples are reported as insufficient evidence.

The GitHub `Winga Conversation Health` workflow checks every 15 minutes or can
be run manually. It reuses the existing repository `OPS_HEALTH_TOKEN` secret,
prints no arbitrary response bodies and fails on configuration, HTTP or health
errors. It does not deploy, retry user writes or certify load capacity.

## Local Search and Report References

Direct search reads the existing encrypted vault's current projection even when
those messages are outside the visible page. It never syncs, enrolls a native
device or sends search words to a server. The vault projection replaces stale
encrypted view rows so hide/edit results cannot reappear from a loaded cache.
Session changes discard pending results. Search remains bounded to the latest
5,000 projected rows and 100 results; an incremental full-history index and
unbounded search are not implemented by this change.

Reports already retain stable `reportId` and `fileId` references. Explicitly
selected files are separately encrypted in the private report namespace, with
current-role and reason-gated moderator access and read auditing, including
after case closure. A reference cannot reconstruct a deleted object. Automatic
post-close deletion remains unconfigured, preserving existing retained evidence;
no legal retention period, public URL or automatic private-content processing
is implied.

## Acceptance Still Deferred

Physical-device media, recovery/replacement and multi-device acceptance,
authenticated sustained production load/failure/soak evidence, independent
cryptographic review, comprehensive accessibility and measured SLO/capacity
acceptance remain open. Flags being enabled and operational `ready` must not be
reported as all specification acceptance gates passing. Future business/shared
staff inboxes, opt-in translation/intelligence, wallets and public communities
retain their separately defined authorization and product contracts.
