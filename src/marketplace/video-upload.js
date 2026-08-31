(() => {
  const DEFAULT_MIN_BYTES = 1;
  const DEFAULT_MAX_BYTES = 5 * 1024 * 1024 * 1024;
  const DEFAULT_TUS_CHUNK_BYTES = 20 * 1024 * 1024;
  const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "mkv", "mov", "avi", "flv", "ts", "mts", "m2ts", "m2p", "m2v", "mxf", "lxf", "gxf", "3gp", "3g2", "webm", "mpg", "mpeg"]);
  const VIDEO_TYPES = new Set(["video/mp4", "video/x-m4v", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo", "video/x-flv", "video/mp2t", "video/mpeg", "video/3gpp", "video/3gpp2", "application/mxf", "application/octet-stream"]);

  function createVideoUploadController(deps = {}) {
    const requestIntent = deps.requestVideoUpload;
    const readStatus = deps.readVideoUploadStatus;
    const createXhr = deps.createXhr || (() => new XMLHttpRequest());
    const readDuration = deps.readDuration || readVideoDuration;
    const delay = deps.delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const minBytes = Math.max(1, Number(deps.minBytes || DEFAULT_MIN_BYTES));
    const maxBytes = Math.max(minBytes, Number(deps.maxBytes || DEFAULT_MAX_BYTES));
    const requestedChunkBytes = Math.max(5 * 1024 * 1024, Math.min(200 * 1024 * 1024, Number(deps.chunkBytes || DEFAULT_TUS_CHUNK_BYTES)));
    const chunkBytes = Math.floor(requestedChunkBytes / (256 * 1024)) * (256 * 1024);
    const retryDelays = Array.isArray(deps.retryDelays) ? deps.retryDelays : [0, 1000, 3000, 5000, 10000];
    const pollIntervalMs = Math.max(500, Number(deps.pollIntervalMs || 2500));
    const maxPollAttempts = Math.max(1, Number(deps.maxPollAttempts || 120));
    let generation = 0;
    let activeXhr = null;

    function fail(message, code) { return Object.assign(new Error(message), { code }); }
    function readVideoDuration(file) {
      if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return Promise.resolve(0);
      return new Promise((resolve) => {
        const video = document.createElement("video");
        const objectUrl = URL.createObjectURL(file);
        let settled = false;
        let timeoutId = 0;
        const finish = (value = 0) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          video.removeAttribute("src");
          video.load?.();
          URL.revokeObjectURL(objectUrl);
          resolve(Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0);
        };
        timeoutId = setTimeout(() => finish(0), 8000);
        video.preload = "metadata";
        video.muted = true;
        video.addEventListener("loadedmetadata", () => finish(video.duration), { once: true });
        video.addEventListener("error", () => finish(0), { once: true });
        video.src = objectUrl;
      });
    }
    function validateFile(file) {
      const fileName = String(file?.name || "").trim();
      const extension = String(fileName.split(".").pop() || "").toLowerCase();
      const contentType = String(file?.type || "").trim().toLowerCase();
      if (!file || !VIDEO_EXTENSIONS.has(extension) || (contentType && !contentType.startsWith("video/") && !VIDEO_TYPES.has(contentType))) {
        throw fail("Select a supported video file.", "invalid_video_type");
      }
      const size = Number(file.size);
      if (!Number.isSafeInteger(size) || size < minBytes || size > maxBytes) {
        throw fail("The video must not be empty or larger than 5 GB.", "invalid_video_size");
      }
      return file;
    }
    function notify(callback, state) { if (typeof callback === "function") callback(Object.freeze({ ...state })); }
    function requestXhr(method, url, headers, body, token, onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = createXhr();
        activeXhr = xhr;
        xhr.open(method, url, true);
        xhr.timeout = 5 * 60 * 1000;
        for (const [name, value] of Object.entries(headers || {})) xhr.setRequestHeader?.(name, value);
        xhr.upload?.addEventListener("progress", (event) => {
          if (token === generation && event.lengthComputable && typeof onProgress === "function") onProgress(event.loaded, event.total);
        });
        xhr.addEventListener("load", () => {
          activeXhr = null;
          if (token !== generation) return reject(fail("Video upload was cancelled.", "video_upload_cancelled"));
          if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr);
          const error = Object.assign(fail("Video provider rejected the upload.", "video_binary_upload_failed"), { status: xhr.status });
          error.retryable = xhr.status === 408 || xhr.status === 409 || xhr.status === 429 || xhr.status >= 500;
          reject(error);
        });
        xhr.addEventListener("error", () => { activeXhr = null; reject(Object.assign(fail("Video upload failed because of a network error.", "video_upload_network_error"), { retryable: true })); });
        xhr.addEventListener("timeout", () => { activeXhr = null; reject(Object.assign(fail("Video upload timed out.", "video_upload_timeout"), { retryable: true })); });
        xhr.addEventListener("abort", () => { activeXhr = null; reject(fail("Video upload was cancelled.", "video_upload_cancelled")); });
        xhr.send(body);
      });
    }
    async function readTusOffset(uploadUrl, token) {
      const xhr = await requestXhr("HEAD", uploadUrl, { "Tus-Resumable": "1.0.0" }, null, token);
      const offset = Number(xhr.getResponseHeader?.("Upload-Offset"));
      if (!Number.isSafeInteger(offset) || offset < 0) throw fail("Video upload resume offset is invalid.", "video_upload_offset_invalid");
      return offset;
    }
    async function uploadTus(uploadUrl, file, token, onState) {
      let offset = 0;
      while (offset < file.size) {
        if (token !== generation) throw fail("Video upload was cancelled.", "video_upload_cancelled");
        let completed = false;
        let lastError = null;
        for (let attempt = 0; attempt < retryDelays.length && !completed; attempt += 1) {
          if (attempt > 0) {
            await delay(Math.max(0, Number(retryDelays[attempt]) || 0));
            offset = await readTusOffset(uploadUrl, token);
            if (offset >= file.size) return;
          }
          const currentOffset = offset;
          const currentChunk = file.slice(currentOffset, Math.min(file.size, currentOffset + chunkBytes));
          try {
            const xhr = await requestXhr("PATCH", uploadUrl, {
              "Tus-Resumable": "1.0.0",
              "Upload-Offset": String(currentOffset),
              "Content-Type": "application/offset+octet-stream"
            }, currentChunk, token, (loaded) => {
              notify(onState, { phase: "uploading", progress: Math.min(100, Math.round(((currentOffset + loaded) / file.size) * 100)), resumable: true });
            });
            const reportedOffset = Number(xhr.getResponseHeader?.("Upload-Offset"));
            offset = Number.isSafeInteger(reportedOffset) && reportedOffset > currentOffset
              ? reportedOffset
              : currentOffset + currentChunk.size;
            completed = true;
          } catch (error) {
            lastError = error;
            if (!error?.retryable || attempt + 1 >= retryDelays.length) throw error;
          }
        }
        if (!completed) throw lastError || fail("Video upload failed.", "video_binary_upload_failed");
        notify(onState, { phase: "uploading", progress: Math.min(100, Math.round((offset / file.size) * 100)), resumable: true });
      }
    }
    async function uploadBinary(uploadUrl, file, token, onState) {
      const body = new FormData();
      body.append("file", file, file.name);
      await requestXhr("POST", uploadUrl, {}, body, token, (loaded, total) => {
        notify(onState, { phase: "uploading", progress: Math.min(100, Math.round((loaded / total) * 100)) });
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
      throw Object.assign(fail("Video is still processing. Retry the status check.", "video_processing_timeout"), { providerId, retryable: true });
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
      const durationSeconds = await readDuration(file).catch(() => 0);
      const intent = await requestIntent({ name: file.name, type: file.type, size: file.size, durationSeconds });
      if (token !== generation) throw fail("Video upload was cancelled.", "video_upload_cancelled");
      if (String(intent.uploadProtocol || "").toLowerCase() === "tus") await uploadTus(intent.uploadUrl, file, token, options.onState);
      else await uploadBinary(intent.uploadUrl, file, token, options.onState);
      const video = await waitUntilReady(intent.providerId, token, options.onState);
      const mediaItem = createMediaItem(video, intent.providerId);
      notify(options.onState, { phase: "ready", progress: 100, providerId: intent.providerId, mediaItem });
      return mediaItem;
    }
    function cancel() { generation += 1; if (activeXhr) activeXhr.abort(); activeXhr = null; }
    return { cancel, resume, start, validateFile };
  }
  window.WingaModules = window.WingaModules || {};
  window.WingaModules.marketplace = window.WingaModules.marketplace || {};
  window.WingaModules.marketplace.createVideoUploadController = createVideoUploadController;
})();
