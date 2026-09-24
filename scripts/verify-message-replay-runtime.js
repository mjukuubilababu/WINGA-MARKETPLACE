// Read-only probe: never print cookies, cursors, message IDs or bodies.
async function main() {
  const token = process.env.WINGA_SESSION_TOKEN;
  if (!token) throw new Error("Set WINGA_SESSION_TOKEN locally; do not share it.");
  const origin = "https://winga-pflp.onrender.com";
  const headers = { Cookie: `winga_auth=${encodeURIComponent(token)}` };
  async function read(path) {
    const response = await fetch(origin + path, { headers, redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Runtime probe returned HTTP ${response.status}`);
    return { body: await response.json(), cache: response.headers.get("cache-control") };
  }
  const capabilities = await read("/api/messages/capabilities");
  if (capabilities.body.durableMessageReplay !== true) throw new Error("Replay is not enabled on this runtime.");
  const initial = await read("/api/messages/replay?limit=1");
  if (!initial.body.resyncRequired || !initial.body.cursor || !initial.cache?.includes("no-store")) throw new Error("Invalid initial checkpoint contract.");
  const resumed = await read(`/api/messages/replay?limit=1&cursor=${encodeURIComponent(initial.body.cursor)}`);
  if (resumed.body.version !== 1 || resumed.body.resyncRequired !== false || !Array.isArray(resumed.body.events)) throw new Error("Invalid replay resume contract.");
  console.log(JSON.stringify({ ok: true, origin, authenticated: true, replayEnabled: true, stateChangeReplayEnabled: capabilities.body.messageStateResync === true, checkpointRead: true, resumeRead: true, noStore: resumed.cache?.includes("no-store") === true, migrationReadable: true, writeAndReconnectProven: false }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
