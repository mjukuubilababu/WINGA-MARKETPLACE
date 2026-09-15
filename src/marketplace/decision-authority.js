(function registerMarketplaceDecisionAuthority() {
  window.WingaModules = window.WingaModules || {};
  window.WingaModules.marketplace = window.WingaModules.marketplace || {};

  const POLICY_VERSION = "wip-frontend-decision-policy-v1";

  function uniqueProducts(products = [], allowVariants = false) {
    const seen = new Set();
    return (Array.isArray(products) ? products : []).filter(product => {
      const id = String(product?.id || "");
      const variantIndex = Number(product?.feedInitialImageIndex ?? product?.visibleImageIndex ?? 0) || 0;
      const identity = allowVariants && product?.feedVariantResurface
        ? `${id}:variant:${variantIndex}`
        : id;
      if (!id || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }

  function validCandidateSet(input, output, requireAll = true) {
    if ((requireAll && input.length !== output.length) || output.length > input.length) return false;
    const ids = new Set(input.map(product => String(product?.id || "")));
    return output.every(product => ids.has(String(product?.id || "")));
  }

  function createDecisionId(domain, products, now) {
    const first = products[0]?.id || "empty";
    return `frontend_${domain}_${String(first).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)}_${Math.floor(now / 60000)}`;
  }

  function createMarketplaceDecisionAuthority(deps = {}) {
    let lastDecision = null;

    function decide(domain, products, context = {}) {
      const input = uniqueProducts(products);
      const now = Number(context.now || Date.now());
      const intelligenceHealthy = context.intelligenceHealthy !== false;
      const ranker = domain === "home_feed" ? deps.rankHomeFeed : deps.rankSurface;
      let output = [];
      let fallback = false;
      let reasonCodes = [];
      if (intelligenceHealthy && typeof ranker === "function") {
        try {
          output = uniqueProducts(ranker(input.slice(), context), domain === "home_feed");
          if (!validCandidateSet(input, output, domain === "home_feed")) {
            output = [];
            reasonCodes.push("invalid_candidate_contract");
          }
        } catch (error) {
          deps.onDecisionError?.(domain, error);
          reasonCodes.push("intelligence_unavailable");
        }
      } else {
        reasonCodes.push("intelligence_unavailable");
      }
      if (!output.length && input.length) {
        fallback = true;
        const fallbackRanker = typeof deps.deterministicFallback === "function"
          ? deps.deterministicFallback
          : items => items;
        output = uniqueProducts(fallbackRanker(input.slice(), context), domain === "home_feed");
        if (!validCandidateSet(input, output, domain === "home_feed")) output = input;
        reasonCodes.push("deterministic_fallback");
      }
      const sponsoredCount = output.filter(product => Boolean(product?.sponsored || product?.isSponsored)).length;
      if (sponsoredCount) reasonCodes.push("sponsored_disclosure_preserved");
      lastDecision = Object.freeze({
        decisionId: createDecisionId(domain, output, now),
        decisionType: domain === "home_feed" ? "RANK_FEED_CANDIDATE" : "RANK_DISCOVERY_CANDIDATE",
        targetContext: domain,
        selectedAction: "APPLY_RANKING_RESULT",
        policyVersion: POLICY_VERSION,
        reasonCodes: Object.freeze(Array.from(new Set(reasonCodes))),
        candidateCount: input.length,
        outputCount: output.length,
        sponsoredCount,
        fallback,
        createdAt: new Date(now).toISOString()
      });
      return { products: output, decision: lastDecision };
    }

    return Object.freeze({
      rankHomeFeed: (products, context) => decide("home_feed", products, context).products,
      rankDiscoverySurface: (products, context) => decide("discovery", products, context).products,
      decide,
      getLastDecision: () => lastDecision
    });
  }

  window.WingaModules.marketplace.createDecisionAuthority = createMarketplaceDecisionAuthority;
})();
