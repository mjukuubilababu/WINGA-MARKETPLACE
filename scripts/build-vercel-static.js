const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public");
const assetVersion = process.env.WINGA_ASSET_VERSION || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const requiredRootFiles = [
  "_headers",
  "_redirects",
  "index.html",
  "share-og.svg",
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
  ["share-og.svg", "share-og.svg"],
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

const forbiddenDistEntries = [
  "backend",
  "tests",
  "test-results",
  "node_modules",
  ".env",
  ".env.production"
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
    const remoteResponse = await fetch(remoteUrl, {
      headers: {
        Accept: "image/*"
      }
    });
    if (!remoteResponse.ok) {
      return null;
    }
    const arrayBuffer = await remoteResponse.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: remoteResponse.headers.get("content-type") || "image/jpeg"
    };
  }

  if (/^https?:\/\//i.test(reference)) {
    const remoteResponse = await fetch(reference, {
      headers: {
        Accept: "image/*"
      }
    });
    if (!remoteResponse.ok) {
      return null;
    }
    const arrayBuffer = await remoteResponse.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: remoteResponse.headers.get("content-type") || "image/jpeg"
    };
  }

  return null;
}

async function generateProductOgImages(products) {
  const assetsDir = path.join(outputDir, "og-images");
  fs.mkdirSync(assetsDir, { recursive: true });
  const assetOrigin = getProductionAssetOrigin();
  const imageMap = new Map();

  for (const product of products) {
    const productId = String(product?.id || "").trim();
    if (!productId) {
      continue;
    }

    const source = getProductShareImageSource(product);
    const imageAsset = await loadImageBufferFromReference(source, productId, assetOrigin);
    if (!imageAsset?.buffer || !String(imageAsset.contentType || "").startsWith("image/")) {
      continue;
    }

    const ext = inferImageExtension(imageAsset.contentType, source);
    const hash = crypto.createHash("sha256").update(imageAsset.buffer).digest("hex").slice(0, 12);
    const fileName = `${productId}-${hash}${ext}`;
    const filePath = path.join(assetsDir, fileName);
    fs.writeFileSync(filePath, imageAsset.buffer);
    imageMap.set(productId, `/og-images/${fileName}`);
  }

  return imageMap;
}

function getProductShareImageUrl(product, origin, ogImageMap = null) {
  const productId = String(product?.id || "").trim();
  if (productId && ogImageMap?.has(productId)) {
    return `${origin}${ogImageMap.get(productId)}`;
  }

  if (productId) {
    return `${origin}/share-og.svg`;
  }

  return `${origin}/share-og.svg`;
}

function getProductShareTitle(product) {
  const name = sanitizePlainText(product?.name || "", 120);
  const shop = sanitizePlainText(product?.shop || "", 80);
  if (name && shop && !name.toLowerCase().includes(shop.toLowerCase())) {
    return `${name} | ${shop}`;
  }
  return name || shop || "Winga product";
}

function getProductShareDescription(product) {
  const caption = sanitizePlainText(product?.description || product?.caption || "", 180);
  if (caption) {
    return caption;
  }

  const parts = [];
  const shop = sanitizePlainText(product?.shop || "", 80);
  const category = sanitizePlainText(product?.category || "", 60);
  const price = Number(product?.price);

  if (shop) parts.push(shop);
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
  const safeTemplate = baseHtml || `<!DOCTYPE html>
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
  <meta property="og:image:alt" content="${safeTitle}">
  <meta name="twitter:image" content="${safeImageUrl}">`;

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

  const titlePatched = safeTemplate.replace(/<title>[^<]*<\/title>/i, `<title>${safeTitle}</title>`);
  if (titlePatched.includes('name="winga-build"')) {
    return titlePatched.replace(/(<meta name="winga-build" content="[^"]*">)/i, `$1${metaBlock}`);
  }
  return titlePatched.replace(/(<meta name="viewport" content="width=device-width, initial-scale=1.0">)/i, `$1${metaBlock}`);
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

function copyFileIntoDist(sourceRelativePath, targetRelativePath) {
  const sourcePath = path.join(rootDir, sourceRelativePath);
  const targetPath = path.join(outputDir, targetRelativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function applyAssetVersionToHtml(targetPath) {
  const source = fs.readFileSync(targetPath, "utf8");
  const next = source.replace(
    /(href|src)="(\/?(?:style\.css|winga-config\.js|mock-data\.js|data-service\.js|app-core\.js|winga-modules\.js|app\.js|src\/[^"]+\.js))(?:\?[^"]*)?"/g,
    (_, attribute, assetPath) => `${attribute}="${assetPath}?v=${assetVersion}"`
  );
  const marked = next.includes('name="winga-build"')
    ? next.replace(
        /<meta name="winga-build" content="[^"]*">/i,
        `<meta name="winga-build" content="${assetVersion}">`
      )
    : next.replace(
        /(<meta name="viewport" content="width=device-width, initial-scale=1.0">)/i,
        `$1\n  <meta name="winga-build" content="${assetVersion}">`
      );
  fs.writeFileSync(targetPath, marked, "utf8");
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
  const ogImageMap = await generateProductOgImages(products);
  for (const product of products) {
    const productId = String(product?.id || "").trim();
    if (!productId) {
      continue;
    }

    const canonicalUrl = `${origin}/product/${encodeURIComponent(productId)}`;
    const html = buildProductShareHtml(baseHtml, {
      title: getProductShareTitle(product),
      description: getProductShareDescription(product),
      url: canonicalUrl,
      image: getProductShareImageUrl(product, origin, ogImageMap)
    });
    const targetDirs = [
      path.join(outputDir, "product", productId),
      path.join(outputDir, "api", "product", productId)
    ];
    targetDirs.forEach((targetDir) => {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, "index.html"), html, "utf8");
    });
  }
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

  ensureCleanDir(outputDir);

  fileCopies.forEach(([sourceRelativePath, targetRelativePath]) => {
    copyFileIntoDist(sourceRelativePath, targetRelativePath);
  });

  applyAssetVersionToHtml(path.join(rootDir, "index.html"));
  applyAssetVersionToHtml(path.join(outputDir, "index.html"));

  copyDirectoryRecursive(path.join(rootDir, "src"), path.join(outputDir, "src"));
  fs.writeFileSync(path.join(outputDir, "winga-modules.js"), buildFrontendModuleBundle(), "utf8");
  await generateProductSharePages(fs.readFileSync(path.join(outputDir, "index.html"), "utf8"), getPublicOrigin());
  verifyDistContents();

  console.log(`Built Vercel static frontend into public/ (asset version ${assetVersion})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
