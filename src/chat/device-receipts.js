(() => {
  function openInbox(indexedDB) {
    return new Promise((resolve, reject) => {
      if (!indexedDB) return reject(new Error("Device storage unavailable.")); // i18n-gate: allow -- internal receipt diagnostic, never displayed
      const request = indexedDB.open("winga-received-messages-v1", 1);
      let failed = false;
      request.onupgradeneeded = () => {
        const rows = request.result.createObjectStore("messages", { keyPath: "key" });
        rows.createIndex("scope", "scope");
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { failed = true; reject(new Error("Device storage blocked.")); }; // i18n-gate: allow -- internal receipt diagnostic, never displayed
      request.onsuccess = () => {
        if (failed) return request.result.close();
        resolve(request.result);
      };
    });
  }

  async function writeInbox(indexedDB, scope, messages, clear = false) {
    const db = await openInbox(indexedDB);
    try {
      await new Promise((resolve, reject) => {
        let tx;
        try { tx = db.transaction("messages", "readwrite", { durability: "strict" }); }
        catch { tx = db.transaction("messages", "readwrite"); }
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error("Device storage aborted.")); // i18n-gate: allow -- internal receipt diagnostic, never displayed
        tx.onerror = () => {}; // The abort event decides whether the transaction committed.
        const rows = tx.objectStore("messages");
        const now = Date.now();
        for (const message of messages) rows.put({ key: JSON.stringify([scope, message.id]), scope, savedAt: now, message });
        const request = rows.index("scope").getAll(scope);
        request.onsuccess = () => {
          const fresh = new Set(messages.map(message => JSON.stringify([scope, message.id])));
          const existing = request.result.sort((a, b) => Number(fresh.has(b.key)) - Number(fresh.has(a.key)) || b.savedAt - a.savedAt);
          existing.forEach((row, index) => {
            if (clear || index >= 1000 || row.savedAt < now - 7 * 86400000) rows.delete(row.key);
          });
        };
      });
    } finally { db.close(); }
  }

  function createDeviceReceipts({ owner, dataLayer, isCurrent, indexedDB = globalThis.indexedDB }) {
    let device = null, stopped = false, tail = Promise.resolve();
    let deliverySync = null, deliveryTimer = null, syncAgain = false;
    const stored = new Set(), read = new Set();
    const remember = (set, id) => {
      set.add(id);
      if (set.size > 2000) set.delete(set.values().next().value);
    };
    const active = () => !stopped && isCurrent();
    const scope = () => JSON.stringify([owner, device.deviceId]);
    function serial(work) {
      const result = tail.then(work);
      tail = result.catch(() => {});
      return result;
    }
    async function identity(refresh = false) {
      if (!active()) return false;
      if (!device || refresh) device = await dataLayer.loadChatDevice();
      if (!active()) return false;
      if (device?.supported !== true) { device = null; return false; }
      if (device.username !== owner || !device.deviceId) throw new Error("Device identity changed."); // i18n-gate: allow -- internal receipt diagnostic, never displayed
      return true;
    }
    async function receive(messages, kind, visible) {
      if (!await identity()) return false;
      const incoming = [...new Map(messages.filter(m => m?.id && m.receiverId === owner && m.senderId !== owner)
        .map(m => [m.id, m])).values()];
      const groups = new Map();
      for (const message of incoming) {
        if (!groups.has(message.senderId)) groups.set(message.senderId, []);
        groups.get(message.senderId).push(message);
      }
      let changed = false;
      for (const [partner, rows] of groups) for (let start = 0; start < rows.length; start += 100) {
        if (!active()) return false;
        const batch = rows.slice(start, start + 100);
        const pending = batch.filter(m => !stored.has(m.id));
        if (pending.length) {
          // Only transaction completion, never individual put success, permits Delivered.
          await writeInbox(indexedDB, scope(), pending);
          if (!active()) return false;
          const result = await dataLayer.acknowledgeMessages({ deviceId: device.deviceId, kind: "stored", withUser: partner, messageIds: pending.map(m => m.id) });
          if (result?.ok !== true) throw new Error("Device receipt not confirmed."); // i18n-gate: allow -- internal receipt diagnostic, never displayed
          pending.forEach(m => remember(stored, m.id));
        }
        if (kind === "read" && active()) {
          const reached = batch.filter(m => !read.has(m.id) && visible(m.id));
          if (reached.length) {
            const result = await dataLayer.acknowledgeMessages({ deviceId: device.deviceId, kind: "read", withUser: partner, messageIds: reached.map(m => m.id) });
            if (result?.ok !== true) throw new Error("Read receipt not confirmed."); // i18n-gate: allow -- internal receipt diagnostic, never displayed
            reached.forEach(m => remember(read, m.id));
            changed = true;
          }
        }
      }
      return changed;
    }
    function submit(messages, kind, visible = () => false) {
      return serial(async () => {
        try { return await receive(messages, kind, visible); }
        catch (error) {
          if (error.status === 401) {
            stopped = true;
            if (device?.deviceId) await writeInbox(indexedDB, scope(), [], true).catch(() => {});
          }
          throw error;
        }
      });
    }
    function syncPending() {
      if (!active()) return Promise.resolve();
      if (deliverySync) { syncAgain = true; return deliverySync; }
      clearTimeout(deliveryTimer);
      deliveryTimer = null;
      syncAgain = false;
      let delay = 30000;
      deliverySync = serial(async () => {
        if (!await identity(Boolean(device && !device.pendingDelivery)) || !device.pendingDelivery) return;
        // Drain bounded batches without changing chat selection or read state.
        for (let page = 0; page < 5 && active(); page++) {
          const result = await dataLayer.loadPendingMessageDelivery();
          if (!active()) return;
          if (!Array.isArray(result?.items) || result.items.length > 50
            || result.items.some(m => !m?.id || m.receiverId !== owner || m.senderId === owner)
            || (result.hasMore && !result.items.length)) throw new Error("Invalid delivery batch."); // i18n-gate: allow -- internal receipt diagnostic, never displayed
          if (!result.items.length) return;
          result.items.forEach(message => stored.delete(message.id));
          await receive(result.items, "stored", () => false);
          if (!result.hasMore) return;
          delay = 1000;
        }
      }).catch(async error => {
        delay = 15000;
        if (error.status === 401) {
          stopped = true;
          if (device?.deviceId) await writeInbox(indexedDB, scope(), [], true).catch(() => {});
        }
        throw error;
      }).finally(() => {
        deliverySync = null;
        if (active() && device?.pendingDelivery) {
          deliveryTimer = setTimeout(() => syncPending().catch(() => {}), syncAgain ? 250 : delay);
        }
      });
      return deliverySync;
    }
    return {
      syncPending,
      persist: messages => submit(messages, "stored"),
      markRead: (messages, visible) => submit(messages, "read", visible),
      dispose() {
        stopped = true;
        clearTimeout(deliveryTimer);
        return serial(async () => {
          stored.clear(); read.clear();
          if (device?.deviceId) await writeInbox(indexedDB, scope(), [], true);
        });
      }
    };
  }
  window.WingaModules = window.WingaModules || {};
  window.WingaModules.chat = window.WingaModules.chat || {};
  window.WingaModules.chat.createDeviceReceipts = createDeviceReceipts;
})();
