// SSE is only a wake-up path. On failure, reconnect/replay restores canonical state.
function createAuthorizedRealtimeClient({
  response, authorize, onClose = () => {}, heartbeatMs = 25000,
  authorizationTimeoutMs = 5000, maxPendingEvents = 32, maxPendingBytes = 262144
}) {
  let closed = false;
  let draining = false;
  let pendingBytes = 0;
  const queue = [];
  let heartbeat;
  let cancelAuthorization;
  function close() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    queue.length = 0;
    pendingBytes = 0;
    cancelAuthorization?.();
    response.removeListener("close", close);
    response.removeListener("error", close);
    onClose();
    if (!response.writableEnded && !response.destroyed) response.end();
  }
  function checkAuthorization() {
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cancelAuthorization = null;
        resolve(value === true);
      };
      const timer = setTimeout(() => finish(false), authorizationTimeoutMs);
      cancelAuthorization = () => finish(false);
      Promise.resolve().then(authorize).then(finish, () => finish(false));
    });
  }
  async function drain() {
    if (draining || closed) return;
    draining = true;
    try {
      while (queue.length && !closed) {
        if (!await checkAuthorization()) { close(); break; }
        if (closed) break;
        const item = queue.shift();
        pendingBytes -= item.bytes;
        if (response.destroyed || response.writableEnded || !response.write(item.chunk)) {
          close();
          break;
        }
      }
    } catch (_error) {
      close();
    } finally { draining = false; }
  }
  function send(event, payload) {
    if (closed) return;
    const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    const bytes = Buffer.byteLength(chunk);
    if (queue.length >= maxPendingEvents || pendingBytes + bytes > maxPendingBytes) {
      close();
      return;
    }
    queue.push({ chunk, bytes });
    pendingBytes += bytes;
    void drain();
  }
  response.on("close", close);
  response.on("error", close);
  heartbeat = setInterval(() => send("ping", { time: new Date().toISOString() }), heartbeatMs);
  heartbeat.unref?.();
  return { send, close };
}

module.exports = { createAuthorizedRealtimeClient };
