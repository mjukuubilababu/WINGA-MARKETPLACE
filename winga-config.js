const WINGA_PROTOCOL = window.location.protocol;
const WINGA_HOST = window.location.hostname;
const WINGA_IS_FILE_MODE = WINGA_PROTOCOL === "file:";
const WINGA_IS_LOCAL_WEB = WINGA_HOST === "localhost" || WINGA_HOST === "127.0.0.1";
const WINGA_PRODUCTION_API_BASE_URL = "/api";

const WINGA_CONFIG_OVERRIDE = window.__WINGA_CONFIG_OVERRIDE__ || {};
const WINGA_DEFAULT_CONFIG = {
  provider: WINGA_IS_FILE_MODE ? "mock" : "api",
  fallbackProvider: WINGA_IS_FILE_MODE ? "mock" : "",
  enableMockSeed: WINGA_IS_FILE_MODE,
  disableServiceWorker: WINGA_IS_FILE_MODE,
  // Web builds now use a real production service worker for shell + image
  // caching. File mode stays disabled because service workers do not work
  // reliably from file:// URLs.
  enableApiLocalCacheFallback: true,
  enableBootstrapFeedSnapshot: true,
  feedPageLimit: 12,
  feedPageLimitMobile: 12,
  feedPageLimitDesktop: 24,
  enableClientEventLogging: WINGA_IS_FILE_MODE || WINGA_IS_LOCAL_WEB,
  clearLegacyLocalDataOnBoot: false,
  authRequestTimeoutMs: 18000,
  sessionRestoreTimeoutMs: 8000,
  productUploadTimeoutMs: 45000,
  apiBaseUrl: WINGA_IS_FILE_MODE
    ? "http://localhost:3000/api"
    : WINGA_IS_LOCAL_WEB
      ? "http://localhost:3000/api"
      : WINGA_PRODUCTION_API_BASE_URL,
  firebase: {
    projectId: "",
    apiKey: "",
    usersDocumentPath: "wingaState/users",
    productsDocumentPath: "wingaState/products"
  }
};

window.WINGA_CONFIG = {
  ...WINGA_DEFAULT_CONFIG,
  ...WINGA_CONFIG_OVERRIDE,
  firebase: {
    ...WINGA_DEFAULT_CONFIG.firebase,
    ...(WINGA_CONFIG_OVERRIDE.firebase || {})
  }
};
