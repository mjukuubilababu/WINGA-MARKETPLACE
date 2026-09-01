const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const apiBaseUrl = "http://127.0.0.1:43080/api";
const seedSessionsPath = path.join(__dirname, ".seed-sessions.json");
const videoOnlyProviderId = "e2e-stream-video-only-001";
const mixedVideoProviderId = "e2e-stream-mixed-video-001";

async function installVideoFeedHarness(context, options = {}) {
  const failedProviders = new Set(options.failedProviders || []);
  await context.addInitScript((baseUrl) => {
    window.__WINGA_CONFIG_OVERRIDE__ = {
      provider: "api",
      fallbackProvider: "api",
      apiBaseUrl: baseUrl
    };
    try {
      Object.defineProperty(navigator, "connection", {
        configurable: true,
        value: { effectiveType: "4g", downlink: 10, rtt: 40, saveData: false }
      });
    } catch (_error) {
      // The controller works without Network Information support.
    }

    const mediaStates = new WeakMap();
    const readMediaState = (media) => {
      if (!mediaStates.has(media)) mediaStates.set(media, { paused: true, readyState: 0 });
      return mediaStates.get(media);
    };
    try {
      Object.defineProperty(HTMLMediaElement.prototype, "paused", {
        configurable: true,
        get() { return readMediaState(this).paused; }
      });
      Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
        configurable: true,
        get() { return readMediaState(this).readyState; }
      });
    } catch (_error) {
      // Event assertions remain the fallback if a browser locks these accessors.
    }
    HTMLMediaElement.prototype.play = function play() {
      const state = readMediaState(this);
      state.paused = false;
      state.readyState = 4;
      queueMicrotask(() => {
        this.dispatchEvent(new Event("play"));
        this.dispatchEvent(new Event("playing"));
      });
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      const state = readMediaState(this);
      if (state.paused) return;
      state.paused = true;
      this.dispatchEvent(new Event("pause"));
    };
    HTMLMediaElement.prototype.load = function load() {
      const state = readMediaState(this);
      state.readyState = 4;
      queueMicrotask(() => this.dispatchEvent(new Event("canplay")));
    };

    class DeterministicHls {
      static Events = {
        ERROR: "error",
        MANIFEST_PARSED: "manifestParsed",
        LEVELS_UPDATED: "levelsUpdated"
      };
      static isSupported() { return true; }
      constructor() {
        this.handlers = new Map();
        this.levels = [{ bitrate: 500000 }, { bitrate: 1500000 }];
        this.autoLevelCapping = -1;
      }
      on(event, callback) { this.handlers.set(event, callback); }
      emit(event, detail) { this.handlers.get(event)?.(event, detail); }
      loadSource(source) { this.source = source; }
      attachMedia(media) {
        this.media = media;
        queueMicrotask(() => {
          const state = readMediaState(media);
          state.readyState = 4;
          media.dispatchEvent(new Event("loadeddata"));
          this.emit(DeterministicHls.Events.MANIFEST_PARSED);
        });
      }
      startLoad() {}
      stopLoad() {}
      recoverMediaError() {}
      detachMedia() { this.media = null; }
      destroy() { this.handlers.clear(); this.media = null; }
    }
    window.Hls = DeterministicHls;
  }, apiBaseUrl);

  await context.route("**/api/media/videos/*/playback-token", async (route) => {
    const providerId = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2) || "");
    if (failedProviders.has(providerId)) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "Playback unavailable", code: "video_playback_failed" })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: "e2e-signed-" + providerId,
        customerCode: "e2e-video",
        expiresInSeconds: 300,
        signingMode: "local"
      })
    });
  });
}

async function createVideoPage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  await installVideoFeedHarness(context, options);
  if (options.authenticated) {
    const sessions = JSON.parse(fs.readFileSync(seedSessionsPath, "utf8"));
    const session = sessions.buyer_seller;
    if (session?.authCookie) {
      await context.addCookies([{
        name: "winga_auth",
        value: session.authCookie,
        url: "http://127.0.0.1:43080",
        httpOnly: true,
        sameSite: "Lax"
      }]);
    }
    const { authCookie, ...storedSession } = session;
    await context.addInitScript((payload) => {
      window.localStorage.setItem("winga-current-user", JSON.stringify(payload));
    }, storedSession);
  }
  return { context, page: await context.newPage() };
}

async function loadContinuationCard(page, productName) {
  const card = page.locator("#products-container .product-card").filter({ hasText: productName }).first();
  for (let attempt = 0; attempt < 8 && await card.count() === 0; attempt += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
  }
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.scrollIntoViewIfNeeded();
  return card;
}

test("guest feed video is edge to edge, muted, bounded to one player, and keeps endless discovery alive", async ({ browser }) => {
  const { context, page } = await createVideoPage(browser);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });
  const card = await loadContinuationCard(page, "Phone Smart X");
  const playback = card.locator("[data-video-provider-id=\"" + videoOnlyProviderId + "\"]");
  await expect(playback.locator(".feed-video-poster")).toBeAttached();
  await expect(playback.locator("video[data-stream-player]")).toBeAttached({ timeout: 15000 });
  await expect(playback).toHaveClass(/is-playing/);

  const state = await playback.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const cardRect = node.closest(".product-card")?.getBoundingClientRect();
    const player = node.querySelector("video[data-stream-player]");
    return {
      width: Math.round(rect.width),
      cardWidth: Math.round(cardRect?.width || 0),
      viewportWidth: document.documentElement.clientWidth,
      muted: Boolean(player?.muted),
      playsInline: Boolean(player?.playsInline),
      activePlayers: document.querySelectorAll("[data-video-playback].is-playing").length,
      documentWidth: document.documentElement.scrollWidth
    };
  });
  expect(state.width).toBeGreaterThanOrEqual(state.viewportWidth - 1);
  expect(state.cardWidth).toBeGreaterThanOrEqual(state.viewportWidth - 1);
  expect(state.documentWidth).toBeLessThanOrEqual(state.viewportWidth + 1);
  expect(state.muted).toBe(true);
  expect(state.playsInline).toBe(true);
  expect(state.activePlayers).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator("[data-continuous-discovery-anchor='home']")).toBeAttached();
  expect(pageErrors).toEqual([]);
  await context.close();
});

test("authenticated mixed media stays image first, swipes to video, and survives detail back plus refresh", async ({ browser }) => {
  const { context, page } = await createVideoPage(browser, { authenticated: true });
  await page.goto("/");
  const card = await loadContinuationCard(page, "Dress Elegant");
  const gallery = card.locator("[data-feed-gallery-carousel]");
  const slides = gallery.locator("[data-feed-gallery-slide]");
  await expect(slides).toHaveCount(2);
  await expect(slides.nth(0).locator("img.feed-gallery-image")).toBeVisible();
  await expect(slides.nth(1).locator("[data-video-provider-id=\"" + mixedVideoProviderId + "\"]")).toBeAttached();
  expect(await gallery.getAttribute("data-feed-gallery-initial-index")).toBe("0");

  const track = gallery.locator("[data-feed-gallery-track]");
  await track.evaluate((node) => node.scrollTo({ left: node.scrollWidth - node.clientWidth, behavior: "auto" }));
  await expect.poll(async () => track.evaluate((node) => node.scrollLeft)).toBeGreaterThan(24);
  const playback = card.locator("[data-video-provider-id=\"" + mixedVideoProviderId + "\"]");
  await playback.click();
  await expect(playback.locator("video[data-stream-player]")).toBeAttached({ timeout: 15000 });
  await expect(playback).toHaveClass(/is-playing/);

  await card.evaluate((node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await expect(page.locator("#product-detail-modal")).toBeVisible();
  await page.locator("#product-detail-modal .product-detail-back").click();
  await expect(page.locator("#product-detail-modal")).not.toBeVisible();
  await expect(card).toBeAttached();

  await page.reload();
  const restoredCard = await loadContinuationCard(page, "Dress Elegant");
  await expect(restoredCard.locator("[data-feed-gallery-slide]").nth(0).locator("img.feed-gallery-image")).toBeVisible();
  await expect(restoredCard.locator("[data-video-provider-id=\"" + mixedVideoProviderId + "\"]")).toBeAttached();
  await context.close();
});

test("video playback failure preserves the poster, commerce card, and scrolling feed", async ({ browser }) => {
  const { context, page } = await createVideoPage(browser, { failedProviders: [videoOnlyProviderId] });
  await page.goto("/");
  const card = await loadContinuationCard(page, "Phone Smart X");
  const playback = card.locator("[data-video-provider-id=\"" + videoOnlyProviderId + "\"]");
  await playback.click();
  await expect(playback).toHaveClass(/has-playback-error/, { timeout: 15000 });
  await expect(playback.locator(".feed-video-poster")).toBeVisible();
  await expect(card).toContainText("Phone Smart X");
  await expect(card.locator(".product-actions, .showcase-actions, .seller-product-actions").first()).toBeAttached();

  const beforeScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 900);
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeScroll);
  await expect(page.locator("#products-container .product-card").first()).toBeAttached();
  await context.close();
});