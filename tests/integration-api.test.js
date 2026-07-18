const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "winga-api-test-"));
const port = 43000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;

let serverProcess;
let csrfToken = "";
let csrfCookie = "";

async function waitForServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Server did not become ready in time.");
}

async function request(pathname, options = {}) {
  const requestOptions = { ...options };
  if (shouldAttachCsrf(requestOptions)) {
    await ensureCsrfToken();
    const headers = new Headers(requestOptions.headers || {});
    headers.set("X-CSRF-Token", csrfToken);
    const existingCookie = headers.get("Cookie") || headers.get("cookie") || "";
    headers.set("Cookie", [existingCookie, csrfCookie].filter(Boolean).join("; "));
    requestOptions.headers = headers;
  }
  delete requestOptions.skipCsrf;
  const response = await fetch(`${baseUrl}${pathname}`, requestOptions);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

function shouldAttachCsrf(options = {}) {
  if (options.skipCsrf) {
    return false;
  }
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(options.method || "GET").toUpperCase());
}

async function ensureCsrfToken() {
  if (csrfToken && csrfCookie) {
    return;
  }
  const response = await fetch(`${baseUrl}/auth/csrf-token`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.csrfToken);
  csrfToken = body.csrfToken;
  const setCookie = response.headers.get("set-cookie") || "";
  const match = setCookie.match(/(?:^|,\s*)winga_csrf=([^;,]+)/);
  assert.ok(match, "csrf endpoint must set winga_csrf cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Priority=High/);
  csrfCookie = `winga_csrf=${match[1]}`;
}

function getAuthCookieHeader(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  const match = setCookie.match(/(?:^|,\s*)winga_auth=([^;,]+)/);
  return match ? `winga_auth=${match[1]}` : "";
}

function getAuthCookieToken(response) {
  const cookie = getAuthCookieHeader(response);
  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
}

function getProductResponseItems(body) {
  if (Array.isArray(body)) {
    return body;
  }
  if (Array.isArray(body?.items)) {
    return body.items;
  }
  return [];
}

function waitForProcessExit(childProcess, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Process did not exit in time."));
    }, timeoutMs);
    childProcess.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
    childProcess.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test.before(async () => {
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: path.join(process.cwd(), "backend"),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      WINGA_DATA_DIR: path.join(tempRoot, "data"),
      WINGA_UPLOADS_DIR: path.join(tempRoot, "uploads"),
      ALLOWED_ORIGINS: "http://localhost:3000,https://wingamarket.com",
      PAYMENT_WEBHOOK_SECRET: "integration-webhook-secret",
      OPS_HEALTH_TOKEN: "integration-ops-health-token",
      DATABASE_URL: ""
    },
    stdio: "ignore"
  });

  await waitForServer(`${baseUrl}/health`);
});

test.after(() => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test("ops intelligence recovery endpoints require token and fail closed without durable queue", async () => {
  const denied = await fetch(`${baseUrl}/ops/intelligence/queue-items`);
  const deniedBody = await denied.json();
  assert.equal(denied.status, 401);
  assert.equal(deniedBody.ok, false);

  const unavailable = await fetch(`${baseUrl}/ops/intelligence/queue-items?status=failed,dead&limit=5`, {
    headers: {
      "X-Ops-Health-Token": "integration-ops-health-token"
    }
  });
  const unavailableBody = await unavailable.json();
  assert.equal(unavailable.status, 503);
  assert.equal(unavailableBody.ok, false);
  assert.equal(unavailableBody.error, "Durable intelligence queue is unavailable.");
  assert.equal(unavailable.headers.get("cache-control"), "no-store");

  const retryUnavailable = await fetch(`${baseUrl}/ops/intelligence/queue-retry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ops-Health-Token": "integration-ops-health-token"
    },
    body: JSON.stringify({ queueIds: [1, 2] })
  });
  const retryUnavailableBody = await retryUnavailable.json();
  assert.equal(retryUnavailable.status, 503);
  assert.equal(retryUnavailableBody.ok, false);
});

test("critical seller, buyer, session, moderation, and monitoring flows work together", async () => {
  const tinyImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk4cAAAAASUVORK5CYII=";
  const csrfResponse = await request("/auth/csrf-token");
  assert.equal(csrfResponse.response.status, 200);
  assert.ok(csrfResponse.body.csrfToken);
  assert.match(csrfResponse.response.headers.get("set-cookie") || "", /winga_csrf=[^;]+; HttpOnly/);

  const missingCsrfWrite = await request("/products", {
    method: "POST",
    skipCsrf: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(missingCsrfWrite.response.status, 403);
  assert.equal(missingCsrfWrite.body.code, "csrf_failed");

  const blockedOriginWrite = await request("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://evil.example"
    },
    body: JSON.stringify({
      identifier: "missing-user",
      password: "wrong-password"
    })
  });
  assert.equal(blockedOriginWrite.response.status, 403);
  assert.equal(blockedOriginWrite.body.code, "origin_not_allowed");

  const blockedFetchMetadataWrite = await request("/auth/login", {
    method: "POST",
    skipCsrf: true,
    headers: {
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "cross-site"
    },
    body: JSON.stringify({
      identifier: "missing-user",
      password: "wrong-password"
    })
  });
  assert.equal(blockedFetchMetadataWrite.response.status, 403);
  assert.equal(blockedFetchMetadataWrite.body.code, "origin_not_allowed");

  const allowedOriginWrite = await request("/auth/login", {
    method: "POST",
    skipCsrf: true,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000"
    },
    body: JSON.stringify({
      identifier: "missing-user",
      password: "wrong-password"
    })
  });
  assert.equal(allowedOriginWrite.response.status, 403);
  assert.equal(allowedOriginWrite.body.code, "csrf_failed");
  assert.doesNotMatch(allowedOriginWrite.response.headers.get("access-control-allow-headers") || "", /Authorization/);

  const unsupportedContentTypeWrite = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      identifier: "missing-user",
      password: "wrong-password"
    })
  });
  assert.equal(unsupportedContentTypeWrite.response.status, 415);
  assert.equal(unsupportedContentTypeWrite.body.code, "unsupported_media_type");

  const malformedJsonWrite = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
  assert.equal(malformedJsonWrite.response.status, 400);
  assert.equal(malformedJsonWrite.body.code, "invalid_json");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const failedThrottleProbe = await request("/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: "staff-throttle-probe",
        password: "wrong-password"
      })
    });
    assert.equal(failedThrottleProbe.response.status, 401);
  }
  const throttledLogin = await request("/auth/admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "staff-throttle-probe",
      password: "wrong-password"
    })
  });
  assert.equal(throttledLogin.response.status, 429);
  assert.equal(throttledLogin.body.code, "login_throttled");
  assert.ok(Number(throttledLogin.response.headers.get("retry-after") || 0) > 0);

  const webhookWithWrongSecret = await request("/payments/webhook", {
    method: "POST",
    skipCsrf: true,
    headers: {
      "Content-Type": "application/json",
      "X-Winga-Webhook-Secret": "wrong-secret"
    },
    body: JSON.stringify({
      orderId: "missing-order",
      paymentStatus: "PAID"
    })
  });
  assert.equal(webhookWithWrongSecret.response.status, 401);
  assert.notEqual(webhookWithWrongSecret.body.code, "csrf_failed");
  assert.notEqual(webhookWithWrongSecret.body.code, "origin_not_allowed");

  const publicStaffSignup = await request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "rogue_admin",
      password: "Pass1234",
      phoneNumber: "255700999111",
      nationalId: "ROGUE001",
      role: "admin",
      primaryCategory: "viatu"
    })
  });
  assert.equal(publicStaffSignup.response.status, 403);

  const sellerSignup = await request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "seller_one",
      password: "Pass1234",
      phoneNumber: "255700111111",
      nationalId: "SELLER001",
      role: "seller",
      primaryCategory: "totally-invalid category value",
      category: "bad-category",
      subcategory: "bad-subcategory",
      categoryId: "bad-category-id",
      subcategoryId: "bad-subcategory-id",
      id_type: "NIDA",
      id_number: "SELLER001",
      id_image: tinyImage
    })
  });
  assert.equal(sellerSignup.response.status, 200);
  assert.equal(sellerSignup.body.username, "seller_one");
  assert.equal(sellerSignup.body.verificationStatus, "verified");
  assert.equal(sellerSignup.body.verifiedSeller, true);
  assert.equal(sellerSignup.body.phoneNumber, "255700111111");
  assert.equal(sellerSignup.body.primaryCategory, "");
  assert.equal(Object.prototype.hasOwnProperty.call(sellerSignup.body, "token"), false);
  assert.match(sellerSignup.response.headers.get("set-cookie") || "", /winga_auth=[^;]+; HttpOnly; Path=\/; Max-Age=604800; SameSite=Lax; Priority=High/);
  const sellerToken = getAuthCookieToken(sellerSignup.response);
  const sellerUsername = sellerSignup.body.username;

  const legacyPrimaryCategoryUpdate = await request("/users/primary-category", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      username: sellerUsername,
      primaryCategory: "Totally Invalid Category Label !!!"
    })
  });
  assert.equal(legacyPrimaryCategoryUpdate.response.status, 200);

  const duplicateIdentitySignup = await request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "seller_duplicate_identity",
      password: "Pass1234",
      phoneNumber: "255700111119",
      nationalId: "SELLER001",
      role: "seller",
      id_type: "NIDA",
      id_number: "SELLER001",
      id_image: tinyImage
    })
  });
  assert.equal(duplicateIdentitySignup.response.status, 409);
  assert.equal(duplicateIdentitySignup.body.error, "This identity number is already registered. Please contact the moderator.");

  const mismatchIdentitySignup = await request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "seller_mismatch_identity",
      password: "Pass1234",
      phoneNumber: "255700111118",
      nationalId: "SELLER009",
      role: "seller",
      id_type: "NIDA",
      id_number: "SELLER010",
      id_image: tinyImage
    })
  });
  assert.equal(mismatchIdentitySignup.response.status, 400);
  assert.equal(mismatchIdentitySignup.body.error, "The card number and the number you entered do not match. Please enter the same number shown on the card.");

  const buyerSignup = await request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Buyer One",
      password: "Pass1234",
      phoneNumber: "255700222222",
      nationalId: "BUYER001",
      role: "buyer",
      primaryCategory: "sketi"
    })
  });
  assert.equal(buyerSignup.response.status, 200);
  assert.equal(buyerSignup.body.phoneNumber, "255700222222");
  let buyerToken = getAuthCookieToken(buyerSignup.response);
  const buyerUsername = buyerSignup.body.username;

  const passwordRecoveryMismatch = await request("/auth/recover-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "Buyer One",
      phoneNumber: "255700222222",
      nationalId: "BUYER404",
      newPassword: "Recovered1234"
    })
  });
  assert.equal(passwordRecoveryMismatch.response.status, 403);

  const passwordRecovery = await request("/auth/recover-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "Buyer One",
      phoneNumber: "255700222222",
      nationalId: "BUYER001",
      newPassword: "Recovered1234"
    })
  });
  assert.equal(passwordRecovery.response.status, 200);
  assert.equal(passwordRecovery.body.ok, true);

  const oldBuyerLogin = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "Buyer One",
      password: "Pass1234"
    })
  });
  assert.equal(oldBuyerLogin.response.status, 401);

  const recoveredBuyerLogin = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "Buyer One",
      password: "Recovered1234"
    })
  });
  assert.equal(recoveredBuyerLogin.response.status, 200);
  buyerToken = getAuthCookieToken(recoveredBuyerLogin.response);

  const sellerTwoSignup = await request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "seller_two",
      password: "Pass1234",
      phoneNumber: "255700111112",
      nationalId: "SELLER002",
      role: "seller",
      id_type: "VOTER_ID",
      id_number: "SELLER002",
      id_image: tinyImage
    })
  });
  assert.equal(sellerTwoSignup.response.status, 200);
  const sellerTwoToken = getAuthCookieToken(sellerTwoSignup.response);

  const productCreate = await request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      id: "product-test-001",
      name: "Kiatu Safe",
      price: 25000,
      shop: "Seller One Shop",
      whatsapp: "255700111111",
      uploadedBy: "seller_one",
      category: "viatu",
      images: [tinyImage],
      image: tinyImage,
      imageSignature: "0101010101010101010101010101010101010101010101010101010101010101"
    })
  });
  assert.equal(productCreate.response.status, 200);
  assert.equal(productCreate.body.status, "approved");
  assert.match(productCreate.body.image, /^\/uploads\//);

  const bodylessProductView = await request("/products/product-test-001/view", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${buyerToken}`
    }
  });
  assert.equal(bodylessProductView.response.status, 200);
  assert.equal(bodylessProductView.body.views, 1);

  const bodylessProductLike = await request("/products/product-test-001/like", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${buyerToken}`
    }
  });
  assert.equal(bodylessProductLike.response.status, 200);
  assert.equal(bodylessProductLike.body.likes, 1);

  const svgDataImage = `data:image/svg+xml;base64,${Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>").toString("base64")}`;
  const svgProductUpload = await request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      id: "product-test-svg",
      name: "Kiatu SVG",
      price: 25000,
      shop: "Seller One Shop",
      whatsapp: "255700111111",
      uploadedBy: "seller_one",
      category: "viatu",
      images: [svgDataImage],
      image: svgDataImage
    })
  });
  assert.equal(svgProductUpload.response.status, 400);
  assert.match(svgProductUpload.body.error, /picha/i);

  const mismatchedPngImage = `data:image/png;base64,${Buffer.from("not a real png").toString("base64")}`;
  const mismatchedImageUpload = await request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      id: "product-test-mismatch-image",
      name: "Kiatu Fake PNG",
      price: 25000,
      shop: "Seller One Shop",
      whatsapp: "255700111111",
      uploadedBy: "seller_one",
      category: "viatu",
      images: [mismatchedPngImage],
      image: mismatchedPngImage
    })
  });
  assert.equal(mismatchedImageUpload.response.status, 400);
  assert.match(mismatchedImageUpload.body.error, /picha/i);

  const oversizedImage = `data:image/png;base64,${"A".repeat((16 * 1024 * 1024) + 1024)}`;
  const oversizedProductUpload = await request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      id: "product-test-oversized",
      name: "Kiatu Oversized",
      price: 25000,
      shop: "Seller One Shop",
      whatsapp: "255700111111",
      uploadedBy: "seller_one",
      category: "viatu",
      images: [oversizedImage],
      image: oversizedImage,
      imageSignature: "oversized-image-signature"
    })
  });
  assert.equal(oversizedProductUpload.response.status, 413);
  assert.match(oversizedProductUpload.body.error, /kubwa sana/i);

  const uploadedProductImagePath = path.join(tempRoot, "uploads", path.basename(productCreate.body.image));
  fs.rmSync(uploadedProductImagePath, { force: true });

  const visibleProductsAfterUploadLoss = await request("/products", {
    headers: {
      Authorization: `Bearer ${buyerToken}`
    }
  });
  assert.equal(visibleProductsAfterUploadLoss.response.status, 200);
  const recoveredProduct = getProductResponseItems(visibleProductsAfterUploadLoss.body).find((product) => product.id === "product-test-001");
  assert.ok(recoveredProduct, "Recovered product should still be visible after upload file loss.");
  assert.equal(recoveredProduct.image, "/share-og.svg");
  assert.equal(recoveredProduct.images[0], "/share-og.svg");

  const bootstrapAfterUploadLoss = await request("/bootstrap");
  assert.equal(bootstrapAfterUploadLoss.response.status, 200);
  const bootstrapRecoveredProduct = bootstrapAfterUploadLoss.body.products.find((product) => product.id === "product-test-001");
  assert.ok(bootstrapRecoveredProduct, "Bootstrap should still include recovered product imagery.");
  assert.equal(bootstrapRecoveredProduct.image, "/share-og.svg");

  const adminLoginForBrokenReference = await request("/auth/admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin",
      password: "Admin1234"
    })
  });
  assert.equal(adminLoginForBrokenReference.response.status, 200);

  const productsBeforeBrokenReference = await request("/products", {
    headers: {
      Authorization: `Bearer ${buyerToken}`
    }
  });
  assert.equal(productsBeforeBrokenReference.response.status, 200);

  const brokenReferenceSave = await request("/products", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthCookieToken(adminLoginForBrokenReference.response)}`
    },
    body: JSON.stringify([
      ...getProductResponseItems(productsBeforeBrokenReference.body),
      {
        id: "product-test-missing-ref",
        name: "Kiatu Broken Ref",
        price: 25500,
        shop: "Seller One Shop",
        whatsapp: "255700111111",
        uploadedBy: "seller_one",
        category: "viatu",
        status: "approved",
        availability: "available",
        images: ["/uploads/does-not-exist.jpg"],
        image: "/uploads/does-not-exist.jpg",
        imageArchives: []
      }
    ])
  });
  assert.equal(brokenReferenceSave.response.status, 200);

  const visibleProductsAfterBrokenReference = await request("/products", {
    headers: {
      Authorization: `Bearer ${buyerToken}`
    }
  });
  assert.equal(visibleProductsAfterBrokenReference.response.status, 200);
  assert.equal(
    getProductResponseItems(visibleProductsAfterBrokenReference.body).some((product) => product.id === "product-test-missing-ref"),
    false,
    "Products with missing upload refs and no archive should not be returned to visible feeds."
  );

  const bootstrapAfterBrokenReference = await request("/bootstrap");
  assert.equal(bootstrapAfterBrokenReference.response.status, 200);
  assert.equal(
    bootstrapAfterBrokenReference.body.products.some((product) => product.id === "product-test-missing-ref"),
    false,
    "Bootstrap should not include products whose upload refs are broken and unrecoverable."
  );

  const healthAfterBrokenReference = await request("/health");
  assert.equal(healthAfterBrokenReference.response.status, 200);
  assert.equal(Number(healthAfterBrokenReference.body.imageConsistency?.productsWithBrokenImages || 0), 0);
  assert.equal(Number(healthAfterBrokenReference.body.imageConsistency?.brokenImageReferences || 0), 0);
  assert.equal(Number(healthAfterBrokenReference.body.imageConsistency?.archiveFallbackImages || 0), 0);

  const sameSellerDuplicatePost = await request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      id: "product-test-001-duplicate",
      name: "Kiatu Safe",
      price: 25000,
      shop: "Seller One Shop",
      whatsapp: "255700111111",
      uploadedBy: "seller_one",
      category: "viatu",
      images: [tinyImage],
      image: tinyImage,
      imageSignature: "0101010101010101010101010101010101010101010101010101010101010101"
    })
  });
  assert.equal(sameSellerDuplicatePost.response.status, 200);
  assert.equal(sameSellerDuplicatePost.body.uploadedBy, "seller_one");

  const differentSellerSamePost = await request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerTwoToken}`
    },
    body: JSON.stringify({
      id: "product-test-001-other-seller",
      name: "Kiatu Safe",
      price: 25000,
      shop: "Seller Two Shop",
      whatsapp: "255700111112",
      uploadedBy: "seller_two",
      category: "viatu",
      images: [tinyImage],
      image: tinyImage,
      imageSignature: "0101010101010101010101010101010101010101010101010101010101010101"
    })
  });
  assert.equal(differentSellerSamePost.response.status, 200);
  assert.equal(differentSellerSamePost.body.uploadedBy, "seller_two");

  const fallbackWhatsappProduct = await request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      id: "product-test-002",
      name: "Kiatu Backup Contact",
      price: 26000,
      shop: "Seller One Shop",
      uploadedBy: "seller_one",
      category: "viatu",
      images: [tinyImage],
      image: tinyImage,
      imageSignature: "0101010101010101010101010101010101010101010101010101010101010101"
    })
  });
  assert.equal(fallbackWhatsappProduct.response.status, 200);
  assert.equal(fallbackWhatsappProduct.body.whatsapp, "255700111111");

  const negotiableProduct = await request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      id: "product-test-optional-price",
      name: "Kiatu Bei Kwa Maelewano",
      shop: "Seller One Shop",
      uploadedBy: "seller_one",
      category: "viatu",
      images: [tinyImage],
      image: tinyImage,
      imageSignature: "0101010101010101010101010101010101010101010101010101010101010101"
    })
  });
  assert.equal(negotiableProduct.response.status, 200);
  assert.equal(negotiableProduct.body.price, null);

  const forcedWhatsappProduct = await request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      id: "product-test-003",
      name: "Kiatu Strict Whatsapp",
      price: 28000,
      shop: "Seller One Shop",
      whatsapp: "255799999999",
      uploadedBy: "seller_one",
      category: "viatu",
      images: [tinyImage],
      image: tinyImage,
      imageSignature: "0101010101010101010101010101010101010101010101010101010101010101"
    })
  });
  assert.equal(forcedWhatsappProduct.response.status, 200);
  assert.equal(forcedWhatsappProduct.body.whatsapp, "255700111111");

  const forcedWhatsappUpdate = await request("/products/product-test-003", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      price: 30000,
      whatsapp: "255788888888"
    })
  });
  assert.equal(forcedWhatsappUpdate.response.status, 200);
  assert.equal(forcedWhatsappUpdate.body.whatsapp, "255700111111");

  const whatsappUpdate = await request("/users/me/profile", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      whatsappNumber: "255700333333"
    })
  });
  assert.equal(whatsappUpdate.response.status, 200);
  assert.equal(whatsappUpdate.body.whatsappNumber, "255700333333");
  assert.equal(whatsappUpdate.body.phoneNumber, "255700333333");
  assert.equal(whatsappUpdate.body.whatsappVerificationStatus, "verified");

  const productAfterWhatsappVerify = await request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      id: "product-test-004",
      name: "Kiatu Verified Contact",
      price: 32000,
      shop: "Seller One Shop",
      whatsapp: "255700333333",
      uploadedBy: "seller_one",
      category: "viatu",
      images: [tinyImage],
      image: tinyImage,
      imageSignature: "0101010101010101010101010101010101010101010101010101010101010101"
    })
  });
  assert.equal(productAfterWhatsappVerify.response.status, 200);
  assert.equal(productAfterWhatsappVerify.body.whatsapp, "255700333333");

  const usedSubcategoryCreate = await request("/categories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      value: "vitu-used-simu",
      label: "Simu"
    })
  });
  assert.equal(usedSubcategoryCreate.response.status, 200);
  assert.equal(usedSubcategoryCreate.body.value, "vitu-used-simu");

  const usedCategoryProduct = await request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      id: "product-test-used-001",
      name: "Simu Used Safe",
      price: 175000,
      shop: "Seller One Shop",
      uploadedBy: "seller_one",
      category: "vitu-used-simu",
      images: [tinyImage],
      image: tinyImage,
      imageSignature: "0101010101010101010101010101010101010101010101010101010101010101"
    })
  });
  assert.equal(usedCategoryProduct.response.status, 200);
  assert.equal(usedCategoryProduct.body.category, "vitu-used-simu");

  const productUpdateAfterWhatsappVerify = await request("/products/product-test-004", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      price: 33000,
      whatsapp: "255788888888"
    })
  });
  assert.equal(productUpdateAfterWhatsappVerify.response.status, 200);
  assert.equal(productUpdateAfterWhatsappVerify.body.whatsapp, "255700333333");

  const sellerProductsAfterWhatsappVerify = await request("/products", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(sellerProductsAfterWhatsappVerify.response.status, 200);
  assert.equal(
    getProductResponseItems(sellerProductsAfterWhatsappVerify.body)
      .filter((item) => item.uploadedBy === "seller_one")
      .every((item) => item.whatsapp === "255700333333"),
    true
  );

  const filteredSellerProducts = await request("/products?limit=12&page=1&seller=seller_one&q=simu&category=vitu-used", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(filteredSellerProducts.response.status, 200);
  assert.deepEqual(
    getProductResponseItems(filteredSellerProducts.body).map((item) => item.id),
    ["product-test-used-001"]
  );

  const publicProductsBeforeApproval = await request("/products");
  assert.equal(publicProductsBeforeApproval.response.status, 200);
  assert.equal(getProductResponseItems(publicProductsBeforeApproval.body).some((item) => item.id === "product-test-001" && item.status === "approved"), true);

  const sellerVisibleProductsBeforeApproval = await request("/products", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(sellerVisibleProductsBeforeApproval.response.status, 200);
  assert.equal(getProductResponseItems(sellerVisibleProductsBeforeApproval.body).some((item) => item.id === "product-test-001" && item.status === "approved"), true);

  const publicAdminLogin = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin",
      password: "Admin1234"
    })
  });
  assert.equal(publicAdminLogin.response.status, 403);

  const adminLogin = await request("/auth/admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin",
      password: "Admin1234"
    })
  });
  assert.equal(adminLogin.response.status, 200);
  const adminToken = getAuthCookieToken(adminLogin.response);

  const sellerSecondLogin = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "seller_one",
      password: "Pass1234"
    })
  });
  assert.equal(sellerSecondLogin.response.status, 200);
  const sellerSecondToken = getAuthCookieToken(sellerSecondLogin.response);

  const sellerSelfSessions = await request("/auth/sessions", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(sellerSelfSessions.response.status, 200);
  assert.ok(sellerSelfSessions.body.count >= 2);
  assert.equal(sellerSelfSessions.body.maxActivePerUser, 5);
  assert.equal(sellerSelfSessions.body.policy.version, "session-policy-v1");
  assert.equal(sellerSelfSessions.body.policy.mfa.status, "optional_ready");
  assert.equal(sellerSelfSessions.body.policy.notifications.inApp, true);
  assert.equal(Array.isArray(sellerSelfSessions.body.auditTrail), true);
  assert.equal(sellerSelfSessions.body.auditTrail.some((entry) => entry.event === "login_success"), true);
  const currentSellerSession = sellerSelfSessions.body.items.find((item) => item.current);
  assert.ok(currentSellerSession?.sessionId);
  assert.equal(Object.prototype.hasOwnProperty.call(currentSellerSession, "ipHash"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(currentSellerSession, "tokenLast4"), false);

  const currentSelfRevoke = await request(`/auth/sessions/${encodeURIComponent(currentSellerSession.sessionId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(currentSelfRevoke.response.status, 400);
  assert.equal(currentSelfRevoke.body.code, "cannot_revoke_current_session");

  const failedStepUp = await request("/auth/step-up", {
    method: "POST",
    headers: { Authorization: `Bearer ${sellerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: "wrong-password" })
  });
  assert.equal(failedStepUp.response.status, 401);
  assert.equal(failedStepUp.body.code, "step_up_failed");

  const successfulStepUp = await request("/auth/step-up", {
    method: "POST",
    headers: { Authorization: `Bearer ${sellerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: "Pass1234" })
  });
  assert.equal(successfulStepUp.response.status, 200);
  assert.equal(successfulStepUp.body.ok, true);
  assert.equal(successfulStepUp.body.security.requiresStepUp, false);
  assert.equal(successfulStepUp.body.security.version, "session-security-v1");
  assert.equal(successfulStepUp.body.security.policy.mfa.supportedMethods.includes("totp_ready"), true);

  const moderatorLogin = await request("/auth/admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "moderator",
      password: "Moderator1234"
    })
  });
  assert.equal(moderatorLogin.response.status, 200);
  const moderatorToken = getAuthCookieToken(moderatorLogin.response);

  const adminSessions = await request("/admin/sessions?username=seller_one", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminSessions.response.status, 200);
  assert.ok(adminSessions.body.count >= 2);
  assert.equal(adminSessions.body.maxActivePerUser, 5);
  assert.equal(adminSessions.body.policy.version, "session-policy-v1");
  assert.equal(Array.isArray(adminSessions.body.auditTrail), true);
  const revocableSellerSession = adminSessions.body.items.find((item) => item.tokenLast4 === sellerSecondToken.slice(-4));
  assert.ok(revocableSellerSession?.sessionId);
  assert.equal(typeof revocableSellerSession.ipHash, "string");
  assert.equal(typeof revocableSellerSession.userAgentHash, "string");

  const moderatorSessionRevoke = await request(`/admin/sessions/${encodeURIComponent(revocableSellerSession.sessionId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${moderatorToken}` }
  });
  assert.equal(moderatorSessionRevoke.response.status, 403);

  const adminSessionRevoke = await request(`/admin/sessions/${encodeURIComponent(revocableSellerSession.sessionId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminSessionRevoke.response.status, 200);
  assert.equal(adminSessionRevoke.body.revokedSessionId, revocableSellerSession.sessionId);

  const revokedSellerSession = await request("/auth/session", {
    headers: { Authorization: `Bearer ${sellerSecondToken}` }
  });
  assert.equal(revokedSellerSession.response.status, 401);

  const adminOpsSummary = await request("/admin/ops/summary", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminOpsSummary.response.status, 200);
  assert.equal(typeof adminOpsSummary.body.storageMode, "string");
  assert.equal(Array.isArray(adminOpsSummary.body.recentAuditEntries), true);
  assert.equal(typeof adminOpsSummary.body.backupStatus?.mode, "string");

  const moderatorOpsSummary = await request("/admin/ops/summary", {
    headers: { Authorization: `Bearer ${moderatorToken}` }
  });
  assert.equal(moderatorOpsSummary.response.status, 403);

  const health = await request("/health");
  assert.equal(health.response.status, 200);
  assert.equal(typeof health.body.environment, "string");
  assert.equal(health.body.ok, true);

  const restoredSellerSession = await request("/auth/session", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(restoredSellerSession.response.status, 200);
  assert.equal(restoredSellerSession.body.phoneNumber, "255700333333");
  assert.equal(Object.prototype.hasOwnProperty.call(restoredSellerSession.body, "token"), false);
  assert.equal(restoredSellerSession.body.sessionPolicy.version, "session-policy-v1");
  assert.equal(restoredSellerSession.body.sessionPolicy.notifications.inApp, true);

  const restoredSellerCookieSession = await request("/auth/session", {
    headers: { Cookie: getAuthCookieHeader(sellerSignup.response) }
  });
  assert.equal(restoredSellerCookieSession.response.status, 200);
  assert.equal(restoredSellerCookieSession.body.username, sellerUsername);

  const clientAlertEvent = await request("/client-events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({
      level: "error",
      event: "chat_runtime_failed",
      message: "Chat send failed during release smoke.",
      category: "chat",
      alertSeverity: "high",
      fingerprint: "chat:send_failed",
      context: {
        surface: "context-chat",
        flow: "buyer-product-chat",
        productId: "product-test-001"
      }
    })
  });
  assert.equal(clientAlertEvent.response.status, 202);
  assert.equal(clientAlertEvent.body.accepted, true);

  const duplicateClientAlertEvent = await request("/client-events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({
      level: "error",
      event: "chat_runtime_failed",
      message: "Chat send failed during release smoke.",
      category: "chat",
      alertSeverity: "high",
      fingerprint: "chat:send_failed",
      context: {
        surface: "context-chat",
        flow: "buyer-product-chat",
        productId: "product-test-001"
      }
    })
  });
  assert.equal(duplicateClientAlertEvent.response.status, 202);
  assert.equal(duplicateClientAlertEvent.body.accepted, false);
  assert.equal(duplicateClientAlertEvent.body.reason, "duplicate_event");

  const adminOpsSummaryAfterClientAlert = await request("/admin/ops/summary", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminOpsSummaryAfterClientAlert.response.status, 200);
  assert.equal(adminOpsSummaryAfterClientAlert.body.counts.alertCandidates24h >= 1, true);
  assert.equal(adminOpsSummaryAfterClientAlert.body.recentAlerts.some((entry) => entry.event === "chat_runtime_failed"), true);
  assert.equal(adminOpsSummaryAfterClientAlert.body.intelligence.version.length > 0, true);
  assert.equal(adminOpsSummaryAfterClientAlert.body.intelligence.queue.processed >= 1, true);
  assert.equal(adminOpsSummaryAfterClientAlert.body.intelligence.topEventTypes.some((entry) => entry.eventType === "conversation_signal"), true);
  assert.equal(adminOpsSummaryAfterClientAlert.body.intelligence.topProducts.some((entry) => entry.id === "product-test-001"), true);

  const searchDemandBatch = await request("/search-demand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      events: [{
        query: "white dress",
        source: "text",
        category: "fashion-dress",
        color: "white",
        resultCount: 0,
        zeroResult: true,
        noClick: true,
        location: "Dar es Salaam"
      }]
    })
  });
  assert.equal(searchDemandBatch.response.status, 202);
  assert.equal(searchDemandBatch.body.accepted, 1);
  assert.equal(searchDemandBatch.body.summary.privacy, "anonymous-aggregate-only");
  assert.equal(searchDemandBatch.body.summary.trendingSearches.some((item) => item.queryKey === "white-dress"), true);

  const moderate = await request("/admin/products/product-test-001/moderate", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      status: "approved",
      moderationNote: "ready"
    })
  });
  assert.equal(moderate.response.status, 200);
  assert.equal(moderate.body.status, "approved");

  const repostProduct = await request("/products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerTwoToken}`
    },
    body: JSON.stringify({
      id: "product-test-001-repost",
      name: "Kiatu Safe",
      price: 31000,
      shop: "Seller Two Shop",
      uploadedBy: "seller_two",
      category: "viatu",
      images: [tinyImage],
      image: tinyImage,
      imageSignature: "0101010101010101010101010101010101010101010101010101010101010101",
      originalProductId: "product-test-001",
      originalSellerId: "seller_one",
      resellerId: "seller_two",
      resalePrice: 31000,
      resoldStatus: "reposted"
    })
  });
  assert.equal(repostProduct.response.status, 200);
  assert.equal(repostProduct.body.originalProductId, "product-test-001");
  assert.equal(repostProduct.body.originalSellerId, "seller_one");
  assert.equal(repostProduct.body.resellerId, "seller_two");
  assert.equal(repostProduct.body.resalePrice, 31000);
  assert.equal(repostProduct.body.resoldStatus, "reposted");

  const moderateRepost = await request("/admin/products/product-test-001-repost/moderate", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      status: "approved",
      moderationNote: "repost ready"
    })
  });
  assert.equal(moderateRepost.response.status, 200);
  assert.equal(moderateRepost.body.status, "approved");

  const buyerVisibleProducts = await request("/products", {
    headers: { Authorization: `Bearer ${buyerToken}` }
  });
  assert.equal(buyerVisibleProducts.response.status, 200);
  assert.equal(
    getProductResponseItems(buyerVisibleProducts.body).some((item) =>
      item.id === "product-test-001-repost"
      && item.uploadedBy === "seller_two"
      && item.originalProductId === ""
      && item.originalSellerId === ""
      && item.resellerId === ""
      && item.resalePrice === null
      && item.resoldStatus === "original"
    ),
    true
  );

  const moderateNegotiableProduct = await request("/admin/products/product-test-optional-price/moderate", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      status: "approved",
      moderationNote: "negotiable"
    })
  });
  assert.equal(moderateNegotiableProduct.response.status, 200);
  assert.equal(moderateNegotiableProduct.body.price, null);

  const moderatorSuspendAttempt = await request("/admin/users/seller_one/moderation", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${moderatorToken}`
    },
    body: JSON.stringify({
      status: "suspended",
      reason: "test",
      note: "moderator should be blocked"
    })
  });
  assert.equal(moderatorSuspendAttempt.response.status, 403);

  const createPromotion = await request("/promotions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      productId: "product-test-001",
      type: "boost",
      transactionReference: "PROMO-1001"
    })
  });
  assert.equal(createPromotion.response.status, 200);
  assert.equal(createPromotion.body.type, "boost");

  const adminPromotions = await request("/admin/promotions", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminPromotions.response.status, 200);
  assert.equal(adminPromotions.body.some((promotion) => promotion.productId === "product-test-001" && promotion.type === "boost"), true);

  const disablePromotion = await request(`/admin/promotions/${createPromotion.body.id}/disable`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${adminToken}`
    }
  });
  assert.equal(disablePromotion.response.status, 200);
  assert.equal(disablePromotion.body.ok, true);

  const adminPromotionsAfterDisable = await request("/admin/promotions", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminPromotionsAfterDisable.response.status, 200);
  assert.equal(adminPromotionsAfterDisable.body.some((promotion) => promotion.id === createPromotion.body.id && promotion.status === "disabled"), true);

  const sessionCheck = await request("/auth/session", {
    headers: { Authorization: `Bearer ${buyerToken}` }
  });
  assert.equal(sessionCheck.response.status, 200);
  assert.equal(sessionCheck.body.username, buyerUsername);
  assert.equal(sessionCheck.body.whatsappNumber, "255700222222");

  const sellerProfilePhoto = await request("/users/me/profile", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({ profileImage: tinyImage })
  });
  assert.equal(sellerProfilePhoto.response.status, 200);
  assert.equal(Boolean(sellerProfilePhoto.body.profileImage), true);

  const orderCreate = await request("/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({ productId: "product-test-001", transactionId: "TXN-1001" })
  });
  assert.equal(orderCreate.response.status, 200);
  assert.equal(orderCreate.body.status, "placed");
  assert.equal(orderCreate.body.paymentStatus, "pending");
  const orderId = orderCreate.body.id;
  const buyerVisibleProductsAfterOrder = await request("/products", {
    headers: {
      Authorization: `Bearer ${buyerToken}`
    }
  });
  assert.equal(buyerVisibleProductsAfterOrder.response.status, 200);
  assert.equal(
    getProductResponseItems(buyerVisibleProductsAfterOrder.body).find((product) => product.id === "product-test-001")?.availability,
    "reserved"
  );
  const sellerVisibleUsersBeforeShare = await request("/users", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(sellerVisibleUsersBeforeShare.response.status, 200);
  const buyerRecordBeforeShare = sellerVisibleUsersBeforeShare.body.find((item) => item.username === buyerUsername);
  assert.equal(Boolean(buyerRecordBeforeShare), true);
  assert.equal(buyerRecordBeforeShare.phoneVisibility, "private");
  assert.equal(buyerRecordBeforeShare.whatsappNumber, "");
  const sellerNotificationsAfterOrder = await request("/notifications", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(sellerNotificationsAfterOrder.response.status, 200);
  assert.equal(
    sellerNotificationsAfterOrder.body.some((notification) =>
      notification.type === "order"
      && notification.title.includes("ameweka order")
      && notification.body.includes("Kiatu Safe")
    ),
    true
  );

  const negotiableOrderAttempt = await request("/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({ productId: "product-test-optional-price", transactionId: "TXN-NO-PRICE" })
  });
  assert.equal(negotiableOrderAttempt.response.status, 409);

  const sellerConfirmBeforePayment = await request(`/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({ status: "confirmed" })
  });
  assert.equal(sellerConfirmBeforePayment.response.status, 403);

  const sellerVerifyPayment = await request(`/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({ status: "paid" })
  });
  assert.equal(sellerVerifyPayment.response.status, 200);
  assert.equal(sellerVerifyPayment.body.status, "paid");
  assert.equal(sellerVerifyPayment.body.paymentStatus, "paid");
  assert.equal(sellerVerifyPayment.body.paymentIntentStatus, "verified");

  const buyerNotificationsAfterPaymentVerify = await request("/notifications", {
    headers: { Authorization: `Bearer ${buyerToken}` }
  });
  assert.equal(buyerNotificationsAfterPaymentVerify.response.status, 200);
  assert.equal(
    buyerNotificationsAfterPaymentVerify.body.some((notification) =>
      notification.type === "order"
      && notification.title.includes("yamethibitishwa")
      && notification.body.includes("payment proof")
    ),
    true
  );

  const rejectedOrderCreate = await request("/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({ productId: "product-test-002", transactionId: "TXN-1002" })
  });
  assert.equal(rejectedOrderCreate.response.status, 200);
  const rejectedOrderId = rejectedOrderCreate.body.id;

  const sellerRejectPayment = await request(`/orders/${rejectedOrderId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({ status: "cancelled" })
  });
  assert.equal(sellerRejectPayment.response.status, 200);
  assert.equal(sellerRejectPayment.body.status, "cancelled");
  assert.equal(sellerRejectPayment.body.paymentStatus, "failed");
  assert.equal(sellerRejectPayment.body.paymentIntentStatus, "cancelled");
  const buyerVisibleProductsAfterReject = await request("/products", {
    headers: {
      Authorization: `Bearer ${buyerToken}`
    }
  });
  assert.equal(buyerVisibleProductsAfterReject.response.status, 200);
  assert.equal(
    getProductResponseItems(buyerVisibleProductsAfterReject.body).find((product) => product.id === "product-test-002")?.availability,
    "available"
  );

  const buyerNotificationsAfterPaymentReject = await request("/notifications", {
    headers: { Authorization: `Bearer ${buyerToken}` }
  });
  assert.equal(buyerNotificationsAfterPaymentReject.response.status, 200);
  assert.equal(
    buyerNotificationsAfterPaymentReject.body.some((notification) =>
      notification.type === "order"
      && notification.title.includes("imekataliwa")
      && notification.body.includes("reference sahihi")
    ),
    true
  );

  const adminOrderAttempt = await request("/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ productId: "product-test-001", transactionId: "TXN-ADMIN-1" })
  });
  assert.equal(adminOrderAttempt.response.status, 403);

  const paymentWebhook = await request("/payments/webhook", {
    method: "POST",
    skipCsrf: true,
    headers: {
      "Content-Type": "application/json",
      "X-Winga-Webhook-Secret": "integration-webhook-secret"
    },
    body: JSON.stringify({
      orderId,
      transactionReference: "TXN-1001",
      paymentStatus: "paid"
    })
  });
  assert.equal(paymentWebhook.response.status, 202);
  assert.equal(paymentWebhook.body.paymentStatus, "paid");
  const sellerOrdersBeforePhoneShare = await request("/orders/mine", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(sellerOrdersBeforePhoneShare.response.status, 200);
  assert.equal(
    sellerOrdersBeforePhoneShare.body.sales.find((item) => item.id === orderId)?.payerDetails?.phoneNumber || "",
    ""
  );

  const adminPayments = await request("/admin/payments", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminPayments.response.status, 200);
  assert.equal(adminPayments.body.some((payment) => payment.orderId === orderId && payment.paymentStatus === "paid" && payment.transactionReference === "TXN-1001"), true);

  const sellerConfirm = await request(`/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({ status: "confirmed" })
  });
  assert.equal(sellerConfirm.response.status, 200);
  assert.equal(sellerConfirm.body.status, "confirmed");
  const buyerSharePhone = await request("/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({
      receiverId: "seller_one",
      productId: "product-test-001",
      productName: "Kiatu Safe",
      messageType: "contact_share"
    })
  });
  assert.equal(buyerSharePhone.response.status, 200);
  assert.equal(buyerSharePhone.body.messageType, "contact_share");
  const sellerVisibleUsersAfterShare = await request("/users", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(sellerVisibleUsersAfterShare.response.status, 200);
  const buyerRecordAfterShare = sellerVisibleUsersAfterShare.body.find((item) => item.username === buyerUsername);
  assert.equal(Boolean(buyerRecordAfterShare), true);
  assert.equal(buyerRecordAfterShare.phoneVisibility, "shared");
  assert.equal(buyerRecordAfterShare.whatsappNumber, "255700222222");
  const sellerOrdersAfterPhoneShare = await request("/orders/mine", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(sellerOrdersAfterPhoneShare.response.status, 200);
  assert.equal(
    sellerOrdersAfterPhoneShare.body.sales.find((item) => item.id === orderId)?.payerDetails?.phoneNumber || "",
    "255700222222"
  );
  const buyerNotificationsAfterConfirm = await request("/notifications", {
    headers: { Authorization: `Bearer ${buyerToken}` }
  });
  assert.equal(buyerNotificationsAfterConfirm.response.status, 200);
  assert.equal(
    buyerNotificationsAfterConfirm.body.some((notification) =>
      notification.type === "order"
      && notification.title.includes("Kiatu Safe")
      && notification.title.includes("amethibitisha")
    ),
    true
  );

  const buyerReceive = await request(`/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({ status: "delivered" })
  });
  assert.equal(buyerReceive.response.status, 200);
  assert.equal(buyerReceive.body.status, "delivered");
  const buyerVisibleProductsAfterDelivery = await request("/products", {
    headers: {
      Authorization: `Bearer ${buyerToken}`
    }
  });
  assert.equal(buyerVisibleProductsAfterDelivery.response.status, 200);
  assert.equal(
    getProductResponseItems(buyerVisibleProductsAfterDelivery.body).find((product) => product.id === "product-test-001")?.availability,
    "sold_out"
  );
  const sellerNotificationsAfterDelivered = await request("/notifications", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(sellerNotificationsAfterDelivered.response.status, 200);
  assert.equal(
    sellerNotificationsAfterDelivered.body.some((notification) =>
      notification.type === "order"
      && notification.title.includes("Kiatu Safe")
      && notification.title.includes("imekamilika")
    ),
    true
  );

  const createReview = await request("/reviews", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({
      productId: "product-test-001",
      sellerId: "seller_one",
      rating: 5,
      comment: "Bidhaa ilikuwa safi na ilifika vizuri."
    })
  });
  assert.equal(createReview.response.status, 200);
  assert.equal(createReview.body.productId, "product-test-001");

  const reviewsSummary = await request("/reviews?productId=product-test-001");
  assert.equal(reviewsSummary.response.status, 200);
  assert.equal(reviewsSummary.body.reviews.some((review) => review.productId === "product-test-001" && review.userId === buyerUsername), true);

  const sellerMarkSoldOut = await request("/products/product-test-001/availability", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({ availability: "sold_out" })
  });
  assert.equal(sellerMarkSoldOut.response.status, 200);
  assert.equal(sellerMarkSoldOut.body.availability, "sold_out");

  const demandRequest = await request("/products/product-test-001/demand", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({
      action: "notify_when_available",
      color: "white",
      size: "M",
      country: "TZ",
      region: "Dar es Salaam"
    })
  });
  assert.equal(demandRequest.response.status, 201);
  assert.equal(demandRequest.body.inserted, true);
  assert.equal(demandRequest.body.demand.productId, "product-test-001");
  assert.equal(demandRequest.body.summary.waitingUsers, 1);

  const duplicateDemandRequest = await request("/products/product-test-001/demand", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({
      action: "notify_when_available",
      color: "white",
      size: "M",
      country: "TZ",
      region: "Dar es Salaam"
    })
  });
  assert.equal(duplicateDemandRequest.response.status, 200);
  assert.equal(duplicateDemandRequest.body.inserted, false);

  const sellerDemandAnalytics = await request("/analytics/summary", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(sellerDemandAnalytics.response.status, 200);
  assert.equal(sellerDemandAnalytics.body.demand.waitingUsers >= 1, true);
  assert.equal(sellerDemandAnalytics.body.demand.mostRequestedProducts.some((item) => item.productId === "product-test-001"), true);
  assert.equal(sellerDemandAnalytics.body.searchDemand.privacy, "anonymous-aggregate-only");
  assert.equal(sellerDemandAnalytics.body.searchDemand.trendingSearches.some((item) => item.queryKey === "white-dress"), true);

  const duplicateOrder = await request("/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({ productId: "product-test-001" })
  });
  assert.equal(duplicateOrder.response.status, 400);

  const adminUsers = await request("/admin/users", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminUsers.response.status, 200);
  assert.equal(adminUsers.body.some((user) =>
    user.username === "seller_one"
    && user.phoneNumber === "255700333333"
    && user.verificationStatus === "verified"
    && user.hasIdentityDocumentImage === true
    && typeof user.activeSessionCount === "number"
    && typeof user.openReportsCount === "number"
  ), true);

  const adminInvestigation = await request("/admin/users/seller_one/investigation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      reason: "Fraud review after suspicious listing and account audit."
    })
  });
  assert.equal(adminInvestigation.response.status, 200);
  assert.equal(adminInvestigation.body.profile.username, "seller_one");
  assert.equal(adminInvestigation.body.identityVerificationStatus, "verified");
  assert.equal(adminInvestigation.body.fraudReview.directMessagesExposed, false);
  assert.equal(adminInvestigation.body.fraudReview.requestedReason, "Fraud review after suspicious listing and account audit.");

  const moderatorInvestigationAttempt = await request("/admin/users/seller_one/investigation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${moderatorToken}`
    },
    body: JSON.stringify({
      reason: "Moderator should not access fraud review."
    })
  });
  assert.equal(moderatorInvestigationAttempt.response.status, 403);

  const auditLogPath = path.join(tempRoot, "data", "audit.log");
  const auditEntries = fs.readFileSync(auditLogPath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(auditEntries.some((entry) =>
    entry.event === "user_investigation_viewed"
    && entry.adminUsername === "admin"
    && entry.targetUserId === "seller_one"
    && entry.reason === "Fraud review after suspicious listing and account audit."
    && entry.actionType === "fraud_review"
  ), true);

  const reportCreate = await request("/reports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({
      targetType: "product",
      targetProductId: "product-test-001",
      reason: "fraud suspicion",
      description: "Listing looks suspicious"
    })
  });
  assert.equal(reportCreate.response.status, 200);
  assert.equal(reportCreate.body.status, "open");

  const adminReports = await request("/admin/reports?status=open", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminReports.response.status, 200);
  assert.equal(adminReports.body.some((report) => report.targetProductId === "product-test-001" && report.reporterUserId === buyerUsername), true);

  const moderatorReports = await request("/admin/reports?status=open", {
    headers: { Authorization: `Bearer ${moderatorToken}` }
  });
  assert.equal(moderatorReports.response.status, 200);

  const moderatorUsers = await request("/admin/users", {
    headers: { Authorization: `Bearer ${moderatorToken}` }
  });
  assert.equal(moderatorUsers.response.status, 200);

  const moderatorVerifySeller = await request("/admin/users/seller_one/moderation", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${moderatorToken}`
    },
    body: JSON.stringify({
      verificationStatus: "verified",
      verifiedSeller: true,
      note: "Moderator verified seller documents"
    })
  });
  assert.equal(moderatorVerifySeller.response.status, 200);
  assert.equal(moderatorVerifySeller.body.verificationStatus, "verified");
  assert.equal(moderatorVerifySeller.body.verifiedSeller, true);

  const moderatorVerifyBuyerAttempt = await request(`/admin/users/${encodeURIComponent(buyerUsername)}/moderation`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${moderatorToken}`
    },
    body: JSON.stringify({
      verificationStatus: "verified",
      verifiedSeller: true,
      note: "should not verify buyer"
    })
  });
  assert.equal(moderatorVerifyBuyerAttempt.response.status, 400);

  const buyerLogout = await request("/auth/logout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${buyerToken}`
    }
  });
  assert.equal(buyerLogout.response.status, 200);
  assert.match(buyerLogout.response.headers.get("set-cookie") || "", /winga_auth=; HttpOnly; Path=\/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Priority=High/);

  const buyerSessionAfterLogout = await request("/auth/session", {
    headers: { Authorization: `Bearer ${buyerToken}` }
  });
  assert.equal(buyerSessionAfterLogout.response.status, 401);

  const moderatorBanAttempt = await request(`/admin/users/${encodeURIComponent(buyerUsername)}/moderation`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${moderatorToken}`
    },
    body: JSON.stringify({
      status: "banned",
      reason: "not allowed"
    })
  });
  assert.equal(moderatorBanAttempt.response.status, 403);

  const banBuyer = await request(`/admin/users/${encodeURIComponent(buyerUsername)}/moderation`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      status: "banned",
      reason: "fraud review",
      note: "Integration test ban"
    })
  });
  assert.equal(banBuyer.response.status, 200);
  assert.equal(banBuyer.body.status, "banned");

  const bannedSessionCheck = await request("/auth/session", {
    headers: { Authorization: `Bearer ${buyerToken}` }
  });
  assert.equal(bannedSessionCheck.response.status, 401);

  const monitorEvent = await request("/client-events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`
    },
    body: JSON.stringify({
      level: "error",
      event: "ui_failure",
      message: "Synthetic integration test event"
    })
  });
  assert.equal(monitorEvent.response.status, 202);

  let lastAdminLoginAttempt = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    lastAdminLoginAttempt = await request("/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "WrongPass123"
      })
    });
  }
  assert.ok(lastAdminLoginAttempt);
  assert.equal(lastAdminLoginAttempt.response.status, 429);
  assert.equal(lastAdminLoginAttempt.body.code, "rate_limited");
  assert.match(lastAdminLoginAttempt.response.headers.get("retry-after") || "", /^\d+$/);
  assert.equal(lastAdminLoginAttempt.response.headers.get("x-ratelimit-remaining"), "0");
});

test("production boot still seeds staff accounts when seed env passwords are blank", async () => {
  const productionTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "winga-api-prod-test-"));
  const productionPort = 44000 + Math.floor(Math.random() * 1000);
  const productionBaseUrl = `http://127.0.0.1:${productionPort}/api`;
  let productionCsrfToken = "";
  let productionCsrfCookie = "";
  const ensureProductionCsrfToken = async () => {
    if (productionCsrfToken && productionCsrfCookie) {
      return;
    }
    const response = await fetch(`${productionBaseUrl}/auth/csrf-token`);
    const body = await response.json();
    assert.equal(response.status, 200);
    productionCsrfToken = body.csrfToken;
    const match = String(response.headers.get("set-cookie") || "").match(/(?:^|,\s*)winga_csrf=([^;,]+)/);
    assert.ok(match, "production csrf endpoint must set winga_csrf cookie");
    assert.match(String(response.headers.get("set-cookie") || ""), /HttpOnly/);
    assert.match(String(response.headers.get("set-cookie") || ""), /Priority=High/);
    assert.match(String(response.headers.get("set-cookie") || ""), /SameSite=Lax/);
    assert.match(String(response.headers.get("set-cookie") || ""), /Secure/);
    productionCsrfCookie = `winga_csrf=${match[1]}`;
  };
  const productionRequest = async (pathname, options = {}) => {
    const requestOptions = { ...options };
    if (shouldAttachCsrf(requestOptions)) {
      await ensureProductionCsrfToken();
      const headers = new Headers(requestOptions.headers || {});
      headers.set("X-CSRF-Token", productionCsrfToken);
      const existingCookie = headers.get("Cookie") || headers.get("cookie") || "";
      headers.set("Cookie", [existingCookie, productionCsrfCookie].filter(Boolean).join("; "));
      requestOptions.headers = headers;
    }
    delete requestOptions.skipCsrf;
    const response = await fetch(`${productionBaseUrl}${pathname}`, requestOptions);
    const body = response.status === 204 ? null : await response.json();
    return { response, body };
  };

  const productionServerProcess = spawn(process.execPath, ["server.js"], {
    cwd: path.join(process.cwd(), "backend"),
    env: {
      ...process.env,
      PORT: String(productionPort),
      NODE_ENV: "production",
      WINGA_DATA_DIR: path.join(productionTempRoot, "data"),
      WINGA_UPLOADS_DIR: path.join(productionTempRoot, "uploads"),
      DATABASE_URL: "",
      CSRF_SECRET: "integration-production-csrf-secret-32-plus-chars",
      ADMIN_SEED_PASSWORD: "",
      MODERATOR_SEED_PASSWORD: "",
      ALLOW_LOCAL_DATA_STORE_IN_PRODUCTION: "true",
      ALLOW_DEFAULT_ORIGIN_FALLBACK: "true",
      ALLOW_UNVERIFIED_MANUAL_PAYMENTS: "true"
    },
    stdio: "ignore"
  });

  try {
    await waitForServer(`${productionBaseUrl}/health`);

    const adminLogin = await productionRequest("/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "Admin1234"
      })
    });
    assert.equal(adminLogin.response.status, 200);
    assert.equal(adminLogin.body.role, "admin");
    assert.match(String(adminLogin.response.headers.get("set-cookie") || ""), /winga_auth=[^;]+; HttpOnly; Path=\/; Max-Age=604800; SameSite=Lax; Priority=High; Secure/);

    const moderatorLogin = await productionRequest("/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "moderator",
        password: "Moderator1234"
      })
    });
    assert.equal(moderatorLogin.response.status, 200);
    assert.equal(moderatorLogin.body.role, "moderator");
  } finally {
    if (!productionServerProcess.killed) {
      productionServerProcess.kill();
    }
    fs.rmSync(productionTempRoot, { recursive: true, force: true });
  }
});

test("production boot requires a dedicated CSRF secret", async () => {
  const missingSecretTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "winga-api-prod-csrf-test-"));
  const missingSecretPort = 45500 + Math.floor(Math.random() * 1000);
  let stderr = "";
  const missingSecretProcess = spawn(process.execPath, ["server.js"], {
    cwd: path.join(process.cwd(), "backend"),
    env: {
      ...process.env,
      PORT: String(missingSecretPort),
      NODE_ENV: "production",
      WINGA_DATA_DIR: path.join(missingSecretTempRoot, "data"),
      WINGA_UPLOADS_DIR: path.join(missingSecretTempRoot, "uploads"),
      DATABASE_URL: "",
      CSRF_SECRET: "",
      PAYMENT_WEBHOOK_SECRET: "payment-webhook-secret-should-not-be-csrf-fallback",
      ADMIN_SEED_PASSWORD: "admin-seed-password-should-not-be-csrf-fallback",
      MODERATOR_SEED_PASSWORD: "moderator-seed-password-should-not-be-csrf-fallback",
      ALLOW_LOCAL_DATA_STORE_IN_PRODUCTION: "true",
      ALLOW_DEFAULT_ORIGIN_FALLBACK: "true",
      ALLOW_UNVERIFIED_MANUAL_PAYMENTS: "true"
    },
    stdio: ["ignore", "ignore", "pipe"]
  });

  try {
    missingSecretProcess.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const result = await waitForProcessExit(missingSecretProcess);
    assert.notEqual(result.code, 0);
    assert.match(stderr, /CSRF_SECRET is required in production/);
  } finally {
    if (!missingSecretProcess.killed) {
      missingSecretProcess.kill();
    }
    fs.rmSync(missingSecretTempRoot, { recursive: true, force: true });
  }
});
