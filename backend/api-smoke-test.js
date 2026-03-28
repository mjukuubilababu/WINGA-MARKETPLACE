const fs = require("fs");
const path = require("path");

const API_BASE = process.env.WINGA_API_BASE || "http://localhost:3000/api";
const DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2X+8AAAAASUVORK5CYII=";

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  const json = body ? JSON.parse(body) : null;

  if (!response.ok) {
    throw new Error(json?.error || `HTTP ${response.status}`);
  }

  return json;
}

async function main() {
  const stamp = Date.now();
  const username = `smoke${stamp}`;
  const phoneNumber = `2557${String(stamp).slice(-6)}`;
  const productId = `product-smoke-${stamp}`;
  const backupDir = path.join(__dirname, "data", "backups");

  const beforeBackups = fs.existsSync(backupDir)
    ? fs.readdirSync(backupDir).length
    : 0;

  const signup = await requestJson(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password: "pass1234",
      phoneNumber,
      nationalId: `SMOKE${stamp}`,
      primaryCategory: "electronics"
    })
  });

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${signup.token}`
  };

  const session = await requestJson(`${API_BASE}/auth/session`, {
    headers: { Authorization: `Bearer ${signup.token}` }
  });

  const created = await requestJson(`${API_BASE}/products`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: productId,
      name: "Smoke Product",
      price: 25000,
      shop: "Smoke Shop",
      whatsapp: "255712345678",
      image: DATA_URL,
      images: [DATA_URL],
      uploadedBy: username,
      category: "electronics",
      likes: 0,
      views: 0,
      viewedBy: []
    })
  });

  const publicBase = API_BASE.replace(/\/api$/, "");
  const uploadPath = String(created.image || "").replace(publicBase, "");
  const uploadFile = uploadPath.startsWith("/uploads/")
    ? path.join(__dirname, uploadPath.slice(1).replaceAll("/", path.sep))
    : "";
  const uploadResponse = uploadPath
    ? await fetch(`${publicBase}${uploadPath}`)
    : null;

  const updated = await requestJson(`${API_BASE}/products/${productId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      name: "Smoke Product Pro",
      price: 26000,
      shop: "Smoke Shop",
      whatsapp: "255712345678",
      image: created.image,
      images: created.images,
      category: "electronics",
      likes: 0,
      views: 0,
      viewedBy: []
    })
  });

  const products = await requestJson(`${API_BASE}/products`);
  const adminLogin = await requestJson(`${API_BASE}/auth/admin-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin",
      password: "Admin1234"
    })
  });
  const adminHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminLogin.token}`
  };
  const analytics = await requestJson(`${API_BASE}/analytics/summary`, {
    headers: {
      Authorization: `Bearer ${adminLogin.token}`
    }
  });
  const moderation = await requestJson(`${API_BASE}/admin/products?status=pending`, {
    headers: {
      Authorization: `Bearer ${adminLogin.token}`
    }
  });
  const moderated = await requestJson(`${API_BASE}/admin/products/${productId}/moderate`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({
      status: "approved",
      moderationNote: "Approved by smoke test"
    })
  });
  const removed = await requestJson(`${API_BASE}/products/${productId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${signup.token}` }
  });

  const afterBackups = fs.existsSync(backupDir)
    ? fs.readdirSync(backupDir).length
    : 0;

  const summary = {
    signupUser: signup.username,
    sessionUser: session.username,
    createdImage: created.image,
    uploadStoredAsFile: uploadPath.startsWith("/uploads/"),
    uploadServedOk: Boolean(uploadResponse?.ok),
    uploadFileExists: uploadFile ? fs.existsSync(uploadFile) : false,
    updatedName: updated.name,
    moderatedStatus: moderated.status,
    pendingQueueContainsProduct: moderation.some((product) => product.id === productId),
    productFoundAfterUpdate: products.some((product) => product.id === productId),
    deleteOk: Boolean(removed?.ok),
    uploadFileRemovedAfterDelete: uploadFile ? !fs.existsSync(uploadFile) : false,
    analyticsUsersCount: analytics.usersCount,
    backupsBefore: beforeBackups,
    backupsAfter: afterBackups
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
