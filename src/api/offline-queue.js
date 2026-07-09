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
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch (_error) {
        return [];
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
      safeStorageSet(storageKey, JSON.stringify(queue));
    }

    function isLikelyOfflineActionError(error) {
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

    function queueOfflineMessageAction(payload) {
      const session = readSession();
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

    async function flushOfflineActionQueue(adapter = null) {
      const activeAdapter = adapter || getDefaultAdapter();
      if (!activeAdapter || typeof activeAdapter.sendMessage !== "function") {
        return 0;
      }
      const session = readSession();
      if (!session?.username || getNavigator()?.onLine === false) {
        return 0;
      }

      const queue = readOfflineActionQueue(session);
      if (!queue.length) {
        return 0;
      }

      const remaining = [];
      let flushedCount = 0;

      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index];
        if (!item || item.type !== "sendMessage") {
          continue;
        }

        try {
          await activeAdapter.sendMessage(item.payload);
          flushedCount += 1;
        } catch (error) {
          const retryable = isLikelyOfflineActionError(error);
          if (retryable) {
            remaining.push({
              ...item,
              attempts: Number(item.attempts || 0) + 1
            });
            remaining.push(...queue.slice(index + 1));
            break;
          }
          // Non-retryable send errors are discarded so they don't get stuck forever.
        }
      }

      saveOfflineActionQueue(remaining, session);
      if (flushedCount > 0 || queue.length !== remaining.length) {
        dispatchEvent("winga:offline-actions-flushed", {
          count: flushedCount,
          remaining: remaining.length,
          username: session.username
        });
      }
      return flushedCount;
    }

    return {
      getOfflineActionQueueStorageKey,
      readOfflineActionQueue,
      saveOfflineActionQueue,
      isLikelyOfflineActionError,
      queueOfflineMessageAction,
      flushOfflineActionQueue
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.offlineQueue = window.WingaModules.api.offlineQueue || {};
  window.WingaModules.api.offlineQueue.createOfflineQueueTools = createOfflineQueueTools;
})();
