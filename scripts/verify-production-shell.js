const https = require("https");

const PRODUCTION_ORIGIN = process.env.WINGA_VERIFY_ORIGIN || "https://wingamarket.com";
const REQUIRED_ROUTES = [
  { path: "/", kind: "html" },
  { path: "/index.html", kind: "html" },
  { path: "/sw.js", kind: "service-worker" }
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
  }
  console.log(`OK ${route.path}`);
  return { bodyText, headers: response.headers };
}

async function main() {
  console.log(`Verifying production shell at ${PRODUCTION_ORIGIN}`);
  let homeHtml = "";
  for (const route of REQUIRED_ROUTES) {
    const result = await verifyRoute(route);
    if (route.path === "/") {
      homeHtml = result.bodyText;
    }
  }
  const appPath = extractVersionedAssetPath(homeHtml, /src="(\/app\.js\?v=[^"]+)"/i, "/app.js");
  const stylePath = extractVersionedAssetPath(homeHtml, /href="(\/style\.css\?v=[^"]+)"/i, "/style.css");
  await verifyRoute({ path: appPath, kind: "javascript" });
  await verifyRoute({ path: stylePath, kind: "css" });
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
