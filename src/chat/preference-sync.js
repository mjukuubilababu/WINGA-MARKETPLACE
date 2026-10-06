(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WingaConversationPreferenceSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const sessionKey = session => JSON.stringify([session?.username, session?.sessionId, session?.token]);
  function watch({ getSession, refresh, onChange = () => {}, isActive = () => true,
    document = globalThis.document, window = globalThis.window,
    setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout,
    now = Date.now, intervalMs = 15000 } = {}) {
    if (typeof getSession !== 'function' || typeof refresh !== 'function'
      || !Number.isInteger(intervalMs) || intervalMs < 15000 || intervalMs > 60000) throw Error('preference_sync_invalid');
    const initial = getSession(), key = sessionKey(initial);
    let closed = false, timer, running = false, failures = 0, lastStarted = -Infinity, retryAt = 0;
    const authenticated = () => initial?.username && initial.sessionId && sessionKey(getSession()) === key;
    const foreground = () => document?.visibilityState === 'visible' && window?.navigator?.onLine !== false;
    function close() {
      if (closed) return;
      closed = true; clearTimeout(timer);
      document?.removeEventListener('visibilitychange', wake);
      window?.removeEventListener('online', wake);
      window?.removeEventListener('focus', wake);
    }
    function schedule(delay = Math.min(60000, intervalMs * (2 ** failures))) {
      clearTimeout(timer);
      if (!closed && foreground()) timer = setTimeout(wake, delay);
    }
    async function wake() {
      if (closed) return;
      clearTimeout(timer);
      if (!authenticated()) { close(); return; }
      if (!foreground()) return;
      if (running) return;
      if (!isActive()) { schedule(); return; }
      const wait = Math.max(1000 - (now() - lastStarted), retryAt - now());
      if (wait > 0) { schedule(wait); return; }
      running = true; lastStarted = now();
      try {
        const changed = await refresh();
        if (!authenticated()) { close(); return; }
        if (closed || !foreground() || !isActive()) return;
        failures = 0; retryAt = 0;
        if (changed) await onChange();
      } catch {
        failures = Math.min(2, failures + 1);
        retryAt = now() + Math.min(60000, intervalMs * (2 ** failures));
      } finally {
        running = false;
        if (!closed) schedule();
      }
    }
    if (!authenticated()) { close(); return { wake, close }; }
    document?.addEventListener('visibilitychange', wake);
    window?.addEventListener('online', wake);
    window?.addEventListener('focus', wake);
    schedule();
    return { wake, close };
  }
  return { watch };
});
