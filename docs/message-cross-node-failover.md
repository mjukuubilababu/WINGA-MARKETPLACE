# Controlled Cross-Node Message Failover Probe

Status: operator-reported production exercise passed on 2026-09-28; see the
latest entry in `docs/conversations-foundation-contract.md` for its limits.

## What it proves

The preflight uses two test-account sessions and the existing ops token to open
authenticated SSE streams. Ops-authorized SSE responses include Render's
instance ID, a process boot ID, and the deployed Git commit. Normal SSE clients
receive none of these headers. Preflight requires two distinct live instance IDs
at the same commit and checks durable retry and replay capabilities. It does not
send a message or perform a failover.

The optional exercise holds receiver streams on two distinct instances, records
the receiver's durable replay checkpoint, and pauses for a human operator to
scale the service from exactly two instances to one. It refuses to send unless
exactly one observed stream closes and the other instance remains available
with the same boot ID. It then
sends exactly one labelled synthetic message from the second test account,
opens a new receiver stream on the surviving node, and requires the canonical message
ID to appear exactly once in bounded replay after the pre-failure checkpoint.
No retry occurs after an unknown POST outcome. The synthetic message remains in
the test accounts' history; the verifier does not delete or mark it read.

This is a controlled, operator-attested node-loss recovery check, not a claim that
the script itself terminated a node. Keep the Render instance/event timeline as
separate fault-injection evidence. It does not verify E2EE, device ACKs,
database-primary failover, or a revoked session after this particular node loss.

## Preconditions

- Use isolated test accounts A (receiver) and B (sender); B must not be A.
- The Render API service must have at least two live instances, PostgreSQL
  message replay, the deployed ops-only SSE headers, and the same Git commit on
  both instances.
- Use the value of `OPS_HEALTH_TOKEN` configured on the API service. Never paste
  session tokens or this ops token into chat, logs, screenshots or repository files.
- Set `WINGA_FAILOVER_ORIGIN` explicitly to the API origin. The verifier accepts
  HTTPS origins only and does not use the frontend Worker as a proxy.
- In production, obtain explicit approval for reduced capacity, select a quiet
  window, confirm the starting instance count is exactly two, and have a rollback operator ready.
  Do not drain production merely because preflight passed.

## Preflight (read-only commerce state)

On a local Windows PowerShell terminal, `scripts/run-message-cross-node.ps1`
prompts for two test-account logins and the ops token without echoing passwords.
It obtains session cookies in memory, runs the verifier, and clears
the child-process environment variables afterward. Do not run the exercise
from a Render instance: that instance could be the one drained.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-message-cross-node.ps1
```

After preflight passes and the operator approves the drain, run
`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-message-cross-node.ps1 -Exercise`
from the same local machine.
The script will prompt for credentials again and then wait for the scale-down
confirmation. Do not run `-Exercise` just to check topology.

Set these variables privately in the terminal:

```bash
export WINGA_FAILOVER_ORIGIN=https://winga-pflp.onrender.com
export WINGA_RECEIVER_SESSION_TOKEN='test-account-A-session'
export WINGA_SENDER_SESSION_TOKEN='test-account-B-session'
export WINGA_TEST_RECEIVER='exact-account-A-username'
export OPS_HEALTH_TOKEN='same-token-as-Render-API'
npm run verify:message-cross-node
```

The session preflight may perform the app's normal session rotation. A successful
result reports `preflightReady: true` and `twoInstancesObserved: true`, but
`crossNodeFailoverProven: false`. If one instance is observed, stop. Render's
free plan cannot run two instances; scaling a paid service has cost. Do not
assume multiple historical restart IDs imply simultaneous live nodes.

## Controlled exercise (only after approval)

```bash
npm run verify:message-cross-node -- --exercise --confirm-test-send
```

In the Render dashboard, confirm exactly two live instances, then change
Compute > Manual Scaling from 2 to 1 and save. Type `SCALE_TO_ONE` in the
terminal only after saving. This confirms the **operator's action**, not the
result. The verifier accepts either instance being removed, but still requires
one observed stream to close and the other original process to remain live
before it sends a test message. Do not use Render's `Restart service` action
for this test: it restarts all instances of a scaled service, so it cannot
demonstrate a surviving node.

After the run, restore the original instance count immediately. Check Render
Events/instances, `/api/health`, message availability in both test accounts,
and the message replay status. Keep the event/timestamp evidence with the
verifier's boolean-only result. If the POST outcome is unknown, inspect the
test-account history before any new run; a new run uses a new idempotency key.
Unset the five environment variables when done.

## Failure behavior

`NODE_EVIDENCE_UNAVAILABLE`, `TWO_INSTANCES_NOT_OBSERVED`, or
`MIXED_DEPLOY_REVISION` means no credible topology proof. A wrong scale-down
confirmation, an SSE that stays open, or a changed survivor boot ID stops before the
test send. `SEND_OUTCOME_UNKNOWN` does not retry.
`EXACTLY_ONCE_REPLAY_NOT_PROVEN` means a completed send is not enough to claim
durable recovery; inspect replay and canonical history before rerunning.
`OPS_TOKEN_NOT_ACCEPTED` means the ops token was rejected by the direct API
origin. `nodeEvidence` reports only whether each node header was present or a
local placeholder; it never prints header values or credentials.
