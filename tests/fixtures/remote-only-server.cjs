// Test-only dependency boundaries. Run the real HTTP server, forbid artifact I/O.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Module = require("node:module");
const root = path.resolve(__dirname, "../../backend");
const forbidden = [process.env.WINGA_DATA_DIR, process.env.WINGA_UPLOADS_DIR].map((p) => path.resolve(p));
function guard(value, method) {
  if (typeof value !== "string") return;
  const target = path.resolve(value);
  if (forbidden.some((p) => target === p || target.startsWith(p + path.sep))) {
    process.send?.({ type: "disk-access", method });
    throw new Error("FIXTURE_DISK_ACCESS_FORBIDDEN");
  }
}
for (const method of ["existsSync", "statSync", "lstatSync", "readFileSync", "writeFileSync", "appendFileSync",
  "mkdirSync", "readdirSync", "unlinkSync", "createReadStream", "createWriteStream", "copyFileSync", "renameSync"]) {
  const original = fs[method];
  fs[method] = function (...args) { guard(args[0], method); if (["copyFileSync", "renameSync"].includes(method)) guard(args[1], method); return original.apply(this, args); };
}
for (const method of ["stat", "lstat", "readFile", "writeFile", "appendFile", "mkdir", "readdir", "unlink", "open"]) {
  const original = fs.promises[method];
  fs.promises[method] = async function (...args) { guard(args[0], method); return original.apply(this, args); };
}
const bytes = Buffer.from("bounded R2 fixture");
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
let scenario = "healthy";
process.on("message", (value) => {
  if (value?.scenario) { scenario = value.scenario; process.send({ type: "scenario", scenario }); }
});
const products = [{ id: "fixture-product", name: "Legacy product", price: 5000, category: "wanawake",
  uploadedBy: "seller", shop: "Seller", status: "approved", image: "/uploads/mapped.webp",
  images: ["/uploads/mapped.webp", "/uploads/missing.webp"], mediaItems: [] }];
const store = {
  init: async (seed) => { if (process.env.FIXTURE_EMPTY_DATABASE === "true") seed(); },
  readStore: async () => ({ products, users: [{ username: "seller", role: "seller", status: "active",
    phoneNumber: "255700000002", fullName: "Seller" }], sessions: [{ token: "fixture-session", username: "seller",
    role: "seller", expiresAt: Date.now() + 3600000 }], orders: [], messages: [], notifications: [] }),
  runBootMaintenance: async () => {},
  appendAuditLog: async (entry) => {
    process.send?.({ type: "audit", event: entry.event });
    if (scenario === "audit-failure") throw new Error("FIXTURE_AUDIT_UNAVAILABLE");
  },
  authorizeLegacyUploadCompatibility: async (name) => {
    if (scenario === "authorization-failure") throw new Error("FIXTURE_DATABASE_UNAVAILABLE");
    if (name !== "mapped.webp") return null;
    return scenario === "revoked" ? false : { sha256 };
  },
  authorizeLegacyPublicMedia: async () => true,
  createProduct: async (product) => { products.push(product); process.send?.({ type: "created", id: product.id }); return { rowVersion: 1 }; },
  updateProduct: async (_id, _owner, product) => {
    products.splice(products.findIndex((p) => p.id === product.id), 1, product);
    return { updated: true, rowVersion: 2 };
  },
  deleteProduct: async (id) => { products.splice(products.findIndex((p) => p.id === id), 1); return { deleted: true }; },
  updateProductImageMediaMetadata: async () => { process.send?.({ type: "unexpected-metadata" }); },
  close: async () => {}
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  if (resolved === path.join(root, "db.js")) return { createPostgresStore: () => store };
  const actual = originalLoad.call(this, request, parent, isMain);
  if (resolved === path.join(root, "storage-r2.js")) return { ...actual, uploadImageToR2: async (data, key) => {
    if (scenario === "upload-failure") throw new Error("FIXTURE_R2_UNAVAILABLE");
    if (!Buffer.isBuffer(data) || !data.length) throw new Error("FIXTURE_UPLOAD_EMPTY");
    process.send?.({ type: "upload" });
    return "https://media.example/" + key;
  } };
  if (resolved === path.join(root, "legacy-public-media.js")) return { ...actual,
    createLegacyPublicMediaHandler: (options) => actual.createLegacyPublicMediaHandler({ ...options, readRemote: async () => {
      if (scenario === "storage-failure") throw new Error("FIXTURE_R2_UNAVAILABLE");
      return bytes;
    } }) };
  return actual;
};
require(path.join(root, "server.js"));
