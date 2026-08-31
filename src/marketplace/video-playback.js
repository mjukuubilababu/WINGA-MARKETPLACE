(() => {
  let hlsRuntimePromise = null;

  function loadHlsRuntime(targetWindow, targetDocument, translateUi) {
    if (targetWindow.Hls) return Promise.resolve(targetWindow.Hls);
    if (hlsRuntimePromise) return hlsRuntimePromise;
    hlsRuntimePromise = new Promise((resolve, reject) => {
      const existing = targetDocument.querySelector?.("script[data-winga-hls-runtime]");
      const script = existing || targetDocument.createElement("script");
      const timeoutId = targetWindow.setTimeout(() => {
        hlsRuntimePromise = null;
        reject(Object.assign(new Error(translateUi("video.playbackRuntimeTimeout", {}, "Video playback took too long to start.")), { code: "video_hls_runtime_timeout" }));
      }, 15000);
      const settle = (callback) => {
        targetWindow.clearTimeout(timeoutId);
        callback();
      };
      script.onload = () => settle(() => {
        if (targetWindow.Hls) {
          resolve(targetWindow.Hls);
          return;
        }
        hlsRuntimePromise = null;
        reject(Object.assign(new Error(translateUi("video.playbackUnsupported", {}, "Video playback is not supported on this device.")), { code: "video_hls_unsupported" }));
      });
      script.onerror = () => settle(() => {
        hlsRuntimePromise = null;
        script.remove?.();
        reject(Object.assign(new Error(translateUi("video.playbackRuntimeFailed", {}, "Video playback could not start.")), { code: "video_hls_runtime_failed" }));
      });
      if (!existing) {
        const buildVersion = String(targetWindow.WINGA_BUILD_VERSION || "").trim();
        script.src = `/vendor/hls.light.min.js${buildVersion ? `?v=${encodeURIComponent(buildVersion)}` : ""}`;
        script.async = true;
        script.dataset.wingaHlsRuntime = "true";
        targetDocument.head.appendChild(script);
      }
    });
    return hlsRuntimePromise;
  }

  function createVideoPlaybackController(deps = {}) {
    const requestPlaybackToken = typeof deps.requestPlaybackToken === "function" ? deps.requestPlaybackToken : null;
    const targetWindow = deps.windowObject || window;
    const targetDocument = deps.documentObject || document;
    const reportMetric = typeof deps.reportMetric === "function" ? deps.reportMetric : () => {};
    const metricNow = typeof deps.now === "function" ? deps.now : () => Date.now();
    const translateUi = typeof deps.translateUi === "function" ? deps.translateUi : (_key, _variables, fallback) => String(fallback || "");
    const tokenCache = new Map();
    const stateByNode = new WeakMap();
    const prewarmNodesByTarget = new WeakMap();
    const prewarmQueue = [];
    const boundNodes = new Set();
    const maxCachedTokens = Math.max(8, Number(deps.maxCachedTokens || 64));
    const releaseDelayMs = Math.max(250, Number(deps.releaseDelayMs || 1500));
    const tokenSafetyMs = Math.max(10000, Number(deps.tokenSafetyMs || 30000));
    const maxConcurrentPrewarms = Math.max(1, Math.min(4, Number(deps.maxConcurrentPrewarms || 2)));
    const prewarmTimeoutMs = Math.max(3000, Number(deps.prewarmTimeoutMs || 12000));
    const prewarmRootMargin = String(deps.prewarmRootMargin || "900px 0px");
    const maxNetworkRecoveries = Math.max(0, Math.min(3, Number(deps.maxNetworkRecoveries ?? 2)));
    const maxMediaRecoveries = Math.max(0, Math.min(2, Number(deps.maxMediaRecoveries ?? 1)));
    const recoveryBaseDelayMs = Math.max(100, Number(deps.recoveryBaseDelayMs || 750));
    let activePrewarms = 0;
    let observer = null;
    let prewarmObserver = null;
    let activeNode = null;
    let userPauseLockNode = null;
    let visibilityHandlerInstalled = false;
    let networkHandlersInstalled = false;
    const dominanceSwitchDelta = Math.max(0.05, Math.min(0.3, Number(deps.dominanceSwitchDelta || 0.12)));

    const playbackProfiles = Object.freeze({
      constrained: Object.freeze({
        name: "constrained",
        startLevel: 0,
        maxAutoBitrate: 900000,
        abrEwmaDefaultEstimate: 500000,
        backBufferLength: 4,
        maxBufferLength: 8,
        maxMaxBufferLength: 12
      }),
      balanced: Object.freeze({
        name: "balanced",
        startLevel: -1,
        maxAutoBitrate: 2800000,
        abrEwmaDefaultEstimate: 1500000,
        backBufferLength: 10,
        maxBufferLength: 15,
        maxMaxBufferLength: 24
      }),
      fast: Object.freeze({
        name: "fast",
        startLevel: -1,
        maxAutoBitrate: Number.POSITIVE_INFINITY,
        abrEwmaDefaultEstimate: 3000000,
        backBufferLength: 15,
        maxBufferLength: 20,
        maxMaxBufferLength: 30
      })
    });

    function isSaveDataEnabled() {
      return Boolean(targetWindow.navigator?.connection?.saveData);
    }

    function isNetworkOnline() {
      return targetWindow.navigator?.onLine !== false;
    }

    function getPlaybackProfile() {
      const navigatorObject = targetWindow.navigator || {};
      const connection = navigatorObject.connection || navigatorObject.mozConnection || navigatorObject.webkitConnection || null;
      const effectiveType = String(connection?.effectiveType || "").trim().toLowerCase();
      const downlink = Number(connection?.downlink || 0);
      const rtt = Number(connection?.rtt || 0);
      const deviceMemory = Number(navigatorObject.deviceMemory || 0);
      const hardwareConcurrency = Number(navigatorObject.hardwareConcurrency || 0);
      const constrainedNetwork = ["slow-2g", "2g"].includes(effectiveType)
        || (downlink > 0 && downlink < 1)
        || rtt >= 500;
      const constrainedDevice = (deviceMemory > 0 && deviceMemory <= 2)
        || (hardwareConcurrency > 0 && hardwareConcurrency <= 2);
      if (isSaveDataEnabled() || constrainedNetwork || constrainedDevice) return playbackProfiles.constrained;
      const balancedNetwork = effectiveType === "3g"
        || (downlink > 0 && downlink < 3)
        || rtt >= 250;
      const balancedDevice = (deviceMemory > 0 && deviceMemory <= 4)
        || (hardwareConcurrency > 0 && hardwareConcurrency <= 4);
      if (balancedNetwork || balancedDevice || !effectiveType) return playbackProfiles.balanced;
      return playbackProfiles.fast;
    }

    function shouldPrewarmVideo() {
      return isNetworkOnline() && !isSaveDataEnabled() && getPlaybackProfile().name !== "constrained";
    }

    function getPrewarmLimit() {
      const profileName = getPlaybackProfile().name;
      if (!shouldPrewarmVideo()) return 0;
      if (profileName === "balanced") return Math.min(1, maxConcurrentPrewarms);
      return maxConcurrentPrewarms;
    }

    function getHlsConfig(profile, options = {}) {
      const prewarm = options.prewarm === true;
      return {
        enableWorker: false,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        startLevel: profile.startLevel,
        abrEwmaDefaultEstimate: profile.abrEwmaDefaultEstimate,
        backBufferLength: prewarm ? 0 : profile.backBufferLength,
        maxBufferLength: prewarm ? Math.min(4, profile.maxBufferLength) : profile.maxBufferLength,
        maxMaxBufferLength: prewarm ? Math.min(6, profile.maxMaxBufferLength) : profile.maxMaxBufferLength
      };
    }

    function applyHlsBandwidthCap(hls, profile) {
      if (!hls) return;
      if (!Number.isFinite(profile.maxAutoBitrate)) {
        hls.autoLevelCapping = -1;
        return;
      }
      const levels = Array.isArray(hls.levels) ? hls.levels : [];
      if (levels.length === 0) return;
      let cappedLevel = 0;
      levels.forEach((level, index) => {
        const bitrate = Number(level?.bitrate || level?.maxBitrate || 0);
        if (bitrate > 0 && bitrate <= profile.maxAutoBitrate) cappedLevel = index;
      });
      hls.autoLevelCapping = cappedLevel;
    }

    function normalizeCustomerCode(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^customer-/, "")
        .replace(/\.cloudflarestream\.com$/, "");
    }

    function getCachedToken(providerId) {
      const entry = tokenCache.get(providerId);
      if (!entry || Number(entry.expiresAt || 0) <= Date.now() + tokenSafetyMs) {
        tokenCache.delete(providerId);
        return null;
      }
      return entry.payload;
    }

    function cacheToken(providerId, payload) {
      tokenCache.delete(providerId);
      tokenCache.set(providerId, {
        payload,
        expiresAt: Date.now() + Math.max(1, Number(payload?.expiresInSeconds || 60)) * 1000
      });
      while (tokenCache.size > maxCachedTokens) {
        tokenCache.delete(tokenCache.keys().next().value);
      }
      return payload;
    }

    async function getPlaybackToken(providerId) {
      const cached = getCachedToken(providerId);
      if (cached) return { payload: cached, cached: true, prefetched: false };

      const prefetchMap = targetWindow.__WINGA_BIG_PIPE_VIDEO_TOKEN_PROMISES__;
      if (prefetchMap && typeof prefetchMap.get === "function") {
        const prefetchedPromise = prefetchMap.get(providerId);
        if (prefetchedPromise) {
          prefetchMap.delete?.(providerId);
          const prefetchedPayload = await prefetchedPromise;
          if (prefetchedPayload?.token) {
            return { payload: cacheToken(providerId, prefetchedPayload), cached: false, prefetched: true };
          }
        }
      }

      if (typeof requestPlaybackToken !== "function") {
        const error = new Error("Video playback is unavailable."); // i18n-gate: allow -- internal diagnostic or language-neutral display
        error.code = "video_playback_unavailable";
        throw error;
      }
      const payload = await requestPlaybackToken(providerId);
      return { payload: cacheToken(providerId, payload), cached: false, prefetched: false };
    }

    function emitMetric(event, detail = {}) {
      try {
        reportMetric(event, Object.freeze({ ...detail }));
      } catch (_error) {
        // Playback telemetry must never affect media or feed behavior.
      }
    }

    function getMetricContext(node, state, detail = {}) {
      const card = node?.closest?.("[data-open-product], [data-product-card]");
      const productId = String(card?.dataset?.openProduct || card?.dataset?.productCard || "").trim().slice(0, 100);
      const event = String(detail.event || "lifecycle").slice(0, 80);
      return {
        ...detail,
        ...(productId ? { productId, fingerprint: `video:${event}`.slice(0, 120) } : {}),
        profile: String(state?.playbackProfile || detail.profile || "balanced")
      };
    }

    function emitVideoMetric(node, state, event, detail = {}) {
      emitMetric(event, getMetricContext(node, state, { ...detail, event }));
    }

    function closeWatchSegment(state, timestamp = metricNow()) {
      if (!state?.watchStartedAt) return;
      state.watchedMs += Math.max(0, timestamp - state.watchStartedAt);
      state.watchStartedAt = 0;
    }

    function closeBufferSegment(state, timestamp = metricNow()) {
      if (!state?.bufferStartedAt) return 0;
      const bufferingMs = Math.max(0, timestamp - state.bufferStartedAt);
      state.bufferedMs += bufferingMs;
      state.bufferStartedAt = 0;
      return bufferingMs;
    }

    function emitPlaybackSummary(node, state, reason = "release") {
      if (!state || state.summaryGeneration === state.generation) return;
      const timestamp = metricNow();
      closeWatchSegment(state, timestamp);
      closeBufferSegment(state, timestamp);
      const watchedMs = Math.max(0, Math.round(Number(state.watchedMs || 0)));
      const bufferedMs = Math.max(0, Math.round(Number(state.bufferedMs || 0)));
      if (watchedMs <= 0 && bufferedMs <= 0 && Number(state.playCount || 0) <= 0) return;
      state.summaryGeneration = state.generation;
      const observedMs = watchedMs + bufferedMs;
      emitVideoMetric(node, state, "video_playback_summary", {
        reason: String(reason || "release").slice(0, 40),
        watchedMs,
        bufferedMs,
        bufferRatio: observedMs > 0 ? Math.round((bufferedMs / observedMs) * 1000) / 1000 : 0,
        playCount: Math.max(0, Number(state.playCount || 0)),
        completionCount: Math.max(0, Number(state.completionCount || 0)),
        replayCount: Math.max(0, Number(state.replayCount || 0))
      });
    }

    function settleReadyState(state) {
      state?.resolveReady?.();
      if (state) {
        state.resolveReady = null;
        state.readyPromise = null;
      }
    }

    function clearRecoveryTimer(state) {
      if (!state?.recoveryTimer) return;
      targetWindow.clearTimeout(state.recoveryTimer);
      state.recoveryTimer = 0;
    }

    function markPlaybackFailed(node, state, context = {}) {
      if (!state || state.generation !== context.generation) return;
      clearRecoveryTimer(state);
      state.failed = true;
      state.ready = false;
      state.loading = false;
      state.autoplayRequested = false;
      state.awaitingNetwork = context.retryOnOnline === true;
      if (activeNode === node) activeNode = null;
      node.classList.add("has-playback-error");
      node.classList.remove("is-ready", "is-playing", "is-loading", "is-buffering", "is-prewarming");
      node.setAttribute("aria-busy", "false");
      emitPlaybackSummary(node, state, "error");
      emitVideoMetric(node, state, "video_playback_failed", {
        latencyMs: Math.max(0, metricNow() - Number(context.startedAt || metricNow())),
        code: String(context.code || "video_playback_failed").slice(0, 80),
        profile: String(state.playbackProfile || "balanced"),
        retryOnOnline: state.awaitingNetwork
      });
      const player = node.querySelector("[data-stream-player]");
      state.pauseReason = "playback_error";
      if (player?.pause && !player.paused) player.pause();
      state.hls?.destroy?.();
      state.hls = null;
      player?.remove?.();
      settleReadyState(state);
      reconcileActivePlayback();
    }

    function scheduleHlsRecovery(node, state, hls, video, detail, context = {}) {
      const Hls = context.Hls;
      const errorType = String(detail?.type || "");
      const networkError = errorType === String(Hls?.ErrorTypes?.NETWORK_ERROR || "networkError");
      const mediaError = errorType === String(Hls?.ErrorTypes?.MEDIA_ERROR || "mediaError");
      if (!networkError && !mediaError) return false;

      if (networkError && !isNetworkOnline()) {
        markPlaybackFailed(node, state, {
          ...context,
          code: detail?.details || "video_network_offline",
          retryOnOnline: true
        });
        return true;
      }

      const attemptsKey = networkError ? "networkRecoveryAttempts" : "mediaRecoveryAttempts";
      const attemptLimit = networkError ? maxNetworkRecoveries : maxMediaRecoveries;
      const nextAttempt = Number(state[attemptsKey] || 0) + 1;
      if (nextAttempt > attemptLimit) return false;

      state[attemptsKey] = nextAttempt;
      state.recoveryStartedAt = metricNow();
      clearRecoveryTimer(state);
      const delayMs = Math.min(4000, recoveryBaseDelayMs * (2 ** (nextAttempt - 1)));
      node.classList.add("is-buffering");
      emitVideoMetric(node, state, "video_playback_recovery_attempt", {
        type: networkError ? "network" : "media",
        attempt: nextAttempt,
        delayMs,
        profile: String(state.playbackProfile || "balanced")
      });
      state.recoveryTimer = targetWindow.setTimeout(() => {
        state.recoveryTimer = 0;
        if (state.generation !== context.generation || state.hls !== hls || !node.isConnected) return;
        try {
          if (mediaError) {
            hls.recoverMediaError?.();
            return;
          }
          if (/manifest/i.test(String(detail?.details || ""))) hls.loadSource?.(context.hlsUrl);
          else hls.startLoad?.(-1);
        } catch (error) {
          markPlaybackFailed(node, state, {
            ...context,
            code: error?.code || "video_recovery_failed",
            retryOnOnline: !isNetworkOnline()
          });
        }
      }, delayMs);
      return true;
    }

    function releaseNode(node, options = {}) {
      const state = stateByNode.get(node);
      if (state?.releaseTimer) targetWindow.clearTimeout(state.releaseTimer);
      clearRecoveryTimer(state);
      emitPlaybackSummary(node, state, String(options.reason || (options.forget === true ? "dispose" : "release")));
      if (activeNode === node) activeNode = null;
      if (options.forget === true && userPauseLockNode === node) userPauseLockNode = null;
      if (state) {
        state.generation += 1;
        state.loading = false;
        state.ready = false;
        state.failed = false;
        state.hasPlayed = false;
        state.autoplayRequested = false;
        state.prewarmQueued = false;
        state.awaitingNetwork = false;
        state.networkRecoveryAttempts = 0;
        state.mediaRecoveryAttempts = 0;
        state.recoveryStartedAt = 0;
        state.bufferStartedAt = 0;
        state.watchStartedAt = 0;
        state.watchedMs = 0;
        state.bufferedMs = 0;
        state.playCount = 0;
        state.completionCount = 0;
        state.replayCount = 0;
        state.pendingPlaybackCycle = false;
        state.completionReportedForLoop = false;
        state.lastCurrentTime = 0;
        settleReadyState(state);
      }
      if (state?.hls) {
        state.hls.destroy?.();
        state.hls = null;
      }
      const player = node.querySelector("[data-stream-player]");
      if (player?.pause && !player.paused) {
        if (state) state.pauseReason = "release";
        player.pause();
      } else if (state) {
        state.pauseReason = "";
      }
      player?.removeAttribute?.("src");
      player?.load?.();
      player?.remove?.();
      node.classList.remove("is-playing", "is-ready", "is-loading", "is-buffering", "is-prewarming", "has-playback-error");
      node.setAttribute("aria-busy", "false");
      if (options.forget === true) {
        stateByNode.delete(node);
        node.dataset.videoPlaybackBound = "false";
      }
    }

    function scheduleRelease(node) {
      const state = stateByNode.get(node);
      if (!state) return;
      if (state.releaseTimer) targetWindow.clearTimeout(state.releaseTimer);
      state.releaseTimer = targetWindow.setTimeout(() => releaseNode(node), releaseDelayMs);
    }

    function requestPlayerPlay(player) {
      try {
        const playPromise = player?.play?.();
        playPromise?.catch?.(() => undefined);
      } catch (_error) {
        // Autoplay can be declined by the browser without breaking manual playback.
      }
    }

    function pauseNode(node, reason = "programmatic") {
      const state = stateByNode.get(node);
      if (!state) return;
      state.autoplayRequested = false;
      node.classList.remove("is-playing");
      const player = node.querySelector("[data-stream-player]");
      if (!player?.pause) return;
      if (player.paused) return;
      state.pauseReason = reason;
      player.pause();
    }

    function relinquishActiveNode(reason = "out_of_view") {
      const previousNode = activeNode;
      activeNode = null;
      if (previousNode) pauseNode(previousNode, reason);
    }

    function claimActiveNode(node) {
      if (!node || activeNode === node) return;
      const previousNode = activeNode;
      activeNode = node;
      if (previousNode) pauseNode(previousNode, "superseded");
    }

    function selectDominantNode() {
      let candidate = null;
      let candidateState = null;
      boundNodes.forEach((node) => {
        const state = stateByNode.get(node);
        if (!node.isConnected || !state?.inPlaybackViewport || state.userPaused || state.failed) return;
        if (
          !candidateState
          || state.intersectionRatio > candidateState.intersectionRatio
          || (state.intersectionRatio === candidateState.intersectionRatio && state.viewportDistance < candidateState.viewportDistance)
        ) {
          candidate = node;
          candidateState = state;
        }
      });

      const currentState = activeNode ? stateByNode.get(activeNode) : null;
      if (
        activeNode?.isConnected
        && currentState?.inPlaybackViewport
        && !currentState.userPaused
        && !currentState.failed
        && candidateState
        && currentState.intersectionRatio + dominanceSwitchDelta >= candidateState.intersectionRatio
      ) {
        return activeNode;
      }
      return candidate;
    }

    function reconcileActivePlayback() {
      if (targetDocument.visibilityState === "hidden") {
        relinquishActiveNode("document_hidden");
        return;
      }
      if (!isNetworkOnline()) {
        relinquishActiveNode("network_offline");
        return;
      }
      if (isSaveDataEnabled()) {
        relinquishActiveNode("save_data");
        return;
      }
      const pauseLockState = userPauseLockNode ? stateByNode.get(userPauseLockNode) : null;
      if (userPauseLockNode?.isConnected && pauseLockState?.inPlaybackViewport) {
        relinquishActiveNode("manual_pause_lock");
        return;
      }
      if (userPauseLockNode && (!userPauseLockNode.isConnected || !pauseLockState?.inPlaybackViewport)) {
        userPauseLockNode = null;
      }
      const candidate = selectDominantNode();
      if (!candidate) {
        relinquishActiveNode("out_of_view");
        return;
      }
      const state = stateByNode.get(candidate);
      if (!state || state.userPaused || state.failed) return;
      claimActiveNode(candidate);
      state.autoplayRequested = true;
      void activateNode(candidate, { autoplay: true });
    }

    function handleVisibilityChange() {
      reconcileActivePlayback();
    }

    function releaseMountedPlayersForNetwork(awaitOnline = false) {
      boundNodes.forEach((node) => {
        if (!node.querySelector?.("[data-stream-player]")) return;
        releaseNode(node);
        const state = stateByNode.get(node);
        if (state) state.awaitingNetwork = awaitOnline;
      });
    }

    function handleOnline() {
      boundNodes.forEach((node) => {
        const state = stateByNode.get(node);
        if (!state?.awaitingNetwork) return;
        state.awaitingNetwork = false;
        state.failed = false;
        node.classList.remove("has-playback-error");
      });
      drainPrewarmQueue();
      reconcileActivePlayback();
    }

    function handleOffline() {
      relinquishActiveNode("network_offline");
      releaseMountedPlayersForNetwork(true);
    }

    function handleConnectionChange() {
      if (!isNetworkOnline()) {
        handleOffline();
        return;
      }
      if (isSaveDataEnabled()) {
        relinquishActiveNode("save_data");
        releaseMountedPlayersForNetwork(false);
        return;
      }
      const profile = getPlaybackProfile();
      boundNodes.forEach((node) => {
        const state = stateByNode.get(node);
        if (!state?.hls) return;
        state.playbackProfile = profile.name;
        Object.assign(state.hls.config || {}, getHlsConfig(profile, { prewarm: node.classList.contains?.("is-prewarming") }));
        applyHlsBandwidthCap(state.hls, profile);
      });
      drainPrewarmQueue();
      reconcileActivePlayback();
    }

    function installNetworkHandlers() {
      if (networkHandlersInstalled) return;
      targetWindow.addEventListener?.("online", handleOnline);
      targetWindow.addEventListener?.("offline", handleOffline);
      const connection = targetWindow.navigator?.connection
        || targetWindow.navigator?.mozConnection
        || targetWindow.navigator?.webkitConnection;
      connection?.addEventListener?.("change", handleConnectionChange);
      networkHandlersInstalled = true;
    }

    async function activateNode(node, options = {}) {
      const providerId = String(node.dataset.videoProviderId || "").trim();
      if (!/^[a-zA-Z0-9_-]{8,64}$/.test(providerId)) return;
      const state = stateByNode.get(node);
      if (!state) return;
      if (options.userInitiated === true) {
        state.userPaused = false;
        state.failed = false;
        state.awaitingNetwork = false;
        if (userPauseLockNode === node) userPauseLockNode = null;
      }
      if (options.prewarm === true && !shouldPrewarmVideo()) return state.readyPromise;
      if (options.autoplay !== false) {
        if (state.userPaused || state.failed) return state.readyPromise;
        if (options.userInitiated !== true && (!isNetworkOnline() || isSaveDataEnabled())) return state.readyPromise;
        claimActiveNode(node);
        state.autoplayRequested = true;
      }
      if (state.releaseTimer) targetWindow.clearTimeout(state.releaseTimer);
      const existingPlayer = node.querySelector("[data-stream-player]");
      if (existingPlayer) {
        if (state.autoplayRequested && state.ready && activeNode === node && !state.userPaused) {
          if (state.hasPlayed && existingPlayer.paused && !state.pauseReason) {
            state.userPaused = true;
            state.autoplayRequested = false;
            userPauseLockNode = node;
            activeNode = null;
            return state.readyPromise;
          }
          requestPlayerPlay(existingPlayer);
        }
        return state.readyPromise;
      }
      if (state.loading) return state.readyPromise;

      state.loading = true;
      state.ready = false;
      state.failed = false;
      state.awaitingNetwork = false;
      state.pauseReason = "";
      state.generation += 1;
      state.watchStartedAt = 0;
      state.watchedMs = 0;
      state.bufferedMs = 0;
      state.playCount = 0;
      state.completionCount = 0;
      state.replayCount = 0;
      state.pendingPlaybackCycle = false;
      state.completionReportedForLoop = false;
      state.lastCurrentTime = 0;
      const generation = state.generation;
      const startedAt = metricNow();
      const playbackProfile = getPlaybackProfile();
      state.playbackProfile = playbackProfile.name;
      emitVideoMetric(node, state, "video_playback_profile_selected", {
        profile: playbackProfile.name,
        prewarmed: options.prewarm === true,
        saveData: isSaveDataEnabled()
      });
      state.readyPromise = new Promise((resolve) => {
        state.resolveReady = resolve;
      });
      node.classList.add("is-loading", "is-buffering");
      node.classList.toggle("is-prewarming", options.prewarm === true);
      node.classList.remove("has-playback-error");
      node.setAttribute("aria-busy", "true");

      try {
        const tokenResult = await getPlaybackToken(providerId);
        const playback = tokenResult.payload;
        if (state.generation !== generation || !node.isConnected) return;
        const customerCode = normalizeCustomerCode(playback?.customerCode);
        const token = String(playback?.token || "").trim();
        if (!/^[a-z0-9-]{4,80}$/.test(customerCode) || !token) throw new Error("Invalid video playback response."); // i18n-gate: allow -- internal diagnostic or language-neutral display

        const signedAssetRoot = `https://customer-${customerCode}.cloudflarestream.com/${encodeURIComponent(token)}`;
        const hlsUrl = `${signedAssetRoot}/manifest/video.m3u8`;
        const video = targetDocument.createElement("video");
        video.dataset.streamPlayer = "true";
        video.className = "feed-video-player";
        video.title = String(node.dataset.videoTitle || "Product video");
        video.controls = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.crossOrigin = "anonymous";
        video.poster = `${signedAssetRoot}/thumbnails/thumbnail.jpg`;
        video.setAttribute("controls", "");
        video.setAttribute("playsinline", "");
        node.appendChild(video);

        let playbackStartedReported = false;
        const playWhenReady = () => {
          if (
            state.autoplayRequested
            && !state.userPaused
            && activeNode === node
            && state.generation === generation
            && node.isConnected
          ) {
            requestPlayerPlay(video);
          }
        };
        const revealFirstFrame = () => {
          if (state.generation !== generation || !node.isConnected || state.ready) return;
          state.ready = true;
          node.classList.add("is-ready");
          node.classList.remove("is-loading", "is-buffering", "is-prewarming", "has-playback-error");
          node.setAttribute("aria-busy", "false");
          settleReadyState(state);
          emitVideoMetric(node, state, "video_playback_ready", {
            latencyMs: Math.max(0, metricNow() - startedAt),
            tokenCached: tokenResult.cached,
            prewarmed: options.prewarm === true,
            bigPipePrefetched: tokenResult.prefetched === true,
            profile: playbackProfile.name
          });
          playWhenReady();
        };
        const reportPlaybackStarted = () => {
          revealFirstFrame();
          const timestamp = metricNow();
          state.hasPlayed = true;
          node.classList.add("is-playing");
          node.classList.remove("is-buffering");
          const bufferingMs = closeBufferSegment(state, timestamp);
          if (bufferingMs > 0) {
            emitVideoMetric(node, state, "video_playback_buffer_recovered", {
              bufferingMs,
              profile: playbackProfile.name
            });
          }
          if (!state.watchStartedAt) state.watchStartedAt = timestamp;
          if (state.pendingPlaybackCycle) {
            state.playCount += 1;
            if (state.playCount > 1) {
              emitVideoMetric(node, state, "video_resume", {
                autoplay: state.autoplayRequested,
                playCount: state.playCount
              });
            }
            state.pendingPlaybackCycle = false;
          }
          if (state.recoveryStartedAt) {
            emitVideoMetric(node, state, "video_playback_recovery_succeeded", {
              latencyMs: Math.max(0, timestamp - state.recoveryStartedAt),
              profile: playbackProfile.name
            });
            state.recoveryStartedAt = 0;
            state.networkRecoveryAttempts = 0;
            state.mediaRecoveryAttempts = 0;
          }
          if (playbackStartedReported) return;
          playbackStartedReported = true;
          emitVideoMetric(node, state, "video_playback_started", {
            latencyMs: Math.max(0, timestamp - startedAt),
            tokenCached: tokenResult.cached,
            autoplay: state.autoplayRequested,
            saveData: isSaveDataEnabled(),
            profile: playbackProfile.name
          });
        };
        const handlePlay = () => {
          if (state.generation !== generation || !node.isConnected) return;
          state.userPaused = false;
          state.pendingPlaybackCycle = true;
          if (userPauseLockNode === node) userPauseLockNode = null;
          claimActiveNode(node);
        };
        const handlePause = () => {
          const pauseReason = state.pauseReason;
          state.pauseReason = "";
          node.classList.remove("is-playing", "is-buffering");
          if (state.generation !== generation) return;
          const timestamp = metricNow();
          closeWatchSegment(state, timestamp);
          closeBufferSegment(state, timestamp);
          emitVideoMetric(node, state, "video_playback_paused", {
            manualIntent: !pauseReason,
            reason: pauseReason || "user",
            watchedMs: Math.max(0, Math.round(Number(state.watchedMs || 0)))
          });
          if (pauseReason) return;
          state.userPaused = true;
          state.autoplayRequested = false;
          userPauseLockNode = node;
          if (activeNode === node) activeNode = null;
          reconcileActivePlayback();
        };
        const handleWaiting = () => {
          if (activeNode !== node || state.userPaused) return;
          const timestamp = metricNow();
          closeWatchSegment(state, timestamp);
          if (!state.bufferStartedAt) state.bufferStartedAt = timestamp;
          node.classList.add("is-buffering");
        };
        const reportCompletion = () => {
          if (state.completionReportedForLoop) return;
          state.completionReportedForLoop = true;
          state.completionCount += 1;
          emitVideoMetric(node, state, "video_complete", {
            completionCount: state.completionCount,
            watchedMs: Math.max(0, Math.round(Number(state.watchedMs || 0) + (state.watchStartedAt ? metricNow() - state.watchStartedAt : 0)))
          });
        };
        const handleTimeUpdate = () => {
          if (state.generation !== generation || !node.isConnected) return;
          const currentTime = Math.max(0, Number(video.currentTime || 0));
          const duration = Math.max(0, Number(video.duration || 0));
          if (!Number.isFinite(duration) || duration <= 0) return;
          const wrapped = state.lastCurrentTime >= duration * 0.85 && currentTime <= duration * 0.15;
          if (wrapped) {
            reportCompletion();
            state.replayCount += 1;
            emitVideoMetric(node, state, "video_replay", { replayCount: state.replayCount });
            state.completionReportedForLoop = false;
          } else if (currentTime >= duration * 0.95) {
            reportCompletion();
          }
          state.lastCurrentTime = currentTime;
        };
        const handleEnded = () => {
          closeWatchSegment(state, metricNow());
          reportCompletion();
        };
        const handleVolumeChange = () => {
          const muted = Boolean(video.muted || Number(video.volume || 0) === 0);
          if (muted === state.lastMuted) return;
          state.lastMuted = muted;
          emitVideoMetric(node, state, muted ? "video_mute" : "video_unmute", {});
        };
        state.lastMuted = Boolean(video.muted || Number(video.volume || 0) === 0);
        video.addEventListener("loadeddata", revealFirstFrame, { once: true });
        video.addEventListener("canplay", revealFirstFrame, { once: true });
        video.addEventListener("play", handlePlay);
        video.addEventListener("playing", reportPlaybackStarted);
        video.addEventListener("pause", handlePause);
        video.addEventListener("waiting", handleWaiting);
        video.addEventListener("timeupdate", handleTimeUpdate);
        video.addEventListener("ended", handleEnded);
        video.addEventListener("volumechange", handleVolumeChange);

        const Hls = await loadHlsRuntime(targetWindow, targetDocument, translateUi);
        if (state.generation !== generation || !node.isConnected) return;
        if (Hls.isSupported?.()) {
          const hls = new Hls(getHlsConfig(playbackProfile, options));
          state.hls = hls;
          const applyCurrentProfile = () => applyHlsBandwidthCap(hls, getPlaybackProfile());
          hls.on(Hls.Events.ERROR, (_event, detail) => {
            if (!detail?.fatal || state.hls !== hls) return;
            const recoveryScheduled = scheduleHlsRecovery(node, state, hls, video, detail, {
              Hls,
              generation,
              startedAt,
              hlsUrl
            });
            if (recoveryScheduled) return;
            markPlaybackFailed(node, state, {
              generation,
              startedAt,
              code: detail.details || detail.type || "video_hls_fatal",
              retryOnOnline: !isNetworkOnline()
            });
          });
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            applyCurrentProfile();
            playWhenReady();
          });
          if (Hls.Events.LEVELS_UPDATED) hls.on(Hls.Events.LEVELS_UPDATED, applyCurrentProfile);
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);
        } else if (video.canPlayType?.("application/vnd.apple.mpegurl")) {
          video.src = hlsUrl;
          video.addEventListener("loadedmetadata", playWhenReady, { once: true });
          video.addEventListener("error", () => {
            if (state.generation !== generation || state.hls || state.failed) return;
            if (!isNetworkOnline()) {
              markPlaybackFailed(node, state, {
                generation,
                startedAt,
                code: "video_native_network_offline",
                retryOnOnline: true
              });
              return;
            }
            const nextAttempt = Number(state.networkRecoveryAttempts || 0) + 1;
            if (nextAttempt > maxNetworkRecoveries) {
              markPlaybackFailed(node, state, {
                generation,
                startedAt,
                code: "video_native_playback_failed"
              });
              return;
            }
            state.networkRecoveryAttempts = nextAttempt;
            state.recoveryStartedAt = metricNow();
            clearRecoveryTimer(state);
            const delayMs = Math.min(4000, recoveryBaseDelayMs * (2 ** (nextAttempt - 1)));
            emitVideoMetric(node, state, "video_playback_recovery_attempt", {
              type: "native_network",
              attempt: nextAttempt,
              delayMs,
              profile: playbackProfile.name
            });
            state.recoveryTimer = targetWindow.setTimeout(() => {
              state.recoveryTimer = 0;
              if (state.generation !== generation || !node.isConnected || state.failed) return;
              video.load?.();
              playWhenReady();
            }, delayMs);
          });
        } else {
          throw Object.assign(new Error(translateUi("video.playbackUnsupported", {}, "Video playback is not supported on this device.")), { code: "video_hls_unsupported" });
        }
      } catch (error) {
        markPlaybackFailed(node, state, {
          generation,
          startedAt,
          code: error?.code || "video_playback_failed",
          retryOnOnline: !isNetworkOnline()
        });
      } finally {
        if (state.generation === generation) {
          state.loading = false;
          node.classList.remove("is-loading");
          node.setAttribute("aria-busy", state.ready || state.failed ? "false" : "true");
        }
      }
    }

    async function prewarmNode(node) {
      const state = stateByNode.get(node);
      if (!state || state.failed || !node.isConnected || !state.nearViewport || !shouldPrewarmVideo()) return;
      await activateNode(node, { autoplay: false, prewarm: true });
      const latestState = stateByNode.get(node);
      if (!latestState?.readyPromise || latestState.ready) return;
      await Promise.race([
        latestState.readyPromise,
        new Promise((resolve) => targetWindow.setTimeout(resolve, prewarmTimeoutMs))
      ]);
    }

    function drainPrewarmQueue() {
      const prewarmLimit = getPrewarmLimit();
      while (activePrewarms < prewarmLimit && prewarmQueue.length > 0) {
        const node = prewarmQueue.shift();
        const state = stateByNode.get(node);
        if (!state) continue;
        state.prewarmQueued = false;
        if (!node.isConnected || !state.nearViewport || state.ready || state.failed || node.querySelector("[data-stream-player]")) continue;
        activePrewarms += 1;
        void prewarmNode(node).finally(() => {
          activePrewarms = Math.max(0, activePrewarms - 1);
          drainPrewarmQueue();
        });
      }
    }

    function enqueuePrewarm(node) {
      const state = stateByNode.get(node);
      if (!shouldPrewarmVideo() || !state || state.prewarmQueued || state.loading || state.ready || state.failed || node.querySelector("[data-stream-player]")) return;
      state.prewarmQueued = true;
      prewarmQueue.push(node);
      drainPrewarmQueue();
    }

    function getPrewarmObserver() {
      if (prewarmObserver || typeof targetWindow.IntersectionObserver !== "function") return prewarmObserver;
      prewarmObserver = new targetWindow.IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const nodes = prewarmNodesByTarget.get(entry.target);
          nodes?.forEach?.((node) => {
            const state = stateByNode.get(node);
            if (!state) return;
            state.nearViewport = entry.isIntersecting;
            if (entry.isIntersecting) {
              if (targetDocument.visibilityState !== "hidden" && shouldPrewarmVideo()) enqueuePrewarm(node);
              return;
            }
            if (!state.inPlaybackViewport) scheduleRelease(node);
          });
        });
      }, { threshold: [0], rootMargin: prewarmRootMargin });
      return prewarmObserver;
    }

    function getObserver() {
      if (observer || typeof targetWindow.IntersectionObserver !== "function") return observer;
      observer = new targetWindow.IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const state = stateByNode.get(entry.target);
          if (!state) return;
          state.intersectionRatio = entry.isIntersecting ? Math.max(0, Number(entry.intersectionRatio || 0)) : 0;
          state.inPlaybackViewport = entry.isIntersecting && state.intersectionRatio >= 0.55;
          if (state.inPlaybackViewport && !state.impressionReported) {
            state.impressionReported = true;
            emitVideoMetric(entry.target, state, "video_impression", {
              intersectionRatio: Math.round(state.intersectionRatio * 100) / 100
            });
          }
          const rect = entry.boundingClientRect;
          const rootBounds = entry.rootBounds;
          const viewportCenter = rootBounds
            ? Number(rootBounds.top || 0) + (Number(rootBounds.height || 0) / 2)
            : Number(targetWindow.innerHeight || 0) / 2;
          state.viewportDistance = rect
            ? Math.abs((Number(rect.top || 0) + (Number(rect.height || 0) / 2)) - viewportCenter)
            : Number.MAX_SAFE_INTEGER;
          if (!state.inPlaybackViewport && !state.nearViewport) scheduleRelease(entry.target);
        });
        if (isSaveDataEnabled()) {
          relinquishActiveNode("save_data");
          return;
        }
        reconcileActivePlayback();
      }, { threshold: [0, 0.55, 0.85], rootMargin: "120px 0px" });
      return observer;
    }

    function bind(scope = targetDocument) {
      if (!visibilityHandlerInstalled && targetDocument.addEventListener) {
        targetDocument.addEventListener("visibilitychange", handleVisibilityChange);
        visibilityHandlerInstalled = true;
      }
      installNetworkHandlers();
      const nodes = Array.from(scope?.querySelectorAll?.("[data-video-playback]") || []);
      nodes.forEach((node) => {
        if (node.dataset.videoPlaybackBound === "true") return;
        node.dataset.videoPlaybackBound = "true";
        stateByNode.set(node, {
          generation: 0,
          loading: false,
          ready: false,
          failed: false,
          hasPlayed: false,
          userPaused: false,
          pauseReason: "",
          autoplayRequested: false,
          releaseTimer: 0,
          hls: null,
          readyPromise: null,
          resolveReady: null,
          prewarmQueued: false,
          nearViewport: false,
          inPlaybackViewport: false,
          intersectionRatio: 0,
          viewportDistance: Number.MAX_SAFE_INTEGER,
          bufferStartedAt: 0,
          recoveryTimer: 0,
          recoveryStartedAt: 0,
          networkRecoveryAttempts: 0,
          mediaRecoveryAttempts: 0,
          awaitingNetwork: false,
          playbackProfile: "",
          prewarmTarget: null,
          impressionReported: false,
          watchStartedAt: 0,
          watchedMs: 0,
          bufferedMs: 0,
          playCount: 0,
          completionCount: 0,
          replayCount: 0,
          pendingPlaybackCycle: false,
          completionReportedForLoop: false,
          lastCurrentTime: 0,
          lastMuted: true,
          summaryGeneration: -1
        });

        boundNodes.add(node);

        const prewarmTarget = node.closest?.(".product-card, .seller-product-card, [data-product-card], [data-feed-gallery-carousel]") || node;
        const targetNodes = prewarmNodesByTarget.get(prewarmTarget) || new Set();
        targetNodes.add(node);
        prewarmNodesByTarget.set(prewarmTarget, targetNodes);
        stateByNode.get(node).prewarmTarget = prewarmTarget;

        const activateFromUser = (event) => {
          if (event.target?.matches?.("[data-stream-player]")) return;
          if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          void activateNode(node, { autoplay: true, userInitiated: true });
        };
        node.addEventListener("click", activateFromUser);
        node.addEventListener("keydown", activateFromUser);
        node.__wingaVideoCleanup = () => {
          node.removeEventListener("click", activateFromUser);
          node.removeEventListener("keydown", activateFromUser);
          observer?.unobserve?.(node);
          boundNodes.delete(node);
          const state = stateByNode.get(node);
          const target = state?.prewarmTarget;
          const targetNodes = target ? prewarmNodesByTarget.get(target) : null;
          targetNodes?.delete?.(node);
          if (target && targetNodes?.size === 0) {
            prewarmObserver?.unobserve?.(target);
            prewarmNodesByTarget.delete(target);
          }
          releaseNode(node, { forget: true });
          node.__wingaVideoCleanup = null;
          reconcileActivePlayback();
        };
        getObserver()?.observe?.(node);
        getPrewarmObserver()?.observe?.(prewarmTarget);
      });
    }

    function dispose(scope = targetDocument) {
      const nodes = [];
      if (scope?.matches?.("[data-video-playback]")) nodes.push(scope);
      scope?.querySelectorAll?.("[data-video-playback]")?.forEach?.((node) => nodes.push(node));
      nodes.forEach((node) => node.__wingaVideoCleanup?.());
    }

    return { bind, dispose, activateNode, prewarmNode, releaseNode, getPlaybackProfile };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.marketplace = window.WingaModules.marketplace || {};
  window.WingaModules.marketplace.createVideoPlaybackController = createVideoPlaybackController;
})();
