const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const buildScriptPath = path.join(rootDir, "scripts", "build-vercel-static.js");
const bundlePath = path.join(rootDir, "winga-modules.js");
const buildSource = fs.readFileSync(buildScriptPath, "utf8");
const sourceListMatch = buildSource.match(/const bundledModuleSources = (\[[\s\S]*?\n\]);/);

if (!sourceListMatch) {
  throw new Error("Unable to read bundledModuleSources from scripts/build-vercel-static.js.");
}

const bundledModuleSources = Function(`"use strict"; return (${sourceListMatch[1]});`)();
if (!Array.isArray(bundledModuleSources) || !bundledModuleSources.length) {
  throw new Error("bundledModuleSources is empty or invalid.");
}

const expectedBundle = `${bundledModuleSources.map((relativePath) => {
  const sourcePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing frontend module source: ${relativePath}`);
  }
  return `// ${relativePath}\n${fs.readFileSync(sourcePath, "utf8")}`;
}).join("\n\n")}\n`;
const actualBundle = fs.readFileSync(bundlePath, "utf8");

if (actualBundle !== expectedBundle) {
  throw new Error("winga-modules.js is out of sync with src/. Run npm run build:vercel and commit the generated bundle.");
}

console.log(`Frontend module bundle is synchronized: ${bundledModuleSources.length} modules.`);
