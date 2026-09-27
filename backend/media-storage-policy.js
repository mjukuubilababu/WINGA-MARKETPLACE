const { readR2Config } = require("./storage-r2");

function readMediaStoragePolicy(env = process.env) {
  const mode = String(env.WINGA_MEDIA_STORAGE_MODE || "hybrid").trim();
  if (!["hybrid", "remote_only"].includes(mode)) throw new Error("MEDIA_STORAGE_MODE_INVALID");
  const remoteOnly = mode === "remote_only";
  if (remoteOnly) {
    if (!String(env.DATABASE_URL || "").trim()) throw new Error("MEDIA_REMOTE_DATABASE_REQUIRED");
    if (env.WINGA_LEGACY_UPLOADS_R2_COMPAT_ENABLED !== "true") throw new Error("MEDIA_REMOTE_COMPAT_REQUIRED");
    let config;
    try { config = readR2Config(env); } catch (_) { throw new Error("MEDIA_REMOTE_R2_CONFIG_REQUIRED"); }
    if (!config) throw new Error("MEDIA_REMOTE_R2_CONFIG_REQUIRED");
    let base;
    try { base = new URL(config.publicUrlBase); } catch (_) { throw new Error("MEDIA_REMOTE_PUBLIC_URL_INVALID"); }
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash
      || base.pathname.split("/").includes("uploads")) throw new Error("MEDIA_REMOTE_PUBLIC_URL_INVALID");
  }
  return Object.freeze({ mode, remoteOnly });
}

module.exports = { readMediaStoragePolicy };
