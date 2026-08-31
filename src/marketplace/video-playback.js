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
    let activePrewarms = 0;
    let observer = null;
    let prewarmObserver = null;
    let activeNode = null;
    let userPauseLockNode = null;
    let visibilityHandlerInstalled = false;
    const dominanceSwitchDelta = Math.max(0.05, Math.min(0.3, Number(deps.dominanceSwitchDelta || 0.12)));

    function isSaveDataEnabled() {
      return Boolean(targetWindow.navigator?.connection?.saveData);
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

    function settleReadyState(state) {
      state?.resolveReady?.();
      if (state) {
        state.resolveReady = null;
        state.readyPromise = null;
      }
    }

    function releaseNode(node, options = {}) {
      const state = stateByNode.get(node);
      if (state?.releaseTimer) targetWindow.clearTimeout(state.releaseTimer);
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

    async function activateNode(node, options = {}) {
      const providerId = String(node.dataset.videoProviderId || "").trim();
      if (!/^[a-zA-Z0-9_-]{8,64}$/.test(providerId)) return;
      const state = stateByNode.get(node);
      if (!state) return;
      if (options.userInitiated === true) {
        state.userPaused = false;
        state.failed = false;
        if (userPauseLockNode === node) userPauseLockNode = null;
      }
      if (options.autoplay !== false) {
        if (state.userPaused || state.failed) return state.readyPromise;
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
      state.generation += 1;
      const generation = state.generation;
      const startedAt = Date.now();
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
        video.preload = options.prewarm === true ? "auto" : "metadata";
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
          emitMetric("video_playback_ready", {
            latencyMs: Math.max(0, Date.now() - startedAt),
            tokenCached: tokenResult.cached,
            prewarmed: options.prewarm === true,
            bigPipePrefetched: tokenResult.prefetched === true
          });
          playWhenReady();
        };
        const reportPlaybackStarted = () => {
          revealFirstFrame();
          state.hasPlayed = true;
          node.classList.add("is-playing");
          node.classList.remove("is-buffering");
          if (state.bufferStartedAt) {
            emitMetric("video_playback_buffer_recovered", {
              bufferingMs: Math.max(0, Date.now() - state.bufferStartedAt)
            });
            state.bufferStartedAt = 0;
          }
          if (playbackStartedReported) return;
          playbackStartedReported = true;
          emitMetric("video_playback_started", {
            latencyMs: Math.max(0, Date.now() - startedAt),
            tokenCached: tokenResult.cached,
            autoplay: state.autoplayRequested,
            saveData: isSaveDataEnabled()
          });
        };
        const handlePlay = () => {
          if (state.generation !== generation || !node.isConnected) return;
          state.userPaused = false;
          if (userPauseLockNode === node) userPauseLockNode = null;
          claimActiveNode(node);
        };
        const handlePause = () => {
          const pauseReason = state.pauseReason;
          state.pauseReason = "";
          node.classList.remove("is-playing", "is-buffering");
          if (state.generation !== generation || pauseReason) return;
          state.userPaused = true;
          state.autoplayRequested = false;
          userPauseLockNode = node;
          if (activeNode === node) activeNode = null;
          emitMetric("video_playback_paused", { manualIntent: true });
          reconcileActivePlayback();
        };
        const handleWaiting = () => {
          if (activeNode !== node || state.userPaused) return;
          if (!state.bufferStartedAt) state.bufferStartedAt = Date.now();
          node.classList.add("is-buffering");
        };
        video.addEventListener("loadeddata", revealFirstFrame, { once: true });
        video.addEventListener("canplay", revealFirstFrame, { once: true });
        video.addEventListener("play", handlePlay);
        video.addEventListener("playing", reportPlaybackStarted);
        video.addEventListener("pause", handlePause);
        video.addEventListener("waiting", handleWaiting);

        const Hls = await loadHlsRuntime(targetWindow, targetDocument, translateUi);
        if (state.generation !== generation || !node.isConnected) return;
        if (Hls.isSupported?.()) {
          const hls = new Hls({
            enableWorker: false,
            lowLatencyMode: false,
            capLevelToPlayerSize: true,
            backBufferLength: 20,
            maxBufferLength: 20,
            maxMaxBufferLength: 30
          });
          state.hls = hls;
          hls.on(Hls.Events.ERROR, (_event, detail) => {
            if (!detail?.fatal || state.hls !== hls) return;
            state.failed = true;
            state.ready = false;
            state.loading = false;
            state.autoplayRequested = false;
            if (activeNode === node) activeNode = null;
            node.classList.add("has-playback-error");
            node.classList.remove("is-ready", "is-playing", "is-loading", "is-buffering", "is-prewarming");
            node.setAttribute("aria-busy", "false");
            emitMetric("video_playback_failed", {
              latencyMs: Math.max(0, Date.now() - startedAt),
              code: String(detail.type || detail.details || "video_hls_fatal").slice(0, 80)
            });
            state.pauseReason = "playback_error";
            if (!video.paused) video.pause();
            hls.destroy();
            state.hls = null;
            video.remove();
            settleReadyState(state);
            reconcileActivePlayback();
          });
          hls.on(Hls.Events.MANIFEST_PARSED, playWhenReady);
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);
        } else if (video.canPlayType?.("application/vnd.apple.mpegurl")) {
          video.src = hlsUrl;
          video.addEventListener("loadedmetadata", playWhenReady, { once: true });
        } else {
          throw Object.assign(new Error(translateUi("video.playbackUnsupported", {}, "Video playback is not supported on this device.")), { code: "video_hls_unsupported" });
        }
      } catch (error) {
        if (state.generation === generation) {
          state.failed = true;
          state.ready = false;
          state.autoplayRequested = false;
          if (activeNode === node) activeNode = null;
          node.classList.add("has-playback-error");
          node.classList.remove("is-ready", "is-playing", "is-buffering", "is-prewarming");
          node.setAttribute("aria-busy", "false");
          emitMetric("video_playback_failed", {
            latencyMs: Math.max(0, Date.now() - startedAt),
            code: String(error?.code || "video_playback_failed").slice(0, 80)
          });
          state.hls?.destroy?.();
          state.hls = null;
          node.querySelector("[data-stream-player]")?.remove?.();
          settleReadyState(state);
          reconcileActivePlayback();
        }
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
      if (!state || state.failed || !node.isConnected || !state.nearViewport || isSaveDataEnabled()) return;
      await activateNode(node, { autoplay: false, prewarm: true });
      const latestState = stateByNode.get(node);
      if (!latestState?.readyPromise || latestState.ready) return;
      await Promise.race([
        latestState.readyPromise,
        new Promise((resolve) => targetWindow.setTimeout(resolve, prewarmTimeoutMs))
      ]);
    }

    function drainPrewarmQueue() {
      while (activePrewarms < maxConcurrentPrewarms && prewarmQueue.length > 0) {
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
      if (!state || state.prewarmQueued || state.loading || state.ready || state.failed || node.querySelector("[data-stream-player]")) return;
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
              if (targetDocument.visibilityState !== "hidden" && !isSaveDataEnabled()) enqueuePrewarm(node);
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
          prewarmTarget: null
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

    return { bind, dispose, activateNode, prewarmNode, releaseNode };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.marketplace = window.WingaModules.marketplace || {};
  window.WingaModules.marketplace.createVideoPlaybackController = createVideoPlaybackController;
})();
