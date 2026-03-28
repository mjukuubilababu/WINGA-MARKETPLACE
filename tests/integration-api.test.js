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
      primaryCategory: "viatu",
      passportPhoto: tinyImage,
      identityDocumentType: "NIDA",
      identityDocumentImage: tinyImage
    })
  });
  assert.equal(sellerSignup.response.status, 200);
  assert.equal(sellerSignup.body.username, "seller_one");
  assert.equal(sellerSignup.body.verificationStatus, "pending");
  assert.equal(sellerSignup.body.phoneNumber, "255700111111");
  const sellerToken = sellerSignup.body.token;

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
  const buyerToken = buyerSignup.body.token;
  const buyerUsername = buyerSignup.body.username;

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
  assert.equal(productCreate.body.status, "pending");

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
  assert.equal(publicProductsBeforeApproval.body.some((item) => item.id === "product-test-001"), false);

  const sellerVisibleProductsBeforeApproval = await request("/products", {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert.equal(sellerVisibleProductsBeforeApproval.response.status, 200);
  assert.equal(sellerVisibleProductsBeforeApproval.body.some((item) => item.id === "product-test-001" && item.status === "pending"), true);

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
  assert.equal(adminUsers.body.some((user) => user.username === "seller_one" && user.phoneNumber === "255700111111" && user.verificationStatus === "pending" && user.hasPassportPhoto === true), true);

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
