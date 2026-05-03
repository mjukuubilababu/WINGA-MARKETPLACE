import { chromium } from "@playwright/test";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_ROOT = process.env.WINGA_SERVE_PUBLIC === "1"
  ? path.join(__dirname, "public")
  : __dirname;
const FRONTEND_PORT = process.env.WINGA_SERVE_PUBLIC === "1" ? 4174 : 4173;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_URL = "http://127.0.0.1:43080/api";

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
      const requestUrl = new URL(req.url, FRONTEND_URL);
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === "/" || !path.extname(pathname)) {
        pathname = pathname.startsWith("/product/") || pathname.startsWith("/api/product/")
          ? `${pathname.replace(/\/+$/, "")}/index.html`
          : "/index.html";
      }
      let resolvedPath = path.resolve(STATIC_ROOT, `.${pathname}`);
      if (!resolvedPath.startsWith(STATIC_ROOT)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      let fileBuffer;
      try {
        fileBuffer = await fs.readFile(resolvedPath);
      } catch (error) {
        if (pathname.startsWith("/product/") || pathname.startsWith("/api/product/")) {
          resolvedPath = path.resolve(STATIC_ROOT, "./index.html");
          fileBuffer = await fs.readFile(resolvedPath);
        } else {
          throw error;
        }
      }
      const contentType = getContentType(resolvedPath);
      if (process.env.WINGA_SERVE_PUBLIC === "1" && contentType.startsWith("text/html")) {
        const overrideScript = `<script>window.__WINGA_CONFIG_OVERRIDE__={provider:"api",fallbackProvider:"",apiBaseUrl:"http://127.0.0.1:43080/api",enableMockSeed:false};</script>`;
        fileBuffer = Buffer.from(String(fileBuffer).replace(/<head>/i, `<head>${overrideScript}`), "utf8");
      }
      res.writeHead(200, { "Content-Type": contentType });
      res.end(fileBuffer);
    } catch (error) {
      res.writeHead(404);
      res.end("Not Found");
    }
  });
}

async function fetchJson(pathname) {
  const response = await fetch(`${BACKEND_URL}${pathname}`);
  if (!response.ok) {
    throw new Error(`${pathname} -> ${response.status}`);
  }
  return response.json();
}

function countDuplicates(items = [], keyFn) {
  const counts = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = keyFn(item);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const products = await fetchJson("/products");
  const users = await fetchJson("/users");
  let firstApprovedProduct = (Array.isArray(products) ? products : []).find((item) => item?.status === "approved" && item?.id);
  if (process.env.WINGA_SERVE_PUBLIC === "1" && process.env.WINGA_USE_GENERATED_PRODUCT === "1") {
    const generatedProductRoot = path.join(__dirname, "public", "product");
    const generatedProductDirs = await fs.readdir(generatedProductRoot, { withFileTypes: true }).catch(() => []);
    const generatedProductId = generatedProductDirs.find((entry) => entry.isDirectory())?.name || "";
    if (generatedProductId) {
      firstApprovedProduct = { id: generatedProductId };
    }
  }
  if (!firstApprovedProduct) {
    throw new Error("No approved product available for deep-link check.");
  }

  let staticServer = null;
  if (process.env.WINGA_SERVE_PUBLIC === "1") {
    staticServer = createStaticServer();
    await new Promise((resolve) => staticServer.listen(FRONTEND_PORT, "127.0.0.1", resolve));
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1365, height: 900 }
  });

  const consoleEvents = [];
  const pageErrors = [];

  page.on("console", (message) => {
    consoleEvents.push({
      type: message.type(),
      text: message.text()
    });
  });

  page.on("pageerror", (error) => {
    pageErrors.push({
      message: error.message,
      stack: error.stack || ""
    });
  });

  await page.goto(`${FRONTEND_URL}/product/${encodeURIComponent(firstApprovedProduct.id)}`, {
    waitUntil: "domcontentloaded"
  });

  await wait(3500);

  const deepLinkState = await page.evaluate(() => {
    const shellTitle = document.querySelector(".brand-mark")?.textContent?.trim()
      || document.querySelector(".top-bar .brand")?.textContent?.trim()
      || "";
    const shellSubtitle = document.querySelector(".tagline")?.textContent?.trim()
      || document.querySelector(".top-bar p")?.textContent?.trim()
      || "";
    const productCards = document.querySelectorAll(".product-card, .seller-product-card").length;
    const detailOpen = document.body.classList.contains("product-detail-open");
    const loadingVisible = Boolean(document.querySelector(".deep-link-loading-shell, .feed-loading-state, .lifecycle-fallback-shell"));
    const diagnostics = window.__WINGA_DIAGNOSTICS__?.snapshot?.() || null;
    const bootEvents = window.__WINGA_EVENT_BUFFER__ || [];
    const products = Array.isArray(window.WingaDataLayer?.getProducts?.()) ? window.WingaDataLayer.getProducts() : [];
    const users = Array.isArray(window.WingaDataLayer?.getUsers?.()) ? window.WingaDataLayer.getUsers() : [];

    const countDupes = (items, getKey) => {
      const counts = new Map();
      items.forEach((item) => {
        const key = getKey(item);
        if (!key) {
          return;
        }
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      return Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ key, count }));
    };

    return {
      pathname: window.location.pathname,
      shellTitle,
      shellSubtitle,
      productCards,
      detailOpen,
      loadingVisible,
      diagnostics,
      bootEvents: bootEvents.slice(-20),
      duplicateProductIds: countDupes(products, (item) => String(item?.id || "").trim()),
      duplicateUsernames: countDupes(users, (item) => String(item?.username || "").trim())
    };
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await wait(1200);
  await page.setViewportSize({ width: 1280, height: 900 });
  await wait(1200);

  const responsiveState = await page.evaluate(() => {
    const detailOpen = document.body.classList.contains("product-detail-open");
    const productCards = document.querySelectorAll(".product-card, .seller-product-card").length;
    const diagnostics = window.__WINGA_DIAGNOSTICS__?.snapshot?.() || null;
    return {
      pathname: window.location.pathname,
      detailOpen,
      productCards,
      diagnostics
    };
  });

  await browser.close();
  if (staticServer) {
    await new Promise((resolve) => staticServer.close(resolve));
  }

  const localDuplicateUsernames = countDuplicates(users, (item) => String(item?.username || "").trim());
  const localDuplicateProductIds = countDuplicates(products, (item) => String(item?.id || "").trim());

  const result = {
    productId: firstApprovedProduct.id,
    sourceCounts: {
      users: Array.isArray(users) ? users.length : 0,
      products: Array.isArray(products) ? products.length : 0
    },
    sourceDuplicates: {
      usernames: localDuplicateUsernames,
      productIds: localDuplicateProductIds
    },
    deepLinkState,
    responsiveState,
    firstConsoleError: consoleEvents.find((entry) => entry.type === "error") || null,
    firstConsoleWarning: consoleEvents.find((entry) => entry.type === "warning") || null,
    pageErrors
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
