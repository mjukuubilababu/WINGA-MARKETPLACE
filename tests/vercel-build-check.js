const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const requiredFiles = [
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

requiredFiles.forEach((relativePath) => {
  assert(fs.existsSync(path.join(distDir, relativePath)), `${relativePath} should exist`);
});

[
  "backend",
  "tests",
  "node_modules",
  ".env",
  ".env.production"
].forEach((relativePath) => {
  assert(!fs.existsSync(path.join(distDir, relativePath)), `${relativePath} should not be deployed to dist`);
});

console.log("Vercel build output check passed.");
