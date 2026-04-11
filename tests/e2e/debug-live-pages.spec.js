const { test, expect } = require("@playwright/test");

test("debug live custom-domain card open behavior", async ({ page }) => {
  const consoleEntries = [];
  page.on("console", (msg) => {
    consoleEntries.push({ type: msg.type(), text: msg.text() });
  });
  page.on("pageerror", (error) => {
    consoleEntries.push({ type: "pageerror", text: error.message });
  });

  await page.goto("https://wingamarket.com/winga", {
    waitUntil: "domcontentloaded",
    timeout: 120000
  });

  await page.waitForTimeout(5000);
  await expect(page.locator("#products-container .product-card").first()).toBeVisible({ timeout: 30000 });

  const firstTile = page.locator("#products-container .feed-gallery-tile").first();
  await expect(firstTile).toBeVisible();
  await firstTile.click();
  await page.waitForTimeout(1500);

  const state = await page.evaluate(() => ({
    href: location.href,
    bodyClass: document.body.className,
    authDisplay: document.getElementById("auth-container")?.style.display || "",
    detailExists: Boolean(document.getElementById("product-detail-modal")),
    detailDisplay: document.getElementById("product-detail-modal")?.style.display || "",
    title: document.getElementById("product-detail-title")?.textContent || "",
    topScripts: [...document.querySelectorAll('script[src]')].map((s) => s.src).filter((src) =>
      src.includes("app.js")
      || src.includes("src/navigation/controller.js")
      || src.includes("src/marketplace/ui.js")
      || src.includes("src/product-detail/controller.js")
    ).slice(0, 8)
  }));

  console.log("DEBUG_LIVE_CUSTOM_DOMAIN_STATE", JSON.stringify(state, null, 2));
  console.log("DEBUG_LIVE_CUSTOM_DOMAIN_CONSOLE", JSON.stringify(consoleEntries.slice(-20), null, 2));
});
