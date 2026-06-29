const BACKEND_API_ORIGIN = "https://winga-pflp.onrender.com";
const MAX_PROXY_BODY_BYTES = 20 * 1024 * 1024;

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length"
]);

function getRequestPath(req) {
  const rawPath = String(req.url || "").split("?")[0] || "/";
  return rawPath.startsWith("/api/") ? rawPath : `/api${rawPath.startsWith("/") ? "" : "/"}${rawPath}`;
}

function getRequestSearch(req) {
  const rawUrl = String(req.url || "");
  const queryIndex = rawUrl.indexOf("?");
  return queryIndex >= 0 ? rawUrl.slice(queryIndex) : "";
}

function copyRequestHeaders(req) {
  const headers = {};
  Object.entries(req.headers || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || "").toLowerCase();
    if (!normalizedKey || HOP_BY_HOP_HEADERS.has(normalizedKey)) {
      return;
    }
    headers[normalizedKey] = Array.isArray(value) ? value.join(", ") : String(value);
  });
  headers["x-winga-proxy"] = "vercel-api";
  return headers;
}

function copyResponseHeaders(response, res) {
  response.headers.forEach((value, key) => {
    const normalizedKey = String(key || "").toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedKey)) {
      return;
    }
    res.setHeader(key, value);
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_PROXY_BODY_BYTES) {
        reject(Object.assign(new Error("Request body too large."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on("error", reject);
  });
}

async function proxyApiRequest(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  const targetUrl = `${BACKEND_API_ORIGIN}${getRequestPath(req)}${getRequestSearch(req)}`;
  const headers = copyRequestHeaders(req);
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await readRequestBody(req) : undefined;

  const response = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: "manual"
  });

  res.statusCode = response.status;
  copyResponseHeaders(response, res);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (method === "HEAD") {
    res.end();
    return;
  }
  res.end(buffer);
}

module.exports = async function wingaApiProxy(req, res) {
  try {
    await proxyApiRequest(req, res);
  } catch (error) {
    const statusCode = Number(error?.statusCode || 502);
    res.statusCode = Number.isFinite(statusCode) ? statusCode : 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({
      error: "API proxy haijafanikiwa kuwasiliana na backend.",
      code: statusCode === 413 ? "proxy_body_too_large" : "api_proxy_failed"
    }));
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
