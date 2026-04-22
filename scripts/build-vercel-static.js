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

function getProductShareImageUrl(product, origin) {
  const candidates = [
    ...(Array.isArray(product?.images) ? product.images : []),
    product?.image || ""
  ].map(normalizeStoredImageReference).filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.startsWith("/uploads/")) {
      return `${origin}${candidate}`;
    }
    if (/^https?:\/\//i.test(candidate)) {
      return candidate;
    }
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

function generateProductSharePages(baseHtml, origin) {
  const products = loadProductsForPrerender();
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
      image: getProductShareImageUrl(product, origin)
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
generateProductSharePages(fs.readFileSync(path.join(outputDir, "index.html"), "utf8"), getPublicOrigin());
verifyDistContents();

console.log(`Built Vercel static frontend into public/ (asset version ${assetVersion})`);
