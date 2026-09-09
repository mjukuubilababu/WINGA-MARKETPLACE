(() => {
  const COPY = {
    "reel.unsupported": "This browser cannot create reels. You can still upload photos or a video.",
    "reel.count": "Choose 3 to 10 photos for your reel.",
    "reel.imageType": "Choose JPG, PNG, WebP or GIF photos.",
    "reel.imageSize": "Each photo must be under 10 MB and 40 megapixels.",
    "reel.totalSize": "Choose photos totaling no more than 60 MB.",
    "reel.imageDecode": "A photo could not be opened. Choose another photo.",
    "reel.outputSize": "The reel is too large. Try fewer photos.",
    "reel.failed": "The reel could not be created. Please try again.",
    "reel.interrupted": "Reel creation was interrupted. Please try again.",
    "reel.accountRequired": "Sign in to a seller account with a valid contact number to post your reel.",
    "reel.creating": "Creating reel...",
    "reel.publishFailed": "Your reel could not be posted. Please try again."
  };

  function createPhotoReelEditor(deps = {}) {
    const root = deps.root;
    if (!root) return { reset() {}, isBusy: () => false };
    const target = deps.window || window;
    const tools = target.WingaModules.marketplace;
    const t = (key) => deps.translate(key, {}, COPY[key] || key);
    const find = (name) => root.querySelector("[data-reel-" + name + "]");
    const input = find("input");
    const create = find("create");
    const dialog = find("dialog");
    const status = find("status");
    const spinner = find("spinner");
    const retry = find("retry");
    const cancel = find("cancel");
    const generator = tools.createPhotoReelGenerator({ window: target });
    let messageKey = "";
    let publishing = false;
    let pickerOpen = false;
    const showDialog = () => { if (!dialog.open) dialog.showModal(); };
    const closeDialog = () => { if (dialog.open) dialog.close(); };
    const beforeUnload = (event) => { event.preventDefault(); event.returnValue = ""; };
    const setMessage = (key) => { messageKey = key; status.textContent = key ? t(key) : ""; };
    const publisher = tools.createPhotoReelPublisher({
      generator,
      uploader: tools.createVideoUploadController({
        readDuration: (file) => Promise.resolve(file.reelDurationSeconds || 0),
        requestVideoUpload: deps.requestVideoUpload,
        readVideoUploadStatus: deps.readVideoUploadStatus
      }),
      validate: tools.validatePhotoReelFiles,
      canUse: deps.canUse, getOwner: deps.getOwner, getContext: deps.getContext,
      createId: deps.createId, publish: deps.publish, findPublished: deps.findPublished,
      onState(state) {
        publishing = state.busy && state.phase === "publishing";
        create.disabled = state.busy;
        spinner.hidden = !state.busy;
        dialog.setAttribute("aria-busy", String(state.busy));
        cancel.disabled = publishing;
        retry.hidden = state.phase !== "error" || !publisher.canRetry();
        target.removeEventListener("beforeunload", beforeUnload);
        if (state.busy) {
          target.addEventListener("beforeunload", beforeUnload);
          showDialog();
          setMessage("reel.creating");
        } else if (state.phase === "error") {
          showDialog();
          setMessage(COPY[state.error] ? state.error : "reel.publishFailed");
        } else { closeDialog(); setMessage(""); }
      },
      onPublished: deps.onPublished
    });
    const showError = (error) => {
      spinner.hidden = true;
      retry.hidden = true;
      cancel.disabled = false;
      showDialog();
      setMessage(COPY[error?.code] ? error.code : "reel.publishFailed");
    };
    create.addEventListener("click", () => {
      if (publisher.isBusy() || pickerOpen || !deps.canUse()) return;
      if (!generator.isSupported()) { showError({ code: "reel.unsupported" }); return; }
      // Stay in the click gesture so mobile browsers open the native gallery.
      input.value = "";
      pickerOpen = true;
      try { input.click(); } catch (error) { pickerOpen = false; showError(error); }
    });
    input.addEventListener("cancel", () => { pickerOpen = false; });
    input.addEventListener("change", () => {
      pickerOpen = false;
      const files = Array.from(input.files || []);
      input.value = "";
      if (!files.length) return;
      try { Promise.resolve(publisher.start(files)).catch(showError); }
      catch (error) { showError(error); }
    });
    retry.addEventListener("click", () => { void publisher.retry(); });
    cancel.addEventListener("click", () => { if (!publishing) publisher.cancel(); });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (!publishing) publisher.cancel();
    });
    function reset() {
      pickerOpen = false;
      publisher.cancel();
    }
    target.addEventListener("pagehide", reset);
    target.addEventListener("winga:global-context", () => setMessage(messageKey));
    return { reset, isBusy: publisher.isBusy };
  }
  window.WingaModules.marketplace.createPhotoReelEditor = createPhotoReelEditor;
})();
