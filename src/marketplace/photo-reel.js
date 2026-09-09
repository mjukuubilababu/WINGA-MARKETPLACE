(() => {
  const MIME_TYPES = ["video/webm;codecs=vp8", "video/mp4", "video/webm"];
  const WIDTH = 720;
  const HEIGHT = 1280;
  const FPS = 24;
  const fail = (code) => Object.assign(new Error(code), { code });

  function getMimeType(target) {
    if (!target.HTMLCanvasElement?.prototype?.captureStream || !target.MediaRecorder?.isTypeSupported) return "";
    return MIME_TYPES.find((type) => target.MediaRecorder.isTypeSupported(type)) || "";
  }

  function validatePhotoReelFiles(files, minimum = 3) {
    const list = Array.from(files || []);
    if (list.length < minimum || list.length > 10) throw fail("reel.count");
    let total = 0;
    for (const file of list) {
      if (!/^image\/(jpeg|png|webp|gif)$/i.test(file?.type || "")) throw fail("reel.imageType");
      if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > 10 * 1024 * 1024) throw fail("reel.imageSize");
      total += file.size;
    }
    if (total > 60 * 1024 * 1024) throw fail("reel.totalSize");
    return list;
  }

  function drawContained(context, image, opacity = 1) {
    const scale = Math.min(WIDTH / image.width, HEIGHT / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    context.globalAlpha = opacity;
    context.drawImage(image, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
    context.globalAlpha = 1;
  }

  async function decodePhotoReelImage(file, target = window, maxWidth = WIDTH, maxHeight = HEIGHT) {
    let source;
    let url = "";
    try {
      if (typeof target.createImageBitmap === "function") {
        source = await target.createImageBitmap(file);
      } else {
        source = new target.Image();
        url = target.URL.createObjectURL(file);
        await new Promise((resolve, reject) => {
          const timeout = target.setTimeout(() => reject(fail("reel.imageDecode")), 10000);
          source.onload = () => { target.clearTimeout(timeout); resolve(); };
          source.onerror = () => { target.clearTimeout(timeout); reject(fail("reel.imageDecode")); };
          source.src = url;
        });
      }
      const w = source.naturalWidth || source.width;
      const h = source.naturalHeight || source.height;
      if (!w || !h || w * h > 40000000) throw fail("reel.imageSize");
      const ratio = Math.min(1, maxWidth / w, maxHeight / h);
      const canvas = target.document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw fail("reel.unsupported");
      context.fillStyle = "#111111";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      return { source: canvas, close() { canvas.width = 1; canvas.height = 1; } };
    } catch (error) {
      throw error?.code ? error : fail("reel.imageDecode");
    } finally {
      source?.close?.();
      if (url) { source.src = ""; target.URL.revokeObjectURL(url); }
    }
  }

  function createPhotoReelGenerator(deps = {}) {
    const target = deps.window || window;
    const decode = deps.decodeImage || ((file) => decodePhotoReelImage(file, target));
    let active = null;
    function cancel(code = "reel.cancelled") { active?.abort(code); }

    async function generate(files, options = {}) {
      const list = validatePhotoReelFiles(files);
      const mimeType = getMimeType(target);
      if (!mimeType) throw fail("reel.unsupported");
      if (target.document.hidden) throw fail("reel.interrupted");
      cancel();
      const seconds = Number(options.seconds) === 3 ? 3 : 2;
      const canvas = options.canvas || target.document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw fail("reel.unsupported");
      const reducedMotion = Boolean(target.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
      const images = new Set();
      const chunks = [];
      let stream;
      let recorder;
      let raf = 0;
      let timeout = 0;
      let totalBytes = 0;
      let rejected;
      let settled = false;
      let failure = null;
      const operation = { abort(code) { if (!failure && !settled) { failure = fail(code); rejected?.(failure); } } };
      active = operation;
      const interrupted = () => { if (target.document.hidden) operation.abort("reel.interrupted"); };
      const pageLeft = () => operation.abort("reel.interrupted");
      target.document.addEventListener("visibilitychange", interrupted);
      target.addEventListener("pagehide", pageLeft);
      async function load(index) {
        if (index >= list.length) return null;
        const result = await decode(list[index]);
        if (failure || settled) { result.close(); throw failure || fail("reel.cancelled"); }
        images.add(result);
        return result;
      }
      const release = (image) => { if (image) { images.delete(image); image.close(); } };
      try {
        return await new Promise((resolve, reject) => {
          rejected = reject;
          timeout = target.setTimeout(() => operation.abort("reel.interrupted"), (list.length * seconds + 20) * 1000);
          (async () => {
            let current = await load(0);
            let next = await load(1);
            if (failure) throw failure;
            context.fillStyle = "#111111";
            context.fillRect(0, 0, WIDTH, HEIGHT);
            drawContained(context, current.source);
            stream = canvas.captureStream(FPS);
            recorder = new target.MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2000000 });
            recorder.ondataavailable = (event) => {
              if (failure || settled || !event.data?.size) return;
              totalBytes += event.data.size;
              if (totalBytes > 32 * 1024 * 1024) { operation.abort("reel.outputSize"); return; }
              chunks.push(event.data);
            };
            recorder.onerror = () => operation.abort("reel.failed");
            recorder.onstop = () => {
              if (failure || settled) return;
              if (!totalBytes) { operation.abort("reel.failed"); return; }
              const type = (recorder.mimeType || mimeType).split(";")[0];
              const extension = type === "video/mp4" ? "mp4" : "webm";
              const file = new target.File(chunks, "winga-reel-" + Date.now() + "." + extension, { type });
              settled = true;
              resolve(file);
            };
            let index = 0;
            let startedAt = target.performance.now();
            let lastFrameAt = -Infinity;
            let lastProgress = -1;
            const frame = (now) => {
              if (failure || settled) return;
              try {
                if (now - lastFrameAt < 1000 / FPS) { raf = target.requestAnimationFrame(frame); return; }
                lastFrameAt = now;
                if (now - startedAt >= seconds * 1000) {
                  if (index === list.length - 1) { recorder.stop(); return; }
                  // A slow decode must not silently omit a selected photo.
                  if (!next) { operation.abort("reel.imageDecode"); return; }
                  release(current);
                  current = next;
                  next = null;
                  index += 1;
                  startedAt = now;
                  load(index + 1).then((image) => { next = image; }).catch((error) => operation.abort(error.code || "reel.imageDecode"));
                }
                context.fillStyle = "#111111";
                context.fillRect(0, 0, WIDTH, HEIGHT);
                drawContained(context, current.source);
                const progressInPhoto = Math.max(0, (now - startedAt) / (seconds * 1000));
                if (next && !reducedMotion) {
                  const fade = Math.max(0, (progressInPhoto - 0.85) / 0.15);
                  if (fade > 0) drawContained(context, next.source, Math.min(1, fade));
                }
                const progress = Math.min(99, Math.floor(((index + progressInPhoto) / list.length) * 100));
                if (progress !== lastProgress) { lastProgress = progress; options.onProgress?.(progress); }
                raf = target.requestAnimationFrame(frame);
              } catch (_error) { operation.abort("reel.failed"); }
            };
            recorder.start(250);
            raf = target.requestAnimationFrame(frame);
          })().catch((error) => operation.abort(error.code || "reel.failed"));
        });
      } finally {
        settled = true;
        target.clearTimeout(timeout);
        target.cancelAnimationFrame(raf);
        target.document.removeEventListener("visibilitychange", interrupted);
        target.removeEventListener("pagehide", pageLeft);
        if (recorder) {
          recorder.ondataavailable = null; recorder.onerror = null; recorder.onstop = null;
          if (recorder.state !== "inactive") { try { recorder.stop(); } catch (_error) {} }
        }
        stream?.getTracks().forEach((track) => track.stop());
        images.forEach(release);
        chunks.length = 0;
        if (active === operation) active = null;
      }
    }
    return { generate, cancel, isSupported: () => Boolean(getMimeType(target)) };
  }
  window.WingaModules = window.WingaModules || {};
  Object.assign(window.WingaModules.marketplace = window.WingaModules.marketplace || {}, {
    createPhotoReelGenerator, validatePhotoReelFiles, decodePhotoReelImage
  });
})();
