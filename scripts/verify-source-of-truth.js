const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const expectedRemote = "https://github.com/mjukuubilababu/WINGA-MARKETPLACE.git";
const requiredFiles = [
  "package.json",
  "wrangler.toml",
  "worker.js",
  "index.html",
  "app.js",
  "winga-modules.js",
  "public/build-version.json",
  "scripts/build-vercel-static.js"
];

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options
  }).trim();
}

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function getMissingFiles() {
  return requiredFiles.filter((file) => !fs.existsSync(path.join(repoRoot, file)));
}

function inspectParentShadowCopy() {
  const parentDir = path.resolve(repoRoot, "..");
  if (path.basename(repoRoot) !== ".recovered-master") {
    return { checked: false, reason: "repo is not inside .recovered-master" };
  }
  const parentGit = path.join(parentDir, ".git");
  const parentPackage = path.join(parentDir, "package.json");
  const parentWrangler = path.join(parentDir, "wrangler.toml");
  return {
    checked: true,
    parentDir,
    parentGitExists: fs.existsSync(parentGit),
    parentPackageExists: fs.existsSync(parentPackage),
    parentWranglerExists: fs.existsSync(parentWrangler),
    parentLooksDeployable: fs.existsSync(parentPackage) && fs.existsSync(parentWrangler)
  };
}

function main() {
  const topLevel = path.resolve(runGit(["rev-parse", "--show-toplevel"]));
  if (topLevel !== repoRoot) {
    fail("Active Git top-level is not the Winga source of truth.", { topLevel, repoRoot });
  }

  const remote = runGit(["remote", "get-url", "origin"]);
  if (remote !== expectedRemote) {
    fail("Origin remote does not match the Winga production repository.", { remote, expectedRemote });
  }

  const missingFiles = getMissingFiles();
  if (missingFiles.length) {
    fail("Required production files are missing from the source-of-truth repo.", { missingFiles });
  }

  const status = runGit(["status", "--porcelain"]);
  const commit = runGit(["log", "-1", "--oneline", "--decorate"]);
  const buildVersionPath = path.join(repoRoot, "public", "build-version.json");
  const buildVersion = JSON.parse(fs.readFileSync(buildVersionPath, "utf8"));
  const parentShadowCopy = inspectParentShadowCopy();

  console.log(JSON.stringify({
    ok: true,
    repoRoot,
    remote,
    commit,
    clean: status.length === 0,
    changedFiles: status ? status.split(/\r?\n/).filter(Boolean) : [],
    buildVersion: buildVersion.version || "",
    parentShadowCopy,
    guidance: "Use this repo root for Winga development, builds, deploys, and Git operations."
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    details: error.details || {}
  }, null, 2));
  process.exit(1);
}
