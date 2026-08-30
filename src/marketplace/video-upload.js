(() => {
  const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
  const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"]);
  function createVideoUploadController(deps = {}) {
    const requestIntent = deps.requestVideoUpload;
    const readStatus = deps.readVideoUploadStatus;
    const createXhr = deps.createXhr || (() => new XMLHttpRequest());
    const delay = deps.delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const maxBytes = Math.max(1, Number(deps.maxBytes || DEFAULT_MAX_BYTES));
    const pollIntervalMs = Math.max(500, Number(deps.pollIntervalMs || 2500));
    const maxPollAttempts = Math.max(1, Number(deps.maxPollAttempts || 120));
    let generation = 0;
    let activeXhr = null;
    function fail(message, code) { return Object.assign(new Error(message), { code }); }
    function validateFile(file) {
      if (!file || !VIDEO_TYPES.has(String(file.type || "").toLowerCase())) throw fail("Select a supported MP4, MOV, WebM, or MKV video.", "invalid_video_type");
      if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0 || Number(file.size) > maxBytes) throw fail("The selected video is empty or exceeds the upload limit.", "invalid_video_size");
      return file;
    }
    function notify(callback, state) { if (typeof callback === "function") callback(Object.freeze({ ...state })); }
    function uploadBinary(uploadUrl, file, token, onState) {
      return new Promise((resolve, reject) => {
        const xhr = createXhr(); activeXhr = xhr; xhr.open("POST", uploadUrl, true); xhr.timeout = 30 * 60 * 1000;
        xhr.upload?.addEventListener("progress", (event) => { if (token === generation && event.lengthComputable) notify(onState, { phase: "uploading", progress: Math.min(100, Math.round((event.loaded / event.total) * 100)) }); });
        xhr.addEventListener("load", () => { activeXhr = null; if (token !== generation) return reject(fail("Video upload was cancelled.", "video_upload_cancelled")); if (xhr.status >= 200 && xhr.status < 300) return resolve(); reject(Object.assign(fail("Video provider rejected the upload.", "video_binary_upload_failed"), { status: xhr.status })); });
        xhr.addEventListener("error", () => { activeXhr = null; reject(fail("Video upload failed because of a network error.", "video_upload_network_error")); });
        xhr.addEventListener("timeout", () => { activeXhr = null; reject(fail("Video upload timed out.", "video_upload_timeout")); });
        xhr.addEventListener("abort", () => { activeXhr = null; reject(fail("Video upload was cancelled.", "video_upload_cancelled")); });
        const body = new FormData(); body.append("file", file, file.name); xhr.send(body);
      });
    }
    async function waitUntilReady(providerId, token, onState) {
      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        if (token !== generation) throw fail("Video upload was cancelled.", "video_upload_cancelled");
        let video;
        try {
          video = await readStatus(providerId);
        } catch (error) {
          error.providerId = providerId;
          error.retryable = true;
          throw error;
        }
        const status = String(video?.status || "").toLowerCase();
        notify(onState, { phase: "processing", progress: 100, providerId, status, attempt: attempt + 1 });
        if (status === "ready") return video;
        if (["failed", "error"].includes(status)) throw fail(video?.errorMessage || "Video processing failed.", video?.errorCode || "video_processing_failed");
        if (attempt + 1 < maxPollAttempts) await delay(pollIntervalMs);
      }
      throw Object.assign(fail("Video is still processing. Retry the status check.", "video_processing_timeout"), {
        providerId,
        retryable: true
      });
    }
    function createMediaItem(video = {}, providerId = "") {
      return { type: "video", provider: "cloudflare-stream", providerId, status: "ready", posterUrl: String(video.posterUrl || ""), thumbnailUrl: String(video.posterUrl || ""), duration: Number(video.duration || 0), width: Number(video.width || 0), height: Number(video.height || 0) };
    }
    async function resume(providerId, options = {}) {
      const safeProviderId = String(providerId || "").trim();
      if (!safeProviderId || typeof readStatus !== "function") throw fail("Video processing status is unavailable.", "video_status_unavailable");
      cancel(); const token = generation;
      notify(options.onState, { phase: "processing", progress: 100, providerId: safeProviderId, resumed: true });
      const video = await waitUntilReady(safeProviderId, token, options.onState);
      const mediaItem = createMediaItem(video, safeProviderId);
      notify(options.onState, { phase: "ready", progress: 100, providerId: safeProviderId, mediaItem, resumed: true });
      return mediaItem;
    }
    async function start(file, options = {}) {
      validateFile(file);
      if (typeof requestIntent !== "function" || typeof readStatus !== "function") throw fail("Video upload is unavailable.", "video_upload_unavailable");
      cancel(); const token = generation; notify(options.onState, { phase: "preparing", progress: 0 });
      const intent = await requestIntent(file); if (token !== generation) throw fail("Video upload was cancelled.", "video_upload_cancelled");
      await uploadBinary(intent.uploadUrl, file, token, options.onState);
      const video = await waitUntilReady(intent.providerId, token, options.onState);
      const mediaItem = createMediaItem(video, intent.providerId);
      notify(options.onState, { phase: "ready", progress: 100, providerId: intent.providerId, mediaItem }); return mediaItem;
    }
    function cancel() { generation += 1; if (activeXhr) activeXhr.abort(); activeXhr = null; }
    return { cancel, resume, start, validateFile };
  }
  window.WingaModules = window.WingaModules || {}; window.WingaModules.marketplace = window.WingaModules.marketplace || {}; window.WingaModules.marketplace.createVideoUploadController = createVideoUploadController;
})();