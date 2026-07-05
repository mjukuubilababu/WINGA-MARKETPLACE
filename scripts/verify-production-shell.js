const https = require("https");

const PRODUCTION_ORIGIN = process.env.WINGA_VERIFY_ORIGIN || "https://wingamarket.com";
const REQUIRED_ROUTES = [
  { path: "/", kind: "html" },
  { path: "/index.html", kind: "html" },
  { path: "/sw.js", kind: "service-worker" },
  { path: "/build-version.json", kind: "build-version" }
];

function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const statusCode = response.statusCode || 0;
      const headers = response.headers || {};
      if ([301, 302, 307, 308].includes(statusCode) && headers.location) {
        if (redirectCount >= 5) {
          response.resume();
          reject(new Error(`Too many redirects while fetching ${url}`));
          return;
        }
        const nextUrl = new URL(headers.location, url).toString();
        response.resume();
        fetchUrl(nextUrl, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          statusCode,
          headers,
          body: Buffer.concat(chunks)
        });
      });
    });
    request.on("error", reject);
    request.setTimeout(20000, () => {
      request.destroy(new Error(`Timed out while fetching ${url}`));
    });
  });
}

function hasNullBytes(buffer) {
  return buffer.includes(0);
}

function assertHtml(route, bodyText) {
  const normalized = String(bodyText || "").trimStart();
  if (!normalized) {
    throw new Error(`${route} returned an empty HTML document.`);
  }
  if (!/^<!doctype html>/i.test(normalized)) {
    throw new Error(`${route} is missing a valid doctype.`);
  }
  if (!/id="app-container"/i.test(normalized)) {
    throw new Error(`${route} is missing #app-container.`);
  }
  if (!/id="boot-overlay"/i.test(normalized)) {
    throw new Error(`${route} is missing #boot-overlay.`);
  }
  if (!/src="\/app\.js\?v=/i.test(normalized)) {
    throw new Error(`${route} is missing versioned /app.js.`);
  }
  if (!/href="\/style\.css\?v=/i.test(normalized)) {
    throw new Error(`${route} is missing versioned /style.css.`);
  }
  if (!/<meta name="winga-build" content="\d{14}">/i.test(normalized)) {
    throw new Error(`${route} is missing a concrete Winga build version.`);
  }
  if (!/data-winga-build-version/i.test(normalized)) {
    throw new Error(`${route} is missing the visible app build version marker.`);
  }
}

function getHeader(headers, name) {
  return String(headers?.[String(name || "").toLowerCase()] || headers?.[name] || "");
}

function assertHardenedHeaders(route, headers, options = {}) {
  const hsts = getHeader(headers, "strict-transport-security");
  if (!/max-age=31536000/i.test(hsts) || !/includeSubDomains/i.test(hsts)) {
    throw new Error(`${route} is missing production HSTS.`);
  }
  const csp = getHeader(headers, "content-security-policy");
  if (!csp) {
    throw new Error(`${route} is missing Content-Security-Policy.`);
  }
  if (/unsafe-eval/i.test(csp)) {
    throw new Error(`${route} CSP still allows unsafe-eval.`);
  }
  if (options.disallowScriptInline !== false && /script-src[^;]*unsafe-inline/i.test(csp)) {
    throw new Error(`${route} CSP still allows inline scripts.`);
  }
}

function extractVersionedAssetPath(html, pattern, label) {
  const match = String(html || "").match(pattern);
  if (!match?.[1]) {
    throw new Error(`Production shell is missing versioned ${label}.`);
  }
  return match[1].replace(/&amp;/g, "&");
}

function assertServiceWorker(route, bodyText) {
  const normalized = String(bodyText || "").trim();
  if (!normalized) {
    throw new Error(`${route} returned an empty service worker.`);
  }
  if (!/clearAllRecoveryCaches|registration\.unregister|self\.addEventListener\("activate"/.test(normalized)) {
    throw new Error(`${route} does not look like the recovery service worker.`);
  }
  if (!/const BUILD_VERSION = "\d{14}";/.test(normalized)) {
    throw new Error(`${route} is missing a concrete BUILD_VERSION.`);
  }
}

function assertJavascript(route, bodyText) {
  const normalized = String(bodyText || "").trimStart();
  if (!normalized || !/const APP_BOOT_BUILD_VERSION|bootApp\(\)/.test(normalized)) {
    throw new Error(`${route} does not look like the expected app entry bundle.`);
  }
}

function assertCss(route, bodyText) {
  const normalized = String(bodyText || "").trimStart();
  if (!normalized || !/:root\s*\{/.test(normalized)) {
    throw new Error(`${route} does not look like the expected stylesheet.`);
  }
}

function assertJsonContentType(route, headers) {
  const contentType = getHeader(headers, "content-type");
  if (!/application\/json/i.test(contentType)) {
    throw new Error(`${route} returned ${contentType || "no content-type"} instead of application/json.`);
  }
}

function parseJsonRoute(route, bodyText) {
  try {
    return JSON.parse(String(bodyText || ""));
  } catch (error) {
    throw new Error(`${route} returned invalid JSON.`);
  }
}

function assertProductsApi(route, bodyText, headers) {
  assertJsonContentType(route, headers);
  const payload = parseJsonRoute(route, bodyText);
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error(`${route} is missing items[].`);
  }
  if (payload.items.length > 50) {
    throw new Error(`${route} returned more than the production page limit.`);
  }
  if (typeof payload.hasMore !== "boolean") {
    throw new Error(`${route} is missing boolean hasMore.`);
  }
}

function assertCsrfApi(route, bodyText, headers) {
  assertJsonContentType(route, headers);
  const payload = parseJsonRoute(route, bodyText);
  if (!payload?.csrfToken || String(payload.csrfToken).length < 32) {
    throw new Error(`${route} did not return a usable CSRF token.`);
  }
  const setCookie = getHeader(headers, "set-cookie");
  if (!/winga_csrf=/i.test(setCookie) || !/HttpOnly/i.test(setCookie) || !/Secure/i.test(setCookie)) {
    throw new Error(`${route} did not set a hardened CSRF cookie.`);
  }
}

function extractBuildVersionFromHtml(html) {
  return String(html || "").match(/<meta name="winga-build" content="([^"]+)">/i)?.[1] || "";
}

function extractVersionQuery(assetPath = "") {
  return String(assetPath || "").match(/[?&]v=([^&]+)/)?.[1] || "";
}

function extractServiceWorkerVersion(source = "") {
  return String(source || "").match(/const BUILD_VERSION = "([^"]+)";/)?.[1] || "";
}

function assertBuildVersionJson(route, bodyText, headers) {
  assertJsonContentType(route, headers);
  const payload = parseJsonRoute(route, bodyText);
  if (!payload?.version || !/^\d{14}$/.test(String(payload.version))) {
    throw new Error(`${route} is missing a concrete version.`);
  }
  if (payload.source !== "build-vercel-static") {
    throw new Error(`${route} has an unexpected source marker.`);
  }
}

async function verifyRoute(route) {
  const url = new URL(route.path, PRODUCTION_ORIGIN).toString();
  const response = await fetchUrl(url);
  if (response.statusCode !== 200) {
    throw new Error(`${route.path} returned ${response.statusCode} instead of 200.`);
  }
  if (hasNullBytes(response.body)) {
    throw new Error(`${route.path} contains NUL bytes and would cause a blank shell.`);
  }
  const bodyText = response.body.toString("utf8");
  if (route.kind === "html") {
    assertHtml(route.path, bodyText);
    assertHardenedHeaders(route.path, response.headers, { disallowScriptInline: true });
  } else if (route.kind === "service-worker") {
    assertServiceWorker(route.path, bodyText);
    assertHardenedHeaders(route.path, response.headers, { disallowScriptInline: true });
  } else if (route.kind === "javascript") {
    assertJavascript(route.path, bodyText);
    assertHardenedHeaders(route.path, response.headers, { disallowScriptInline: true });
  } else if (route.kind === "css") {
    assertCss(route.path, bodyText);
    assertHardenedHeaders(route.path, response.headers, { disallowScriptInline: true });
  } else if (route.kind === "products-api") {
    assertProductsApi(route.path, bodyText, response.headers);
  } else if (route.kind === "csrf-api") {
    assertCsrfApi(route.path, bodyText, response.headers);
  } else if (route.kind === "build-version") {
    assertBuildVersionJson(route.path, bodyText, response.headers);
    assertHardenedHeaders(route.path, response.headers, { disallowScriptInline: true });
  }
  console.log(`OK ${route.path}`);
  return { bodyText, headers: response.headers };
}

async function main() {
  console.log(`Verifying production shell at ${PRODUCTION_ORIGIN}`);
  let homeHtml = "";
  let serviceWorkerSource = "";
  let buildVersionPayload = null;
  for (const route of REQUIRED_ROUTES) {
    const result = await verifyRoute(route);
    if (route.path === "/") {
      homeHtml = result.bodyText;
    }
    if (route.path === "/sw.js") {
      serviceWorkerSource = result.bodyText;
    }
    if (route.path === "/build-version.json") {
      buildVersionPayload = parseJsonRoute(route.path, result.bodyText);
    }
  }
  const appPath = extractVersionedAssetPath(homeHtml, /src="(\/app\.js\?v=[^"]+)"/i, "/app.js");
  const stylePath = extractVersionedAssetPath(homeHtml, /href="(\/style\.css\?v=[^"]+)"/i, "/style.css");
  const htmlVersion = extractBuildVersionFromHtml(homeHtml);
  const appVersion = extractVersionQuery(appPath);
  const styleVersion = extractVersionQuery(stylePath);
  const swVersion = extractServiceWorkerVersion(serviceWorkerSource);
  const jsonVersion = String(buildVersionPayload?.version || "");
  const versions = new Set([htmlVersion, appVersion, styleVersion, swVersion, jsonVersion].filter(Boolean));
  if (versions.size !== 1) {
    throw new Error(`Production build versions do not match: ${JSON.stringify({ htmlVersion, appVersion, styleVersion, swVersion, jsonVersion })}`);
  }
  await verifyRoute({ path: appPath, kind: "javascript" });
  await verifyRoute({ path: stylePath, kind: "css" });
  await verifyRoute({ path: "/api/products?limit=1&page=1", kind: "products-api" });
  await verifyRoute({ path: "/api/auth/csrf-token", kind: "csrf-api" });
  console.log("Production shell verification passed.");
}

main().catch((error) => {
  const message = error?.message || String(error || "") || "Unknown production verification error";
  console.error(`Production shell verification failed: ${message}`);
  if (error?.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
