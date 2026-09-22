(() => {
  function createCommunicationsApiClient(deps = {}) {
    const baseUrl = String(deps.baseUrl || "").replace(/\/+$/, "");
    const fetchJson = typeof deps.fetchJson === "function" ? deps.fetchJson : null;
    const createAuthHeaders = typeof deps.createAuthHeaders === "function" ? deps.createAuthHeaders : () => ({});
    const getEventSource = typeof deps.getEventSource === "function" ? deps.getEventSource : () => globalThis.EventSource;
    let messageCapabilities = null;

    async function prepareMessage(payload) {
      requireFetcher();
      if (payload?.clientMessageId) return payload;
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
      const data = await fetchJson(`${baseUrl}/messages`, {
        headers: authHeaders()
      });
      return Array.isArray(data) ? data : [];
    }

    async function loadMessagePage(path, options = {}) {
      requireFetcher();
      const params = new URLSearchParams();
      if (options.limit !== undefined) params.set("limit", String(options.limit));
      if (options.cursor) params.set("cursor", options.cursor);
      if (options.withUser) params.set("withUser", options.withUser);
      return fetchJson(`${baseUrl}/messages/${path}?${params}`, { headers: authHeaders() });
    }

    async function sendMessage(payload) {
      requireFetcher();
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
      return fetchJson(`${baseUrl}/messages/read`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
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
      const EventSourceCtor = getEventSource();
      if (typeof EventSourceCtor === "undefined") {
        return null;
      }

      const source = new EventSourceCtor(`${baseUrl}/messages/stream`, { withCredentials: true });
      const replay = handlers.replayState;
      let closed = false;
      let recovering = false;
      let recoveryTimer = null;
      const isCurrent = () => !closed && (!handlers.isCurrent || handlers.isCurrent());
      async function recover() {
        if (!replay || !handlers.reconcile || recovering || !isCurrent()) return;
        recovering = true;
        let cursor = replay.cursor || "";
        let hasMore = false;
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
            if (result.resyncRequired) { hasMore = true; break; }
            if (!hasMore) break;
          }
          if (!isCurrent()) return;
          await handlers.reconcile();
          if (!isCurrent()) return;
          replay.cursor = cursor;
          if (hasMore) recoveryTimer = setTimeout(recover, 250);
        } catch (_error) {
          // Optional recovery cannot disable human chat or advance a failed batch.
          if (isCurrent()) {
            try { await handlers.reconcile(); } catch (_fallbackError) { /* Existing refresh telemetry owns this failure. */ }
          }
        } finally {
          recovering = false;
        }
      }
      source.addEventListener("open", recover);
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
          closed = true;
          clearTimeout(recoveryTimer);
          source.close();
        }
      };
    }

    return {
      prepareMessage,
      loadMessages,
      loadInboxPage: (options) => loadMessagePage("inbox", options),
      loadConversationPage: (withUser, options = {}) => loadMessagePage("history", { ...options, withUser }),
      sendMessage,
      deleteMessage,
      markConversationRead,
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
