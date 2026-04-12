const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public");
const assetVersion = process.env.WINGA_ASSET_VERSION || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const requiredRootFiles = [
  "_headers",
  "index.html",
  "style.css",
  "app.js",
  "app-core.js",
  "data-service.js",
  "mock-data.js",
  "winga-config.js"
];

const fileCopies = [
  ["_headers", "_headers"],
  ["index.html", "index.html"],
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

function applyAssetVersionToHtml(relativePath) {
  const targetPath = path.join(outputDir, relativePath);
  const source = fs.readFileSync(targetPath, "utf8");
  const next = source.replace(
    /(href|src)="((?:style\.css|winga-config\.js|mock-data\.js|data-service\.js|app-core\.js|winga-modules\.js|app\.js|src\/[^"]+\.js))(?:\?[^"]*)?"/g,
    (_, attribute, assetPath) => `${attribute}="${assetPath}?v=${assetVersion}"`
  );
  fs.writeFileSync(targetPath, next, "utf8");
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

applyAssetVersionToHtml("index.html");

copyDirectoryRecursive(path.join(rootDir, "src"), path.join(outputDir, "src"));
fs.writeFileSync(path.join(outputDir, "winga-modules.js"), buildFrontendModuleBundle(), "utf8");
verifyDistContents();

console.log(`Built Vercel static frontend into public/ (asset version ${assetVersion})`);
