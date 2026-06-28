require("./load-env");

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createPostgresStore } = require("./db");

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || "";
const DATABASE_SSL = String(process.env.DATABASE_SSL || "").toLowerCase() === "true";
const DATA_DIR = process.env.WINGA_DATA_DIR
  ? path.resolve(process.env.WINGA_DATA_DIR)
  : path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const AUDIT_FILE = path.join(DATA_DIR, "audit.log");
const UPLOADS_DIR = process.env.WINGA_UPLOADS_DIR
  ? path.resolve(process.env.WINGA_UPLOADS_DIR)
  : path.join(__dirname, "uploads");
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const APP_HTML_TEMPLATE_PATH = path.join(__dirname, "..", "index.html");
const APP_HTML_TEMPLATE = fs.existsSync(APP_HTML_TEMPLATE_PATH)
  ? fs.readFileSync(APP_HTML_TEMPLATE_PATH, "utf8")
  : "";
const NODE_ENV = process.env.NODE_ENV || "development";
const PAYMENT_WEBHOOK_SECRET = String(process.env.PAYMENT_WEBHOOK_SECRET || "").trim();
const ALLOW_UNVERIFIED_MANUAL_PAYMENTS = String(process.env.ALLOW_UNVERIFIED_MANUAL_PAYMENTS || "").toLowerCase() === "true";
const HASH_PREFIX = "scrypt";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_SEED_USERNAME = String(process.env.ADMIN_SEED_USERNAME || "admin").trim();
const ADMIN_SEED_FULL_NAME = String(process.env.ADMIN_SEED_FULL_NAME || "WILHARD MMBANDO").trim();
const ADMIN_SEED_PASSWORD = process.env.ADMIN_SEED_PASSWORD || "";
const MODERATOR_SEED_PASSWORD = process.env.MODERATOR_SEED_PASSWORD || "";
const ADMIN_SEED = {
  username: ADMIN_SEED_USERNAME || "admin",
  fullName: ADMIN_SEED_FULL_NAME || "WILHARD MMBANDO",
  password: ADMIN_SEED_PASSWORD || "Admin1234",
  phoneNumber: "255700000000",
  nationalId: "ADMIN001",
  primaryCategory: "wanawake",
  role: "admin"
};
const MODERATOR_SEED = {
  username: "moderator",
  password: MODERATOR_SEED_PASSWORD || "Moderator1234",
  phoneNumber: "255700000001",
  nationalId: "MOD001",
  primaryCategory: "wanawake",
  role: "moderator"
};
const DEFAULT_CATEGORIES = [
  { value: "wanawake", label: "WANAWAKE" },
  { value: "wanawake-magauni", label: "Magauni" },
  { value: "wanawake-sketi", label: "Sketi" },
  { value: "wanawake-blouse", label: "Blouse" },
  { value: "wanawake-suruali", label: "Suruali" },
  { value: "wanawake-seti", label: "Seti" },
  { value: "wanawake-underwear", label: "Underwear" },
  { value: "wanawake-vitenge", label: "Vitenge" },
  { value: "wanawake-bazin", label: "Bazin" },
  { value: "wanawake-bazee", label: "Bazee" },
  { value: "wanawake-lace", label: "Lace" },
  { value: "wanawake-kanga", label: "Kanga" },
  { value: "wanawake-vikoi", label: "Vikoi" },
  { value: "wanawake-mitandio", label: "Mitandio" },
  { value: "wanawake-vijora", label: "Vijora" },
  { value: "wanawake-madera", label: "Madera" },
  { value: "wanawake-baibui", label: "Baibui" },
  { value: "wanawake-hijabu", label: "Hijabu" },
  { value: "wanawake-abaya", label: "Abaya" },
  { value: "wanawake-shungi", label: "Shungi" },
  { value: "wanawake-crop-top", label: "Crop top" },
  { value: "wanaume", label: "WANAUME" },
  { value: "wanaume-mashati", label: "Mashati" },
  { value: "wanaume-t-shirt", label: "T-shirt" },
  { value: "wanaume-sweater", label: "Sweater" },
  { value: "wanaume-koti", label: "Koti" },
  { value: "wanaume-jacket", label: "Jacket" },
  { value: "wanaume-tracksuit", label: "Tracksuit" },
  { value: "wanaume-suruali-kitambaa", label: "Suruali-kitambaa" },
  { value: "wanaume-jeans", label: "Jeans" },
  { value: "wanaume-suti", label: "Suti" },
  { value: "wanaume-boxer", label: "Boxer" },
  { value: "wanaume-crocs", label: "Crocs" },
  { value: "sherehe", label: "SHEREHE" },
  { value: "sherehe-mavazi", label: "Mavazi ya sherehe" },
  { value: "sherehe-viatu", label: "Viatu vya sherehe" },
  { value: "sherehe-accessories", label: "Accessories za sherehe" },
  { value: "casual", label: "CASUAL" },
  { value: "casual-mavazi", label: "Mavazi ya casual" },
  { value: "casual-viatu", label: "Viatu vya casual" },
  { value: "casual-kila-siku", label: "Seti za kila siku" },
  { value: "watoto", label: "WATOTO" },
  { value: "watoto-wavulana", label: "Wavulana" },
  { value: "watoto-wasichana", label: "Wasichana" },
  { value: "watoto-viatu-vya-watoto", label: "Viatu vya watoto" },
  { value: "watoto-seti-za-watoto", label: "Seti za watoto" },
  { value: "viatu", label: "VIATU" },
  { value: "viatu-sneakers", label: "Sneakers" },
  { value: "viatu-sandals", label: "Sandals" },
  { value: "viatu-high-heels", label: "High heels" },
  { value: "viatu-boots", label: "Boots" },
  { value: "viatu-vikali", label: "Viatu vikali" },
  { value: "viatu-raba-kali", label: "Raba kali" },
  { value: "viatu-miguu-mikali", label: "Miguu mikali" },
  { value: "viatu-official", label: "Official" },
  { value: "vyombo", label: "VYOMBO" },
  { value: "vyombo-sufuria", label: "Sufuria" },
  { value: "vyombo-sahani", label: "Sahani" },
  { value: "vyombo-vikombe", label: "Vikombe" },
  { value: "vyombo-seti", label: "Seti za vyombo" },
  { value: "electronics", label: "ELECTRONICS" },
  { value: "electronics-simu", label: "Simu" },
  { value: "electronics-desktop", label: "Desktop" },
  { value: "electronics-radio", label: "Radio" },
  { value: "electronics-tv", label: "Tv" },
  { value: "electronics-laptop", label: "Laptop" },
  { value: "vitu-used", label: "VITU USED" },
  { value: "accessories", label: "ACCESSORIES" },
  { value: "accessories-mabegi", label: "Mabegi" },
  { value: "accessories-mikanda", label: "Mikanda" },
  { value: "accessories-kofia", label: "Kofia" },
  { value: "accessories-saa", label: "Saa" }
];
const ALLOWED_ROLES = ["buyer", "seller", "admin", "moderator"];
const ALLOWED_PRODUCT_STATUSES = ["pending", "approved", "rejected"];
const ALLOWED_ORDER_STATUSES = ["placed", "paid", "confirmed", "delivered", "cancelled"];
const ALLOWED_PAYMENT_STATUSES = ["pending", "paid", "failed", "cancelled"];
const ALLOWED_USER_STATUSES = ["active", "suspended", "banned", "flagged", "deactivated"];
const ALLOWED_REPORT_STATUSES = ["open", "reviewed", "resolved"];
const ALLOWED_REPORT_TARGETS = ["user", "product"];
const ALLOWED_NOTIFICATION_TYPES = ["message", "request", "order"];
const ALLOWED_PROMOTION_TYPES = ["starter_day", "boost_3day", "growth_7day", "premium_14day", "boost", "featured", "category_boost", "pin_top"];
const ALLOWED_PROMOTION_STATUSES = ["pending", "active", "rejected", "expired", "disabled"];
const ALLOWED_IDENTITY_DOCUMENT_TYPES = ["NIDA", "VOTER_ID"];
const ALLOWED_VERIFICATION_STATUSES = ["unverified", "pending", "verified", "rejected"];
const PROMOTION_CONFIG = {
  starter_day: { amount: 1000, durationDays: 1, label: "1 day visibility" },
  boost_3day: { amount: 3000, durationDays: 3, label: "3 day visibility" },
  growth_7day: { amount: 7000, durationDays: 7, label: "7 day visibility" },
  premium_14day: { amount: 14000, durationDays: 14, label: "14 day visibility" },
  boost: { amount: 5000, durationDays: 3, label: "Boost Product" },
  featured: { amount: 10000, durationDays: 7, label: "Featured Section" },
  category_boost: { amount: 7000, durationDays: 5, label: "Category Boost" },
  pin_top: { amount: 12000, durationDays: 2, label: "Pin To Top" }
};
const MAX_IMAGE_COUNT = 5;
const MAX_IMAGE_SIZE_MB = 6;
const MAX_IMAGE_BINARY_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_IMAGE_BINARY_BYTES * 1.37) + 256;
const ALLOWED_DATA_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_REQUEST_BODY_BYTES = 16 * 1024 * 1024;
const MAX_BACKUP_FILES = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_BUCKETS = 5000;
const BUYER_CANCEL_WINDOW_MS = 48 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;
const WHATSAPP_VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const WHATSAPP_VERIFICATION_PREVIEW_MODE = NODE_ENV !== "production";
const RATE_LIMIT_RULES = {
  "/api/auth/login": { limit: 10, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/auth/admin-login": { limit: 8, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/auth/signup": { limit: 6, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/auth/recover-password": { limit: 6, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/products": { limit: 30, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/messages": { limit: 24, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/messages/read": { limit: 40, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/orders": { limit: 12, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/reviews": { limit: 10, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/promotions": { limit: 8, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/reports": { limit: 8, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/client-events": { limit: 20, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/users/me/whatsapp/request-change": { limit: 6, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/users/me/whatsapp/verify-change": { limit: 12, windowMs: RATE_LIMIT_WINDOW_MS }
};
const rateLimitStore = new Map();
const liveClients = new Map();
const postgresStore = DATABASE_URL
  ? createPostgresStore({
    databaseUrl: DATABASE_URL,
    ssl: DATABASE_SSL
  })
  : null;
const CONFIGURED_ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOW_LOCAL_DATA_STORE_IN_PRODUCTION = String(process.env.ALLOW_LOCAL_DATA_STORE_IN_PRODUCTION || "").toLowerCase() === "true";
const ALLOW_DEFAULT_ORIGIN_FALLBACK = String(process.env.ALLOW_DEFAULT_ORIGIN_FALLBACK || "").toLowerCase() === "true";
const TRUST_PROXY_HEADERS = String(process.env.TRUST_PROXY_HEADERS || "").toLowerCase() === "true";
const SAFE_IMAGE_PLACEHOLDER_PATH = "/share-og.svg";
const DEFAULT_BOOTSTRAP_PRODUCT_LIMIT = 12;
const MAX_BOOTSTRAP_PRODUCT_LIMIT = 24;
const MAX_API_PRODUCT_LIMIT = 50;
const AUTH_COOKIE_NAME = "winga_auth";
const CSRF_COOKIE_NAME = "winga_csrf";
const CSRF_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const RAW_CSRF_SECRET = String(process.env.CSRF_SECRET || "").trim();
const DEVELOPMENT_CSRF_SECRET = "winga-development-csrf-secret";
const CSRF_SECRET = NODE_ENV === "production" ? RAW_CSRF_SECRET : (RAW_CSRF_SECRET || DEVELOPMENT_CSRF_SECRET);
let requestSequence = 0;

function validateRuntimeConfiguration() {
  const warnings = [];
  const errors = [];

  if (NODE_ENV === "production") {
    if (!DATABASE_URL && !ALLOW_LOCAL_DATA_STORE_IN_PRODUCTION) {
      errors.push("DATABASE_URL is required in production unless ALLOW_LOCAL_DATA_STORE_IN_PRODUCTION=true is set intentionally.");
    }
    if (!CONFIGURED_ALLOWED_ORIGINS.length && !ALLOW_DEFAULT_ORIGIN_FALLBACK) {
      errors.push("ALLOWED_ORIGINS must be configured in production unless ALLOW_DEFAULT_ORIGIN_FALLBACK=true is explicitly allowed.");
    }
    if (ADMIN_SEED_PASSWORD && ADMIN_SEED_PASSWORD === "Admin1234") {
      errors.push("ADMIN_SEED_PASSWORD must not use the default seed password in production.");
    }
    if (MODERATOR_SEED_PASSWORD && MODERATOR_SEED_PASSWORD === "Moderator1234") {
      errors.push("MODERATOR_SEED_PASSWORD must not use the default seed password in production.");
    }
    if (DATABASE_URL && !DATABASE_SSL) {
      warnings.push("DATABASE_SSL is disabled while DATABASE_URL is configured in production.");
    }
    if (!ADMIN_SEED_PASSWORD) {
      warnings.push("ADMIN_SEED_PASSWORD is not configured in production. Default staff credentials remain active until this is set.");
    }
    if (!MODERATOR_SEED_PASSWORD) {
      warnings.push("MODERATOR_SEED_PASSWORD is not configured in production. Default moderator credentials remain active until this is set.");
    }
    if (!PAYMENT_WEBHOOK_SECRET && !ALLOW_UNVERIFIED_MANUAL_PAYMENTS) {
      errors.push("PAYMENT_WEBHOOK_SECRET is required in production unless ALLOW_UNVERIFIED_MANUAL_PAYMENTS=true is explicitly allowed.");
    }
    if (!RAW_CSRF_SECRET) {
      errors.push("CSRF_SECRET is required in production. Set a high-entropy secret that is separate from admin, session, and webhook secrets.");
    } else if (RAW_CSRF_SECRET.length < 32) {
      errors.push("CSRF_SECRET must be at least 32 characters in production.");
    }
  } else {
    if (!DATABASE_URL) {
      warnings.push("Backend is running on the local file store. This is acceptable for dev/test but not ideal for broader rollout.");
    }
    if (!CONFIGURED_ALLOWED_ORIGINS.length) {
      warnings.push("ALLOWED_ORIGINS is not configured. Default same-host / localhost behavior is active.");
    }
  }

  return {
    warnings,
    errors,
    storageMode: DATABASE_URL ? "postgres" : "local-file"
  };
}

const runtimeConfiguration = validateRuntimeConfiguration();
if (runtimeConfiguration.errors.length) {
  console.error("[WING] runtime configuration errors", runtimeConfiguration.errors);
  console.error("[WING] runtime configuration summary", {
    environment: NODE_ENV,
    storageMode: runtimeConfiguration.storageMode,
    hasDatabaseUrl: Boolean(DATABASE_URL),
    databaseSsl: DATABASE_SSL,
    allowedOriginsCount: CONFIGURED_ALLOWED_ORIGINS.length,
    hasAdminSeedPassword: Boolean(ADMIN_SEED_PASSWORD),
    hasModeratorSeedPassword: Boolean(MODERATOR_SEED_PASSWORD),
    hasCsrfSecret: Boolean(RAW_CSRF_SECRET),
    hasPaymentWebhookSecret: Boolean(PAYMENT_WEBHOOK_SECRET),
    allowUnverifiedManualPayments: ALLOW_UNVERIFIED_MANUAL_PAYMENTS,
    allowLocalDataStoreInProduction: ALLOW_LOCAL_DATA_STORE_IN_PRODUCTION,
    allowDefaultOriginFallback: ALLOW_DEFAULT_ORIGIN_FALLBACK
  });
  throw new Error(`Runtime configuration invalid:\n- ${runtimeConfiguration.errors.join("\n- ")}`);
}

function getSeedUsersForEnvironment() {
  return [ADMIN_SEED, MODERATOR_SEED];
}

function normalizeClientIp(value = "") {
  let candidate = String(value || "").trim();
  if (!candidate) {
    return "";
  }
  if (candidate.startsWith("::ffff:")) {
    candidate = candidate.slice(7);
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.split(":")[0];
  }
  candidate = candidate.replace(/^\[|\]$/g, "");
  return /^[a-f0-9:.]+$/i.test(candidate) ? candidate.slice(0, 64) : "";
}

function ensureLocalArtifacts() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const seededUsers = getSeedUsersForEnvironment().map((seedUser) => ({
      ...seedUser,
      password: createPasswordHash(seedUser.password),
      createdAt: new Date().toISOString()
    }));
      fs.writeFileSync(DATA_FILE, JSON.stringify({
        categories: DEFAULT_CATEGORIES,
        users: seededUsers,
        products: [],
        sessions: [],
        orders: [],
        payments: [],
        messages: [],
        notifications: [],
        promotions: [],
        reviews: [],
        reports: [],
        moderationActions: [],
        settings: {
          heroSectionVisible: false,
          standaloneShowcaseVisible: false,
          splashScreenVisible: true,
          sessionExpiryMinutes: 120,
          cachePolicy: "balanced",
          requireExplicitSignOut: true,
          messageReviewRequiresReason: true
        }
      }, null, 2));
  }
}

function createRequestId() {
  requestSequence = (requestSequence + 1) % 1000000000;
  return `req-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}

function getMemoryUsageSnapshot() {
  const usage = process.memoryUsage();
  return {
    rssMb: Number((usage.rss / (1024 * 1024)).toFixed(1)),
    heapUsedMb: Number((usage.heapUsed / (1024 * 1024)).toFixed(1)),
    heapTotalMb: Number((usage.heapTotal / (1024 * 1024)).toFixed(1)),
    externalMb: Number((usage.external / (1024 * 1024)).toFixed(1))
  };
}

function logStructuredEvent(level, event, detail = {}) {
  const payload = {
    level,
    event,
    time: new Date().toISOString(),
    ...detail
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function logRouteSummary(meta, extra = {}) {
  logStructuredEvent("info", "route_summary", {
    requestId: meta.requestId,
    route: meta.route,
    method: meta.method,
    durationMs: Date.now() - meta.startedAt,
    statusCode: meta.statusCode || 200,
    cfRay: meta.cfRay || "",
    memory: getMemoryUsageSnapshot(),
    ...extra
  });
}

function logRouteMemoryStage(meta, stage, extra = {}) {
  logStructuredEvent("info", "route_memory_stage", {
    requestId: meta.requestId,
    route: meta.route,
    method: meta.method,
    stage,
    cfRay: meta.cfRay || "",
    memory: getMemoryUsageSnapshot(),
    ...extra
  });
}

function getBackupStatus() {
  if (postgresStore) {
    return {
      mode: "external",
      fileCount: 0,
      latestBackupAt: "",
      latestBackupName: "",
      note: "Use managed PostgreSQL backups or scheduled pg_dump snapshots."
    };
  }

  ensureLocalArtifacts();
  const backupFiles = fs.readdirSync(BACKUP_DIR)
    .map((fileName) => {
      const filePath = path.join(BACKUP_DIR, fileName);
      const stats = fs.statSync(filePath);
      return {
        fileName,
        mtimeMs: stats.mtimeMs
      };
    })
    .sort((first, second) => second.mtimeMs - first.mtimeMs);
  const latest = backupFiles[0] || null;
  return {
    mode: "local-file",
    fileCount: backupFiles.length,
    latestBackupAt: latest ? new Date(latest.mtimeMs).toISOString() : "",
    latestBackupName: latest?.fileName || "",
    note: latest
      ? "Local store backups are rolling automatically before each write."
      : "No local backup snapshot has been written yet."
  };
}

function safeConsole(method, message, details) {
  if (NODE_ENV === "production" && method !== "error" && method !== "warn") {
    return;
  }

  const logger = console[method] || console.log;
  if (details) {
    logger(message, details);
    return;
  }
  logger(message);
}

if (runtimeConfiguration.warnings.length) {
  console.warn("[WINGA] runtime configuration warnings", runtimeConfiguration.warnings);
}

function sanitizePlainText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[<>"'`]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeIdentifier(value, maxLength = 40) {
  return sanitizePlainText(value, maxLength).toLowerCase();
}

function getAdminSeedIdentity() {
  return {
    username: normalizeIdentifier(ADMIN_SEED_USERNAME || "admin", 40) || "admin",
    fullName: sanitizePlainText(ADMIN_SEED_FULL_NAME || ADMIN_SEED.fullName || "WILHARD MMBANDO", 120) || "WILHARD MMBANDO"
  };
}

function getAdminSeedPassword() {
  return String(ADMIN_SEED_PASSWORD || ADMIN_SEED.password || "").trim();
}

const DEFAULT_APP_SETTINGS = {
  heroSectionVisible: false,
  standaloneShowcaseVisible: false,
  splashScreenVisible: true,
  sessionExpiryMinutes: 120,
  cachePolicy: "balanced",
  requireExplicitSignOut: true,
  messageReviewRequiresReason: true
};

function normalizeAppSettings(settings = {}) {
  const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const sessionExpiryMinutes = Number.parseInt(source.sessionExpiryMinutes, 10);
  const cachePolicy = sanitizePlainText(source.cachePolicy, 24).toLowerCase();
  return {
    heroSectionVisible: typeof source.heroSectionVisible === "boolean" ? source.heroSectionVisible : DEFAULT_APP_SETTINGS.heroSectionVisible,
    standaloneShowcaseVisible: typeof source.standaloneShowcaseVisible === "boolean" ? source.standaloneShowcaseVisible : DEFAULT_APP_SETTINGS.standaloneShowcaseVisible,
    splashScreenVisible: typeof source.splashScreenVisible === "boolean" ? source.splashScreenVisible : DEFAULT_APP_SETTINGS.splashScreenVisible,
    sessionExpiryMinutes: Number.isFinite(sessionExpiryMinutes) ? Math.max(15, Math.min(1440, sessionExpiryMinutes)) : DEFAULT_APP_SETTINGS.sessionExpiryMinutes,
    cachePolicy: ["balanced", "cache-first", "network-first"].includes(cachePolicy) ? cachePolicy : DEFAULT_APP_SETTINGS.cachePolicy,
    requireExplicitSignOut: source.requireExplicitSignOut !== false,
    messageReviewRequiresReason: source.messageReviewRequiresReason !== false,
    updatedAt: sanitizePlainText(source.updatedAt, 40),
    updatedBy: sanitizePlainText(source.updatedBy, 40)
  };
}

function buildPublicAppSettings(settings = {}) {
  const normalized = normalizeAppSettings(settings);
  return {
    heroSectionVisible: normalized.heroSectionVisible,
    standaloneShowcaseVisible: normalized.standaloneShowcaseVisible,
    splashScreenVisible: normalized.splashScreenVisible,
    sessionExpiryMinutes: normalized.sessionExpiryMinutes,
    cachePolicy: normalized.cachePolicy,
    requireExplicitSignOut: normalized.requireExplicitSignOut,
    messageReviewRequiresReason: normalized.messageReviewRequiresReason,
    updatedAt: normalized.updatedAt,
    updatedBy: normalized.updatedBy
  };
}

function validateAppSettingsPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Settings payload si sahihi.";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "heroSectionVisible") && typeof payload.heroSectionVisible !== "boolean") {
    return "Hero visibility si sahihi.";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "standaloneShowcaseVisible") && typeof payload.standaloneShowcaseVisible !== "boolean") {
    return "Showcase visibility si sahihi.";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "splashScreenVisible") && typeof payload.splashScreenVisible !== "boolean") {
    return "Splash visibility si sahihi.";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "requireExplicitSignOut") && typeof payload.requireExplicitSignOut !== "boolean") {
    return "Sign-out policy si sahihi.";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "messageReviewRequiresReason") && typeof payload.messageReviewRequiresReason !== "boolean") {
    return "Message review policy si sahihi.";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "sessionExpiryMinutes")) {
    const minutes = Number.parseInt(payload.sessionExpiryMinutes, 10);
    if (!Number.isFinite(minutes) || minutes < 15 || minutes > 1440) {
      return "Session expiry lazima iwe kati ya dakika 15 na 1440.";
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "cachePolicy")) {
    const cachePolicy = sanitizePlainText(payload.cachePolicy, 24).toLowerCase();
    if (!["balanced", "cache-first", "network-first"].includes(cachePolicy)) {
      return "Cache policy si sahihi.";
    }
  }
  return "";
}

function syncConfiguredAdminCredentials(store) {
  const nextStore = {
    ...store,
    users: Array.isArray(store?.users) ? [...store.users] : []
  };
  const adminIdentity = getAdminSeedIdentity();
  const adminPassword = getAdminSeedPassword();
  if (!adminPassword) {
    return { store: nextStore, didChange: false };
  }

  const adminIndex = nextStore.users.findIndex((user) => {
    const normalizedUsername = normalizeIdentifier(user?.username || "", 40);
    const normalizedFullName = normalizeIdentifier(user?.fullName || "", 120);
    return user?.role === "admin"
      || normalizedUsername === adminIdentity.username
      || normalizedFullName === normalizeIdentifier(ADMIN_SEED_FULL_NAME || "", 120)
      || normalizedUsername === "admin";
  });

  const adminRecord = normalizeUserRecord({
    ...(adminIndex >= 0 ? nextStore.users[adminIndex] : {}),
    username: adminIdentity.username,
    fullName: adminIdentity.fullName,
    role: "admin",
    password: createPasswordHash(adminPassword)
  });

  if (adminIndex >= 0) {
    const before = JSON.stringify(nextStore.users[adminIndex] || {});
    const after = JSON.stringify(adminRecord);
    if (before !== after) {
      nextStore.users[adminIndex] = adminRecord;
      return { store: nextStore, didChange: true };
    }
    return { store: nextStore, didChange: false };
  }

  nextStore.users.unshift(adminRecord);
  return { store: nextStore, didChange: true };
}

function normalizeOptionalPrice(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function slugifyCategoryLabel(label) {
  return String(label || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function normalizeCategoryLabelText(label) {
  return String(label || "").trim().replace(/\s+/g, " ");
}

function formatTopCategoryLabel(label) {
  return normalizeCategoryLabelText(label).toUpperCase();
}

function formatSubcategoryLabel(label) {
  const normalized = normalizeCategoryLabelText(label).toLowerCase();
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : "";
}

function normalizeCategoryEntry(entry) {
  const rawLabel = typeof entry?.label === "string" ? entry.label.trim() : "";
  const rawValue = typeof entry?.value === "string" ? entry.value.trim() : "";
  const value = slugifyCategoryLabel(rawValue || rawLabel);
  const fallbackLabel = value.replace(/-/g, " ");
  const label = value.includes("-")
    ? formatSubcategoryLabel(rawLabel || fallbackLabel)
    : formatTopCategoryLabel(rawLabel || fallbackLabel);

  if (!value || !label) {
    return null;
  }

  return {
    value,
    label,
    createdAt: entry?.createdAt || new Date().toISOString()
  };
}

function mergeCategories(...categoryLists) {
  const categoryMap = new Map();
  [...DEFAULT_CATEGORIES, ...categoryLists.flat()]
    .map(normalizeCategoryEntry)
    .filter(Boolean)
    .forEach((category) => {
      if (!categoryMap.has(category.value)) {
        categoryMap.set(category.value, category);
      }
    });
  return Array.from(categoryMap.values());
}

function readLegacyStore() {
  ensureLocalArtifacts();
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const users = syncConfiguredAdminIdentity(Array.isArray(parsed.users) ? parsed.users.map(normalizeUserRecord) : []);
  getSeedUsersForEnvironment().forEach((seedUser) => {
    if (!users.find((user) => user.username === seedUser.username)) {
      users.unshift({
        ...seedUser,
        password: createPasswordHash(seedUser.password),
        createdAt: new Date().toISOString()
      });
    }
  });
  const products = Array.isArray(parsed.products) ? parsed.products : [];
  const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
  const orders = Array.isArray(parsed.orders) ? parsed.orders : [];
  const payments = Array.isArray(parsed.payments) ? parsed.payments : [];
  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  const notifications = Array.isArray(parsed.notifications) ? parsed.notifications : [];
  const promotions = Array.isArray(parsed.promotions) ? parsed.promotions : [];
  const reviews = Array.isArray(parsed.reviews) ? parsed.reviews : [];
  const reports = Array.isArray(parsed.reports) ? parsed.reports : [];
  const moderationActions = Array.isArray(parsed.moderationActions) ? parsed.moderationActions : [];
  return {
    categories: mergeCategories(parsed.categories || []),
    users,
    products,
    orders: orders.map(normalizeOrderRecord),
    payments: payments.map(normalizePaymentRecord),
    messages: messages.map(normalizeMessageRecord),
    notifications: notifications.map(normalizeNotificationRecord),
    promotions: promotions.map(normalizePromotionRecord),
    reviews: reviews.map(normalizeReviewRecord),
    reports: reports.map(normalizeReportRecord),
    moderationActions: moderationActions.map(normalizeModerationActionRecord),
    settings: normalizeAppSettings(parsed.settings || DEFAULT_APP_SETTINGS),
    sessions: sessions.map((session) => {
      const sessionUser = users.find((user) => user.username === session.username);
      return {
        ...session,
        primaryCategory: session.primaryCategory || sessionUser?.primaryCategory || "",
        role: isValidRole(session.role) ? session.role : (sessionUser?.role || "seller")
      };
    })
  };
}

function syncConfiguredAdminIdentity(users = []) {
  const adminIdentity = getAdminSeedIdentity();
  const normalizedUsers = Array.isArray(users) ? [...users] : [];
  const adminIndex = normalizedUsers.findIndex((user) => {
    const normalizedUsername = normalizeIdentifier(user?.username || "", 40);
    const normalizedFullName = normalizeIdentifier(user?.fullName || "", 120);
    return user?.role === "admin"
      || normalizedUsername === adminIdentity.username
      || normalizedFullName === normalizeIdentifier(ADMIN_SEED_FULL_NAME || "", 120)
      || normalizedUsername === "admin";
  });

  if (adminIndex >= 0) {
    normalizedUsers[adminIndex] = normalizeUserRecord({
      ...normalizedUsers[adminIndex],
      username: adminIdentity.username,
      fullName: adminIdentity.fullName,
      role: "admin"
    });
  }

  return normalizedUsers;
}

function writeLegacyStore(store, options = {}) {
  ensureLocalArtifacts();
  const skipBackup = Boolean(options.skipBackup);
  if (!skipBackup && fs.existsSync(DATA_FILE)) {
    const backupName = `store-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, backupName));

    const backupFiles = fs.readdirSync(BACKUP_DIR)
      .map((fileName) => ({
        fileName,
        filePath: path.join(BACKUP_DIR, fileName),
        stats: fs.statSync(path.join(BACKUP_DIR, fileName))
      }))
      .sort((first, second) => second.stats.mtimeMs - first.stats.mtimeMs);

    backupFiles.slice(MAX_BACKUP_FILES).forEach((file) => {
      fs.unlinkSync(file.filePath);
    });
  }

  const nextStorePayload = JSON.stringify(store, null, 2);
  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, nextStorePayload);
  fs.renameSync(tempFile, DATA_FILE);
}

async function appendAuditLog(entry) {
  ensureLocalArtifacts();
  fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(entry)}\n`);
  if (postgresStore) {
    await postgresStore.appendAuditLog(entry);
  }
}

async function readRecentAuditEntries(limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  if (postgresStore?.readRecentAuditLogs) {
    return postgresStore.readRecentAuditLogs(safeLimit);
  }

  ensureLocalArtifacts();
  if (!fs.existsSync(AUDIT_FILE)) {
    return [];
  }

  const lines = fs.readFileSync(AUDIT_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-safeLimit)
    .reverse();

  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      return null;
    }
  }).filter(Boolean);
}

async function readStore() {
  if (postgresStore) {
    return postgresStore.readStore();
  }
  return readLegacyStore();
}

async function writeStore(store) {
  return writeStoreWithOptions(store, {});
}

async function writeStoreWithOptions(store, options = {}) {
  if (postgresStore) {
    await postgresStore.writeStore(store);
    return;
  }
  writeLegacyStore(store, options);
}

function recordAuditLog(entry) {
  appendAuditLog(entry).catch((error) => {
    console.warn("[WINGA] Audit log write failed.", error);
  });
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${HASH_PREFIX}:${salt}:${hash}`;
}

function isPasswordHashed(passwordValue) {
  return typeof passwordValue === "string" && passwordValue.startsWith(`${HASH_PREFIX}:`);
}

function verifyPassword(password, passwordValue) {
  if (!passwordValue) return false;

  if (!isPasswordHashed(passwordValue)) {
    return passwordValue === password;
  }

  const [, salt, storedHash] = passwordValue.split(":");
  if (!salt || !storedHash) return false;

  const candidateHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const storedBuffer = Buffer.from(storedHash, "hex");
  const candidateBuffer = Buffer.from(candidateHash, "hex");

  if (storedBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedBuffer, candidateBuffer);
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, buildSecurityHeaders(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": statusCode >= 400 ? "no-store" : "no-cache",
    ...extraHeaders,
    ...(res.__wingaMeta?.requestId ? { "X-Request-Id": res.__wingaMeta.requestId } : {})
  }, res.__wingaReq));
  res.end(JSON.stringify(data));
}

async function denyJson(res, statusCode, errorMessage, context = {}) {
  await appendAuditLog({
    time: new Date().toISOString(),
    ip: context.ip || "unknown",
    method: context.method || "",
    path: context.path || "",
    event: context.event || "access_denied",
    username: context.username || "",
    targetUserId: context.targetUserId || "",
    targetProductId: context.targetProductId || "",
    reason: context.reason || "",
    statusCode
  }).catch(() => {});
  sendJson(res, statusCode, { error: errorMessage });
}

function sendHtml(res, statusCode, html, req = null, extraHeaders = {}) {
  res.writeHead(statusCode, buildSecurityHeaders(statusCode, {
    "Content-Type": "text/html; charset=UTF-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  }, req));
  res.end(html);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getPublicRequestOrigin(req) {
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (req?.socket?.encrypted ? "https" : "http");
  const forwardedHost = String(req?.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(req?.headers?.host || "").trim();

  if (host) {
    return `${protocol}://${host}`;
  }

  const configuredDomain = String(process.env.WINGA_DOMAIN || "").trim();
  if (configuredDomain) {
    return `https://${configuredDomain.replace(/^https?:\/\//i, "")}`;
  }

  return `${protocol}://localhost:${PORT}`;
}

function getProductShareAssetOrigin(req) {
  const configuredBaseUrl = String(
    process.env.WINGA_SHARE_API_BASE_URL
    || process.env.WINGA_PRODUCTION_API_BASE_URL
    || process.env.RENDER_EXTERNAL_URL
    || ""
  ).trim();

  if (configuredBaseUrl) {
    try {
      const parsed = new URL(configuredBaseUrl);
      if (parsed.pathname.endsWith("/api")) {
        parsed.pathname = parsed.pathname.replace(/\/api\/?$/, "/");
      } else if (!parsed.pathname || parsed.pathname === "/") {
        parsed.pathname = "/";
      }
      return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "")}`.replace(/\/+$/, "");
    } catch (error) {
      // Fall through to the defaults below.
    }
  }

  const requestOrigin = getPublicRequestOrigin(req);
  if (/onrender\.com$/i.test(requestOrigin)) {
    return requestOrigin.replace(/\/+$/, "");
  }

  return "https://winga-pflp.onrender.com";
}

function isCrawlerRequest(req) {
  const userAgent = String(req?.headers?.["user-agent"] || "").toLowerCase();
  return /(facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|whatsapp|googlebot|bingbot|discordbot|skypeuripreview|applebot)/i.test(userAgent);
}

function getProductShareImageUrl(product, publicOrigin, assetOrigin) {
  const candidates = [
    ...(Array.isArray(product?.images) ? product.images : []),
    product?.image || ""
  ].filter(Boolean);

  for (const candidate of candidates) {
    const delivered = resolveProductImageForDelivery(candidate, "");
    if (!delivered) {
      continue;
    }
    if (/^https?:\/\//i.test(delivered)) {
      return delivered;
    }
    if (delivered.startsWith("/uploads/")) {
      return `${assetOrigin.replace(/\/+$/, "")}${delivered}`;
    }
    if (delivered.startsWith("/")) {
      return `${publicOrigin.replace(/\/+$/, "")}${delivered}`;
    }
  }

  return `${publicOrigin}/share-og.svg`;
}

function getProductShareImageVersion(product) {
  const candidate = String(product?.updatedAt || product?.createdAt || "").trim();
  if (!candidate) {
    return "";
  }
  return candidate.replace(/[^0-9A-Za-z]/g, "");
}

function appendImageVersion(url, version) {
  const safeUrl = String(url || "").trim();
  const safeVersion = String(version || "").trim();
  if (!safeUrl || !safeVersion) {
    return safeUrl;
  }
  return `${safeUrl}${safeUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(safeVersion)}`;
}

function getOgImageMimeType(imageUrl) {
  const safeUrl = String(imageUrl || "").trim().toLowerCase();
  if (!safeUrl) {
    return "";
  }
  if (safeUrl.includes(".png")) {
    return "image/png";
  }
  if (safeUrl.includes(".webp")) {
    return "image/webp";
  }
  if (safeUrl.includes(".gif")) {
    return "image/gif";
  }
  if (safeUrl.includes(".svg")) {
    return "image/svg+xml";
  }
  if (safeUrl.includes(".jpg") || safeUrl.includes(".jpeg")) {
    return "image/jpeg";
  }
  return "";
}

function getOgImageDimensions(imageUrl) {
  const safeUrl = String(imageUrl || "").trim().toLowerCase();
  if (!safeUrl) {
    return { width: "", height: "" };
  }
  if (safeUrl.includes("/share-og.svg") || safeUrl.includes(".svg")) {
    return { width: "1200", height: "630" };
  }
  return { width: "1200", height: "1200" };
}

function getProductShareTitle(product) {
  const name = sanitizePlainText(product?.name || "", 120);
  return name || "Winga product";
}

function getProductShareDescription(product) {
  const caption = sanitizePlainText(product?.description || product?.caption || "", 180);
  if (caption) {
    return caption;
  }

  const parts = [];
  const category = sanitizePlainText(product?.category || "", 60);
  const price = normalizeOptionalPrice(product?.price);

  if (category) parts.push(category);
  if (price != null) parts.push(`Bei TSh ${new Intl.NumberFormat("en-US").format(price)}`);

  if (parts.length) {
    return parts.join(" · ");
  }

  return "Tazama bidhaa hii kwenye Winga.";
}

function buildProductShareHtml({ title, description, canonicalUrl, imageUrl }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeCanonicalUrl = escapeHtml(canonicalUrl);
  const safeImageUrl = escapeHtml(imageUrl || `${new URL(canonicalUrl).origin}/share-og.svg`);
  const ogImageType = getOgImageMimeType(imageUrl || "");
  const ogImageDimensions = getOgImageDimensions(imageUrl || "");
  const ogImageTags = `
  <meta property="og:image" content="${safeImageUrl}">
  <meta property="og:image:secure_url" content="${safeImageUrl}">
  ${ogImageType ? `<meta property="og:image:type" content="${escapeHtml(ogImageType)}">` : ""}
  ${ogImageDimensions.width ? `<meta property="og:image:width" content="${ogImageDimensions.width}">` : ""}
  ${ogImageDimensions.height ? `<meta property="og:image:height" content="${ogImageDimensions.height}">` : ""}
  <meta property="og:image:alt" content="${safeTitle}">
  <meta name="twitter:image" content="${safeImageUrl}">
  <meta name="twitter:image:alt" content="${safeTitle}">`;

  const metaBlock = `
  <meta name="description" content="${safeDescription}">
  <link rel="canonical" href="${safeCanonicalUrl}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${safeCanonicalUrl}">${ogImageTags}
  <meta property="og:site_name" content="Winga">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">`;

  const baseHtml = String(APP_HTML_TEMPLATE || "")
    .replace(/<meta\s+(?:name="description"|property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "")
    || `<!DOCTYPE html>
<html lang="sw">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="winga-build" content="">
  <title>${safeTitle}</title>
</head>
<body>
  <div id="app-container"></div>
</body>
</html>`;

  const titlePatched = baseHtml.replace(/<title>[^<]*<\/title>/i, `<title>${safeTitle}</title>`);
  if (titlePatched.includes('name="winga-build"')) {
    return titlePatched.replace(/(<meta name="winga-build" content="[^"]*">)/i, `$1${metaBlock}`);
  }
  return titlePatched.replace(/(<meta name="viewport" content="width=device-width, initial-scale=1.0">)/i, `$1${metaBlock}`);
}

function getAllowedOrigins() {
  if (CONFIGURED_ALLOWED_ORIGINS.length) {
    return CONFIGURED_ALLOWED_ORIGINS;
  }

  if (NODE_ENV !== "production") {
    return [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4173",
      "http://127.0.0.1:4173",
      "http://localhost:5500",
      "http://127.0.0.1:5500"
    ];
  }

  return [];
}

function getCorsOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) {
    return "";
  }
  return getAllowedOrigins().includes(origin) ? origin : "";
}

function isUnsafeApiMethod(method = "GET") {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "GET").toUpperCase());
}

function validateUnsafeApiOrigin(req, pathname = "") {
  if (!String(pathname || "").startsWith("/api/") || !isUnsafeApiMethod(req.method) || isServerToServerWebhookPath(pathname)) {
    return { ok: true };
  }
  const origin = String(req.headers.origin || "").trim();
  if (!origin) {
    return { ok: true };
  }
  if (getAllowedOrigins().includes(origin)) {
    return { ok: true };
  }
  return {
    ok: false,
    origin
  };
}

function getCspHeader(req) {
  const allowedOrigins = Array.from(new Set(["'self'", ...getAllowedOrigins()]));
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https://wingamarket.com",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "script-src 'self'",
    "script-src-elem 'self'",
    "script-src-attr 'none'",
    "style-src 'self'",
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    `connect-src ${allowedOrigins.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "upgrade-insecure-requests"
  ].join("; ");
}

function buildSecurityHeaders(statusCode, extraHeaders = {}, req = null) {
  const corsOrigin = req ? getCorsOrigin(req) : "";
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Content-Security-Policy": getCspHeader(req),
    ...extraHeaders
  };

  if (corsOrigin) {
    headers["Access-Control-Allow-Origin"] = corsOrigin;
    headers["Vary"] = "Origin";
    headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-CSRF-Token, X-Winga-CSRF-Token";
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  if (statusCode >= 400 && !headers["Cache-Control"]) {
    headers["Cache-Control"] = "no-store";
  }

  return headers;
}

function buildPublicImageHeaders(filePath, contentType, req, cacheControl = "public, max-age=3600") {
  const stats = fs.statSync(filePath);
  return buildSecurityHeaders(200, {
    "Content-Type": contentType,
    "Content-Length": String(stats.size),
    "Cache-Control": cacheControl,
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Access-Control-Allow-Origin": "*",
    "Timing-Allow-Origin": "*",
    "Content-Disposition": `inline; filename="${path.basename(filePath).replace(/"/g, "")}"`,
    "Last-Modified": stats.mtime.toUTCString()
  }, req);
}

function normalizeSharedPhoneViewerIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(
    value
      .map((item) => normalizeIdentifier(item, 40))
      .filter(Boolean)
  )).slice(0, 60);
}

function getSharedPhoneViewerIds(user) {
  return normalizeSharedPhoneViewerIds(user?.sharedPhoneViewerIds);
}

function hasBuyerSellerRelationship(store, buyerUsername, sellerUsername) {
  const safeBuyerUsername = normalizeIdentifier(buyerUsername, 40);
  const safeSellerUsername = normalizeIdentifier(sellerUsername, 40);
  if (!safeBuyerUsername || !safeSellerUsername) {
    return false;
  }

  const hasOrderRelationship = (store.orders || []).some((order) => {
    const normalizedOrder = normalizeOrderRecord(order);
    return normalizedOrder.buyerUsername === safeBuyerUsername
      && normalizedOrder.sellerUsername === safeSellerUsername;
  });
  if (hasOrderRelationship) {
    return true;
  }

  return (store.messages || []).some((message) => {
    const normalizedMessage = normalizeMessageRecord(message);
    const participants = new Set([normalizedMessage.senderId, normalizedMessage.receiverId].filter(Boolean));
    return participants.has(safeBuyerUsername) && participants.has(safeSellerUsername);
  });
}

function canViewerSeeUserPhone(user, viewer = null) {
  if (!user) {
    return false;
  }
  if (!viewer) {
    return false;
  }
  if (isStaffRole(viewer.role) || viewer.username === user.username) {
    return true;
  }
  if (user.role !== "buyer" || viewer.role !== "seller") {
    return false;
  }
  return getSharedPhoneViewerIds(user).includes(viewer.username);
}

function shouldExposeBuyerRecordToSeller(user, viewer, store) {
  return Boolean(
    user
    && viewer
    && user.role === "buyer"
    && viewer.role === "seller"
    && !isRestrictedUserStatus(user.status)
    && hasBuyerSellerRelationship(store, user.username, viewer.username)
  );
}

function roundTrustScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function getTrustTierFromScore(score) {
  if (score >= 85) {
    return "Trusted";
  }
  if (score >= 70) {
    return "Strong";
  }
  if (score >= 55) {
    return "Growing";
  }
  return "New";
}

function buildSellerPublicStats(store, username = "") {
  const safeUsername = normalizeIdentifier(username, 40);
  if (!safeUsername) {
    return null;
  }

  const products = (store.products || []).map(normalizeProductRecord);
  const reviews = (store.reviews || []).map(normalizeReviewRecord);
  const orders = (store.orders || []).map(normalizeOrderRecord);
  const reports = (store.reports || []).map(normalizeReportRecord);
  const users = (store.users || []).map(normalizeUserRecord);

  const sellerProducts = products.filter((product) => product.uploadedBy === safeUsername);
  const approvedProducts = sellerProducts.filter((product) => product.status === "approved");
  const sellerProductIds = new Set(sellerProducts.map((product) => product.id));
  const sellerOrders = orders.filter((order) => order.sellerUsername === safeUsername);
  const completedOrders = sellerOrders.filter((order) => order.status === "delivered");
  const repeatBuyers = Object.values(
    sellerOrders.reduce((accumulator, order) => {
      if (!order.buyerUsername) {
        return accumulator;
      }
      accumulator[order.buyerUsername] = (accumulator[order.buyerUsername] || 0) + 1;
      return accumulator;
    }, {})
  ).filter((count) => count > 1).length;
  const sellerReviews = reviews.filter((review) => normalizeIdentifier(review.sellerId, 40) === safeUsername);
  const averageRating = sellerReviews.length
    ? sellerReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / sellerReviews.length
    : 0;
  const openReports = reports.filter((report) =>
    report.status === "open"
    && (
      normalizeIdentifier(report.targetUserId, 40) === safeUsername
      || sellerProductIds.has(sanitizePlainText(report.targetProductId, 80))
    )
  ).length;
  const sellerRecord = users.find((user) => user.username === safeUsername) || null;

  let trustScore = 25;
  if (sellerRecord?.verifiedSeller) {
    trustScore += 22;
  }
  trustScore += Math.min(18, approvedProducts.length * 3);
  trustScore += Math.min(14, completedOrders.length * 2);
  trustScore += Math.min(16, Math.round(averageRating * 3));
  trustScore += Math.min(10, sellerReviews.length * 2);
  trustScore -= Math.min(18, openReports * 6);

  const roundedScore = roundTrustScore(trustScore);
  return {
    trustScore: roundedScore,
    trustTier: getTrustTierFromScore(roundedScore),
    approvedProducts: approvedProducts.length,
    completedOrders: completedOrders.length,
    repeatBuyers,
    averageRating: Number(averageRating.toFixed(1)),
    totalReviews: sellerReviews.length,
    openReports
  };
}

function sanitizeUser(user, options = {}) {
  const viewer = options.viewer || null;
  const store = options.store || null;
  const phoneVisible = canViewerSeeUserPhone(user, viewer);
  const phoneVisibility = viewer && viewer.username === user.username
    ? "self"
    : user.role === "buyer"
      ? (phoneVisible ? "shared" : "private")
      : "public";
  return {
    username: user.username,
    fullName: user.fullName || user.username,
    primaryCategory: user.primaryCategory || "",
    role: user.role || "seller",
    status: user.status || "active",
    whatsappNumber: phoneVisible || user.role !== "buyer"
      ? String(user.whatsappNumber || user.phoneNumber || "").replace(/\D/g, "").slice(0, 20)
      : "",
    whatsappVerificationStatus: user.whatsappVerificationStatus || "verified",
    whatsappVerifiedAt: user.whatsappVerifiedAt || "",
    verifiedSeller: Boolean(user.verifiedSeller),
    verificationStatus: user.verificationStatus || (user.verifiedSeller ? "verified" : "unverified"),
    profileImage: user.profileImage || "",
    paymentProvider: user.role === "seller" ? (user.paymentProvider || "") : "",
    paymentNumber: user.role === "seller" ? String(user.paymentNumber || "").replace(/\D/g, "").slice(0, 20) : "",
    paymentRecipientName: user.role === "seller" ? (user.paymentRecipientName || user.fullName || user.username) : "",
    paymentInstructions: user.role === "seller" ? (user.paymentInstructions || "") : "",
    createdAt: user.createdAt || "",
    phoneVisibility,
    sellerStats: user.role === "seller" && store ? buildSellerPublicStats(store, user.username) : null,
    canReceivePhoneShare: Boolean(
      viewer
      && viewer.username !== user.username
      && viewer.role === "buyer"
      && user.role === "seller"
      && !isRestrictedUserStatus(user.status)
    )
  };
}

function buildSelfSessionPayload(user) {
  return {
    ...sanitizeUser(user, { viewer: user }),
    phoneNumber: String(user.phoneNumber || "").replace(/\D/g, "").slice(0, 20),
    paymentProvider: user.paymentProvider || "",
    paymentNumber: String(user.paymentNumber || "").replace(/\D/g, "").slice(0, 20),
    paymentRecipientName: user.paymentRecipientName || user.fullName || user.username,
    paymentInstructions: user.paymentInstructions || "",
    pendingWhatsappNumber: String(user.pendingWhatsappNumber || "").replace(/\D/g, "").slice(0, 20),
    pendingWhatsappExpiresAt: user.pendingWhatsappExpiresAt || ""
  };
}

function sanitizeModeratorUser(user) {
  return {
    username: user.username,
    fullName: user.fullName || user.username,
    phoneNumber: maskSensitiveValue(user.phoneNumber || ""),
    nationalIdMasked: maskSensitiveValue(user.nationalId || ""),
    primaryCategory: user.primaryCategory || "",
    role: user.role || "seller",
    status: user.status || "active",
    verifiedSeller: Boolean(user.verifiedSeller),
    verificationStatus: user.verificationStatus || (user.verifiedSeller ? "verified" : "unverified"),
    verificationSubmittedAt: user.verificationSubmittedAt || "",
    identityDocumentType: user.identityDocumentType || "",
    hasIdentityDocument: Boolean(user.identityDocumentImage),
    moderatedAt: user.moderatedAt || "",
    moderatedBy: user.moderatedBy || "",
    moderationReason: user.moderationReason || "",
    moderationNote: user.moderationNote || ""
  };
}

function sanitizeAdminUser(user) {
  return {
    username: user.username,
    fullName: user.fullName || user.username,
    phoneNumber: user.phoneNumber || "",
    nationalIdMasked: maskSensitiveValue(user.nationalId || ""),
    primaryCategory: user.primaryCategory || "",
    role: user.role || "seller",
    status: user.status || "active",
    verifiedSeller: Boolean(user.verifiedSeller),
    verificationStatus: user.verificationStatus || (user.verifiedSeller ? "verified" : "unverified"),
    verificationSubmittedAt: user.verificationSubmittedAt || "",
    identityDocumentType: user.identityDocumentType || "",
    identityDocumentNumberMasked: maskSensitiveValue(user.identityDocumentNumber || user.nationalId || ""),
    hasIdentityDocumentImage: Boolean(user.identityDocumentImage),
    identityDocumentImage: user.identityDocumentImage || "",
    profileImage: user.profileImage || "",
    moderationReason: user.moderationReason || "",
    moderationNote: user.moderationNote || "",
    moderatedAt: user.moderatedAt || "",
    moderatedBy: user.moderatedBy || "",
    createdAt: user.createdAt || ""
  };
}

function sanitizeVisibleProduct(product, viewer = null, storeRef = null) {
  const normalizedProduct = normalizeProductRecord(product);
  const allowPlaceholder = Boolean(product?.imageFallbackEligible || normalizedProduct.imageFallbackEligible);
  const deliveredImages = (Array.isArray(normalizedProduct.images) ? normalizedProduct.images : [])
    .map((image) => resolveProductImageForDelivery(image, "", allowPlaceholder))
    .filter(Boolean);
  const deliveredPrimaryImage = resolveProductImageForDelivery(
    normalizedProduct.image || deliveredImages[0] || "",
    "",
    allowPlaceholder
  );
  const isStaffViewer = Boolean(viewer && isStaffRole(viewer.role));
  const isOwner = Boolean(viewer && normalizedProduct.uploadedBy === viewer.username);
  const canSeeModerationData = isStaffViewer || isOwner;
  const owner = storeRef ? getUserByUsername(storeRef, normalizedProduct.uploadedBy) : null;

  if (!canSeeModerationData && normalizedProduct.status !== "approved") {
    return null;
  }

  const safeProduct = {
    ...normalizedProduct,
    image: deliveredPrimaryImage || deliveredImages[0] || "",
    images: deliveredImages.length ? deliveredImages : [deliveredPrimaryImage].filter(Boolean),
    whatsapp: normalizedProduct.whatsapp || String(owner?.whatsappNumber || owner?.phoneNumber || "").replace(/\D/g, "").slice(0, 20)
  };
  if (!safeProduct.image && (!Array.isArray(safeProduct.images) || safeProduct.images.length === 0) && !canSeeModerationData) {
    return null;
  }
  if (!canSeeModerationData) {
    safeProduct.moderationNote = "";
    safeProduct.moderatedAt = "";
    safeProduct.moderatedBy = "";
    safeProduct.originalProductId = "";
    safeProduct.originalSellerId = "";
    safeProduct.resellerId = "";
    safeProduct.resalePrice = null;
    safeProduct.resoldStatus = "original";
  }
  delete safeProduct.imageArchives;
  delete safeProduct.imageFallbackEligible;
  return safeProduct;
}

function buildVisibleProducts(store, viewer = null) {
  return (store.products || [])
    .map((product) => sanitizeVisibleProduct(product, viewer, store))
    .filter(Boolean)
    .sort((first, second) => {
      const parsedSecondTime = new Date(second?.createdAt || second?.updatedAt || 0).getTime();
      const parsedFirstTime = new Date(first?.createdAt || first?.updatedAt || 0).getTime();
      const secondTime = Number.isFinite(parsedSecondTime) ? parsedSecondTime : 0;
      const firstTime = Number.isFinite(parsedFirstTime) ? parsedFirstTime : 0;
      if (secondTime !== firstTime) {
        return secondTime - firstTime;
      }
      return String(second?.id || "").localeCompare(String(first?.id || ""));
    });
}

function toProductListItem(product) {
  if (!product || typeof product !== "object") {
    return null;
  }
  return {
    id: product.id || "",
    name: product.name || "",
    price: Number(product.price || 0),
    image: product.image || "",
    images: Array.isArray(product.images) ? product.images : [],
    shop: product.shop || "",
    category: product.category || "",
    uploadedBy: product.uploadedBy || "",
    verifiedSeller: Boolean(product.verifiedSeller),
    status: product.status || "approved",
    availability: product.availability || "available",
    fitMode: product.fitMode || "cover",
    createdAt: product.createdAt || "",
    whatsapp: product.whatsapp || "",
    imageCount: Array.isArray(product.images) ? product.images.length : 0
  };
}

function paginateProducts(products, options = {}) {
  const source = Array.isArray(products) ? products : [];
  const requestedOffset = Number.parseInt(options.offset, 10);
  const requestedLimit = Number.parseInt(options.limit, 10);
  const offset = Number.isFinite(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
  const maxLimit = Number.isFinite(options.maxLimit) && options.maxLimit > 0 ? options.maxLimit : MAX_API_PRODUCT_LIMIT;
  const fallbackLimit = Number.isFinite(options.fallbackLimit) && options.fallbackLimit > 0 ? options.fallbackLimit : maxLimit;
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, maxLimit)
    : Math.min(fallbackLimit, maxLimit);
  const items = source.slice(offset, offset + limit);
  const lastItem = items[items.length - 1] || null;
  return {
    items,
    offset,
    limit,
    total: source.length,
    hasMore: offset + items.length < source.length,
    nextCursor: offset + items.length < source.length && lastItem?.createdAt && lastItem?.id
      ? `${lastItem.createdAt}|${lastItem.id}`
      : ""
  };
}

function buildVisibleUsers(store, viewer = null) {
  const isStaffViewer = Boolean(viewer && isStaffRole(viewer.role));
  return (store.users || [])
    .filter((user) => {
      if (isStaffViewer) {
        return true;
      }
      if (viewer && user.username === viewer.username) {
        return true;
      }
      if (user.role === "seller" && !isRestrictedUserStatus(user.status)) {
        return true;
      }
      return shouldExposeBuyerRecordToSeller(user, viewer, store);
    })
    .map((user) => sanitizeUser(user, { viewer, store }));
}

function clearPendingWhatsappState(user, overrides = {}) {
  return {
    ...user,
    pendingWhatsappNumber: "",
    pendingWhatsappCodeHash: "",
    pendingWhatsappRequestedAt: "",
    pendingWhatsappExpiresAt: "",
    ...overrides
  };
}

function applySellerWhatsappToProducts(store, username, whatsappNumber) {
  const normalizedWhatsapp = String(whatsappNumber || "").replace(/\D/g, "").slice(0, 20);
  return (store.products || []).map((product) =>
    product.uploadedBy === username
      ? {
          ...product,
          whatsapp: normalizedWhatsapp,
          updatedAt: new Date().toISOString()
        }
      : product
  );
}

function readWebhookSecret(req) {
  const directSecret = String(req.headers["x-winga-webhook-secret"] || "").trim();
  if (directSecret) {
    return directSecret;
  }
  return String(req.headers["x-webhook-secret"] || "").trim();
}

function createSession(user) {
  return {
    token: crypto.randomBytes(32).toString("hex"),
    username: user.username,
    fullName: user.fullName || user.username,
    primaryCategory: user.primaryCategory || "",
    role: user.role || "seller",
    status: user.status || "active",
    whatsappNumber: String(user.whatsappNumber || user.phoneNumber || "").replace(/\D/g, "").slice(0, 20),
    paymentProvider: user.paymentProvider || "",
    paymentNumber: String(user.paymentNumber || "").replace(/\D/g, "").slice(0, 20),
    paymentRecipientName: user.paymentRecipientName || user.fullName || user.username,
    paymentInstructions: user.paymentInstructions || "",
    whatsappVerificationStatus: user.whatsappVerificationStatus || "verified",
    profileImage: user.profileImage || "",
    verificationStatus: user.verificationStatus || (user.verifiedSeller ? "verified" : "unverified"),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
}

function maskSensitiveValue(value) {
  const source = String(value || "");
  if (!source) return "";
  if (source.length <= 4) return "*".repeat(source.length);
  return `${"*".repeat(Math.max(0, source.length - 4))}${source.slice(-4)}`;
}

function isValidRole(role) {
  return ALLOWED_ROLES.includes(role);
}

function isValidUserStatus(status) {
  return ALLOWED_USER_STATUSES.includes(status);
}

function isValidProductStatus(status) {
  return ALLOWED_PRODUCT_STATUSES.includes(status);
}

function isValidOrderStatus(status) {
  return ALLOWED_ORDER_STATUSES.includes(status);
}

function isValidPaymentStatus(status) {
  return ALLOWED_PAYMENT_STATUSES.includes(status);
}

function normalizeUserRecord(user) {
  const adminIdentity = getAdminSeedIdentity();
  const username = normalizeIdentifier(user.username, 40);
  const fullName = username === adminIdentity.username
    ? sanitizePlainText(user.fullName || user.displayName || adminIdentity.fullName || user.username, 120)
    : sanitizePlainText(user.fullName || user.displayName || user.username, 120);
  const phoneNumber = String(user.phoneNumber || "").replace(/\D/g, "").slice(0, 20);
  const whatsappNumber = String(user.whatsappNumber || phoneNumber || "").replace(/\D/g, "").slice(0, 20);
  const paymentNumber = String(user.paymentNumber || "").replace(/\D/g, "").slice(0, 20);
  const paymentProvider = sanitizePlainText(user.paymentProvider || "", 40).toLowerCase();
  const paymentRecipientName = sanitizePlainText(user.paymentRecipientName || user.fullName || user.username, 120);
  const paymentInstructions = sanitizePlainText(user.paymentInstructions || "", 240);
  return {
    ...user,
    username,
    fullName,
    phoneNumber,
    whatsappNumber,
    paymentProvider,
    paymentNumber,
    paymentRecipientName,
    paymentInstructions,
    whatsappVerificationStatus: user.whatsappVerificationStatus === "pending" ? "pending" : "verified",
    whatsappVerifiedAt: user.whatsappVerifiedAt || (whatsappNumber ? (user.createdAt || new Date().toISOString()) : ""),
    pendingWhatsappNumber: String(user.pendingWhatsappNumber || "").replace(/\D/g, "").slice(0, 20),
    pendingWhatsappCodeHash: sanitizePlainText(user.pendingWhatsappCodeHash, 160),
    pendingWhatsappRequestedAt: user.pendingWhatsappRequestedAt || "",
    pendingWhatsappExpiresAt: user.pendingWhatsappExpiresAt || "",
    nationalId: sanitizePlainText(user.nationalId, 40).toUpperCase(),
    identityDocumentNumber: sanitizePlainText(user.identityDocumentNumber || user.nationalId, 40).toUpperCase(),
    primaryCategory: sanitizePlainText(user.primaryCategory, 60).toLowerCase(),
    role: isValidRole(user.role) ? user.role : (username === adminIdentity.username ? "admin" : "seller"),
    status: isValidUserStatus(user.status) ? user.status : "active",
    moderationReason: sanitizePlainText(user.moderationReason, 120),
    moderationNote: sanitizePlainText(user.moderationNote, 300),
    sharedPhoneViewerIds: normalizeSharedPhoneViewerIds(user.sharedPhoneViewerIds),
    verifiedSeller: Boolean(user.verifiedSeller),
    profileImage: isValidPrivateImageValue(user.profileImage || "") ? user.profileImage : "",
    identityDocumentType: ALLOWED_IDENTITY_DOCUMENT_TYPES.includes(user.identityDocumentType) ? user.identityDocumentType : "",
    identityDocumentImage: isValidPrivateImageValue(user.identityDocumentImage || "") ? user.identityDocumentImage : "",
    verificationStatus: ALLOWED_VERIFICATION_STATUSES.includes(user.verificationStatus)
      ? user.verificationStatus
      : (Boolean(user.verifiedSeller) ? "verified" : "unverified"),
    verificationSubmittedAt: user.verificationSubmittedAt || (Boolean(user.verifiedSeller) ? (user.createdAt || new Date().toISOString()) : ""),
    moderatedAt: user.moderatedAt || "",
    moderatedBy: normalizeIdentifier(user.moderatedBy, 40),
    updatedAt: user.updatedAt || user.createdAt || new Date().toISOString(),
    createdAt: user.createdAt || new Date().toISOString()
  };
}

function normalizeProductRecord(product) {
  const now = new Date().toISOString();
  const hasLegacyModerationFields = Object.prototype.hasOwnProperty.call(product, "status")
    || Object.prototype.hasOwnProperty.call(product, "moderationNote")
    || Object.prototype.hasOwnProperty.call(product, "moderatedAt")
    || Object.prototype.hasOwnProperty.call(product, "moderatedBy");
  const inferredStatus = "approved";
  const originalProductId = sanitizePlainText(product.originalProductId, 80);
  const originalSellerId = normalizeIdentifier(product.originalSellerId, 40);
  const resellerId = normalizeIdentifier(product.resellerId, 40);
  const normalizedResalePrice = normalizeOptionalPrice(product.resalePrice);
  const derivedResoldStatus = product.resoldStatus === "reposted" || originalProductId || originalSellerId || resellerId
    ? "reposted"
    : "original";
  const fitMode = String(product.fitMode || "").trim().toLowerCase() === "contain" ? "contain" : "cover";
  return {
    ...product,
    name: sanitizePlainText(product.name, 120),
    price: normalizeOptionalPrice(product.price),
    shop: sanitizePlainText(product.shop, 120),
    whatsapp: String(product.whatsapp || "").replace(/\D/g, "").slice(0, 20),
    uploadedBy: normalizeIdentifier(product.uploadedBy, 40),
    category: sanitizePlainText(product.category, 60).toLowerCase(),
    status: isValidProductStatus(product.status) ? product.status : (hasLegacyModerationFields ? inferredStatus : "approved"),
    availability: product.availability === "sold_out"
      ? "sold_out"
      : product.availability === "reserved"
        ? "reserved"
        : "available",
    moderationNote: sanitizePlainText(product.moderationNote, 240),
    moderatedAt: product.moderatedAt || "",
    moderatedBy: normalizeIdentifier(product.moderatedBy, 40),
    originalProductId,
    originalSellerId,
    resellerId,
    resalePrice: derivedResoldStatus === "reposted" ? (normalizedResalePrice ?? normalizeOptionalPrice(product.price)) : null,
    resoldStatus: derivedResoldStatus,
    fitMode,
    createdAt: product.createdAt || now,
    updatedAt: product.updatedAt || now
  };
}

function normalizeOrderRecord(order) {
  const normalizedStatus = isValidOrderStatus(order.status) ? order.status : "placed";
  const normalizedPaymentStatus = isValidPaymentStatus(order.paymentStatus)
    ? order.paymentStatus
    : ((normalizedStatus === "paid" || normalizedStatus === "confirmed" || normalizedStatus === "delivered") ? "paid" : "pending");
  const createdAt = order.createdAt || new Date().toISOString();
  const reserveExpiresAt = order.reserveExpiresAt
    || (normalizedStatus === "placed" && normalizedPaymentStatus === "pending"
      ? new Date(new Date(createdAt).getTime() + (24 * 60 * 60 * 1000)).toISOString()
      : "");
  const paymentIntentStatus = ["submitted", "verified", "cancelled"].includes(String(order.paymentIntentStatus || "").toLowerCase())
    ? String(order.paymentIntentStatus || "").toLowerCase()
    : (normalizedStatus === "cancelled" || normalizedPaymentStatus === "failed" || normalizedPaymentStatus === "cancelled"
      ? "cancelled"
      : normalizedPaymentStatus === "paid"
        ? "verified"
        : "submitted");
  return {
    ...order,
    productName: sanitizePlainText(order.productName, 120),
    productImage: order.productImage || "",
    shop: sanitizePlainText(order.shop, 120),
    sellerUsername: normalizeIdentifier(order.sellerUsername, 40),
    buyerUsername: normalizeIdentifier(order.buyerUsername, 40),
    status: normalizedStatus,
    paymentStatus: normalizedPaymentStatus,
    paymentMethod: sanitizePlainText(order.paymentMethod || "mobile_money", 40).toLowerCase() || "mobile_money",
    paymentPhoneNumber: String(order.paymentPhoneNumber || "").replace(/\D/g, "").slice(0, 20),
    paymentProvider: sanitizePlainText(order.paymentProvider || "", 40).toLowerCase(),
    paymentRecipientName: sanitizePlainText(order.paymentRecipientName || order.sellerUsername || "", 120),
    paymentInstructions: sanitizePlainText(order.paymentInstructions || "", 240),
    transactionId: sanitizePlainText(order.transactionId, 80).toUpperCase(),
    paymentSubmittedAt: order.paymentSubmittedAt || order.createdAt || new Date().toISOString(),
    paymentConfirmedAt: order.paymentConfirmedAt || "",
    paymentConfirmedBy: normalizeIdentifier(order.paymentConfirmedBy, 40),
    paymentIntentStatus,
    reserveExpiresAt,
    createdAt
  };
}

function deriveProductAvailabilityFromOrders(orders, productId) {
  const productOrders = (Array.isArray(orders) ? orders : [])
    .map(normalizeOrderRecord)
    .filter((order) => order.productId === productId);

  if (productOrders.some((order) => order.status === "delivered")) {
    return "sold_out";
  }
  if (productOrders.some((order) => ["placed", "paid", "confirmed"].includes(order.status))) {
    return "reserved";
  }
  return "available";
}

function normalizePaymentRecord(payment) {
  const now = new Date().toISOString();
  return {
    id: sanitizePlainText(payment.id, 80) || `payment-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    orderId: sanitizePlainText(payment.orderId, 80),
    buyerUsername: normalizeIdentifier(payment.buyerUsername, 40),
    amountPaid: Number(payment.amountPaid || 0),
    paymentMethod: sanitizePlainText(payment.paymentMethod || "mobile_money", 40).toLowerCase() || "mobile_money",
    paymentProvider: sanitizePlainText(payment.paymentProvider || "", 40).toLowerCase(),
    paymentNumber: String(payment.paymentNumber || "").replace(/\D/g, "").slice(0, 20),
    paymentRecipientName: sanitizePlainText(payment.paymentRecipientName || "", 120),
    paymentInstructions: sanitizePlainText(payment.paymentInstructions || "", 240),
    transactionReference: sanitizePlainText(payment.transactionReference || payment.receiptNumber || "", 80).toUpperCase(),
    receiptNumber: sanitizePlainText(payment.receiptNumber || payment.transactionReference || "", 80).toUpperCase(),
    paymentStatus: isValidPaymentStatus(payment.paymentStatus) ? payment.paymentStatus : "pending",
    payerDetails: {
      name: sanitizePlainText(payment?.payerDetails?.name || "", 120),
      phoneNumber: String(payment?.payerDetails?.phoneNumber || "").replace(/\D/g, "").slice(0, 20)
    },
    rawGatewayResponse: payment?.rawGatewayResponse && typeof payment.rawGatewayResponse === "object"
      ? payment.rawGatewayResponse
      : null,
    createdAt: payment.createdAt || now,
    updatedAt: payment.updatedAt || payment.createdAt || now
  };
}

function normalizeMessageRecord(message) {
  const now = new Date().toISOString();
  const senderId = normalizeIdentifier(message.senderId || message.senderUsername, 40);
  const receiverId = normalizeIdentifier(message.receiverId || message.receiverUsername, 40);
  const productId = sanitizePlainText(message.productId, 80);
  const conversationId = sanitizePlainText(message.conversationId, 160)
    || buildConversationId(senderId, receiverId, productId);
  const productItems = Array.isArray(message.productItems)
    ? message.productItems
        .map((item) => ({
          productId: sanitizePlainText(item?.productId, 80),
          productName: sanitizePlainText(item?.productName, 120),
          productImage: sanitizePlainText(item?.productImage, MAX_DATA_URL_LENGTH),
          price: normalizeOptionalPrice(item?.price),
          sellerId: normalizeIdentifier(item?.sellerId, 40),
          category: sanitizePlainText(item?.category, 80)
        }))
        .filter((item) => item.productId && item.productName)
        .slice(0, 10)
    : [];
  const messageType = ["text", "product_reference", "product_inquiry", "contact_share"].includes(message.messageType)
    ? message.messageType
    : (productItems.length > 1 ? "product_inquiry" : productItems.length === 1 ? "product_reference" : "text");
  return {
    id: sanitizePlainText(message.id, 80) || `msg-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    senderId,
    receiverId,
    conversationId,
    message: sanitizePlainText(message.message, 1000),
    messageType,
    productId,
    productName: sanitizePlainText(message.productName, 120),
    productItems,
    replyToMessageId: sanitizePlainText(message.replyToMessageId, 80),
    timestamp: message.timestamp || message.createdAt || now,
    createdAt: message.createdAt || message.timestamp || now,
    updatedAt: message.updatedAt || message.createdAt || message.timestamp || now,
    deliveredAt: message.deliveredAt || message.createdAt || message.timestamp || now,
    readAt: message.readAt || "",
    isDelivered: typeof message.isDelivered === "boolean" ? message.isDelivered : true,
    isRead: typeof message.isRead === "boolean" ? message.isRead : Boolean(message.readAt)
  };
}

function normalizeNotificationRecord(notification) {
  const now = new Date().toISOString();
  const type = ALLOWED_NOTIFICATION_TYPES.includes(notification.type) ? notification.type : "message";
  const variant = ["success", "warning", "error", "info"].includes(notification.variant)
    ? notification.variant
    : (type === "order" || type === "request" ? "success" : "info");
  return {
    id: sanitizePlainText(notification.id, 80) || `note-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    userId: normalizeIdentifier(notification.userId || notification.username, 40),
    type,
    variant,
    messageId: sanitizePlainText(notification.messageId, 80),
    conversationId: sanitizePlainText(notification.conversationId, 160),
    title: sanitizePlainText(notification.title, 120),
    body: sanitizePlainText(notification.body, 240),
    readAt: notification.readAt || "",
    isRead: typeof notification.isRead === "boolean" ? notification.isRead : Boolean(notification.readAt),
    createdAt: notification.createdAt || now
  };
}

function buildOrderNotification({ recipientId, actorUsername, order, stage }) {
  const safeRecipientId = normalizeIdentifier(recipientId, 40);
  const safeActor = normalizeIdentifier(actorUsername, 40);
  const safeOrder = normalizeOrderRecord(order || {});
  const productLabel = sanitizePlainText(safeOrder.productName || "your product", 80);

  let title = "Order update";
  let body = `${productLabel} has a new update.`;

  if (stage === "created") {
    title = `${safeActor || "Mnunuzi"} ameweka order`;
    body = `Kuna order mpya ya ${productLabel}. Fungua order uone maelezo ya mnunuzi.`;
  } else if (stage === "paid") {
    title = `Malipo ya ${productLabel} yamethibitishwa`;
    body = `${safeActor || "Muuzaji"} amehakiki payment proof. Order iko tayari kwa uthibitisho wa muuzaji na maandalizi ya kuendelea.`;
  } else if (stage === "payment_rejected") {
    title = `Payment proof ya ${productLabel} imekataliwa`;
    body = `${safeActor || "Muuzaji"} hakuweza kuthibitisha malipo ya order hii. Fungua chat au jaribu tena ukiwa na reference sahihi.`;
  } else if (stage === "confirmed") {
    title = `Muuzaji amethibitisha ${productLabel}`;
    body = "Kuna update mpya kwenye order yako. Angalia status ya delivery au maelekezo ya muuzaji.";
  } else if (stage === "delivered") {
    title = `Order ya ${productLabel} imekamilika`;
    body = `${safeActor || "Mnunuzi"} amethibitisha kupokea bidhaa hii.`;
  } else if (stage === "cancelled") {
    title = `Order ya ${productLabel} imefutwa`;
    body = `${safeActor || "Mnunuzi"} ameghairi order hii.`;
  }

  return normalizeNotificationRecord({
    userId: safeRecipientId,
    type: "order",
    conversationId: safeOrder.id,
    title,
    body,
    variant: stage === "cancelled" || stage === "payment_rejected" ? "warning" : "success",
    isRead: false,
    createdAt: new Date().toISOString()
  });
}

function normalizePromotionRecord(promotion) {
  const now = new Date().toISOString();
  const type = ALLOWED_PROMOTION_TYPES.includes(promotion.type) ? promotion.type : "starter_day";
  const config = PROMOTION_CONFIG[type] || PROMOTION_CONFIG.starter_day;
  return {
    id: sanitizePlainText(promotion.id, 80) || `promo-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    productId: sanitizePlainText(promotion.productId, 80),
    sellerUsername: normalizeIdentifier(promotion.sellerUsername, 40),
    type,
    status: ALLOWED_PROMOTION_STATUSES.includes(promotion.status) ? promotion.status : "pending",
    amountPaid: Number(promotion.amountPaid || config.amount || 0),
    paymentMethod: sanitizePlainText(promotion.paymentMethod || "mobile_money", 40).toLowerCase() || "mobile_money",
    transactionReference: sanitizePlainText(promotion.transactionReference, 80).toUpperCase(),
    paymentStatus: isValidPaymentStatus(promotion.paymentStatus) ? promotion.paymentStatus : "pending",
    startDate: promotion.startDate || now,
    endDate: promotion.endDate || new Date(Date.now() + (config.durationDays * 24 * 60 * 60 * 1000)).toISOString(),
    createdAt: promotion.createdAt || now,
    updatedAt: promotion.updatedAt || promotion.createdAt || now,
    approvedAt: promotion.approvedAt || "",
    baselineViews: Math.max(0, Number(promotion.baselineViews || 0)),
    baselineLikes: Math.max(0, Number(promotion.baselineLikes || 0)),
    disabledAt: promotion.disabledAt || "",
    disabledBy: normalizeIdentifier(promotion.disabledBy, 40)
  };
}

function normalizeReviewRecord(review) {
  const now = new Date().toISOString();
  return {
    id: sanitizePlainText(review.id, 80) || `review-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    userId: normalizeIdentifier(review.userId || review.username, 40),
    productId: sanitizePlainText(review.productId, 80),
    sellerId: normalizeIdentifier(review.sellerId || review.uploadedBy, 40),
    rating: Math.max(1, Math.min(5, Number(review.rating || 0))),
    comment: sanitizePlainText(review.comment, 500),
    verifiedBuyer: Boolean(review.verifiedBuyer),
    date: review.date || review.createdAt || now
  };
}

function normalizeReportRecord(report) {
  const now = new Date().toISOString();
  return {
    id: sanitizePlainText(report.id, 80) || `report-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    targetType: ALLOWED_REPORT_TARGETS.includes(report.targetType) ? report.targetType : "product",
    targetUserId: normalizeIdentifier(report.targetUserId, 40),
    targetProductId: sanitizePlainText(report.targetProductId, 80),
    reporterUserId: normalizeIdentifier(report.reporterUserId, 40),
    reason: sanitizePlainText(report.reason, 120),
    description: sanitizePlainText(report.description, 500),
    status: ALLOWED_REPORT_STATUSES.includes(report.status) ? report.status : "open",
    reviewNote: sanitizePlainText(report.reviewNote, 300),
    reviewedBy: normalizeIdentifier(report.reviewedBy, 40),
    createdAt: report.createdAt || now,
    updatedAt: report.updatedAt || report.createdAt || now
  };
}

function normalizeModerationActionRecord(action) {
  return {
    id: sanitizePlainText(action.id, 80) || `mod-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    adminUsername: normalizeIdentifier(action.adminUsername, 40),
    actionType: sanitizePlainText(action.actionType, 80),
    targetUserId: normalizeIdentifier(action.targetUserId, 40),
    targetProductId: sanitizePlainText(action.targetProductId, 80),
    reason: sanitizePlainText(action.reason, 120),
    note: sanitizePlainText(action.note, 300),
    createdAt: action.createdAt || new Date().toISOString()
  };
}

function isAdminSession(session) {
  return session?.role === "admin" && !isRestrictedUserStatus(session?.status);
}

function isStaffRole(role) {
  return role === "admin" || role === "moderator";
}

function canModerateSession(session) {
  return (session?.role === "admin" || session?.role === "moderator")
    && !isRestrictedUserStatus(session?.status);
}

function isRestrictedUserStatus(status) {
  return status === "suspended" || status === "banned" || status === "deactivated";
}

function getUserRestrictionMessage(status) {
  if (status === "banned") return "Akaunti hii imezuiwa kutumia Winga.";
  if (status === "suspended") return "Akaunti hii imesimamishwa kwa muda.";
  if (status === "deactivated") return "Akaunti hii imezimwa.";
  return "Huna ruhusa ya kutumia action hii.";
}

function parseCookies(req) {
  const cookieHeader = String(req?.headers?.cookie || "");
  if (!cookieHeader) {
    return {};
  }
  return cookieHeader.split(";").reduce((cookies, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      return cookies;
    }
    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!name) {
      return cookies;
    }
    try {
      cookies[name] = decodeURIComponent(value);
    } catch (error) {
      cookies[name] = value;
    }
    return cookies;
  }, {});
}

function getAuthCookieSameSite() {
  return NODE_ENV === "production" ? "None" : "Lax";
}

function shouldUseSecureAuthCookie(req) {
  if (NODE_ENV === "production") {
    return true;
  }
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").toLowerCase();
  return forwardedProto === "https";
}

function buildAuthCookieHeader(token, req) {
  const attributes = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(String(token || ""))}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    `SameSite=${getAuthCookieSameSite()}`,
    "Priority=High"
  ];
  if (shouldUseSecureAuthCookie(req)) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

function buildClearAuthCookieHeader(req) {
  const attributes = [
    `${AUTH_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    `SameSite=${getAuthCookieSameSite()}`,
    "Priority=High"
  ];
  if (shouldUseSecureAuthCookie(req)) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

function buildCsrfCookieHeader(token, req) {
  const attributes = [
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(String(token || ""))}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${Math.floor(CSRF_TOKEN_TTL_MS / 1000)}`,
    `SameSite=${getAuthCookieSameSite()}`,
    "Priority=High"
  ];
  if (shouldUseSecureAuthCookie(req)) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

function signCsrfPayload(payload) {
  return crypto
    .createHmac("sha256", CSRF_SECRET)
    .update(String(payload || ""))
    .digest("base64url");
}

function createCsrfToken() {
  const nonce = crypto.randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + CSRF_TOKEN_TTL_MS;
  const payload = `${nonce}.${expiresAt}`;
  return `${payload}.${signCsrfPayload(payload)}`;
}

function timingSafeStringEqual(first = "", second = "") {
  const firstBuffer = Buffer.from(String(first || ""));
  const secondBuffer = Buffer.from(String(second || ""));
  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

function isValidCsrfToken(token = "") {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    return false;
  }
  const [nonce, expiresAtText, signature] = parts;
  if (!nonce || !expiresAtText || !signature) {
    return false;
  }
  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false;
  }
  const payload = `${nonce}.${expiresAtText}`;
  return timingSafeStringEqual(signature, signCsrfPayload(payload));
}

function isCsrfProtectedMethod(method = "GET") {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "GET").toUpperCase());
}

function isServerToServerWebhookPath(pathname = "") {
  return pathname === "/api/payments/webhook";
}

function isCsrfExemptPath(pathname = "") {
  return pathname === "/api/auth/csrf-token" || pathname === "/api/health" || isServerToServerWebhookPath(pathname);
}

function validateCsrfRequest(req, pathname = "") {
  if (!String(pathname || "").startsWith("/api/") || !isCsrfProtectedMethod(req.method) || isCsrfExemptPath(pathname)) {
    return { ok: true };
  }
  const cookies = parseCookies(req);
  const cookieToken = String(cookies[CSRF_COOKIE_NAME] || "").trim();
  const headerToken = String(req.headers["x-csrf-token"] || req.headers["x-winga-csrf-token"] || "").trim();
  if (!cookieToken || !headerToken) {
    return { ok: false, reason: "missing" };
  }
  if (!timingSafeStringEqual(cookieToken, headerToken) || !isValidCsrfToken(headerToken)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true };
}

function readAuthToken(req) {
  const cookieToken = String(parseCookies(req)[AUTH_COOKIE_NAME] || "").trim();
  if (cookieToken) {
    return cookieToken;
  }
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

function findSession(store, token) {
  if (!token) return null;
  const session = (store.sessions || []).find((item) => item.token === token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    return null;
  }
  const user = getUserByUsername(store, session.username);
  if (!user) {
    return null;
  }
  return {
    ...session,
    role: user.role || session.role,
    status: user.status || session.status,
    fullName: user.fullName || session.fullName,
    primaryCategory: user.primaryCategory || session.primaryCategory
  };
}

function cleanupSessions(store) {
  return {
    ...store,
    sessions: (store.sessions || []).filter((item) => item.expiresAt >= Date.now())
  };
}

function getProductIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/products\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function getProductActionMatch(pathname) {
  return pathname.match(/^\/api\/products\/([^/]+)\/(like|view)$/);
}

function isNonEmptyString(value, min = 1, max = 120) {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

function isSafeIdentifier(value, min = 3, max = 40) {
  return /^[a-z0-9._-]+$/i.test(String(value || "")) && isNonEmptyString(value, min, max);
}

function isValidWhatsapp(value) {
  return typeof value === "string" && /^\d{10,15}$/.test(value);
}

function isValidNationalId(value) {
  return typeof value === "string" && /^[A-Z0-9]{8,20}$/.test(value);
}

function isValidVerificationCode(value) {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashVerificationCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

function isValidCategory(category) {
  return typeof category === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category) && category.length <= 40;
}

function parseDataImageValue(value) {
  const match = typeof value === "string"
    ? value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/)
    : null;
  if (!match) {
    return null;
  }
  const mimeType = String(match[1] || "").toLowerCase();
  const encoded = String(match[2] || "");
  if (!ALLOWED_DATA_IMAGE_MIME_TYPES.has(mimeType) || encoded.length % 4 !== 0) {
    return null;
  }
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BINARY_BYTES) {
    return null;
  }
  return { mimeType, encoded, buffer };
}

function imageBufferMatchesMime(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return false;
  }
  switch (mimeType) {
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return buffer.length >= 8
        && buffer[0] === 0x89
        && buffer[1] === 0x50
        && buffer[2] === 0x4e
        && buffer[3] === 0x47
        && buffer[4] === 0x0d
        && buffer[5] === 0x0a
        && buffer[6] === 0x1a
        && buffer[7] === 0x0a;
    case "image/gif":
      return buffer.length >= 6 && (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a");
    case "image/webp":
      return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    default:
      return false;
  }
}

function isValidDataImageValue(value) {
  if (typeof value !== "string" || value.length > MAX_DATA_URL_LENGTH) {
    return false;
  }
  const parsed = parseDataImageValue(value);
  return Boolean(parsed && imageBufferMatchesMime(parsed.buffer, parsed.mimeType));
}

function isValidImageValue(value) {
  if (typeof value !== "string" || !value) return false;
  if (value.startsWith("data:image/")) {
    return isValidDataImageValue(value);
  }
  return /^https?:\/\//i.test(value) || /^\/uploads\/[a-zA-Z0-9._-]+$/.test(value);
}

function isValidPrivateImageValue(value) {
  return isValidDataImageValue(value);
}

function getMimeExtension(mimeType) {
  const knownExtensions = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif"
  };
  return knownExtensions[mimeType] || "";
}

function getMimeTypeFromExtension(extension) {
  const normalized = String(extension || "").toLowerCase();
  const knownTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif"
  };
  return knownTypes[normalized] || "";
}

function normalizeStoredImageReference(value) {
  if (typeof value !== "string" || !value) {
    return value;
  }

  if (value.startsWith("/uploads/")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith("/uploads/")) {
      return parsed.pathname;
    }
  } catch (error) {
    return value;
  }

  return value;
}

function saveDataUrlImage(value) {
  const normalizedValue = normalizeStoredImageReference(value);
  const parsedImage = parseDataImageValue(value);

  if (!parsedImage) {
    return normalizedValue;
  }

  const { mimeType, buffer } = parsedImage;
  if (!imageBufferMatchesMime(buffer, mimeType)) {
    throw new Error("Aina ya picha haijaruhusiwa.");
  }
  const extension = getMimeExtension(mimeType);
  if (!extension) {
    throw new Error("Aina ya picha haijaruhusiwa.");
  }

  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;
  const filePath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${fileName}`;
}

function buildPersistentImageArchive(value) {
  return "";
}

function isMissingLocalUploadReference(value) {
  const normalizedValue = normalizeStoredImageReference(value);
  if (typeof normalizedValue !== "string" || !normalizedValue.startsWith("/uploads/")) {
    return false;
  }
  const filePath = getLocalUploadFilePath(normalizedValue);
  return !filePath || !fs.existsSync(filePath);
}

function resolveProductImageForDelivery(value, archiveValue, allowPlaceholder = false) {
  const normalizedValue = normalizeStoredImageReference(value);
  if (typeof normalizedValue === "string" && normalizedValue.startsWith("/uploads/")) {
    const filePath = getLocalUploadFilePath(normalizedValue);
    if (!filePath || !fs.existsSync(filePath)) {
      return allowPlaceholder ? SAFE_IMAGE_PLACEHOLDER_PATH : "";
    }
  }
  return normalizedValue;
}

function repairNormalizedProductImageState(product) {
  const normalizedProduct = normalizeProductRecord(product);
  const sourceImages = Array.isArray(normalizedProduct.images) && normalizedProduct.images.length
    ? normalizedProduct.images.map((image) => normalizeStoredImageReference(image))
    : [normalizeStoredImageReference(normalizedProduct.image || "")].filter(Boolean);
  const allowPlaceholder = Boolean(normalizedProduct.imageFallbackEligible);
  const repairedEntries = sourceImages
    .map((image, index) => {
      const deliveredImage = resolveProductImageForDelivery(image, "", allowPlaceholder);
      if (!deliveredImage) {
        return null;
      }
      if (isMissingLocalUploadReference(image) && deliveredImage !== image) {
        return {
          image: deliveredImage,
          archive: ""
        };
      }
      return {
        image,
        archive: ""
      };
    })
    .filter(Boolean);

  const repairedImages = repairedEntries.map((entry) => entry.image).filter(Boolean);
  const repairedArchives = repairedEntries.map((entry) => entry.archive || "");

  return {
    ...normalizedProduct,
    image: repairedImages[0] || "",
    images: repairedImages,
    imageArchives: [],
    imageFallbackEligible: allowPlaceholder
  };
}

function summarizeProductImageConsistency(store) {
  const products = Array.isArray(store?.products) ? store.products : [];
  let productsWithBrokenImages = 0;
  let brokenImageReferences = 0;
  let archiveFallbackImages = 0;

  products.forEach((product) => {
    const normalizedProduct = normalizeProductRecord(product);
    const images = Array.isArray(normalizedProduct.images) ? normalizedProduct.images : [];
    let productHasBrokenImages = false;
    images.forEach((image, index) => {
      if (!isMissingLocalUploadReference(image)) {
        return;
      }
      productHasBrokenImages = true;
      brokenImageReferences += 1;
      archiveFallbackImages += 0;
    });
    if (productHasBrokenImages) {
      productsWithBrokenImages += 1;
    }
  });

  return {
    productsWithBrokenImages,
    brokenImageReferences,
    archiveFallbackImages
  };
}

function normalizeProductImages(product) {
  const sourceImages = Array.isArray(product.images) ? product.images : [];
  const images = sourceImages.map(saveDataUrlImage);
  const imageFallbackEligible = sourceImages.some((sourceImage, index) => {
    if (typeof sourceImage === "string" && sourceImage.startsWith("data:image/")) {
      return true;
    }
    const normalizedImage = normalizeStoredImageReference(images[index] || sourceImage || "");
    const filePath = getLocalUploadFilePath(normalizedImage);
    return Boolean(filePath && fs.existsSync(filePath));
  }) || Boolean(product.imageFallbackEligible);
  return {
    ...product,
    images,
    image: images[0] || normalizeStoredImageReference(product.image) || "",
    imageArchives: [],
    imageFallbackEligible
  };
}

function getLocalUploadFilePath(value) {
  const normalizedValue = normalizeStoredImageReference(value);
  if (typeof normalizedValue !== "string" || !normalizedValue.startsWith("/uploads/")) {
    return "";
  }

  const fileName = path.basename(normalizedValue);
  return path.join(UPLOADS_DIR, fileName);
}

function resolveProxyImageTarget(value, req) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return null;
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(normalizedValue, getPublicRequestOrigin(req));
  } catch (error) {
    return null;
  }

  if (!parsedTarget.pathname.startsWith("/uploads/")) {
    return null;
  }

  const filePath = getLocalUploadFilePath(parsedTarget.pathname);
  if (!filePath || !filePath.startsWith(UPLOADS_DIR)) {
    return null;
  }

  return {
    filePath,
    contentType: getMimeTypeFromExtension(path.extname(filePath).toLowerCase()) || "application/octet-stream"
  };
}

function cleanupUnusedLocalImages(previousProduct, nextProduct, allProducts) {
  const nextImages = new Set((nextProduct?.images || []).filter((image) => image.startsWith("/uploads/")));
  const usedByOtherProducts = new Set(
    (allProducts || [])
      .filter((product) => !nextProduct || product.id !== nextProduct.id)
      .flatMap((product) => product.images || [])
      .filter((image) => typeof image === "string" && image.startsWith("/uploads/"))
  );

  (previousProduct?.images || [])
    .filter((image) => typeof image === "string" && image.startsWith("/uploads/"))
    .forEach((image) => {
      if (nextImages.has(image) || usedByOtherProducts.has(image)) {
        return;
      }

      const filePath = getLocalUploadFilePath(image);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
}

function migrateLegacyStore(store) {
  const normalizedUsers = syncConfiguredAdminIdentity((store.users || []).map(normalizeUserRecord));
  getSeedUsersForEnvironment().forEach((seedUser) => {
    if (!normalizedUsers.some((user) => user.username === seedUser.username)) {
      normalizedUsers.unshift({
        ...seedUser,
        password: createPasswordHash(seedUser.password),
        createdAt: new Date().toISOString()
      });
    }
  });
  const rawProducts = Array.isArray(store.products) ? store.products : [];
  const normalizedOrders = (store.orders || []).map(normalizeOrderRecord);
  const normalizedPayments = (store.payments || []).map(normalizePaymentRecord);
  const normalizedMessages = (store.messages || []).map(normalizeMessageRecord);
  const normalizedNotifications = (store.notifications || []).map(normalizeNotificationRecord);
  const normalizedPromotions = (store.promotions || []).map(normalizePromotionRecord);
  const normalizedReviews = (store.reviews || []).map(normalizeReviewRecord);
  const normalizedReports = (store.reports || []).map(normalizeReportRecord);
  const normalizedModerationActions = (store.moderationActions || []).map(normalizeModerationActionRecord);
  const normalizedSettings = normalizeAppSettings(store.settings || DEFAULT_APP_SETTINGS);
  const mergedCategories = mergeCategories(
    store.categories || [],
    normalizedUsers.map((user) => ({ value: user.primaryCategory, label: user.primaryCategory })),
    rawProducts.map((product) => ({ value: product.category, label: product.category }))
  );
  let didChange = JSON.stringify(normalizedUsers) !== JSON.stringify(store.users || []);

  const migratedProducts = rawProducts.map((product) => {
    const originalImages = Array.isArray(product.images) ? product.images : [];
    const originalImage = product.image || "";
    const originalArchives = Array.isArray(product.imageArchives) ? product.imageArchives : [];
    const normalizedProduct = repairNormalizedProductImageState(normalizeProductImages(product));
    const imagesChanged = JSON.stringify(normalizedProduct.images) !== JSON.stringify(originalImages);
    const archivesChanged = originalArchives.length > 0;
    const imageChanged = normalizedProduct.image !== originalImage
      || normalizedProduct.status !== product.status
      || normalizedProduct.moderationNote !== (product.moderationNote || "")
      || normalizedProduct.createdAt !== (product.createdAt || "")
      || normalizedProduct.moderatedAt !== (product.moderatedAt || "")
      || normalizedProduct.moderatedBy !== (product.moderatedBy || "");

    if (imagesChanged || archivesChanged || imageChanged) {
      didChange = true;
    }

    return normalizedProduct;
  });

  const normalizedSessions = (store.sessions || []).map((session) => {
    const sessionUser = normalizedUsers.find((user) => user.username === session.username);
    return {
      ...session,
      primaryCategory: session.primaryCategory || sessionUser?.primaryCategory || "",
      role: isValidRole(session.role) ? session.role : (sessionUser?.role || "seller")
    };
  });

  if (JSON.stringify(normalizedSessions) !== JSON.stringify(store.sessions || [])) {
    didChange = true;
  }

  const paymentsFromOrders = normalizedOrders
    .filter((order) => order.transactionId)
    .filter((order) => !normalizedPayments.some((payment) => payment.orderId === order.id))
    .map((order) => normalizePaymentRecord({
      id: `payment-${order.id}`,
      orderId: order.id,
      buyerUsername: order.buyerUsername,
      amountPaid: Number(order.price || 0),
      paymentMethod: order.paymentMethod || "mobile_money",
      transactionReference: order.transactionId,
      receiptNumber: order.transactionId,
      paymentStatus: order.paymentStatus || (order.status === "paid" || order.status === "confirmed" || order.status === "delivered" ? "paid" : "pending"),
      payerDetails: {},
      rawGatewayResponse: null,
      createdAt: order.paymentSubmittedAt || order.createdAt,
      updatedAt: order.paymentConfirmedAt || order.paymentSubmittedAt || order.createdAt
    }));

  if (paymentsFromOrders.length > 0 || JSON.stringify(normalizedPayments) !== JSON.stringify(store.payments || [])) {
    didChange = true;
  }
  if (JSON.stringify(normalizedMessages) !== JSON.stringify(store.messages || [])) {
    didChange = true;
  }
  if (JSON.stringify(normalizedNotifications) !== JSON.stringify(store.notifications || [])) {
    didChange = true;
  }
  if (JSON.stringify(normalizedPromotions) !== JSON.stringify(store.promotions || [])) {
    didChange = true;
  }
  if (JSON.stringify(normalizedReviews) !== JSON.stringify(store.reviews || [])) {
    didChange = true;
  }
  if (JSON.stringify(normalizedReports) !== JSON.stringify(store.reports || [])) {
    didChange = true;
  }
  if (JSON.stringify(normalizedModerationActions) !== JSON.stringify(store.moderationActions || [])) {
    didChange = true;
  }
  if (JSON.stringify(normalizedSettings) !== JSON.stringify(normalizeAppSettings(store.settings || DEFAULT_APP_SETTINGS))) {
    didChange = true;
  }

  if (didChange) {
    const migratedStore = {
      ...store,
      categories: mergedCategories,
      users: normalizedUsers,
      products: migratedProducts,
      orders: normalizedOrders,
      payments: [...normalizedPayments, ...paymentsFromOrders],
      messages: normalizedMessages,
      notifications: normalizedNotifications,
      promotions: normalizedPromotions,
      reviews: normalizedReviews,
      reports: normalizedReports,
      moderationActions: normalizedModerationActions,
      settings: normalizedSettings,
      sessions: normalizedSessions
    };
    return {
      store: migratedStore,
      didChange: true,
      auditEntry: {
        time: new Date().toISOString(),
        event: "legacy_products_migrated",
        migratedCount: migratedProducts.length
      }
    };
  }

  return {
    store: {
      ...store,
      categories: mergedCategories,
        users: normalizedUsers,
        products: migratedProducts.map((product) => normalizeProductRecord(product)),
        orders: normalizedOrders,
        payments: [...normalizedPayments, ...paymentsFromOrders],
        messages: normalizedMessages,
        notifications: normalizedNotifications,
        promotions: normalizedPromotions,
        reviews: normalizedReviews,
      reports: normalizedReports,
      moderationActions: normalizedModerationActions,
      settings: normalizedSettings,
      sessions: normalizedSessions
    },
    didChange: false,
    auditEntry: null
  };
}

async function initializeStoreAtBoot() {
  ensureLocalArtifacts();
  logStructuredEvent("info", "boot_memory_stage", {
    stage: "before_initialize_store",
    memory: getMemoryUsageSnapshot()
  });

  if (postgresStore) {
    await postgresStore.init(() => readLegacyStore());
  }

  const rawStore = await readStore();
  const cleanedStore = cleanupSessions(rawStore);
  const sessionsChanged = (rawStore.sessions || []).length !== (cleanedStore.sessions || []).length;
  const migrationResult = migrateLegacyStore(cleanedStore);
  const adminSyncResult = syncConfiguredAdminCredentials(migrationResult.store);
  const migratedStore = adminSyncResult.store;
  const shouldWrite = sessionsChanged || migrationResult.didChange || adminSyncResult.didChange;

  if (shouldWrite) {
    await writeStore(migratedStore);
  }

  if (migrationResult.auditEntry) {
    await appendAuditLog(migrationResult.auditEntry);
  }

  logStructuredEvent("info", "boot_memory_stage", {
    stage: "after_initialize_store",
    memory: getMemoryUsageSnapshot(),
    users: Array.isArray(migratedStore?.users) ? migratedStore.users.length : 0,
    products: Array.isArray(migratedStore?.products) ? migratedStore.products.length : 0,
    sessions: Array.isArray(migratedStore?.sessions) ? migratedStore.sessions.length : 0
  });

  return migratedStore;
}

function getNormalizedSignupIdentity(payload = {}) {
  return {
    idType: sanitizePlainText(payload.id_type || payload.identityDocumentType, 30).toUpperCase(),
    idNumber: sanitizePlainText(payload.id_number || payload.identityDocumentNumber || payload.nationalId, 40).toUpperCase(),
    idImage: payload.id_image || payload.identityDocumentImage || ""
  };
}

function stripSignupCategoryFields(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const {
    primaryCategory,
    category,
    subcategory,
    categoryId,
    subcategoryId,
    ...rest
  } = payload;

  return {
    ...rest,
    primaryCategory: ""
  };
}

function validateSignupPayload(payload) {
  if (!payload || !isValidRole(payload.role || "seller")) {
    return "Account type si sahihi.";
  }
  if (!isNonEmptyString(payload.password, MIN_PASSWORD_LENGTH, 120)) {
    return `Password inapaswa kuwa angalau herufi ${MIN_PASSWORD_LENGTH}.`;
  }
  if (!isValidWhatsapp(payload.phoneNumber || "")) {
    return "Namba ya simu si sahihi.";
  }
  if (!isNonEmptyString(payload.fullName || payload.username, 1, 120)) {
    return "Jina la kuonekana si sahihi.";
  }
  return "";
}

function validateSellerUpgradePayload(payload, user = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Taarifa za seller upgrade si sahihi.";
  }

  const fullName = sanitizePlainText(payload.fullName || user.fullName || user.username, 120);
  if (!isNonEmptyString(fullName, 3, 120)) {
    return "Jina la duka si sahihi.";
  }

  const phoneNumber = String(payload.phoneNumber || user.phoneNumber || user.whatsappNumber || "").replace(/\D/g, "").slice(0, 20);
  if (!isValidWhatsapp(phoneNumber)) {
    return "Namba ya simu si sahihi.";
  }

  const primaryCategory = sanitizePlainText(payload.primaryCategory || user.primaryCategory || "", 60).toLowerCase();
  if (payload.primaryCategory && !isValidCategory(primaryCategory)) {
    return "Category ya seller si sahihi.";
  }

  return "";
}

function validatePasswordRecoveryPayload(payload) {
  const identifier = sanitizePlainText(payload?.identifier || payload?.username, 120);
  const nextPassword = String(payload?.newPassword || payload?.password || "");
  if (!isNonEmptyString(identifier, 3, 120)) {
    return "Weka username, full name, au namba ya simu ya akaunti.";
  }
  if (!isValidWhatsapp(payload?.phoneNumber || "")) {
    return "Weka namba ya simu sahihi ya akaunti hii.";
  }
  if (!isValidNationalId(payload?.nationalId || "")) {
    return "Weka namba ya kitambulisho sahihi.";
  }
  if (!isNonEmptyString(nextPassword, MIN_PASSWORD_LENGTH, 120)) {
    return `Password mpya inapaswa kuwa angalau herufi ${MIN_PASSWORD_LENGTH}.`;
  }
  return "";
}

function findUserIndexByPublicIdentifier(users, rawIdentifier) {
  const normalizedIdentifier = normalizeIdentifier(rawIdentifier, 120);
  const normalizedPhone = String(rawIdentifier || "").replace(/\D/g, "").slice(0, 20);
  const adminIdentity = getAdminSeedIdentity();
  return (users || []).findIndex((item) =>
    normalizeIdentifier(item.username, 120) === normalizedIdentifier
    || normalizeIdentifier(item.fullName || "", 120) === normalizedIdentifier
    || (normalizeIdentifier(item.username, 120) === adminIdentity.username && normalizedIdentifier === normalizeIdentifier(adminIdentity.fullName, 120))
    || String(item.phoneNumber || "") === normalizedPhone
  );
}

function validateUserModerationPayload(payload) {
  const hasStatus = typeof payload?.status === "string" && payload.status.length > 0;
  const hasVerificationUpdate = Boolean(payload?.verificationStatus) || typeof payload?.verifiedSeller === "boolean";
  const hasRoleChange = typeof payload?.role === "string" && payload.role.length > 0;
  const hasDeleteRequest = payload?.deleteUser === true;
  if (!payload || (!hasStatus && !hasVerificationUpdate && !hasRoleChange && !hasDeleteRequest)) {
    return "Hakuna moderation action sahihi.";
  }
  if (hasStatus && !isValidUserStatus(payload.status)) {
    return "User status si sahihi.";
  }
  if (hasStatus && (payload.status === "suspended" || payload.status === "banned" || payload.status === "deactivated" || payload.status === "flagged") && !isNonEmptyString(payload.reason, 3, 120)) {
    return "Weka sababu ya moderation.";
  }
  if (payload.note && !isNonEmptyString(payload.note, 3, 300)) {
    return "Moderation note si sahihi.";
  }
  if (hasRoleChange && !["buyer", "seller"].includes(String(payload.role || "").trim().toLowerCase())) {
    return "Role ya user si sahihi.";
  }
  if (payload.verificationStatus && !ALLOWED_VERIFICATION_STATUSES.includes(payload.verificationStatus)) {
    return "Verification status si sahihi.";
  }
  return "";
}

function validateInvestigationRequestPayload(payload) {
  if (!payload || !isNonEmptyString(payload.reason, 6, 240)) {
    return "Weka sababu ya fraud review kabla ya kufungua investigation.";
  }
  return "";
}

function buildAdminUserSummary(store, user) {
  const normalizedUser = normalizeUserRecord(user || {});
  const username = normalizedUser.username;
  const userProducts = (store.products || [])
    .map(normalizeProductRecord)
    .filter((product) => product.uploadedBy === username);
  const productIds = new Set(userProducts.map((product) => product.id));
  const reports = (store.reports || []).map(normalizeReportRecord);
  const userReports = reports.filter((report) =>
    report.targetUserId === username
    || productIds.has(report.targetProductId)
  );
  const activeSessionCount = (store.sessions || []).filter((session) =>
    normalizeIdentifier(session.username, 40) === username
    && Number(session.expiresAt || 0) >= Date.now()
  ).length;
  const openReportsCount = userReports.filter((report) => report.status === "open").length;
  const reportsFiledCount = reports.filter((report) => report.reporterUserId === username).length;
  const suspiciousSignalCount = [
    openReportsCount > 0,
    activeSessionCount > 2,
    normalizedUser.status === "flagged",
    normalizedUser.verificationStatus === "rejected"
  ].filter(Boolean).length;

  return {
    productCount: userProducts.length,
    activeSessionCount,
    openReportsCount,
    reportsFiledCount,
    suspiciousSignalCount
  };
}

async function buildAdminUserInvestigation(store, user, options = {}) {
  const normalizedUser = normalizeUserRecord(user || {});
  const username = normalizedUser.username;
  const reason = sanitizePlainText(options.reason, 240);
  const allProducts = (store.products || []).map(normalizeProductRecord);
  const userProducts = allProducts.filter((product) => product.uploadedBy === username);
  const productIds = new Set(userProducts.map((product) => product.id));
  const reports = (store.reports || []).map(normalizeReportRecord);
  const relatedReports = reports.filter((report) =>
    report.targetUserId === username
    || productIds.has(report.targetProductId)
    || report.reporterUserId === username
  );
  const orders = (store.orders || []).map(normalizeOrderRecord);
  const userOrdersAsBuyer = orders.filter((order) => order.buyerUsername === username);
  const userOrdersAsSeller = orders.filter((order) => order.sellerUsername === username);
  const messages = (store.messages || []).map(normalizeMessageRecord);
  const relatedMessages = messages.filter((message) =>
    message.senderId === username
    || message.receiverId === username
  );
  const activeSessions = (store.sessions || [])
    .filter((session) =>
      normalizeIdentifier(session.username, 40) === username
      && Number(session.expiresAt || 0) >= Date.now()
    )
    .map((session) => ({
      tokenLast4: String(session.token || "").slice(-4),
      createdAt: session.createdAt || "",
      expiresAt: session.expiresAt || 0
    }));
  const recentAuditEntries = (await readRecentAuditEntries(240)).filter((entry) => {
    const entryUsername = normalizeIdentifier(entry?.username, 40);
    const entryTargetUser = normalizeIdentifier(entry?.targetUserId, 40);
    const entryTargetProduct = sanitizePlainText(entry?.targetProductId, 80);
    return entryUsername === username
      || entryTargetUser === username
      || productIds.has(entryTargetProduct);
  });
  const loginHistory = recentAuditEntries
    .filter((entry) => {
      const event = String(entry?.event || "");
      return event.includes("login") || event.includes("signup");
    })
    .slice(0, 12)
    .map((entry) => ({
      time: entry.time || "",
      event: entry.event || "",
      statusCode: entry.statusCode || 0,
      reason: entry.reason || ""
    }));
  const failedLogins24h = recentAuditEntries.filter((entry) => {
    const event = String(entry?.event || "");
    const time = entry?.time ? new Date(entry.time).getTime() : 0;
    return time
      && (Date.now() - time) <= 24 * 60 * 60 * 1000
      && (event === "login_failed" || event === "login_blocked");
  }).length;
  const reportedConversationEvidenceCount = relatedReports.filter((report) =>
    /message|chat|conversation|abuse|fraud/i.test(`${report.reason || ""} ${report.description || ""}`)
  ).length;
  const suspiciousActivityIndicators = [];
  if (normalizedUser.status === "flagged") {
    suspiciousActivityIndicators.push({
      label: "Suspicious Activity",
      severity: "high",
      detail: "Akaunti hii imewekwa flagged kwenye moderation."
    });
  }
  if (failedLogins24h >= 3) {
    suspiciousActivityIndicators.push({
      label: "Repeated login failures",
      severity: "medium",
      detail: `${failedLogins24h} failed login attempts in the last 24 hours.`
    });
  }
  if (activeSessions.length > 2) {
    suspiciousActivityIndicators.push({
      label: "Multiple active sessions",
      severity: "medium",
      detail: `${activeSessions.length} active sessions are still open.`
    });
  }
  if (relatedReports.some((report) => report.status === "open")) {
    suspiciousActivityIndicators.push({
      label: "Reported",
      severity: "medium",
      detail: `${relatedReports.filter((report) => report.status === "open").length} open reports need review.`
    });
  }
  if (normalizedUser.verificationStatus === "rejected") {
    suspiciousActivityIndicators.push({
      label: "Identity verification issue",
      severity: "high",
      detail: "Identity verification was rejected earlier."
    });
  }

  return {
    profile: sanitizeAdminUser(normalizedUser),
    identityVerificationStatus: normalizedUser.verificationStatus || (normalizedUser.verifiedSeller ? "verified" : "not_verified"),
    fraudReview: {
      requestedReason: reason,
      directMessageAccess: "restricted",
      directMessagesExposed: false,
      reportedConversationEvidenceCount,
      policy: "Direct private messages are not shown here by default. Use reports and audit history for fraud review."
    },
    accountActivitySummary: {
      productCount: userProducts.length,
      approvedProductCount: userProducts.filter((product) => product.status === "approved").length,
      pendingProductCount: userProducts.filter((product) => product.status === "pending").length,
      rejectedProductCount: userProducts.filter((product) => product.status === "rejected").length,
      ordersAsBuyerCount: userOrdersAsBuyer.length,
      ordersAsSellerCount: userOrdersAsSeller.length,
      openReportsCount: relatedReports.filter((report) => report.status === "open").length,
      reportsFiledCount: relatedReports.filter((report) => report.reporterUserId === username).length,
      activeSessionCount: activeSessions.length,
      messageTouchpointsCount: relatedMessages.length
    },
    loginActivity: loginHistory,
    activeSessions,
    recentActivity: recentAuditEntries.slice(0, 16).map((entry) => ({
      time: entry.time || "",
      event: entry.event || "",
      reason: entry.reason || "",
      path: entry.path || ""
    })),
    reports: relatedReports.slice(0, 12).map((report) => ({
      id: report.id,
      targetType: report.targetType,
      targetProductId: report.targetProductId || "",
      reporterUserId: report.reporterUserId || "",
      reason: report.reason || "",
      description: report.description || "",
      status: report.status || "open",
      createdAt: report.createdAt || ""
    })),
    suspiciousActivityIndicators
  };
}

function canPostProducts(role) {
  return role === "seller" || role === "admin" || role === "moderator";
}

function validateReportPayload(payload) {
  if (!payload || !ALLOWED_REPORT_TARGETS.includes(payload.targetType)) {
    return "Target ya report si sahihi.";
  }
  if (!isNonEmptyString(payload.reason, 3, 120)) {
    return "Sababu ya report si sahihi.";
  }
  if (payload.description && !isNonEmptyString(payload.description, 3, 500)) {
    return "Maelezo ya report si sahihi.";
  }
  if (payload.targetType === "user" && !isSafeIdentifier(payload.targetUserId, 3, 40)) {
    return "Reported user si sahihi.";
  }
  if (payload.targetType === "product" && !isNonEmptyString(payload.targetProductId, 8, 80)) {
    return "Reported product si sahihi.";
  }
  return "";
}

function validateMessagePayload(payload) {
  if (!payload || !isSafeIdentifier(payload.receiverId, 3, 40)) {
    return "Mpokeaji wa ujumbe si sahihi.";
  }
  const hasTextMessage = isNonEmptyString(payload.message, 1, 1000);
  const productItems = Array.isArray(payload.productItems) ? payload.productItems : [];
  const isContactShare = payload.messageType === "contact_share";
  if (!hasTextMessage && productItems.length === 0 && !isContactShare) {
    return "Ujumbe au bidhaa ya kuulizia inahitajika.";
  }
  if (payload.productId && !isNonEmptyString(payload.productId, 3, 80)) {
    return "Bidhaa ya chat si sahihi.";
  }
  if (payload.productName && !isNonEmptyString(payload.productName, 2, 120)) {
    return "Jina la bidhaa si sahihi.";
  }
  if (payload.replyToMessageId && !isNonEmptyString(payload.replyToMessageId, 3, 80)) {
    return "Reply message si sahihi.";
  }
  if (productItems.length > 10) {
    return "Chagua bidhaa zisizozidi 10 kwa inquiry moja.";
  }
  if (productItems.some((item) => !item || !isNonEmptyString(item.productId, 3, 80) || !isNonEmptyString(item.productName, 2, 120))) {
    return "Moja ya bidhaa za inquiry si sahihi.";
  }
  return "";
}

function validateMarkReadPayload(payload) {
  if (!payload || !isSafeIdentifier(payload.withUser, 3, 40)) {
    return "Conversation user si sahihi.";
  }
  return "";
}

function validatePromotionPayload(payload) {
  if (!payload || !isNonEmptyString(payload.productId, 3, 80)) {
    return "Bidhaa ya promotion si sahihi.";
  }
  if (!ALLOWED_PROMOTION_TYPES.includes(payload.type)) {
    return "Promotion type si sahihi.";
  }
  if (!isNonEmptyString(payload.transactionReference, 4, 80)) {
    return "Transaction reference ya promotion si sahihi.";
  }
  if (!/^[A-Z0-9._/-]+$/i.test(String(payload.transactionReference || "").trim())) {
    return "Transaction reference ya promotion ina herufi zisizoruhusiwa.";
  }
  return "";
}

function validatePromotionReviewPayload(payload) {
  const status = sanitizePlainText(payload?.status, 20).toLowerCase();
  if (!["active", "rejected"].includes(status)) {
    return "Promotion review action si sahihi.";
  }
  return "";
}

function isValidTransactionReference(value) {
  return /^[A-Z0-9._/-]{4,80}$/i.test(String(value || "").trim());
}

function validateReviewPayload(payload) {
  if (!payload || !isNonEmptyString(payload.productId, 3, 80)) {
    return "Bidhaa ya review si sahihi.";
  }
  if (!Number.isInteger(Number(payload.rating)) || Number(payload.rating) < 1 || Number(payload.rating) > 5) {
    return "Rating inapaswa kuwa kati ya 1 na 5.";
  }
  if (!isNonEmptyString(payload.comment, 3, 500)) {
    return "Review lazima iwe na maoni mafupi yenye maana.";
  }
  return "";
}

function validateReportReviewPayload(payload) {
  if (!payload || !ALLOWED_REPORT_STATUSES.includes(payload.status)) {
    return "Report status si sahihi.";
  }
  if (payload.reviewNote && !isNonEmptyString(payload.reviewNote, 3, 300)) {
    return "Review note si sahihi.";
  }
  return "";
}

function buildAnalytics(store, username = "", isAdmin = false) {
  const products = Array.isArray(store.products) ? store.products : [];
  const visibleProducts = isAdmin ? products : products.filter((product) => product.uploadedBy === username);
  const approvedProducts = products.filter((product) => product.status === "approved");
  const pendingProducts = products.filter((product) => product.status === "pending");
  const rejectedProducts = products.filter((product) => product.status === "rejected");
  const messages = (store.messages || []).map(normalizeMessageRecord);
  const orders = (store.orders || []).map(normalizeOrderRecord);
  const relevantMessages = isAdmin
    ? messages
    : messages.filter((message) => message.senderId === username || message.receiverId === username);
  const conversationThreads = new Set(
    relevantMessages
      .map((message) => {
        const partner = message.senderId === username ? message.receiverId : message.senderId;
        return normalizeIdentifier(partner, 40);
      })
      .filter(Boolean)
  );
  const unreadInquiryThreads = new Set(
    relevantMessages
      .filter((message) =>
        message.receiverId === username
        && !message.isRead
        && ["text", "product_reference", "product_inquiry", "contact_share"].includes(message.messageType || "text")
      )
      .map((message) => normalizeIdentifier(message.senderId, 40))
      .filter(Boolean)
  );
  const sellerOrders = isAdmin ? orders : orders.filter((order) => order.sellerUsername === username);
  const openOrders = sellerOrders.filter((order) => ["placed", "paid", "confirmed"].includes(order.status)).length;
  const completedOrders = sellerOrders.filter((order) => order.status === "delivered").length;
  const repeatBuyers = Object.values(
    sellerOrders.reduce((accumulator, order) => {
      if (!order.buyerUsername) {
        return accumulator;
      }
      accumulator[order.buyerUsername] = (accumulator[order.buyerUsername] || 0) + 1;
      return accumulator;
    }, {})
  ).filter((count) => count > 1).length;
  const conversionRate = conversationThreads.size > 0
    ? Math.round(((openOrders + completedOrders) / conversationThreads.size) * 100)
    : 0;
  const sellerStats = !isAdmin && username ? buildSellerPublicStats(store, username) : null;

  return {
    usersCount: (store.users || []).length,
    flaggedUsers: (store.users || []).filter((user) => user.status === "flagged").length,
    totalProducts: visibleProducts.length,
    approvedProducts: isAdmin ? approvedProducts.length : visibleProducts.filter((product) => product.status === "approved").length,
    pendingProducts: isAdmin ? pendingProducts.length : visibleProducts.filter((product) => product.status === "pending").length,
    rejectedProducts: isAdmin ? rejectedProducts.length : visibleProducts.filter((product) => product.status === "rejected").length,
    totalViews: visibleProducts.reduce((sum, product) => sum + Number(product.views || 0), 0),
    totalLikes: visibleProducts.reduce((sum, product) => sum + Number(product.likes || 0), 0),
    conversationThreads: conversationThreads.size,
    newInquiries: unreadInquiryThreads.size,
    openOrders,
    completedOrders,
    repeatBuyers,
    conversionRate,
    trustScore: sellerStats?.trustScore || 0,
    trustTier: sellerStats?.trustTier || "",
    openReports: (store.reports || []).filter((report) => report.status === "open").length,
    topCategories: Object.entries(
      visibleProducts.reduce((accumulator, product) => {
        const key = product.category || "other";
        accumulator[key] = (accumulator[key] || 0) + 1;
        return accumulator;
      }, {})
    )
      .sort((first, second) => second[1] - first[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count })),
    recentProducts: visibleProducts
      .slice()
      .sort((first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime())
      .slice(0, 5)
      .map((product) => ({
        id: product.id,
        name: product.name,
        status: product.status,
        shop: product.shop,
        createdAt: product.createdAt || ""
      }))
  };
}

async function buildOpsSummary() {
  const recentAuditEntries = await readRecentAuditEntries(80);
  const backupStatus = getBackupStatus();
  const now = Date.now();
  const last24Hours = recentAuditEntries.filter((entry) => {
    const time = entry?.time ? new Date(entry.time).getTime() : 0;
    return time && (now - time) <= 24 * 60 * 60 * 1000;
  });
  const failureSignals = last24Hours.filter((entry) => {
    const event = String(entry?.event || "");
    const level = String(entry?.level || "");
    return level === "error"
      || event.includes("failed")
      || event.includes("denied")
      || event.includes("blocked")
      || event === "rate_limited";
  });
  const alertCandidates = last24Hours.filter((entry) => {
    const severity = String(entry?.alertSeverity || "").toLowerCase();
    return severity === "high" || severity === "critical";
  });

  return {
    environment: NODE_ENV,
    storageMode: runtimeConfiguration.storageMode,
    configWarnings: runtimeConfiguration.warnings,
    backupStatus,
    counts: {
      auditEvents24h: last24Hours.length,
      failureSignals24h: failureSignals.length,
      authFailures24h: last24Hours.filter((entry) => {
        const event = String(entry?.event || "");
        return event.includes("login_failed") || event.includes("login_blocked");
      }).length,
      alertCandidates24h: alertCandidates.length,
      runtimeClientErrors24h: last24Hours.filter((entry) => String(entry?.category || "") === "runtime" && String(entry?.level || "") === "error").length,
      deniedActions24h: last24Hours.filter((entry) => {
        const event = String(entry?.event || "");
        return event.includes("denied") || event.includes("blocked");
      }).length,
      staleSessions24h: last24Hours.filter((entry) => String(entry?.event || "").includes("session_invalid")).length,
      rateLimited24h: last24Hours.filter((entry) => entry?.event === "rate_limited").length,
      moderationActions24h: last24Hours.filter((entry) => String(entry?.event || "").includes("moderated") || entry?.event === "report_reviewed").length
    },
    recentAlerts: alertCandidates.slice(0, 10),
    recentFailures: failureSignals.slice(0, 12),
    recentAuditEntries: recentAuditEntries.slice(0, 20)
  };
}

function validateProductPayload(payload) {
  if (!payload || !isNonEmptyString(payload.id, 8, 80)) {
    return "ID ya bidhaa si sahihi.";
  }
  if (!isNonEmptyString(payload.name, 3, 120)) {
    return "Jina la bidhaa si sahihi.";
  }
  const normalizedPrice = normalizeOptionalPrice(payload.price);
  const hasExplicitPrice = !(payload.price == null || (typeof payload.price === "string" && !payload.price.trim()));
  if (hasExplicitPrice && (normalizedPrice === null || normalizedPrice < 500 || normalizedPrice > 1000000000)) {
    return "Bei ya bidhaa si sahihi.";
  }
  const shopName = typeof payload.shop === "string" && payload.shop.trim()
    ? payload.shop.trim()
    : (payload.uploadedBy || "");
  if (!isNonEmptyString(shopName, 2, 120)) {
    return "Jina la duka si sahihi.";
  }
  if (!isValidWhatsapp(payload.whatsapp || "")) {
    return "Namba ya WhatsApp si sahihi.";
  }
  if (!isSafeIdentifier(payload.uploadedBy, 3, 40)) {
    return "Mmiliki wa bidhaa si sahihi.";
  }
  if (!isValidCategory(payload.category)) {
    return "Category ya bidhaa si sahihi.";
  }
  if (!Array.isArray(payload.images) || payload.images.length === 0 || payload.images.length > MAX_IMAGE_COUNT) {
    return "Idadi ya picha si sahihi.";
  }
  if (!payload.images.every(isValidImageValue)) {
    return "Moja ya picha si sahihi au ni kubwa sana.";
  }
  if (!isValidImageValue(payload.image || "")) {
    return "Picha kuu si sahihi.";
  }
  if (payload.imageSignature && !/^[01]{64}$/.test(payload.imageSignature)) {
    return "Image signature si sahihi.";
  }
  if (payload.originalProductId && !isNonEmptyString(payload.originalProductId, 8, 80)) {
    return "Original product si sahihi.";
  }
  if (payload.originalSellerId && !isSafeIdentifier(payload.originalSellerId, 3, 40)) {
    return "Original seller si sahihi.";
  }
  if (payload.resellerId && !isSafeIdentifier(payload.resellerId, 3, 40)) {
    return "Reseller si sahihi.";
  }
  if (payload.resoldStatus && !["original", "reposted"].includes(payload.resoldStatus)) {
    return "Resold status si sahihi.";
  }
  if (payload.resoldStatus === "reposted" || payload.originalProductId || payload.originalSellerId || payload.resellerId) {
    if (!isNonEmptyString(payload.originalProductId, 8, 80)) {
      return "Original product si sahihi.";
    }
    if (!isSafeIdentifier(payload.originalSellerId, 3, 40)) {
      return "Original seller si sahihi.";
    }
    if (!isSafeIdentifier(payload.resellerId || payload.uploadedBy, 3, 40)) {
      return "Reseller si sahihi.";
    }
    const resalePrice = normalizeOptionalPrice(payload.resalePrice ?? payload.price);
    if (resalePrice === null || resalePrice < 500 || resalePrice > 1000000000) {
      return "Resale price si sahihi.";
    }
  }
  return "";
}

function buildOrdersSummary(store, username) {
  const payments = (store.payments || []).map(normalizePaymentRecord);
  const orders = (store.orders || []).map(normalizeOrderRecord);
  const viewer = getUserByUsername(store, username);
  const hydrateOrder = (order) => {
    const payment = payments.find((item) => item.orderId === order.id);
    if (!payment) {
      return order;
    }

    const buyer = getUserByUsername(store, order.buyerUsername);
    const payerPhoneVisible = order.buyerUsername === username
      || isStaffRole(viewer?.role || "")
      || canViewerSeeUserPhone(buyer, viewer);

    return {
      ...order,
      paymentStatus: payment.paymentStatus,
      transactionId: payment.transactionReference || order.transactionId,
      paymentDate: payment.createdAt,
      payerDetails: {
        ...(payment.payerDetails || {}),
        phoneNumber: payerPhoneVisible ? String(payment?.payerDetails?.phoneNumber || "").replace(/\D/g, "").slice(0, 20) : ""
      }
    };
  };
  return {
    purchases: orders.filter((order) => order.buyerUsername === username).map(hydrateOrder),
    sales: orders.filter((order) => order.sellerUsername === username).map(hydrateOrder)
  };
}

function getOrderById(store, orderId) {
  return (store.orders || []).find((order) => order.id === orderId);
}

function getProductById(store, productId) {
  return (store.products || []).find((product) => product.id === productId);
}

function getPaymentByOrderId(store, orderId) {
  return (store.payments || []).find((payment) => payment.orderId === orderId);
}

function buildMessagesSummary(store, username) {
  return (store.messages || [])
    .map(normalizeMessageRecord)
    .filter((message) => message.senderId === username || message.receiverId === username)
    .sort((first, second) => new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime());
}

function buildAdminMessageThreadSummaries(store) {
  const messages = (store.messages || []).map(normalizeMessageRecord);
  const users = new Map((store.users || []).map((user) => {
    const normalized = normalizeUserRecord(user);
    return [normalized.username, normalized];
  }));
  const reports = (store.reports || []).map(normalizeReportRecord);
  const threadMap = new Map();

  messages.forEach((message) => {
    const conversationId = message.conversationId || buildConversationId(message.senderId, message.receiverId, message.productId || "");
    const existing = threadMap.get(conversationId) || {
      conversationId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      senderName: users.get(message.senderId)?.fullName || message.senderId,
      receiverName: users.get(message.receiverId)?.fullName || message.receiverId,
      productId: message.productId || "",
      productName: message.productName || "",
      messageType: message.messageType || "text",
      messageCount: 0,
      unreadCount: 0,
      lastMessageAt: "",
      lastMessagePreview: "",
      reportCount: 0
    };
    existing.messageCount += 1;
    if (!message.isRead) {
      existing.unreadCount += 1;
    }
    const nextTime = new Date(message.timestamp || message.createdAt || 0).getTime();
    const currentTime = new Date(existing.lastMessageAt || 0).getTime();
    if (!existing.lastMessageAt || nextTime >= currentTime) {
      existing.lastMessageAt = message.timestamp || message.createdAt || "";
      existing.lastMessagePreview = sanitizePlainText(message.message || "", 160);
      existing.messageType = message.messageType || existing.messageType;
      existing.productId = message.productId || existing.productId;
      existing.productName = message.productName || existing.productName;
      existing.senderId = message.senderId;
      existing.receiverId = message.receiverId;
      existing.senderName = users.get(message.senderId)?.fullName || message.senderId;
      existing.receiverName = users.get(message.receiverId)?.fullName || message.receiverId;
    }
    threadMap.set(conversationId, existing);
  });

  return Array.from(threadMap.values())
    .map((thread) => {
      const relatedReports = reports.filter((report) =>
        report.targetUserId === thread.senderId
        || report.targetUserId === thread.receiverId
        || report.targetProductId === thread.productId
        || /message|chat|conversation|abuse|fraud/i.test(`${report.reason || ""} ${report.description || ""}`)
      );
      return {
        ...thread,
        reportCount: relatedReports.length,
        hasReportedContent: relatedReports.length > 0
      };
    })
    .sort((first, second) => new Date(second.lastMessageAt || 0).getTime() - new Date(first.lastMessageAt || 0).getTime());
}

function buildAdminMessageReviewDetails(store, conversationId, reason, reviewerUsername) {
  const normalizedConversationId = sanitizePlainText(conversationId, 160);
  const messages = (store.messages || [])
    .map(normalizeMessageRecord)
    .filter((message) => message.conversationId === normalizedConversationId)
    .sort((first, second) => new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime());
  if (!messages.length) {
    return null;
  }

  const users = new Map((store.users || []).map((user) => {
    const normalized = normalizeUserRecord(user);
    return [normalized.username, normalized];
  }));
  const summary = buildAdminMessageThreadSummaries(store).find((thread) => thread.conversationId === normalizedConversationId) || null;
  const lastMessage = messages[messages.length - 1];
  const participants = {
    sender: users.get(lastMessage.senderId) ? {
      username: lastMessage.senderId,
      fullName: users.get(lastMessage.senderId)?.fullName || lastMessage.senderId,
      role: users.get(lastMessage.senderId)?.role || ""
    } : {
      username: lastMessage.senderId,
      fullName: lastMessage.senderId,
      role: ""
    },
    receiver: users.get(lastMessage.receiverId) ? {
      username: lastMessage.receiverId,
      fullName: users.get(lastMessage.receiverId)?.fullName || lastMessage.receiverId,
      role: users.get(lastMessage.receiverId)?.role || ""
    } : {
      username: lastMessage.receiverId,
      fullName: lastMessage.receiverId,
      role: ""
    }
  };

  return {
    conversationId: normalizedConversationId,
    reason: sanitizePlainText(reason, 240),
    reviewedBy: sanitizePlainText(reviewerUsername, 40),
    reviewedAt: new Date().toISOString(),
    participants,
    summary: summary || {
      conversationId: normalizedConversationId,
      senderId: lastMessage.senderId,
      receiverId: lastMessage.receiverId,
      productId: lastMessage.productId || "",
      productName: lastMessage.productName || "",
      messageCount: messages.length,
      unreadCount: messages.filter((message) => !message.isRead).length,
      lastMessageAt: lastMessage.timestamp || lastMessage.createdAt || "",
      lastMessagePreview: sanitizePlainText(lastMessage.message || "", 160),
      reportCount: 0,
      hasReportedContent: false
    },
    messages: messages.map((message) => ({
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      productId: message.productId || "",
      productName: message.productName || "",
      messageType: message.messageType || "text",
      message: message.message || "",
      timestamp: message.timestamp || "",
      createdAt: message.createdAt || "",
      updatedAt: message.updatedAt || "",
      deliveredAt: message.deliveredAt || "",
      readAt: message.readAt || "",
      isDelivered: Boolean(message.isDelivered),
      isRead: Boolean(message.isRead)
    }))
  };
}

function buildNotificationsSummary(store, username) {
  return (store.notifications || [])
    .map(normalizeNotificationRecord)
    .filter((notification) => notification.userId === username)
    .sort((first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime());
}

function getPromotionDisplayStatus(promotion, now = Date.now()) {
  const normalized = normalizePromotionRecord(promotion);
  if (normalized.status === "disabled") {
    return "disabled";
  }
  if (normalized.status === "rejected") {
    return "rejected";
  }
  if (normalized.status === "pending") {
    return "pending";
  }
  if (normalized.paymentStatus !== "paid") {
    return "pending";
  }
  if (new Date(normalized.endDate || 0).getTime() <= now) {
    return "expired";
  }
  return normalized.status === "active" ? "active" : normalized.status;
}

function buildPromotionsSummary(store, options = {}) {
  const now = Date.now();
  const username = options.username || "";
  const productId = options.productId || "";
  const admin = Boolean(options.admin);
  return (store.promotions || [])
    .map(normalizePromotionRecord)
    .map((promotion) => ({
      ...promotion,
      status: getPromotionDisplayStatus(promotion, now)
    }))
    .filter((promotion) => admin || !username || promotion.sellerUsername === username)
    .filter((promotion) => !productId || promotion.productId === productId)
    .sort((first, second) => new Date(second.createdAt || 0).getTime() - new Date(first.createdAt || 0).getTime());
}

function buildConversationId(senderId, receiverId) {
  return [senderId, receiverId].filter(Boolean).sort().join("::");
}

function getConversationParticipantsMatch(message, firstUser, secondUser) {
  const normalized = normalizeMessageRecord(message);
  return [normalized.senderId, normalized.receiverId].sort().join("::") === [firstUser, secondUser].sort().join("::");
}

function notificationBelongsToUserPair(store, notification, username, withUser) {
  const targetMessageId = sanitizePlainText(notification.messageId, 80);
  if (!targetMessageId) {
    return false;
  }
  const matchingMessage = (store.messages || [])
    .map(normalizeMessageRecord)
    .find((message) => message.id === targetMessageId);
  return matchingMessage ? getConversationParticipantsMatch(matchingMessage, username, withUser) : false;
}

function markConversationRead(store, username, withUser) {
  const now = new Date().toISOString();
  const conversationId = buildConversationId(username, withUser);
  let didChange = false;

  const messages = (store.messages || []).map((message) => {
    const normalized = normalizeMessageRecord(message);
    if (
      getConversationParticipantsMatch(normalized, username, withUser)
      && normalized.receiverId === username
      && !normalized.isRead
    ) {
      didChange = true;
      return normalizeMessageRecord({
        ...normalized,
        isRead: true,
        readAt: now,
        updatedAt: now
      });
    }
    return normalized;
  });

  const notifications = (store.notifications || []).map((notification) => {
    const normalized = normalizeNotificationRecord(notification);
    if (
      normalized.userId === username
      && normalized.type === "message"
      && !normalized.isRead
      && notificationBelongsToUserPair(store, normalized, username, withUser)
    ) {
      didChange = true;
      return normalizeNotificationRecord({
        ...normalized,
        isRead: true,
        readAt: now
      });
    }
    return normalized;
  });

  return {
    didChange,
    store: didChange ? { ...store, messages, notifications } : store,
    conversationId,
    readAt: now
  };
}

function buildReviewSummary(store, productId = "") {
  const source = (store.reviews || []).map(normalizeReviewRecord);
  const reviews = productId ? source.filter((review) => review.productId === productId) : source;
  const totalReviews = reviews.length;
  const averageRating = totalReviews
    ? Number((reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / totalReviews).toFixed(1))
    : 0;

  return {
    averageRating,
    totalReviews,
    reviews: reviews
      .slice()
      .sort((first, second) => new Date(second.date || 0).getTime() - new Date(first.date || 0).getTime())
  };
}

function getUserByUsername(store, username) {
  return (store.users || []).find((user) => user.username === username);
}

function registerLiveClient(username, res) {
  if (!liveClients.has(username)) {
    liveClients.set(username, new Set());
  }
  liveClients.get(username).add(res);
}

function removeLiveClient(username, res) {
  const clients = liveClients.get(username);
  if (!clients) {
    return;
  }
  clients.delete(res);
  if (!clients.size) {
    liveClients.delete(username);
  }
}

function emitLiveEvent(username, eventName, payload) {
  const clients = liveClients.get(username);
  if (!clients?.size) {
    return;
  }

  const chunk = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((res) => {
    try {
      res.write(chunk);
    } catch (error) {
      removeLiveClient(username, res);
    }
  });
}

function ensureMarketplaceUser(store, session, res, options = {}) {
  if (!session) {
    sendJson(res, 401, { error: "Session imeisha au si sahihi." });
    return null;
  }

  const user = getUserByUsername(store, session.username);
  if (!user) {
    sendJson(res, 401, { error: "Session user hakupatikana." });
    return null;
  }

  if (!options.allowRestricted && isRestrictedUserStatus(user.status)) {
    sendJson(res, 403, { error: getUserRestrictionMessage(user.status) });
    return null;
  }

  if (!options.allowStaff && isStaffRole(user.role)) {
    sendJson(res, 403, { error: "Staff accounts hutumia admin access route na admin actions pekee." });
    return null;
  }

  return user;
}

function hasDeliveredOrder(store, productId) {
  return (store.orders || []).some((order) => order.productId === productId && order.status === "delivered");
}

function canBuyerCancelOrder(order, session) {
  const isBuyer = order.buyerUsername === session.username;
  if (!isBuyer || order.status !== "placed" || order.paymentStatus !== "pending") {
    return false;
  }

  return Date.now() - new Date(order.createdAt || 0).getTime() >= BUYER_CANCEL_WINDOW_MS;
}

function canUpdateOrderStatus(order, session, nextStatus) {
  const isBuyer = order.buyerUsername === session.username;
  const isSeller = order.sellerUsername === session.username;
  const pendingVerification = order.status === "placed"
    && order.paymentStatus === "pending"
    && (order.paymentIntentStatus || "submitted") === "submitted";

  if (nextStatus === "paid") {
    return isSeller && pendingVerification;
  }

  if (nextStatus === "confirmed") {
    return isSeller && order.status === "paid" && order.paymentStatus === "paid";
  }

  if (nextStatus === "delivered") {
    return isBuyer && order.status === "confirmed";
  }

  if (nextStatus === "cancelled") {
    return canBuyerCancelOrder(order, session) || (isSeller && pendingVerification);
  }

  return false;
}

function updateOrderAndPaymentFromPaymentResult(store, orderId, paymentStatus, context = {}) {
  const existingOrder = getOrderById(store, orderId);
  const existingPayment = getPaymentByOrderId(store, orderId);

  if (!existingOrder || !existingPayment) {
    return store;
  }

  const normalizedPaymentStatus = isValidPaymentStatus(paymentStatus) ? paymentStatus : "pending";
  let nextOrderStatus = existingOrder.status;
  if (normalizedPaymentStatus === "paid") {
    nextOrderStatus = "paid";
  } else if (normalizedPaymentStatus === "failed" || normalizedPaymentStatus === "cancelled") {
    nextOrderStatus = "cancelled";
  }

  const now = new Date().toISOString();
  const updatedPayment = normalizePaymentRecord({
    ...existingPayment,
    paymentStatus: normalizedPaymentStatus,
    rawGatewayResponse: context.rawGatewayResponse || existingPayment.rawGatewayResponse,
    updatedAt: now
  });
  const updatedOrder = normalizeOrderRecord({
    ...existingOrder,
    status: nextOrderStatus,
    paymentStatus: normalizedPaymentStatus,
    paymentConfirmedAt: normalizedPaymentStatus === "paid" ? now : existingOrder.paymentConfirmedAt,
    paymentConfirmedBy: normalizedPaymentStatus === "paid" ? "system" : existingOrder.paymentConfirmedBy
  });
  const nextOrders = (store.orders || []).map((order) => order.id === orderId ? updatedOrder : normalizeOrderRecord(order));
  const nextAvailability = deriveProductAvailabilityFromOrders(nextOrders, existingOrder.productId);

  return {
    ...store,
    orders: nextOrders,
    payments: (store.payments || []).map((payment) => payment.orderId === orderId ? updatedPayment : normalizePaymentRecord(payment)),
    products: (store.products || []).map((product) =>
      product.id === existingOrder.productId
        ? { ...product, availability: nextAvailability, updatedAt: now }
        : product
    )
  };
}

function validateClientEventPayload(payload) {
  const allowedLevels = ["info", "warn", "error"];
  const allowedAlertSeverities = ["low", "medium", "high", "critical"];
  if (!payload || !allowedLevels.includes(payload.level)) {
    return "Client event level si sahihi.";
  }
  if (!isNonEmptyString(payload.event, 3, 80)) {
    return "Client event si sahihi.";
  }
  if (payload.message && !isNonEmptyString(payload.message, 3, 300)) {
    return "Client event message si sahihi.";
  }
  if (payload.category && !isNonEmptyString(payload.category, 2, 40)) {
    return "Client event category si sahihi.";
  }
  if (payload.alertSeverity && !allowedAlertSeverities.includes(String(payload.alertSeverity))) {
    return "Client event alert severity si sahihi.";
  }
  if (payload.fingerprint && !isNonEmptyString(payload.fingerprint, 3, 120)) {
    return "Client event fingerprint si sahihi.";
  }
  if (payload.context && (typeof payload.context !== "object" || Array.isArray(payload.context))) {
    return "Client event context si sahihi.";
  }
  return "";
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;
    const cleanup = () => {
      req.removeListener("data", handleData);
      req.removeListener("end", handleEnd);
      req.removeListener("error", handleError);
    };
    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      try {
        req.pause?.();
      } catch (pauseError) {
        // Ignore pause failures while aborting oversized bodies.
      }
      try {
        req.resume?.();
      } catch (resumeError) {
        // Ignore resume failures while draining the socket safely.
      }
      reject(error);
    };
    const handleData = (chunk) => {
      if (settled) {
        return;
      }
      totalBytes += chunk.length;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        const error = new Error("PAYLOAD_TOO_LARGE");
        error.code = "PAYLOAD_TOO_LARGE";
        error.status = 413;
        error.totalBytes = totalBytes;
        fail(error);
        return;
      }
      chunks.push(chunk);
    };
    const handleEnd = () => {
      if (settled) {
        return;
      }
      const raw = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
      try {
        const parsedBody = raw ? JSON.parse(raw) : null;
        settled = true;
        cleanup();
        resolve(parsedBody);
      } catch (error) {
        error.code = "INVALID_JSON";
        error.status = 400;
        fail(error);
      }
    };
    const handleError = (error) => {
      fail(error);
    };
    req.on("data", handleData);
    req.on("end", handleEnd);
    req.on("error", handleError);
  });
}

function isJsonContentType(contentType) {
  const mediaType = String(contentType || "").split(";")[0].trim().toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function requiresJsonRequestBody(req, pathname) {
  const method = String(req.method || "GET").toUpperCase();
  if (!pathname.startsWith("/api/")) {
    return false;
  }
  if (!["POST", "PUT", "PATCH"].includes(method)) {
    return false;
  }
  if (isBodylessApiActionPath(method, pathname)) {
    return false;
  }
  return true;
}

function isBodylessApiActionPath(method, pathname) {
  if (method === "POST" && pathname === "/api/auth/logout") {
    return true;
  }
  if (method === "PATCH" && /^\/api\/admin\/promotions\/[^/]+\/disable$/.test(pathname)) {
    return true;
  }
  if (method === "PATCH" && /^\/api\/notifications\/[^/]+\/read$/.test(pathname)) {
    return true;
  }
  return false;
}

function validateJsonRequestContentType(req, pathname) {
  if (!requiresJsonRequestBody(req, pathname)) {
    return { ok: true };
  }
  if (isJsonContentType(req.headers["content-type"])) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: "unsupported_media_type"
  };
}

function getClientIp(req) {
  if (TRUST_PROXY_HEADERS) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      const forwardedIp = normalizeClientIp(forwarded.split(",")[0].trim());
      if (forwardedIp) {
        return forwardedIp;
      }
    }
  }
  return normalizeClientIp(req.socket.remoteAddress || "") || "unknown";
}

function getRateLimitIdentity(req, store) {
  const token = readAuthToken(req);
  if (token) {
    const session = findSession(store, token);
    if (session?.username) {
      return `user:${session.username}`;
    }
  }
  return `ip:${getClientIp(req)}`;
}

function getRateLimitRule(pathname) {
  if (RATE_LIMIT_RULES[pathname]) {
    return {
      ...RATE_LIMIT_RULES[pathname],
      key: pathname
    };
  }
  if (pathname.startsWith("/api/products/")) {
    return {
      ...RATE_LIMIT_RULES["/api/products"],
      key: "/api/products"
    };
  }
  if (/^\/api\/admin\/users\/[^/]+\/moderation$/.test(pathname)) {
    return {
      limit: 18,
      windowMs: RATE_LIMIT_WINDOW_MS,
      key: "/api/admin/users/:username/moderation"
    };
  }
  if (/^\/api\/admin\/products\/[^/]+\/moderate$/.test(pathname)) {
    return {
      limit: 24,
      windowMs: RATE_LIMIT_WINDOW_MS,
      key: "/api/admin/products/:id/moderate"
    };
  }
  if (/^\/api\/admin\/reports\/[^/]+$/.test(pathname)) {
    return {
      limit: 20,
      windowMs: RATE_LIMIT_WINDOW_MS,
      key: "/api/admin/reports/:id"
    };
  }
  if (/^\/api\/admin\/promotions\/[^/]+\/disable$/.test(pathname)) {
    return {
      limit: 12,
      windowMs: RATE_LIMIT_WINDOW_MS,
      key: "/api/admin/promotions/:id/disable"
    };
  }
  if (/^\/api\/admin\/promotions\/[^/]+\/review$/.test(pathname)) {
    return {
      limit: 16,
      windowMs: RATE_LIMIT_WINDOW_MS,
      key: "/api/admin/promotions/:id/review"
    };
  }
  if (/^\/api\/notifications\/[^/]+\/read$/.test(pathname)) {
    return {
      limit: 40,
      windowMs: RATE_LIMIT_WINDOW_MS,
      key: "/api/notifications/:id/read"
    };
  }
  return null;
}

function pruneRateLimitStore(now = Date.now()) {
  if (rateLimitStore.size <= RATE_LIMIT_MAX_BUCKETS) {
    return;
  }
  for (const [key, timestamps] of rateLimitStore.entries()) {
    const fresh = (Array.isArray(timestamps) ? timestamps : []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
    if (fresh.length) {
      rateLimitStore.set(key, fresh);
    } else {
      rateLimitStore.delete(key);
    }
  }
  while (rateLimitStore.size > RATE_LIMIT_MAX_BUCKETS) {
    const oldestKey = rateLimitStore.keys().next().value;
    if (!oldestKey) {
      break;
    }
    rateLimitStore.delete(oldestKey);
  }
}

function evaluateRateLimit(req, store) {
  if (process.env.WINGA_DISABLE_RATE_LIMIT === "1") {
    return { limited: false };
  }
  const rule = getRateLimitRule(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (!rule) {
    return { limited: false };
  }

  const identity = getRateLimitIdentity(req, store);
  const key = `${identity}:${req.method}:${rule.key}`;
  const now = Date.now();
  const existing = rateLimitStore.get(key) || [];
  const fresh = existing.filter((timestamp) => now - timestamp < rule.windowMs);
  fresh.push(now);
  rateLimitStore.set(key, fresh);
  pruneRateLimitStore(now);
  const limited = fresh.length > rule.limit;
  const retryAfterMs = limited ? Math.max(1000, rule.windowMs - (now - fresh[0])) : 0;
  return {
    limited,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - fresh.length),
    retryAfterSeconds: retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 0
  };
}

http.createServer(async (req, res) => {
  res.__wingaReq = req;
  const requestMeta = {
    requestId: createRequestId(),
    route: "",
    method: req.method || "GET",
    startedAt: Date.now(),
    cfRay: String(req.headers["cf-ray"] || "").trim(),
    statusCode: 200
  };
  res.__wingaMeta = requestMeta;
  if (req.method === "OPTIONS") {
    res.writeHead(204, buildSecurityHeaders(204, {}, req));
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  requestMeta.route = url.pathname;

  if (req.method === "GET" && url.pathname === "/health") {
    requestMeta.statusCode = 200;
    logRouteSummary(requestMeta, { lightweight: true });
    sendJson(res, 200, {
      ok: true,
      time: new Date().toISOString(),
      environment: NODE_ENV
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    requestMeta.statusCode = 200;
    logRouteSummary(requestMeta, {
      lightweight: true,
      storageMode: runtimeConfiguration.storageMode
    });
    sendJson(res, 200, {
      ok: true,
      time: new Date().toISOString(),
      environment: NODE_ENV,
      storageMode: runtimeConfiguration.storageMode,
      configWarningsCount: runtimeConfiguration.warnings.length
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/csrf-token") {
    const csrfToken = createCsrfToken();
    sendJson(
      res,
      200,
      {
        csrfToken,
        expiresInSeconds: Math.floor(CSRF_TOKEN_TTL_MS / 1000)
      },
      {
        "Cache-Control": "no-store",
        "Set-Cookie": buildCsrfCookieHeader(csrfToken, req)
      }
    );
    return;
  }

  const originStatus = validateUnsafeApiOrigin(req, url.pathname);
  if (!originStatus.ok) {
    requestMeta.statusCode = 403;
    logRouteSummary(requestMeta, {
      origin: "blocked"
    });
    sendJson(res, 403, {
      error: "Origin hairuhusiwi kwa request hii.",
      code: "origin_not_allowed"
    });
    return;
  }

  const csrfStatus = validateCsrfRequest(req, url.pathname);
  if (!csrfStatus.ok) {
    requestMeta.statusCode = 403;
    logRouteSummary(requestMeta, {
      csrf: csrfStatus.reason || "blocked"
    });
    sendJson(res, 403, {
      error: "CSRF token haipo au si sahihi.",
      code: "csrf_failed"
    });
    return;
  }

  const jsonContentTypeStatus = validateJsonRequestContentType(req, url.pathname);
  if (!jsonContentTypeStatus.ok) {
    requestMeta.statusCode = 415;
    logRouteSummary(requestMeta, {
      bodyContract: jsonContentTypeStatus.reason || "unsupported_media_type"
    });
    sendJson(res, 415, {
      error: "Content-Type lazima iwe application/json kwa request hii.",
      code: "unsupported_media_type"
    });
    return;
  }

  const shouldLogRouteMemory = url.pathname === "/api/bootstrap"
    || url.pathname === "/api/products"
    || url.pathname === "/api/auth/login"
    || url.pathname === "/api/auth/signup"
    || url.pathname === "/api/auth/admin-login"
    || url.pathname === "/api/auth/session";
  if (shouldLogRouteMemory) {
    logRouteMemoryStage(requestMeta, "before_read_store");
  }
  let store = migrateLegacyStore(cleanupSessions(await readStore())).store;
  if (shouldLogRouteMemory) {
    logRouteMemoryStage(requestMeta, "after_read_store", {
      users: Array.isArray(store?.users) ? store.users.length : 0,
      products: Array.isArray(store?.products) ? store.products.length : 0,
      sessions: Array.isArray(store?.sessions) ? store.sessions.length : 0
    });
  }
  const clientIp = getClientIp(req);

  const rateLimitStatus = evaluateRateLimit(req, store);
  if (rateLimitStatus.limited) {
    await appendAuditLog({
      time: new Date().toISOString(),
      ip: clientIp,
      method: req.method,
      path: url.pathname,
      event: "rate_limited"
    });
    sendJson(
      res,
      429,
      { error: "Majaribio ni mengi sana, subiri kidogo ujaribu tena.", code: "rate_limited" },
      {
        "Retry-After": String(rateLimitStatus.retryAfterSeconds || 60),
        "X-RateLimit-Limit": String(rateLimitStatus.limit || ""),
        "X-RateLimit-Remaining": "0"
      }
    );
    return;
  }

  try {
    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/__winga-image__") {
      const target = resolveProxyImageTarget(url.searchParams.get("u") || "", req);
      if (!target || !fs.existsSync(target.filePath)) {
        sendJson(res, 404, { error: "Picha haijapatikana." });
        return;
      }

      res.writeHead(200, buildPublicImageHeaders(target.filePath, target.contentType, req, "public, max-age=31536000, immutable"));
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      fs.createReadStream(target.filePath).pipe(res);
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname.startsWith("/uploads/")) {
      const filePath = getLocalUploadFilePath(url.pathname);
      if (!filePath || !filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath)) {
        sendJson(res, 404, { error: "Picha haijapatikana." });
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      const contentTypes = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif"
      };

      res.writeHead(200, buildPublicImageHeaders(filePath, contentTypes[extension] || "application/octet-stream", req));
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && ["/share-og.svg", "/winga-icon.svg", "/winga-maskable-icon.svg"].includes(url.pathname)) {
      const filePath = path.join(PUBLIC_DIR, path.basename(url.pathname));
      if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
        sendJson(res, 404, { error: "Asset haijapatikana." });
        return;
      }
      res.writeHead(200, buildSecurityHeaders(200, {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600"
      }, req));
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const productDeepLinkMatch = url.pathname.match(/^\/product\/([^/]+)\/?$/);
    if (req.method === "GET" && productDeepLinkMatch) {
      const productId = decodeURIComponent(productDeepLinkMatch[1] || "").trim();
      const origin = getPublicRequestOrigin(req);
      const assetOrigin = getProductShareAssetOrigin(req);
      const canonicalUrl = `${origin}/product/${encodeURIComponent(productId)}`;
      const foundProduct = productId ? getProductById(store, productId) : null;
      const product = foundProduct ? repairNormalizedProductImageState(foundProduct) : null;
      const crawlerRequest = isCrawlerRequest(req);

      if (!product) {
        await appendAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "product_deep_link_missing",
          productId,
          crawler: crawlerRequest
        }).catch(() => {});
        const fallbackHtml = buildProductShareHtml({
          title: "Bidhaa haijapatikana | Winga",
          description: "Bidhaa hii haijapatikana kwenye Winga.",
          canonicalUrl,
          imageUrl: ""
        }).replace(/<body>/i, `<body><main style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:24px;text-align:center;color:#111;"><div><h1>Bidhaa haijapatikana</h1><p>Jaribu product nyingine au rudi Home.</p></div></main>`);
        sendHtml(res, 404, fallbackHtml, req, { "Cache-Control": "no-store" });
        return;
      }

      const shareHtml = buildProductShareHtml({
        title: getProductShareTitle(product),
        description: getProductShareDescription(product),
        canonicalUrl,
        imageUrl: appendImageVersion(
          getProductShareImageUrl(product, origin, assetOrigin),
          getProductShareImageVersion(product)
        )
      });
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "product_deep_link_resolved",
        productId,
        crawler: crawlerRequest
      }).catch(() => {});
      sendHtml(res, 200, shareHtml, req, { "Cache-Control": "no-store" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/bootstrap") {
      logRouteMemoryStage(requestMeta, "before_bootstrap_build");
      const visibleProducts = buildVisibleProducts(store, null);
      const bootstrapPage = paginateProducts(visibleProducts, {
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset"),
        maxLimit: MAX_BOOTSTRAP_PRODUCT_LIMIT,
        fallbackLimit: DEFAULT_BOOTSTRAP_PRODUCT_LIMIT
      });
      const bootstrapProducts = bootstrapPage.items
        .map(toProductListItem)
        .filter(Boolean);
      logRouteMemoryStage(requestMeta, "after_bootstrap_build", {
        returnedProducts: bootstrapProducts.length,
        totalProducts: bootstrapPage.total
      });
      requestMeta.statusCode = 200;
      logRouteSummary(requestMeta, {
        returnedProducts: bootstrapProducts.length,
        totalProducts: bootstrapPage.total,
        hasMore: bootstrapPage.hasMore
      });
      sendJson(res, 200, {
        categories: store.categories || [],
        products: bootstrapProducts,
        pagination: {
          offset: bootstrapPage.offset,
          limit: bootstrapPage.limit,
          total: bootstrapPage.total,
          hasMore: bootstrapPage.hasMore
        }
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/messages/stream") {
      const token = readAuthToken(req) || sanitizePlainText(url.searchParams.get("token") || "", 120);
      const session = findSession(store, token);
      const user = ensureMarketplaceUser(store, session, res);
      if (!user) {
        return;
      }

      res.writeHead(200, buildSecurityHeaders(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      }, req));
      res.write(`event: welcome\ndata: ${JSON.stringify({ ok: true, time: new Date().toISOString() })}\n\n`);
      registerLiveClient(user.username, res);

      const heartbeat = setInterval(() => {
        try {
          res.write(`event: ping\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
        } catch (error) {
          clearInterval(heartbeat);
          removeLiveClient(user.username, res);
        }
      }, 25000);

      req.on("close", () => {
        clearInterval(heartbeat);
        removeLiveClient(user.username, res);
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      const token = readAuthToken(req);
      const session = token ? findSession(store, token) : null;
      const viewer = session ? getUserByUsername(store, session.username) : null;
      sendJson(res, 200, buildVisibleUsers(store, viewer));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/users") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        await denyJson(res, 401, "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_users_denied",
          reason: "missing_or_invalid_session"
        });
        return;
      }

      if (!canModerateSession(session)) {
        await denyJson(res, 403, "Hii area ni ya admin au moderator tu.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_users_denied",
          username: session.username,
          reason: "insufficient_role"
        });
        return;
      }

      sendJson(
        res,
        200,
        (store.users || []).map((user) => ({
          ...(isAdminSession(session) ? sanitizeAdminUser(user) : sanitizeModeratorUser(user)),
          ...buildAdminUserSummary(store, user)
        }))
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/reports") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        await denyJson(res, 401, "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_reports_denied",
          reason: "missing_or_invalid_session"
        });
        return;
      }
      if (!canModerateSession(session)) {
        await denyJson(res, 403, "Hii area ni ya admin au moderator tu.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_reports_denied",
          username: session.username,
          reason: "insufficient_role"
        });
        return;
      }

      const statusFilter = url.searchParams.get("status") || "";
      const reports = (store.reports || [])
        .map(normalizeReportRecord)
        .filter((report) => !statusFilter || report.status === statusFilter);
      sendJson(res, 200, reports);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/moderation-actions") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        await denyJson(res, 401, "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "moderation_actions_denied",
          reason: "missing_or_invalid_session"
        });
        return;
      }
      if (!isAdminSession(session)) {
        await denyJson(res, 403, "Hii area ni ya admin tu.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "moderation_actions_denied",
          username: session.username,
          reason: "insufficient_role"
        });
        return;
      }

      sendJson(res, 200, (store.moderationActions || []).map(normalizeModerationActionRecord));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/ops/summary") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        await denyJson(res, 401, "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_ops_denied",
          reason: "missing_or_invalid_session"
        });
        return;
      }
      if (!isAdminSession(session)) {
        await denyJson(res, 403, "Hii area ni ya admin tu.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_ops_denied",
          username: session.username,
          reason: "insufficient_role"
        });
        return;
      }

      sendJson(res, 200, await buildOpsSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/messages") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        await denyJson(res, 401, "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_messages_denied",
          reason: "missing_or_invalid_session"
        });
        return;
      }
      if (!isAdminSession(session)) {
        await denyJson(res, 403, "Hii area ni ya admin tu.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_messages_denied",
          username: session.username,
          reason: "insufficient_role"
        });
        return;
      }
      sendJson(res, 200, buildAdminMessageThreadSummaries(store));
      return;
    }

    if (req.method === "POST" && /^\/api\/admin\/messages\/[^/]+\/review$/.test(url.pathname)) {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session || !isAdminSession(session)) {
        await denyJson(res, session ? 403 : 401, session
          ? "Message review inaruhusiwa kwa admin mkuu tu."
          : "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_message_review_denied",
          username: session?.username || "",
          reason: !session ? "missing_or_invalid_session" : "insufficient_role"
        });
        return;
      }

      const conversationId = sanitizePlainText(decodeURIComponent(url.pathname.split("/")[4] || ""), 160);
      const payload = await collectBody(req);
      const requiresReason = normalizeAppSettings(store.settings || DEFAULT_APP_SETTINGS).messageReviewRequiresReason !== false;
      const reason = sanitizePlainText(payload?.reason, 240);
      if (requiresReason && !reason) {
        sendJson(res, 400, { error: "Weka sababu ya kufungua message content." });
        return;
      }

      const review = buildAdminMessageReviewDetails(store, conversationId, reason, session.username);
      if (!review) {
        sendJson(res, 404, { error: "Conversation haijapatikana." });
        return;
      }

      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "admin_message_thread_viewed",
        adminUsername: session.username,
        conversationId,
        reason,
        messageCount: review.messages.length,
        participants: {
          senderId: review.participants?.sender?.username || "",
          receiverId: review.participants?.receiver?.username || ""
        }
      });
      sendJson(res, 200, review);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/settings") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session || !isAdminSession(session)) {
        await denyJson(res, session ? 403 : 401, session
          ? "Admin settings ni za admin mkuu tu."
          : "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_settings_denied",
          username: session?.username || "",
          reason: !session ? "missing_or_invalid_session" : "insufficient_role"
        });
        return;
      }
      sendJson(res, 200, buildPublicAppSettings(store.settings || DEFAULT_APP_SETTINGS));
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/admin/settings") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session || !isAdminSession(session)) {
        await denyJson(res, session ? 403 : 401, session
          ? "Admin settings ni za admin mkuu tu."
          : "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_settings_denied",
          username: session?.username || "",
          reason: !session ? "missing_or_invalid_session" : "insufficient_role"
        });
        return;
      }

      const payload = await collectBody(req);
      const validationError = validateAppSettingsPayload(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const nextSettings = normalizeAppSettings({
        ...(store.settings || DEFAULT_APP_SETTINGS),
        ...(typeof payload.heroSectionVisible === "boolean" ? { heroSectionVisible: payload.heroSectionVisible } : {}),
        ...(typeof payload.standaloneShowcaseVisible === "boolean" ? { standaloneShowcaseVisible: payload.standaloneShowcaseVisible } : {}),
        ...(typeof payload.splashScreenVisible === "boolean" ? { splashScreenVisible: payload.splashScreenVisible } : {}),
        ...(typeof payload.requireExplicitSignOut === "boolean" ? { requireExplicitSignOut: payload.requireExplicitSignOut } : {}),
        ...(typeof payload.messageReviewRequiresReason === "boolean" ? { messageReviewRequiresReason: payload.messageReviewRequiresReason } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "sessionExpiryMinutes") ? { sessionExpiryMinutes: Number.parseInt(payload.sessionExpiryMinutes, 10) } : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "cachePolicy") ? { cachePolicy: sanitizePlainText(payload.cachePolicy, 24).toLowerCase() } : {}),
        updatedAt: new Date().toISOString(),
        updatedBy: session.username
      });

      store = {
        ...store,
        settings: nextSettings
      };
      await writeStore(store);
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "app_settings_updated",
        adminUsername: session.username,
        settings: buildPublicAppSettings(nextSettings)
      });
      sendJson(res, 200, buildPublicAppSettings(nextSettings));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/categories") {
      sendJson(res, 200, store.categories || mergeCategories());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/settings") {
      sendJson(res, 200, buildPublicAppSettings(store.settings || DEFAULT_APP_SETTINGS));
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/users") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session || !isAdminSession(session)) {
        await denyJson(res, 403, "Action hii inahitaji admin.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_users_bulk_save_denied",
          username: session?.username || ""
        });
        return;
      }
      const users = await collectBody(req);
      await writeStore({ ...store, users: Array.isArray(users) ? users.map(normalizeUserRecord) : [] });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && /^\/api\/admin\/users\/[^/]+\/investigation$/.test(url.pathname)) {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session || !isAdminSession(session)) {
        await denyJson(res, session ? 403 : 401, session
          ? "Fraud review inaruhusiwa kwa admin mkuu tu."
          : "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "user_investigation_denied",
          username: session?.username || "",
          reason: !session ? "missing_or_invalid_session" : "insufficient_role"
        });
        return;
      }

      const targetUsername = normalizeIdentifier(decodeURIComponent(url.pathname.split("/")[4] || ""), 40);
      const payload = await collectBody(req);
      const validationError = validateInvestigationRequestPayload(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const targetUser = getUserByUsername(store, targetUsername);
      if (!targetUser) {
        sendJson(res, 404, { error: "User hakupatikana." });
        return;
      }

      const now = new Date().toISOString();
      const reason = sanitizePlainText(payload.reason, 240);
      const investigation = await buildAdminUserInvestigation(store, targetUser, { reason });
      await appendAuditLog({
        time: now,
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "user_investigation_viewed",
        adminUsername: session.username,
        username: session.username,
        targetUserId: targetUsername,
        reason,
        actionType: "fraud_review"
      });
      sendJson(res, 200, investigation);
      return;
    }

    if (req.method === "PATCH" && /^\/api\/admin\/users\/[^/]+\/moderation$/.test(url.pathname)) {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session || !canModerateSession(session)) {
        await denyJson(res, 403, "Action hii inahitaji admin au moderator.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "user_moderation_denied",
          username: session?.username || "",
          reason: !session ? "missing_or_invalid_session" : "insufficient_role"
        });
        return;
      }

      const targetUsername = normalizeIdentifier(decodeURIComponent(url.pathname.split("/")[4] || ""), 40);
      const payload = await collectBody(req);
      const validationError = validateUserModerationPayload(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      if (targetUsername === getAdminSeedIdentity().username) {
        sendJson(res, 400, { error: "Admin mkuu hawezi kubadilishwa status hapa." });
        return;
      }

      const targetUser = getUserByUsername(store, targetUsername);
      if (!targetUser) {
        sendJson(res, 404, { error: "User hakupatikana." });
        return;
      }

      const requestedStatusChange = typeof payload.status === "string" && payload.status !== targetUser.status;
      const requestedVerificationUpdate = Boolean(payload.verificationStatus) || typeof payload.verifiedSeller === "boolean";
      const requestedRoleChange = typeof payload.role === "string" && payload.role.trim() && payload.role.trim().toLowerCase() !== targetUser.role;
      const requestedDelete = payload.deleteUser === true;
      if (requestedVerificationUpdate && targetUser.role !== "seller") {
        sendJson(res, 400, { error: "Verification review inaruhusiwa kwa seller accounts tu." });
        return;
      }
      if (!isAdminSession(session) && (requestedStatusChange || requestedRoleChange || requestedDelete)) {
        await denyJson(res, 403, "Moderator anaweza kureview verification tu. Kususpend au kuban ni admin pekee.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "user_moderation_denied",
          username: session.username,
          targetUserId: targetUsername,
          reason: requestedRoleChange || requestedDelete ? "moderator_role_or_delete_blocked" : "moderator_status_change_blocked"
        });
        return;
      }
      if (!isAdminSession(session) && !requestedVerificationUpdate) {
        await denyJson(res, 403, "Moderator anaweza kupokea malalamiko na kureview verification ya user mpya tu.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "user_moderation_denied",
          username: session.username,
          targetUserId: targetUsername,
          reason: "moderator_invalid_action"
        });
        return;
      }
      if (requestedDelete && !isNonEmptyString(payload.reason, 3, 120)) {
        sendJson(res, 400, { error: "Weka sababu ya kufuta akaunti." });
        return;
      }
      if (requestedRoleChange && !["buyer", "seller"].includes(String(payload.role || "").trim().toLowerCase())) {
        sendJson(res, 400, { error: "Role ya user si sahihi." });
        return;
      }

      const now = new Date().toISOString();
      const nextVerificationStatus = payload.verificationStatus
        || (typeof payload.verifiedSeller === "boolean"
          ? (payload.verifiedSeller ? "verified" : (targetUser.verificationStatus === "verified" ? "pending" : targetUser.verificationStatus || "unverified"))
          : targetUser.verificationStatus);
      const nextRole = requestedRoleChange ? String(payload.role || "").trim().toLowerCase() : targetUser.role;
      const nextStatus = requestedDelete ? "deactivated" : (requestedStatusChange ? payload.status : targetUser.status);
      const roleResetFields = requestedRoleChange ? (nextRole === "buyer"
        ? {
          verifiedSeller: false,
          verificationStatus: "",
          verificationSubmittedAt: null,
          identityDocumentType: "",
          identityDocumentNumber: "",
          identityDocumentImage: "",
          nationalId: null,
          primaryCategory: ""
        }
        : {
          verifiedSeller: false,
          verificationStatus: "unverified",
          verificationSubmittedAt: targetUser.verificationSubmittedAt || null
        }) : {};
      const updatedUser = normalizeUserRecord({
        ...targetUser,
        role: nextRole,
        status: nextStatus,
        moderationReason: requestedDelete
          ? (payload.reason || "deleted_by_admin")
          : (requestedStatusChange ? (payload.reason || "") : (payload.reason || targetUser.moderationReason || "")),
        moderationNote: payload.note || targetUser.moderationNote || "",
        verifiedSeller: typeof payload.verifiedSeller === "boolean"
          ? payload.verifiedSeller
          : nextVerificationStatus === "verified",
        verificationStatus: nextVerificationStatus || targetUser.verificationStatus || "",
        moderatedAt: now,
        moderatedBy: session.username,
        updatedAt: now,
        ...roleResetFields
      });

      const users = (store.users || []).map((user) => user.username === targetUsername ? updatedUser : user);
      const sessions = (store.sessions || []).filter((item) => {
        if (item.username !== targetUsername) return true;
        return !isRestrictedUserStatus(updatedUser.status);
      });
      const products = (store.products || []).map((product) => {
        if (product.uploadedBy !== targetUsername) {
          return product;
        }
        if (requestedStatusChange && (updatedUser.status === "banned" || updatedUser.status === "deactivated")) {
          return {
            ...product,
            status: "rejected",
            moderationNote: `Listing hidden after account ${updatedUser.status}.`,
            moderatedAt: now,
            moderatedBy: session.username,
            updatedAt: now
          };
        }
        return product;
      });
      const moderationNotification = normalizeNotificationRecord({
        userId: targetUsername,
        type: "message",
        variant: nextStatus === "deactivated" || nextStatus === "banned" || nextStatus === "suspended" ? "warning" : "info",
        title: requestedDelete ? "Akaunti imeondolewa" : (requestedRoleChange ? "Role ya akaunti imebadilishwa" : "Akaunti imesasishwa"),
        body: requestedDelete
          ? `Akaunti yako imeondolewa na admin ${session.username}. Sababu: ${payload.reason || "N/A"}`
          : `Admin ${session.username} amesasisha akaunti yako. Status: ${nextStatus}.`,
        conversationId: "",
        isRead: false,
        createdAt: now
      });
      const moderationAction = normalizeModerationActionRecord({
        adminUsername: session.username,
        actionType: requestedDelete
          ? "user_deleted"
          : requestedRoleChange
            ? `user_role_${nextRole}`
            : requestedStatusChange
            ? `user_${payload.status}`
            : `user_verification_${updatedUser.verificationStatus || "unverified"}`,
        targetUserId: targetUsername,
        reason: payload.reason || updatedUser.verificationStatus || "",
        note: payload.note || "",
        createdAt: now
      });

      await writeStore({
        ...store,
        users,
        products,
        sessions,
        notifications: [moderationNotification, ...((store.notifications || []).map(normalizeNotificationRecord))],
        moderationActions: [moderationAction, ...((store.moderationActions || []).map(normalizeModerationActionRecord))]
      });
      await appendAuditLog({
        time: now,
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "user_moderated",
        adminUsername: session.username,
        targetUserId: targetUsername,
        status: updatedUser.status,
        role: updatedUser.role,
        reason: payload.reason || updatedUser.verificationStatus || ""
      });
      emitLiveEvent(targetUsername, "notification", { notification: moderationNotification });
      sendJson(res, 200, sanitizeAdminUser(updatedUser));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/products") {
      const token = readAuthToken(req);
      const session = token ? findSession(store, token) : null;
      const viewer = session ? getUserByUsername(store, session.username) : null;
      const requestedLimit = Number.parseInt(url.searchParams.get("limit"), 10);
      const requestedPage = Number.parseInt(url.searchParams.get("page"), 10);
      const requestedCursor = String(url.searchParams.get("cursor") || "").trim();
      const requestedQuery = String(url.searchParams.get("q") || "").trim().slice(0, 120);
      const requestedCategory = String(url.searchParams.get("category") || "").trim().slice(0, 80);
      const requestedSeller = String(url.searchParams.get("seller") || "").trim().slice(0, 80);
      const pageLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), MAX_API_PRODUCT_LIMIT)
        : 12;
      const safePage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
      const isStaffViewer = Boolean(viewer && isStaffRole(viewer.role));

      logRouteMemoryStage(requestMeta, "before_product_list_build", {
        limit: pageLimit,
        page: safePage,
        cursor: requestedCursor
      });

      if (postgresStore?.readProductsPage) {
        const pageData = await postgresStore.readProductsPage({
          limit: pageLimit,
          page: safePage,
          cursor: requestedCursor,
          query: requestedQuery,
          category: requestedCategory,
          seller: requestedSeller,
          maxLimit: MAX_API_PRODUCT_LIMIT,
          viewerUsername: viewer?.username || "",
          isStaffViewer
        });
        const visibleProducts = (Array.isArray(pageData.items) ? pageData.items : [])
          .map((product) => sanitizeVisibleProduct(product, viewer, store))
          .filter(Boolean);
        const payload = {
          items: visibleProducts,
          nextCursor: String(pageData.nextCursor || ""),
          hasMore: Boolean(pageData.hasMore),
          total: Number(pageData.total || 0),
          page: Number(pageData.page || safePage),
          limit: Number(pageData.limit || pageLimit)
        };
        logRouteMemoryStage(requestMeta, "after_product_list_build", {
          returnedProducts: visibleProducts.length,
          totalProducts: payload.total,
          hasMore: payload.hasMore
        });
        requestMeta.statusCode = 200;
        logRouteSummary(requestMeta, {
          returnedProducts: visibleProducts.length,
          totalProducts: payload.total,
          hasMore: payload.hasMore
        });
        sendJson(res, 200, payload);
        return;
      }

      const visibleProducts = buildVisibleProducts(store, viewer).filter((product) => {
        if (requestedSeller && String(product?.uploadedBy || "") !== requestedSeller) {
          return false;
        }
        if (
          requestedCategory
          && requestedCategory !== "all"
          && String(product?.category || "") !== requestedCategory
          && !String(product?.category || "").startsWith(`${requestedCategory}-`)
        ) {
          return false;
        }
        if (requestedQuery) {
          const haystack = [
            product?.name,
            product?.shop,
            product?.uploadedBy,
            product?.category
          ].map((value) => String(value || "").toLowerCase()).join(" ");
          if (!haystack.includes(requestedQuery.toLowerCase())) {
            return false;
          }
        }
        return true;
      });
      const fallbackCursorIndex = requestedCursor
        ? visibleProducts.findIndex((product) => `${product.createdAt || ""}|${product.id || ""}` === requestedCursor)
        : -1;
      const fallbackPagination = requestedCursor && fallbackCursorIndex >= 0
        ? (() => {
            const cursorOffset = fallbackCursorIndex + 1;
            const items = visibleProducts.slice(cursorOffset, cursorOffset + pageLimit);
            const lastItem = items[items.length - 1] || null;
            return {
              items,
              total: visibleProducts.length,
              hasMore: cursorOffset + items.length < visibleProducts.length,
              nextCursor: cursorOffset + items.length < visibleProducts.length && lastItem?.createdAt && lastItem?.id
                ? `${lastItem.createdAt}|${lastItem.id}`
                : ""
            };
          })()
        : paginateProducts(visibleProducts, {
            limit: pageLimit,
            offset: Math.max(0, (safePage - 1) * pageLimit),
            maxLimit: MAX_API_PRODUCT_LIMIT,
            fallbackLimit: 12
          });
      const fallbackVisibleProducts = (Array.isArray(fallbackPagination.items) ? fallbackPagination.items : [])
        .map((product) => sanitizeVisibleProduct(product, viewer, store))
        .filter(Boolean);
      const fallbackPayload = {
        items: fallbackVisibleProducts,
        nextCursor: String(fallbackPagination.nextCursor || ""),
        hasMore: Boolean(fallbackPagination.hasMore),
        total: Number(fallbackPagination.total || 0),
        page: safePage,
        limit: pageLimit
      };
      logRouteMemoryStage(requestMeta, "after_product_list_build", {
        returnedProducts: fallbackVisibleProducts.length,
        totalProducts: fallbackPayload.total,
        hasMore: fallbackPayload.hasMore
      });
      requestMeta.statusCode = 200;
      logRouteSummary(requestMeta, {
        returnedProducts: fallbackVisibleProducts.length,
        totalProducts: fallbackPayload.total,
        hasMore: fallbackPayload.hasMore
      });
      sendJson(res, 200, fallbackPayload);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/signup") {
      logRouteMemoryStage(requestMeta, "before_signup_collect_body");
      const rawPayload = await collectBody(req) || {};
      const requestedRole = typeof rawPayload.role === "string" ? rawPayload.role.trim() : "";
      if (requestedRole && requestedRole !== "buyer" && requestedRole !== "seller") {
        sendJson(res, 403, { error: "Public signup inaruhusu buyer au seller accounts tu." });
        return;
      }
      const normalizedRole = requestedRole === "buyer" || requestedRole === "seller" ? requestedRole : "seller";
      const buyerUsername = normalizedRole === "buyer"
        ? `buyer-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`
        : rawPayload.username;
      const payload = normalizeUserRecord({
        ...stripSignupCategoryFields(rawPayload),
        primaryCategory: "",
        role: normalizedRole,
        username: buyerUsername,
        fullName: rawPayload.fullName || rawPayload.username || ""
      });
      const users = store.users || [];
      const signupError = validateSignupPayload(payload);

      if (signupError) {
        sendJson(res, 400, { error: signupError });
        return;
      }

      if (users.find((item) => String(item.phoneNumber || "") === payload.phoneNumber)) {
        recordAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "signup_rejected",
          username: payload.username,
          reason: "duplicate_phone"
        });
        sendJson(res, 409, { error: "Namba hiyo ya simu tayari imesajiliwa." });
        return;
      }

      const normalizedIdentity = getNormalizedSignupIdentity(rawPayload).idNumber;
      const identityProvided = Boolean(normalizedIdentity || String(rawPayload.id_type || rawPayload.identityDocumentType || "").trim() || String(rawPayload.id_image || rawPayload.identityDocumentImage || "").trim());
      const normalizedCardNumber = sanitizePlainText(rawPayload.nationalId || "", 40).toUpperCase();
      if (identityProvided && normalizedCardNumber && normalizedIdentity && normalizedCardNumber !== normalizedIdentity) {
        sendJson(res, 400, { error: "The card number and the number you entered do not match. Please enter the same number shown on the card." });
        return;
      }
      if (normalizedIdentity) {
        const duplicateIdentity = users.find((item) =>
          sanitizePlainText(item.nationalId || item.identityDocumentNumber || item.idNumber || "", 40).toUpperCase() === normalizedIdentity
        );
        if (duplicateIdentity) {
          recordAuditLog({
            time: new Date().toISOString(),
            ip: clientIp,
            method: req.method,
            path: url.pathname,
            event: "signup_rejected",
            username: payload.username,
            reason: "duplicate_identity"
          });
          sendJson(res, 409, { error: "This identity number is already registered. Please contact the moderator." });
          return;
        }
      }

      const normalizedPhone = String(payload.phoneNumber || "").replace(/\D/g, "").slice(0, 20);
      const displayName = sanitizePlainText(payload.fullName || payload.username || "", 120);
      const generatedUsername = normalizedRole === "buyer"
        ? `buyer-${normalizedPhone || Date.now()}`
        : sanitizePlainText(rawPayload.username || "", 60) || `seller-${normalizedPhone || Date.now()}`;

      const createdUser = {
        ...payload,
        role: normalizedRole,
        primaryCategory: "",
        username: generatedUsername,
        fullName: displayName || generatedUsername,
        nationalId: normalizedIdentity || "",
        status: "active",
        moderationReason: "",
        moderationNote: "",
        verifiedSeller: normalizedRole === "seller",
        profileImage: payload.profileImage || "",
        identityDocumentType: getNormalizedSignupIdentity(rawPayload).idType || "",
        identityDocumentNumber: normalizedIdentity || "",
        identityDocumentImage: getNormalizedSignupIdentity(rawPayload).idImage || "",
        verificationStatus: normalizedRole === "seller" ? "verified" : "",
        verificationSubmittedAt: normalizedRole === "seller" ? new Date().toISOString() : "",
        moderatedAt: "",
        moderatedBy: "",
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        password: createPasswordHash(payload.password)
      };
      const session = createSession(createdUser);
      users.push(createdUser);
      logRouteMemoryStage(requestMeta, "before_signup_write", {
        users: users.length,
        sessions: Array.isArray(store.sessions) ? store.sessions.length + 1 : 1
      });
      await writeStoreWithOptions({
        ...store,
        categories: mergeCategories(store.categories || []),
        users,
        sessions: [...store.sessions, session]
      }, {
        skipBackup: true
      });
      recordAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "signup_success",
        username: createdUser.username
      });
      requestMeta.statusCode = 200;
      logRouteSummary(requestMeta, {
        username: createdUser.username,
        role: createdUser.role || "buyer"
      });
      sendJson(
        res,
        200,
        buildSelfSessionPayload(createdUser),
        { "Set-Cookie": buildAuthCookieHeader(session.token, req) }
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/recover-password") {
      const payload = await collectBody(req) || {};
      const rawIdentifier = sanitizePlainText(payload.identifier || payload.username, 120);
      const validationError = validatePasswordRecoveryPayload(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const users = store.users || [];
      const userIndex = findUserIndexByPublicIdentifier(users, rawIdentifier);
      const user = userIndex >= 0 ? users[userIndex] : null;
      const normalizedPhone = String(payload.phoneNumber || "").replace(/\D/g, "").slice(0, 20);
      const normalizedNationalId = sanitizePlainText(payload.nationalId, 40).toUpperCase();
      const phoneMatches = user && (
        String(user.phoneNumber || "") === normalizedPhone
        || String(user.whatsappNumber || "") === normalizedPhone
      );
      const idMatches = user && String(user.nationalId || user.identityDocumentNumber || "").toUpperCase() === normalizedNationalId;

      if (!user || isStaffRole(user.role) || !phoneMatches || !idMatches) {
        await appendAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "password_recovery_failed",
          username: rawIdentifier,
          reason: "identity_mismatch"
        });
        sendJson(res, 403, { error: "Taarifa za kurejesha password hazijalingana na akaunti hii." });
        return;
      }

      users[userIndex] = {
        ...user,
        password: createPasswordHash(String(payload.newPassword || payload.password || "")),
        updatedAt: new Date().toISOString()
      };
      const nextSessions = (store.sessions || []).filter((session) =>
        normalizeIdentifier(session.username, 40) !== normalizeIdentifier(user.username, 40)
      );
      await writeStore({
        ...store,
        users,
        sessions: nextSessions
      });
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "password_recovered",
        username: user.username
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      logRouteMemoryStage(requestMeta, "before_login_collect_body");
      const payload = await collectBody(req);
      const rawIdentifier = sanitizePlainText(payload?.identifier || payload?.username, 120);
      if (!payload || !isNonEmptyString(rawIdentifier, 3, 120) || !isNonEmptyString(payload.password, 4, 120)) {
        sendJson(res, 400, { error: "Identifier au password si sahihi." });
        return;
      }

      const users = store.users || [];
      const userIndex = findUserIndexByPublicIdentifier(users, rawIdentifier);
      const user = userIndex >= 0 ? users[userIndex] : null;
      const normalizedIdentifier = normalizeIdentifier(rawIdentifier, 120);

      if (!user || !verifyPassword(payload.password, user.password)) {
        recordAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "login_failed",
          username: normalizedIdentifier
        });
        sendJson(res, 401, { error: "Taarifa za login si sahihi. Hakikisha username na password ni sahihi." });
        return;
      }

      if (isRestrictedUserStatus(user.status)) {
        recordAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "login_blocked",
          username: normalizedIdentifier,
          status: user.status
        });
        sendJson(res, 403, { error: getUserRestrictionMessage(user.status) });
        return;
      }

      if (isStaffRole(user.role)) {
        recordAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "staff_login_blocked_on_public_route",
          username: user.username
        });
        sendJson(res, 403, { error: "Admin au moderator wanapaswa kutumia admin login route ya Winga." });
        return;
      }

      if (!isPasswordHashed(user.password)) {
        users[userIndex] = {
          ...user,
          password: createPasswordHash(payload.password)
        };
        store = { ...store, users };
      }

      const freshUser = normalizeUserRecord(users[userIndex] || user);
      const nextSessions = (store.sessions || []).filter((item) => item.username !== freshUser.username);
      const session = createSession(freshUser);
      logRouteMemoryStage(requestMeta, "before_login_write", {
        sessions: nextSessions.length + 1
      });
      await writeStoreWithOptions({
        ...store,
        sessions: [...nextSessions, session]
      }, {
        skipBackup: true
      });
      recordAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "login_success",
        username: freshUser.username
      });
      requestMeta.statusCode = 200;
      logRouteSummary(requestMeta, {
        username: freshUser.username,
        role: freshUser.role || "buyer"
      });
      sendJson(
        res,
        200,
        buildSelfSessionPayload(freshUser),
        { "Set-Cookie": buildAuthCookieHeader(session.token, req) }
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/admin-login") {
      logRouteMemoryStage(requestMeta, "before_admin_login_collect_body");
      const payload = await collectBody(req);
      const rawIdentifier = sanitizePlainText(payload?.identifier || payload?.username, 120);
      if (!payload || !isNonEmptyString(rawIdentifier, 3, 120) || !isNonEmptyString(payload.password, 4, 120)) {
        sendJson(res, 400, { error: "Identifier au password si sahihi." });
        return;
      }

      const users = store.users || [];
      const userIndex = findUserIndexByPublicIdentifier(users, rawIdentifier);
      const user = userIndex >= 0 ? users[userIndex] : null;
      const normalizedIdentifier = normalizeIdentifier(rawIdentifier, 120);

      if (!user || !verifyPassword(payload.password, user.password) || !isStaffRole(user.role)) {
        recordAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_login_failed",
          username: normalizedIdentifier
        });
        sendJson(res, 401, { error: "Taarifa za admin login si sahihi." });
        return;
      }

      if (isRestrictedUserStatus(user.status)) {
        recordAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_login_blocked",
          username: normalizedIdentifier,
          status: user.status
        });
        sendJson(res, 403, { error: getUserRestrictionMessage(user.status) });
        return;
      }

      if (!isPasswordHashed(user.password)) {
        users[userIndex] = {
          ...user,
          password: createPasswordHash(payload.password)
        };
        store = { ...store, users };
      }

      const freshUser = normalizeUserRecord(users[userIndex] || user);
      const nextSessions = (store.sessions || []).filter((item) => item.username !== freshUser.username);
      const session = createSession(freshUser);
      logRouteMemoryStage(requestMeta, "before_admin_login_write", {
        sessions: nextSessions.length + 1
      });
      await writeStoreWithOptions({
        ...store,
        sessions: [...nextSessions, session]
      }, {
        skipBackup: true
      });
      recordAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "admin_login_success",
        username: freshUser.username
      });
      requestMeta.statusCode = 200;
      logRouteSummary(requestMeta, {
        username: freshUser.username,
        role: freshUser.role || "admin"
      });
      sendJson(
        res,
        200,
        buildSelfSessionPayload(freshUser),
        { "Set-Cookie": buildAuthCookieHeader(session.token, req) }
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/client-events") {
      const token = readAuthToken(req);
      const session = token ? findSession(store, token) : null;
      const payload = await collectBody(req);
      const validationError = validateClientEventPayload(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        path: url.pathname,
        event: sanitizePlainText(payload.event, 80),
        level: payload.level,
        message: sanitizePlainText(payload.message || "", 300),
        username: session?.username || "",
        category: sanitizePlainText(payload.category || "", 40).toLowerCase(),
        alertSeverity: sanitizePlainText(payload.alertSeverity || "", 20).toLowerCase(),
        fingerprint: sanitizePlainText(payload.fingerprint || "", 120),
        context: payload.context && typeof payload.context === "object" && !Array.isArray(payload.context)
          ? Object.fromEntries(
              Object.entries(payload.context)
                .slice(0, 10)
                .map(([key, value]) => [sanitizePlainText(key, 40), sanitizePlainText(value, 120)])
            )
          : {}
      });
      sendJson(res, 202, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const token = readAuthToken(req);
      const session = token ? findSession(store, token) : null;
      const nextSessions = token
        ? (store.sessions || []).filter((item) => item.token !== token)
        : (store.sessions || []);
      if (nextSessions.length !== (store.sessions || []).length) {
        await writeStore({
          ...store,
          sessions: nextSessions
        });
      }
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "logout_success",
        username: session?.username || ""
      });
      sendJson(res, 200, { ok: true }, { "Set-Cookie": buildClearAuthCookieHeader(req) });
      return;
    }

    if (req.method === "GET" && (url.pathname === "/api/auth/session" || url.pathname === "/api/auth/me")) {
      const hasAuthCookie = Boolean(String(parseCookies(req)[AUTH_COOKIE_NAME] || "").trim());
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        recordAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "session_invalid",
          reason: "missing_or_expired"
        });
        sendJson(res, 401, { error: "Session imeisha au si sahihi." }, { "Set-Cookie": buildClearAuthCookieHeader(req) });
        return;
      }

      const user = (store.users || []).find((item) => item.username === session.username);
      if (!user) {
        recordAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "session_invalid",
          username: session.username,
          reason: "user_not_found"
        });
        sendJson(res, 401, { error: "Session user hakupatikana." }, { "Set-Cookie": buildClearAuthCookieHeader(req) });
        return;
      }

      if (isRestrictedUserStatus(user.status)) {
        recordAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "session_invalid",
          username: session.username,
          reason: user.status
        });
        sendJson(res, 403, { error: getUserRestrictionMessage(user.status) });
        return;
      }

      requestMeta.statusCode = 200;
      logRouteSummary(requestMeta, {
        username: user.username,
        role: user.role || "",
        sessionRestored: true
      });
      sendJson(
        res,
        200,
        buildSelfSessionPayload(user),
        hasAuthCookie ? {} : { "Set-Cookie": buildAuthCookieHeader(session.token, req) }
      );
      return;
    }

      if (req.method === "GET" && url.pathname === "/api/orders/mine") {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        const user = ensureMarketplaceUser(store, session, res);
        if (!user) {
          return;
        }

        sendJson(res, 200, buildOrdersSummary(store, user.username));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/messages") {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        const user = ensureMarketplaceUser(store, session, res);
        if (!user) {
          return;
        }

        sendJson(res, 200, buildMessagesSummary(store, user.username));
        return;
      }

      if (req.method === "DELETE" && /^\/api\/messages\/[^/]+$/.test(url.pathname)) {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        const user = ensureMarketplaceUser(store, session, res);
        if (!user) {
          return;
        }

        const messageId = sanitizePlainText(url.pathname.split("/").pop() || "", 80);
        const existingMessages = (store.messages || []).map(normalizeMessageRecord);
        const targetMessage = existingMessages.find((item) => item.id === messageId);
        if (!targetMessage || targetMessage.senderId !== user.username) {
          sendJson(res, 404, { error: "Ujumbe huo haujapatikana." });
          return;
        }

        const messages = existingMessages.filter((item) => item.id !== messageId);
        store = { ...store, messages };
        await writeStore(store);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "PATCH" && url.pathname === "/api/messages/read") {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        const user = ensureMarketplaceUser(store, session, res);
        if (!user) {
          return;
        }

        const payload = await collectBody(req);
        const validationError = validateMarkReadPayload(payload);
        if (validationError) {
          sendJson(res, 400, { error: validationError });
          return;
        }

        const targetUser = normalizeIdentifier(payload.withUser, 40);
        const updateResult = markConversationRead(store, user.username, targetUser);
        if (updateResult.didChange) {
          store = updateResult.store;
          await writeStore(store);
          emitLiveEvent(user.username, "conversation_read", {
            conversationId: updateResult.conversationId,
            withUser: targetUser,
            readAt: updateResult.readAt
          });
          emitLiveEvent(targetUser, "message_read", {
            conversationId: updateResult.conversationId,
            byUser: user.username,
            readAt: updateResult.readAt
          });
        }

        sendJson(res, 200, { ok: true, readAt: updateResult.readAt });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/notifications") {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        const user = ensureMarketplaceUser(store, session, res);
        if (!user) {
          return;
        }

        sendJson(res, 200, buildNotificationsSummary(store, user.username));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/promotions") {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        const user = ensureMarketplaceUser(store, session, res);
        if (!user) {
          return;
        }

        const publicActivePromotions = buildPromotionsSummary(store, { admin: true })
          .filter((promotion) =>
            promotion.status === "active"
            && promotion.paymentStatus === "paid"
          );
        const userScopedPromotions = buildPromotionsSummary(store, { username: user.username });
        const mergedPromotions = [];
        const seenPromotionIds = new Set();

        [...userScopedPromotions, ...publicActivePromotions].forEach((promotion) => {
          const promotionId = String(promotion?.id || "").trim();
          if (!promotionId || seenPromotionIds.has(promotionId)) {
            return;
          }
          seenPromotionIds.add(promotionId);
          mergedPromotions.push(promotion);
        });

        sendJson(res, 200, mergedPromotions);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/promotions") {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        const seller = ensureMarketplaceUser(store, session, res);
        if (!seller) {
          return;
        }

        const payload = await collectBody(req);
        const validationError = validatePromotionPayload(payload);
        if (validationError) {
          sendJson(res, 400, { error: validationError });
          return;
        }

        const product = getProductById(store, sanitizePlainText(payload.productId, 80));
        if (!product) {
          sendJson(res, 404, { error: "Bidhaa ya promotion haijapatikana." });
          return;
        }
        if (product.uploadedBy !== seller.username) {
          sendJson(res, 403, { error: "Unaweza kupromote bidhaa zako tu." });
          return;
        }
        const transactionReference = sanitizePlainText(payload.transactionReference, 80).toUpperCase();
        const duplicateTransaction = (store.payments || []).some((payment) =>
          payment.transactionReference === transactionReference || payment.receiptNumber === transactionReference
        ) || (store.promotions || []).some((promotion) => promotion.transactionReference === transactionReference);
        if (duplicateTransaction) {
          sendJson(res, 409, { error: "Transaction reference hiyo tayari imetumika." });
          return;
        }

        const existingPromotionForType = buildPromotionsSummary(store, { username: seller.username, productId: product.id })
          .some((promotion) =>
            ["pending", "active"].includes(String(promotion.status || "").toLowerCase())
            && promotion.type === payload.type
          );
        if (existingPromotionForType) {
          sendJson(res, 409, { error: "Bidhaa hii tayari ina request au promotion ya type hiyo inayoendelea." });
          return;
        }

        const config = PROMOTION_CONFIG[payload.type] || PROMOTION_CONFIG.starter_day;
        const now = new Date().toISOString();
        const promotion = normalizePromotionRecord({
          productId: product.id,
          sellerUsername: seller.username,
          type: payload.type,
          status: "pending",
          amountPaid: config.amount,
          paymentMethod: "mobile_money",
          transactionReference,
          paymentStatus: "pending",
          startDate: now,
          endDate: new Date(Date.now() + (config.durationDays * 24 * 60 * 60 * 1000)).toISOString(),
          createdAt: now,
          updatedAt: now
        });

        const promotions = [promotion, ...((store.promotions || []).map(normalizePromotionRecord))];
        await writeStore({ ...store, promotions });
        await appendAuditLog({
          time: now,
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "promotion_created",
          username: seller.username,
          productId: product.id,
          promotionType: promotion.type
        });
        sendJson(res, 200, promotion);
        return;
      }

      if (req.method === "PATCH" && /^\/api\/notifications\/[^/]+\/read$/.test(url.pathname)) {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        const user = ensureMarketplaceUser(store, session, res);
        if (!user) {
          return;
        }

        const notificationId = sanitizePlainText(decodeURIComponent(url.pathname.split("/")[3] || ""), 80);
        const now = new Date().toISOString();
        let found = false;
        const notifications = (store.notifications || []).map((item) => {
          const normalized = normalizeNotificationRecord(item);
          if (normalized.id !== notificationId || normalized.userId !== user.username) {
            return normalized;
          }
          found = true;
          return normalizeNotificationRecord({
            ...normalized,
            isRead: true,
            readAt: now
          });
        });

        if (!found) {
          sendJson(res, 404, { error: "Notification haijapatikana." });
          return;
        }

        store = { ...store, notifications };
        await writeStore(store);
        sendJson(res, 200, { ok: true, readAt: now });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/admin/promotions") {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        if (!session || !isAdminSession(session)) {
          await denyJson(res, 403, "Hii area ni ya admin tu.", {
            ip: clientIp,
            method: req.method,
            path: url.pathname,
            event: "admin_promotions_denied",
            username: session?.username || "",
            reason: !session ? "missing_or_invalid_session" : "insufficient_role"
          });
          return;
        }

        sendJson(res, 200, buildPromotionsSummary(store, { admin: true }));
        return;
      }

      if (req.method === "PATCH" && /^\/api\/admin\/promotions\/[^/]+\/review$/.test(url.pathname)) {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        if (!session || !isAdminSession(session)) {
          await denyJson(res, 403, "Hii area ni ya admin tu.", {
            ip: clientIp,
            method: req.method,
            path: url.pathname,
            event: "admin_promotion_review_denied",
            username: session?.username || "",
            reason: !session ? "missing_or_invalid_session" : "insufficient_role"
          });
          return;
        }

        const promotionId = sanitizePlainText(decodeURIComponent(url.pathname.split("/")[4] || ""), 80);
        const payload = await collectBody(req);
        const validationError = validatePromotionReviewPayload(payload);
        if (validationError) {
          sendJson(res, 400, { error: validationError });
          return;
        }

        const requestedStatus = sanitizePlainText(payload.status, 20).toLowerCase();
        const now = new Date().toISOString();
        let found = false;
        let nextPromotion = null;
        const promotions = (store.promotions || []).map((item) => {
          const normalized = normalizePromotionRecord(item);
          if (normalized.id !== promotionId) {
            return normalized;
          }
          found = true;
          const config = PROMOTION_CONFIG[normalized.type] || PROMOTION_CONFIG.starter_day;
          if (requestedStatus === "active") {
            const product = getProductById(store, normalized.productId);
            nextPromotion = normalizePromotionRecord({
              ...normalized,
              status: "active",
              paymentStatus: "paid",
              amountPaid: Number(normalized.amountPaid || config.amount || 0),
              startDate: now,
              endDate: new Date(Date.now() + (config.durationDays * 24 * 60 * 60 * 1000)).toISOString(),
              approvedAt: now,
              baselineViews: Math.max(0, Number(product?.views || normalized.baselineViews || 0)),
              baselineLikes: Math.max(0, Number(product?.likes || normalized.baselineLikes || 0)),
              disabledAt: "",
              disabledBy: "",
              updatedAt: now
            });
            return nextPromotion;
          }
          nextPromotion = normalizePromotionRecord({
            ...normalized,
            status: "rejected",
            paymentStatus: "failed",
            disabledAt: "",
            disabledBy: "",
            updatedAt: now
          });
          return nextPromotion;
        });

        if (!found) {
          sendJson(res, 404, { error: "Promotion haijapatikana." });
          return;
        }

        await writeStore({ ...store, promotions });
        await appendAuditLog({
          time: now,
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: requestedStatus === "active" ? "promotion_approved" : "promotion_rejected",
          username: session.username,
          promotionId
        });
        sendJson(res, 200, nextPromotion || { ok: true });
        return;
      }

      if (req.method === "PATCH" && /^\/api\/admin\/promotions\/[^/]+\/disable$/.test(url.pathname)) {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        if (!session || !isAdminSession(session)) {
          await denyJson(res, 403, "Hii area ni ya admin tu.", {
            ip: clientIp,
            method: req.method,
            path: url.pathname,
            event: "admin_promotion_disable_denied",
            username: session?.username || "",
            reason: !session ? "missing_or_invalid_session" : "insufficient_role"
          });
          return;
        }

        const promotionId = sanitizePlainText(decodeURIComponent(url.pathname.split("/")[4] || ""), 80);
        let found = false;
        const now = new Date().toISOString();
        const promotions = (store.promotions || []).map((item) => {
          const normalized = normalizePromotionRecord(item);
          if (normalized.id !== promotionId) {
            return normalized;
          }
          found = true;
          return normalizePromotionRecord({
            ...normalized,
            status: "disabled",
            disabledAt: now,
            disabledBy: session.username,
            updatedAt: now
          });
        });

        if (!found) {
          sendJson(res, 404, { error: "Promotion haijapatikana." });
          return;
        }

        await writeStore({ ...store, promotions });
        await appendAuditLog({
          time: now,
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "promotion_disabled",
          username: session.username,
          promotionId
        });
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/reviews") {
        const productId = sanitizePlainText(url.searchParams.get("productId") || "", 80);
        sendJson(res, 200, buildReviewSummary(store, productId));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/messages") {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        const sender = ensureMarketplaceUser(store, session, res);
        if (!sender) {
          return;
        }

        const payload = await collectBody(req);
        const normalizedPayload = normalizeMessageRecord({
          ...payload,
          senderId: sender.username
        });
        const validationError = validateMessagePayload(normalizedPayload);
        if (validationError) {
          sendJson(res, 400, { error: validationError });
          return;
        }

        if (normalizedPayload.receiverId === sender.username) {
          sendJson(res, 400, { error: "Huwezi kujitumia ujumbe mwenyewe." });
          return;
        }

        const receiver = getUserByUsername(store, normalizedPayload.receiverId);
        if (!receiver) {
          sendJson(res, 404, { error: "User wa kuongea naye hajapatikana." });
          return;
        }
        if (isRestrictedUserStatus(receiver.status)) {
          sendJson(res, 403, { error: "Akaunti hiyo haiwezi kupokea chat kwa sasa." });
          return;
        }

        if (normalizedPayload.messageType === "contact_share") {
          const isBuyerSharingToSeller = sender.role === "buyer" && receiver.role === "seller";
          if (!isBuyerSharingToSeller) {
            sendJson(res, 403, { error: "Phone sharing inaruhusiwa kutoka kwa buyer kwenda kwa seller tu." });
            return;
          }
          if (!hasBuyerSellerRelationship(store, sender.username, receiver.username)) {
            sendJson(res, 403, { error: "Shiriki namba baada ya kuanza mazungumzo au order na seller huyu." });
            return;
          }
          normalizedPayload.message = normalizedPayload.message || "Nimekushirikisha namba yangu kwa mawasiliano ya moja kwa moja.";
        }

        if (normalizedPayload.productId) {
          const relatedProduct = getProductById(store, normalizedPayload.productId);
          if (!relatedProduct) {
            sendJson(res, 404, { error: "Bidhaa ya chat haijapatikana." });
            return;
          }
          normalizedPayload.productName = normalizedPayload.productName || relatedProduct.name;
          if (normalizedPayload.receiverId !== relatedProduct.uploadedBy && sender.username !== relatedProduct.uploadedBy) {
            sendJson(res, 403, { error: "Chat hii haihusiani na seller wa bidhaa hiyo." });
            return;
          }
        }

        const recentDuplicateMessage = ((store.messages || []).map(normalizeMessageRecord)).find((item) =>
          item.senderId === sender.username
          && item.receiverId === normalizedPayload.receiverId
          && item.productId === normalizedPayload.productId
          && item.message === normalizedPayload.message
          && (Date.now() - new Date(item.createdAt || item.timestamp || 0).getTime()) < 30 * 1000
        );
        if (recentDuplicateMessage) {
          sendJson(res, 429, { error: "Ujumbe huo huo umetumwa hivi karibuni. Subiri kidogo kabla ya kurudia." });
          return;
        }
        const recentBurstCount = ((store.messages || []).map(normalizeMessageRecord)).filter((item) =>
          item.senderId === sender.username
          && item.receiverId === normalizedPayload.receiverId
          && (Date.now() - new Date(item.createdAt || item.timestamp || 0).getTime()) < 60 * 1000
        ).length;
        if (recentBurstCount >= 5) {
          sendJson(res, 429, { error: "Ujumbe mwingi sana umetumwa kwa muda mfupi. Subiri kidogo ujaribu tena." });
          return;
        }

        const now = new Date().toISOString();
        const nextMessage = normalizeMessageRecord({
          ...normalizedPayload,
          createdAt: now,
          updatedAt: now,
          timestamp: now,
          deliveredAt: now,
          isDelivered: true,
          isRead: false,
          readAt: ""
        });
        const notificationType = nextMessage.messageType === "product_inquiry" ? "request" : "message";
        const requestSummary = nextMessage.productItems.length > 1
          ? `${nextMessage.productItems.length} bidhaa`
          : sanitizePlainText(nextMessage.productName || "bidhaa", 80);
        const messageSnippet = sanitizePlainText(nextMessage.message, 140);
        const senderDisplayName = sanitizePlainText(sender.fullName || sender.username, 80) || sender.username;
        const notification = normalizeNotificationRecord({
          userId: normalizedPayload.receiverId,
          type: notificationType,
          messageId: nextMessage.id,
          conversationId: nextMessage.conversationId,
          title: nextMessage.messageType === "contact_share"
            ? `${senderDisplayName} ameshare namba yake`
            : notificationType === "request"
              ? `${senderDisplayName} ameomba maelezo kuhusu ${requestSummary}`
              : `${senderDisplayName} ame reply kuhusu ${sanitizePlainText(nextMessage.productName || "bidhaa yako", 80)}`,
          body: nextMessage.messageType === "contact_share"
            ? "Sasa unaweza kumuona na kuwasiliana naye moja kwa moja ukiihitaji."
            : notificationType === "request"
              ? (messageSnippet || "Fungua mazungumzo uone bidhaa alizochagua na maelezo yake.")
              : (messageSnippet || "Fungua mazungumzo uone ujumbe mpya."),
          variant: notificationType === "request" ? "success" : "info",
          isRead: false,
          createdAt: now
        });

        const messages = [...((store.messages || []).map(normalizeMessageRecord)), nextMessage];
        const notifications = [notification, ...((store.notifications || []).map(normalizeNotificationRecord))];
        let users = (store.users || []).map(normalizeUserRecord);
        if (nextMessage.messageType === "contact_share") {
          users = users.map((user) => {
            if (user.username !== sender.username) {
              return user;
            }
            return normalizeUserRecord({
              ...user,
              sharedPhoneViewerIds: [...getSharedPhoneViewerIds(user), receiver.username],
              updatedAt: now
            });
          });
        }
        store = { ...store, users, messages, notifications };
        await writeStore(store);
        await appendAuditLog({
          time: now,
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "message_sent",
          username: sender.username,
          receiverId: normalizedPayload.receiverId,
          productId: normalizedPayload.productId || ""
        });
        emitLiveEvent(sender.username, "message", { message: nextMessage });
        emitLiveEvent(normalizedPayload.receiverId, "message", { message: nextMessage });
        emitLiveEvent(normalizedPayload.receiverId, "notification", { notification });
        if (nextMessage.messageType === "contact_share") {
          emitLiveEvent(sender.username, "users", { reason: "contact_share", username: sender.username });
          emitLiveEvent(normalizedPayload.receiverId, "users", { reason: "contact_share", username: sender.username });
        }
        sendJson(res, 200, nextMessage);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/reviews") {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        const reviewer = ensureMarketplaceUser(store, session, res);
        if (!reviewer) {
          return;
        }

        const payload = await collectBody(req);
        const validationError = validateReviewPayload(payload);
        if (validationError) {
          sendJson(res, 400, { error: validationError });
          return;
        }

        const product = getProductById(store, payload.productId);
        if (!product) {
          sendJson(res, 404, { error: "Bidhaa ya review haijapatikana." });
          return;
        }

        const deliveredOrder = (store.orders || []).some((order) =>
          order.productId === product.id
          && order.buyerUsername === reviewer.username
          && order.status === "delivered"
        );
        if (!deliveredOrder) {
          sendJson(res, 403, { error: "Review inaruhusiwa kwa buyer aliyekamilisha order tu." });
          return;
        }

        const duplicateReview = (store.reviews || []).some((review) =>
          review.productId === product.id && review.userId === reviewer.username
        );
        if (duplicateReview) {
          sendJson(res, 409, { error: "Tayari ume-review bidhaa hii." });
          return;
        }

        const review = normalizeReviewRecord({
          ...payload,
          userId: reviewer.username,
          sellerId: product.uploadedBy,
          verifiedBuyer: true
        });

        const reviews = [review, ...((store.reviews || []).map(normalizeReviewRecord))];
        await writeStore({ ...store, reviews });
        await appendAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "review_created",
          username: reviewer.username,
          productId: product.id,
          sellerId: product.uploadedBy,
          rating: review.rating
        });
        sendJson(res, 200, review);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/reports") {
        const token = readAuthToken(req);
        const session = findSession(store, token);
        const reporter = ensureMarketplaceUser(store, session, res);
      if (!reporter) {
        return;
      }

      const payload = await collectBody(req);
      const normalizedPayload = normalizeReportRecord({
        ...payload,
        reporterUserId: reporter.username
      });
      const validationError = validateReportPayload(normalizedPayload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      if (normalizedPayload.targetUserId && normalizedPayload.targetUserId === reporter.username) {
        sendJson(res, 400, { error: "Huwezi kujiripoti mwenyewe." });
        return;
      }

      if (normalizedPayload.targetType === "product") {
        const targetProduct = getProductById(store, normalizedPayload.targetProductId);
        if (!targetProduct) {
          sendJson(res, 404, { error: "Bidhaa ya kuripoti haijapatikana." });
          return;
        }
        normalizedPayload.targetUserId = targetProduct.uploadedBy;
      } else if (!getUserByUsername(store, normalizedPayload.targetUserId)) {
        sendJson(res, 404, { error: "User ya kuripoti haijapatikana." });
        return;
      }

      const duplicateOpenReport = (store.reports || []).some((report) =>
        report.reporterUserId === reporter.username
        && report.targetType === normalizedPayload.targetType
        && report.targetUserId === normalizedPayload.targetUserId
        && report.targetProductId === normalizedPayload.targetProductId
        && report.status === "open"
      );
      if (duplicateOpenReport) {
        sendJson(res, 409, { error: "Tayari una report ya wazi kwa target hii." });
        return;
      }

      const reports = [normalizedPayload, ...((store.reports || []).map(normalizeReportRecord))];
      await writeStore({ ...store, reports });
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "report_created",
        username: reporter.username,
        targetType: normalizedPayload.targetType,
        targetUserId: normalizedPayload.targetUserId,
        targetProductId: normalizedPayload.targetProductId
      });
      sendJson(res, 200, normalizedPayload);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/analytics/summary") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      const user = ensureMarketplaceUser(store, session, res, { allowStaff: true });
      if (!user) {
        return;
      }

      sendJson(res, 200, buildAnalytics(store, user.username, isAdminSession(session)));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/products") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        await denyJson(res, 401, "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_products_denied",
          reason: "missing_or_invalid_session"
        });
        return;
      }

      if (!canModerateSession(session)) {
        await denyJson(res, 403, "Hii area ni ya admin au moderator tu.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_products_denied",
          username: session.username,
          reason: "insufficient_role"
        });
        return;
      }

      const statusFilter = url.searchParams.get("status") || "";
      const adminProducts = (store.products || []).filter((product) =>
        !statusFilter || product.status === statusFilter
      );
      sendJson(res, 200, adminProducts);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/orders") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        await denyJson(res, 401, "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_orders_denied",
          reason: "missing_or_invalid_session"
        });
        return;
      }

      if (!isAdminSession(session)) {
        await denyJson(res, 403, "Hii area ni ya admin tu.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_orders_denied",
          username: session.username,
          reason: "insufficient_role"
        });
        return;
      }

      const paymentStatusFilter = url.searchParams.get("paymentStatus") || "";
      const statusFilter = url.searchParams.get("status") || "";
      const adminOrders = (store.orders || []).filter((order) => {
        const paymentMatch = !paymentStatusFilter || order.paymentStatus === paymentStatusFilter;
        const statusMatch = !statusFilter || order.status === statusFilter;
        return paymentMatch && statusMatch;
      });
      sendJson(res, 200, adminOrders);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/payments") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        await denyJson(res, 401, "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_payments_denied",
          reason: "missing_or_invalid_session"
        });
        return;
      }

      if (!isAdminSession(session)) {
        await denyJson(res, 403, "Hii area ni ya admin tu.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_payments_denied",
          username: session.username,
          reason: "insufficient_role"
        });
        return;
      }

      const paymentStatusFilter = url.searchParams.get("paymentStatus") || "";
      const adminPayments = (store.payments || [])
        .map(normalizePaymentRecord)
        .filter((payment) => !paymentStatusFilter || payment.paymentStatus === paymentStatusFilter)
        .map((payment) => {
          const relatedOrder = getOrderById(store, payment.orderId);
          return {
            ...payment,
            orderStatus: relatedOrder?.status || "",
            amountPaid: Number(payment.amountPaid || relatedOrder?.price || 0),
            buyerUsername: payment.buyerUsername || relatedOrder?.buyerUsername || "",
            payerDetails: payment.payerDetails || {}
          };
        });

      sendJson(res, 200, adminPayments);
      return;
    }

    if (req.method === "PATCH" && /^\/api\/admin\/reports\/[^/]+$/.test(url.pathname)) {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        await denyJson(res, 401, "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_report_review_denied",
          reason: "missing_or_invalid_session"
        });
        return;
      }
      if (!canModerateSession(session)) {
        await denyJson(res, 403, "Hii area ni ya admin au moderator tu.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_report_review_denied",
          username: session.username,
          reason: "insufficient_role"
        });
        return;
      }

      const reportId = sanitizePlainText(decodeURIComponent(url.pathname.split("/")[4] || ""), 80);
      const payload = await collectBody(req);
      const validationError = validateReportReviewPayload(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const report = (store.reports || []).find((item) => item.id === reportId);
      if (!report) {
        sendJson(res, 404, { error: "Report haijapatikana." });
        return;
      }

      const updatedReport = normalizeReportRecord({
        ...report,
        status: payload.status,
        reviewNote: payload.reviewNote || report.reviewNote || "",
        reviewedBy: session.username,
        updatedAt: new Date().toISOString()
      });

      await writeStore({
        ...store,
        reports: (store.reports || []).map((item) => item.id === reportId ? updatedReport : item)
      });
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "report_reviewed",
        username: session.username,
        reportId,
        status: payload.status
      });
      sendJson(res, 200, updatedReport);
      return;
    }

    if (req.method === "PATCH" && /^\/api\/admin\/products\/[^/]+\/moderate$/.test(url.pathname)) {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        await denyJson(res, 401, "Session imeisha au si sahihi.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_product_moderation_denied",
          reason: "missing_or_invalid_session"
        });
        return;
      }

      if (!canModerateSession(session)) {
        await denyJson(res, 403, "Hii area ni ya admin au moderator tu.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_product_moderation_denied",
          username: session.username,
          reason: "insufficient_role"
        });
        return;
      }

      const productId = decodeURIComponent(url.pathname.split("/")[4] || "");
      const payload = await collectBody(req);
      if (!payload || !isValidProductStatus(payload.status)) {
        sendJson(res, 400, { error: "Status ya moderation si sahihi." });
        return;
      }

      const existingProduct = (store.products || []).find((item) => item.id === productId);
      if (!existingProduct) {
        sendJson(res, 404, { error: "Bidhaa haijapatikana." });
        return;
      }

      const moderatedProduct = {
        ...existingProduct,
        status: payload.status,
        moderationNote: sanitizePlainText(payload.moderationNote, 240),
        moderatedAt: new Date().toISOString(),
        moderatedBy: session.username,
        updatedAt: new Date().toISOString()
      };
      const sellerNotification = normalizeNotificationRecord({
        userId: existingProduct.uploadedBy,
        type: "message",
        variant: payload.status === "approved" ? "success" : "warning",
        title: payload.status === "approved" ? "Bidhaa imekubaliwa" : "Bidhaa imekataliwa",
        body: payload.status === "approved"
          ? `Bidhaa yako "${existingProduct.name || existingProduct.id}" imekubaliwa.`
          : `Bidhaa yako "${existingProduct.name || existingProduct.id}" imekataliwa. Sababu: ${moderatedProduct.moderationNote || "Hakuna maelezo."}`,
        conversationId: existingProduct.id,
        isRead: false,
        createdAt: new Date().toISOString()
      });

      const products = (store.products || []).map((item) =>
        item.id === productId ? moderatedProduct : item
      );
      await writeStore({
        ...store,
        products,
        notifications: [sellerNotification, ...((store.notifications || []).map(normalizeNotificationRecord))]
      });
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "product_moderated",
        username: session.username,
        productId,
        status: payload.status
      });
      emitLiveEvent(existingProduct.uploadedBy, "notification", { notification: sellerNotification });
      sendJson(res, 200, moderatedProduct);
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/users/primary-category") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      const user = ensureMarketplaceUser(store, session, res);
      if (!user) {
        return;
      }

      const payload = await collectBody(req);
      const normalizedUsername = normalizeIdentifier(payload?.username, 40);
      if (!payload || !isSafeIdentifier(normalizedUsername, 3, 40)) {
        sendJson(res, 400, { error: "Taarifa za user si sahihi." });
        return;
      }

      if (user.username !== normalizedUsername) {
        sendJson(res, 403, { error: "Huruhusiwi kubadilisha category ya user mwingine." });
        return;
      }

      const normalizedCategory = normalizeCategoryEntry({
        value: payload.primaryCategory,
        label: payload.primaryCategory
      })?.value || "";
      if (!normalizedCategory && payload.primaryCategory) {
        await appendAuditLog({
          time: new Date().toISOString(),
          level: "warn",
          event: "primary_category_update_ignored",
          actor: normalizedUsername,
          category: "user_profile",
          detail: "Ignored invalid primary category update payload.",
          metadata: {
            requestedCategory: String(payload.primaryCategory || "")
          }
        });
      }

      const users = (store.users || []).map((item) =>
        item.username === normalizedUsername ? { ...item, primaryCategory: normalizedCategory } : item
      );

      const sessions = (store.sessions || []).map((item) =>
        item.username === normalizedUsername ? { ...item, primaryCategory: normalizedCategory } : item
      );
      await writeStore({
        ...store,
        categories: normalizedCategory
          ? mergeCategories(store.categories || [], [{ value: normalizedCategory, label: normalizedCategory }])
          : mergeCategories(store.categories || []),
        users,
        sessions
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/users/me/whatsapp/request-change") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      const user = ensureMarketplaceUser(store, session, res);
      if (!user) {
        return;
      }

      const payload = await collectBody(req);
      const nextWhatsappNumber = String(payload?.whatsappNumber || payload?.phoneNumber || "").replace(/\D/g, "").slice(0, 20);
      if (!isValidWhatsapp(nextWhatsappNumber)) {
        sendJson(res, 400, { error: "Weka namba mpya ya WhatsApp sahihi." });
        return;
      }

      const now = new Date().toISOString();
      const duplicatePhone = (store.users || []).find((item) =>
        item.username !== user.username
        && (
          String(item.phoneNumber || "").replace(/\D/g, "").slice(0, 20) === nextWhatsappNumber
          || String(item.whatsappNumber || "").replace(/\D/g, "").slice(0, 20) === nextWhatsappNumber
        )
      );
      if (duplicatePhone) {
        sendJson(res, 409, { error: "Namba hiyo tayari inatumika kwenye account nyingine." });
        return;
      }

      const users = (store.users || []).map((item) =>
        item.username === user.username
          ? normalizeUserRecord({
              ...item,
              phoneNumber: nextWhatsappNumber,
              whatsappNumber: nextWhatsappNumber,
              whatsappVerificationStatus: "verified",
              whatsappVerifiedAt: now,
              pendingWhatsappNumber: "",
              pendingWhatsappCodeHash: "",
              pendingWhatsappRequestedAt: "",
              pendingWhatsappExpiresAt: "",
              updatedAt: now
            })
          : item
      );
      const updatedUser = users.find((item) => item.username === user.username);
      const sessions = (store.sessions || []).map((item) =>
        item.username === user.username
          ? {
              ...item,
              fullName: updatedUser?.fullName || item.fullName || item.username,
              role: updatedUser?.role || item.role || "seller",
              status: updatedUser?.status || item.status || "active",
              profileImage: updatedUser?.profileImage || "",
              verificationStatus: updatedUser?.verificationStatus || item.verificationStatus || "",
              whatsappNumber: updatedUser?.whatsappNumber || item.whatsappNumber || "",
              whatsappVerificationStatus: updatedUser?.whatsappVerificationStatus || item.whatsappVerificationStatus || "verified",
              primaryCategory: updatedUser?.primaryCategory || item.primaryCategory || ""
            }
          : item
      );
      const products = applySellerWhatsappToProducts(store, user.username, nextWhatsappNumber);

      await writeStore({
        ...store,
        users,
        sessions,
        products
      });

      await appendAuditLog({
        time: now,
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "profile_phone_updated",
        username: user.username,
        whatsappNumber: nextWhatsappNumber
      });

      sendJson(res, 200, buildSelfSessionPayload(updatedUser));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/users/me/whatsapp/verify-change") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      const user = ensureMarketplaceUser(store, session, res);
      if (!user) {
        return;
      }

      const payload = await collectBody(req);
      const nextWhatsappNumber = String(payload?.whatsappNumber || payload?.phoneNumber || user.whatsappNumber || user.phoneNumber || "").replace(/\D/g, "").slice(0, 20);
      if (!isValidWhatsapp(nextWhatsappNumber)) {
        sendJson(res, 400, { error: "Weka namba mpya ya WhatsApp sahihi." });
        return;
      }

      const now = new Date().toISOString();
      const duplicatePhone = (store.users || []).find((item) =>
        item.username !== user.username
        && (
          String(item.phoneNumber || "").replace(/\D/g, "").slice(0, 20) === nextWhatsappNumber
          || String(item.whatsappNumber || "").replace(/\D/g, "").slice(0, 20) === nextWhatsappNumber
        )
      );
      if (duplicatePhone) {
        sendJson(res, 409, { error: "Namba hiyo tayari inatumika kwenye account nyingine." });
        return;
      }

      const users = (store.users || []).map((item) =>
        item.username === user.username
          ? normalizeUserRecord({
              ...item,
              phoneNumber: nextWhatsappNumber,
              whatsappNumber: nextWhatsappNumber,
              whatsappVerificationStatus: "verified",
              whatsappVerifiedAt: now,
              pendingWhatsappNumber: "",
              pendingWhatsappCodeHash: "",
              pendingWhatsappRequestedAt: "",
              pendingWhatsappExpiresAt: "",
              updatedAt: now
            })
          : item
      );
      const updatedUser = users.find((item) => item.username === user.username);
      const sessions = (store.sessions || []).map((item) =>
        item.username === user.username
          ? {
              ...item,
              fullName: updatedUser?.fullName || item.fullName || item.username,
              role: updatedUser?.role || item.role || "seller",
              status: updatedUser?.status || item.status || "active",
              profileImage: updatedUser?.profileImage || "",
              verificationStatus: updatedUser?.verificationStatus || item.verificationStatus || "",
              whatsappNumber: updatedUser?.whatsappNumber || item.whatsappNumber || "",
              whatsappVerificationStatus: updatedUser?.whatsappVerificationStatus || item.whatsappVerificationStatus || "verified",
              primaryCategory: updatedUser?.primaryCategory || item.primaryCategory || ""
            }
          : item
      );
      const products = applySellerWhatsappToProducts(store, user.username, nextWhatsappNumber);

      await writeStore({
        ...store,
        users,
        sessions,
        products
      });

      await appendAuditLog({
        time: now,
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "profile_phone_updated",
        username: user.username,
        whatsappNumber: nextWhatsappNumber
      });

      sendJson(res, 200, buildSelfSessionPayload(updatedUser));
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/users/me/profile") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      const user = ensureMarketplaceUser(store, session, res);
      if (!user) {
        return;
      }

      const payload = await collectBody(req);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        sendJson(res, 400, { error: "Payload ya profile si sahihi." });
        return;
      }

      const hasProfileImage = Object.prototype.hasOwnProperty.call(payload, "profileImage");
      const hasPhoneUpdate = Object.prototype.hasOwnProperty.call(payload, "phoneNumber")
        || Object.prototype.hasOwnProperty.call(payload, "whatsappNumber");
      const hasPaymentUpdate = Object.prototype.hasOwnProperty.call(payload, "paymentProvider")
        || Object.prototype.hasOwnProperty.call(payload, "paymentNumber")
        || Object.prototype.hasOwnProperty.call(payload, "paymentRecipientName")
        || Object.prototype.hasOwnProperty.call(payload, "paymentInstructions");
      if (!hasProfileImage && !hasPhoneUpdate && !hasPaymentUpdate) {
        sendJson(res, 400, { error: "Hakuna data ya kubadili profile." });
        return;
      }

      if (hasProfileImage && !isValidPrivateImageValue(payload.profileImage || "")) {
        sendJson(res, 400, { error: "Profile photo si sahihi." });
        return;
      }

      const nextPhoneNumber = hasPhoneUpdate
        ? String(payload.phoneNumber || payload.whatsappNumber || "").replace(/\D/g, "").slice(0, 20)
        : "";
      if (hasPhoneUpdate && !/^\d{10,15}$/.test(nextPhoneNumber)) {
        sendJson(res, 400, { error: "Weka namba ya simu sahihi yenye tarakimu 10 hadi 15." });
        return;
      }

      if (hasPhoneUpdate) {
        const duplicatePhone = (store.users || []).find((item) =>
          item.username !== user.username
          && (
            String(item.phoneNumber || "").replace(/\D/g, "").slice(0, 20) === nextPhoneNumber
            || String(item.whatsappNumber || "").replace(/\D/g, "").slice(0, 20) === nextPhoneNumber
          )
        );
        if (duplicatePhone) {
          sendJson(res, 409, { error: "Namba hiyo ya simu tayari imesajiliwa." });
          return;
        }
      }

      const nextPaymentNumber = hasPaymentUpdate
        ? String(payload.paymentNumber || "").replace(/\D/g, "").slice(0, 20)
        : String(user.paymentNumber || "").replace(/\D/g, "").slice(0, 20);
      const nextPaymentProvider = hasPaymentUpdate
        ? sanitizePlainText(payload.paymentProvider || "", 40).toLowerCase()
        : sanitizePlainText(user.paymentProvider || "", 40).toLowerCase();
      const nextPaymentRecipientName = hasPaymentUpdate
        ? sanitizePlainText(payload.paymentRecipientName || user.fullName || user.username, 120)
        : sanitizePlainText(user.paymentRecipientName || user.fullName || user.username, 120);
      const nextPaymentInstructions = hasPaymentUpdate
        ? sanitizePlainText(payload.paymentInstructions || "", 240)
        : sanitizePlainText(user.paymentInstructions || "", 240);
      if (hasPaymentUpdate && nextPaymentNumber && !/^\d{8,20}$/.test(nextPaymentNumber)) {
        sendJson(res, 400, { error: "Weka Lipa namba sahihi yenye tarakimu 8 hadi 20." });
        return;
      }
      if (hasPaymentUpdate && nextPaymentNumber && !nextPaymentRecipientName) {
        sendJson(res, 400, { error: "Weka jina la anayepokea malipo." });
        return;
      }

      const nextProfileImage = hasProfileImage ? payload.profileImage : user.profileImage || "";
      const nextWhatsappNumber = hasPhoneUpdate ? nextPhoneNumber : String(user.whatsappNumber || user.phoneNumber || "").replace(/\D/g, "").slice(0, 20);

      const now = new Date().toISOString();
      const updatedUsers = (store.users || []).map((item) =>
        item.username === user.username
          ? normalizeUserRecord({
              ...item,
              ...(hasProfileImage ? { profileImage: nextProfileImage } : {}),
              ...(hasPhoneUpdate
                ? {
                    phoneNumber: nextPhoneNumber,
                    whatsappNumber: nextPhoneNumber,
                    whatsappVerificationStatus: "verified",
                    whatsappVerifiedAt: now
                  }
                : {}),
              ...(hasPaymentUpdate
                ? {
                    paymentProvider: nextPaymentProvider,
                    paymentNumber: nextPaymentNumber,
                    paymentRecipientName: nextPaymentRecipientName,
                    paymentInstructions: nextPaymentInstructions
                  }
                : {}),
              updatedAt: now
            })
          : item
      );

      const updatedUser = updatedUsers.find((item) => item.username === user.username);
      if (!updatedUser) {
        await appendAuditLog({
          time: now,
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "profile_update_rejected",
          username: user.username,
          reason: "user_record_missing"
        });
        sendJson(res, 404, { error: "Akaunti yako haikupatikana tena. Ingia upya kabla ya kujaribu tena." });
        return;
      }

      const sessions = (store.sessions || []).map((item) =>
        item.username === user.username
          ? {
              ...item,
              fullName: updatedUser?.fullName || item.fullName || item.username,
              role: updatedUser?.role || item.role || "seller",
              status: updatedUser?.status || item.status || "active",
              profileImage: updatedUser?.profileImage || "",
              verificationStatus: updatedUser?.verificationStatus || item.verificationStatus || "",
              whatsappNumber: updatedUser?.whatsappNumber || item.whatsappNumber || "",
              whatsappVerificationStatus: updatedUser?.whatsappVerificationStatus || item.whatsappVerificationStatus || "verified",
              paymentProvider: updatedUser?.paymentProvider || item.paymentProvider || "",
              paymentNumber: updatedUser?.paymentNumber || item.paymentNumber || "",
              paymentRecipientName: updatedUser?.paymentRecipientName || item.paymentRecipientName || updatedUser?.fullName || item.fullName || item.username,
              paymentInstructions: updatedUser?.paymentInstructions || item.paymentInstructions || "",
              primaryCategory: updatedUser?.primaryCategory || item.primaryCategory || ""
            }
          : item
      );

      const products = hasPhoneUpdate
        ? applySellerWhatsappToProducts(store, user.username, nextWhatsappNumber)
        : store.products || [];

      await writeStore({
        ...store,
        users: updatedUsers,
        sessions,
        ...(hasPhoneUpdate ? { products } : {})
      });

      await appendAuditLog({
        time: now,
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: hasPaymentUpdate ? "profile_payment_details_updated" : (hasPhoneUpdate ? "profile_phone_updated" : "profile_photo_updated"),
        username: user.username
      });

      sendJson(res, 200, buildSelfSessionPayload(updatedUser));
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/users/me/upgrade-to-seller") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      const user = ensureMarketplaceUser(store, session, res);
      if (!user) {
        return;
      }

      if (isStaffRole(user.role)) {
        sendJson(res, 403, { error: "Admin au moderator hawawezi kutumia seller upgrade hii." });
        return;
      }

      if (user.role === "seller" && user.verifiedSeller) {
        sendJson(res, 409, { error: "Akaunti hii tayari imeverified." });
        return;
      }

      if (user.role !== "buyer" && user.role !== "seller") {
        sendJson(res, 400, { error: "Seller verification inaruhusiwa kwa buyer au seller accounts tu." });
        return;
      }

      const payload = await collectBody(req);
      const validationError = validateSellerUpgradePayload(payload, user);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const now = new Date().toISOString();
      const fullName = sanitizePlainText(payload.fullName || user.fullName || user.username, 120);
      const phoneNumber = String(payload.phoneNumber || user.phoneNumber || user.whatsappNumber || "").replace(/\D/g, "").slice(0, 20);
      const primaryCategory = sanitizePlainText(payload.primaryCategory || user.primaryCategory || "", 60).toLowerCase();
      const duplicatePhoneUser = (store.users || []).find((item) =>
        item.username !== user.username && String(item.phoneNumber || "") === phoneNumber
      );
      if (duplicatePhoneUser) {
        sendJson(res, 409, { error: "Namba hiyo ya simu tayari imesajiliwa." });
        return;
      }
      const updatedUser = normalizeUserRecord({
        ...user,
        fullName,
        role: "seller",
        primaryCategory,
        phoneNumber,
        whatsappNumber: phoneNumber,
        whatsappVerificationStatus: "verified",
        whatsappVerifiedAt: now,
        nationalId: "",
        identityDocumentType: "",
        identityDocumentNumber: "",
        identityDocumentImage: "",
        verifiedSeller: false,
        verificationStatus: "unverified",
        verificationSubmittedAt: user.verificationSubmittedAt || "",
        updatedAt: now
      });

      const users = (store.users || []).map((item) =>
        item.username === user.username ? updatedUser : item
      );
      const sessions = (store.sessions || []).map((item) =>
        item.username === user.username
          ? {
              ...item,
              fullName: updatedUser.fullName || item.fullName || item.username,
              role: updatedUser.role || item.role || "seller",
              primaryCategory: updatedUser.primaryCategory || item.primaryCategory || "",
              status: updatedUser.status || item.status || "active",
              verificationStatus: updatedUser.verificationStatus || item.verificationStatus || "verified",
              verifiedSeller: false,
              identityDocumentType: "",
              identityDocumentNumber: "",
              nationalId: "",
              profileImage: updatedUser.profileImage || item.profileImage || "",
              phoneNumber: updatedUser.phoneNumber || item.phoneNumber || "",
              whatsappNumber: updatedUser.whatsappNumber || item.whatsappNumber || "",
              whatsappVerificationStatus: updatedUser.whatsappVerificationStatus || item.whatsappVerificationStatus || "verified",
              whatsappVerifiedAt: updatedUser.whatsappVerifiedAt || item.whatsappVerifiedAt || now
            }
          : item
      );

      await writeStore({
        ...store,
        users,
        sessions
      });

      await appendAuditLog({
        time: now,
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "buyer_upgraded_to_seller",
        username: user.username,
        role: "seller",
        verificationStatus: "verified"
      });

      sendJson(res, 200, buildSelfSessionPayload(updatedUser));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/categories") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!ensureMarketplaceUser(store, session, res)) {
        return;
      }

      const payload = await collectBody(req);
      const category = normalizeCategoryEntry(payload);
      if (!category || !isValidCategory(category.value) || !isNonEmptyString(category.label, 2, 40)) {
        sendJson(res, 400, { error: "Category mpya si sahihi." });
        return;
      }

      const categories = mergeCategories(store.categories || [], [category]);
      await writeStore({ ...store, categories });
      sendJson(res, 200, category);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/orders") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      const buyerUser = ensureMarketplaceUser(store, session, res);
      if (!buyerUser) {
        return;
      }

      const payload = await collectBody(req);
      const productId = typeof payload?.productId === "string" ? payload.productId.trim() : "";
      const transactionId = sanitizePlainText(payload?.transactionId, 80).toUpperCase();
      if (!productId) {
        sendJson(res, 400, { error: "Bidhaa ya kununua haijachaguliwa." });
        return;
      }
      if (!isValidTransactionReference(transactionId)) {
        sendJson(res, 400, { error: "Weka transaction reference sahihi baada ya kulipa." });
        return;
      }

      const product = (store.products || []).find((item) => item.id === productId);
      if (!product) {
        sendJson(res, 404, { error: "Bidhaa haijapatikana." });
        return;
      }

      if (product.status !== "approved") {
        sendJson(res, 400, { error: "Bidhaa hii bado haijaruhusiwa kuuzwa." });
        return;
      }

      if (product.availability === "sold_out") {
        sendJson(res, 400, { error: "Bidhaa hii imeisha, ni sold out." });
        return;
      }
      if (product.availability === "reserved") {
        sendJson(res, 409, { error: "Bidhaa hii imeshahifadhiwa kwa order nyingine. Tuma ujumbe kwa muuzaji kwanza." });
        return;
      }

      if (product.uploadedBy === session.username) {
        sendJson(res, 400, { error: "Huwezi kununua bidhaa yako mwenyewe." });
        return;
      }

      const hasActiveOrder = (store.orders || []).some((order) =>
        order.productId === product.id
        && order.buyerUsername === session.username
        && (order.status === "placed" || order.status === "paid" || order.status === "confirmed")
      );
      if (hasActiveOrder) {
        sendJson(res, 409, { error: "Tayari una order inayoendelea kwa bidhaa hii." });
        return;
      }

      const now = new Date().toISOString();
      const duplicateTransaction = (store.payments || []).some((payment) =>
        payment.transactionReference === transactionId || payment.receiptNumber === transactionId
      );
      if (duplicateTransaction) {
        sendJson(res, 409, { error: "Receipt au transaction reference hiyo tayari imetumika." });
        return;
      }

      const productPrice = normalizeOptionalPrice(product.price);
      if (productPrice === null) {
        sendJson(res, 409, { error: "Bidhaa hii haina bei ya wazi. Ongea na muuzaji kwanza mkubaliane bei kabla ya kuweka order." });
        return;
      }

      const sellerUser = (store.users || []).map(normalizeUserRecord).find((item) => item.username === product.uploadedBy) || null;
      const paymentNumber = String(sellerUser?.paymentNumber || product.whatsapp || "").replace(/\D/g, "").slice(0, 20);
      const paymentProvider = sanitizePlainText(sellerUser?.paymentProvider || "", 40).toLowerCase();
      const paymentRecipientName = sanitizePlainText(
        sellerUser?.paymentRecipientName || sellerUser?.fullName || product.shop || product.uploadedBy || "",
        120
      );
      const paymentInstructions = sanitizePlainText(sellerUser?.paymentInstructions || "", 240);
      if (!paymentNumber) {
        sendJson(res, 409, { error: "Muuzaji bado hajaweka Lipa namba ya kupokea malipo. Tuma ujumbe kwanza." });
        return;
      }

      const order = normalizeOrderRecord({
        id: `order-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        productId: product.id,
        productName: product.name,
        productImage: product.image || "",
        price: productPrice,
        buyerUsername: session.username,
        sellerUsername: product.uploadedBy,
        shop: product.shop || "",
        status: "placed",
        paymentStatus: "pending",
        paymentMethod: "mobile_money",
        paymentPhoneNumber: paymentNumber,
        paymentProvider,
        paymentRecipientName,
        paymentInstructions,
        transactionId,
        paymentSubmittedAt: now,
        paymentConfirmedAt: "",
        paymentConfirmedBy: "",
        paymentIntentStatus: "submitted",
        reserveExpiresAt: new Date(new Date(now).getTime() + (24 * 60 * 60 * 1000)).toISOString(),
        createdAt: now
      });

      const payment = normalizePaymentRecord({
        id: `payment-${order.id}`,
        orderId: order.id,
        buyerUsername: session.username,
        amountPaid: productPrice,
        paymentMethod: "mobile_money",
        paymentProvider,
        paymentNumber,
        paymentRecipientName,
        paymentInstructions,
        transactionReference: transactionId,
        receiptNumber: transactionId,
        paymentStatus: "pending",
        payerDetails: {
          name: session.username,
          phoneNumber: buyerUser.phoneNumber || ""
        },
        rawGatewayResponse: {
          provider: "manual_mobile_money",
          paymentProvider,
          paymentNumber,
          transactionReference: transactionId,
          status: "submitted_for_verification"
        },
        createdAt: now,
        updatedAt: now
      });

      const orders = [order, ...(store.orders || [])];
      const payments = [payment, ...((store.payments || []).map(normalizePaymentRecord))];
      const sellerNotification = buildOrderNotification({
        recipientId: product.uploadedBy,
        actorUsername: session.username,
        order,
        stage: "created"
      });
      const notifications = [sellerNotification, ...((store.notifications || []).map(normalizeNotificationRecord))];
      const products = (store.products || []).map((item) =>
        item.id === product.id
          ? { ...item, availability: "reserved", updatedAt: now }
          : item
      );
      store = { ...store, orders, payments, products, notifications };
      await writeStore(store);
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "order_created",
        username: session.username,
        productId: product.id,
        sellerUsername: product.uploadedBy,
        orderId: order.id,
        paymentId: payment.id,
        paymentStatus: payment.paymentStatus
      });
      emitLiveEvent(product.uploadedBy, "notification", { notification: sellerNotification });
      sendJson(res, 200, {
        ...order,
        paymentId: payment.id,
        paymentDate: payment.createdAt,
        payerDetails: payment.payerDetails
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/payments/webhook") {
      if (PAYMENT_WEBHOOK_SECRET) {
        const incomingSecret = readWebhookSecret(req);
        if (incomingSecret !== PAYMENT_WEBHOOK_SECRET) {
          await denyJson(res, 401, "Webhook signature si sahihi.", {
            ip: clientIp,
            method: req.method,
            path: url.pathname,
            event: "payment_webhook_denied",
            reason: "invalid_secret"
          });
          return;
        }
      }
      const payload = await collectBody(req);
      const orderId = sanitizePlainText(payload?.orderId, 80);
      const transactionReference = sanitizePlainText(payload?.transactionReference, 80).toUpperCase();
      const paymentStatus = typeof payload?.paymentStatus === "string" ? payload.paymentStatus.trim() : "";

      let matchedOrderId = orderId;
      if (!matchedOrderId && transactionReference) {
        const relatedPayment = (store.payments || []).find((payment) => payment.transactionReference === transactionReference || payment.receiptNumber === transactionReference);
        matchedOrderId = relatedPayment?.orderId || "";
      }

      if (!matchedOrderId || !isValidPaymentStatus(paymentStatus)) {
        sendJson(res, 400, { error: "Webhook payment payload si sahihi." });
        return;
      }

      const existingPayment = getPaymentByOrderId(store, matchedOrderId);
      if (!existingPayment) {
        sendJson(res, 404, { error: "Payment haijapatikana." });
        return;
      }

      const nextStore = updateOrderAndPaymentFromPaymentResult(store, matchedOrderId, paymentStatus, {
        rawGatewayResponse: payload?.rawGatewayResponse && typeof payload.rawGatewayResponse === "object"
          ? payload.rawGatewayResponse
          : null
      });
      await writeStore(nextStore);
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "payment_webhook_processed",
        orderId: matchedOrderId,
        paymentStatus
      });
      sendJson(res, 202, { ok: true, orderId: matchedOrderId, paymentStatus });
      return;
    }

    if (req.method === "PATCH" && /^\/api\/products\/[^/]+\/availability$/.test(url.pathname)) {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      const sellerUser = ensureMarketplaceUser(store, session, res);
      if (!sellerUser) {
        return;
      }

      const productId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const payload = await collectBody(req);
      const nextAvailability = typeof payload?.availability === "string" ? payload.availability.trim() : "";
      if (nextAvailability !== "sold_out") {
        sendJson(res, 400, { error: "Availability si sahihi." });
        return;
      }

      const product = getProductById(store, productId);
      if (!product) {
        sendJson(res, 404, { error: "Bidhaa haijapatikana." });
        return;
      }

      if (product.uploadedBy !== sellerUser.username) {
        sendJson(res, 403, { error: "Muuzaji pekee ndiye anaweza kuweka sold out kwa bidhaa yake." });
        return;
      }

      const products = (store.products || []).map((item) =>
        item.id === productId
          ? { ...item, availability: "sold_out", updatedAt: new Date().toISOString() }
          : item
      );

      await writeStore({ ...store, products });
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "product_marked_sold_out",
        username: sellerUser.username,
        productId
      });
      sendJson(res, 200, products.find((item) => item.id === productId));
      return;
    }

    if (req.method === "PATCH" && /^\/api\/orders\/[^/]+\/status$/.test(url.pathname)) {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!ensureMarketplaceUser(store, session, res)) {
        return;
      }

      const orderId = decodeURIComponent(url.pathname.split("/")[3] || "");
      const payload = await collectBody(req);
      const nextStatus = typeof payload?.status === "string" ? payload.status.trim() : "";
      if (!isValidOrderStatus(nextStatus)) {
        sendJson(res, 400, { error: "Status ya order si sahihi." });
        return;
      }

      const existingOrder = getOrderById(store, orderId);
      if (!existingOrder) {
        sendJson(res, 404, { error: "Order haijapatikana." });
        return;
      }

      if (!canUpdateOrderStatus(existingOrder, session, nextStatus)) {
        sendJson(res, 403, { error: "Huruhusiwi kufanya mabadiliko hayo ya order." });
        return;
      }

      const sellerRejectingPendingPayment = nextStatus === "cancelled"
        && session.username === existingOrder.sellerUsername
        && existingOrder.status === "placed"
        && existingOrder.paymentStatus === "pending";
      const paymentStatus = nextStatus === "paid"
        ? "paid"
        : sellerRejectingPendingPayment
          ? "failed"
          : existingOrder.paymentStatus;
      const paymentIntentStatus = nextStatus === "paid"
        ? "verified"
        : sellerRejectingPendingPayment
          ? "cancelled"
          : existingOrder.paymentIntentStatus;
      const paymentConfirmedAt = nextStatus === "paid" ? new Date().toISOString() : existingOrder.paymentConfirmedAt;
      const paymentConfirmedBy = nextStatus === "paid" ? session.username : existingOrder.paymentConfirmedBy;

      const updatedOrder = normalizeOrderRecord({
        ...existingOrder,
        status: nextStatus,
        paymentStatus,
        paymentIntentStatus,
        paymentConfirmedAt,
        paymentConfirmedBy,
        reserveExpiresAt: nextStatus === "placed" ? existingOrder.reserveExpiresAt : ""
      });

      const orders = (store.orders || []).map((order) =>
        order.id === orderId ? updatedOrder : order
      );
      const payments = (store.payments || []).map((payment) =>
        payment.orderId === orderId
          ? normalizePaymentRecord({
            ...payment,
            paymentStatus,
            updatedAt: new Date().toISOString()
          })
          : normalizePaymentRecord(payment)
      );
      const nextAvailability = deriveProductAvailabilityFromOrders(orders, existingOrder.productId);

      const notificationRecipient = session.username === existingOrder.sellerUsername
        ? existingOrder.buyerUsername
        : existingOrder.sellerUsername;
      const notificationStage = sellerRejectingPendingPayment ? "payment_rejected" : nextStatus;
      const orderNotification = buildOrderNotification({
        recipientId: notificationRecipient,
        actorUsername: session.username,
        order: updatedOrder,
        stage: notificationStage
      });
      const notifications = [orderNotification, ...((store.notifications || []).map(normalizeNotificationRecord))];
      const products = (store.products || []).map((item) =>
        item.id === existingOrder.productId
          ? { ...item, availability: nextAvailability, updatedAt: new Date().toISOString() }
          : item
      );
      store = { ...store, orders, payments, products, notifications };
      await writeStore(store);
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "order_status_updated",
        username: session.username,
        orderId,
        status: nextStatus,
        paymentStatus
      });
      emitLiveEvent(notificationRecipient, "notification", { notification: orderNotification });
      sendJson(res, 200, updatedOrder);
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/products") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        sendJson(res, 401, { error: "Session imeisha au si sahihi." });
        return;
      }

      if (!isAdminSession(session)) {
        await denyJson(res, 403, "Bulk product save ni ya admin tu.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "admin_products_bulk_save_denied",
          username: session?.username || ""
        });
        return;
      }

      logRouteMemoryStage(requestMeta, "before_bulk_products_collect_body");
      const products = await collectBody(req);
      const normalizedProducts = Array.isArray(products)
        ? products.map((product) => repairNormalizedProductImageState(normalizeProductImages(product)))
        : [];
      logRouteMemoryStage(requestMeta, "after_bulk_products_normalize", {
        products: normalizedProducts.length
      });
      store = { ...store, products: normalizedProducts };
      await writeStore(store);
      requestMeta.statusCode = 200;
      logRouteSummary(requestMeta, {
        products: normalizedProducts.length,
        bulk: true
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/products") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      const sellerUser = ensureMarketplaceUser(store, session, res);
      if (!sellerUser) {
        return;
      }
      if (!canPostProducts(sellerUser.role)) {
        sendJson(res, 403, { error: "Akaunti ya buyer haiwezi kupost bidhaa." });
        return;
      }

      logRouteMemoryStage(requestMeta, "before_product_upload_collect_body");
      const payload = await collectBody(req);
      const candidatePayload = {
        ...payload,
        whatsapp: String(sellerUser.whatsappNumber || sellerUser.phoneNumber || "").replace(/\D/g, "").slice(0, 20)
      };
      const productError = validateProductPayload(candidatePayload);
      if (productError) {
        sendJson(res, 400, { error: productError });
        return;
      }

      if (!candidatePayload || candidatePayload.uploadedBy !== sellerUser.username) {
        sendJson(res, 403, { error: "Huruhusiwi kuunda bidhaa kwa user mwingine." });
        return;
      }
      if (candidatePayload.originalProductId || candidatePayload.resoldStatus === "reposted") {
        const sourceProduct = (store.products || []).find((item) => item.id === candidatePayload.originalProductId);
        if (!sourceProduct) {
          sendJson(res, 400, { error: "Bidhaa ya source ya repost haijapatikana." });
          return;
        }
        if (sourceProduct.uploadedBy === sellerUser.username) {
          sendJson(res, 400, { error: "Huwezi kurepost bidhaa yako mwenyewe kama repost mpya." });
          return;
        }
        if (candidatePayload.originalSellerId && sourceProduct.uploadedBy !== candidatePayload.originalSellerId) {
          sendJson(res, 400, { error: "Original seller wa repost si sahihi." });
          return;
        }
      }

      const normalizedProduct = normalizeProductRecord(normalizeProductImages({
        ...candidatePayload,
        shop: typeof candidatePayload.shop === "string" && candidatePayload.shop.trim() ? candidatePayload.shop.trim() : sellerUser.username,
        status: "approved",
        moderationNote: "",
        moderatedAt: "",
        moderatedBy: "",
        originalProductId: candidatePayload.originalProductId || "",
        originalSellerId: candidatePayload.originalSellerId || "",
        resellerId: candidatePayload.resellerId || "",
        resalePrice: candidatePayload.resalePrice ?? candidatePayload.price,
        resoldStatus: candidatePayload.resoldStatus || ""
      }));
      logRouteMemoryStage(requestMeta, "after_product_upload_normalize", {
        imageCount: Array.isArray(normalizedProduct.images) ? normalizedProduct.images.length : 0
      });
      const products = [normalizedProduct, ...(store.products || [])];
      await writeStore({
        ...store,
        categories: mergeCategories(store.categories || [], [{ value: normalizedProduct.category, label: normalizedProduct.category }]),
        products
      });
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "product_created",
        username: sellerUser.username,
        productId: normalizedProduct.id
      });
      requestMeta.statusCode = 200;
      logRouteSummary(requestMeta, {
        productId: normalizedProduct.id,
        imageCount: Array.isArray(normalizedProduct.images) ? normalizedProduct.images.length : 0
      });
      sendJson(res, 200, normalizedProduct);
      return;
    }

    if (req.method === "POST" && getProductActionMatch(url.pathname)) {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      const actingUser = ensureMarketplaceUser(store, session, res);
      if (!actingUser) {
        return;
      }

      const [, rawProductId, action] = getProductActionMatch(url.pathname);
      const productId = decodeURIComponent(rawProductId);
      const existingProduct = (store.products || []).find((item) => item.id === productId);

      if (!existingProduct) {
        sendJson(res, 404, { error: "Bidhaa haijapatikana." });
        return;
      }

      const updatedProduct = {
        ...existingProduct,
        likes: Number(existingProduct.likes || 0),
        views: Number(existingProduct.views || 0),
        viewedBy: Array.isArray(existingProduct.viewedBy) ? existingProduct.viewedBy : []
      };

      if (action === "like") {
        updatedProduct.likes += 1;
      }

      if (action === "view" && !updatedProduct.viewedBy.includes(actingUser.username)) {
        updatedProduct.views += 1;
        updatedProduct.viewedBy = [...updatedProduct.viewedBy, actingUser.username];
      }

      const products = (store.products || []).map((item) =>
        item.id === productId ? { ...updatedProduct, updatedAt: new Date().toISOString() } : item
      );

      await writeStore({ ...store, products });
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: action === "like" ? "product_liked" : "product_viewed",
        username: actingUser.username,
        productId
      });
      sendJson(res, 200, updatedProduct);
      return;
    }

    if (req.method === "PATCH" && getProductIdFromPath(url.pathname)) {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      const sellerUser = ensureMarketplaceUser(store, session, res);
      if (!sellerUser) {
        return;
      }

      const productId = getProductIdFromPath(url.pathname);
      logRouteMemoryStage(requestMeta, "before_product_update_collect_body");
      const payload = await collectBody(req);
      const existingProduct = (store.products || []).find((item) => item.id === productId);

      if (!existingProduct) {
        sendJson(res, 404, { error: "Bidhaa haijapatikana." });
        return;
      }

      if (existingProduct.uploadedBy !== sellerUser.username) {
        sendJson(res, 403, { error: "Huruhusiwi kuhariri bidhaa ya user mwingine." });
        return;
      }

      const candidateProduct = {
        ...existingProduct,
        ...payload,
        shop: typeof payload.shop === "string" && payload.shop.trim() ? payload.shop.trim() : existingProduct.shop || sellerUser.username,
        whatsapp: String(sellerUser.whatsappNumber || sellerUser.phoneNumber || "").replace(/\D/g, "").slice(0, 20),
        id: existingProduct.id,
        uploadedBy: existingProduct.uploadedBy,
        originalProductId: existingProduct.originalProductId || payload.originalProductId || "",
        originalSellerId: existingProduct.originalSellerId || payload.originalSellerId || "",
        resellerId: existingProduct.resellerId || payload.resellerId || "",
        resalePrice: existingProduct.resalePrice ?? payload.resalePrice ?? payload.price,
        resoldStatus: existingProduct.resoldStatus || payload.resoldStatus || ""
      };
      const productError = validateProductPayload(candidateProduct);
      if (productError) {
        sendJson(res, 400, { error: productError });
        return;
      }

      const updatedProduct = normalizeProductRecord(normalizeProductImages({
        ...candidateProduct,
        status: existingProduct.status === "rejected" ? "pending" : existingProduct.status,
        moderationNote: existingProduct.status === "rejected"
          ? "Re-submitted after seller update."
          : existingProduct.moderationNote || "",
        moderatedAt: existingProduct.status === "rejected" ? "" : (existingProduct.moderatedAt || ""),
        moderatedBy: existingProduct.status === "rejected" ? "" : (existingProduct.moderatedBy || ""),
        createdAt: existingProduct.createdAt || candidateProduct.createdAt
      }));
      logRouteMemoryStage(requestMeta, "after_product_update_normalize", {
        imageCount: Array.isArray(updatedProduct.images) ? updatedProduct.images.length : 0
      });

      const products = (store.products || []).map((item) =>
        item.id === productId ? updatedProduct : item
      );

      await writeStore({
        ...store,
        categories: mergeCategories(store.categories || [], [{ value: updatedProduct.category, label: updatedProduct.category }]),
        products
      });
      cleanupUnusedLocalImages(existingProduct, updatedProduct, products);
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "product_updated",
        username: sellerUser.username,
        productId
      });
      requestMeta.statusCode = 200;
      logRouteSummary(requestMeta, {
        productId,
        imageCount: Array.isArray(updatedProduct.images) ? updatedProduct.images.length : 0,
        updated: true
      });
      sendJson(res, 200, updatedProduct);
      return;
    }

    if (req.method === "DELETE" && getProductIdFromPath(url.pathname)) {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      const sellerUser = ensureMarketplaceUser(store, session, res);
      if (!sellerUser) {
        return;
      }

      const productId = getProductIdFromPath(url.pathname);
      const existingProduct = (store.products || []).find((item) => item.id === productId);

      if (!existingProduct) {
        sendJson(res, 404, { error: "Bidhaa haijapatikana." });
        return;
      }

      if (existingProduct.uploadedBy !== sellerUser.username) {
        sendJson(res, 403, { error: "Huruhusiwi kufuta bidhaa ya user mwingine." });
        return;
      }

      const products = (store.products || []).filter((item) => item.id !== productId);
      await writeStore({ ...store, products });
      cleanupUnusedLocalImages(existingProduct, null, products);
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "product_deleted",
        username: sellerUser.username,
        productId
      });
      sendJson(res, 200, { ok: true, id: productId });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    if (error?.message === "PAYLOAD_TOO_LARGE") {
      requestMeta.statusCode = 413;
      logStructuredEvent("warn", "route_error", {
        requestId: requestMeta.requestId,
        route: requestMeta.route,
        method: requestMeta.method,
        durationMs: Date.now() - requestMeta.startedAt,
        cfRay: requestMeta.cfRay || "",
        error: "PAYLOAD_TOO_LARGE",
        memory: getMemoryUsageSnapshot()
      });
      sendJson(res, 413, { error: "Data uliyotuma ni kubwa sana. Punguza picha au ukubwa wa request." });
      return;
    }

    if (error?.code === "INVALID_JSON") {
      requestMeta.statusCode = 400;
      logStructuredEvent("warn", "route_error", {
        requestId: requestMeta.requestId,
        route: requestMeta.route,
        method: requestMeta.method,
        durationMs: Date.now() - requestMeta.startedAt,
        cfRay: requestMeta.cfRay || "",
        error: "INVALID_JSON",
        memory: getMemoryUsageSnapshot()
      });
      sendJson(res, 400, {
        error: "JSON body si sahihi.",
        code: "invalid_json"
      });
      return;
    }

    await appendAuditLog({
      time: new Date().toISOString(),
      event: "server_error",
      message: sanitizePlainText(error?.message || "Unknown server error", 300)
    }).catch(() => {});
    requestMeta.statusCode = 500;
    logStructuredEvent("error", "route_error", {
      requestId: requestMeta.requestId,
      route: requestMeta.route,
      method: requestMeta.method,
      durationMs: Date.now() - requestMeta.startedAt,
      cfRay: requestMeta.cfRay || "",
      error: sanitizePlainText(error?.message || "Unknown server error", 300),
      memory: getMemoryUsageSnapshot()
    });
    safeConsole("error", "Unhandled server error", error?.message || error);
    sendJson(res, 500, { error: "Hitilafu ya mfumo imetokea. Jaribu tena." });
  }
}).listen(PORT, async () => {
  try {
    await initializeStoreAtBoot();
    console.log(`WINGA backend running on http://localhost:${PORT}${postgresStore ? " (PostgreSQL mode)" : " (File mode)"}`);
  } catch (error) {
    console.error("[WINGA] failed to initialize backend", {
      message: error?.message || String(error),
      stack: error?.stack || ""
    });
    process.exit(1);
  }
});
