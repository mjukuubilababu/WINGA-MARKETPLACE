(() => {
  function createIntelligenceApiClient(deps = {}) {
    const baseUrl = String(deps.baseUrl || "").replace(/\/+$/, "");
    const fetchJson = typeof deps.fetchJson === "function" ? deps.fetchJson : null;
    const createAuthHeaders = typeof deps.createAuthHeaders === "function" ? deps.createAuthHeaders : () => ({});
    const getConfig = typeof deps.getConfig === "function" ? deps.getConfig : () => ({});
    const schedule = typeof deps.schedule === "function" ? deps.schedule : (callback, delayMs) => setTimeout(callback, delayMs);
    const cancelSchedule = typeof deps.cancelSchedule === "function" ? deps.cancelSchedule : (timer) => clearTimeout(timer);
    const lifecycleTarget = deps.lifecycleTarget || (typeof window !== "undefined" ? window : null);
    const maxBatchSize = Math.max(1, Math.min(25, Number(deps.maxClientEventBatchSize || 20) || 20));
    const maxBufferedEvents = Math.max(maxBatchSize, Math.min(200, Number(deps.maxBufferedClientEvents || 100) || 100));
    const flushDelayMs = Math.max(100, Math.min(5000, Number(deps.clientEventFlushDelayMs || 750) || 750));
    const clientEventQueue = [];
    let clientEventFlushTimer = null;
    let clientEventFlushPromise = null;
    const capturePrefix = "winga_search_capture_v1:";
    const captureStorage = () => deps.getCaptureStorage ? deps.getCaptureStorage() : localStorage;
    const captureOwner = () => String(deps.getCaptureOwner?.() || "anonymous");
    const captureNow = () => deps.now ? deps.now() : Date.now();
    let captureTimer = null;
    let captureFlushPromise = null;

    function pendingCaptures() {
      try {
        const storage = captureStorage(), rows = [];
        // Independent receipt keys avoid cross-tab read/modify/write of one list.
        const keys = Array.from({length:storage.length}, (_,index)=>storage.key(index))
          .filter(key=>key?.startsWith(capturePrefix));
        for (const key of keys) {
          let row;
          try {row=JSON.parse(storage.getItem(key));} catch {storage.removeItem(key); continue;}
          if (!row || row.expiresAt <= captureNow()) {storage.removeItem(key); continue;}
          if (row.owner === captureOwner()) rows.push({key,...row});
        }
        return rows.slice(0,50);
      } catch {return [];}
    }

    function scheduleCaptureFlush(delayMs=1000) {
      if (captureTimer !== null || captureFlushPromise || !pendingCaptures().some(row=>row.attempts < 12)) return;
      captureTimer = schedule(()=>{
        captureTimer=null;
        void flushSearchCaptures();
      },delayMs);
    }

    function captureSearchReceipt(capture) {
      if (!/^search_observation_[a-f0-9]{32}$/.test(capture?.eventId || "")
          || typeof capture?.receipt !== "string" || capture.receipt.length > 8192
          || !Number.isSafeInteger(capture.expiresAt) || capture.expiresAt <= captureNow()) return false;
      try {
        const storage=captureStorage(), key=capturePrefix+capture.eventId;
        if (!storage.getItem(key)) {
          const count=Array.from({length:storage.length}, (_,i)=>storage.key(i))
            .filter(value=>value?.startsWith(capturePrefix)).length;
          if (count >= 50) return false; // Preserve existing pending receipts.
          storage.setItem(key,JSON.stringify({...capture,owner:captureOwner(),attempts:0}));
        }
        scheduleCaptureFlush();
        return true;
      } catch {return false;} // Storage failure must not fail search.
    }

    async function flushSearchCaptures() {
      if (captureFlushPromise) return captureFlushPromise;
      const row=pendingCaptures().find(item=>item.attempts < 12);
      if (!row) return null;
      let retryAllowed = true;
      captureFlushPromise=(async()=>{
        try {
          // Persist attempt budget before sending; reload cannot reset it.
          try {captureStorage().setItem(row.key,JSON.stringify({...row,attempts:row.attempts+1}));}
          catch {retryAllowed=false; return;}
          const result=await fetchJson(baseUrl+"/search-demand/capture", {
            method:"POST", headers:jsonHeaders(), body:JSON.stringify({receipt:row.receipt}), timeoutMs:15000
          });
          if (result?.durablyRecorded === true && result.eventId === row.eventId) captureStorage().removeItem(row.key);
        } catch (error) {
          if ([400,410].includes(Number(error?.status || error?.statusCode))) {
            try {captureStorage().removeItem(row.key);} catch {}
          }
        }
      })().finally(()=>{
        captureFlushPromise=null;
        if (retryAllowed) scheduleCaptureFlush(Math.min(60000,1000 * 2 ** Math.min(row.attempts+1,6)) + Math.floor(Math.random()*500));
      });
      return captureFlushPromise;
    }

    function requireFetcher() {
      if (typeof fetchJson !== "function") {
        throw new Error("Winga intelligence API client requires fetchJson.");
      }
    }

    function jsonHeaders() {
      return {
        "Content-Type": "application/json",
        ...createAuthHeaders()
      };
    }

    function scheduleClientEventFlush(delayMs = flushDelayMs) {
      if (clientEventFlushTimer !== null || clientEventFlushPromise || !clientEventQueue.length) return;
      clientEventFlushTimer = schedule(() => {
        clientEventFlushTimer = null;
        void flushClientEvents();
      }, Math.max(0, Number(delayMs) || 0));
    }

    async function flushClientEvents(options = {}) {
      requireFetcher();
      if (clientEventFlushPromise) return clientEventFlushPromise;
      if (getConfig()?.enableClientEventLogging === false) {
        clientEventQueue.length = 0;
        return null;
      }
      if (!clientEventQueue.length) return null;
      if (clientEventFlushTimer !== null) {
        cancelSchedule(clientEventFlushTimer);
        clientEventFlushTimer = null;
      }
      const events = clientEventQueue.splice(0, maxBatchSize);
      clientEventFlushPromise = fetchJson(baseUrl + "/client-events", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ events }),
        keepalive: options.keepalive === true,
        timeoutMs: 15000
      })
        .catch(() => {
          // Telemetry must never block the marketplace path.
          return null;
        })
        .finally(() => {
          clientEventFlushPromise = null;
          if (clientEventQueue.length) scheduleClientEventFlush(0);
        });
      return clientEventFlushPromise;
    }

    async function logClientEvent(event) {
      requireFetcher();
      if (getConfig()?.enableClientEventLogging === false) return null;
      clientEventQueue.push(event);
      while (clientEventQueue.length > maxBufferedEvents) clientEventQueue.shift();
      if (event?.level === "error" || clientEventQueue.length >= maxBatchSize) {
        return flushClientEvents();
      }
      scheduleClientEventFlush();
      return null;
    }

    lifecycleTarget?.addEventListener?.("pagehide", () => {
      void flushClientEvents({ keepalive: true });
    });
    lifecycleTarget?.addEventListener?.("online", ()=>scheduleCaptureFlush());
    scheduleCaptureFlush(); // Recover durable receipts after reload.
    async function submitSearchDemandEvents(events = []) {
      requireFetcher();
      const batch = Array.isArray(events) ? events.filter(Boolean).slice(-25) : [];
      if (!batch.length) {
        return { ok: true, accepted: 0, inserted: 0 };
      }
      try {
        return await fetchJson(`${baseUrl}/search-demand`, {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ events: batch })
        });
      } catch (error) {
        return {
          ok: false,
          accepted: 0,
          inserted: 0,
          error: error?.message || "search-demand unavailable"
        };
      }
    }

    return {
      logClientEvent,
      flushClientEvents,
      captureSearchReceipt,
      flushSearchCaptures,
      submitSearchDemandEvents
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.intelligence = window.WingaModules.api.intelligence || {};
  window.WingaModules.api.intelligence.createIntelligenceApiClient = createIntelligenceApiClient;
})();
