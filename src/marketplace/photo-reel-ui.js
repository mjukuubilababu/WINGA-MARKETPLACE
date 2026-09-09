(() => {
  const COPY = {
    "reel.unsupported": "This browser cannot create reels. You can still upload photos or a video.",
    "reel.count": "Choose 3 to 10 photos for your reel.",
    "reel.imageType": "Choose JPG, PNG, WebP or GIF photos.",
    "reel.imageSize": "Each photo must be under 10 MB and 40 megapixels.",
    "reel.totalSize": "Choose photos totaling no more than 60 MB.",
    "reel.imageDecode": "A photo could not be opened. Remove it or choose another photo.",
    "reel.outputSize": "The reel is too large. Try fewer photos.",
    "reel.failed": "The reel could not be created. Please try again.",
    "reel.interrupted": "Reel creation stopped when you left this screen. Please try again.",
    "reel.cancelled": "Reel creation cancelled.",
    "reel.preparing": "Preparing photos...",
    "reel.creating": "Creating reel...",
    "reel.ready": "Your reel is ready to preview.",
    "reel.uploading": "Uploading reel...",
    "reel.uploadFailed": "The reel was not attached. Try again or check the video upload status.",
    "reel.replaceVideo": "Replace the video currently attached to this post with this reel?",
    "reel.moveEarlier": "Move photo earlier",
    "reel.moveLater": "Move photo later",
    "reel.removePhoto": "Remove photo"
  };

  function createPhotoReelEditor(deps = {}) {
    const root = deps.root;
    if (!root) return { reset() {}, isBusy: () => false };
    const target = deps.window || window;
    const document = target.document;
    const tools = target.WingaModules.marketplace;
    const generator = tools.createPhotoReelGenerator({ window: target });
    const t = (key) => deps.translate(key, {}, COPY[key] || key);
    const find = (name) => root.querySelector("[data-reel-" + name + "]");
    const input = find("input");
    const list = find("list");
    const settings = find("settings");
    const seconds = find("seconds");
    const status = find("status");
    const progress = find("progress");
    const canvas = find("canvas");
    const preview = find("preview");
    const create = find("create");
    const cancel = find("cancel");
    const use = find("use");
    let entries = [];
    let file = null;
    let previewUrl = "";
    let busy = false;
    let epoch = 0;
    let messageKey = "";
    const setStatus = (key) => { messageKey = key; status.textContent = key ? t(key) : ""; };

    function clearPreview() {
      file = null;
      preview.pause();
      preview.removeAttribute("src");
      preview.load();
      preview.hidden = true;
      if (previewUrl) target.URL.revokeObjectURL(previewUrl);
      previewUrl = "";
      use.hidden = true;
    }
    function setBusy(value) {
      busy = value;
      settings.disabled = value || !generator.isSupported();
      list.querySelectorAll("button").forEach((button) => { button.disabled = value; });
      create.disabled = value || entries.length < 3 || !generator.isSupported();
      cancel.hidden = !value;
      progress.hidden = !value;
      use.disabled = value;
    }
    function invalidate() {
      epoch += 1;
      generator.cancel();
      clearPreview();
      canvas.hidden = true;
      canvas.width = 1;
      canvas.height = 1;
      setBusy(false);
    }
    function renderList() {
      list.replaceChildren();
      entries.forEach((entry, index) => {
        const item = document.createElement("li");
        const image = document.createElement("img");
        image.src = entry.url;
        image.alt = entry.file.name;
        image.width = 160;
        image.height = 160;
        const controls = document.createElement("div");
        const position = document.createElement("span");
        position.textContent = String(index + 1);
        controls.append(position);
        const button = (symbol, key, action, disabled = false) => {
          const node = document.createElement("button");
          node.type = "button";
          node.textContent = symbol;
          node.title = t(key);
          node.setAttribute("aria-label", t(key));
          node.disabled = disabled || busy;
          node.addEventListener("click", action);
          controls.append(node);
        };
        const move = (offset) => {
          invalidate();
          [entries[index], entries[index + offset]] = [entries[index + offset], entries[index]];
          renderList();
          list.children[index + offset]?.querySelector("button:not(:disabled)")?.focus();
        };
        button("\u2190", "reel.moveEarlier", () => move(-1), index === 0);
        button("\u2192", "reel.moveLater", () => move(1), index === entries.length - 1);
        button("\u00d7", "reel.removePhoto", () => {
          invalidate();
          target.URL.revokeObjectURL(entry.url);
          entries.splice(index, 1);
          renderList();
          input.focus();
        });
        item.append(image, controls);
        list.append(item);
      });
      create.disabled = busy || entries.length < 3 || !generator.isSupported();
    }

    async function selectFiles(files) {
      if (!deps.canUse() || busy) return;
      let candidates;
      try {
        candidates = tools.validatePhotoReelFiles([...entries.map((entry) => entry.file), ...Array.from(files || [])], 1);
      } catch (error) { setStatus(error.code || "reel.failed"); return; }
      const additions = candidates.slice(entries.length);
      if (!additions.length) return;
      invalidate();
      const token = epoch;
      const prepared = [];
      setBusy(true);
      setStatus("reel.preparing");
      try {
        for (const selected of additions) {
          const decoded = await tools.decodePhotoReelImage(selected, target, 160, 160);
          let blob;
          try {
            if (token !== epoch) return;
            blob = await new Promise((resolve) => decoded.source.toBlob(resolve, "image/jpeg", 0.8));
          } finally { decoded.close(); }
          if (token !== epoch) return;
          if (!blob) throw Object.assign(new Error(t("reel.imageDecode")), { code: "reel.imageDecode" });
          prepared.push({ file: selected, url: target.URL.createObjectURL(blob) });
        }
        entries.push(...prepared);
        prepared.length = 0;
        renderList();
        setStatus(entries.length < 3 ? "reel.count" : "");
      } catch (error) {
        if (token === epoch) setStatus(COPY[error.code] ? error.code : "reel.failed");
      } finally {
        prepared.forEach((entry) => target.URL.revokeObjectURL(entry.url));
        if (token === epoch) { setBusy(false); renderList(); }
      }
    }

    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      input.value = "";
      selectFiles(files);
    });
    root.addEventListener("toggle", () => {
      if (!root.open) { invalidate(); renderList(); return; }
      if (!generator.isSupported()) { setStatus("reel.unsupported"); setBusy(false); return; }
      if (!entries.length) selectFiles(deps.getInitialFiles?.() || []);
    });
    seconds.addEventListener("change", () => { invalidate(); setStatus(""); renderList(); });
    cancel.addEventListener("click", () => {
      invalidate();
      setStatus("reel.cancelled");
      renderList();
    });
    create.addEventListener("click", async () => {
      if (busy || !deps.canUse()) return;
      invalidate();
      const token = epoch;
      setBusy(true);
      setStatus("reel.creating");
      canvas.hidden = false;
      progress.value = 0;
      try {
        const generated = await generator.generate(entries.map((entry) => entry.file), {
          seconds: Number(seconds.value), canvas,
          onProgress(value) { if (epoch === token) progress.value = value; }
        });
        if (token !== epoch) return;
        file = generated;
        previewUrl = target.URL.createObjectURL(file);
        preview.src = previewUrl;
        preview.hidden = false;
        use.hidden = false;
        setStatus("reel.ready");
      } catch (error) {
        if (token === epoch) setStatus(COPY[error.code] ? error.code : "reel.failed");
      } finally {
        if (token === epoch) { canvas.hidden = true; setBusy(false); renderList(); }
      }
    });
    use.addEventListener("click", async () => {
      if (!file || busy || !deps.canUse()) return;
      if (deps.hasVideo?.() && !deps.confirm(t("reel.replaceVideo"))) return;
      const token = epoch;
      preview.pause();
      setBusy(true);
      cancel.hidden = true;
      setStatus("reel.uploading");
      try {
        const accepted = await deps.accept(file);
        if (token !== epoch) return;
        if (accepted) reset();
        else setStatus("reel.uploadFailed");
      } catch (_error) {
        if (token === epoch) setStatus("reel.uploadFailed");
      } finally {
        if (token === epoch) { setBusy(false); renderList(); }
      }
    });
    function reset() {
      invalidate();
      entries.forEach((entry) => target.URL.revokeObjectURL(entry.url));
      entries = [];
      input.value = "";
      root.open = false;
      setStatus("");
      renderList();
    }
    target.addEventListener("pagehide", reset);
    target.addEventListener("winga:global-context", () => { setStatus(messageKey); renderList(); });
    setBusy(false);
    return { reset, isBusy: () => busy };
  }
  window.WingaModules.marketplace.createPhotoReelEditor = createPhotoReelEditor;
})();
