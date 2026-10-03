(() => {
  function createCommunicationsApiClient(deps = {}) {
    const baseUrl = String(deps.baseUrl || "").replace(/\/+$/, "");
    const fetchJson = typeof deps.fetchJson === "function" ? deps.fetchJson : null;
    const createAuthHeaders = typeof deps.createAuthHeaders === "function" ? deps.createAuthHeaders : () => ({});
    const getEventSource = typeof deps.getEventSource === "function" ? deps.getEventSource : () => globalThis.EventSource;
    let messageCapabilities = null;
    let phoenix = null;
    let encryptedConversations = deps.encryptedConversations || null;
    let candidateReady = null;
    let encryptionReady = null;
    let encryptionOwner = '';
    let encryptionService = null;
    let encryptionChanged = () => {};
    let api;
    const networkFailure = error => error instanceof TypeError || error.status === 503;
    function ensureEncryption() {
      const s = deps.getSession?.();
      if (!s?.username || !globalThis.WingaEncryptionSession) return Promise.resolve(null);
      const key = JSON.stringify([s.username,s.sessionId,s.token]);
      if (key !== encryptionOwner) {
        if(encryptedConversations === encryptionService)encryptedConversations=null;
        encryptionService?.close(); encryptionService = null; encryptionReady = null; encryptionOwner = key;
      }
      if (!encryptionReady) encryptionReady = (async () => {
        let capabilities;
        try { capabilities = await fetchJson(`${baseUrl}/conversations/encrypted/capabilities`, {headers:authHeaders()}); }
        catch(error) { if(error.status === 404) return null; throw error; }
        if(capabilities?.enabled !== true || capabilities.version !== 1) return null;
        const service = await globalThis.WingaEncryptionSession.createEncryptionSession({
          getSession:deps.getSession,deviceRequest:api.cryptoDeviceRequest,
          packageRequest:(payload,context)=>api.cryptoPackageRequest('POST',payload,context),
          operationRequest:payload=>fetchJson(`${baseUrl}/conversations/encrypted/operations`,{method:'POST',headers:jsonHeaders(),body:JSON.stringify(payload)}),
          onChange:()=>encryptionChanged(),
          mediaEnabled:capabilities.mediaEnabled===true,mediaRequest:api.cryptoMediaRequest,
        });
        if(encryptionOwner !== key) {service.close();throw new Error('mls_session_changed');}
        encryptedConversations = encryptionService = service;return service;
      })();
      return encryptionReady;
    }
    async function isEncryptedConversation(peer) {
      await ensureEncryption();
      const active = deps.getSession?.(), session = active ? { ...active } : null;
      const validName = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
      const unchanged = () => {
        const current = deps.getSession?.();
        if (session && (current?.username !== session.username || current?.sessionId !== session.sessionId || current?.token !== session.token)) {
          throw Object.assign(new Error('mls_session_changed'), { code: 'mls_session_changed' });
        }
      };
      const stored = validName(session?.username) && validName(peer) && peer !== session.username && globalThis.WingaEncryptedPolicy
        ? await globalThis.WingaEncryptedPolicy.isEncrypted(session.username, peer) : false;
      unchanged();
      const loaded = encryptedConversations ? await encryptedConversations.isEncrypted(peer) : false;
      unchanged();
      if(stored || loaded)return true;
      if(globalThis.WingaEncryptionSession && validName(session?.username) && validName(peer) && peer!==session.username) {
        const mode=await fetchJson(`${baseUrl}/conversations/encrypted/mode?peer=${encodeURIComponent(peer)}`,{headers:authHeaders()});
        unchanged();if(mode?.version!==1 || !['encrypted','legacy-plaintext'].includes(mode.mode))runtimeRequired();
        if(mode.mode==='encrypted'){await globalThis.WingaEncryptedPolicy.markEncrypted(session.username,peer);unchanged();return true;}
      }
      return false;
    }
    const runtimeRequired = () => { throw Object.assign(new Error('mls_runtime_required'), { code: 'mls_runtime_required' }); };

    async function prepareMessage(payload) {
      requireFetcher();
      if (payload?.clientMessageId) return payload;
      if (await isEncryptedConversation(payload?.receiverId)) {
        if (!encryptedConversations) runtimeRequired();
        const clientMessageId = globalThis.crypto?.randomUUID?.();
        if (!clientMessageId) throw Object.assign(new Error('mls_identifier_unavailable'), { code: 'mls_identifier_unavailable' });
        return { ...payload, clientMessageId };
      }
      if (!messageCapabilities) {
        messageCapabilities = fetchJson(`${baseUrl}/messages/capabilities`, { headers: authHeaders() })
          .catch((error) => {
            messageCapabilities = null;
            if (error.status === 404) return { durableMessageRetries: false };
            throw error;
          });
      }
      const capabilities = await messageCapabilities;
      if (capabilities?.durableMessageRetries !== true) return payload;
      const clientMessageId = globalThis.crypto?.randomUUID?.();
      if (!clientMessageId) throw new Error("Secure message identifiers are unavailable.");
      return { ...payload, clientMessageId };
    }

    function requireFetcher() {
      if (typeof fetchJson !== "function") {
        throw new Error("Winga communications API client requires fetchJson.");
      }
    }

    function jsonHeaders() {
      return {
        "Content-Type": "application/json",
        ...createAuthHeaders()
      };
    }

    function authHeaders() {
      return {
        ...createAuthHeaders()
      };
    }

    async function loadMessages() {
      requireFetcher();
      const encrypted = await ensureEncryption();
      if(encrypted)try{await encrypted.sync();}catch(error){if(!networkFailure(error))throw error;}
      let data;
      try { data=await fetchJson(`${baseUrl}/messages`, {headers:authHeaders()}); }
      catch(error){if(!encrypted || !networkFailure(error))throw error;data=[];}
      return [...(Array.isArray(data) ? data : []), ...(encrypted ? await encrypted.history() : [])];
    }

    async function loadMessagePage(path, options = {}) {
      requireFetcher();
      const params = new URLSearchParams();
      if (options.limit !== undefined) params.set("limit", String(options.limit));
      if (options.cursor) params.set("cursor", options.cursor);
      if (options.withUser) params.set("withUser", options.withUser);
      if (options.order === "sequence") params.set("order", "sequence");
      const encrypted = ['inbox','history'].includes(path) ? await ensureEncryption() : null;
      if(encrypted)try{await encrypted.sync();}catch(error){if(!networkFailure(error))throw error;}
      let page;
      try { page=await fetchJson(`${baseUrl}/messages/${path}?${params}`, {headers:authHeaders()}); }
      catch(error){if(!encrypted || !networkFailure(error))throw error;page={items:[],hasMore:false,nextCursor:''};}
      if(!encrypted) return page;
      const history = await encrypted.history(options.withUser);
      if(path === 'history') return {...page,items:[...page.items,...history].sort((a,b)=>a.timestamp.localeCompare(b.timestamp))};
      if(path === 'inbox') {
        const merged = new Map(page.items.map(item=>[item.withUser,item]));
        for(const item of history) {
          const own=deps.getSession().username,peer=item.senderId===own?item.receiverId:item.senderId;
          const prior=merged.get(peer);
          if(!prior || Date.parse(item.timestamp)>=Date.parse(prior.timestamp))merged.set(peer,{withUser:peer,latestMessage:item.message,timestamp:item.timestamp,
            lastMessageId:item.id,productId:'',productName:'',unreadCount:history.filter(m=>m.senderId===peer && !m.isRead).length});
        }
        return {...page,items:[...merged.values()].sort((a,b)=>b.timestamp.localeCompare(a.timestamp))};
      }
      return page;
    }

    async function sendMessage(payload) {
      requireFetcher();
      if (await isEncryptedConversation(payload?.receiverId)) {
        // Resolve durable mode before touching either legacy transport. A lookup
        // or encryption failure is not permission to send plaintext instead.
        if (!encryptedConversations) runtimeRequired();
        return encryptedConversations.sendMessage(payload);
      }
      if (payload?.encrypted || payload?.securityMode === 'encrypted') {
        throw Object.assign(new Error('mls_runtime_required'), { code: 'mls_runtime_required' });
      }
      const transported = await phoenix?.sendMessage(payload);
      if (transported) return transported;
      return fetchJson(`${baseUrl}/messages`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function deleteMessage(messageId) {
      requireFetcher();
      return fetchJson(`${baseUrl}/messages/${encodeURIComponent(messageId)}`, {
        method: "DELETE",
        headers: authHeaders()
      });
    }

    async function markConversationRead(payload) {
      requireFetcher();
      const encrypted=await ensureEncryption();
      if(encrypted && await encrypted.isEncrypted(payload.withUser)) {
        await encrypted.markRead(payload.withUser,payload.messageIds);return {ok:true};
      }
      return fetchJson(`${baseUrl}/messages/read`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
    }

    async function loadChatDevice() {
      requireFetcher();
      return fetchJson(`${baseUrl}/messages/device`, { headers: authHeaders() });
    }

    async function acknowledgeMessages(payload) {
      requireFetcher();
      return fetchJson(`${baseUrl}/messages/receipts`, {
        method: "POST", headers: jsonHeaders(), body: JSON.stringify(payload)
      });
    }

    async function loadConversationOffers(withUser) {
      requireFetcher();
      const data = await fetchJson(`${baseUrl}/conversations/${encodeURIComponent(withUser)}/offers`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data : [];
    }

    async function createConversationOffer(withUser, payload, idempotencyKey) {
      requireFetcher();
      return fetchJson(`${baseUrl}/conversations/${encodeURIComponent(withUser)}/offers`, {
        method: "POST",
        headers: {
          ...jsonHeaders(),
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(payload)
      });
    }

    async function transitionConversationOffer(offerId, payload, idempotencyKey) {
      requireFetcher();
      return fetchJson(`${baseUrl}/conversation-offers/${encodeURIComponent(offerId)}`, {
        method: "PATCH",
        headers: {
          ...jsonHeaders(),
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(payload)
      });
    }

    async function loadConversationAvailabilityRequests(withUser) {
      requireFetcher();
      const data = await fetchJson(`${baseUrl}/conversations/${encodeURIComponent(withUser)}/availability-requests`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data : [];
    }

    async function findOfferBetterPrice(offerId) {
      requireFetcher();
      return fetchJson(`${baseUrl}/conversation-offers/${encodeURIComponent(offerId)}/better-price`, {
        method: "POST", headers: jsonHeaders(), body: "{}"
      });
    }

    async function createConversationAvailabilityRequest(withUser, payload, idempotencyKey) {
      requireFetcher();
      return fetchJson(`${baseUrl}/conversations/${encodeURIComponent(withUser)}/availability-requests`, {
        method: "POST",
        headers: {
          ...jsonHeaders(),
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(payload)
      });
    }

    async function transitionConversationAvailabilityRequest(requestId, payload, idempotencyKey) {
      requireFetcher();
      return fetchJson(`${baseUrl}/conversation-availability/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        headers: {
          ...jsonHeaders(),
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(payload)
      });
    }

    async function loadNotifications() {
      requireFetcher();
      const data = await fetchJson(`${baseUrl}/notifications`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data : [];
    }

    async function markNotificationRead(notificationId) {
      requireFetcher();
      return fetchJson(`${baseUrl}/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: "PATCH",
        headers: authHeaders()
      });
    }

    function openRealtimeChannel(handlers = {}) {
      encryptionChanged = () => { if(!handlers.isCurrent || handlers.isCurrent()) Promise.resolve(handlers.onMessageRead?.()).catch(()=>{}); };
      let encryptionPolling = false;
      const encryptionTimer = setInterval(async () => {
        if(encryptionPolling || (handlers.isCurrent && !handlers.isCurrent())) return;
        encryptionPolling=true;
        try { const service=await ensureEncryption();if(service)await service.sync(); }
        catch(error) { handlers.onError?.(); }
        finally { encryptionPolling=false; }
      },3000);
      const EventSourceCtor = getEventSource();
      if (typeof EventSourceCtor === "undefined") {
        clearInterval(encryptionTimer);
        return null;
      }

      const source = new EventSourceCtor(`${baseUrl}/messages/stream`, { withCredentials: true });
      const replay = handlers.replayState;
      let closed = false;
      let recovering = false;
      let recoveryRequested = false;
      let recoveryTimer = null;
      const isCurrent = () => !closed && (!handlers.isCurrent || handlers.isCurrent());
      phoenix?.close();
      phoenix = null;
      let deviceStream = null;
      const session = deps.getSession?.();
      const sessionKey = value => JSON.stringify([value?.username || "", value?.sessionId || value?.token || ""]);
      const ownerKey = sessionKey(session);
      const transport = window.WingaModules?.api?.phoenix;
      const config = () => deps.getTransportConfig?.() || {};
      const transportUrl = transport?.canaryUrl(config(), session);
      const canStream = () => isCurrent() && ownerKey === sessionKey(deps.getSession?.())
        && transport?.canaryUrl(config(), deps.getSession?.()) === transportUrl;
      if (transportUrl && typeof handlers.onDeviceEvents === "function") {
        loadChatDevice().then(device => {
          if (!canStream() || device?.supported !== true || device?.eventDelivery !== true
            || device.username !== session.username || !device.deviceId) return;
          deviceStream = transport.createPhoenixTransport({
            url: transportUrl, owner: session.username, deviceId: device.deviceId,
            isCurrent: canStream,
            fetchTicket: () => fetchJson(`${baseUrl}/messages/transport-ticket`, {
              method: "POST", headers: jsonHeaders(), body: "{}"
            }),
            onEvents: handlers.onDeviceEvents,
            onState: handlers.onTransportState
          });
          phoenix = deviceStream;
        }).catch(() => { /* REST/SSE remains active when canary enrollment is unavailable. */ });
      }
      async function recover() {
        if (!replay || !handlers.reconcile || !isCurrent()) return;
        if (recovering) { recoveryRequested = true; return; }
        clearTimeout(recoveryTimer);
        recoveryTimer = null;
        recoveryRequested = false;
        recovering = true;
        let cursor = replay.cursor || "";
        let hasMore = false;
        let resyncRequired = false;
        try {
          for (let page = 0; page < 5; page += 1) {
            let result;
            try {
              result = await loadMessagePage("replay", { cursor, limit: 50 });
            } catch (error) {
              if (error.status === 400 && cursor) {
                cursor = "";
                result = await loadMessagePage("replay", { limit: 50 });
              } else throw error;
            }
            if (!isCurrent()) return;
            if (!result || result.version !== 1 || typeof result.cursor !== "string"
              || !result.cursor || !Array.isArray(result.events)) throw new Error("Invalid replay response");
            if (result.hasMore && result.cursor === cursor) throw new Error("Replay cursor did not advance");
            cursor = result.cursor;
            hasMore = result.hasMore === true;
            // Initial checkpoint precedes reconciliation; catch up again afterwards
            // so messages committed during that reconciliation are not skipped.
            if (result.resyncRequired) { resyncRequired = true; hasMore = true; break; }
            if (!hasMore) break;
          }
          if (!isCurrent()) return;
          await handlers.reconcile({ resyncRequired });
          if (!isCurrent()) return;
          replay.cursor = cursor;
          if (hasMore) recoveryTimer = setTimeout(recover, 250);
        } catch (_error) {
          // Optional recovery cannot disable human chat or advance a failed batch.
          if (isCurrent()) {
            try { await handlers.reconcile({ resyncRequired: true }); } catch (_fallbackError) { /* Existing refresh telemetry owns this failure. */ }
          }
        } finally {
          recovering = false;
          if (recoveryRequested && isCurrent() && !recoveryTimer) {
            recoveryTimer = setTimeout(recover, 250);
          }
        }
      }
      source.addEventListener("open", recover);
      source.addEventListener("message_state_changed", recover);
      source.addEventListener("replay_required", recover);
      const parseEvent = (event) => {
        try {
          return event?.data ? JSON.parse(event.data) : null;
        } catch (_error) {
          return null;
        }
      };

      source.addEventListener("message", (event) => {
        handlers.onMessage?.(parseEvent(event));
      });
      source.addEventListener("notification", (event) => {
        handlers.onNotification?.(parseEvent(event));
      });
      source.addEventListener("message_read", (event) => {
        handlers.onMessageRead?.(parseEvent(event));
      });
      source.addEventListener("conversation_read", (event) => {
        handlers.onConversationRead?.(parseEvent(event));
      });
      source.addEventListener("users", (event) => {
        handlers.onUsers?.(parseEvent(event));
      });
      source.onerror = () => {
        handlers.onError?.();
      };

      return {
        close() {
          clearInterval(encryptionTimer);
          encryptionChanged=()=>{};
          if(encryptedConversations === encryptionService)encryptedConversations=null;
          encryptionService?.close();encryptionService=null;encryptionReady=null;encryptionOwner='';
          closed = true;
          deviceStream?.close();
          if (phoenix === deviceStream) phoenix = null;
          clearTimeout(recoveryTimer);
          source.close();
        }
      };
    }

    return api = {
      inspectEncryptedConversation: async peer => {
        const service=await ensureEncryption();return service?service.inspect(peer):{status:'disabled'};
      },
      enableEncryptedConversation: async (peer,deviceId,fingerprint) => {
        const service=await ensureEncryption();if(!service)runtimeRequired();return service.enable(peer,deviceId,fingerprint);
      },
      sendEncryptedMedia:async(peer,file,text)=>{const s=await ensureEncryption();if(!s)runtimeRequired();return s.sendEncryptedMedia(peer,file,text);},
      downloadEncryptedMedia:async id=>{const s=await ensureEncryption();if(!s)runtimeRequired();return s.downloadEncryptedMedia(id);},
      encryptedRecoveryAvailable:async()=>{try {const r=await fetchJson(`${baseUrl}/conversations/recovery/capabilities`,{headers:authHeaders()});return r.version===1&&r.enabled===true;}catch(error){if(error.status===404)return false;throw error;}},
      createEncryptedRecovery:()=>globalThis.WingaRecoveryUi.createRecoverySession({getSession:deps.getSession,request:api.cryptoRecoveryRequest}),
      cryptoMediaRequest:async(method,object,proof,blob)=>{
        requireFetcher();if(!['GET','PUT'].includes(method))throw new Error('private_media_invalid');
        const encoded=btoa(JSON.stringify(proof)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
        const response=await fetch(`${baseUrl}/conversations/encrypted/media/${object.id}`,{method,headers:{...jsonHeaders(),'Content-Type':'application/octet-stream','X-Winga-Crypto-Proof':encoded},...(method==='PUT'?{body:blob}:{}),signal:AbortSignal.timeout(30000)});
        if(!response.ok){const value=await response.json();throw Object.assign(new Error(value.code),{code:value.code,status:response.status});}
        if(method==='PUT')return response.json();
        if(response.headers.get('content-type')!=='application/octet-stream')throw new Error('private_media_integrity_rejected');
        const reader=response.body.getReader(),chunks=[];let bytes=0;
        try {while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>object.bytes)throw new Error('private_media_integrity_rejected');chunks.push(part.value);}}
        finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
        if(bytes!==object.bytes)throw new Error('private_media_integrity_rejected');return new Blob(chunks,{type:'application/octet-stream'});
      },
      createEncryptedCandidate: options => {
        if (candidateReady) return candidateReady;
        candidateReady = (async () => {
          const session = deps.getSession?.();
          const create = globalThis.WingaMlsCandidate?.createMlsRuntime;
          if (!session?.username || typeof create !== 'function'
            || !globalThis.WingaCryptoDevices?.createCryptoDeviceClient
            || !globalThis.WingaEncryptedVault?.createEncryptedVault) {
            throw Object.assign(new Error('mls_runtime_unavailable'), { code: 'mls_runtime_unavailable' });
          }
          let identityClient, vault, runtime;
          try {
            identityClient = await globalThis.WingaCryptoDevices.createCryptoDeviceClient({
              getSession: deps.getSession, request: api.cryptoDeviceRequest,
            });
            vault = await globalThis.WingaEncryptedVault.createEncryptedVault({ owner: session.username, getSession: deps.getSession });
            runtime = await create({ ...options, getSession: deps.getSession, vault, identityClient,
              publishPackage: (payload, context) => api.cryptoPackageRequest('POST', payload, context) });
            await runtime.initialize();
            const close = runtime.close;
            runtime.close = () => { close(); vault.close(); identityClient.close(); };
            return runtime;
          } catch (error) { runtime?.close(); vault?.close(); identityClient?.close(); throw error; }
        })();
        // Failed opt-in stays fail-closed; it cannot quietly restore legacy send.
        encryptedConversations = {
          isEncrypted: async peer => (await candidateReady).isEncrypted(peer),
          sendMessage: async payload => (await candidateReady).sendMessage(payload),
          retryMessage: async id => (await candidateReady).retryMessage(id),
        };
        return candidateReady;
      },
      isEncryptedConversation,
      retryEncryptedMessage: async id => { await ensureEncryption();return encryptedConversations?.retryMessage ? encryptedConversations.retryMessage(id) : null; },
      prepareMessage,
      cryptoDeviceRequest: (method, payload, context) => {
        requireFetcher();
        const active = deps.getSession?.();
        if (!active || active.username !== context?.owner || active.sessionId !== context.deviceId
          || active.token !== context.token) throw new Error("crypto_device_session_changed");
        if (!['GET', 'POST'].includes(method)) throw new Error("crypto_device_method_invalid");
        return fetchJson(`${baseUrl}/conversations/crypto/devices`, {
          method, headers: method === 'POST' ? jsonHeaders() : authHeaders(),
          ...(method === 'POST' ? { body: JSON.stringify(payload) } : {})
        });
      },
      cryptoPackageRequest: (method, payload, context) => {
        requireFetcher();
        const active = deps.getSession?.();
        if (!active || active.username !== context?.owner || active.sessionId !== context.deviceId
          || active.token !== context.token) throw new Error("crypto_device_session_changed");
        if (!['GET', 'POST'].includes(method)) throw new Error("crypto_device_method_invalid");
        return fetchJson(`${baseUrl}/conversations/crypto/key-packages`, {
          method, headers: method === 'POST' ? jsonHeaders() : authHeaders(),
          ...(method === 'POST' ? { body: JSON.stringify(payload) } : {})
        });
      },
      cryptoRecoveryRequest: (method, payload, context) => {
        requireFetcher();
        const active = deps.getSession?.();
        if (!active || active.username !== context?.owner || active.sessionId !== context.deviceId
          || active.token !== context.token) throw new Error("crypto_device_session_changed");
        if (!['GET', 'PUT', 'DELETE'].includes(method)) throw new Error("crypto_device_method_invalid");
        return fetchJson(`${baseUrl}/conversations/recovery`, {
          method, headers: method === 'GET' ? authHeaders() : jsonHeaders(),
          ...(method === 'GET' ? {} : { body: JSON.stringify(payload) })
        });
      },
      hasDeviceEventStream: () => phoenix?.isReady() === true,
      loadMessages,
      loadInboxPage: (options) => loadMessagePage("inbox", options),
      loadConversationPage: (withUser, options = {}) => loadMessagePage("history", { ...options, withUser }),
      sendMessage,
      deleteMessage,
      markConversationRead,
      loadChatDevice,
      pollDeviceEvents: () => {
        requireFetcher();
        return fetchJson(`${baseUrl}/messages/device-events/poll`, { method: "POST", headers: jsonHeaders(), body: "{}" });
      },
      acknowledgeDeviceEvents: payload => {
        requireFetcher();
        return fetchJson(`${baseUrl}/messages/device-events/ack`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(payload) });
      },
      pushRequest: (path, payload, method = "GET") => {
        requireFetcher();
        return fetchJson(`${baseUrl}/messages/push/${path}`, {
          method, headers: jsonHeaders(), ...(payload ? { body: JSON.stringify(payload) } : {})
        });
      },
      loadPendingMessageDelivery: () => loadMessagePage("pending-delivery"),
      acknowledgeMessages,
      loadConversationOffers,
      createConversationOffer,
      transitionConversationOffer,
      findOfferBetterPrice,
      loadConversationAvailabilityRequests,
      createConversationAvailabilityRequest,
      transitionConversationAvailabilityRequest,
      loadNotifications,
      markNotificationRead,
      openRealtimeChannel
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.communications = window.WingaModules.api.communications || {};
  window.WingaModules.api.communications.createCommunicationsApiClient = createCommunicationsApiClient;
})();
