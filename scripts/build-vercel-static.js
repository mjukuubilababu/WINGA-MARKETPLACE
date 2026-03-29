const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public");
const requiredRootFiles = [
  "winga.html",
  "style.css",
  "app.js",
  "app-core.js",
  "data-service.js",
  "mock-data.js",
  "winga-config.js"
];

const fileCopies = [
  ["winga.html", "index.html"],
  ["winga.html", "winga.html"],
  ["style.css", "style.css"],
  ["app.js", "app.js"],
  ["app-core.js", "app-core.js"],
  ["data-service.js", "data-service.js"],
  ["mock-data.js", "mock-data.js"],
  ["winga-config.js", "winga-config.js"]
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

function verifyDistContents() {
  const expectedFiles = [
    "index.html",
    "winga.html",
    "style.css",
    "app.js",
    "app-core.js",
    "data-service.js",
    "mock-data.js",
    "winga-config.js",
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

copyDirectoryRecursive(path.join(rootDir, "src"), path.join(outputDir, "src"));
verifyDistContents();

console.log("Built Vercel static frontend into public/");
