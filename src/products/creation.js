(() => {
  function createProductCreationController(deps) {
    const doc = deps.document || document;
    const target = deps.window || window;
    const form = doc.getElementById("upload-form");
    const menu = doc.getElementById("creation-menu");
    const trigger = doc.getElementById("post-product-fab");
    const compose = form.querySelector("[data-creation-compose]");
    const details = form.querySelector("[data-creation-details]");
    const next = doc.getElementById("creation-next");
    const caption = doc.getElementById("product-name");
    const input = doc.getElementById("product-image-file");
    const title = doc.getElementById("upload-title");
    const avatar = doc.getElementById("creation-avatar");
    const avatarFallback = doc.getElementById("creation-avatar-fallback");
    let step = "compose";
    let owner = "";
    let failedAvatar = "";
    const t = (key, fallback) => deps.translate(key, {}, fallback);
    const allowed = () => deps.canUse() && !deps.isBusy();

    function closeMenu() {
      if (menu.open) menu.close();
      trigger.setAttribute("aria-expanded", "false");
    }
    function openMenu() {
      if (!allowed() || menu.open) return;
      menu.showModal();
      trigger.setAttribute("aria-expanded", "true");
    }
    function sync() {
      const active = deps.getView() === "upload" && deps.canUse();
      doc.body.classList.toggle("creation-view", active);
      trigger.title = t("creation.title", "Create new content");
      caption.setAttribute("aria-label", t("creation.caption", "Write something..."));
      if (!active) { if (!deps.canUse()) closeMenu(); return; }
      const account = deps.getAccount();
      if (owner !== account.name) { owner = account.name; step = "compose"; }
      if (deps.isEditing()) step = "details";
      compose.hidden = step === "details" && !deps.isEditing();
      details.hidden = step !== "details";
      next.hidden = deps.isEditing();
      next.disabled = !allowed() || caption.value.trim().length < 3 || !deps.hasMedia();
      title.textContent = deps.isEditing() ? t("creation.edit", "Edit post")
        : step === "details" ? t("creation.details", "Post details") : t("creation.newPost", "New post");
      doc.getElementById("creation-account-name").textContent = account.name;
      avatarFallback.textContent = account.name.slice(0, 1).toUpperCase();
      if (account.image && account.image !== failedAvatar) {
        if (avatar.getAttribute("src") !== account.image) avatar.src = account.image;
        avatar.hidden = false; avatarFallback.hidden = true;
      } else { avatar.removeAttribute("src"); avatar.hidden = true; avatarFallback.hidden = false; }
    }
    function pickMedia() { if (allowed()) input.click(); }
    trigger.addEventListener("click", openMenu);
    menu.querySelector("[data-creation-close]").addEventListener("click", closeMenu);
    menu.addEventListener("close", () => trigger.setAttribute("aria-expanded", "false"));
    menu.addEventListener("click", (event) => {
      if (event.target === menu) { closeMenu(); return; }
      const action = event.target.closest("[data-creation-action]")?.dataset.creationAction;
      if (!["post", "media", "reel"].includes(action) || !allowed()) return;
      closeMenu();
      step = "compose";
      deps.enterUpload();
      sync();
      // No await before opening the native picker: keep the mobile user gesture.
      if (action === "media") pickMedia();
      if (action === "reel") deps.openReel();
    });
    doc.getElementById("creation-pick-media").addEventListener("click", pickMedia);
    next.addEventListener("click", () => {
      if (!allowed() || caption.value.trim().length < 3 || !deps.hasMedia()) return;
      step = "details"; sync(); target.scrollTo({ top: 0, behavior: "auto" });
      doc.getElementById("product-price").focus({ preventScroll: true });
    });
    doc.getElementById("creation-back").addEventListener("click", () => {
      if (deps.isBusy()) return;
      if (deps.isEditing()) { doc.getElementById("cancel-edit-button").click(); return; }
      if (step === "details") { step = "compose"; sync(); }
      else deps.goHome();
      target.scrollTo({ top: 0, behavior: "auto" });
    });
    form.addEventListener("input", sync);
    form.addEventListener("change", sync);
    avatar.addEventListener("error", () => {
      failedAvatar = avatar.getAttribute("src") || "";
      avatar.hidden = true; avatarFallback.hidden = false;
    });
    target.addEventListener("winga:global-context", sync);
    target.addEventListener("winga:i18n-ready", sync);
    function onViewChange(view) {
      closeMenu();
      doc.body.classList.toggle("creation-view", view === "upload" && deps.canUse());
      if (view !== "upload") step = "compose";
    }
    return { sync, onViewChange, reset: () => { step = "compose"; }, openMenu };
  }
  window.WingaModules.products.createProductCreationController = createProductCreationController;
})();
