const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const apiBaseUrl = "http://127.0.0.1:43080/api";
const seedSessionsPath = path.join(__dirname, ".seed-sessions.json");
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

async function loadVideoCard(page, productName, providerId) {
  const playback = page.locator(`#products-container [data-video-provider-id="${providerId}"]`).first();
  for (let attempt = 0; attempt < 12 && await playback.count() === 0; attempt += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
  }
  await expect(playback).toBeAttached({ timeout: 30000 });
  const card = playback.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' product-card ')][1]");
  await expect(card).toContainText(productName);
  await playback.evaluate((node) => {
    const slide = node.closest("[data-feed-gallery-slide]");
    const gallery = node.closest("[data-feed-gallery-carousel]");
    if (slide && gallery) {
      gallery.scrollLeft = slide.offsetLeft;
      gallery.dispatchEvent(new Event("scroll"));
    }
  });
  await playback.scrollIntoViewIfNeeded();
  return { card, playback };
}

test("guest feed video starts muted, exposes sound, stays edge to edge, and keeps endless discovery alive", async ({ browser }) => {
  const { context, page } = await createVideoPage(browser);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });
  const { card, playback } = await loadVideoCard(page, "Dress Elegant", mixedVideoProviderId);
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
      documentWidth: document.documentElement.scrollWidth,
      playerObjectFit: player ? getComputedStyle(player).objectFit : "",
      playbackMaxWidth: getComputedStyle(node).maxWidth,
      playbackPaddingInline: `${getComputedStyle(node).paddingLeft} ${getComputedStyle(node).paddingRight}`,
      renderedAspectRatio: rect.width / rect.height,
      galleryAspectRatio: node.closest("[data-feed-gallery-carousel]")?.getAttribute("data-feed-gallery-stable-ratio") || "",
      mediaAspectRatio: Number.parseFloat(node.closest(".product-card-media")?.style.aspectRatio || "0")
    };
  });
  expect(state.width).toBeGreaterThanOrEqual(state.viewportWidth - 1);
  expect(state.cardWidth).toBeGreaterThanOrEqual(state.viewportWidth - 1);
  expect(state.documentWidth).toBeLessThanOrEqual(state.viewportWidth + 1);
  expect(state.muted).toBe(true);
  expect(state.playsInline).toBe(true);
  expect(state.playerObjectFit).toBe("contain");
  expect(Number(state.galleryAspectRatio)).toBeGreaterThan(0);
  expect(state.mediaAspectRatio).toBeGreaterThan(0);
  expect(state.renderedAspectRatio).toBeGreaterThan(0);
  expect(state.playbackMaxWidth).toBe("100%");
  expect(state.playbackPaddingInline).toBe("0px 0px");
  expect(state.activePlayers).toBeLessThanOrEqual(1);

  const audioToggle = playback.locator("xpath=..").locator("[data-video-audio-toggle]");
  await expect(audioToggle).toBeVisible();
  await expect(audioToggle).toHaveAttribute("data-video-audio-state", "off");
  await audioToggle.click();
  await expect.poll(async () => playback.locator("video[data-stream-player]").evaluate((player) => ({
    muted: player.muted,
    volume: player.volume
  }))).toEqual({ muted: false, volume: 1 });
  await expect(audioToggle).toHaveAttribute("data-video-audio-state", "on");
  await expect(audioToggle).toHaveAttribute("aria-pressed", "true");
  await expect(audioToggle.locator("[data-video-audio-icon]")).toHaveAttribute("src", "/icons/navigation/volume-2.svg");

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
  const { context, page } = await createVideoPage(browser, { failedProviders: [mixedVideoProviderId] });
  await page.goto("/");
  const { card, playback } = await loadVideoCard(page, "Dress Elegant", mixedVideoProviderId);
  await playback.click();
  await expect(playback).toHaveClass(/has-playback-error/, { timeout: 15000 });
  await expect(playback.locator(".feed-video-poster")).toBeVisible();
  await expect(card).toContainText("Dress Elegant");
  await expect(card.locator(".product-actions, .showcase-actions, .seller-product-actions").first()).toBeAttached();

  await page.evaluate(() => window.scrollTo(0, Math.max(0, window.scrollY - 500)));
  const beforeScroll = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollBy(0, 900));
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeScroll);
  await expect(page.locator("#products-container .product-card").first()).toBeAttached();
  await context.close();
});

test("eight sequential feed videos play and resume when scrolling back", async ({ browser }) => {
  const { context, page } = await createVideoPage(browser);
  try {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, value: 8 });
      Object.defineProperty(navigator, "deviceMemory", { configurable: true, value: 8 });
    });
    await page.goto("/");
    await loadVideoCard(page, "Dress Elegant", mixedVideoProviderId);
    await page.evaluate(() => {
      const template = document.querySelector('[data-video-provider-id="e2e-stream-mixed-video-001"]').closest(".product-card");
      const cards = [];
      for (let i = 0; i < 8; i += 1) {
        const card = template.cloneNode(true);
        card.removeAttribute("data-open-product");
        card.dataset.scrollVideo = String(i);
        card.querySelectorAll("[data-feed-gallery-slide]:not([data-feed-video-slide]), [data-feed-gallery-count]").forEach((element) => element.remove());
        card.querySelectorAll("[data-stream-player]").forEach((player) => player.remove());
        card.querySelectorAll("[data-video-playback]").forEach((node) => {
          node.dataset.videoPlaybackBound = "false";
          node.dataset.videoProviderId = `scroll-regression-${i}`;
          node.className = "feed-video-playback";
        });
        cards.push(card);
      }
      document.querySelector("#products-container").prepend(...cards);
      cards.forEach((card) => getMarketplaceVideoPlaybackTools().bind(card));
    });
    for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 6, 7]) {
      const node = page.locator(`[data-scroll-video="${index}"] [data-video-playback]`);
      await node.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
      await expect.poll(() => node.locator("video").evaluateAll((players) => players.some((player) => !player.paused))).toBe(true);
      await expect.poll(() => page.locator("video[data-stream-player]").evaluateAll((players) => players.filter((player) => !player.paused).length)).toBe(1);
    }
    await expect.poll(() => page.locator("[data-scroll-video=\"0\"] video").count(), { timeout: 6000 }).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  } finally {
    await context.close();
  }
});

test("deep feed releases off-screen video players while retaining the product card and poster", async ({ browser }) => {
  const { context, page } = await createVideoPage(browser);
  await page.goto("/");
  const { card, playback } = await loadVideoCard(page, "Dress Elegant", mixedVideoProviderId);

  await expect(playback.locator("video[data-stream-player]")).toBeAttached({ timeout: 15000 });
  await expect(playback).toHaveClass(/is-playing/);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(
    async () => playback.evaluate((node) => node.getBoundingClientRect().bottom),
    { timeout: 10000 }
  ).toBeLessThan(-900);
  await expect.poll(
    async () => playback.locator("video[data-stream-player]").count(),
    { timeout: 10000 }
  ).toBe(0);

  await expect(card).toBeAttached();
  await expect(playback.locator(".feed-video-poster")).toBeAttached();
  await expect(page.locator("video[data-stream-player]")).toHaveCount(0);
  await context.close();
});
