(() => {
  const DEFAULT_APP_SETTINGS = Object.freeze({
    heroSectionVisible: false,
    standaloneShowcaseVisible: false,
    splashScreenVisible: true,
    sessionExpiryMinutes: 120,
    cachePolicy: "balanced",
    requireExplicitSignOut: true,
    messageReviewRequiresReason: true
  });

  function normalizeAppSettings(settings = {}) {
    const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
    const sessionExpiryMinutes = Number.parseInt(source.sessionExpiryMinutes, 10);
    const cachePolicy = String(source.cachePolicy || "").trim().toLowerCase();
    return {
      heroSectionVisible: typeof source.heroSectionVisible === "boolean" ? source.heroSectionVisible : DEFAULT_APP_SETTINGS.heroSectionVisible,
      standaloneShowcaseVisible: typeof source.standaloneShowcaseVisible === "boolean" ? source.standaloneShowcaseVisible : DEFAULT_APP_SETTINGS.standaloneShowcaseVisible,
      splashScreenVisible: typeof source.splashScreenVisible === "boolean" ? source.splashScreenVisible : DEFAULT_APP_SETTINGS.splashScreenVisible,
      sessionExpiryMinutes: Number.isFinite(sessionExpiryMinutes) ? Math.max(15, Math.min(1440, sessionExpiryMinutes)) : DEFAULT_APP_SETTINGS.sessionExpiryMinutes,
      cachePolicy: ["balanced", "cache-first", "network-first"].includes(cachePolicy) ? cachePolicy : DEFAULT_APP_SETTINGS.cachePolicy,
      requireExplicitSignOut: source.requireExplicitSignOut !== false,
      messageReviewRequiresReason: source.messageReviewRequiresReason !== false,
      updatedAt: String(source.updatedAt || "").trim(),
      updatedBy: String(source.updatedBy || "").trim()
    };
  }

  function createSettingsTools() {
    return {
      DEFAULT_APP_SETTINGS,
      normalizeAppSettings
    };
  }

  window.WingaModules = window.WingaModules || {};
  window.WingaModules.api = window.WingaModules.api || {};
  window.WingaModules.api.settingsTools = window.WingaModules.api.settingsTools || {};
  window.WingaModules.api.settingsTools.createSettingsTools = createSettingsTools;
})();
