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

function normalizeProductPage(payload) {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      nextCursor: "",
      hasMore: false,
      total: payload.length,
      page: 1,
      limit: payload.length
    };
  }

  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    nextCursor: String(payload?.nextCursor || ""),
    hasMore: Boolean(payload?.hasMore),
    total: Number(payload?.total || 0),
    page: Number(payload?.page || 1),
    limit: Number(payload?.limit || 0)
  };
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

  const pageOne = normalizeProductPage(await requestJson(`${API_BASE}/products?limit=12&page=1`, {
    headers: {
      Authorization: `Bearer ${signup.token}`
    }
  }));
  if (pageOne.items.length !== 12) {
    throw new Error(`Expected 12 products on page 1, got ${pageOne.items.length}`);
  }
  if (!pageOne.nextCursor || !pageOne.hasMore) {
    throw new Error("Expected page 1 to return nextCursor and hasMore");
  }
  const pageTwo = normalizeProductPage(await requestJson(
    `${API_BASE}/products?limit=12&page=2&cursor=${encodeURIComponent(pageOne.nextCursor)}`,
    {
      headers: {
        Authorization: `Bearer ${signup.token}`
      }
    }
  ));
  if (pageTwo.items.length !== 12) {
    throw new Error(`Expected 12 products on cursor page 2, got ${pageTwo.items.length}`);
  }
  if (pageOne.items.some((product) => pageTwo.items.some((item) => item.id === product.id))) {
    throw new Error("Expected page 1 and cursor page 2 to contain distinct products");
  }
  const products = pageOne.items.concat(pageTwo.items);
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
    pageOneCount: pageOne.items.length,
    pageTwoCount: pageTwo.items.length,
    pageOneNextCursor: pageOne.nextCursor,
    pageOneHasMore: pageOne.hasMore,
    productPaginationDistinct: !pageOne.items.some((product) => pageTwo.items.some((item) => item.id === product.id)),
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
