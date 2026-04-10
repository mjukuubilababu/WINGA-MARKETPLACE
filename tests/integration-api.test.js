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
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
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

test("critical seller, buyer, session, moderation, and monitoring flows work together", async () => {
  const tinyImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk4cAAAAASUVORK5CYII=";
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
  const sellerToken = sellerSignup.body.token;

  const legacyPrimaryCategoryUpdate = await request("/users/primary-category", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      username: "seller_one",
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
  let buyerToken = buyerSignup.body.token;
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
  buyerToken = recoveredBuyerLogin.body.token;

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
  const sellerTwoToken = sellerTwoSignup.body.token;

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

  const uploadedProductImagePath = path.join(tempRoot, "uploads", path.basename(productCreate.body.image));
  fs.rmSync(uploadedProductImagePath, { force: true });

  const visibleProductsAfterUploadLoss = await request("/products", {
    headers: {
      Authorization: `Bearer ${buyerToken}`
    }
  });
  assert.equal(visibleProductsAfterUploadLoss.response.status, 200);
  const recoveredProduct = visibleProductsAfterUploadLoss.body.find((product) => product.id === "product-test-001");
  assert.ok(recoveredProduct, "Recovered product should still be visible after upload file loss.");
  assert.match(recoveredProduct.image, /^data:image\//);
  assert.match(recoveredProduct.images[0], /^data:image\//);

  const bootstrapAfterUploadLoss = await request("/bootstrap");
  assert.equal(bootstrapAfterUploadLoss.response.status, 200);
  const bootstrapRecoveredProduct = bootstrapAfterUploadLoss.body.products.find((product) => product.id === "product-test-001");
  assert.ok(bootstrapRecoveredProduct, "Bootstrap should still include recovered product imagery.");
  assert.match(bootstrapRecoveredProduct.image, /^data:image\//);

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

  const whatsappChangeRequest = await request("/users/me/whatsapp/request-change", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      whatsappNumber: "255700333333"
    })
  });
  assert.equal(whatsappChangeRequest.response.status, 200);
  assert.equal(whatsappChangeRequest.body.pendingWhatsappNumber, "255700333333");
  assert.match(String(whatsappChangeRequest.body.previewCode || ""), /^\d{6}$/);

  const whatsappVerify = await request("/users/me/whatsapp/verify-change", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sellerToken}`
    },
    body: JSON.stringify({
      code: whatsappChangeRequest.body.previewCode
    })
  });
  assert.equal(whatsappVerify.response.status, 200);
  assert.equal(whatsappVerify.body.whatsappNumber, "255700333333");
  assert.equal(whatsappVerify.body.whatsappVerificationStatus, "verified");

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
      whatsapp: "255799999999",
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
    sellerProductsAfterWhatsappVerify.body
      .filter((item) => item.uploadedBy === "seller_one")
      .every((item) => item.whatsapp === "255700333333"),
    true
  );

  const publicProductsBeforeApproval = await request("/products");
  assert.equal(publicProductsBeforeApproval.response.status, 200);
  assert.equal(publicProductsBeforeApproval.body.some((item) => item.id === "product-test-001" && item.status === "approved"), true);

  const sellerVisibleProductsBeforeApproval = await request("/products", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(sellerVisibleProductsBeforeApproval.response.status, 200);
  assert.equal(sellerVisibleProductsBeforeApproval.body.some((item) => item.id === "product-test-001" && item.status === "approved"), true);

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
  const adminToken = adminLogin.body.token;

  const moderatorLogin = await request("/auth/admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "moderator",
      password: "Moderator1234"
    })
  });
  assert.equal(moderatorLogin.response.status, 200);
  const moderatorToken = moderatorLogin.body.token;

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
  assert.equal(typeof health.body.backupStatus?.mode, "string");

  const restoredSellerSession = await request("/auth/session", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(restoredSellerSession.response.status, 200);
  assert.equal(restoredSellerSession.body.phoneNumber, "255700111111");

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
        flow: "buyer-product-chat"
      }
    })
  });
  assert.equal(clientAlertEvent.response.status, 202);

  const adminOpsSummaryAfterClientAlert = await request("/admin/ops/summary", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminOpsSummaryAfterClientAlert.response.status, 200);
  assert.equal(adminOpsSummaryAfterClientAlert.body.counts.alertCandidates24h >= 1, true);
  assert.equal(adminOpsSummaryAfterClientAlert.body.recentAlerts.some((entry) => entry.event === "chat_runtime_failed"), true);

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
    buyerVisibleProducts.body.some((item) =>
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
    headers: {
      "Content-Type": "application/json"
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
    && user.phoneNumber === "255700111111"
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
});

test("production boot still seeds staff accounts when seed env passwords are blank", async () => {
  const productionTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "winga-api-prod-test-"));
  const productionPort = 44000 + Math.floor(Math.random() * 1000);
  const productionBaseUrl = `http://127.0.0.1:${productionPort}/api`;
  const productionRequest = async (pathname, options = {}) => {
    const response = await fetch(`${productionBaseUrl}${pathname}`, options);
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
