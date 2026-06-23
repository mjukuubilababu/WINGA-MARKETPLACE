const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public");
const assetVersion = process.env.WINGA_ASSET_VERSION || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const requiredRootFiles = [
  "_headers",
  "_redirects",
  "index.html",
  "manifest.webmanifest",
  "manifest-v4.webmanifest",
  "manifest.json",
  "offline.html",
  "app-shell.html",
  "splash-logo.png",
  "share-og.svg",
  "sw.js",
  "apple-touch-icon.png",
  "apple-touch-icon-v3.png",
  "winga-icon-192.png",
  "winga-icon-192-v3.png",
  "winga-icon-512.png",
  "winga-icon-512-v3.png",
  "winga-maskable-icon.png",
  "winga-maskable-icon-v3.png",
  "winga-maskable-icon.svg",
  "winga-icon.svg",
  "winga-screenshot-wide.png",
  "winga-screenshot-mobile.png",
  "style.css",
  "app.js",
  "app-core.js",
  "data-service.js",
  "mock-data.js",
  "winga-config.js"
];

const fileCopies = [
  ["_headers", "_headers"],
  ["_redirects", "_redirects"],
  ["index.html", "index.html"],
  ["manifest.webmanifest", "manifest.webmanifest"],
  ["manifest-v4.webmanifest", "manifest-v4.webmanifest"],
  ["manifest.json", "manifest.json"],
  ["offline.html", "offline.html"],
  ["app-shell.html", "app-shell.html"],
  ["splash-logo.png", "splash-logo.png"],
  ["share-og.svg", "share-og.svg"],
  ["sw.js", "sw.js"],
  ["apple-touch-icon.png", "apple-touch-icon.png"],
  ["apple-touch-icon-v3.png", "apple-touch-icon-v3.png"],
  ["winga-icon-192.png", "winga-icon-192.png"],
  ["winga-icon-192-v3.png", "winga-icon-192-v3.png"],
  ["winga-icon-512.png", "winga-icon-512.png"],
  ["winga-icon-512-v3.png", "winga-icon-512-v3.png"],
  ["winga-maskable-icon.png", "winga-maskable-icon.png"],
  ["winga-maskable-icon-v3.png", "winga-maskable-icon-v3.png"],
  ["winga-maskable-icon.svg", "winga-maskable-icon.svg"],
  ["winga-icon.svg", "winga-icon.svg"],
  ["winga-screenshot-wide.png", "winga-screenshot-wide.png"],
  ["winga-screenshot-mobile.png", "winga-screenshot-mobile.png"],
  ["style.css", "style.css"],
  ["app.js", "app.js"],
  ["app-core.js", "app-core.js"],
  ["data-service.js", "data-service.js"],
  ["mock-data.js", "mock-data.js"],
  ["winga-config.js", "winga-config.js"]
];

const bundledModuleSources = [
  "src/core/module-registry.js",
  "src/config/categories.js",
  "src/config/chat.js",
  "src/config/promotions.js",
  "src/state/ui-state.js",
  "src/state/runtime-state.js",
  "src/auth/permissions.js",
  "src/monitoring/observability.js",
  "src/components/dom-helpers.js",
  "src/components/ui-helpers.js",
  "src/promotions/helpers.js",
  "src/hero/ui.js",
  "src/categories/ui.js",
  "src/navigation/controller.js",
  "src/navigation/chrome.js",
  "src/marketplace/discovery.js",
  "src/marketplace/image-loader.js",
  "src/marketplace/ui.js",
  "src/reviews/reviews.js",
  "src/requests/request-box.js",
  "src/products/actions.js",
  "src/chat/ui.js",
  "src/chat/controller.js",
  "src/admin/ui.js",
  "src/admin/controller.js",
  "src/profile/ui.js",
  "src/profile/controller.js",
  "src/product-detail/ui.js",
  "src/product-detail/controller.js"
];

const criticalBootCss = `*{box-sizing:border-box}html,body{background:#ff6a00}body.app-booting{margin:0;min-height:100vh;overflow:hidden;background:#ff6a00}#boot-overlay.boot-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at 22% 18%,rgba(255,255,255,.38),transparent 28%),linear-gradient(135deg,#ff7a1a 0%,#ff6a00 48%,#d94f00 100%);color:#fff;opacity:1;visibility:visible;pointer-events:auto}#boot-overlay.boot-overlay.is-hidden{opacity:0;visibility:hidden;pointer-events:none}#boot-overlay .boot-overlay-card{width:min(360px,86vw);min-height:210px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:32px 28px;border:1px solid rgba(255,255,255,.28);border-radius:30px;background:rgba(255,255,255,.14);box-shadow:0 28px 70px rgba(99,38,0,.26);text-align:center}#boot-overlay .boot-overlay-mark{display:flex;align-items:center;justify-content:center;gap:14px}#boot-overlay .boot-overlay-badge{width:58px;height:58px;display:inline-flex;align-items:center;justify-content:center;border-radius:20px;background:#fff;color:#ff6a00;font-size:2rem;font-weight:900}#boot-overlay .boot-overlay-mark strong{display:block;font-size:2rem;line-height:1;letter-spacing:.02em}#boot-overlay .boot-overlay-mark span:not(.boot-overlay-badge),#boot-overlay .boot-overlay-copy p{color:rgba(255,255,255,.86);font-weight:700}#boot-overlay .boot-overlay-copy{display:flex;flex-direction:column;align-items:center;gap:12px}#boot-overlay .boot-overlay-copy p{min-height:1.2em;margin:0;font-size:.95rem}#boot-overlay .boot-overlay-spinner{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.38);border-top-color:#fff;animation:wingaCriticalBootSpin .82s linear infinite}@keyframes wingaCriticalBootSpin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){#boot-overlay .boot-overlay-spinner{animation:none}}`;

const forbiddenDistEntries = [
  "backend",
  "tests",
  "test-results",
  "node_modules",
  ".env",
  ".env.production"
];

const generatedPublicAssetDirs = [
  "product",
  path.join("api", "product"),
  "og-images"
];

function getPublicOrigin() {
  const configuredOrigin = String(process.env.WINGA_PUBLIC_ORIGIN || process.env.PUBLIC_URL || "").trim();
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, "");
  }
  return "https://wingamarket.com";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizePlainText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[<>"'`]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeStoredImageReference(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  if (value.startsWith("/uploads/")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith("/uploads/")) {
      return parsed.pathname;
    }
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
  } catch (error) {
    return value;
  }

  return value;
}

function getProductShareImageSource(product) {
  const candidates = [
    ...(Array.isArray(product?.images) ? product.images : []),
    product?.image || ""
  ].map(normalizeStoredImageReference).filter(Boolean);

  return candidates[0] || "";
}

function getProductionAssetOrigin() {
  const apiBaseUrl = String(process.env.WINGA_PRODUCTION_API_BASE_URL || process.env.WINGA_SHARE_API_BASE_URL || "https://winga-pflp.onrender.com/api").trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(apiBaseUrl);
    if (parsed.pathname.endsWith("/api")) {
      parsed.pathname = parsed.pathname.replace(/\/api\/?$/, "/");
    } else if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/";
    }
    return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "")}`.replace(/\/+$/, "");
  } catch (error) {
    return "https://winga-pflp.onrender.com";
  }
}

function inferImageExtension(contentType, fallbackPath = "") {
  const normalized = String(contentType || "").split(";")[0].trim().toLowerCase();
  const byContentType = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg"
  };
  if (byContentType[normalized]) {
    return byContentType[normalized];
  }
  const ext = path.extname(String(fallbackPath || "")).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(ext) ? (ext === ".jpeg" ? ".jpg" : ext) : ".jpg";
}

async function loadImageBufferFromReference(reference, productId, assetOrigin) {
  if (!reference) {
    return null;
  }

  const fetchRemoteImageBuffer = async (targetUrl) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const remoteResponse = await fetch(targetUrl, {
        headers: {
          Accept: "image/*"
        },
        signal: controller.signal
      });
      if (!remoteResponse.ok) {
        return null;
      }
      const arrayBuffer = await remoteResponse.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType: remoteResponse.headers.get("content-type") || "image/jpeg"
      };
    } catch (error) {
      console.warn(
        `[build-vercel-static] Skipping OG image fetch for product ${productId || "unknown"} from ${targetUrl}: ${String(error?.message || error || "fetch failed")}`
      );
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  if (reference.startsWith("/uploads/")) {
    const localPath = path.join(rootDir, "backend", reference.replace(/^\/+/, ""));
    if (fs.existsSync(localPath)) {
      const extension = inferImageExtension(null, localPath);
      return {
        buffer: fs.readFileSync(localPath),
        contentType: extension === ".png"
          ? "image/png"
          : extension === ".webp"
            ? "image/webp"
            : extension === ".gif"
              ? "image/gif"
              : extension === ".svg"
                ? "image/svg+xml"
                : "image/jpeg"
      };
    }

    const remoteUrl = `${assetOrigin.replace(/\/+$/, "")}${reference}`;
    return fetchRemoteImageBuffer(remoteUrl);
  }

  if (/^https?:\/\//i.test(reference)) {
    return fetchRemoteImageBuffer(reference);
  }

  return null;
}

function resolveAbsoluteProductShareImageUrl(reference, publicOrigin, assetOrigin) {
  const normalizedReference = normalizeStoredImageReference(reference);
  if (!normalizedReference) {
    return "";
  }

  if (/^https?:\/\//i.test(normalizedReference)) {
    return normalizedReference;
  }

  if (normalizedReference.startsWith("/uploads/")) {
    return `${assetOrigin.replace(/\/+$/, "")}${normalizedReference}`;
  }

  if (normalizedReference.startsWith("/")) {
    return `${publicOrigin.replace(/\/+$/, "")}${normalizedReference}`;
  }

  return "";
}

function getProductShareImageUrl(product, publicOrigin, assetOrigin) {
  const candidates = [
    ...(Array.isArray(product?.images) ? product.images : []),
    product?.image || ""
  ].map(normalizeStoredImageReference).filter(Boolean);

  for (const candidate of candidates) {
    const resolvedUrl = resolveAbsoluteProductShareImageUrl(candidate, publicOrigin, assetOrigin);
    if (resolvedUrl) {
      return resolvedUrl;
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
  const price = Number(product?.price);

  if (category) parts.push(category);
  if (Number.isFinite(price) && price > 0) {
    parts.push(`Bei TSh ${new Intl.NumberFormat("en-US").format(price)}`);
  }

  return parts.length ? parts.join(" · ") : "Tazama bidhaa hii kwenye Winga.";
}

function buildProductShareHtml(baseHtml, meta) {
  const safeTitle = escapeHtml(meta.title);
  const safeDescription = escapeHtml(meta.description);
  const safeCanonicalUrl = escapeHtml(meta.url);
  const safeImageUrl = escapeHtml(meta.image);
  const ogImageType = getOgImageMimeType(meta.image);
  const ogImageDimensions = getOgImageDimensions(meta.image);
  const safeTemplate = String(baseHtml || "")
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

  const titlePatched = safeTemplate
    .replace(/<title>[^<]*<\/title>/i, `<title>${safeTitle}</title>`)
    .replace(
      /(href|src)="\.\/((?:manifest(?:-v4)?\.webmanifest|apple-touch-icon(?:-v3)?\.png|splash-logo\.png|winga-icon(?:-192|-512)?(?:-v3)?\.png|winga-maskable-icon(?:-v3)?\.png|winga-maskable-icon\.svg|winga-icon\.svg|style\.css|winga-config\.js|mock-data\.js|data-service\.js|app-core\.js|winga-modules\.js|app\.js)(?:\?[^"]*)?)"/gi,
      (_, attribute, assetPath) => `${attribute}="/${assetPath}"`
    );
  if (titlePatched.includes('name="winga-build"')) {
    return titlePatched.replace(/(<meta name="winga-build" content="[^"]*">)/i, `$1${metaBlock}`);
  }
  return titlePatched.replace(/(<meta name="viewport" content="width=device-width, initial-scale=1.0">)/i, `$1${metaBlock}`);
}

function absolutizeHtmlAssetPaths(source) {
  return String(source || "").replace(
    /(href|src)="\.\/((?:manifest(?:-v4)?\.webmanifest|apple-touch-icon(?:-v3)?\.png|splash-logo\.png|winga-icon(?:-192|-512)?(?:-v3)?\.png|winga-maskable-icon(?:-v3)?\.png|winga-maskable-icon\.svg|winga-icon\.svg|style\.css|winga-config\.js|mock-data\.js|data-service\.js|app-core\.js|winga-modules\.js|app\.js)(?:\?[^"]*)?)"/gi,
    (_, attribute, assetPath) => `${attribute}="/${assetPath}"`
  );
}

function assertPathExists(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Required file or directory is missing: ${relativePath}`);
  }
}

function ensureCleanDir(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function containsNullBytes(value) {
  return typeof value === "string" && value.includes("\u0000");
}

function assertHtmlLooksValid(contents, targetPath) {
  const source = String(contents || "");
  const normalized = source.trimStart();
  if (
    !normalized
    || containsNullBytes(normalized)
    || !/^<!doctype html>/i.test(normalized)
    || !/<html[\s>]/i.test(normalized)
    || !/<body[\s>]/i.test(normalized)
  ) {
    throw new Error(`Invalid HTML detected for ${targetPath}. Build aborted to avoid publishing a blank app shell.`);
  }
}

function moveBootScriptsToBodyEnd(html) {
  const bootScriptPattern = /\s*<script defer src="((?:\.\/|\/)?(?:winga-config\.js|mock-data\.js|data-service\.js|app-core\.js|winga-modules\.js|app\.js|src\/[^"]+\.js))(?:\?[^"]*)?"><\/script>/g;
  const scripts = [];
  const withoutBootScripts = html.replace(bootScriptPattern, (scriptTag) => {
    scripts.push(scriptTag.trim());
    return "";
  });

  if (!scripts.length) {
    return html;
  }

  const seen = new Set();
  const orderedScripts = scripts.filter((scriptTag) => {
    const src = scriptTag.match(/src="([^"]+)"/)?.[1]?.replace(/\?.*$/, "") || scriptTag;
    if (seen.has(src)) {
      return false;
    }
    seen.add(src);
    return true;
  });

  return withoutBootScripts.replace(/\s*<\/body>/i, ` ${orderedScripts.join(" ")} </body>`);
}

function copyFileIntoDist(sourceRelativePath, targetRelativePath) {
  const sourcePath = path.join(rootDir, sourceRelativePath);
  const targetPath = path.join(outputDir, targetRelativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (/\.html?$/i.test(sourceRelativePath)) {
    const source = fs.readFileSync(sourcePath, "utf8");
    assertHtmlLooksValid(source, sourcePath);
    writeTextFileWithRetry(targetPath, source, "utf8");
    return;
  }
  fs.copyFileSync(sourcePath, targetPath);
}

function applyAssetVersionToHtml(targetPath) {
  const source = fs.readFileSync(targetPath, "utf8");
  assertHtmlLooksValid(source, targetPath);
  const sourceWithCriticalBootCss = source.includes('id="winga-critical-boot"')
    ? source
    : source.replace(/<head>/i, `<head><style id="winga-critical-boot">${criticalBootCss}</style>`);
  const next = sourceWithCriticalBootCss.replace(
    /(href|src)="((?:\.\/|\/)?(?:style\.css|winga-config\.js|mock-data\.js|data-service\.js|app-core\.js|winga-modules\.js|app\.js|src\/[^"]+\.js))(?:\?[^"]*)?"/g,
    (_, attribute, assetPath) => `${attribute}="${assetPath}?v=${assetVersion}"`
  );
  const publicOrigin = getPublicOrigin();
  const replacedSource = targetPath.startsWith(outputDir)
    ? absolutizeHtmlAssetPaths(next)
    : next;
  const replaced = replacedSource
    .replace(/__WINGA_PUBLIC_ORIGIN__/g, publicOrigin)
    .replace(
      /<meta name="viewport" content="width=device-width,\s*initial-scale=1\.0(?:,\s*viewport-fit=cover)?">/i,
      `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`
    )
    .replace(
      /<meta name="winga-build" content="[^"]*">/i,
      `<meta name="winga-build" content="${assetVersion}">`
    );
  const marked = replaced.includes('name="winga-build"')
    ? replaced
    : replaced.replace(
        /(<meta name="viewport" content="width=device-width, initial-scale=1.0">)/i,
        `$1\n  <meta name="winga-build" content="${assetVersion}">`
      );
  const bootReadyHtml = moveBootScriptsToBodyEnd(marked);
  assertHtmlLooksValid(bootReadyHtml, targetPath);
  writeTextFileWithRetry(targetPath, bootReadyHtml, "utf8");
}

function applyAssetVersionToServiceWorker(targetPath, criticalImageUrls = []) {
  const source = fs.readFileSync(targetPath, "utf8");
  const criticalImageJson = JSON.stringify(Array.isArray(criticalImageUrls) ? criticalImageUrls : []);
  const next = source
    .replace(/__WINGA_ASSET_VERSION__/g, assetVersion)
    .replace(/__WINGA_BUILD_VERSION__/g, assetVersion)
    .replace(/const BUILD_VERSION = "[^"]*";/, `const BUILD_VERSION = "${assetVersion}";`)
    .replace(/const CRITICAL_IMAGE_URLS = (?:__WINGA_CRITICAL_IMAGE_URLS__|\[[\s\S]*?\]);/, `const CRITICAL_IMAGE_URLS = ${criticalImageJson};`);
  writeTextFileWithRetry(targetPath, next, "utf8");
}

function writeFrontendModuleBundle(targetPath) {
  writeTextFileWithRetry(targetPath, buildFrontendModuleBundle());
}

function sleepSync(milliseconds) {
  const sharedBuffer = new SharedArrayBuffer(4);
  const view = new Int32Array(sharedBuffer);
  Atomics.wait(view, 0, 0, milliseconds);
}

function isRetryableFileLockError(error) {
  const code = String(error?.code || "").toUpperCase();
  return code === "EBUSY" || code === "EPERM";
}

function writeTextFileWithRetry(targetPath, contents, encoding = "utf8") {
  const maxAttempts = 20;
  let attempt = 0;
  let lastError = null;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      fs.writeFileSync(targetPath, contents, encoding);
      return;
    } catch (error) {
      const shouldRetry = isRetryableFileLockError(error);
      if (!shouldRetry || attempt >= maxAttempts) {
        throw error;
      }
      lastError = error;
      sleepSync(Math.min(250 * attempt, 1500));
    }
  }
  if (lastError) {
    throw lastError;
  }
}

function tryWriteFrontendModuleBundle(targetPath, options = {}) {
  const { allowLockFallback = false } = options;
  try {
    writeFrontendModuleBundle(targetPath);
    return true;
  } catch (error) {
    if (!allowLockFallback || !isRetryableFileLockError(error)) {
      throw error;
    }
    console.warn(`[build] Skipped locked frontend bundle write for ${targetPath}; continuing with existing file.`);
    return false;
  }
}

function tryApplyAssetVersionToHtml(targetPath, options = {}) {
  const { allowLockFallback = false } = options;
  try {
    applyAssetVersionToHtml(targetPath);
    return true;
  } catch (error) {
    if (!allowLockFallback || !isRetryableFileLockError(error)) {
      throw error;
    }
    console.warn(`[build] Skipped locked HTML version write for ${targetPath}; continuing with existing file.`);
    return false;
  }
}

function tryApplyAssetVersionToServiceWorker(targetPath, criticalImageUrls = [], options = {}) {
  const { allowLockFallback = false } = options;
  try {
    applyAssetVersionToServiceWorker(targetPath, criticalImageUrls);
    return true;
  } catch (error) {
    if (!allowLockFallback || !isRetryableFileLockError(error)) {
      throw error;
    }
    console.warn(`[build] Skipped locked service worker write for ${targetPath}; continuing with existing file.`);
    return false;
  }
}

function copyDirectoryRecursive(sourcePath, targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
  for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    const sourceEntryPath = path.join(sourcePath, entry.name);
    const targetEntryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourceEntryPath, targetEntryPath);
    } else {
      fs.copyFileSync(sourceEntryPath, targetEntryPath);
    }
  }
}

function backupGeneratedPublicAssets() {
  if (!fs.existsSync(outputDir)) {
    return "";
  }
  const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "winga-public-generated-"));
  let copiedAny = false;
  generatedPublicAssetDirs.forEach((relativePath) => {
    const sourcePath = path.join(outputDir, relativePath);
    if (!fs.existsSync(sourcePath)) {
      return;
    }
    const targetPath = path.join(backupRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.cpSync(sourcePath, targetPath, { recursive: true });
    copiedAny = true;
  });
  if (!copiedAny) {
    fs.rmSync(backupRoot, { recursive: true, force: true });
    return "";
  }
  return backupRoot;
}

function restoreGeneratedPublicAssets(backupRoot) {
  if (!backupRoot || !fs.existsSync(backupRoot)) {
    return;
  }
  generatedPublicAssetDirs.forEach((relativePath) => {
    const sourcePath = path.join(backupRoot, relativePath);
    if (!fs.existsSync(sourcePath)) {
      return;
    }
    const targetPath = path.join(outputDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.cpSync(sourcePath, targetPath, { recursive: true });
  });
}

function cleanupGeneratedPublicAssetBackup(backupRoot) {
  if (backupRoot && fs.existsSync(backupRoot)) {
    fs.rmSync(backupRoot, { recursive: true, force: true });
  }
}

function hasGeneratedProductSharePages() {
  return [
    path.join(outputDir, "product"),
    path.join(outputDir, "api", "product")
  ].some((targetPath) => {
    if (!fs.existsSync(targetPath)) {
      return false;
    }
    return fs.readdirSync(targetPath, { withFileTypes: true }).some((entry) => entry.isDirectory());
  });
}

function loadProductsForPrerender() {
  const storePath = path.join(rootDir, "backend", "data", "store.json");
  if (!fs.existsSync(storePath)) {
    return [];
  }
  try {
    const payload = JSON.parse(fs.readFileSync(storePath, "utf8"));
    return Array.isArray(payload.products) ? payload.products.filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function normalizeProductList(products) {
  const seenIds = new Set();
  const normalized = [];
  (Array.isArray(products) ? products : []).forEach((product) => {
    const productId = String(product?.id || "").trim();
    if (!productId || seenIds.has(productId)) {
      return;
    }
    seenIds.add(productId);
    normalized.push(product);
  });
  return normalized;
}

async function fetchProductsForPrerenderFromApi(apiBaseUrl) {
  const safeBaseUrl = String(apiBaseUrl || "").trim().replace(/\/+$/, "");
  if (!safeBaseUrl) {
    return [];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${safeBaseUrl}/products`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      return [];
    }
    const payload = await response.json();
    if (Array.isArray(payload)) {
      return payload.filter(Boolean);
    }
    if (payload && Array.isArray(payload.products)) {
      return payload.products.filter(Boolean);
    }
    return [];
  } catch (error) {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadProductsForPrerender() {
  const sourceUrls = [
    process.env.WINGA_SHARE_API_BASE_URL,
    process.env.WINGA_PRODUCTION_API_BASE_URL,
    "https://winga-pflp.onrender.com/api"
  ].filter(Boolean);

  for (const sourceUrl of sourceUrls) {
    const remoteProducts = normalizeProductList(await fetchProductsForPrerenderFromApi(sourceUrl));
    if (remoteProducts.length > 0) {
      return remoteProducts;
    }
  }

  return normalizeProductList(loadProductsForPrerender());
}

async function generateProductSharePages(baseHtml, origin) {
  const products = await loadProductsForPrerender();
  const assetOrigin = getProductionAssetOrigin();
  const criticalImageUrls = [];
  for (const product of products) {
    const productId = String(product?.id || "").trim();
    if (!productId) {
      continue;
    }

    const canonicalUrl = `${origin}/product/${encodeURIComponent(productId)}`;
    const shareImageUrl = appendImageVersion(
      getProductShareImageUrl(product, origin, assetOrigin),
      getProductShareImageVersion(product)
    );
    const html = buildProductShareHtml(baseHtml, {
      title: getProductShareTitle(product),
      description: getProductShareDescription(product),
      url: canonicalUrl,
      image: shareImageUrl
    });
    if (shareImageUrl && !shareImageUrl.endsWith("/share-og.svg")) {
      criticalImageUrls.push(shareImageUrl);
    }
    const targetDirs = [
      path.join(outputDir, "product", productId),
      path.join(outputDir, "api", "product", productId)
    ];
    targetDirs.forEach((targetDir) => {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "index.html"), html, "utf8");
    });
  }
  return criticalImageUrls.slice(0, 20);
}

function buildFrontendModuleBundle() {
  const sections = bundledModuleSources.map((relativePath) => {
    const sourcePath = path.join(rootDir, relativePath);
    const source = fs.readFileSync(sourcePath, "utf8");
    return `// ${relativePath}\n${source}`;
  });
  return `${sections.join("\n\n")}\n`;
}

function verifyDistContents() {
  const expectedFiles = [
    "index.html",
    "style.css",
    "app.js",
    "app-core.js",
    "data-service.js",
    "mock-data.js",
    "winga-config.js",
    "winga-modules.js",
    path.join("src", "core", "module-registry.js")
  ];

  expectedFiles.forEach((relativePath) => {
    const absolutePath = path.join(outputDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Vercel build output is missing required artifact: ${relativePath}`);
    }
  });

  forbiddenDistEntries.forEach((relativePath) => {
    const absolutePath = path.join(outputDir, relativePath);
    if (fs.existsSync(absolutePath)) {
      throw new Error(`Vercel build output contains forbidden entry: ${relativePath}`);
    }
  });
}

async function main() {
  requiredRootFiles.forEach(assertPathExists);
  assertPathExists("src");

  const generatedAssetBackup = backupGeneratedPublicAssets();
  ensureCleanDir(outputDir);

  try {
    let criticalImageUrls = [];
    fileCopies.forEach(([sourceRelativePath, targetRelativePath]) => {
      copyFileIntoDist(sourceRelativePath, targetRelativePath);
    });

    applyAssetVersionToHtml(path.join(outputDir, "index.html"));

    copyDirectoryRecursive(path.join(rootDir, "src"), path.join(outputDir, "src"));
    writeFrontendModuleBundle(path.join(outputDir, "winga-modules.js"));
    criticalImageUrls = await generateProductSharePages(fs.readFileSync(path.join(outputDir, "index.html"), "utf8"), getPublicOrigin());
    if (!hasGeneratedProductSharePages()) {
      restoreGeneratedPublicAssets(generatedAssetBackup);
    }
    applyAssetVersionToServiceWorker(path.join(outputDir, "sw.js"), criticalImageUrls);
    verifyDistContents();
  } catch (error) {
    restoreGeneratedPublicAssets(generatedAssetBackup);
    throw error;
  } finally {
    cleanupGeneratedPublicAssetBackup(generatedAssetBackup);
  }

  console.log(`Built Vercel static frontend into public/ (asset version ${assetVersion})`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
