(() => {
  let hlsRuntimePromise = null;

  function loadHlsRuntime(targetWindow, targetDocument) {
    if (targetWindow.Hls) return Promise.resolve(targetWindow.Hls);
    if (hlsRuntimePromise) return hlsRuntimePromise;
    hlsRuntimePromise = new Promise((resolve, reject) => {
      const existing = targetDocument.querySelector?.("script[data-winga-hls-runtime]");
      const script = existing || targetDocument.createElement("script");
      const timeoutId = targetWindow.setTimeout(() => {
        hlsRuntimePromise = null;
        reject(Object.assign(new Error("HLS playback runtime timed out."), { code: "video_hls_runtime_timeout" }));
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
        reject(Object.assign(new Error("HLS playback is not supported on this device."), { code: "video_hls_unsupported" }));
      });
      script.onerror = () => settle(() => {
        hlsRuntimePromise = null;
        script.remove?.();
        reject(Object.assign(new Error("HLS playback runtime could not load."), { code: "video_hls_runtime_failed" }));
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
    const tokenCache = new Map();
    const stateByNode = new WeakMap();
    const maxCachedTokens = Math.max(8, Number(deps.maxCachedTokens || 64));
    const releaseDelayMs = Math.max(250, Number(deps.releaseDelayMs || 1500));
    const tokenSafetyMs = Math.max(10000, Number(deps.tokenSafetyMs || 30000));
    let observer = null;

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
      if (cached) return { payload: cached, cached: true };
      if (typeof requestPlaybackToken !== "function") {
        const error = new Error("Video playback is unavailable."); // i18n-gate: allow -- internal diagnostic or language-neutral display
        error.code = "video_playback_unavailable";
        throw error;
      }
      const payload = await requestPlaybackToken(providerId);
      return { payload: cacheToken(providerId, payload), cached: false };
    }

    function emitMetric(event, detail = {}) {
      try {
        reportMetric(event, Object.freeze({ ...detail }));
      } catch (_error) {
        // Playback telemetry must never affect media or feed behavior.
      }
    }

    function releaseNode(node, options = {}) {
      const state = stateByNode.get(node);
      if (state?.releaseTimer) targetWindow.clearTimeout(state.releaseTimer);
      if (state) state.generation += 1;
      if (state?.hls) {
        state.hls.destroy?.();
        state.hls = null;
      }
      const player = node.querySelector("[data-stream-player]");
      if (player?.pause) player.pause();
      player?.removeAttribute?.("src");
      player?.load?.();
      player?.remove?.();
      node.classList.remove("is-playing", "is-loading", "has-playback-error");
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

    async function activateNode(node, options = {}) {
      const providerId = String(node.dataset.videoProviderId || "").trim();
      if (!/^[a-zA-Z0-9_-]{8,64}$/.test(providerId) || node.querySelector("[data-stream-player]")) return;
      const state = stateByNode.get(node);
      if (!state || state.loading) return;
      state.loading = true;
      state.generation += 1;
      const generation = state.generation;
      const startedAt = Date.now();
      if (state.releaseTimer) targetWindow.clearTimeout(state.releaseTimer);
      node.classList.add("is-loading");
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
        video.playsInline = true;
        video.preload = "metadata";
        video.crossOrigin = "anonymous";
        video.poster = `${signedAssetRoot}/thumbnails/thumbnail.jpg`;
        video.setAttribute("controls", "");
        video.setAttribute("playsinline", "");
        node.appendChild(video);
        const playWhenReady = () => {
          if (options.autoplay !== false && state.generation === generation && node.isConnected) {
            void video.play().catch(() => undefined);
          }
        };
        const Hls = await loadHlsRuntime(targetWindow, targetDocument);
        if (state.generation !== generation || !node.isConnected) return;
        if (Hls.isSupported?.()) {
          const hls = new Hls({
            enableWorker: false,
            lowLatencyMode: false,
            capLevelToPlayerSize: true,
            backBufferLength: 30,
            maxBufferLength: 30
          });
          state.hls = hls;
          hls.on(Hls.Events.ERROR, (_event, detail) => {
            if (!detail?.fatal || state.hls !== hls) return;
            node.classList.add("has-playback-error");
            emitMetric("video_playback_failed", {
              latencyMs: Math.max(0, Date.now() - startedAt),
              code: String(detail.type || detail.details || "video_hls_fatal").slice(0, 80)
            });
            hls.destroy();
            state.hls = null;
          });
          hls.on(Hls.Events.MANIFEST_PARSED, playWhenReady);
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);
        } else if (video.canPlayType?.("application/vnd.apple.mpegurl")) {
          video.src = hlsUrl;
          video.addEventListener("loadedmetadata", playWhenReady, { once: true });
        } else {
          throw Object.assign(new Error("HLS playback is not supported on this device."), { code: "video_hls_unsupported" });
        }
        node.classList.add("is-playing");
        emitMetric("video_playback_started", {
          latencyMs: Math.max(0, Date.now() - startedAt),
          tokenCached: tokenResult.cached,
          autoplay: options.autoplay !== false,
          saveData: isSaveDataEnabled()
        });
      } catch (error) {
        if (state.generation === generation) {
          node.classList.add("has-playback-error");
          emitMetric("video_playback_failed", {
            latencyMs: Math.max(0, Date.now() - startedAt),
            code: String(error?.code || "video_playback_failed").slice(0, 80)
          });
          state.hls?.destroy?.();
          state.hls = null;
          node.querySelector("[data-stream-player]")?.remove?.();
        }
      } finally {
        if (state.generation === generation) {
          state.loading = false;
          node.classList.remove("is-loading");
          node.setAttribute("aria-busy", "false");
        }
      }
    }

    function getObserver() {
      if (observer || typeof targetWindow.IntersectionObserver !== "function") return observer;
      observer = new targetWindow.IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
            if (!isSaveDataEnabled() && targetDocument.visibilityState !== "hidden") void activateNode(entry.target, { autoplay: true });
            return;
          }
          scheduleRelease(entry.target);
        });
      }, { threshold: [0, 0.55, 0.85], rootMargin: "120px 0px" });
      return observer;
    }

    function bind(scope = targetDocument) {
      const nodes = Array.from(scope?.querySelectorAll?.("[data-video-playback]") || []);
      nodes.forEach((node) => {
        if (node.dataset.videoPlaybackBound === "true") return;
        node.dataset.videoPlaybackBound = "true";
        stateByNode.set(node, { generation: 0, loading: false, releaseTimer: 0, hls: null });
        const activateFromUser = (event) => {
          if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          void activateNode(node, { autoplay: true });
        };
        node.addEventListener("click", activateFromUser);
        node.addEventListener("keydown", activateFromUser);
        node.__wingaVideoCleanup = () => {
          node.removeEventListener("click", activateFromUser);
          node.removeEventListener("keydown", activateFromUser);
          observer?.unobserve?.(node);
          releaseNode(node, { forget: true });
          node.__wingaVideoCleanup = null;
        };
        getObserver()?.observe?.(node);
      });
    }

    function dispose(scope = targetDocument) {
      const nodes = [];
      if (scope?.matches?.("[data-video-playback]")) nodes.push(scope);
      scope?.querySelectorAll?.("[data-video-playback]")?.forEach?.((node) => nodes.push(node));
      nodes.forEach((node) => node.__wingaVideoCleanup?.());
    }

    return { bind, dispose, activateNode, releaseNode };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.marketplace = window.WingaModules.marketplace || {};
  window.WingaModules.marketplace.createVideoPlaybackController = createVideoPlaybackController;
})();