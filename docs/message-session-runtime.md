# Authenticated SSE session revocation probe

This checks the deployed Node/SSE session hardening. It does not implement or
certify Phoenix, E2EE, cryptographic devices, cross-node failover or delivery
acknowledgements.

## Scope and consent

Use two separate, fresh logins of the SAME dedicated marketplace test account,
for example a normal browser and an incognito window. Both must already exist.
Do not use a staff account. Avoid unrelated message activity during the probe.

- The REVOKE token is a disposable session that this command WILL log out.
- The CONTROL token is a different session of that account which must remain valid.
- Without `--revoke-probe-session` the command refuses before any HTTP request.
- In the default idle mode, no accounts are created, messages sent/deleted, or other sessions revoked.
- Never paste tokens into chat, screenshots, source code or shell command arguments.

On your own device, retrieve each test session's `winga_auth` cookie value from
browser developer tools, Application/Storage > Cookies for the Winga domain.
HttpOnly cookies are not available through `document.cookie`. Enter ONLY the
cookie value in the hidden prompts below, not the entire Cookie header.

Run in Git Bash:

```bash
cd ~/Desktop/Winga-App/active-work
(
  trap 'unset WINGA_REVOKE_SESSION_TOKEN WINGA_CONTROL_SESSION_TOKEN' EXIT
  read -r -s -p "Disposable session to LOG OUT: " WINGA_REVOKE_SESSION_TOKEN
  printf '\n'
  read -r -s -p "Different session to KEEP: " WINGA_CONTROL_SESSION_TOKEN
  printf '\n'
  export WINGA_REVOKE_SESSION_TOKEN WINGA_CONTROL_SESSION_TOKEN
  node scripts/verify-message-session-runtime.js --revoke-probe-session
)
```

Unset `WINGA_SENDER_SESSION_TOKEN` and `WINGA_TEST_RECEIVER` for idle-only mode.
The CLI targets `https://winga-pflp.onrender.com` directly and disallows redirects.
The existing read-only `verify-message-replay-runtime.js` remains unchanged.

## Checks

1. Authenticated, no-store `/api/auth/sessions` reads prove that both distinct
   current session IDs belong to the same account. This endpoint does not rotate
   sessions, unlike `/api/auth/session`.
2. Both authenticated SSE streams must produce a complete welcome frame.
3. A canonical CSRF-protected logout targets only the REVOKE token.
4. Its already-open stream must close cleanly, without further events. A reset,
   timeout, network error or local abort is NOT accepted as proof.
5. The control stream must produce a heartbeat after logout acknowledgement and
   remain open; its session listing must still identify the control session as
   current and must no longer contain the revoked session.
6. The revoked token must receive HTTP 401 on session listing.

Allow roughly one heartbeat interval (25 seconds), with a 65-second overall
deadline. Streams close and local resources are cleaned up on success or failure.
Only aggregate booleans/error codes are printed. Tokens, session IDs, audit data,
private message bodies and SSE payloads are never printed. Stream data is bounded
and discarded after inspecting event names in idle mode, not persisted.

## Interpreting results

Success reports `idleRevocationProven: true` and `controlSessionAlive: true`.
It deliberately reports `messageDeliveryRevocationProven: false` and
`crossNodeFailoverProven: false`: this probe sends no message and does not control
node placement. Real message-after-logout protection is covered separately by
the local HTTP integration test; production verification still needs its own
authorized scenario.

On failure, inspect `errorCode`, `logoutAttempted` and `logoutConfirmed`.
An attempted logout may have succeeded even when acknowledgement was lost. Do
not reuse the disposable session blindly; create a fresh login before retrying.
An event observed during the logout window is treated conservatively as a failed
proof, including potentially in-flight events. Use idle test sessions and repeat.

The control login remains usable, but both verifier-created SSE connections are
closed during cleanup. This is not a logout of the control session.

## Optional message-after-logout proof

This mode adds ONE synthetic private message through canonical `POST /api/messages`
AFTER logout acknowledgement. Use two dedicated test accounts and three distinct
browser contexts:

- Account A: normal Chrome and Chrome Incognito, giving two different receiver sessions.
- Account B: another browser such as Edge, giving the sender session.
- Use a fresh disposable receiver login: the token revoked in the previous test is invalid.
- Enter account A's exact lowercase USERNAME, not its shop name or display name.
  Check this carefully: it is the explicitly selected recipient of the test message.

The additional `--send-probe-message` flag is mandatory. Merely supplying a sender
token cannot cause a send. Both accounts/sessions are preflighted, sender session
IDs must not overlap with the receiver's, and the backend must advertise
`durableMessageRetries: true`. Otherwise the probe refuses before logout/send.
The session-list API does not expose usernames; the operator supplies the intended
receiver username. A typo can target that named account with the synthetic message
but cannot produce a passing proof without reception on account A's control stream.

Run in Git Bash (tokens go only into hidden local prompts):

```bash
cd ~/Desktop/Winga-App/active-work
(
  trap 'unset WINGA_REVOKE_SESSION_TOKEN WINGA_CONTROL_SESSION_TOKEN WINGA_SENDER_SESSION_TOKEN WINGA_TEST_RECEIVER' EXIT
  read -r -s -p "Account A session to LOG OUT: " WINGA_REVOKE_SESSION_TOKEN
  printf '\n'
  read -r -s -p "Account A session to KEEP: " WINGA_CONTROL_SESSION_TOKEN
  printf '\n'
  read -r -s -p "Account B sender session: " WINGA_SENDER_SESSION_TOKEN
  printf '\n'
  read -r -p "Account A exact username: " WINGA_TEST_RECEIVER
  export WINGA_REVOKE_SESSION_TOKEN WINGA_CONTROL_SESSION_TOKEN WINGA_SENDER_SESSION_TOKEN WINGA_TEST_RECEIVER
  node scripts/verify-message-session-runtime.js --revoke-probe-session --send-probe-message
)
```

The message says `Winga session security test. No action required.` followed by a
random probe identifier. It remains in the test accounts' canonical history and
may produce the ordinary notification/unread count. The probe does not delete it,
mark it read, open an order or trigger a payment. No real private content is sent.

One random logical message ID is sent in both the idempotency header and body.
There is no automatic POST retry. A lost response sets `messageSendAttempted: true`
without claiming confirmation: check test-account history before starting another
run. A manual new run intentionally uses a new ID and may leave another test message.

The control SSE stream must receive the exact synthetic text and receiver, and its
message ID and sender must match the canonical POST acknowledgement. Events arriving
before the acknowledgement are supported. Other private messages cannot satisfy
the proof. Only matching synthetic references are temporarily retained in memory;
no message content, IDs or identities are printed. The revoked stream must close
cleanly without any bytes after the logout window begins, including partial SSE
frames or comments. Reset/timeout is inconclusive.

Success reports `messageDeliveryRevocationProven: true` and
`messageSendConfirmed: true`. `idleRevocationProven: false` in THIS mode means the
test used a message, not an idle-only scenario; it does not invalidate an earlier
idle proof. `crossNodeFailoverProven` remains false. This verifies the observed
message-after-logout flow, not per-device durable receipt, cryptographic identity,
E2EE or forced multi-node failover. It does not assert which event caused closure
if the revoked connection had already closed before the message was sent.
