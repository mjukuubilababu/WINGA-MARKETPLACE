const https = require("https");

const FRONTEND_ORIGIN = process.env.WINGA_FRONTEND_ORIGIN || "https://wingamarket.com";
const VERCEL_ORIGIN = process.env.WINGA_VERCEL_ORIGIN || "https://winga-marketplace.vercel.app";
const BACKEND_ORIGIN = process.env.WINGA_BACKEND_ORIGIN || "https://winga-pflp.onrender.com";

const CHECKS = [
  { label: "frontend home", url: `${FRONTEND_ORIGIN}/`, expected: "html", requireVercel: true },
  { label: "frontend API products", url: `${FRONTEND_ORIGIN}/api/products?limit=1&page=1`, expected: "json", requireVercel: true },
  { label: "frontend CSRF", url: `${FRONTEND_ORIGIN}/api/auth/csrf-token`, expected: "json", requireVercel: true, requireCookie: true },
  { label: "vercel API products", url: `${VERCEL_ORIGIN}/api/products?limit=1&page=1`, expected: "json", requireVercel: true },
  { label: "backend API products", url: `${BACKEND_ORIGIN}/api/products?limit=1&page=1`, expected: "json" }
];

function fetchUrl(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { accept: "application/json,text/html;q=0.8,*/*;q=0.5" } }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers || {},
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out while fetching ${url}`));
    });
  });
}

function getHeader(headers, name) {
  return String(headers?.[String(name || "").toLowerCase()] || headers?.[name] || "");
}

function summarizeResponse(check, response) {
  const bodyStart = String(response.body || "").trimStart().slice(0, 80).replace(/\s+/g, " ");
  return {
    label: check.label,
    url: check.url,
    status: response.statusCode,
    contentType: getHeader(response.headers, "content-type"),
    server: getHeader(response.headers, "server"),
    cfRay: getHeader(response.headers, "cf-ray"),
    xVercelId: getHeader(response.headers, "x-vercel-id"),
    setCookie: getHeader(response.headers, "set-cookie") ? "present" : "",
    bodyStart
  };
}

function assertExpected(check, response, summary) {
  if (response.statusCode !== 200) {
    throw new Error(`${check.label} returned ${response.statusCode}.`);
  }

  if (check.expected === "json") {
    if (!/application\/json/i.test(summary.contentType)) {
      throw new Error(`${check.label} returned ${summary.contentType || "no content-type"} instead of application/json.`);
    }
    try {
      JSON.parse(response.body);
    } catch (error) {
      throw new Error(`${check.label} returned invalid JSON.`);
    }
  }

  if (check.expected === "html" && !/text\/html/i.test(summary.contentType)) {
    throw new Error(`${check.label} returned ${summary.contentType || "no content-type"} instead of text/html.`);
  }

  if (check.requireVercel && !summary.xVercelId) {
    throw new Error(`${check.label} did not include X-Vercel-Id, so traffic is not reaching the Vercel deployment.`);
  }

  if (check.requireCookie && !summary.setCookie) {
    throw new Error(`${check.label} did not set the expected CSRF cookie.`);
  }
}

function formatError(error) {
  if (!error) {
    return "Unknown error";
  }
  if (Array.isArray(error.errors) && error.errors.length) {
    return error.errors
      .map((entry) => entry?.message || entry?.code || String(entry || ""))
      .filter(Boolean)
      .join("; ");
  }
  return error.message || error.code || String(error);
}

async function main() {
  console.log("Verifying Winga production domain routing");
  const summaries = [];
  const failures = [];

  for (const check of CHECKS) {
    try {
      const response = await fetchUrl(check.url);
      const summary = summarizeResponse(check, response);
      summaries.push(summary);
      assertExpected(check, response, summary);
      console.log(`OK ${check.label}`);
    } catch (error) {
      const message = formatError(error);
      failures.push({ label: check.label, error: message });
      console.error(`FAIL ${check.label}: ${message}`);
    }
  }

  console.log(JSON.stringify(summaries, null, 2));

  if (failures.length) {
    console.error("Domain routing verification failed.");
    console.error("Expected wingamarket.com to reach Vercel for both the app shell and /api/* routes.");
    console.error("If Vercel alias checks pass while wingamarket.com fails, fix Cloudflare DNS/Page/Worker routing before launch.");
    process.exit(1);
  }

  console.log("Domain routing verification passed.");
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error || ""));
  process.exit(1);
});
