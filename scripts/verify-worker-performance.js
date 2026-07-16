const FRONTEND_ORIGIN = process.env.WINGA_FRONTEND_ORIGIN || "https://wingamarket.com";

function getHeader(headers, name) {
  return headers.get(name) || headers.get(name.toLowerCase()) || "";
}

function normalizeBodyStart(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

async function main() {
  const target = `${FRONTEND_ORIGIN.replace(/\/$/, "")}/`;
  console.log(`Verifying Winga Worker performance hints at ${target}`);
  const response = await fetch(target, {
    headers: {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  });
  const body = await response.text();
  const linkHeader = getHeader(response.headers, "link");
  const cfRay = getHeader(response.headers, "cf-ray");
  const xVercelId = getHeader(response.headers, "x-vercel-id");
  const lcpPreloadStatus = getHeader(response.headers, "x-winga-lcp-preload");
  const workerMode = getHeader(response.headers, "x-winga-worker-mode");
  const bootstrapStatus = getHeader(response.headers, "x-winga-bootstrap-status");
  const bootstrapContextBudget = getHeader(response.headers, "x-winga-bootstrap-context-budget");
  const serverTiming = getHeader(response.headers, "server-timing");
  const server = getHeader(response.headers, "server");
  const preloadTags = body.match(/<link\s+rel="preload"\s+as="image"[^>]+fetchpriority="high"[^>]*>/gi) || [];
  const buildVersionMatch = body.match(/data-winga-build-version[^>]*>(\d{14})</i);
  const bodyStart = normalizeBodyStart(body);

  const summary = {
    status: response.status,
    server,
    cfRay: cfRay ? "present" : "",
    xVercelId: xVercelId ? "present" : "",
    linkHeader,
    lcpPreloadStatus,
    workerMode,
    bootstrapStatus,
    bootstrapContextBudget,
    serverTiming,
    preloadTagCount: preloadTags.length,
    buildVersion: buildVersionMatch?.[1] || "",
    bodyStart
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!response.ok) {
    throw new Error(`Home returned HTTP ${response.status}`);
  }
  if (!cfRay || xVercelId) {
    throw new Error("Home response does not look like Cloudflare Worker traffic.");
  }
  if (!/rel=preload;\s*as=image;\s*fetchpriority=high/i.test(linkHeader)) {
    throw new Error("Home response is missing the LCP image preload Link header.");
  }
  if (workerMode !== "streaming-shell" || bootstrapStatus !== "background-stream") {
    throw new Error("Home response is missing streaming Worker mode headers.");
  }
  if (!/^\d+$/.test(bootstrapContextBudget) || Number(bootstrapContextBudget) > 300) {
    throw new Error("Home response is missing a bounded optional bootstrap context budget.");
  }
  if (!/worker-shell;dur=/i.test(serverTiming)) {
    throw new Error("Home response is missing worker-shell Server-Timing.");
  }
  if (preloadTags.length !== 1) {
    throw new Error(`Expected exactly one LCP image preload tag, found ${preloadTags.length}.`);
  }
  if (!buildVersionMatch?.[1]) {
    throw new Error("Home response is missing the production build version marker.");
  }
  console.log("Worker performance hint verification passed.");
}

main().catch((error) => {
  console.error("Worker performance hint verification failed.");
  console.error(error?.message || error);
  process.exit(1);
});
