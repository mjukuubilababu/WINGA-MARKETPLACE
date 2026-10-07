# Spec 188-189: Small Private Room Policy

## Implemented

Room admission bounds now come from backend configuration. The existing defaults
remain 12 accounts and 24 native devices. Optional environment variables are:

```text
WINGA_ENCRYPTED_ROOM_MAX_OWNERS=12
WINGA_ENCRYPTED_ROOM_MAX_DEVICES=24
```

Accounts must be an integer from 3 to 12; devices must be an integer from the
configured account limit to 24. Missing values use existing defaults. Empty,
fractional, whitespace-padded, unsafe or contradictory values fail validation;
they never silently widen access. No production environment changes are needed.
The current tested protocol ceiling is deliberately not enlarged to public-scale
communities. Raising that ceiling needs a separately reviewed contract and load
evidence, not just a larger environment value.

Authenticated, private/no-store capabilities expose only the configured bounds.
The browser uses them for owner review, creation, membership growth and localized
account/device limit messages. The backend independently enforces admission,
before quota consumption, package consumption or reservation writes. Stale or
bypassed client checks cannot authorize oversized growth. Older capabilities that
omit bounds retain the existing defaults; malformed supplied bounds fail closed.

Lowering bounds does not reinterpret immutable accepted rosters. Historical
parsing keeps the tested protocol ceiling; existing Rooms can still sync, read,
send, acknowledge and finish exact already-reserved retries. An oversized current
roster may shrink without being stranded by its new admission bound. Any newly
reserved roster dimension must be within its configured limit or no larger than
that dimension in the accepted previous roster. The directory is admission-only:
it does not expose oversized new lists. Existing Room sync does not rely on it.
The dynamic account-limit message has a new catalog key. The original static key
is preserved for older clients; cached catalogs cannot substitute a stale fixed
number for the new UI's configured-limit fallback.

`verify:shopping-rooms` remains read-only and now reports current bounds plus
aggregate counts of current Room rosters above the configured account/device
limits. Grandfathered counts are informational, not corruption or a reason to
fail readiness. No Room titles, owners, message plaintext or credentials are
logged by that verifier.

189 is a preserved architectural boundary, not a new public-community product.
Private Shopping Rooms continue to require authenticated membership, native MLS
acceptances, current epoch grants and existing blocks. No public discovery,
anonymous Room content, broadcasts, non-user invite tokens or hidden plaintext
AI ingestion have been introduced. Public communities need a separate privacy,
moderation, fan-out, ranking and storage contract.

## Evidence and Remaining Scope

Tests cover valid/default/malformed configuration, authenticated capability
disclosure, disabled gates, client review before directory work, independent
account/device bounds, real signed SQL-backed reservations and a four-owner native
MLS Room surviving lowered limits and shrinking its membership. Browser acceptance
uses configured three-account/three-device capabilities, checks the localized
limit before directory requests, then exercises the actual Room UI and encryption.

These local tests are not physical-device production acceptance, independent
cryptographic audit or multi-connection PostgreSQL/fleet load evidence.

Final local checks: 58/58 Shopping Room tests, 145/145 secure-content tests,
40/40 secure browser tests, and 145 frontend core plus 80 behavior tests passed.
The final Room UI regression also passed with an old cached static-limit
translation, proving the new configured-limit fallback. All four catalogs have
1603 matching keys; 93 frontend modules are synchronized. The release build
`20261007202624` passed the Wrangler deployment dry-run with existing variables
preserved. Deployment status must still be checked against the pushed commit.

The wider browser run also exposed a foreground sync/background history vault
revision collision in the existing direct multi-device flow. The vault correctly
refused a stale write. Durable sync now has at most three attempts for that one
CAS error, with fresh state on each replay. New sends, user mutations, invalid
ciphertext, session changes and other errors are not blindly retried. Background
archive I/O remains off the send critical path and vault CAS remains mandatory.
The actual native-device browser test injects two CAS failures and proves one
stored/decrypted message; three failures exhaust the bound, then the next explicit
sync safely resumes the same ciphertext. No duplicate send IDs are generated.

182-185 and 187 are explicitly future scope in the original spec: canonical group
orders, intelligence, decision assistant, summaries and non-user invitation links.
186 currently has the authenticated member-review participation loop, not a new
unauthenticated acquisition mechanism. Those future features are not marked done
by this policy change. Old Room history transfer/recovery, separate role/leave
policy, Room-specific preferences and production load evidence remain tracked.

## Rollout

Deploy backend and frontend together with the existing Room gates unchanged.
There is no schema migration, new secret, CSP change or instance-count change.
After deployment the Render backend shell can inspect aggregate state:

```sh
cd /opt/render/project/src/backend
npm run verify:shopping-rooms
npm run verify:room-seller-requests
```

For a tighter bound, configure both variables deliberately and redeploy. A Room
with a larger previously accepted roster remains usable; the reported above-limit
count is expected until it shrinks. No automatic member removal is performed.
Reload Winga after a configuration-only change so its encryption session reads
fresh authenticated capabilities. Backend admission remains authoritative even
while an older browser session still holds the previous UI bounds.
