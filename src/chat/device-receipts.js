(() => {
  function openInbox(indexedDB) {
    return new Promise((resolve, reject) => {
      if (!indexedDB) return reject(new Error("Device storage unavailable.")); // i18n-gate: allow -- internal receipt diagnostic, never displayed
      const request = indexedDB.open("winga-received-messages-v1", 2);
      let failed = false;
      request.onupgradeneeded = () => {
        for (const name of ["messages", "events"]) if (!request.result.objectStoreNames.contains(name)) {
          const rows = request.result.createObjectStore(name, { keyPath: "key" });
          rows.createIndex("scope", "scope");
        }
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { failed = true; reject(new Error("Device storage blocked.")); }; // i18n-gate: allow -- internal receipt diagnostic, never displayed
      request.onsuccess = () => {
        if (failed) return request.result.close();
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }

  async function writeInbox(indexedDB, scope, messages, clear = false) {
    const db = await openInbox(indexedDB);
    try {
      await new Promise((resolve, reject) => {
        let tx;
        try { tx = db.transaction(["messages", "events"], "readwrite", { durability: "strict" }); }
        catch { tx = db.transaction(["messages", "events"], "readwrite"); }
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error("Device storage aborted.")); // i18n-gate: allow -- internal receipt diagnostic, never displayed
        tx.onerror = () => {}; // The abort event decides whether the transaction committed.
        const rows = tx.objectStore("messages");
        const now = Date.now();
        let remaining = messages.length;
        function prune() {
          const request = rows.index("scope").getAll(scope);
          request.onsuccess = () => {
            const fresh = new Set(messages.map(message => JSON.stringify([scope, message.id])));
            const existing = request.result.sort((a, b) => Number(fresh.has(b.key)) - Number(fresh.has(a.key)) || b.savedAt - a.savedAt);
            existing.forEach((row, index) => {
              if (clear || index >= 1000 || row.savedAt < now - 7 * 86400000) rows.delete(row.key);
            });
          };
        }
        for (const message of messages) {
          const key = JSON.stringify([scope, message.id]);
          const previous = rows.get(key);
          previous.onsuccess = () => {
            // Older REST/SSE snapshots must not resurrect ledger tombstones or overwrite revisions.
            if (!previous.result?.ledgerRevision) rows.put({ key, scope, savedAt: now, message });
            if (--remaining === 0) prune();
          };
        }
        if (clear) {
          const events = tx.objectStore("events");
          const all = events.index("scope").getAll(scope);
          all.onsuccess = () => all.result.forEach(row => events.delete(row.key));
        }
        if (!messages.length) prune();
      });
    } finally { db.close(); }
  }

  async function writeEventInbox(indexedDB, scope, batch) {
    const db = await openInbox(indexedDB);
    try {
      await new Promise((resolve, reject) => {
        let tx;
        try { tx = db.transaction(["messages", "events"], "readwrite", { durability: "strict" }); }
        catch { tx = db.transaction(["messages", "events"], "readwrite"); }
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error || new Error("Event storage aborted.")); // i18n-gate: allow -- internal diagnostic
        tx.onerror = () => {};
        const messages = tx.objectStore("messages"), events = tx.objectStore("events"), now = Date.now();
        const resources = new Map(batch.items.map(message => [message.id, message]));
        const latest = new Map();
        for (const event of batch.events) {
          events.put({ key: JSON.stringify([scope, event.id]), scope, savedAt: now, event });
          if (event.messageId && (!latest.has(event.messageId)
            || BigInt(latest.get(event.messageId).currentRevision) <= BigInt(event.currentRevision))) latest.set(event.messageId, event);
        }
        for (const [id, event] of latest) {
          const key = JSON.stringify([scope, id]);
          const previous = messages.get(key);
          previous.onsuccess = () => {
            const old = previous.result;
            if (BigInt(old?.ledgerRevision || "0") > BigInt(event.currentRevision)
              || (old?.ledgerRevision === event.currentRevision && BigInt(old?.ledgerSequence || "0") > BigInt(event.sequence))) return;
            messages.put({ key, scope, savedAt: now, ledgerRevision: event.currentRevision,
              ledgerSequence: event.sequence,
              tombstone: event.tombstone === true, message: event.tombstone ? null : resources.get(id) });
          };
        }
        const history = events.index("scope").getAll(scope);
        history.onsuccess = () => {
          const fresh = new Set(batch.events.map(event => JSON.stringify([scope, event.id])));
          history.result.sort((a,b) => Number(fresh.has(b.key))-Number(fresh.has(a.key)) || b.savedAt-a.savedAt)
            .forEach((row,index) => { if (index>=2000 || row.savedAt<now-7*86400000) events.delete(row.key); });
        };
        const contents = messages.index("scope").getAll(scope);
        contents.onsuccess = () => {
          const fresh = new Set([...latest.keys()].map(id => JSON.stringify([scope,id])));
          // getAll can observe old rows before the queued replacement puts run.
          // Never prune a message that this same transaction is refreshing.
          contents.result.filter(row => !fresh.has(row.key)).sort((a,b) => b.savedAt-a.savedAt)
            .forEach((row,index) => { if (index>=1000-latest.size || row.savedAt<now-7*86400000) messages.delete(row.key); });
        };
      });
    } finally { db.close(); }
  }

  function validateEventBatch(batch, owner, deviceId) {
    const bad = () => { throw new Error("Invalid device event batch."); }; // i18n-gate: allow -- internal diagnostic
    if (batch?.version !== 1 || batch.deviceId !== deviceId || !Array.isArray(batch.events) || batch.events.length>50
      || !Array.isArray(batch.items) || batch.items.length>50 || (batch.hasMore && !batch.events.length)) bad();
    const resources = new Map(batch.items.map(message => [message?.id,message]));
    for (const message of batch.items) if (!message?.id || (message.receiverId!==owner && message.senderId!==owner)) bad();
    for (const event of batch.events) {
      if (!/^[a-f0-9]{32}:[1-9][0-9]{0,18}$/.test(event?.id || "")
        || !/^[0-9]{1,19}$/.test(event.currentRevision) || !/^[1-9][0-9]{0,18}$/.test(event.sequence)) bad();
      if (event.messageId && !event.tombstone && !resources.has(event.messageId)) bad();
    }
  }

  function createDeviceReceipts({ owner, dataLayer, isCurrent, indexedDB = globalThis.indexedDB, onEvents = () => {} }) {
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
    async function receiptFailure(error) {
      if (error.status === 401) {
        stopped = true;
        clearTimeout(deliveryTimer);
        if (device?.deviceId) await writeInbox(indexedDB, scope(), [], true).catch(() => {});
      }
      throw error;
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
      return serial(() => receive(messages, kind, visible).catch(receiptFailure));
    }
    async function acceptEventBatch(batch, acknowledge) {
      if (!await identity() || !active()) return false;
      validateEventBatch(batch, owner, device.deviceId);
      if (!batch.events.length) return true;
      await writeEventInbox(indexedDB, scope(), batch);
      if (!active()) return false;
      batch.items.forEach(message => stored.delete(message.id));
      await receive(batch.items, "stored", () => false);
      if (!active()) return false;
      if (batch.events.length) {
        const result = await acknowledge(batch.events.map(event => event.id));
        if (result?.ok !== true || result.acknowledged !== batch.events.length) throw new Error("Event ACK not confirmed."); // i18n-gate: allow -- internal diagnostic
      }
      if (!active()) return false;
      onEvents(batch.events);
      return true;
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
        if (dataLayer.hasDeviceEventStream?.()) return;
        // Drain bounded batches without changing chat selection or read state.
        for (let page = 0; page < 5 && active(); page++) {
          if (device.eventDelivery) {
            const batch = await dataLayer.pollDeviceEvents();
            if (!active()) return;
            if (!await acceptEventBatch(batch, eventIds => dataLayer.acknowledgeDeviceEvents({ deviceId: device.deviceId, eventIds }))) return;
            if (!batch.hasMore) return;
            delay = 1000;
            continue;
          }
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
        return receiptFailure(error);
      }).finally(() => {
        deliverySync = null;
        if (active() && device?.pendingDelivery) {
          deliveryTimer = setTimeout(() => syncPending().catch(() => {}), syncAgain ? 250 : delay);
        }
      });
      return deliverySync;
    }
    return {
      acceptEvents: (batch, acknowledge) => serial(() => acceptEventBatch(batch, acknowledge).catch(receiptFailure)),
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
