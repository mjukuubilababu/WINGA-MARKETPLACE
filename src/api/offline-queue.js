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
        if (safeStorageGet(storageKey)) {
          throw new Error("Saved message queue could not be updated on this device.");
        }
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

    async function mutateOfflineActionQueue(session, change, requireOwner = false) {
      const owner = String(session?.username || "").trim();
      const run = () => {
        if (requireOwner && String(readSession()?.username || "").trim() !== owner) {
          throw new Error("Account changed before the message could be saved.");
        }
        const { queue, result } = change(readOfflineActionQueue(session));
        saveOfflineActionQueue(queue, session);
        return result;
      };
      // Keep storage critical sections separate from the network send lock so
      // another tab can durably enqueue while a request is still in flight.
      const locks = getNavigator()?.locks;
      return locks?.request
        ? locks.request(`winga-offline-queue:${getOfflineActionQueueStorageKey(session)}`, run)
        : run();
    }

    function updateQueuedItem(session, id, change) {
      return mutateOfflineActionQueue(session, queue => ({
        queue: queue.flatMap(item => item.id === id ? change(item) : [item])
      }));
    }

    async function queueOfflineMessageAction(payload, session = readSession()) {
      const username = String(session?.username || "").trim();
      if (!username) {
        throw new Error("Ingia kwanza kabla ya kutuma ujumbe.");
      }
      if (!payload?.receiverId || (!payload?.message && !(Array.isArray(payload?.productItems) && payload.productItems.length))) {
        throw new Error("Receiver na ujumbe au bidhaa vinahitajika.");
      }

      session = { username };
      const createdAt = new Date().toISOString();
      const queuedAction = {
        id: `offline-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: "sendMessage",
        payload: clone(payload),
        createdAt,
        attempts: 0
      };
      const count = await mutateOfflineActionQueue(session, queue => ({
        queue: [...queue, queuedAction], result: queue.length + 1
      }), true);
      dispatchEvent("winga:offline-actions-updated", {
        count,
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
      session = { username: String(session?.username || "").trim() };
      const queued = await queueOfflineMessageAction(payload, session);
      const owner = session.username;
      activeMessageSends.add(queued.id);
      const updateItem = change => updateQueuedItem(session, queued.id, change);
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
          await updateItem(item => [{ ...item, attempts: Number(item.attempts || 0) + 1,
            status: retryable ? "QUEUED" : "FAILED",
            lastErrorCode: String(error?.code || "message_send_failed").slice(0, 80) }]);
          if (retryable) return queued;
          throw error;
        }
        // An accepted send stays successful even if local cleanup fails. Its ID
        // remains replay-safe when the retained entry is reconciled later.
        try { await updateItem(() => []); } catch (_error) { /* Preserve accepted result. */ }
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
      const session = { username: String(readSession()?.username || "").trim() };
      if (!session?.username || getNavigator()?.onLine === false) {
        return 0;
      }

      const owner = session.username;
      const active = activeFlushes.get(owner);
      if (active) {
        if (!retryId || active.retryId === retryId) return active.promise;
        await active.promise;
        if (readSession()?.username !== owner || active.attemptedIds.has(retryId)) return 0;
        return flushOfflineActionQueue(activeAdapter, retryId);
      }
      const operation = { retryId, attemptedIds: new Set(), promise: null };
      const run = async () => {
        const queue = readOfflineActionQueue(session);
        let flushedCount = 0;
        let failedCount = 0;
        const updateItem = (id, change) => updateQueuedItem(session, id, change);
        for (const item of queue) {
          if (readSession()?.username !== owner || getNavigator()?.onLine === false) break;
          if (!item || item.type !== "sendMessage" || activeMessageSends.has(item.id)) continue;
          if (retryId ? item.id !== retryId : item.status === "FAILED") continue;
          operation.attemptedIds.add(item.id);
          try {
            const payload = activeAdapter.prepareMessage ? await activeAdapter.prepareMessage(item.payload) : item.payload;
            await updateItem(item.id, current => [{ ...current, payload, status: "QUEUED" }]);
            if (readSession()?.username !== owner || getNavigator()?.onLine === false) break;
            const result = await activeAdapter.sendMessage(payload);
            if (!result?.id || result.isQueued || result.skipped) {
              throw Object.assign(new Error("Message acceptance was not confirmed."), { retryable: true });
            }
          } catch (error) {
            const retryable = isLikelyOfflineActionError(error);
            await updateItem(item.id, current => [{
              ...current, attempts: Number(current.attempts || 0) + 1,
              status: retryable ? "QUEUED" : "FAILED",
              lastErrorCode: String(error?.code || "message_send_failed").slice(0, 80)
            }]);
            if (!retryable) failedCount += 1;
            if (retryable || readSession()?.username !== owner) break;
            continue;
          }
          // Cleanup failure cannot turn a confirmed acceptance into rejection.
          try { await updateItem(item.id, () => []); } catch (_error) { /* Retry retains the same logical ID. */ }
          flushedCount += 1;
        }
        const remaining = readOfflineActionQueue(session).length;
        if (flushedCount || failedCount) dispatchEvent("winga:offline-actions-flushed", {
          count: flushedCount, remaining, failed: failedCount, username: owner
        });
        return flushedCount;
      };
      const locks = getNavigator()?.locks;
      const flush = locks?.request ? locks.request(`winga-offline-send:${owner}`, run) : run();
      operation.promise = flush;
      activeFlushes.set(owner, operation);
      try { return await flush; } finally { activeFlushes.delete(owner); }
    }

    return {
      getOfflineActionQueueStorageKey,
      readOfflineActionQueue,
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
