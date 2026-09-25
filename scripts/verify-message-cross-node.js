const { randomUUID } = require("node:crypto");
const readline = require("node:readline/promises");

class ProbeError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function requireCheck(condition, code) {
  if (!condition) throw new ProbeError(code);
}

function tokenJar(token) {
  let auth = String(token || "").trim();
  return {
    cookie() { return `winga_auth=${encodeURIComponent(auth)}`; },
    update(response) {
      const match = response.headers.get("set-cookie")?.match(/(?:^|,\s*)winga_auth=([^;,]+)/);
      if (match) auth = decodeURIComponent(match[1]);
    }
  };
}

async function waitFor(predicate, timeoutMs, code, signal) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    requireCheck(!signal.aborted && Date.now() < deadline, code);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function verifyCrossNodeFailover({
  origin, receiverToken, senderToken, receiverUsername, opsToken,
  exercise = false, allowTestSend = false, confirmDrain,
  fetchImpl = fetch, sampleLimit = 20, drainTimeoutMs = 90000
} = {}) {
  const result = {
    ok: false, preflightReady: false, twoInstancesObserved: false,
    drainConfirmed: false, oldStreamClosed: false, survivorObserved: false,
    messageSendAttempted: false, messageSendConfirmed: false,
    replayedOnce: false, crossNodeFailoverProven: false
  };
  const streams = [];
  const controller = new AbortController();
  const jars = { receiver: tokenJar(receiverToken), sender: tokenJar(senderToken) };
  const safeOrigin = String(origin || "").replace(/\/$/, "");
  try {
    const parsedOrigin = new URL(safeOrigin);
    requireCheck(parsedOrigin.protocol === "https:" && parsedOrigin.pathname === "/"
      && !parsedOrigin.search && !parsedOrigin.hash, "HTTPS_ORIGIN_REQUIRED");
    requireCheck(receiverToken && senderToken && receiverToken !== senderToken
      && opsToken && /^[a-z0-9_.-]{1,40}$/.test(String(receiverUsername || "")), "PROBE_CREDENTIALS_REQUIRED");
    requireCheck(!exercise || (allowTestSend && typeof confirmDrain === "function"), "EXPLICIT_EXERCISE_CONSENT_REQUIRED");

    async function request(path, jar, options = {}) {
      const { stream = false, ...fetchOptions } = options;
      const response = await fetchImpl(safeOrigin + path, {
        ...fetchOptions,
        redirect: "error",
        headers: { Cookie: jar.cookie(), ...(fetchOptions.headers || {}) },
        signal: stream ? controller.signal : AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
      });
      jar.update(response);
      return response;
    }
    async function read(path, jar) {
      const response = await request(path, jar);
      requireCheck(response.status === 200, "PREFLIGHT_HTTP_FAILED");
      return { body: await response.json(), cache: response.headers.get("cache-control") || "" };
    }
    async function openStream() {
      const response = await request("/api/messages/stream", jars.receiver, {
        stream: true,
        headers: { "X-Ops-Health-Token": opsToken }
      });
      requireCheck(response.status === 200 && response.body
        && response.headers.get("content-type")?.includes("text/event-stream"), "STREAM_OPEN_FAILED");
      const instance = response.headers.get("x-winga-ops-instance") || "";
      const boot = response.headers.get("x-winga-ops-boot") || "";
      const commit = response.headers.get("x-winga-ops-commit") || "";
      if (!instance || instance === "local" || !boot || !commit || commit === "local") {
        await response.body.cancel().catch(() => {});
        throw new ProbeError("NODE_EVIDENCE_UNAVAILABLE");
      }
      const reader = response.body.getReader();
      const state = { instance, boot, commit, welcome: false, closed: false, cancelled: false, parserFailed: false };
      streams.push(state);
      state.task = (async () => {
        const decoder = new TextDecoder();
        let buffer = "", event = "";
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            buffer += decoder.decode(part.value, { stream: true });
            requireCheck(buffer.length <= 65536, "STREAM_FRAME_TOO_LARGE");
            let newline;
            while ((newline = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, newline).replace(/\r$/, "");
              buffer = buffer.slice(newline + 1);
              if (line.startsWith("event:")) event = line.slice(6).trim();
              if (!line) {
                if (event === "welcome") state.welcome = true;
                event = "";
              }
            }
          }
        } catch (error) {
          if (error instanceof ProbeError) state.parserFailed = true;
          // A terminated node can reset its active stream rather than end it cleanly.
        } finally { state.closed = true; }
      })();
      state.close = async () => {
        state.cancelled = true;
        await reader.cancel().catch(() => {});
        await state.task;
      };
      await waitFor(() => state.welcome || state.closed, 10000, "WELCOME_TIMEOUT", controller.signal);
      requireCheck(state.welcome && !state.closed, "WELCOME_FAILED");
      return state;
    }

    const receiver = await read("/api/auth/session", jars.receiver);
    const sender = await read("/api/auth/session", jars.sender);
    requireCheck(receiver.body.username === receiverUsername
      && sender.body.username && sender.body.username !== receiverUsername, "DISTINCT_TEST_ACCOUNTS_REQUIRED");
    const receiverCapabilities = await read("/api/messages/capabilities", jars.receiver);
    const senderCapabilities = await read("/api/messages/capabilities", jars.sender);
    requireCheck(receiverCapabilities.body.durableMessageReplay === true
      && senderCapabilities.body.durableMessageRetries === true, "DURABLE_MESSAGING_REQUIRED");

    const original = await openStream();
    let survivor = null;
    for (let attempt = 0; attempt < sampleLimit && !survivor; attempt += 1) {
      const sampled = await openStream();
      if (sampled.instance !== original.instance) survivor = { instance: sampled.instance, boot: sampled.boot, commit: sampled.commit };
      await sampled.close();
    }
    requireCheck(survivor, "TWO_INSTANCES_NOT_OBSERVED");
    requireCheck(survivor.commit === original.commit, "MIXED_DEPLOY_REVISION");
    requireCheck(!original.closed, "ORIGINAL_STREAM_CLOSED_DURING_PREFLIGHT");
    result.twoInstancesObserved = true;
    result.preflightReady = true;
    if (!exercise) return { ...result, ok: true, crossNodeFailoverProven: false };

    const baseline = await read("/api/messages/replay?limit=1", jars.receiver);
    requireCheck(baseline.body.version === 1 && baseline.body.resyncRequired === true
      && typeof baseline.body.cursor === "string" && baseline.body.cursor
      && baseline.cache.includes("no-store"), "REPLAY_BASELINE_INVALID");
    requireCheck(!original.closed, "TARGET_STREAM_CLOSED_BEFORE_DRAIN");
    const confirmed = await confirmDrain(original.instance);
    requireCheck(confirmed === original.instance, "TARGET_DRAIN_NOT_CONFIRMED");
    result.drainConfirmed = true;
    await waitFor(() => original.closed, drainTimeoutMs, "TARGET_STREAM_DID_NOT_CLOSE", controller.signal);
    requireCheck(!original.cancelled && !original.parserFailed, "TARGET_STREAM_INVALID_FAILURE");
    result.oldStreamClosed = true;

    const next = await openStream();
    requireCheck(next.instance === survivor.instance && next.boot === survivor.boot,
      "SURVIVING_NODE_NOT_OBSERVED");
    result.survivorObserved = true;
    await next.close();

    const csrf = await request("/api/auth/csrf-token", jars.sender);
    requireCheck(csrf.status === 200, "CSRF_PREFLIGHT_FAILED");
    const csrfBody = await csrf.json();
    const csrfCookie = csrf.headers.get("set-cookie")?.match(/(?:^|,\s*)winga_csrf=([^;,]+)/)?.[1];
    requireCheck(csrfBody.csrfToken && csrfCookie, "CSRF_CONTRACT_INVALID");
    const id = randomUUID();
    const message = `Winga cross-node replay test. No action required. ${id}`;
    result.messageSendAttempted = true;
    let sent;
    try {
      sent = await request("/api/messages", jars.sender, {
        method: "POST",
        headers: {
          Cookie: `${jars.sender.cookie()}; winga_csrf=${csrfCookie}`,
          "X-CSRF-Token": csrfBody.csrfToken,
          "Content-Type": "application/json",
          "Idempotency-Key": id
        },
        body: JSON.stringify({ receiverId: receiverUsername, message, clientMessageId: id })
      });
    } catch (_error) { throw new ProbeError("SEND_OUTCOME_UNKNOWN"); }
    requireCheck(sent.status === 200, "TEST_MESSAGE_NOT_ACCEPTED");
    const accepted = await sent.json();
    requireCheck(accepted.id && accepted.message === message
      && accepted.receiverId === receiverUsername && accepted.senderId === sender.body.username, "TEST_MESSAGE_ACK_INVALID");
    result.messageSendConfirmed = true;

    const reconnected = await openStream();
    requireCheck(reconnected.instance === survivor.instance && reconnected.boot === survivor.boot,
      "RECONNECTED_TO_DIFFERENT_NODE");
    let cursor = baseline.body.cursor;
    let matches = 0, exhausted = false;
    for (let page = 0; page < 5; page += 1) {
      const replay = await read(`/api/messages/replay?limit=50&cursor=${encodeURIComponent(cursor)}`, jars.receiver);
      requireCheck(replay.cache.includes("no-store") && replay.body.version === 1
        && replay.body.resyncRequired === false && Array.isArray(replay.body.events)
        && typeof replay.body.cursor === "string" && replay.body.cursor !== cursor, "REPLAY_PAGE_INVALID");
      matches += replay.body.events.filter((event) => event.type === "message_created"
        && event.messageId === accepted.id).length;
      cursor = replay.body.cursor;
      if (!replay.body.hasMore) { exhausted = true; break; }
    }
    requireCheck(exhausted && matches === 1, "EXACTLY_ONCE_REPLAY_NOT_PROVEN");
    result.replayedOnce = true;
    return { ...result, ok: true, crossNodeFailoverProven: true };
  } catch (error) {
    return { ...result, errorCode: error instanceof ProbeError ? error.code : "PROBE_REQUEST_FAILED" };
  } finally {
    controller.abort();
    await Promise.all(streams.map((stream) => stream.close?.().catch(() => {})));
  }
}

if (require.main === module) {
  const exercise = process.argv.includes("--exercise");
  (async () => {
    let rl;
    try {
      if (exercise && !process.stdin.isTTY) throw new ProbeError("INTERACTIVE_OPERATOR_REQUIRED");
      if (exercise) rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const result = await verifyCrossNodeFailover({
        origin: process.env.WINGA_FAILOVER_ORIGIN,
        receiverToken: process.env.WINGA_RECEIVER_SESSION_TOKEN,
        senderToken: process.env.WINGA_SENDER_SESSION_TOKEN,
        receiverUsername: process.env.WINGA_TEST_RECEIVER,
        opsToken: process.env.OPS_HEALTH_TOKEN,
        exercise,
        allowTestSend: process.argv.includes("--confirm-test-send"),
        confirmDrain: exercise ? async (instance) => {
          const answer = await rl.question(`Drain the named test instance outside this script, then type ${instance} to confirm: `);
          return answer.trim();
        } : undefined
      });
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof ProbeError ? error.code : "PROBE_SETUP_FAILED");
      process.exitCode = 1;
    } finally { rl?.close(); }
  })();
}

module.exports = { verifyCrossNodeFailover };
