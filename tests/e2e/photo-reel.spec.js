const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const vm = require("node:vm");
const baseUrl = "http://127.0.0.1:43080/api";

async function sellerPage(browser, viewport = { width: 390, height: 844 }, unsupported = false, streamed = false) {
  const context = await browser.newContext({ viewport });
  const session = JSON.parse(fs.readFileSync(path.join(__dirname, ".seed-sessions.json"), "utf8")).buyer_seller;
  await context.addCookies([{ name: "winga_auth", value: session.authCookie, url: "http://127.0.0.1:43080", httpOnly: true, sameSite: "Lax" }]);
  const { authCookie, ...storedSession } = session;
  await context.addInitScript(({ session, baseUrl, unsupported }) => {
    window.__WINGA_CONFIG_OVERRIDE__ = { provider: "api", fallbackProvider: "api", apiBaseUrl: baseUrl };
    localStorage.setItem("winga-current-user", JSON.stringify(session));
    if (unsupported) window.MediaRecorder = undefined;
  }, { session: storedSession, baseUrl, unsupported });
  const page = await context.newPage();
  if (streamed) {
    // Fulfilled HTML lacks loopback address metadata; proxy the real fixture API.
    await context.route("http://127.0.0.1:43080/**", async route => {
      if (new URL(route.request().url()).pathname === "/api/messages/stream") return route.fulfill({ status: 204 });
      await route.fulfill({ response: await route.fetch() });
    });
    const source = fs.readFileSync(path.join(__dirname, "../../worker.js"), "utf8");
    const worker = vm.createContext({ TextEncoder, URL });
    vm.runInContext(source.replace("export default", "const worker ="), worker);
    const initialPage = await (await context.request.get(baseUrl + "/products?limit=12&page=1")).json();
    const initialUsers = await (await context.request.get(baseUrl + "/users")).json();
    const initialSession = await (await context.request.get(baseUrl + "/auth/session")).json();
    const bootstrap = {
      __WINGA_BIG_PIPE_INITIAL_PRODUCTS__: initialPage.items, __WINGA_BIG_PIPE_INITIAL_PAGE__: initialPage,
      __WINGA_BIG_PIPE_INITIAL_USERS__: initialUsers, __WINGA_BIG_PIPE_INITIAL_SESSION__: initialSession,
      __WINGA_BIG_PIPE_BOOTSTRAPPED__: true, __WINGA_BIG_PIPE_BOOTSTRAP_STATUS__: "loaded"
    };
    const shell = vm.runInContext("buildDocumentShellStart()", worker)
      + "<script>Object.assign(window," + JSON.stringify(bootstrap).replace(/</g, "\\u003c") + ");</script>"
      + vm.runInContext("buildDocumentShellEnd()", worker);
    await page.route("http://127.0.0.1:4173/", route => route.fulfill({ contentType: "text/html", body: shell }));
  }
  await page.goto("/");
  await page.waitForFunction(() => typeof canUseSellerFeatures === "function" && canUseSellerFeatures());
  await page.locator("#post-product-fab").click();
  await expect(page.locator("#upload-form")).toBeVisible();
  return { context, page };
}

async function photos() {
  return Promise.all([
    { name: "portrait.png", width: 300, height: 600, background: "#ee2020" },
    { name: "wide.png", width: 800, height: 300, background: "#20dd20" },
    { name: "square.png", width: 400, height: 400, background: "#2020ee" }
  ].map(async ({ name, ...create }) => ({
    name, mimeType: "image/png", buffer: await sharp({ create: { ...create, channels: 3 } }).png().toBuffer()
  })));
}

async function capturePublish(context, lostResponse = false) {
  const state = { intents: [], chunks: [], writes: 0, saved: null, bytes: 0 };
  await context.route("**/api/media/videos/direct-upload", async route => {
    state.intents.push(route.request().postDataJSON());
    await route.fulfill({ json: { providerId: "reel-browser-test", status: "uploading", uploadProtocol: "tus", uploadUrl: "http://127.0.0.1:4173/reel-binary" } });
  });
  await context.route("**/reel-binary", async route => {
    if (route.request().method() !== "HEAD") {
      const chunk = route.request().postDataBuffer();
      state.chunks.push(chunk); state.bytes += chunk.length;
    }
    await route.fulfill({ status: 204, headers: { "Upload-Offset": String(state.bytes), "Tus-Resumable": "1.0.0" } });
  });
  await context.route("**/api/media/videos/reel-browser-test", route => route.fulfill({
    json: { status: "ready", width: 720, height: 1280, duration: 6, posterUrl: "", mimeType: "video/webm" }
  }));
  await context.route("**/api/products?**", async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("category") !== "reels") return route.fallback();
    await route.fulfill({ json: { items: state.saved ? [state.saved] : [], hasMore: false, nextCursor: "", page: 1, limit: 50 } });
  });
  await context.route("**/api/products", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    state.writes++;
    state.saved = { ...route.request().postDataJSON(), createdAt: new Date().toISOString() };
    await route.fulfill(lostResponse ? { status: 503, json: { error: "Response lost" } } : { status: 201, json: state.saved });
  });
  return state;
}

async function selectReelPhotos(page, images) {
  const chooserEvent = page.waitForEvent("filechooser");
  await page.locator("[data-reel-create]").click();
  const chooser = await chooserEvent;
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles(images);
}

test("Create reel opens the gallery and automatically posts without preview, metadata, or another save click", async ({ browser }, testInfo) => {
  const { context, page } = await sellerPage(browser);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const state = await capturePublish(context);
  const images = await photos();
  await page.locator("#product-name").fill("Unrelated product draft");
  await page.locator("#product-image-file").setInputFiles(images[0]);
  await expect(page.locator("#image-preview-list img")).toHaveCount(1);
  await selectReelPhotos(page, images);
  await expect(page.locator("[data-reel-dialog]")).toBeVisible();
  await expect(page.locator("[data-reel-spinner]")).toBeVisible();
  await expect(page.locator("[data-reel-preview], [data-reel-seconds], [data-reel-use]")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("auto-reel-mobile.png") });
  await expect.poll(() => state.saved, { timeout: 25000 }).not.toBeNull();
  await expect(page.locator("[data-reel-dialog]")).not.toBeVisible();
  await expect(page.locator('#products-container [data-open-product="' + state.saved.id + '"]').first()).toBeVisible();
  expect(state.writes).toBe(1);
  expect(state.intents).toHaveLength(1);
  expect(state.intents[0].durationSeconds).toBe(6);
  expect(state.intents[0].idempotencyKey).toBeTruthy();
  expect(state.saved.name).toBe("Reel");
  expect(state.saved.price).toBeNull();
  expect(state.saved.category).toBe("reels");
  expect(state.saved.images).toEqual([]);
  expect(state.saved.mediaItems.map(item => item.type)).toEqual(["video"]);
  await expect(page.locator("#product-name")).toHaveValue("Unrelated product draft");
  expect(state.bytes).toBeGreaterThan(0);

  const playback = await page.evaluate(async ({ bytes, type }) => {
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true;
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
    video.src = url; document.body.append(video);
    try {
      const canvas = document.createElement("canvas"); canvas.width = 90; canvas.height = 160;
      const ctx = canvas.getContext("2d"); const colors = new Set(); const edges = [];
      await video.play();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Reel playback timeout")), 12000);
        video.onended = () => { clearTimeout(timeout); resolve(); };
        const sample = () => {
          if (video.ended) return;
          ctx.drawImage(video, 0, 0, 90, 160);
          const [r, g, b] = ctx.getImageData(45, 80, 1, 1).data;
          const color = r > 150 && g < 90 ? "red" : g > 150 && r < 90 ? "green" : b > 150 && r < 90 ? "blue" : "";
          if (color) colors.add(color);
          if (color === "green") edges.push(ctx.getImageData(1, 80, 1, 1).data[1], ctx.getImageData(88, 80, 1, 1).data[1]);
          requestAnimationFrame(sample);
        }; sample();
      });
      return { colors: [...colors], edges, width: video.videoWidth, height: video.videoHeight };
    } finally { video.pause(); video.removeAttribute("src"); video.load(); video.remove(); URL.revokeObjectURL(url); }
  }, { bytes: Array.from(Buffer.concat(state.chunks)), type: state.intents[0].contentType });
  expect(playback.colors).toEqual(["red", "green", "blue"]);
  expect(Math.min(...playback.edges)).toBeGreaterThan(130);
  expect([playback.width, playback.height]).toEqual([720, 1280]);
  expect(errors).toEqual([]);
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.close();
});

test("automatic reel creation can be cancelled and its spinner fits desktop and narrow RTL screens", async ({ browser }, testInfo) => {
  const { context, page } = await sellerPage(browser, { width: 1280, height: 900 });
  const state = await capturePublish(context);
  await selectReelPhotos(page, await photos());
  await expect(page.locator("[data-reel-spinner]")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("auto-reel-desktop.png") });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => { document.documentElement.dir = "rtl"; });
  const bounds = await page.locator("[data-reel-dialog]").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath("auto-reel-rtl.png") });
  await page.locator("[data-reel-cancel]").click();
  await expect(page.locator("[data-reel-dialog]")).not.toBeVisible();
  await page.waitForTimeout(6500);
  expect(state.intents).toHaveLength(0);
  expect(state.writes).toBe(0);
  await page.locator("#product-image-file").setInputFiles((await photos())[0]);
  await expect(page.locator("#image-preview-list img")).toHaveCount(1);
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.close();
});

test("unsupported reel generation leaves ordinary photo posting usable", async ({ browser }) => {
  const { context, page } = await sellerPage(browser, { width: 390, height: 844 }, true);
  await page.locator("[data-reel-create]").click();
  await expect(page.locator("[data-reel-status]")).not.toBeEmpty();
  await expect(page.locator("[data-reel-spinner]")).not.toBeVisible();
  await page.locator("[data-reel-cancel]").click();
  await page.locator("#product-image-file").setInputFiles((await photos())[0]);
  await expect(page.locator("#image-preview-list img")).toHaveCount(1);
  await context.close();
});

test("Worker-rendered Create reel uses the same automatic publication path", async ({ browser }) => {
  const { context, page } = await sellerPage(browser, { width: 390, height: 844 }, false, true);
  const state = await capturePublish(context);
  await selectReelPhotos(page, await photos());
  await expect.poll(() => state.writes, { timeout: 25000 }).toBe(1);
  await expect(page.locator("[data-reel-dialog]")).not.toBeVisible();
  expect(state.saved.mediaItems[0].providerId).toBe("reel-browser-test");
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.close();
});

test("lost publish response reconciles the posted reel without another upload or duplicate post", async ({ browser }) => {
  const { context, page } = await sellerPage(browser);
  const state = await capturePublish(context, true);
  await selectReelPhotos(page, await photos());
  await expect.poll(() => state.writes, { timeout: 25000 }).toBe(1);
  await expect(page.locator("[data-reel-dialog]")).not.toBeVisible();
  await expect(page.locator('#products-container [data-open-product="' + state.saved.id + '"]').first()).toBeVisible();
  expect(state.writes).toBe(1);
  expect(state.intents).toHaveLength(1);
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.close();
});
