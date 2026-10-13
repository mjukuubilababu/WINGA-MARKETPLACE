(() => {
  function createRuntime(deps = {}) {
    const win = deps.window || window, contract = win.WingaModules.growth.contract;
    const now = deps.now || Date.now;
    const timingNow = () => win.performance?.now ? win.performance.now() : now();
    const randomId = () => win.crypto.randomUUID();
    const enabled = (type='PRODUCT') => win.WINGA_CONFIG?.[type==='SELLER_REFERRAL'?'growthSellerReferral':type==='COLLECTION'?'growthCollectionSharing':type==='PROFILE'?'growthProfileSharing':['REEL','SHORT'].includes(type)?'growthCreatorSharing':'growthProductSharing']===true;
    const measurement = () => win.WINGA_CONFIG?.growthMeasurement === true;
    const account = () => deps.getAccount?.() || '';
    const freshRecord = item => Number.isFinite(item?.createdAt)
      && item.createdAt <= now() && now()-item.createdAt <= 86400000;
    const storage = (area, method, key, value) => { try { return win[area][method](key, value); } catch { return null; } };
    const read = (area, key, fallback) => {
      try { return JSON.parse(storage(area, 'getItem', key) || 'null') || fallback; } catch { return fallback; }
    };
    let sessionId = storage('sessionStorage', 'getItem', 'winga-growth-session');
    if (!contract.uuid(sessionId)) { sessionId = randomId(); storage('sessionStorage','setItem','winga-growth-session',sessionId); }
    let queue = read('localStorage', 'winga-growth-outbox-v1', []);
    queue = Array.isArray(queue) ? queue.filter(x => x && ['shares','events','room-events'].includes(x.kind) && x.payload?.schemaVersion === 1).slice(-100) : [];
    const safePayload=(kind,payload)=>Object.fromEntries(Object.entries(payload).filter(([field,value])=>{
      if(!(kind==='shares'?['shareId','sessionId','contentType','contentId','sourceSurface','parentShareId','schemaVersion','messageId']:kind==='room-events'?['eventId','shareId','sessionId','tokenHash','eventType','schemaVersion','orderId','newRoomHash']:['eventId','shareId','sessionId','eventType','schemaVersion','orderId','durationMs','productId']).includes(field))return false;
      if(field==='schemaVersion')return value===1;
      if(field==='durationMs')return Number.isInteger(value)&&value>=0&&value<=300000;
      if(field==='contentType')return contract.shareTypes.includes(value);
      if(field==='sourceSurface')return contract.surfaces.includes(value);
      if(field==='eventType')return [...contract.events,...contract.roomEvents,...contract.contentEvents,...contract.referralEvents].includes(value);
      if(['tokenHash','newRoomHash'].includes(field))return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
      if(field==='productId')return payload.eventType==='shared_content_saved'&&contract.id(value);
      if(['contentId','orderId'].includes(field))return contract.id(value);
      return field==='parentShareId'&&value===''||contract.uuid(value);
    }));
    queue=queue.map(item=>({...item,payload:safePayload(item.kind,item.payload)}));
    let dead = read('localStorage', 'winga-growth-dead-v1', []);
    dead = Array.isArray(dead) ? dead.filter(x => x && ['shares','events','room-events'].includes(x.kind) && x.payload?.schemaVersion===1 && now()-x.failedAt < 7*86400000).slice(-50).map(item=>({...item,payload:safePayload(item.kind,item.payload)})) : [];
    let journey = read('sessionStorage', 'winga-growth-journey-v1', { firstTouch: null, lastTouch: null, touches: [] });
    if (!journey || !Array.isArray(journey.touches)) journey = { firstTouch: null, lastTouch: null, touches: [] };
    journey.touches = journey.touches.filter(t => contract.uuid(t?.shareId) && (contract.id(t?.productId) || ['SHOPPING_ROOM','SELLER_REFERRAL'].includes(t?.destinationType) && t.destinationId===t.shareId || contract.publicTypes.includes(t?.destinationType)&&contract.id(t.destinationId))
      && Number.isFinite(t?.at) && t.at<=now() && now()-t.at < 30*86400000).slice(-20);
    journey.touches = journey.touches.map(t => ['SHOPPING_ROOM','SELLER_REFERRAL'].includes(t.destinationType)
      ? {shareId:t.shareId,destinationType:t.destinationType,destinationId:t.shareId,at:t.at}
      : t.destinationType&&t.destinationType!=='PRODUCT'?{shareId:t.shareId,destinationType:t.destinationType,destinationId:t.destinationId,...(contract.id(t.creatorRef)?{creatorRef:t.creatorRef}:{}),at:t.at}:{shareId:t.shareId,productId:t.productId,at:t.at});
    journey.firstTouch = journey.touches[0] || null;
    journey.lastTouch = journey.touches.at(-1) || null;
    let flushing = false, retryTimer = null, viewTimer = null, activeProduct = '', closed = false;
    let previousAccount = account();
    let routeTiming = null, initialCapture = true,pendingProductShare=null;
    const accountRollout=win.WINGA_CONFIG?.growthAccountRolloutEnabled===true&&typeof deps.loadCapabilities==='function';
    const identity=()=>deps.getIdentity?.()||account();
    let capabilityGeneration=0,capabilityIdentity='',capabilityTimer=null;
    function disableAccountCapabilities(){win.WINGA_CONFIG.growthProductSharing=false;win.WINGA_CONFIG.growthMeasurement=false;if(capabilityTimer)win.clearTimeout(capabilityTimer);capabilityTimer=null;}
    if(accountRollout)disableAccountCapabilities();
    const roomProductContexts=new Map(),collectionProductContexts=new Map();
    function syncIdentity() {
      const current = account();
      if(accountRollout&&capabilityIdentity&&identity()!==capabilityIdentity){capabilityGeneration++;capabilityIdentity='';disableAccountCapabilities();}
      if (previousAccount && previousAccount !== current) {
        sessionId = randomId(); storage('sessionStorage','setItem','winga-growth-session',sessionId);
        journey = { firstTouch: null, lastTouch: null, touches: [] };
        routeTiming = null;
        roomProductContexts.clear();collectionProductContexts.clear();pendingProductShare=null;
        storage('sessionStorage','setItem','winga-growth-journey-v1',JSON.stringify(journey));
      }
      previousAccount = current;
    }
    const persist = () => storage('localStorage','setItem','winga-growth-outbox-v1',JSON.stringify(queue));
    function health(type, code = '') {
      try { win.dispatchEvent(new win.CustomEvent('winga:growth-health', { detail: { type, code } })); } catch {}
    }
    const timingMetrics=new Map(), timingNames=new Set(['share_sheet_open_ms','share_link_creation_ms','deep_link_to_content_ms','room_invite_accept_ms','room_invite_request_ms','auth_return_to_destination_ms']);
    function recordTiming(metric,duration){
      if(closed||!measurement()||!timingNames.has(metric)||!Number.isFinite(duration)||duration<0||duration>300000)return;
      const samples=timingMetrics.get(metric)||[];samples.push(Math.round(duration));timingMetrics.set(metric,samples.slice(-100));
      try{deps.recordTiming?.(metric,Math.round(duration));}catch{}
    }
    async function refreshCapabilities(){
      if(!accountRollout||closed)return;
      syncIdentity();const owner=account(),key=identity(),generation=++capabilityGeneration;
      disableAccountCapabilities();capabilityIdentity=key;
      if(!owner)return;
      const current=()=>!closed&&generation===capabilityGeneration&&account()===owner&&identity()===key;
      try{
        const result=await deps.loadCapabilities();if(!current())return;
        if(result?.schemaVersion!==1||result.account!==owner||typeof result.productSharing!=='boolean'||typeof result.measurement!=='boolean')throw Error('growth_capabilities_invalid');
        win.WINGA_CONFIG.growthProductSharing=result.productSharing;
        win.WINGA_CONFIG.growthMeasurement=result.productSharing&&result.measurement;
        if(measurement()){
          const pending=pendingProductShare;
          const destination=contract.parseDestination(win.location.href,win.location.origin);
          if(pending&&pending.at<=now()&&now()-pending.at<=1800000&&destination?.type==='PRODUCT'&&destination.id===pending.productId){pendingProductShare=null;capture(pending.url);if(routeTiming)routeTiming.eligible=false;}
          else capture();
          if(activeProduct)productVisible(activeProduct);void flush();
        }
      }catch{if(current()){disableAccountCapabilities();health('capabilities_unavailable');}}
      finally{if(current())capabilityTimer=win.setTimeout(()=>void refreshCapabilities(),60000);}
    }
    function deadLetter(item, reason) {
      // Keep replayable schema-only records, never private message bodies or arbitrary metadata.
      dead.push({ ...item, reason, failedAt: now() }); dead = dead.slice(-50);
      storage('localStorage','setItem','winga-growth-dead-v1',JSON.stringify(dead));
      health('dead_letter', reason);
    }
    function enqueue(kind, payload, createdAt = now()) {
      const item = { id: payload.eventId || payload.shareId, kind, payload, account: account(), attempts: 0, nextAt: now(), createdAt };
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
          if (item.account !== account() || !freshRecord(item)) {
            queue = queue.filter(x => x !== item); deadLetter(item, 'context_expired'); continue;
          }
          if(!Number.isFinite(item.nextAt)||item.nextAt>now()+30000)item.nextAt=now();
          if(item.nextAt>now())continue;
          if (item.kind === 'shares' ? !enabled(item.payload.contentType) : !measurement()) continue;
          try {
            const requestStarted=timingNow();
            await deps.request(item.kind, item.payload);
            if(item.kind==='shares')recordTiming('share_link_creation_ms',timingNow()-requestStarted);
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
        const pending = queue.filter(x => x.kind === 'shares' ? enabled(x.payload.contentType) : measurement());
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
      try {
        const target = contract.parseDestination(input, win.location.origin), url = new URL(input, win.location.origin);
        const shareId = url.searchParams.get('share');
        if(!measurement()){
          if(accountRollout&&target?.type==='PRODUCT'&&contract.uuid(shareId))pendingProductShare={productId:target.id,url:contract.shareUrl(win.location.origin,target.id,shareId),at:now()};
          else if(pendingProductShare&&((target?.type==='PRODUCT'&&pendingProductShare.productId!==target.id)||url.searchParams.has('share')||pendingProductShare.at>now()||now()-pendingProductShare.at>1800000))pendingProductShare=null;
          return;
        }
        if (target?.type!=='PRODUCT' || !contract.uuid(shareId)) { routeTiming = null; initialCapture = false; return; }
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
    function prepareShare(productId, sourceSurface = 'product_detail',contentType='PRODUCT') {
      syncIdentity();
      const preparedAccount=account(),preparedSession=sessionId;
      const shareId = enabled(contentType) ? randomId() : '';
      const url = contract.shareUrl(win.location.origin,productId,shareId,contentType);
      const parent = contentType==='PRODUCT'?touchFor(productId):[...journey.touches].reverse().find(t=>t.destinationType===contentType&&t.destinationId===productId);
      return { url, commit() {
        if (!shareId || account()!==preparedAccount) return;
        enqueue('shares',{ shareId,sessionId:preparedSession,contentType,contentId:productId,
          sourceSurface:contract.surfaces.includes(sourceSurface) ? sourceSurface : 'product_detail',
          parentShareId:parent?.shareId || '',schemaVersion:1 });
      } };
    }
    function contentEvent(eventType,touch,extra={}){
      syncIdentity();if(!measurement()||!contract.contentEvents.includes(eventType)||!contract.uuid(touch?.shareId))return;
      enqueue('events',{eventId:randomId(),shareId:touch.shareId,sessionId,eventType,schemaVersion:1,...(eventType==='shared_content_saved'&&touch.destinationType==='COLLECTION'&&contract.id(extra.productId)?{productId:extra.productId}:{})});
    }
    const contentTimers=new Map();
    function contentVisible(type,id,creatorRef='',visibleCheck=()=>true){
      syncIdentity();if(!measurement()||type==='PRODUCT'||!contract.publicTypes.includes(type)||win.document.visibilityState!=='visible')return;
      const target=contract.parseDestination(win.location.href,win.location.origin),shareId=new URL(win.location.href).searchParams.get('share');
      if(target?.type!==type||target.id!==id||!contract.uuid(shareId))return;
      let touch=journey.touches.find(t=>t.shareId===shareId);
      if(!touch){touch={shareId,destinationType:type,destinationId:id,...(contract.id(creatorRef)?{creatorRef}:{}),at:now()};
        journey.touches=journey.touches.length>=20?[journey.touches[0],...journey.touches.slice(-18),touch]:[...journey.touches,touch];
        journey.firstTouch=journey.firstTouch||touch;journey.lastTouch=touch;storage('sessionStorage','setItem','winga-growth-journey-v1',JSON.stringify(journey));}
      contentEvent('content_share_opened',touch);
      if(contentTimers.has(shareId))return;
      if(contentTimers.size>=20){const oldest=contentTimers.keys().next().value;win.clearTimeout(contentTimers.get(oldest));contentTimers.delete(oldest);}
      const owner=account(),timer=win.setTimeout(()=>{contentTimers.delete(shareId);if(!closed&&account()===owner&&win.document.visibilityState==='visible'&&visibleCheck())contentEvent('shared_content_viewed',touch);},5000);
      contentTimers.set(shareId,timer);
    }
    function contentFollowed(username){syncIdentity();for(const touch of [...journey.touches].reverse())if(touch.creatorRef===username){contentEvent('shared_content_followed',touch);break;}}
    function collectionProductOpened(collectionId,productId){
      syncIdentity();if(!measurement()||!contract.id(productId))return;
      const touch=[...journey.touches].reverse().find(t=>t.destinationType==='COLLECTION'&&t.destinationId===collectionId&&now()-t.at<30*86400000);
      if(!touch)return;if(collectionProductContexts.size>=20)collectionProductContexts.delete(collectionProductContexts.keys().next().value);
      collectionProductContexts.set(productId,{touch,at:now()});
    }
    function contentSaved(productId){
      syncIdentity();const context=collectionProductContexts.get(productId);
      const creator=[...journey.touches].reverse().find(t=>['REEL','SHORT'].includes(t.destinationType)&&t.destinationId===productId&&now()-t.at<30*86400000);
      if(context&&now()-context.at<30*60000&&(!creator||context.at>=creator.at)){contentEvent('shared_content_saved',context.touch,{productId});return;}
      if(creator)contentEvent('shared_content_saved',creator);
    }
    function noteInternalShare(type,id,messageId,sourceSurface){
      syncIdentity();if(!account()||!measurement()||!enabled(type)||!['PRODUCT','COLLECTION','REEL','SHORT'].includes(type)||!contract.id(id)||!contract.uuid(messageId)||!['conversation','room'].includes(sourceSurface))return;
      enqueue('shares',{shareId:randomId(),sessionId,contentType:type,contentId:id,messageId,sourceSurface,parentShareId:'',schemaVersion:1});
    }
    async function internalContentOpened(messageId,type,id,visibleProductId=id){
      syncIdentity();const owner=account();
      if(!owner||!measurement()||!contract.uuid(messageId)||!['PRODUCT','COLLECTION','REEL','SHORT'].includes(type)||!contract.id(id)||!deps.resolveInternalShare)return;
      try{const source=await deps.resolveInternalShare(messageId,type,id);if(closed||account()!==owner||!contract.uuid(source?.shareId)||source.destinationType!==type||source.destinationId!==id)return;
        const touch=type==='PRODUCT'?{shareId:source.shareId,productId:id,at:now()}:{shareId:source.shareId,destinationType:type,destinationId:id,...(contract.id(source.creatorRef)?{creatorRef:source.creatorRef}:{}),at:now()};
        if(!journey.touches.some(t=>t.shareId===touch.shareId))journey.touches=journey.touches.length>=20?[journey.touches[0],...journey.touches.slice(-18),touch]:[...journey.touches,touch];
        journey.firstTouch=journey.firstTouch||touch;journey.lastTouch=touch;storage('sessionStorage','setItem','winga-growth-journey-v1',JSON.stringify(journey));
        if(type==='PRODUCT'){event('product_share_opened',id);if(activeProduct===id)productVisible(id);}
        else{contentEvent('content_share_opened',touch);if(activeProduct===visibleProductId){if(contentTimers.has(source.shareId))return;if(contentTimers.size>=20){const oldest=contentTimers.keys().next().value;win.clearTimeout(contentTimers.get(oldest));contentTimers.delete(oldest);}const timer=win.setTimeout(()=>{contentTimers.delete(source.shareId);if(!closed&&account()===owner&&activeProduct===visibleProductId&&win.document.visibilityState==='visible'&&win.document.body.classList.contains('product-detail-open'))contentEvent('shared_content_viewed',touch);},5000);contentTimers.set(source.shareId,timer);}}
      }catch{health('internal_attribution_unavailable');}
    }
    async function prepareSellerReferral(opportunityId){
      syncIdentity();const owner=account(),preparedSession=sessionId;
      if(!owner||!enabled('SELLER_REFERRAL')||!contract.destination('OPPORTUNITY',opportunityId))throw Object.assign(new Error('growth_referral_unavailable'),{code:'growth_referral_unavailable'});
      const result=await deps.request('shares',{shareId:randomId(),sessionId:preparedSession,contentType:'SELLER_REFERRAL',contentId:opportunityId,sourceSurface:'opportunity',parentShareId:'',schemaVersion:1});
      if(account()!==owner||!contract.uuid(result?.shareId))throw Object.assign(new Error('growth_referral_unavailable'),{code:'growth_referral_unavailable'});
      return {url:contract.shareUrl(win.location.origin,opportunityId,result.shareId,'SELLER_REFERRAL'),shareId:result.shareId};
    }
    function referralVisible(referralId){
      syncIdentity();if(!measurement()||!contract.uuid(referralId))return;
      if(!journey.touches.some(t=>t.destinationType==='SELLER_REFERRAL'&&t.shareId===referralId)){
        const touch={shareId:referralId,destinationType:'SELLER_REFERRAL',destinationId:referralId,at:now()};
        journey.touches=journey.touches.length>=20?[journey.touches[0],...journey.touches.slice(-18),touch]:[...journey.touches,touch];
        journey.firstTouch=journey.firstTouch||touch;journey.lastTouch=touch;storage('sessionStorage','setItem','winga-growth-journey-v1',JSON.stringify(journey));
      }
      enqueue('events',{eventId:randomId(),shareId:referralId,sessionId,eventType:'seller_referral_opened',schemaVersion:1});
    }
    function roomInviteTouch(inviteId) {
      syncIdentity();
      if (!measurement() || !contract.uuid(inviteId) || journey.lastTouch?.shareId===inviteId) return;
      const touch={shareId:inviteId,destinationType:'SHOPPING_ROOM',destinationId:inviteId,at:now()};
      journey.touches=journey.touches.length>=20?[journey.touches[0],...journey.touches.slice(-18),touch]:[...journey.touches,touch];
      journey.firstTouch=journey.firstTouch || touch;journey.lastTouch=touch;
      storage('sessionStorage','setItem','winga-growth-journey-v1',JSON.stringify(journey));
    }
    function roomEvent(eventType, invite, extra={}) {
      syncIdentity();
      if (!measurement() || !contract.roomEvents.includes(eventType) || !contract.uuid(invite?.inviteId)
        || typeof invite.tokenHash!=='string' || !/^[a-f0-9]{64}$/.test(invite.tokenHash)) return;
      if(eventType==='first_order_started'&&!contract.id(extra.orderId))return;
      if(eventType==='new_room_created_from_invited_user'&&!/^[a-f0-9]{64}$/.test(extra.newRoomHash||''))return;
      if(eventType==='first_product_viewed'&&contract.id(extra.productId)&&account()){
        if(roomProductContexts.size>=20)roomProductContexts.delete(roomProductContexts.keys().next().value);
        roomProductContexts.set(extra.productId,{invite:{inviteId:invite.inviteId,tokenHash:invite.tokenHash},owner:account(),at:now()});
      }
      enqueue('room-events',{eventId:contract.uuid(extra.eventId)?extra.eventId:randomId(),shareId:invite.inviteId,
        tokenHash:invite.tokenHash,sessionId,eventType,schemaVersion:1,
        ...(eventType==='first_order_started'?{orderId:extra.orderId}:{}),
        ...(eventType==='new_room_created_from_invited_user'?{newRoomHash:extra.newRoomHash}:{})});
      return true;
    }
    function roomOrderStarted(productId,orderId){syncIdentity();const context=roomProductContexts.get(productId);
      if(context&&context.owner===account()&&now()-context.at<1800000)return roomEvent('first_order_started',context.invite,{orderId});}
    function productVisible(productId) {
      syncIdentity();activeProduct = productId;
      if(measurement()&&pendingProductShare?.productId===productId&&pendingProductShare.at<=now()&&now()-pendingProductShare.at<=1800000
        &&win.document.body.classList.contains('product-detail-open')&&!win.document.body.classList.contains('auth-modal-open')){
        const pending=pendingProductShare;pendingProductShare=null;capture(pending.url);if(routeTiming)routeTiming.eligible=false;
      }
      if (viewTimer) win.clearTimeout(viewTimer);
      if (!touchFor(productId) || !measurement() || win.document.visibilityState !== 'visible') return;
      if (routeTiming?.productId === productId && routeTiming.eligible && routeTiming.durationMs === null) {
        const duration = Math.round(timingNow() - routeTiming.startedAt);
        recordTiming('deep_link_to_content_ms',duration);
        if (Number.isInteger(duration) && duration >= 0 && duration <= 300000) routeTiming.durationMs = duration;
      }
      const durationMs = routeTiming?.productId === productId ? routeTiming.durationMs : null;
      // A visible detail view for two seconds is activation; opening a URL alone is not.
      viewTimer = win.setTimeout(() => {
        if (activeProduct === productId && win.document.visibilityState === 'visible'
          && win.document.body.classList.contains('product-detail-open')&&!win.document.body.classList.contains('auth-modal-open')) event('shared_product_viewed',productId,{durationMs});
      },2000);
    }
    function visibility() {
      if (win.document.visibilityState === 'visible') productVisible(activeProduct);
      else { if (viewTimer) win.clearTimeout(viewTimer); if (routeTiming && routeTiming.durationMs === null) routeTiming.eligible = false; }
    }
    const online = () => void flush();
    const navigation = () => capture();
    win.addEventListener('online',online); win.addEventListener('popstate',navigation); win.document.addEventListener('visibilitychange',visibility);
    capture(); void flush();void refreshCapabilities();
    return { refreshCapabilities,recordTiming,getTimingSamples:()=>Object.fromEntries([...timingMetrics].map(([name,samples])=>[name,[...samples]])),prepareShare,prepareSellerReferral,referralVisible,noteInternalShare,internalContentOpened,event,capture,productVisible,flush,roomInviteTouch,roomEvent,roomOrderStarted,contentVisible,contentFollowed,contentSaved,collectionProductOpened,getSessionId:()=>{syncIdentity();return sessionId;},
      getJourney: () => JSON.parse(JSON.stringify(journey)),
      getHealth: () => ({ pending:queue.length,deadLetters:dead.length }),
      retryDeadLetters() {
        const retryable = dead.filter(item => item.account === account() && freshRecord(item));
        dead = dead.filter(item => !retryable.includes(item));
        storage('localStorage','setItem','winga-growth-dead-v1',JSON.stringify(dead));
        for (const item of retryable) enqueue(item.kind,item.payload,item.createdAt);
        return retryable.length;
      },
      close() { closed = true;capabilityGeneration++;if(capabilityTimer)win.clearTimeout(capabilityTimer); for(const timer of contentTimers.values())win.clearTimeout(timer);contentTimers.clear(); if (retryTimer) win.clearTimeout(retryTimer); if (viewTimer) win.clearTimeout(viewTimer);
        win.removeEventListener('online',online); win.removeEventListener('popstate',navigation); win.document.removeEventListener('visibilitychange',visibility); }
    };
  }
  window.WingaModules.growth.createRuntime = createRuntime;
})();
