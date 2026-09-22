(() => {
  function createOfflineQueueTools(deps = {}) {
    const queueKeyPrefix = String(deps.queueKeyPrefix || "winga-offline-action-queue");
    const readSession = typeof deps.readSession === "function" ? deps.readSession : () => null;
    const safeStorageGet = typeof deps.safeStorageGet === "function" ? deps.safeStorageGet : () => null;
    const safeStorageSet = typeof deps.safeStorageSet === "function" ? deps.safeStorageSet : () => false;
    const safeStorageRemove = typeof deps.safeStorageRemove === "function" ? deps.safeStorageRemove : () => {};
    const clone = typeof deps.clone === "function" ? deps.clone : (value) => JSON.parse(JSON.stringify(value));
    const getDefaultAdapter = typeof deps.getDefaultAdapter === "function" ? deps.getDefaultAdapter : () => null;
    const getNavigator = typeof deps.getNavigator === "function" ? deps.getNavigator : () => globalThis.navigator;
    const dispatchEvent = typeof deps.dispatchEvent === "function" ? deps.dispatchEvent : () => {};
    const activeFlushes = new Map();
    const activeMessageSends = new Set();

    function getOfflineActionQueueStorageKey(session = readSession()) {
      const username = String(session?.username || "").trim();
      if (!username) {
        return "";
      }
      return `${queueKeyPrefix}:${username}`;
    }

    function readOfflineActionQueue(session = readSession()) {
      const storageKey = getOfflineActionQueueStorageKey(session);
      if (!storageKey) {
        return [];
      }
      const raw = safeStorageGet(storageKey);
      if (!raw) {
        return [];
      }
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error();
        return parsed.filter(Boolean);
      } catch (_error) {
        throw new Error("Saved message queue could not be read. It has not been replaced.");
      }
    }

    function saveOfflineActionQueue(queue = [], session = readSession()) {
      const storageKey = getOfflineActionQueueStorageKey(session);
      if (!storageKey) {
        return;
      }
      if (!Array.isArray(queue) || !queue.length) {
        safeStorageRemove(storageKey);
        return;
      }
      if (safeStorageSet(storageKey, JSON.stringify(queue)) !== true) {
        throw new Error("Message could not be saved on this device. Keep your draft and try again.");
      }
    }

    function isLikelyOfflineActionError(error) {
      const status = Number(error?.status || 0);
      if (status) return status === 408 || status === 429 || status >= 500;
      if (error?.retryable === true) return true;
      const message = String(error?.message || "").toLowerCase();
      return Boolean(
        error?.name === "TypeError"
        || message.includes("failed to fetch")
        || message.includes("network")
        || message.includes("offline")
        || message.includes("fetch")
        || message.includes("request took too long")
      );
    }

    function queueOfflineMessageAction(payload, session = readSession()) {
      const username = String(session?.username || "").trim();
      if (!username) {
        throw new Error("Ingia kwanza kabla ya kutuma ujumbe.");
      }
      if (!payload?.receiverId || (!payload?.message && !(Array.isArray(payload?.productItems) && payload.productItems.length))) {
        throw new Error("Receiver na ujumbe au bidhaa vinahitajika.");
      }

      const queue = readOfflineActionQueue(session);
      const createdAt = new Date().toISOString();
      const queuedAction = {
        id: `offline-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: "sendMessage",
        payload: clone(payload),
        createdAt,
        attempts: 0
      };
      queue.push(queuedAction);
      saveOfflineActionQueue(queue, session);
      dispatchEvent("winga:offline-actions-updated", {
        count: queue.length,
        username
      });
      return {
        id: queuedAction.id,
        senderId: username,
        receiverId: payload.receiverId,
        messageType: payload.messageType || (Array.isArray(payload.productItems) && payload.productItems.length > 1 ? "product_inquiry" : Array.isArray(payload.productItems) && payload.productItems.length === 1 ? "product_reference" : "text"),
        productId: payload.productId || "",
        productName: payload.productName || "",
        productItems: Array.isArray(payload.productItems) ? payload.productItems : [],
        replyToMessageId: payload.replyToMessageId || "",
        message: payload.message || "",
        timestamp: createdAt,
        createdAt,
        updatedAt: createdAt,
        deliveredAt: "",
        readAt: "",
        isDelivered: false,
        isRead: false,
        isQueued: true
      };
    }

    async function sendPersistedMessage(payload, adapter, session = readSession()) {
      if (!payload?.clientMessageId || typeof adapter?.sendMessage !== "function") {
        throw new Error("Durable message retry support is required.");
      }
      const queued = queueOfflineMessageAction(payload, session);
      const owner = session.username;
      activeMessageSends.add(queued.id);
      const updateItem = (change) => {
        const current = readOfflineActionQueue(session);
        saveOfflineActionQueue(current.flatMap(item => item.id === queued.id ? change(item) : [item]), session);
      };
      const run = async () => {
        if (readSession()?.username !== owner || getNavigator()?.onLine === false) return queued;
        let result;
        try {
          result = await adapter.sendMessage(payload);
          if (!result?.id || result.isQueued || result.skipped) {
            throw Object.assign(new Error("Message acceptance was not confirmed."), { retryable: true });
          }
        } catch (error) {
          const retryable = isLikelyOfflineActionError(error);
          updateItem(item => [{ ...item, attempts: Number(item.attempts || 0) + 1,
            status: retryable ? "QUEUED" : "FAILED",
            lastErrorCode: String(error?.code || "message_send_failed").slice(0, 80) }]);
          if (retryable) return queued;
          throw error;
        }
        // An accepted send stays successful even if local cleanup fails. Its ID
        // remains replay-safe when the retained entry is reconciled later.
        try { updateItem(() => []); } catch (_error) { /* Preserve accepted result. */ }
        return result;
      };
      try {
        const locks = getNavigator()?.locks;
        return await (locks?.request ? locks.request(`winga-offline-send:${owner}`, run) : run());
      } finally {
        activeMessageSends.delete(queued.id);
      }
    }

    function getPendingMessages(receiverId) {
      return readOfflineActionQueue().filter(item => item.type === "sendMessage"
        && item.payload?.receiverId === receiverId && !activeMessageSends.has(item.id));
    }

    async function flushOfflineActionQueue(adapter = null, retryId = "") {
      const activeAdapter = adapter || getDefaultAdapter();
      if (!activeAdapter || typeof activeAdapter.sendMessage !== "function") {
        return 0;
      }
      const session = readSession();
      if (!session?.username || getNavigator()?.onLine === false) {
        return 0;
      }

      const owner = session.username;
      if (activeFlushes.has(owner)) return activeFlushes.get(owner);
      const run = async () => {
        const queue = readOfflineActionQueue(session);
        let flushedCount = 0;
        let failedCount = 0;
        // Re-read before each mutation so arrivals during an awaited send survive.
        const updateItem = (id, change) => {
          const current = readOfflineActionQueue(session);
          saveOfflineActionQueue(current.flatMap(item => item.id === id ? change(item) : [item]), session);
        };
        for (const item of queue) {
          if (readSession()?.username !== owner) break;
          if (!item || item.type !== "sendMessage" || activeMessageSends.has(item.id)) continue;
          if (retryId ? item.id !== retryId : item.status === "FAILED") continue;
          try {
            const payload = activeAdapter.prepareMessage ? await activeAdapter.prepareMessage(item.payload) : item.payload;
            updateItem(item.id, current => [{ ...current, payload, status: "QUEUED" }]);
            if (readSession()?.username !== owner) break;
            const result = await activeAdapter.sendMessage(payload);
            if (!result?.id || result.isQueued || result.skipped) throw new Error("Message acceptance was not confirmed.");
            updateItem(item.id, () => []);
            flushedCount += 1;
          } catch (error) {
            const retryable = isLikelyOfflineActionError(error);
            updateItem(item.id, current => [{
              ...current, attempts: Number(current.attempts || 0) + 1,
              status: retryable ? "QUEUED" : "FAILED",
              lastErrorCode: String(error?.code || "message_send_failed").slice(0, 80)
            }]);
            if (!retryable) failedCount += 1;
            if (retryable || readSession()?.username !== owner) break;
          }
        }
        const remaining = readOfflineActionQueue(session).length;
        if (flushedCount || failedCount) dispatchEvent("winga:offline-actions-flushed", {
          count: flushedCount, remaining, failed: failedCount, username: owner
        });
        return flushedCount;
      };
      const locks = getNavigator()?.locks;
      const flush = locks?.request ? locks.request(`winga-offline-send:${owner}`, run) : run();
      activeFlushes.set(owner, flush);
      try { return await flush; } finally { activeFlushes.delete(owner); }
    }

    return {
      getOfflineActionQueueStorageKey,
      readOfflineActionQueue,
      saveOfflineActionQueue,
      isLikelyOfflineActionError,
      queueOfflineMessageAction,
      sendPersistedMessage,
      getPendingMessages,
      flushOfflineActionQueue
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.offlineQueue = window.WingaModules.api.offlineQueue || {};
  window.WingaModules.api.offlineQueue.createOfflineQueueTools = createOfflineQueueTools;
})();
