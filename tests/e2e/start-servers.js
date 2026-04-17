const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const frontendPort = 4173;
const backendPort = 43080;
const rootDir = path.resolve(__dirname, "..", "..");
const seedSessionsPath = path.join(__dirname, ".seed-sessions.json");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "winga-e2e-"));
const tinyImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk4cAAAAASUVORK5CYII=";
const promoReference = `E2E-PROMO-${Date.now()}`;

let backendProcess = null;
let staticServer = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "application/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "text/plain; charset=utf-8";
}

function createStaticServer() {
  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, `http://127.0.0.1:${frontendPort}`);
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === "/" || !path.extname(pathname)) {
        pathname = "/index.html";
      }
      const resolvedPath = path.resolve(rootDir, `.${pathname}`);
      if (!resolvedPath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const fileBuffer = await fsp.readFile(resolvedPath);
      res.writeHead(200, { "Content-Type": getContentType(resolvedPath) });
      res.end(fileBuffer);
    } catch (error) {
      res.writeHead(404);
      res.end("Not Found");
    }
  });
}

async function waitFor(url, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function apiRequest(pathname, options = {}) {
  const retries = Number.isFinite(options?.retries) ? Math.max(1, options.retries) : 4;
  const requestOptions = { ...options };
  delete requestOptions.retries;

  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api${pathname}`, requestOptions);
      const body = response.status === 204 ? null : await response.json();
      return { response, body };
    } catch (error) {
      lastError = error;
      if (attempt === retries - 1) {
        throw error;
      }
      await delay(250 * (attempt + 1));
    }
  }

  throw lastError;
}

async function loginSeedAccount({ username, password, admin = false, identifier = "" } = {}) {
  const pathname = admin ? "/auth/admin-login" : "/auth/login";
  const payload = admin
    ? { username, password }
    : { username: identifier || username, identifier: identifier || username, password };

  let lastResult = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    lastResult = await apiRequest(pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (lastResult.response.status === 200) {
      return lastResult;
    }
    await delay(250 * (attempt + 1));
  }
  return lastResult;
}

async function apiRequestWithAuthRefresh(pathname, buildOptions, refreshAuth, retries = 2) {
  let lastResult = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    lastResult = await apiRequest(pathname, buildOptions());
    if (![401, 403].includes(lastResult.response.status) || typeof refreshAuth !== "function" || attempt === retries) {
      return lastResult;
    }
    await refreshAuth();
  }
  return lastResult;
}

async function seedMarketplace() {
  const seededSessions = {};
  const accounts = [
    {
      username: "buyer_only",
      password: "Pass1234",
      phoneNumber: "255700111220",
      nationalId: "BUYER1001",
      primaryCategory: "viatu",
      role: "buyer",
      fullName: "Buyer Only"
    },
    {
      username: "buyer_seller",
      password: "Pass1234",
      phoneNumber: "255700111221",
      nationalId: "SELLER1001",
      primaryCategory: "viatu",
      role: "seller"
    },
    {
      username: "market_seller",
      password: "Pass1234",
      phoneNumber: "255700111222",
      nationalId: "SELLER1002",
      primaryCategory: "wanawake",
      role: "seller"
    }
  ];

  for (const account of accounts) {
    let sessionPayload = null;
    const signup = await apiRequest("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...account,
        role: account.role,
        id_type: account.role === "seller" ? "NIDA" : undefined,
        id_number: account.role === "seller" ? account.nationalId : undefined,
        id_image: account.role === "seller" ? tinyImage : undefined
      })
    });

    if (signup.response.status === 200) {
      sessionPayload = signup.body;
    } else {
      const identifier = account.role === "buyer"
        ? (account.fullName || account.phoneNumber)
        : account.username;
      const login = await loginSeedAccount({
        username: account.username,
        identifier,
        password: account.password
      });

      if (login.response.status !== 200) {
        throw new Error(`Failed to seed ${account.username}: ${signup.body?.error || signup.response.status}`);
      }
      sessionPayload = login.body;
    }
    seededSessions[account.username] = sessionPayload;
  }

  const sellerSession = { body: null };
  const buyerSellerSession = { body: null };
  const adminSession = { body: null };

  async function refreshSellerSession() {
    const login = await loginSeedAccount({ username: "market_seller", password: "Pass1234" });
    sellerSession.body = login.body;
    return login;
  }

  async function refreshBuyerSellerSession() {
    const login = await loginSeedAccount({ username: "buyer_seller", password: "Pass1234" });
    buyerSellerSession.body = login.body;
    return login;
  }

  async function refreshAdminSession() {
    const login = await loginSeedAccount({ username: "admin", password: "Admin1234", admin: true });
    adminSession.body = login.body;
    return login;
  }

  const sellerLogin = await refreshSellerSession();
  const buyerSellerLogin = await refreshBuyerSellerSession();
  const adminLogin = await refreshAdminSession();

  if (sellerLogin.response.status !== 200 || buyerSellerLogin.response.status !== 200 || adminLogin.response.status !== 200) {
    throw new Error("Failed to login seed accounts.");
  }
  seededSessions.buyer_seller = buyerSellerSession.body;
  seededSessions.market_seller = sellerSession.body;
  seededSessions.admin = adminSession.body;

  const catalog = [
    { id: "e2e-prod-1", name: "Sneaker Classic", price: 32000, category: "viatu-sneakers", seller: "market_seller", getToken: () => sellerSession.body?.token, refreshAuth: refreshSellerSession, phone: "255700111222", shop: "Market Seller Shop", images: [tinyImage, tinyImage, tinyImage, tinyImage, tinyImage] },
    { id: "e2e-prod-delete", name: "Delete Me Listing", price: 35000, category: "viatu-sneakers", seller: "market_seller", getToken: () => sellerSession.body?.token, refreshAuth: refreshSellerSession, phone: "255700111222", shop: "Market Seller Shop" },
    { id: "e2e-prod-2", name: "Dress Elegant", price: 54000, category: "wanawake-magauni", seller: "market_seller", getToken: () => sellerSession.body?.token, refreshAuth: refreshSellerSession, phone: "255700111222", shop: "Market Seller Shop" },
    { id: "e2e-prod-3", name: "Shirt Premium", price: 27000, category: "wanaume-mashati", seller: "market_seller", getToken: () => sellerSession.body?.token, refreshAuth: refreshSellerSession, phone: "255700111222", shop: "Market Seller Shop" },
    { id: "e2e-prod-4", name: "Bag Travel Pro", price: 61000, category: "accessories-mabegi", seller: "buyer_seller", getToken: () => buyerSellerSession.body?.token, refreshAuth: refreshBuyerSellerSession, phone: "255700111221", shop: "Buyer Seller Shop" },
    { id: "e2e-prod-5", name: "Phone Smart X", price: 420000, category: "electronics-simu", seller: "buyer_seller", getToken: () => buyerSellerSession.body?.token, refreshAuth: refreshBuyerSellerSession, phone: "255700111221", shop: "Buyer Seller Shop" },
    { id: "e2e-prod-broken", name: "Broken Feed Listing", price: 39000, category: "wanaume-tshirts", seller: "market_seller", getToken: () => sellerSession.body?.token, refreshAuth: refreshSellerSession, phone: "255700111222", shop: "Market Seller Shop", images: ["/uploads/does-not-exist-e2e.png"], image: "/uploads/does-not-exist-e2e.png" },
    { id: "e2e-prod-pending", name: "Pending Showcase Bag", price: 46000, category: "accessories-mabegi", seller: "market_seller", getToken: () => sellerSession.body?.token, refreshAuth: refreshSellerSession, phone: "255700111222", shop: "Market Seller Shop", approve: false },
    { id: "e2e-prod-pending-2", name: "Pending Office Shoes", price: 51000, category: "viatu-boots", seller: "market_seller", getToken: () => sellerSession.body?.token, refreshAuth: refreshSellerSession, phone: "255700111222", shop: "Market Seller Shop", approve: false }
  ];

  for (const item of catalog) {
    const created = await apiRequestWithAuthRefresh(
      "/products",
      () => ({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${item.getToken?.() || ""}`
        },
        body: JSON.stringify({
          id: item.id,
          name: item.name,
          price: item.price,
          shop: item.shop,
          whatsapp: item.phone,
          uploadedBy: item.seller,
          category: item.category,
          images: Array.isArray(item.images) && item.images.length ? item.images : [tinyImage],
          image: item.image || tinyImage,
          imageSignature: "0101010101010101010101010101010101010101010101010101010101010101"
        })
      }),
      item.refreshAuth
    );
    if (created.response.status !== 200) {
      throw new Error(`Failed to create product ${item.id}: ${created.body?.error || created.response.status}`);
    }

    if (item.approve !== false) {
      const moderated = await apiRequestWithAuthRefresh(
        `/admin/products/${item.id}/moderate`,
        () => ({
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminSession.body?.token || ""}`
          },
          body: JSON.stringify({
            status: "approved",
            moderationNote: "ready"
          })
        }),
        refreshAdminSession
      );
      if (moderated.response.status !== 200) {
        throw new Error(`Failed to approve product ${item.id}: ${moderated.body?.error || moderated.response.status}`);
      }
    } else {
      const moderated = await apiRequestWithAuthRefresh(
        `/admin/products/${item.id}/moderate`,
        () => ({
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminSession.body?.token || ""}`
          },
          body: JSON.stringify({
            status: "pending",
            moderationNote: "pending for review"
          })
        }),
        refreshAdminSession
      );
      if (moderated.response.status !== 200) {
        throw new Error(`Failed to keep product ${item.id} pending: ${moderated.body?.error || moderated.response.status}`);
      }
    }
  }

  const promotion = await apiRequestWithAuthRefresh(
    "/promotions",
    () => ({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerSession.body?.token || ""}`
      },
      body: JSON.stringify({
        productId: "e2e-prod-1",
        type: "boost",
        transactionReference: promoReference
      })
    }),
    refreshSellerSession
  );
  if (promotion.response.status !== 200) {
    throw new Error(`Failed to create seeded promotion: ${promotion.body?.error || promotion.response.status}`);
  }

  fs.writeFileSync(seedSessionsPath, JSON.stringify(seededSessions, null, 2));
}

function cleanup() {
  staticServer?.close(() => {});
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  fs.rmSync(seedSessionsPath, { force: true });
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

async function main() {
  backendProcess = spawn(process.execPath, ["server.js"], {
    cwd: path.join(rootDir, "backend"),
    env: {
      ...process.env,
      PORT: String(backendPort),
      NODE_ENV: "test",
      WINGA_DISABLE_RATE_LIMIT: "1",
      WINGA_DATA_DIR: path.join(tempRoot, "data"),
      WINGA_UPLOADS_DIR: path.join(tempRoot, "uploads"),
      ALLOWED_ORIGINS: `http://127.0.0.1:${frontendPort}`,
      DATABASE_URL: ""
    },
    stdio: "ignore"
  });

  await waitFor(`http://127.0.0.1:${backendPort}/api/health`);
  await seedMarketplace();
  staticServer = createStaticServer();
  await new Promise((resolve) => staticServer.listen(frontendPort, "127.0.0.1", resolve));

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  process.on("exit", cleanup);
}

main().catch((error) => {
  console.error(error);
  cleanup();
  process.exit(1);
});
