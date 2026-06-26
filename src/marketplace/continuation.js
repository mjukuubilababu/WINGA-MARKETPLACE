(() => {
  function createContinuationHelpers(deps = {}) {
    const now = typeof deps.now === "function" ? deps.now : () => Date.now();
    const hasHealthyMarketplaceCardMedia = typeof deps.hasHealthyMarketplaceCardMedia === "function"
      ? deps.hasHealthyMarketplaceCardMedia
      : () => false;
    const config = {
      pendingHardTimeoutMs: 1200,
      pressureBoundedWaitMs: 900,
      hardPressurePendingMedia: 4,
      prefetchQueuePressureThreshold: 18,
      scrollPrefetchConcurrency: 4,
      feedScrollSpeedPrefetchThreshold: 0.72,
      continuousPendingMediaLookback: 8,
      continuousMaxPendingMediaCards: 2,
      batchAdmissionSlowScrollWaitMs: 140,
      batchAdmissionMaxWaitMs: 90,
      ...(deps.config || {})
    };

    function isCompactLayout(layoutMode = "") {
      const mode = String(layoutMode || "").trim();
      return mode === "mobile" || mode === "standalone-mobile" || mode === "mobile-desktop-site";
    }

    function isContinuationMediaPendingStale(card, maxAgeMs = config.pendingHardTimeoutMs) {
      if (typeof Element === "undefined" || !(card instanceof Element) || card.getAttribute("data-continuation-media-pending") !== "true") {
        return false;
      }
      if (hasHealthyMarketplaceCardMedia(card)) {
        return true;
      }
      const pendingSince = Number(card.dataset.continuationMediaPendingSince || 0);
      if (!Number.isFinite(pendingSince) || pendingSince <= 0) {
        return true;
      }
      return now() - pendingSince >= Math.max(80, Number(maxAgeMs || config.pendingHardTimeoutMs));
    }

    function getAdaptiveContinuationLeadCardCount(scrollSpeed = 0) {
      return Number(scrollSpeed || 0) <= 0.18 ? 3 : 2;
    }

    function getAdaptiveContinuationAdmissionWindowMs(scrollSpeed = 0) {
      return Number(scrollSpeed || 0) <= 0.18
        ? config.batchAdmissionSlowScrollWaitMs
        : config.batchAdmissionMaxWaitMs;
    }

    function getAdaptiveContinuousPendingMediaLookback(layoutMode = "", scrollSpeed = 0) {
      const speed = Number(scrollSpeed || 0);
      if (speed <= 0.18) {
        return isCompactLayout(layoutMode) ? 10 : 8;
      }
      if (speed <= config.feedScrollSpeedPrefetchThreshold) {
        return config.continuousPendingMediaLookback;
      }
      return isCompactLayout(layoutMode) ? 6 : 5;
    }

    function getAdaptiveContinuousPendingMediaCap(layoutMode = "", scrollSpeed = 0) {
      const speed = Number(scrollSpeed || 0);
      if (speed <= 0.18) {
        return isCompactLayout(layoutMode) ? 3 : 2;
      }
      if (speed <= config.feedScrollSpeedPrefetchThreshold) {
        return config.continuousMaxPendingMediaCards;
      }
      return 1;
    }

    function getHomeContinuationPressureSnapshot(input = {}) {
      const pendingCount = Math.max(0, Number(input.pendingCount || 0) || 0);
      const currentPendingCount = Math.max(0, Number(input.currentPendingCount || 0) || 0);
      const prefetchQueueSize = Math.max(0, Number(input.prefetchQueueSize || 0) || 0);
      const inflightPrefetchCount = Math.max(0, Number(input.inflightPrefetchCount || 0) || 0);
      const adaptiveCap = Math.max(1, Number(input.adaptiveCap || config.continuousMaxPendingMediaCards) || config.continuousMaxPendingMediaCards);
      return {
        pendingCount,
        currentPendingCount,
        prefetchQueueSize,
        inflightPrefetchCount,
        adaptiveCap,
        blockedByPendingWindow: pendingCount >= adaptiveCap,
        blockedByFeedPressure: currentPendingCount >= config.hardPressurePendingMedia
          || prefetchQueueSize >= config.prefetchQueuePressureThreshold
          || inflightPrefetchCount >= config.scrollPrefetchConcurrency
      };
    }

    function getHydrationAdmission(input = {}) {
      const snapshot = getHomeContinuationPressureSnapshot(input.snapshot || input);
      const blocked = snapshot.blockedByPendingWindow || snapshot.blockedByFeedPressure;
      if (!blocked) {
        return {
          defer: false,
          reason: "allowed",
          waitedMs: 0,
          nextPressureFirstBlockedAt: 0,
          snapshot
        };
      }
      const nowAt = Number(input.now || now());
      const firstBlockedAt = Number(input.firstBlockedAt || 0) || nowAt;
      const waitedMs = Math.max(0, nowAt - firstBlockedAt);
      if (waitedMs >= config.pressureBoundedWaitMs) {
        return {
          defer: false,
          reason: "bounded_pressure_release",
          waitedMs,
          nextPressureFirstBlockedAt: 0,
          shouldReleasePending: true,
          releaseMaxAgeMs: Math.min(config.pendingHardTimeoutMs, config.pressureBoundedWaitMs),
          snapshot
        };
      }
      return {
        defer: true,
        reason: snapshot.blockedByPendingWindow ? "pending_media" : "feed_pressure",
        waitedMs,
        nextPressureFirstBlockedAt: firstBlockedAt,
        snapshot
      };
    }

    return {
      isContinuationMediaPendingStale,
      getAdaptiveContinuationLeadCardCount,
      getAdaptiveContinuationAdmissionWindowMs,
      getAdaptiveContinuousPendingMediaLookback,
      getAdaptiveContinuousPendingMediaCap,
      getHomeContinuationPressureSnapshot,
      getHydrationAdmission
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.marketplace = window.WingaModules.marketplace || {};
  window.WingaModules.marketplace.createContinuationHelpers = createContinuationHelpers;
})();
