(() => {
  function createSocialApiClient(deps = {}) {
    const baseUrl = String(deps.baseUrl || "").replace(/\/+$/, "");
    const fetchJson = typeof deps.fetchJson === "function" ? deps.fetchJson : null;
    const createAuthHeaders = typeof deps.createAuthHeaders === "function" ? deps.createAuthHeaders : () => ({});

    function requireFetcher() {
      if (!fetchJson) throw new Error("Winga social API client requires fetchJson.");
    }
    function headers(json = false) {
      return { ...(json ? { "Content-Type": "application/json" } : {}), ...createAuthHeaders() };
    }
    async function loadFollows(options = {}) {
      requireFetcher();
      const query = new URLSearchParams({
        direction: String(options.direction || "following") === "followers" ? "followers" : "following",
        limit: String(Math.max(1, Math.min(Number(options.limit || 50) || 50, 100)))
      });
      if (String(options.cursor || "").trim()) query.set("cursor", String(options.cursor).trim());
      return fetchJson(`${baseUrl}/social/follows?${query}`, { headers: headers() });
    }
    async function loadFollowSuggestions(options = {}) {
      requireFetcher();
      const query = new URLSearchParams({
        limit: String(Math.max(1, Math.min(Number(options.limit || 12) || 12, 30)))
      });
      return fetchJson(`${baseUrl}/social/suggestions?${query}`, { headers: headers() });
    }
    async function loadSocialProfile(username, options = {}) {
      requireFetcher();
      const source = String(options.source || "").trim() === "follow" ? "?source=follow" : "";
      return fetchJson(`${baseUrl}/social/users/${encodeURIComponent(String(username || "").trim())}${source}`, { headers: headers() });
    }
    async function loadUserCollections(username, options = {}) {
      requireFetcher();
      const query = new URLSearchParams({
        limit: String(Math.max(1, Math.min(Number(options.limit || 12) || 12, 30)))
      });
      if (String(options.cursor || "").trim()) query.set("cursor", String(options.cursor).trim());
      return fetchJson(`${baseUrl}/social/users/${encodeURIComponent(String(username || "").trim())}/collections?${query}`, {
        headers: headers()
      });
    }
    async function createCollection(payload = {}) {
      requireFetcher();
      return fetchJson(`${baseUrl}/social/collections`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify(payload)
      });
    }
    async function updateCollection(collectionId, payload = {}) {
      requireFetcher();
      return fetchJson(`${baseUrl}/social/collections/${encodeURIComponent(String(collectionId || "").trim())}`, {
        method: "PATCH",
        headers: headers(true),
        body: JSON.stringify(payload)
      });
    }
    async function setCollectionItem(collectionId, productId, options = {}) {
      requireFetcher();
      const remove = Boolean(options.remove);
      return fetchJson(`${baseUrl}/social/collections/${encodeURIComponent(String(collectionId || "").trim())}/items/${encodeURIComponent(String(productId || "").trim())}`, {
        method: remove ? "DELETE" : "PUT",
        headers: headers(true),
        ...(remove ? {} : { body: JSON.stringify({ position: options.position || 0, note: options.note || "" }) })
      });
    }
    async function setFollow(username, following, options = {}) {
      requireFetcher();
      const method = following ? "PUT" : "DELETE";
      const source = String(options.source || "").trim() === "suggested_follow" ? "suggested_follow" : "";
      return fetchJson(`${baseUrl}/social/follows/${encodeURIComponent(String(username || "").trim())}`, {
        method,
        headers: headers(following),
        ...(following ? { body: JSON.stringify(source ? { source } : {}) } : {})
      });
    }
    async function importLegacyFollows(usernames = []) {
      requireFetcher();
      return fetchJson(`${baseUrl}/social/follows/import`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ usernames: Array.from(new Set(usernames)).slice(0, 100) })
      });
    }
    async function setBlock(username, blocked) {
      requireFetcher();
      const method = blocked ? "PUT" : "DELETE";
      return fetchJson(`${baseUrl}/social/blocks/${encodeURIComponent(String(username || "").trim())}`, {
        method,
        headers: headers(blocked),
        ...(blocked ? { body: "{}" } : {})
      });
    }
    async function setContentVisibility(contentType, contentId, visibility) {
      requireFetcher();
      const safeType = String(contentType || "").trim().toLowerCase();
      const safeContentId = String(contentId || "").trim();
      const safeVisibility = String(visibility || "").trim().toLowerCase();
      if (!["product", "reel", "review"].includes(safeType)) throw new Error("Invalid public content type.");
      if (!safeContentId) throw new Error("Content ID is required.");
      if (!["public", "followers", "private"].includes(safeVisibility)) throw new Error("Invalid content visibility.");
      return fetchJson(`${baseUrl}/social/content/${safeType}/${encodeURIComponent(safeContentId)}/visibility`, {
        method: "PATCH",
        headers: headers(true),
        body: JSON.stringify({ visibility: safeVisibility })
      });
    }
    return {
      loadFollows,
      loadFollowSuggestions,
      loadSocialProfile,
      loadUserCollections,
      createCollection,
      updateCollection,
      setCollectionItem,
      setFollow,
      importLegacyFollows,
      setBlock,
      setContentVisibility
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.social = window.WingaModules.api.social || {};
  window.WingaModules.api.social.createSocialApiClient = createSocialApiClient;
})();
