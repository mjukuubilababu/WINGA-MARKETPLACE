# Conversations activity and security hardening release evidence

Final runtime/source commit: `50585d50deaa7ba4dacf65162104733f67ccbc31`.
Implementation commit: `f3476a808536d7a18bd20a984737bee53f36d954`.
Both were pushed to `master`. This evidence branch adds documentation only and
does not change the runtime/source commit being certified by deployment checks.

The three source workstreams now provide native-authorized opt-in Presence/typing,
durable deduped own-account device security notices, and database TLS/retention
controls with a physical-device acceptance runbook. See the
[implementation, tests and remaining gates](conversations-activity-devices-hardening-20261014.md)
and [isolated evidence](evidence/conversations-activity-devices-isolated-20261014.json).
**Full Conversations foundation/production acceptance remains open.**

## Exact-source CI and production

The [acceptance run](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38570266426)
completed with functional, dependencies and BEAM successful. Its overall result
is **failure** because static analysis reports `CODEQL_REVIEW_STALE`; do not
describe all CI or security checks as green. Functional evidence includes 54
secure browser checks, 27 sharing checks, 28 guest/auth-return checks, frontend
153/153, four 1,777-key catalogs and 100 synchronized modules. Isolated real
PostgreSQL, TLS, node-loss and metadata authorization evidence is recorded above.

The final [production run](https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38572105065)
and job `115879695365` succeeded, including production shell verification. The
existing deployment policy requires functional, dependencies and BEAM; its
separate CodeQL review requirement remains open. No policy or review manifest
was weakened/rebound to accept this source. An earlier attempt
`38570395451` failed its functional requirement after the preceding acceptance
run was cancelled by the follow-up push. The final matching-source run passed.

Cloudflare final build **`20261014132858`** is live. All eight checked runtime
assets returned HTTP 200 and their SHA-256 values match the expected source/build:
MLS vendor, app, style, module bundle and four locale catalogs. The backend health
endpoint returned HTTP 200 and the exact final commit. Phoenix health returned
HTTP 200; it does not publish a commit, so source identity was checked in Render
deployment metadata.

All existing Render services were verified live at the same final commit:

| Service | Verified deploy |
| --- | --- |
| Backend | `dep-db7o0qegekts73e576d0` |
| Intelligence | `dep-db7o0qegekts73e577sg` |
| Video | `dep-db7o0qegekts73e57810` |
| Phoenix | `dep-db7o0qegekts73e57670` |

[Machine-readable release evidence](evidence/conversations-activity-release-20261014.json)
preserves identities, asset hashes, health responses and the distinction between
successful release checks and unaccepted foundational security gates. Checking
Video deployment metadata did not resume the deferred video-failure investigation.
No second paid Phoenix instance or new production history purge was created.

## Independent security gate and added finding

Actual CodeQL reported **55 security findings: 22 error, 33 warning, zero reviewed**.
Its source-tree fingerprint is
`6e3d8308d0a14c03e7f11a72be930af1af30ba5386c33eda74a331ec5d10f026`.
Review input artifact `11897467051`,
`conversation-codeql-50585d50deaa7ba4dacf65162104733f67ccbc31`, expires
12 January 2027. GitHub reports artifact digest
`sha256:0f61b31670ce633d0606cce6c886e68f13107a11af2a49ddbfe77065eb7054da`.
That is GitHub's artifact metadata, not a claim of local archive verification.

Compared with the preceding release's 54 location records, one added error is
`js/user-controlled-bypass` at `backend/conversation-transport.js:92`, the new
activity dispatch branch. Source-path triage confirms that service authentication
and scoped ticket/current-session authorization precede execution; activity then
uses canonical current native signature, session binding, membership and block
authorization. Wrong action/native capability/kill-switch and forged/blocked/
revoked/nonmember cases passed their negative tests; real signed activity passed
through Phoenix and withdrew after opt-out.

This is **not** an independent SARIF data-flow review, false-positive disposition
or acceptance. The artifact connector returned a download reference; downloading
that archive into the execution environment was unavailable. Only canonical gate
and location records were inspected. An independent reviewer must inspect the
full immutable artifact and disposition this finding plus the other 54 against
the exact source; genuine issues must be fixed, not hidden through syntax changes
or a copied review fingerprint. [Location/triage evidence](evidence/conversations-activity-codeql-20261014.json)
preserves the unresolved records without claiming approval.

## What remains

1. Production provider certificate/trust validation and controlled TLS activation.
   Read-only preflight job `job-db7n4i2j9qps73d1sf40` failed; logs access returned
   403 and operator diagnostics remain pending. The source verifiers now run with
   Render backend dependencies. No unverified production SSL toggle was applied.
2. Real foreground/background/installed-PWA devices, network switching, native
   device notices/revocation and user-held recovery acceptance. The
   [operator record](evidence/conversations-device-acceptance-template.json) is
   explicitly unexecuted. User handles are not authenticated device sessions.
3. Approved ciphertext/replay/moderation retention, erasure/hold/recovery/backup
   durations and infrastructure at-rest/least-privilege evidence. Existing bounded
   ACK/staging cleanup is retained; new full-history deletion was not invented.
4. Independent crypto/CodeQL review, real capacity/regional soak and connected-node
   Presence acceptance. Keep the deployed Phoenix instance count at one.

Shopping Rooms §0 is still unaccepted and no new dependent Room feature was added.
The supplied Security & Realtime and Shopping Rooms texts remain incomplete at
§54 and §61 respectively. Source implementation, successful deployment and local
fixtures do not certify either complete specification.
