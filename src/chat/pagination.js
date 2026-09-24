(() => {
  function createMessagePagination({ getUser, dataLayer }) {
    let state;
    const emptyPage = () => ({ items: [], nextCursor: "", hasMore: false, loaded: false, loading: false, error: false, revision: 0 });
    const reset = () => { state = { user: getUser(), mode: "unknown", inbox: emptyPage(), histories: new Map(), seen: new Set(), revision: 0, totalUnread: 0 }; };
    const current = () => { if (!state || state.user !== getUser()) reset(); return state; };
    const valid = (s) => state === s && s.user === getUser();
    function requestResync() {
      const s = current();
      s.revision += 1;
      s.inbox.needsResync = true;
      for (const target of s.histories.values()) {
        target.revision += 1;
        target.needsResync = true;
      }
    }
    const timeKey = (value) => {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return "";
      const fraction = String(value).match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1] || "";
      return date.toISOString().slice(0, 19) + "." + fraction.padEnd(6, "0").slice(0, 6);
    };
    const compare = (a, b) => timeKey(a.timestamp).localeCompare(timeKey(b.timestamp)) || String(a.id || a.withUser).localeCompare(String(b.id || b.withUser));
    const merge = (older, newer, key) => Array.from(new Map([...older, ...newer].map(item => [item[key], item])).values());
    function history(withUser) {
      const s = current();
      if (!s.histories.has(withUser)) {
        if (s.histories.size >= 8) s.histories.delete(s.histories.keys().next().value);
        s.histories.set(withUser, emptyPage());
      }
      return s.histories.get(withUser);
    }
    async function inbox(append = false) {
      const s = current(), target = s.inbox;
      if (!s.user || s.mode === "legacy") return false;
      if (target.pending) {
        if (!target.needsResync) return target.pending;
        await target.pending;
        if (!valid(s)) return false;
        return inbox(false);
      }
      if (target.needsResync) append = false;
      if (append && (!target.loaded || !target.hasMore)) return true;
      const revision = s.revision, resync = Boolean(target.needsResync);
      const cursor = append ? target.nextCursor : "";
      target.loading = true; target.error = false;
      target.pending = (async () => {
        try {
          const page = await dataLayer.loadInboxPage?.({ limit: 25, cursor });
          if (!valid(s)) return false;
          if (!page) { s.mode = "legacy"; return false; }
          if (!Array.isArray(page.items)) throw new Error("INVALID_INBOX_PAGE");
          s.mode = "paged";
          if (revision !== s.revision) {
            if (resync) throw new Error("MESSAGE_RESYNC_CHANGED");
            return true;
          }
          const boundary = page.items[page.items.length - 1];
          const retained = append ? target.items : !resync && page.hasMore && boundary ? target.items.filter(item => compare(item, boundary) < 0) : [];
          target.items = merge(retained, page.items, "withUser").sort((a,b) => compare(b,a));
          if (resync || !page.hasMore) target.extended = false;
          if (append || !target.extended || !page.items.length) {
            target.hasMore = Boolean(page.hasMore && page.nextCursor && page.nextCursor !== cursor);
            target.nextCursor = page.nextCursor || "";
          }
          if (append) target.extended = true;
          target.loaded = true;
          target.needsResync = false;
          s.totalUnread = Math.max(0, Number(page.totalUnread) || 0);
          target.totalConversations = Math.max(0, Number(page.totalConversations) || 0);
          return true;
        } catch (error) {
          if (!valid(s)) return false;
          if (s.mode === "unknown" && (error.status === 404 || error.code === "message_pagination_unavailable")) { s.mode = "legacy"; return false; }
          target.error = true;
          throw error;
        } finally { target.loading = false; target.pending = null; }
      })();
      return target.pending;
    }
    async function loadHistory(withUser, older = false) {
      const s = current(), target = history(withUser);
      if (!s.user || s.mode !== "paged" || !withUser) return;
      if (target.pending) {
        if (!target.needsResync) return target.pending;
        await target.pending;
        if (!valid(s) || s.histories.get(withUser) !== target) return;
        return loadHistory(withUser);
      }
      if (target.needsResync) older = false;
      if (older && (!target.loaded || !target.hasMore)) return;
      const revision = target.revision, cursor = older ? target.nextCursor : "", resync = Boolean(target.needsResync);
      target.loading = true; target.error = false;
      target.pending = (async () => {
        try {
          const page = await dataLayer.loadConversationPage(withUser, { limit: 30, cursor });
          if (!valid(s) || s.histories.get(withUser) !== target) return;
          if (revision !== target.revision) {
            if (resync) throw new Error("MESSAGE_RESYNC_CHANGED");
            return;
          }
          if (!page || !Array.isArray(page.items)) throw new Error("INVALID_CONVERSATION_PAGE");
          const boundary = page.items[0];
          const retained = older ? target.items : !resync && page.hasMore && boundary ? target.items.filter(item => compare(item, boundary) < 0) : [];
          target.items = merge(retained, page.items, "id").sort(compare);
          if (resync || !page.hasMore) target.extended = false;
          if (older || !target.extended || !page.items.length) {
            target.hasMore = Boolean(page.hasMore && page.nextCursor && page.nextCursor !== cursor);
            target.nextCursor = page.nextCursor || "";
          }
          if (older) target.extended = true;
          target.loaded = true;
          target.needsResync = false;
        } catch (error) { if (valid(s)) target.error = true; throw error; }
        finally { target.loading = false; target.pending = null; }
      })();
      return target.pending;
    }
    function ingest(message) {
      const s = current();
      if (s.mode !== "paged" || !message?.id || ![message.senderId, message.receiverId].includes(s.user)) return;
      const partner = message.senderId === s.user ? message.receiverId : message.senderId;
      const target = s.histories.get(partner);
      const duplicate = s.seen.has(message.id) || target?.items.some(item => item.id === message.id) || s.inbox.items.some(item => item.lastMessageId === message.id);
      if (duplicate) return;
      s.seen.add(message.id);
      if (s.seen.size > 500) s.seen.delete(s.seen.values().next().value);
      s.revision += 1;
      if (target) { target.items = merge(target.items, [message], "id").sort(compare); target.revision += 1; }
      const existing = s.inbox.items.find(item => item.withUser === partner);
      const unread = message.receiverId === s.user && !message.isRead ? 1 : 0;
      const next = { ...existing, withUser: partner, unreadCount: (existing?.unreadCount || 0) + unread };
      if (!existing || compare(message, { ...existing, id: existing.lastMessageId }) >= 0) Object.assign(next, { lastMessageId: message.id, latestMessage: message.message, timestamp: message.timestamp, productId: message.productId, productName: message.productName });
      s.inbox.items = merge(s.inbox.items, [next], "withUser").sort((a,b) => compare(b,a));
      s.totalUnread += unread;
    }
    return { reset, requestResync, snapshot: current, history, refreshInbox: () => inbox(false), loadMore: () => inbox(true), refreshHistory: user => loadHistory(user), loadOlder: user => loadHistory(user, true), ingest };
  }
  window.WingaModules = window.WingaModules || {};
  window.WingaModules.chat = window.WingaModules.chat || {};
  window.WingaModules.chat.createMessagePagination = createMessagePagination;
})();
