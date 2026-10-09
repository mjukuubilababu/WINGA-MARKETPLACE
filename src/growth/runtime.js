(() => {
  function createRuntime(deps = {}) {
    const win = deps.window || window, contract = win.WingaModules.growth.contract;
    const now = deps.now || Date.now;
    const timingNow = () => win.performance?.now ? win.performance.now() : now();
    const randomId = () => win.crypto.randomUUID();
    const enabled = () => win.WINGA_CONFIG?.growthProductSharing === true;
    const measurement = () => win.WINGA_CONFIG?.growthMeasurement === true;
    const account = () => deps.getAccount?.() || '';
    const storage = (area, method, key, value) => { try { return win[area][method](key, value); } catch { return null; } };
    const read = (area, key, fallback) => {
      try { return JSON.parse(storage(area, 'getItem', key) || 'null') || fallback; } catch { return fallback; }
    };
    let sessionId = storage('sessionStorage', 'getItem', 'winga-growth-session');
    if (!contract.uuid(sessionId)) { sessionId = randomId(); storage('sessionStorage','setItem','winga-growth-session',sessionId); }
    let queue = read('localStorage', 'winga-growth-outbox-v1', []);
    queue = Array.isArray(queue) ? queue.filter(x => x && ['shares','events'].includes(x.kind) && x.payload?.schemaVersion === 1).slice(-100) : [];
    let dead = read('localStorage', 'winga-growth-dead-v1', []);
    dead = Array.isArray(dead) ? dead.filter(x => x && now()-x.failedAt < 7*86400000).slice(-50) : [];
    let journey = read('sessionStorage', 'winga-growth-journey-v1', { firstTouch: null, lastTouch: null, touches: [] });
    if (!journey || !Array.isArray(journey.touches)) journey = { firstTouch: null, lastTouch: null, touches: [] };
    journey.touches = journey.touches.filter(t => contract.uuid(t?.shareId) && contract.id(t?.productId)
      && Number.isFinite(t?.at) && now()-t.at < 30*86400000).slice(-20);
    journey.firstTouch = journey.touches[0] || null;
    journey.lastTouch = journey.touches.at(-1) || null;
    let flushing = false, retryTimer = null, viewTimer = null, activeProduct = '', closed = false;
    let previousAccount = account();
    let routeTiming = null, initialCapture = true;
    function syncIdentity() {
      const current = account();
      if (previousAccount && previousAccount !== current) {
        sessionId = randomId(); storage('sessionStorage','setItem','winga-growth-session',sessionId);
        journey = { firstTouch: null, lastTouch: null, touches: [] };
        routeTiming = null;
        storage('sessionStorage','setItem','winga-growth-journey-v1',JSON.stringify(journey));
      }
      previousAccount = current;
    }
    const persist = () => storage('localStorage','setItem','winga-growth-outbox-v1',JSON.stringify(queue));
    function health(type, code = '') {
      try { win.dispatchEvent(new win.CustomEvent('winga:growth-health', { detail: { type, code } })); } catch {}
    }
    function deadLetter(item, reason) {
      // Keep replayable schema-only records, never private message bodies or arbitrary metadata.
      dead.push({ ...item, reason, failedAt: now() }); dead = dead.slice(-50);
      storage('localStorage','setItem','winga-growth-dead-v1',JSON.stringify(dead));
      health('dead_letter', reason);
    }
    function enqueue(kind, payload) {
      const item = { id: payload.eventId || payload.shareId, kind, payload, account: account(), attempts: 0, nextAt: now(), createdAt: now() };
      if (queue.some(x => x.id === item.id && x.kind === kind)) return;
      if (queue.length >= 100) deadLetter(queue.shift(), 'queue_capacity');
      queue.push(item); persist(); void flush();
    }
    async function flush() {
      if (flushing || closed || win.navigator?.onLine === false) return;
      flushing = true;
      if (retryTimer) win.clearTimeout(retryTimer);
      try {
        // Shares precede their dependent events. A failed share may resolve on the next bounded retry.
        for (const item of [...queue].sort((a,b) => (a.kind === 'shares' ? 0 : 1)-(b.kind === 'shares' ? 0 : 1))) {
          if (item.nextAt > now()) continue;
          if (item.account !== account() || now()-item.createdAt > 86400000) {
            queue = queue.filter(x => x !== item); deadLetter(item, 'context_expired'); continue;
          }
          if (item.kind === 'shares' ? !enabled() : !measurement()) continue;
          try {
            await deps.request(item.kind, item.payload);
            queue = queue.filter(x => x !== item);
          } catch (error) {
            item.attempts++;
            const permanent = [400,401,403].includes(error.status) || error.code === 'growth_share_conflict'
              || ['growth_sharing_disabled','growth_measurement_disabled'].includes(error.code);
            if (permanent || item.attempts >= 6) {
              queue = queue.filter(x => x !== item); deadLetter(item, error.code || 'retry_exhausted');
            } else { item.nextAt = now()+Math.min(30000,1000*2**item.attempts); health('retry',error.code || 'unavailable'); }
          }
        }
      } finally {
        persist(); flushing = false;
        const pending = queue.filter(x => x.kind === 'shares' ? enabled() : measurement());
        if (pending.length && !closed) retryTimer = win.setTimeout(flush, Math.max(250,Math.min(...pending.map(x => x.nextAt))-now()));
      }
    }
    function touchFor(productId) {
      return [...journey.touches].reverse().find(t => t.productId === productId && now()-t.at < 30*86400000);
    }
    function event(eventType, productId, extra = {}) {
      syncIdentity();
      if (!measurement() || !contract.events.includes(eventType)) return;
      const touch = touchFor(productId);
      if (!touch) return;
      const payload = { eventId: randomId(), shareId: touch.shareId, sessionId, eventType, schemaVersion: 1 };
      if (contract.id(extra.orderId)) payload.orderId = extra.orderId;
      if (eventType === 'shared_product_viewed' && Number.isInteger(extra.durationMs)
        && extra.durationMs >= 0 && extra.durationMs <= 300000) payload.durationMs = extra.durationMs;
      enqueue('events',payload);
    }
    function capture(input = win.location.href) {
      syncIdentity();
      if (!measurement()) return;
      try {
        const target = contract.parseDestination(input, win.location.origin), url = new URL(input, win.location.origin);
        const shareId = url.searchParams.get('share');
        if (!target || !contract.uuid(shareId)) { routeTiming = null; initialCapture = false; return; }
        if (!routeTiming || routeTiming.shareId !== shareId || routeTiming.productId !== target.id) {
          routeTiming = { productId: target.id, shareId,
            startedAt: initialCapture && win.performance?.now && input === win.location.href ? 0 : timingNow(),
            durationMs: null, eligible: win.document.visibilityState === 'visible' };
        }
        initialCapture = false;
        if (journey.lastTouch?.shareId !== shareId) {
          const touch = { shareId, productId: target.id, at: now() };
          // Preserve the original first touch when the bounded journal is full.
          journey.touches = journey.touches.length >= 20 ? [journey.touches[0],...journey.touches.slice(-18),touch] : [...journey.touches,touch];
          journey.firstTouch = journey.firstTouch || touch; journey.lastTouch = touch;
          storage('sessionStorage','setItem','winga-growth-journey-v1',JSON.stringify(journey));
        }
        event('product_share_opened',target.id);
      } catch { health('capture_failed'); }
    }
    function prepareShare(productId, sourceSurface = 'product_detail') {
      syncIdentity();
      const shareId = enabled() ? randomId() : '';
      const url = contract.shareUrl(win.location.origin,productId,shareId);
      const parent = touchFor(productId);
      return { url, commit() {
        if (!shareId) return;
        enqueue('shares',{ shareId,sessionId,contentType:'PRODUCT',contentId:productId,
          sourceSurface:contract.surfaces.includes(sourceSurface) ? sourceSurface : 'product_detail',
          parentShareId:parent?.shareId || '',schemaVersion:1 });
      } };
    }
    function productVisible(productId) {
      activeProduct = productId;
      if (viewTimer) win.clearTimeout(viewTimer);
      if (!touchFor(productId) || !measurement() || win.document.visibilityState !== 'visible') return;
      if (routeTiming?.productId === productId && routeTiming.eligible && routeTiming.durationMs === null) {
        const duration = Math.round(timingNow() - routeTiming.startedAt);
        if (Number.isInteger(duration) && duration >= 0 && duration <= 300000) routeTiming.durationMs = duration;
      }
      const durationMs = routeTiming?.productId === productId ? routeTiming.durationMs : null;
      // A visible detail view for two seconds is activation; opening a URL alone is not.
      viewTimer = win.setTimeout(() => {
        if (activeProduct === productId && win.document.visibilityState === 'visible'
          && win.document.body.classList.contains('product-detail-open')) event('shared_product_viewed',productId,{durationMs});
      },2000);
    }
    function visibility() {
      if (win.document.visibilityState === 'visible') productVisible(activeProduct);
      else { if (viewTimer) win.clearTimeout(viewTimer); if (routeTiming && routeTiming.durationMs === null) routeTiming.eligible = false; }
    }
    const online = () => void flush();
    const navigation = () => capture();
    win.addEventListener('online',online); win.addEventListener('popstate',navigation); win.document.addEventListener('visibilitychange',visibility);
    capture(); void flush();
    return { prepareShare,event,capture,productVisible,flush,
      getJourney: () => JSON.parse(JSON.stringify(journey)),
      getHealth: () => ({ pending:queue.length,deadLetters:dead.length }),
      retryDeadLetters() {
        const retryable = dead.filter(item => item.account === account() && now()-item.createdAt <= 86400000);
        dead = dead.filter(item => !retryable.includes(item));
        storage('localStorage','setItem','winga-growth-dead-v1',JSON.stringify(dead));
        for (const item of retryable) enqueue(item.kind,item.payload);
        return retryable.length;
      },
      close() { closed = true; if (retryTimer) win.clearTimeout(retryTimer); if (viewTimer) win.clearTimeout(viewTimer);
        win.removeEventListener('online',online); win.removeEventListener('popstate',navigation); win.document.removeEventListener('visibilitychange',visibility); }
    };
  }
  window.WingaModules.growth.createRuntime = createRuntime;
})();
