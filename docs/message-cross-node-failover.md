# Controlled Cross-Node Message Failover Probe

Status: verifier prepared; no production node has been drained by this change.

## What it proves

The preflight uses two test-account sessions and the existing ops token to open
authenticated SSE streams. Ops-authorized SSE responses include Render's
instance ID, a process boot ID, and the deployed Git commit. Normal SSE clients
receive none of these headers. Preflight requires two distinct live instance IDs
at the same commit and checks durable retry and replay capabilities. It does not
send a message or perform a failover.

The optional exercise holds a receiver stream on instance A, records the
receiver's durable replay checkpoint, and pauses for a human operator to drain
that **named** instance externally. It refuses to send if A does not close or
the previously observed instance B (same boot ID) is not available. It then
sends exactly one labelled synthetic message from the second test account,
opens a new receiver stream on B, and requires the accepted canonical message
ID to appear exactly once in bounded replay after the pre-failure checkpoint.
No retry occurs after an unknown POST outcome. The synthetic message remains in
the test accounts' history; the verifier does not delete or mark it read.

This is a controlled, operator-attested A-to-B recovery check, not a claim that
the script itself terminated A. Keep the Render instance/event timeline as
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
  window, note the starting instance count, and have a rollback operator ready.
  Do not drain production merely because preflight passed.

## Preflight (read-only commerce state)

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

The script prints the exact instance ID of A and waits. In the Render dashboard,
inspect the live instance list and perform the approved drain/scale operation.
Typing A's ID confirms the **operator's action**, not the result. The verifier
still requires A's SSE to close and the original B process to remain live before
it sends a test message. If Render removes B instead, the test fails safely with
no send. Do not use Render's `Restart service` action for this test: it restarts
all instances of a scaled service, so it cannot demonstrate a surviving B.

After the run, restore the original instance count immediately. Check Render
Events/instances, `/api/health`, message availability in both test accounts,
and the message replay status. Keep the event/timestamp evidence with the
verifier's boolean-only result. If the POST outcome is unknown, inspect the
test-account history before any new run; a new run uses a new idempotency key.
Unset the five environment variables when done.

## Failure behavior

`NODE_EVIDENCE_UNAVAILABLE`, `TWO_INSTANCES_NOT_OBSERVED`, or
`MIXED_DEPLOY_REVISION` means no credible topology proof. A wrong drain
confirmation, an SSE that stays open, or a changed B boot ID stops before the
test send. `SEND_OUTCOME_UNKNOWN` does not retry.
`EXACTLY_ONCE_REPLAY_NOT_PROVEN` means a completed send is not enough to claim
durable recovery; inspect replay and canonical history before rerunning.
