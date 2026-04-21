const fs = require("fs");
const path = require("path");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizePlainText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[<>"'`]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeStoredImageReference(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  if (value.startsWith("/uploads/")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith("/uploads/")) {
      return parsed.pathname;
    }
    if (/^https?:\/\//i.test(value)) {
      return value;
    }
  } catch (error) {
    return value;
  }

  return value;
}

function getOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || "https";
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(req.headers.host || "").trim();
  return host ? `${protocol}://${host}` : "https://wingamarket.com";
}

function getImageUrl(product, origin) {
  const candidates = [
    ...(Array.isArray(product?.images) ? product.images : []),
    product?.image || ""
  ].map(normalizeStoredImageReference).filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.startsWith("/uploads/")) {
      return `${origin}${candidate}`;
    }
    if (/^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  return `${origin}/share-og.svg`;
}

function getTitle(product) {
  const name = sanitizePlainText(product?.name || "", 120);
  const shop = sanitizePlainText(product?.shop || "", 80);
  if (name && shop && !name.toLowerCase().includes(shop.toLowerCase())) {
    return `${name} | ${shop}`;
  }
  return name || shop || "Winga product";
}

function getDescription(product) {
  const caption = sanitizePlainText(product?.description || product?.caption || "", 180);
  if (caption) {
    return caption;
  }

  const parts = [];
  const shop = sanitizePlainText(product?.shop || "", 80);
  const category = sanitizePlainText(product?.category || "", 60);
  const price = Number(product?.price);

  if (shop) parts.push(shop);
  if (category) parts.push(category);
  if (Number.isFinite(price) && price > 0) {
    parts.push(`Bei TSh ${new Intl.NumberFormat("en-US").format(price)}`);
  }

  return parts.length ? parts.join(" · ") : "Tazama bidhaa hii kwenye Winga.";
}

function buildHtml(template, meta) {
  const safeTitle = escapeHtml(meta.title);
  const safeDescription = escapeHtml(meta.description);
  const safeUrl = escapeHtml(meta.url);
  const safeImage = escapeHtml(meta.image);
  const safeTemplate = template || `<!DOCTYPE html>
<html lang="sw">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="winga-build" content="">
  <title>${safeTitle}</title>
</head>
<body>
  <div id="app-container"></div>
</body>
</html>`;

  const metaBlock = `
  <meta name="description" content="${safeDescription}">
  <link rel="canonical" href="${safeUrl}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:image" content="${safeImage}">
  <meta property="og:image:secure_url" content="${safeImage}">
  <meta property="og:image:alt" content="${safeTitle}">
  <meta property="og:url" content="${safeUrl}">
  <meta property="og:site_name" content="Winga">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${safeImage}">`;

  const titlePatched = safeTemplate.replace(/<title>[^<]*<\/title>/i, `<title>${safeTitle}</title>`);
  if (titlePatched.includes('name="winga-build"')) {
    return titlePatched.replace(/(<meta name="winga-build" content="[^"]*">)/i, `$1${metaBlock}`);
  }
  return titlePatched.replace(/(<meta name="viewport" content="width=device-width, initial-scale=1.0">)/i, `$1${metaBlock}`);
}

async function fetchProducts(origin) {
  const response = await fetch(`${origin}/api/products`, {
    headers: {
      accept: "application/json"
    }
  });
  if (!response.ok) {
    return [];
  }
  const payload = await response.json().catch(() => []);
  return Array.isArray(payload) ? payload : [];
}

module.exports = async function productOgRoute(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.end("Method Not Allowed");
    return;
  }

  const origin = getOrigin(req);
  const productId = sanitizePlainText(req.query?.id || req.url.split("/").pop() || "", 80);
  const canonicalUrl = `${origin}/product/${encodeURIComponent(productId)}`;
  const appTemplatePath = path.join(process.cwd(), "index.html");
  const template = fs.existsSync(appTemplatePath) ? fs.readFileSync(appTemplatePath, "utf8") : "";

  let product = null;
  try {
    const products = await fetchProducts(origin);
    product = products.find((item) => String(item?.id || "") === productId) || null;
  } catch (error) {
    product = null;
  }

  const isFound = Boolean(product);
  const title = isFound ? getTitle(product) : "Bidhaa haijapatikana | Winga";
  const description = isFound ? getDescription(product) : "Bidhaa hii haijapatikana kwenye Winga.";
  const image = isFound ? getImageUrl(product, origin) : `${origin}/share-og.svg`;
  const html = buildHtml(template, {
    title,
    description,
    url: canonicalUrl,
    image
  });

  res.statusCode = isFound ? 200 : 404;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(html);
};
