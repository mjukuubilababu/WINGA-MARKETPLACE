import { chromium } from "@playwright/test";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_ROOT = path.join(__dirname, "public");
const FRONTEND_PORT = 4176;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_ORIGIN = "http://127.0.0.1:43080";
const BACKEND_API = `${BACKEND_ORIGIN}/api`;

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
      if (requestUrl.pathname.startsWith("/api/") || requestUrl.pathname.startsWith("/uploads/")) {
        const proxyTarget = requestUrl.pathname.startsWith("/api/")
          ? `${BACKEND_API}${requestUrl.pathname.replace(/^\/api/, "")}${requestUrl.search}`
          : `${BACKEND_ORIGIN}${requestUrl.pathname}${requestUrl.search}`;
        const proxyResponse = await fetch(proxyTarget, {
          method: req.method,
          headers: req.headers,
          body: req.method && ["GET", "HEAD"].includes(req.method.toUpperCase()) ? undefined : req
        });
        const responseHeaders = Object.fromEntries(proxyResponse.headers.entries());
        responseHeaders["Access-Control-Allow-Origin"] = FRONTEND_URL;
        res.writeHead(proxyResponse.status, responseHeaders);
        if (proxyResponse.body) {
          for await (const chunk of proxyResponse.body) {
            res.write(chunk);
          }
        }
        res.end();
        return;
      }

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
      } catch {
        if (pathname.startsWith("/product/") || pathname.startsWith("/api/product/")) {
          resolvedPath = path.resolve(STATIC_ROOT, "./index.html");
          fileBuffer = await fs.readFile(resolvedPath);
        } else {
          throw new Error("Not found");
        }
      }
      const contentType = getContentType(resolvedPath);
      if (contentType.startsWith("text/html")) {
        const overrideScript = `<script>window.__WINGA_CONFIG_OVERRIDE__={provider:"api",fallbackProvider:"",apiBaseUrl:"${FRONTEND_URL}/api",enableMockSeed:false,disableServiceWorker:true,enableApiLocalCacheFallback:false,enableBootstrapFeedSnapshot:false,clearLegacyLocalDataOnBoot:true};</script>`;
        fileBuffer = Buffer.from(String(fileBuffer).replace(/<head>/i, `<head>${overrideScript}`), "utf8");
      }
      res.writeHead(200, { "Content-Type": contentType });
      res.end(fileBuffer);
    } catch {
      res.writeHead(404);
      res.end("Not Found");
    }
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureVisibleMediaState(page, label) {
  return page.evaluate((snapshotLabel) => {
    const images = Array.from(document.querySelectorAll("img[data-marketplace-scroll-image='true']")).slice(0, 24);
    const visible = images.filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    const summary = visible.map((image) => {
      const shell = image.closest(".progressive-image-shell");
      const rect = image.getBoundingClientRect();
      const style = window.getComputedStyle(image);
      const shellStyle = shell ? window.getComputedStyle(shell) : null;
      return {
        src: image.currentSrc || image.getAttribute("src") || "",
        naturalWidth: Number(image.naturalWidth || 0),
        naturalHeight: Number(image.naturalHeight || 0),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        opacity: style.opacity,
        display: style.display,
        visibility: style.visibility,
        shellOpacity: shellStyle?.opacity || "",
        shellClasses: shell?.className || "",
        state: image.dataset.marketplaceImageState || "",
        complete: image.complete
      };
    });
    const bad = summary.filter((item) =>
      item.width === 0
      || item.height === 0
      || item.opacity === "0"
      || item.visibility === "hidden"
      || (item.complete && item.naturalWidth === 0)
      || /is-pending/.test(item.shellClasses)
    );
    return {
      label: snapshotLabel,
      currentView: window.__WINGA_DIAGNOSTICS__?.snapshot?.()?.currentView || "",
      visibleCount: visible.length,
      badCount: bad.length,
      bad
    };
  }, label);
}

async function main() {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(FRONTEND_PORT, "127.0.0.1", resolve));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const consoleEvents = [];
  const pageErrors = [];
  page.on("console", (message) => consoleEvents.push({ type: message.type(), text: message.text() }));
  page.on("pageerror", (error) => pageErrors.push({ message: error.message, stack: error.stack || "" }));

  await page.goto(`${FRONTEND_URL}/`, { waitUntil: "domcontentloaded" });
  await wait(3000);
  const initial = await captureVisibleMediaState(page, "initial");

  await page.mouse.wheel(0, 1800);
  await wait(1800);
  const afterSlowScroll = await captureVisibleMediaState(page, "after_slow_scroll");

  await page.mouse.wheel(0, 2800);
  await wait(1500);
  const afterFastScroll = await captureVisibleMediaState(page, "after_fast_scroll");

  await page.reload({ waitUntil: "domcontentloaded" });
  await wait(3200);
  const afterRefresh = await captureVisibleMediaState(page, "after_refresh");

  console.log(JSON.stringify({
    initial,
    afterSlowScroll,
    afterFastScroll,
    afterRefresh,
    firstConsoleError: consoleEvents.find((entry) => entry.type === "error") || null,
    pageErrors
  }, null, 2));

  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
