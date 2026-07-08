(() => {
  function createCommunicationsApiClient(deps = {}) {
    const baseUrl = String(deps.baseUrl || "").replace(/\/+$/, "");
    const fetchJson = typeof deps.fetchJson === "function" ? deps.fetchJson : null;
    const createAuthHeaders = typeof deps.createAuthHeaders === "function" ? deps.createAuthHeaders : () => ({});
    const getEventSource = typeof deps.getEventSource === "function" ? deps.getEventSource : () => globalThis.EventSource;

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
          source.close();
        }
      };
    }

    return {
      loadMessages,
      sendMessage,
      deleteMessage,
      markConversationRead,
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
