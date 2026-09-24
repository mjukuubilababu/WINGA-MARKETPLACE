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
- No accounts are created, messages sent/deleted, or other sessions revoked.
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
and discarded after inspecting event names, not persisted.

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
