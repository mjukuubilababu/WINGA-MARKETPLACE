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
    return { loadFollows, loadFollowSuggestions, loadSocialProfile, setFollow, importLegacyFollows, setBlock };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.social = window.WingaModules.api.social || {};
  window.WingaModules.api.social.createSocialApiClient = createSocialApiClient;
})();
