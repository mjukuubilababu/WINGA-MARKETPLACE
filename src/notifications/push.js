(() => {
  function createPushModule({ getWindow = () => window, getSession, request, openConversation, onUnavailable = () => {} }) {
    const win = getWindow();
    const nav = win.navigator;
    let queue = Promise.resolve();
    let epoch = 0;
    let active = false;
    let pendingId = "";
    let resolving = false;
    let retryTimer;
    const validId = id => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id);
    const sessionKey = () => String(getSession()?.username || "") + ":" + String(getSession()?.sessionId || getSession()?.token || "");
    async function registration() {
      if (!nav?.serviceWorker || !win.PushManager) return null;
      let timer;
      try {
        return await Promise.race([nav.serviceWorker.ready, new Promise(resolve => { timer = win.setTimeout(() => resolve(null), 10000); })]);
      } finally { win.clearTimeout(timer); }
    }
    function bytes(key) {
      return Uint8Array.from(win.atob(key.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
    }
    function sameKey(left, right) {
      const value = left ? new Uint8Array(left) : [];
      return value.length === right.length && value.every((byte, index) => byte === right[index]);
    }
    async function resolvePending() {
      if (!pendingId || !getSession()?.username || resolving) return;
      const key = sessionKey();
      const id = pendingId;
      resolving = true;
      try {
        const context = await request(`resolve?id=${encodeURIComponent(id)}`);
        if (key !== sessionKey() || pendingId !== id) return;
        if (!context?.withUser && !/^[a-f0-9-]{36}$/.test(context?.roomId||'')) throw new Error("Invalid push target"); // i18n-gate: allow -- internal diagnostic
        pendingId = "";
        await openConversation(context);
      } catch (error) {
        if (key === sessionKey() && [400, 403, 404].includes(error.status)) {
          pendingId = "";
          onUnavailable();
        }
      } finally { resolving = false; }
    }
    function receive(id) {
      if (!validId(id)) return;
      pendingId = id;
      resolvePending();
    }
    function readHash() {
      const match = /^#winga-push=([a-f0-9-]{36})$/.exec(win.location.hash);
      if (!match) return;
      win.history.replaceState(win.history.state, "", win.location.pathname + win.location.search);
      receive(match[1]);
    }
    function sync() {
      win.clearTimeout(retryTimer);
      resolvePending();
      const currentEpoch = epoch;
      const key = sessionKey();
      queue = queue.catch(() => {}).then(async () => {
        if (!getSession()?.username || currentEpoch !== epoch || key !== sessionKey()) return false;
        if (win.Notification?.permission !== "granted") { active = false; return false; }
        if (!nav?.serviceWorker || !win.PushManager) return false;
        const reg = await registration();
        if (!reg?.pushManager) throw new Error("Push worker not ready"); // i18n-gate: allow -- internal retry diagnostic
        const config = await request("config");
        if (!config?.supported || !config.publicKey || currentEpoch !== epoch || key !== sessionKey()) return false;
        const publicKey = bytes(config.publicKey);
        let subscription = await reg.pushManager.getSubscription();
        if (subscription && !sameKey(subscription.options?.applicationServerKey, publicKey)) {
          await subscription.unsubscribe();
          subscription = null;
        }
        if (!subscription) subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
        if (currentEpoch !== epoch || key !== sessionKey()) { await subscription.unsubscribe(); return false; }
        try {
          await request("subscription", { subscription: subscription.toJSON(), locale: (win.document.documentElement.lang || "sw").split("-")[0] }, "POST");
        } catch (error) {
          // An origin-scoped browser subscription must not move between live accounts.
          if (error.status === 409) await subscription.unsubscribe();
          throw error;
        }
        active = currentEpoch === epoch && key === sessionKey();
        return active;
      });
      return queue.catch(error => {
        active = false;
        if (currentEpoch === epoch && key === sessionKey() && getSession()?.username) {
          retryTimer = win.setTimeout(() => sync().catch(() => {}), 60000);
        }
        throw error;
      });
    }
    function logout() {
      epoch += 1;
      win.clearTimeout(retryTimer);
      active = false;
      pendingId = "";
      queue = queue.catch(() => {}).then(async () => {
        const reg = await registration();
        const subscription = await reg?.pushManager?.getSubscription();
        await subscription?.unsubscribe();
        const notifications = await reg?.getNotifications?.() || [];
        notifications.forEach(notification => notification.close());
      });
      return queue;
    }
    nav?.serviceWorker?.addEventListener("message", event => {
      if (event.data?.type === "winga-push-open") receive(event.data.id);
    });
    nav?.serviceWorker?.addEventListener("controllerchange", () => sync().catch(() => {}));
    win.document.addEventListener("visibilitychange", () => {
      if (win.document.visibilityState === "visible") sync().catch(() => {});
    });
    win.addEventListener("hashchange", readHash);
    win.addEventListener("online", () => sync().catch(() => {}));
    readHash();
    return { sync, logout, receive, get active() { return active; } };
  }
  window.WingaModules = window.WingaModules || {};
  window.WingaModules.notifications = window.WingaModules.notifications || {};
  window.WingaModules.notifications.createPushModule = createPushModule;
})();
