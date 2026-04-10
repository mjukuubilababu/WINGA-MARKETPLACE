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
const NODE_ENV = process.env.NODE_ENV || "development";
const PAYMENT_WEBHOOK_SECRET = String(process.env.PAYMENT_WEBHOOK_SECRET || "").trim();
const ALLOW_UNVERIFIED_MANUAL_PAYMENTS = String(process.env.ALLOW_UNVERIFIED_MANUAL_PAYMENTS || "").toLowerCase() === "true";
const HASH_PREFIX = "scrypt";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_SEED_PASSWORD = process.env.ADMIN_SEED_PASSWORD || "";
const MODERATOR_SEED_PASSWORD = process.env.MODERATOR_SEED_PASSWORD || "";
const ADMIN_SEED = {
  username: "admin",
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
const ALLOWED_PROMOTION_TYPES = ["boost", "featured", "category_boost", "pin_top"];
const ALLOWED_PROMOTION_STATUSES = ["pending", "active", "expired", "disabled"];
const ALLOWED_IDENTITY_DOCUMENT_TYPES = ["NIDA", "VOTER_ID"];
const ALLOWED_VERIFICATION_STATUSES = ["pending", "verified", "rejected"];
const PROMOTION_CONFIG = {
  boost: { amount: 5000, durationDays: 3, label: "Boost Product" },
  featured: { amount: 10000, durationDays: 7, label: "Featured Section" },
  category_boost: { amount: 7000, durationDays: 5, label: "Category Boost" },
  pin_top: { amount: 12000, durationDays: 2, label: "Pin To Top" }
};
const MAX_IMAGE_COUNT = 5;
const MAX_IMAGE_SIZE_MB = 25;
const MAX_IMAGE_BINARY_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_IMAGE_BINARY_BYTES * 1.37) + 256;
const MAX_REQUEST_BODY_BYTES = (MAX_DATA_URL_LENGTH * MAX_IMAGE_COUNT) + (2 * 1024 * 1024);
const MAX_BACKUP_FILES = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const BUYER_CANCEL_WINDOW_MS = 48 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;
const WHATSAPP_VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const WHATSAPP_VERIFICATION_PREVIEW_MODE = NODE_ENV !== "production";
const RATE_LIMIT_RULES = {
  "/api/auth/login": { limit: 10, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/auth/admin-login": { limit: 8, windowMs: RATE_LIMIT_WINDOW_MS },
  "/api/auth/signup": { limit: 6, windowMs: RATE_LIMIT_WINDOW_MS },
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
      fs.writeFileSync(DATA_FILE, JSON.stringify({ categories: DEFAULT_CATEGORIES, users: seededUsers, products: [], sessions: [], orders: [], payments: [], messages: [], notifications: [], promotions: [], reviews: [] }, null, 2));
  }
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
  const users = Array.isArray(parsed.users) ? parsed.users.map(normalizeUserRecord) : [];
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

function writeLegacyStore(store) {
  ensureLocalArtifacts();
  if (fs.existsSync(DATA_FILE)) {
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

  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
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
  if (postgresStore) {
    await postgresStore.writeStore(store);
    return;
  }
  writeLegacyStore(store);
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

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, buildSecurityHeaders(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": statusCode >= 400 ? "no-store" : "no-cache"
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

function getCspHeader(req) {
  const allowedOrigins = Array.from(new Set(["'self'", ...getAllowedOrigins()]));
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    `connect-src ${allowedOrigins.join(" ")}`,
    "form-action 'self'"
  ].join("; ");
}

function buildSecurityHeaders(statusCode, extraHeaders = {}, req = null) {
  const corsOrigin = req ? getCorsOrigin(req) : "";
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": getCspHeader(req),
    ...extraHeaders
  };

  if (corsOrigin) {
    headers["Access-Control-Allow-Origin"] = corsOrigin;
    headers["Vary"] = "Origin";
    headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  }

  if (statusCode >= 400 && !headers["Cache-Control"]) {
    headers["Cache-Control"] = "no-store";
  }

  return headers;
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
    verificationStatus: user.verificationStatus || (user.verifiedSeller ? "verified" : "pending"),
    profileImage: user.profileImage || "",
    createdAt: user.createdAt || "",
    phoneVisibility,
    canReceivePhoneShare: Boolean(
      viewer
      && viewer.username !== user.username
      && viewer.role === "buyer"
      && user.role === "seller"
      && !isRestrictedUserStatus(user.status)
    )
  };
}

function buildSelfSessionPayload(user, token = null) {
  return {
    ...sanitizeUser(user, { viewer: user }),
    phoneNumber: String(user.phoneNumber || "").replace(/\D/g, "").slice(0, 20),
    pendingWhatsappNumber: String(user.pendingWhatsappNumber || "").replace(/\D/g, "").slice(0, 20),
    pendingWhatsappExpiresAt: user.pendingWhatsappExpiresAt || "",
    token
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
    verificationStatus: user.verificationStatus || (user.verifiedSeller ? "verified" : "pending"),
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
    verificationStatus: user.verificationStatus || (user.verifiedSeller ? "verified" : "pending"),
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
  const imageArchives = Array.isArray(normalizedProduct.imageArchives) ? normalizedProduct.imageArchives : [];
  const deliveredImages = (Array.isArray(normalizedProduct.images) ? normalizedProduct.images : [])
    .map((image, index) => resolveProductImageForDelivery(image, imageArchives[index] || ""))
    .filter(Boolean);
  const deliveredPrimaryImage = resolveProductImageForDelivery(
    normalizedProduct.image || deliveredImages[0] || "",
    imageArchives[0] || ""
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
  return safeProduct;
}

function buildVisibleProducts(store, viewer = null) {
  return (store.products || [])
    .map((product) => sanitizeVisibleProduct(product, viewer, store))
    .filter(Boolean);
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
    whatsappVerificationStatus: user.whatsappVerificationStatus || "verified",
    profileImage: user.profileImage || "",
    verificationStatus: user.verificationStatus || (user.verifiedSeller ? "verified" : "pending"),
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
  const username = normalizeIdentifier(user.username, 40);
  const fullName = sanitizePlainText(user.fullName || user.displayName || user.username, 120);
  const phoneNumber = String(user.phoneNumber || "").replace(/\D/g, "").slice(0, 20);
  const whatsappNumber = String(user.whatsappNumber || phoneNumber || "").replace(/\D/g, "").slice(0, 20);
  return {
    ...user,
    username,
    fullName,
    phoneNumber,
    whatsappNumber,
    whatsappVerificationStatus: user.whatsappVerificationStatus === "pending" ? "pending" : "verified",
    whatsappVerifiedAt: user.whatsappVerifiedAt || (whatsappNumber ? (user.createdAt || new Date().toISOString()) : ""),
    pendingWhatsappNumber: String(user.pendingWhatsappNumber || "").replace(/\D/g, "").slice(0, 20),
    pendingWhatsappCodeHash: sanitizePlainText(user.pendingWhatsappCodeHash, 160),
    pendingWhatsappRequestedAt: user.pendingWhatsappRequestedAt || "",
    pendingWhatsappExpiresAt: user.pendingWhatsappExpiresAt || "",
    nationalId: sanitizePlainText(user.nationalId, 40).toUpperCase(),
    identityDocumentNumber: sanitizePlainText(user.identityDocumentNumber || user.nationalId, 40).toUpperCase(),
    primaryCategory: sanitizePlainText(user.primaryCategory, 60).toLowerCase(),
    role: isValidRole(user.role) ? user.role : (username === "admin" ? "admin" : "seller"),
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
      : (Boolean(user.verifiedSeller) ? "verified" : ""),
    verificationSubmittedAt: user.verificationSubmittedAt || user.createdAt || new Date().toISOString(),
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
  return {
    ...product,
    name: sanitizePlainText(product.name, 120),
    price: normalizeOptionalPrice(product.price),
    shop: sanitizePlainText(product.shop, 120),
    whatsapp: String(product.whatsapp || "").replace(/\D/g, "").slice(0, 20),
    uploadedBy: normalizeIdentifier(product.uploadedBy, 40),
    category: sanitizePlainText(product.category, 60).toLowerCase(),
    status: isValidProductStatus(product.status) ? product.status : (hasLegacyModerationFields ? inferredStatus : "approved"),
    availability: product.availability === "sold_out" ? "sold_out" : "available",
    moderationNote: sanitizePlainText(product.moderationNote, 240),
    moderatedAt: product.moderatedAt || "",
    moderatedBy: normalizeIdentifier(product.moderatedBy, 40),
    originalProductId,
    originalSellerId,
    resellerId,
    resalePrice: derivedResoldStatus === "reposted" ? (normalizedResalePrice ?? normalizeOptionalPrice(product.price)) : null,
    resoldStatus: derivedResoldStatus,
    createdAt: product.createdAt || now,
    updatedAt: product.updatedAt || now
  };
}

function normalizeOrderRecord(order) {
  return {
    ...order,
    productName: sanitizePlainText(order.productName, 120),
    productImage: order.productImage || "",
    shop: sanitizePlainText(order.shop, 120),
    sellerUsername: normalizeIdentifier(order.sellerUsername, 40),
    buyerUsername: normalizeIdentifier(order.buyerUsername, 40),
    status: isValidOrderStatus(order.status) ? order.status : "placed",
    paymentStatus: isValidPaymentStatus(order.paymentStatus) ? order.paymentStatus : ((order.status === "paid" || order.status === "confirmed" || order.status === "delivered") ? "paid" : "pending"),
    paymentMethod: sanitizePlainText(order.paymentMethod || "mobile_money", 40).toLowerCase() || "mobile_money",
    paymentPhoneNumber: String(order.paymentPhoneNumber || "").replace(/\D/g, "").slice(0, 20),
    transactionId: sanitizePlainText(order.transactionId, 80).toUpperCase(),
    paymentSubmittedAt: order.paymentSubmittedAt || order.createdAt || new Date().toISOString(),
    paymentConfirmedAt: order.paymentConfirmedAt || "",
    paymentConfirmedBy: normalizeIdentifier(order.paymentConfirmedBy, 40),
    createdAt: order.createdAt || new Date().toISOString()
  };
}

function normalizePaymentRecord(payment) {
  const now = new Date().toISOString();
  return {
    id: sanitizePlainText(payment.id, 80) || `payment-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    orderId: sanitizePlainText(payment.orderId, 80),
    buyerUsername: normalizeIdentifier(payment.buyerUsername, 40),
    amountPaid: Number(payment.amountPaid || 0),
    paymentMethod: sanitizePlainText(payment.paymentMethod || "mobile_money", 40).toLowerCase() || "mobile_money",
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
    body = "Order iko tayari kwa uthibitisho wa muuzaji na maandalizi ya kuendelea.";
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
    variant: stage === "cancelled" ? "warning" : "success",
    isRead: false,
    createdAt: new Date().toISOString()
  });
}

function normalizePromotionRecord(promotion) {
  const now = new Date().toISOString();
  const type = ALLOWED_PROMOTION_TYPES.includes(promotion.type) ? promotion.type : "boost";
  const config = PROMOTION_CONFIG[type] || PROMOTION_CONFIG.boost;
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

function readAuthToken(req) {
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

function isValidImageValue(value) {
  if (typeof value !== "string" || !value) return false;
  if (value.startsWith("data:image/")) {
    return value.length <= MAX_DATA_URL_LENGTH;
  }
  return /^https?:\/\//i.test(value) || /^\/uploads\/[a-zA-Z0-9._-]+$/.test(value);
}

function isValidPrivateImageValue(value) {
  return typeof value === "string"
    && /^data:image\/(jpeg|png|webp|gif);base64,/i.test(value)
    && value.length > 32
    && value.length <= MAX_DATA_URL_LENGTH;
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
  const match = typeof value === "string"
    ? value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    : null;

  if (!match) {
    return normalizedValue;
  }

  const [, mimeType, encoded] = match;
  const extension = getMimeExtension(mimeType);
  if (!extension) {
    throw new Error("Aina ya picha haijaruhusiwa.");
  }

  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;
  const filePath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(filePath, Buffer.from(encoded, "base64"));
  return `/uploads/${fileName}`;
}

function buildPersistentImageArchive(value) {
  if (isValidPrivateImageValue(value)) {
    return value;
  }

  const normalizedValue = normalizeStoredImageReference(value);
  const filePath = getLocalUploadFilePath(normalizedValue);
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }

  const mimeType = getMimeTypeFromExtension(path.extname(filePath));
  if (!mimeType) {
    return "";
  }

  const buffer = fs.readFileSync(filePath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function resolveProductImageForDelivery(value, archiveValue) {
  const normalizedValue = normalizeStoredImageReference(value);
  if (typeof normalizedValue === "string" && normalizedValue.startsWith("/uploads/")) {
    const filePath = getLocalUploadFilePath(normalizedValue);
    if (!filePath || !fs.existsSync(filePath)) {
      return isValidPrivateImageValue(archiveValue) ? archiveValue : normalizedValue;
    }
  }
  return normalizedValue;
}

function normalizeProductImages(product) {
  const sourceImages = Array.isArray(product.images) ? product.images : [];
  const existingArchives = Array.isArray(product.imageArchives)
    ? product.imageArchives.map((value) => (isValidPrivateImageValue(value) ? value : ""))
    : [];
  const images = sourceImages.map(saveDataUrlImage);
  const imageArchives = images.map((image, index) => {
    const sourceImage = sourceImages[index] || "";
    const existingArchive = existingArchives[index] || "";
    const preferredArchiveSource = isValidPrivateImageValue(sourceImage)
      ? sourceImage
      : (existingArchive || sourceImage || image);
    return buildPersistentImageArchive(preferredArchiveSource);
  });
  return {
    ...product,
    images,
    image: images[0] || normalizeStoredImageReference(product.image) || "",
    imageArchives
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
  const normalizedUsers = (store.users || []).map(normalizeUserRecord);
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
    const normalizedProduct = normalizeProductRecord(normalizeProductImages(product));
    const imagesChanged = JSON.stringify(normalizedProduct.images) !== JSON.stringify(originalImages);
    const archivesChanged = JSON.stringify(normalizedProduct.imageArchives || []) !== JSON.stringify(originalArchives);
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
        sessions: normalizedSessions
    },
    didChange: false,
    auditEntry: null
  };
}

async function initializeStoreAtBoot() {
  ensureLocalArtifacts();

  if (postgresStore) {
    await postgresStore.init(() => readLegacyStore());
  }

  const rawStore = await readStore();
  const cleanedStore = cleanupSessions(rawStore);
  const sessionsChanged = (rawStore.sessions || []).length !== (cleanedStore.sessions || []).length;
  const migrationResult = migrateLegacyStore(cleanedStore);
  const migratedStore = migrationResult.store;
  const shouldWrite = sessionsChanged || migrationResult.didChange;

  if (shouldWrite) {
    await writeStore(migratedStore);
  }

  if (migrationResult.auditEntry) {
    await appendAuditLog(migrationResult.auditEntry);
  }

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
  if (!isValidNationalId(payload.nationalId || "")) {
    return "Namba ya kitambulisho si sahihi. Tumia herufi au namba 8 hadi 20.";
  }
  if (payload.role === "buyer") {
    if (!isNonEmptyString(payload.fullName, 3, 120)) {
      return "Jina kamili si sahihi.";
    }
    return "";
  }
  const { idType, idNumber, idImage } = getNormalizedSignupIdentity(payload);
  if (!isSafeIdentifier(payload.username, 3, 40)) {
    return "Username si sahihi.";
  }
  if (["admin", "moderator", "support", "system"].includes(normalizeIdentifier(payload.username, 40))) {
    return "Username hiyo hairuhusiwi.";
  }
  if (!ALLOWED_IDENTITY_DOCUMENT_TYPES.includes(idType)) {
    return "Please select your ID type";
  }
  if (!isValidNationalId(idNumber || "")) {
    return "Please enter your ID number";
  }
  if (payload.nationalId && idNumber && String(idNumber) !== String(payload.nationalId || "").toUpperCase()) {
    return "The card number and the number you entered do not match. Please enter the same number shown on the card.";
  }
  if (!idImage) {
    return "Please upload your ID image";
  }
  if (!isValidPrivateImageValue(idImage || "")) {
    return "ID image is invalid.";
  }
  return "";
}

function validateUserModerationPayload(payload) {
  const hasStatus = typeof payload?.status === "string" && payload.status.length > 0;
  const hasVerificationUpdate = Boolean(payload?.verificationStatus) || typeof payload?.verifiedSeller === "boolean";
  if (!payload || (!hasStatus && !hasVerificationUpdate)) {
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
  if (payload.productId && !isNonEmptyString(payload.productId, 3, 80)) {
    return "Conversation product si sahihi.";
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

  return {
    usersCount: (store.users || []).length,
    flaggedUsers: (store.users || []).filter((user) => user.status === "flagged").length,
    totalProducts: visibleProducts.length,
    approvedProducts: isAdmin ? approvedProducts.length : visibleProducts.filter((product) => product.status === "approved").length,
    pendingProducts: isAdmin ? pendingProducts.length : visibleProducts.filter((product) => product.status === "pending").length,
    rejectedProducts: isAdmin ? rejectedProducts.length : visibleProducts.filter((product) => product.status === "rejected").length,
    totalViews: visibleProducts.reduce((sum, product) => sum + Number(product.views || 0), 0),
    totalLikes: visibleProducts.reduce((sum, product) => sum + Number(product.likes || 0), 0),
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
  if (normalized.paymentStatus !== "paid") {
    return "pending";
  }
  if (new Date(normalized.endDate || 0).getTime() <= now) {
    return "expired";
  }
  return normalized.status === "pending" ? "active" : normalized.status;
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

function buildConversationId(senderId, receiverId, productId = "") {
  return [senderId, receiverId].filter(Boolean).sort().join("::") + `::${productId || ""}`;
}

function markConversationRead(store, username, withUser, productId = "") {
  const now = new Date().toISOString();
  const conversationId = buildConversationId(username, withUser, productId);
  let didChange = false;

  const messages = (store.messages || []).map((message) => {
    const normalized = normalizeMessageRecord(message);
    if (
      normalized.conversationId === conversationId
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
      && normalized.conversationId === conversationId
      && normalized.type === "message"
      && !normalized.isRead
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

  if (nextStatus === "confirmed") {
    return isSeller && order.status === "paid" && order.paymentStatus === "paid";
  }

  if (nextStatus === "delivered") {
    return isBuyer && order.status === "confirmed";
  }

  if (nextStatus === "cancelled") {
    return canBuyerCancelOrder(order, session);
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

  return {
    ...store,
    orders: (store.orders || []).map((order) => order.id === orderId ? updatedOrder : order),
    payments: (store.payments || []).map((payment) => payment.orderId === orderId ? updatedPayment : payment)
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
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BODY_BYTES) {
        reject(new Error("PAYLOAD_TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
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
  if (/^\/api\/notifications\/[^/]+\/read$/.test(pathname)) {
    return {
      limit: 40,
      windowMs: RATE_LIMIT_WINDOW_MS,
      key: "/api/notifications/:id/read"
    };
  }
  return null;
}

function isRateLimited(req, store) {
  if (process.env.WINGA_DISABLE_RATE_LIMIT === "1") {
    return false;
  }
  const rule = getRateLimitRule(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (!rule) {
    return false;
  }

  const identity = getRateLimitIdentity(req, store);
  const key = `${identity}:${req.method}:${rule.key}`;
  const now = Date.now();
  const existing = rateLimitStore.get(key) || [];
  const fresh = existing.filter((timestamp) => now - timestamp < rule.windowMs);
  fresh.push(now);
  rateLimitStore.set(key, fresh);
  return fresh.length > rule.limit;
}

http.createServer(async (req, res) => {
  res.__wingaReq = req;
  if (req.method === "OPTIONS") {
    res.writeHead(204, buildSecurityHeaders(204, {}, req));
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  let store = migrateLegacyStore(cleanupSessions(await readStore())).store;
  const clientIp = getClientIp(req);

  if (isRateLimited(req, store)) {
    await appendAuditLog({
      time: new Date().toISOString(),
      ip: clientIp,
      method: req.method,
      path: url.pathname,
      event: "rate_limited"
    });
    sendJson(res, 429, { error: "Majaribio ni mengi sana, subiri kidogo ujaribu tena." });
    return;
  }

  try {
    if (req.method === "GET" && url.pathname.startsWith("/uploads/")) {
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

      res.writeHead(200, buildSecurityHeaders(200, {
        "Content-Type": contentTypes[extension] || "application/octet-stream",
        "Cache-Control": "public, max-age=3600"
      }, req));
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/bootstrap") {
      sendJson(res, 200, {
        categories: store.categories || [],
        products: buildVisibleProducts(store, null)
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      const backupStatus = getBackupStatus();
      sendJson(res, 200, {
        ok: true,
        time: new Date().toISOString(),
        environment: NODE_ENV,
        storageMode: runtimeConfiguration.storageMode,
        configWarningsCount: runtimeConfiguration.warnings.length,
        backupStatus,
        users: (store.users || []).length,
        products: (store.products || []).length
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/messages/stream") {
      const token = sanitizePlainText(url.searchParams.get("token") || "", 120);
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

    if (req.method === "GET" && url.pathname === "/api/categories") {
      sendJson(res, 200, store.categories || mergeCategories());
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

      if (targetUsername === "admin") {
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
      if (requestedVerificationUpdate && targetUser.role !== "seller") {
        sendJson(res, 400, { error: "Verification review inaruhusiwa kwa seller accounts tu." });
        return;
      }
      if (!isAdminSession(session) && requestedStatusChange) {
        await denyJson(res, 403, "Moderator anaweza kureview verification tu. Kususpend au kuban ni admin pekee.", {
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "user_moderation_denied",
          username: session.username,
          targetUserId: targetUsername,
          reason: "moderator_status_change_blocked"
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

      const now = new Date().toISOString();
      const nextVerificationStatus = payload.verificationStatus
        || (typeof payload.verifiedSeller === "boolean"
          ? (payload.verifiedSeller ? "verified" : (targetUser.verificationStatus === "verified" ? "pending" : targetUser.verificationStatus || "pending"))
          : targetUser.verificationStatus);
      const updatedUser = normalizeUserRecord({
        ...targetUser,
        status: requestedStatusChange ? payload.status : targetUser.status,
        moderationReason: requestedStatusChange ? (payload.reason || "") : (payload.reason || targetUser.moderationReason || ""),
        moderationNote: payload.note || targetUser.moderationNote || "",
        verifiedSeller: typeof payload.verifiedSeller === "boolean"
          ? payload.verifiedSeller
          : nextVerificationStatus === "verified",
        verificationStatus: nextVerificationStatus || targetUser.verificationStatus || "",
        moderatedAt: now,
        moderatedBy: session.username,
        updatedAt: now
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
      const moderationAction = normalizeModerationActionRecord({
        adminUsername: session.username,
        actionType: requestedStatusChange
          ? `user_${payload.status}`
          : `user_verification_${updatedUser.verificationStatus || "pending"}`,
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
        reason: payload.reason || updatedUser.verificationStatus || ""
      });
      sendJson(res, 200, sanitizeAdminUser(updatedUser));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/products") {
      const token = readAuthToken(req);
      const session = token ? findSession(store, token) : null;
      const viewer = session ? getUserByUsername(store, session.username) : null;
      sendJson(res, 200, buildVisibleProducts(store, viewer));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/signup") {
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

      if (normalizedRole !== "buyer" && users.find((item) => normalizeIdentifier(item.username) === payload.username)) {
        await appendAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "signup_rejected",
          username: payload.username,
          reason: "duplicate_username"
        });
        sendJson(res, 409, { error: "Username hiyo tayari imetumika." });
        return;
      }

      if (normalizedRole === "buyer" && users.find((item) => normalizeIdentifier(item.fullName || "", 120) === normalizeIdentifier(payload.fullName || "", 120))) {
        await appendAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "signup_rejected",
          username: payload.username,
          reason: "duplicate_full_name"
        });
        sendJson(res, 409, { error: "Jina hilo tayari limetumika. Tumia namba ya simu kuingia au tumia jina tofauti." });
        return;
      }

      if (users.find((item) => String(item.phoneNumber || "") === payload.phoneNumber)) {
        await appendAuditLog({
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

      const sellerIdentity = normalizedRole === "seller"
        ? getNormalizedSignupIdentity(payload)
        : { idType: "", idNumber: sanitizePlainText(payload.nationalId, 40).toUpperCase(), idImage: "" };
      const normalizedNationalId = normalizedRole === "seller"
        ? sellerIdentity.idNumber
        : sanitizePlainText(payload.nationalId, 40).toUpperCase();

      if (users.find((item) => String(item.nationalId || item.identityDocumentNumber || "").toUpperCase() === normalizedNationalId)) {
        await appendAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "signup_rejected",
          username: payload.username,
          reason: "duplicate_national_id"
        });
        sendJson(res, 409, { error: "This identity number is already registered. Please contact the moderator." });
        return;
      }

      const createdUser = {
        ...payload,
        role: normalizedRole,
        primaryCategory: "",
        nationalId: normalizedNationalId,
        status: "active",
        moderationReason: "",
        moderationNote: "",
        verifiedSeller: normalizedRole === "seller",
        profileImage: payload.profileImage || "",
        identityDocumentType: normalizedRole === "seller" ? sellerIdentity.idType : "",
        identityDocumentNumber: normalizedRole === "seller" ? sellerIdentity.idNumber : "",
        identityDocumentImage: normalizedRole === "seller" ? sellerIdentity.idImage : "",
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
      await writeStore({
        ...store,
        categories: mergeCategories(store.categories || []),
        users,
        sessions: [...store.sessions, session]
      });
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "signup_success",
        username: createdUser.username
      });
      sendJson(res, 200, {
        ...buildSelfSessionPayload(createdUser, session.token)
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const payload = await collectBody(req);
      const rawIdentifier = sanitizePlainText(payload?.identifier || payload?.username, 120);
      const normalizedIdentifier = normalizeIdentifier(rawIdentifier, 120);
      const normalizedPhone = String(rawIdentifier || "").replace(/\D/g, "").slice(0, 20);
      if (!payload || !isNonEmptyString(rawIdentifier, 3, 120) || !isNonEmptyString(payload.password, 4, 120)) {
        sendJson(res, 400, { error: "Identifier au password si sahihi." });
        return;
      }

      const users = store.users || [];
      const userIndex = users.findIndex((item) =>
        normalizeIdentifier(item.username, 120) === normalizedIdentifier
        || normalizeIdentifier(item.fullName || "", 120) === normalizedIdentifier
        || String(item.phoneNumber || "") === normalizedPhone
      );
      const user = userIndex >= 0 ? users[userIndex] : null;

      if (!user || !verifyPassword(payload.password, user.password)) {
        await appendAuditLog({
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
        await appendAuditLog({
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
        await appendAuditLog({
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
      await writeStore({
        ...store,
        sessions: [...nextSessions, session]
      });
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "login_success",
        username: freshUser.username
      });
      sendJson(res, 200, {
        ...buildSelfSessionPayload(freshUser, session.token)
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/admin-login") {
      const payload = await collectBody(req);
      const rawIdentifier = sanitizePlainText(payload?.identifier || payload?.username, 120);
      const normalizedIdentifier = normalizeIdentifier(rawIdentifier, 120);
      const normalizedPhone = String(rawIdentifier || "").replace(/\D/g, "").slice(0, 20);
      if (!payload || !isNonEmptyString(rawIdentifier, 3, 120) || !isNonEmptyString(payload.password, 4, 120)) {
        sendJson(res, 400, { error: "Identifier au password si sahihi." });
        return;
      }

      const users = store.users || [];
      const userIndex = users.findIndex((item) =>
        normalizeIdentifier(item.username, 120) === normalizedIdentifier
        || normalizeIdentifier(item.fullName || "", 120) === normalizedIdentifier
        || String(item.phoneNumber || "") === normalizedPhone
      );
      const user = userIndex >= 0 ? users[userIndex] : null;

      if (!user || !verifyPassword(payload.password, user.password) || !isStaffRole(user.role)) {
        await appendAuditLog({
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
        await appendAuditLog({
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
      await writeStore({
        ...store,
        sessions: [...nextSessions, session]
      });
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "admin_login_success",
        username: freshUser.username
      });
      sendJson(res, 200, {
        ...buildSelfSessionPayload(freshUser, session.token)
      });
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
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/session") {
      const token = readAuthToken(req);
      const session = findSession(store, token);
      if (!session) {
        await appendAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "session_invalid",
          reason: "missing_or_expired"
        });
        sendJson(res, 401, { error: "Session imeisha au si sahihi." });
        return;
      }

      const user = (store.users || []).find((item) => item.username === session.username);
      if (!user) {
        await appendAuditLog({
          time: new Date().toISOString(),
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "session_invalid",
          username: session.username,
          reason: "user_not_found"
        });
        sendJson(res, 401, { error: "Session user hakupatikana." });
        return;
      }

      if (isRestrictedUserStatus(user.status)) {
        await appendAuditLog({
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

      sendJson(res, 200, {
        ...buildSelfSessionPayload(user, session.token)
      });
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
        const productId = sanitizePlainText(payload.productId, 80);
        const updateResult = markConversationRead(store, user.username, targetUser, productId);
        if (updateResult.didChange) {
          store = updateResult.store;
          await writeStore(store);
          emitLiveEvent(user.username, "conversation_read", {
            conversationId: updateResult.conversationId,
            withUser: targetUser,
            productId,
            readAt: updateResult.readAt
          });
          emitLiveEvent(targetUser, "message_read", {
            conversationId: updateResult.conversationId,
            byUser: user.username,
            productId,
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

        sendJson(res, 200, buildPromotionsSummary(store, { username: user.username }));
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
        if (product.status !== "approved") {
          sendJson(res, 400, { error: "Promotion inaruhusiwa kwa bidhaa approved tu." });
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

        const hasExistingActivePromotion = buildPromotionsSummary(store, { username: seller.username, productId: product.id })
          .some((promotion) => promotion.status === "active" && promotion.type === payload.type);
        if (hasExistingActivePromotion) {
          sendJson(res, 409, { error: "Bidhaa hii tayari ina promotion ya type hiyo iliyo active." });
          return;
        }

        const config = PROMOTION_CONFIG[payload.type] || PROMOTION_CONFIG.boost;
        const now = new Date().toISOString();
        const promotion = normalizePromotionRecord({
          productId: product.id,
          sellerUsername: seller.username,
          type: payload.type,
          status: "active",
          amountPaid: config.amount,
          paymentMethod: "mobile_money",
          transactionReference,
          paymentStatus: "paid",
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

      const products = (store.products || []).map((item) =>
        item.id === productId ? moderatedProduct : item
      );
      await writeStore({ ...store, products });
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
      const nextWhatsappNumber = String(payload?.whatsappNumber || "").replace(/\D/g, "").slice(0, 20);
      if (!isValidWhatsapp(nextWhatsappNumber)) {
        sendJson(res, 400, { error: "Weka namba mpya ya WhatsApp sahihi." });
        return;
      }

      const activeWhatsappNumber = String(user.whatsappNumber || user.phoneNumber || "").replace(/\D/g, "").slice(0, 20);
      if (nextWhatsappNumber === activeWhatsappNumber) {
        sendJson(res, 409, { error: "Namba hiyo tayari ndiyo WhatsApp number ya account yako." });
        return;
      }

      const conflictingUser = (store.users || []).find((item) =>
        item.username !== user.username
        && (
          String(item.phoneNumber || "").replace(/\D/g, "").slice(0, 20) === nextWhatsappNumber
          || String(item.whatsappNumber || "").replace(/\D/g, "").slice(0, 20) === nextWhatsappNumber
          || String(item.pendingWhatsappNumber || "").replace(/\D/g, "").slice(0, 20) === nextWhatsappNumber
        )
      );
      if (conflictingUser) {
        sendJson(res, 409, { error: "Namba hiyo tayari inatumika kwenye account nyingine." });
        return;
      }

      const now = new Date().toISOString();
      const verificationCode = generateVerificationCode();
      const expiresAt = new Date(Date.now() + WHATSAPP_VERIFICATION_CODE_TTL_MS).toISOString();
      const users = (store.users || []).map((item) =>
        item.username === user.username
          ? normalizeUserRecord({
              ...item,
              whatsappVerificationStatus: "pending",
              pendingWhatsappNumber: nextWhatsappNumber,
              pendingWhatsappCodeHash: hashVerificationCode(verificationCode),
              pendingWhatsappRequestedAt: now,
              pendingWhatsappExpiresAt: expiresAt,
              updatedAt: now
            })
          : item
      );

      await writeStore({
        ...store,
        users
      });

      await appendAuditLog({
        time: now,
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "whatsapp_change_requested",
        username: user.username,
        pendingWhatsappNumber: nextWhatsappNumber,
        deliveryMode: WHATSAPP_VERIFICATION_PREVIEW_MODE ? "preview" : "provider_unconfigured"
      });

      if (!WHATSAPP_VERIFICATION_PREVIEW_MODE) {
        sendJson(res, 503, {
          error: "WhatsApp verification provider bado haijaunganishwa kwenye production. Wasiliana na support kwa +255 695 237 798."
        });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        pendingWhatsappNumber: nextWhatsappNumber,
        expiresAt,
        deliveryMode: "preview",
        previewCode: verificationCode
      });
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
      const code = String(payload?.code || "").trim();
      if (!isValidVerificationCode(code)) {
        sendJson(res, 400, { error: "Weka verification code ya tarakimu 6." });
        return;
      }

      if (!user.pendingWhatsappNumber || !user.pendingWhatsappCodeHash || !user.pendingWhatsappExpiresAt) {
        sendJson(res, 409, { error: "Hakuna mabadiliko ya WhatsApp yanayosubiri verification." });
        return;
      }

      if (new Date(user.pendingWhatsappExpiresAt).getTime() < Date.now()) {
        const expiredUsers = (store.users || []).map((item) =>
          item.username === user.username
            ? normalizeUserRecord(clearPendingWhatsappState({
                ...item,
                whatsappVerificationStatus: item.whatsappNumber ? "verified" : "pending",
                updatedAt: new Date().toISOString()
              }))
            : item
        );
        await writeStore({ ...store, users: expiredUsers });
        sendJson(res, 410, { error: "Verification code imeexpire. Omba code mpya ya WhatsApp." });
        return;
      }

      if (hashVerificationCode(code) !== user.pendingWhatsappCodeHash) {
        sendJson(res, 401, { error: "Verification code ya WhatsApp si sahihi." });
        return;
      }

      const now = new Date().toISOString();
      const verifiedWhatsappNumber = String(user.pendingWhatsappNumber || "").replace(/\D/g, "").slice(0, 20);
      const users = (store.users || []).map((item) =>
        item.username === user.username
          ? normalizeUserRecord(clearPendingWhatsappState({
              ...item,
              whatsappNumber: verifiedWhatsappNumber,
              whatsappVerificationStatus: "verified",
              whatsappVerifiedAt: now,
              updatedAt: now
            }))
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
      const products = applySellerWhatsappToProducts(store, user.username, verifiedWhatsappNumber);

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
        event: "whatsapp_change_verified",
        username: user.username,
        whatsappNumber: verifiedWhatsappNumber
      });

      sendJson(res, 200, buildSelfSessionPayload(updatedUser, session.token));
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
      if (!payload || !isValidPrivateImageValue(payload.profileImage || "")) {
        sendJson(res, 400, { error: "Profile photo si sahihi." });
        return;
      }

      const now = new Date().toISOString();
      const users = (store.users || []).map((item) =>
        item.username === user.username
          ? normalizeUserRecord({
              ...item,
              profileImage: payload.profileImage,
              updatedAt: now
            })
          : item
      );

      const updatedUser = users.find((item) => item.username === user.username);
      if (!updatedUser) {
        await appendAuditLog({
          time: now,
          ip: clientIp,
          method: req.method,
          path: url.pathname,
          event: "profile_photo_update_rejected",
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
              primaryCategory: updatedUser?.primaryCategory || item.primaryCategory || ""
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
        event: "profile_photo_updated",
        username: user.username
      });

      sendJson(res, 200, {
        ...buildSelfSessionPayload(updatedUser, session.token)
      });
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
        paymentPhoneNumber: product.whatsapp || "",
        transactionId,
        paymentSubmittedAt: now,
        paymentConfirmedAt: "",
        paymentConfirmedBy: "",
        createdAt: now
      });

      const payment = normalizePaymentRecord({
        id: `payment-${order.id}`,
        orderId: order.id,
        buyerUsername: session.username,
        amountPaid: productPrice,
        paymentMethod: "mobile_money",
        transactionReference: transactionId,
        receiptNumber: transactionId,
        paymentStatus: "pending",
        payerDetails: {
          name: session.username,
          phoneNumber: buyerUser.phoneNumber || ""
        },
        rawGatewayResponse: {
          provider: "manual_mobile_money",
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
      store = { ...store, orders, payments, notifications };
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

      const updatedOrder = normalizeOrderRecord({
        ...existingOrder,
        status: nextStatus,
        paymentStatus: nextStatus === "paid" ? "paid" : existingOrder.paymentStatus,
        paymentConfirmedAt: nextStatus === "paid" ? new Date().toISOString() : existingOrder.paymentConfirmedAt,
        paymentConfirmedBy: nextStatus === "paid" ? session.username : existingOrder.paymentConfirmedBy
      });

      const orders = (store.orders || []).map((order) =>
        order.id === orderId ? updatedOrder : order
      );

      const notificationRecipient = session.username === existingOrder.sellerUsername
        ? existingOrder.buyerUsername
        : existingOrder.sellerUsername;
      const orderNotification = buildOrderNotification({
        recipientId: notificationRecipient,
        actorUsername: session.username,
        order: updatedOrder,
        stage: nextStatus
      });
      const notifications = [orderNotification, ...((store.notifications || []).map(normalizeNotificationRecord))];
      store = { ...store, orders, notifications };
      await writeStore(store);
      await appendAuditLog({
        time: new Date().toISOString(),
        ip: clientIp,
        method: req.method,
        path: url.pathname,
        event: "order_status_updated",
        username: session.username,
        orderId,
        status: nextStatus
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

      const products = await collectBody(req);
      await writeStore({ ...store, products: Array.isArray(products) ? products : [] });
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
      sendJson(res, 413, { error: "Data uliyotuma ni kubwa sana. Punguza picha au ukubwa wa request." });
      return;
    }

    await appendAuditLog({
      time: new Date().toISOString(),
      event: "server_error",
      message: sanitizePlainText(error?.message || "Unknown server error", 300)
    }).catch(() => {});
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
