const ORIGIN_BASE_URL = "https://winga-pflp.onrender.com";
/*
 * WINGA BOOT OWNERSHIP
 * 1. Cloudflare Worker owns first paint: inline splash, skeleton shell, streamed first feed batch.
 * 2. Cloudflare Worker owns edge image caching for /uploads/* and API proxy routing.
 * 3. App JS owns client state, feed continuation, sentinels, carousel, and interactions after first paint.
 * 4. Service Worker is offline-shell only and must not compete with Worker image/API caching.
 */
const DEFAULT_FEED_LIMIT = 12;
const BOOTSTRAP_TIMEOUT_MS = 3000;
const IMAGE_EDGE_TTL_SECONDS = 60 * 60 * 24;
const STRICT_TRANSPORT_SECURITY_HEADER = "max-age=31536000; includeSubDomains; preload";
const encoder = new TextEncoder();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/feed") {
      return streamFeedPage(request, env, ctx);
    }

    if (url.pathname.startsWith("/uploads/")) {
      return hardenResponseHeaders(await handleImageCache(request, env, ctx), env);
    }

    if (url.pathname.startsWith("/api/")) {
      return hardenResponseHeaders(await proxyToOrigin(request, env), env);
    }

    if (env.ASSETS?.fetch) {
      return hardenResponseHeaders(await env.ASSETS.fetch(request), env);
    }

    return hardenResponseHeaders(await fetch(request), env);
  },

  async queue(batch, env, ctx) {
    ctx.waitUntil(forwardIntelligenceQueueBatch(batch, env));
  },

  async scheduled(_event, env, _ctx) {
    const origin = getOriginBaseUrl(env);
    try {
      await fetch(`${origin}/api/ping`, {
        headers: {
          "User-Agent": "winga-big-pipe-keepalive"
        }
      });
    } catch (_error) {
      // Keepalive failures must never crash the scheduled event.
    }
  }
};

async function forwardIntelligenceQueueBatch(batch, env) {
  const messages = Array.isArray(batch?.messages) ? batch.messages : [];
  if (!messages.length) {
    return;
  }
  const secret = String(env?.QUEUE_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    messages.forEach((message) => message.retry?.());
    throw new Error("QUEUE_WEBHOOK_SECRET is required for Winga intelligence queue forwarding.");
  }
  const payload = {
    source: "cloudflare-queue",
    messages: messages.map((message) => normalizeQueueMessageBody(message?.body))
  };
  const response = await fetch(`${getOriginBaseUrl(env)}/api/intelligence/queue-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Winga-Queue-Secret": secret,
      "User-Agent": "winga-intelligence-queue-consumer"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    messages.forEach((message) => message.retry?.());
    throw new Error(`Winga intelligence queue forward failed with ${response.status}`);
  }
  messages.forEach((message) => message.ack?.());
}

function normalizeQueueMessageBody(body) {
  if (!body) {
    return {};
  }
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (_error) {
      return { event: "queue_message", context: { body } };
    }
  }
  if (typeof body === "object") {
    return body;
  }
  return { event: "queue_message", context: { body: String(body) } };
}

async function streamFeedPage(request, env, ctx) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const write = (html) => writer.write(encoder.encode(String(html || "")));
  const origin = getOriginBaseUrl(env);
  const scriptNonce = createCspNonce();
  const styleNonce = createCspNonce();
  const buildVersion = await resolveAssetBuildVersion(env);
  const bootstrapPromise = fetchBootstrapContext(origin, request);
  const preloadBootstrap = await Promise.race([
    bootstrapPromise,
    new Promise((resolve) => setTimeout(() => resolve(null), 180))
  ]);
  const lcpImageUrl = getPrimaryFeedImageUrl(preloadBootstrap?.items?.[0]);
  const preloadLinkHeader = buildImagePreloadLinkHeader(preloadBootstrap?.items || []);

  ctx.waitUntil((async () => {
    try {
      await write(buildDocumentShellStart({ lcpImageUrl, origin, styleNonce, buildVersion }));
      await write(buildFeedSkeletonChunk());

      const bootstrap = await bootstrapPromise;
      const cardsHtml = bootstrap.items.map((product, index) => buildDiscoveryProductCardHtml(product, index, bootstrap)).join("");

      await write(`
        <script nonce="${escapeHtml(scriptNonce)}">
          window.__WINGA_BIG_PIPE_INITIAL_PRODUCTS__ = ${serializeForInlineScript(bootstrap.items)};
          window.__WINGA_BIG_PIPE_INITIAL_PAGE__ = ${serializeForInlineScript(bootstrap.page)};
          window.__WINGA_BIG_PIPE_INITIAL_USERS__ = ${serializeForInlineScript(bootstrap.users)};
          window.__WINGA_BIG_PIPE_INITIAL_SESSION__ = ${serializeForInlineScript(bootstrap.session)};
          window.__WINGA_BIG_PIPE_INITIAL_IMAGE_URLS__ = ${serializeForInlineScript(extractAllImageUrls(bootstrap.items, bootstrap.usersById))};
          window.__WINGA_BIG_PIPE_BOOTSTRAPPED__ = true;
          window.__WINGA_BIG_PIPE_BOOTSTRAP_STATUS__ = ${serializeForInlineScript(bootstrap.status)};
          document.querySelectorAll("[data-feed-skeleton-card='true']").forEach((node) => node.remove());
        </script>
        ${cardsHtml}
      `);

      await write(buildDocumentShellEnd({ scriptNonce, buildVersion }));
    } catch (error) {
      await write(`
        <script nonce="${escapeHtml(scriptNonce)}">
          window.__WINGA_BIG_PIPE_BOOTSTRAPPED__ = false;
          window.__WINGA_BIG_PIPE_BOOTSTRAP_ERROR__ = ${serializeForInlineScript(String(error?.message || error || "unknown"))};
        </script>
      `);
      await write(buildDocumentShellEnd({ scriptNonce, buildVersion }));
    } finally {
      await writer.close();
    }
  })());

  return new Response(readable, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "Strict-Transport-Security": STRICT_TRANSPORT_SECURITY_HEADER,
      "Content-Security-Policy": buildContentSecurityPolicy({ origin, scriptNonce, styleNonce }),
      ...(preloadLinkHeader ? { Link: preloadLinkHeader } : {})
    }
  });
}

function createCspNonce() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function resolveAssetBuildVersion(env) {
  const configuredVersion = String(env?.BUILD_VERSION || env?.WINGA_BUILD_VERSION || "").trim();
  if (/^\d{14}$/.test(configuredVersion)) {
    return configuredVersion;
  }
  if (env?.ASSETS?.fetch) {
    try {
      const response = await env.ASSETS.fetch(new Request("https://wingamarket.com/build-version.json"));
      const payload = await response.json();
      const version = String(payload?.version || "").trim();
      if (response.ok && /^\d{14}$/.test(version)) {
        return version;
      }
    } catch (_error) {
      // Fall through to a deterministic dev-safe marker.
    }
  }
  return "00000000000000";
}

function buildContentSecurityPolicy(options = {}) {
  const origin = String(options.origin || ORIGIN_BASE_URL).trim() || ORIGIN_BASE_URL;
  const scriptNonce = String(options.scriptNonce || "").trim();
  const styleNonce = String(options.styleNonce || "").trim();
  const scriptSources = ["'self'", "https://static.cloudflareinsights.com"];
  if (scriptNonce) {
    scriptSources.push(`'nonce-${scriptNonce}'`);
  }
  const styleElementSources = ["'self'", "'unsafe-inline'"];
  if (styleNonce) {
    styleElementSources.push(`'nonce-${styleNonce}'`);
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `img-src 'self' data: blob: ${origin} https://wingamarket.com`,
    "font-src 'self' data:",
    `media-src 'self' data: blob: ${origin}`,
    `connect-src 'self' ${origin} https://wingamarket.com https://cloudflareinsights.com https://static.cloudflareinsights.com`,
    `script-src ${scriptSources.join(" ")}`,
    `script-src-elem ${scriptSources.join(" ")}`,
    "script-src-attr 'none'",
    "style-src 'self'",
    `style-src-elem ${styleElementSources.join(" ")}`,
    "style-src-attr 'unsafe-inline'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "upgrade-insecure-requests"
  ].join("; ");
}

function hardenResponseHeaders(response, env, options = {}) {
  const origin = getOriginBaseUrl(env);
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", buildContentSecurityPolicy({
    origin,
    scriptNonce: options.scriptNonce || "",
    styleNonce: options.styleNonce || ""
  }));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Strict-Transport-Security", STRICT_TRANSPORT_SECURITY_HEADER);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function fetchBootstrapContext(origin, request) {
  const headers = forwardProxyHeaders(request);
  const fallback = {
    items: getFallbackProducts(),
    page: normalizeProductPageCollection({ items: getFallbackProducts(), hasMore: false, nextCursor: "", page: 1, limit: DEFAULT_FEED_LIMIT, total: DEFAULT_FEED_LIMIT }, { limit: DEFAULT_FEED_LIMIT, page: 1 }),
    users: [],
    usersById: {},
    session: null,
    status: "fallback"
  };

  try {
    const bootstrap = await Promise.race([
      loadBootstrapContext(origin, headers),
      new Promise((resolve) => setTimeout(() => resolve({ ...fallback, status: "timeout" }), BOOTSTRAP_TIMEOUT_MS))
    ]);
    if (!Array.isArray(bootstrap?.items) || !bootstrap.items.length) {
      return fallback;
    }
    return bootstrap;
  } catch (_error) {
    return fallback;
  }
}

async function loadBootstrapContext(origin, headers) {
  const [productsResult, usersResult, sessionResult] = await Promise.allSettled([
    fetchProducts(origin, headers, {
      limit: DEFAULT_FEED_LIMIT,
      page: 1
    }),
    fetchUsers(origin, headers),
    fetchSession(origin, headers)
  ]);

  const items = productsResult.status === "fulfilled" && Array.isArray(productsResult.value?.items) && productsResult.value.items.length
    ? productsResult.value.items.slice(0, DEFAULT_FEED_LIMIT)
    : getFallbackProducts();
  const productPage = productsResult.status === "fulfilled" && productsResult.value && typeof productsResult.value === "object"
    ? productsResult.value
    : normalizeProductPageCollection({ items, hasMore: false, nextCursor: "", page: 1, limit: DEFAULT_FEED_LIMIT, total: items.length }, { limit: DEFAULT_FEED_LIMIT, page: 1 });
  const users = usersResult.status === "fulfilled" && Array.isArray(usersResult.value)
    ? usersResult.value
    : [];
  const session = sessionResult.status === "fulfilled" && sessionResult.value && typeof sessionResult.value === "object"
    ? sessionResult.value
    : null;
  const usersById = Object.fromEntries(
    users
      .filter((user) => user && typeof user === "object")
      .map((user) => [String(user.username || user.id || "").trim(), user])
      .filter(([key]) => key)
  );

  const normalizedItems = items.map((product, index) => normalizeProductForStream(product, {
      feedPosition: index,
      usersById
    }));

  return {
    items: normalizedItems,
    page: {
      ...productPage,
      items: normalizedItems,
      loadedCount: normalizedItems.length
    },
    users,
    usersById,
    session,
    status: "loaded"
  };
}

async function fetchProducts(origin, headers, options = {}) {
  const pageWindow = normalizeProductPageWindow(options);
  const query = new URLSearchParams();
  query.set("limit", String(pageWindow.limit));
  query.set("page", String(pageWindow.page));
  if (pageWindow.cursor) {
    query.set("cursor", pageWindow.cursor);
  }
  const data = await fetchJsonWithTimeout(`${origin}/api/products?${query.toString()}`, {
    headers
  });
  return normalizeProductPageCollection(data, pageWindow);
}

async function fetchUsers(origin, headers) {
  try {
    const data = await fetchJsonWithTimeout(`${origin}/api/users`, {
      headers
    });
    return Array.isArray(data) ? data : [];
  } catch (_error) {
    return [];
  }
}

async function fetchSession(origin, headers) {
  try {
    return await fetchJsonWithTimeout(`${origin}/api/auth/session`, {
      headers
    });
  } catch (_error) {
    return null;
  }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = BOOTSTRAP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildDocumentShellStart(options = {}) {
  const lcpImageUrl = String(options?.lcpImageUrl || "").trim();
  const assetOrigin = String(options?.origin || "").trim();
  const styleNonce = String(options?.styleNonce || "").trim();
  const buildVersion = String(options?.buildVersion || "00000000000000").trim();
  const assetVersionQuery = /^\d{14}$/.test(buildVersion) ? `?v=${buildVersion}` : "";
  const styleNonceAttribute = styleNonce ? ` nonce="${escapeHtml(styleNonce)}"` : "";
  const lcpImagePreloadTag = lcpImageUrl
    ? `  <link rel="preload" as="image" href="${escapeHtml(lcpImageUrl)}" fetchpriority="high">\n`
    : "";
  const imageOriginPreconnectTag = assetOrigin
    ? `  <link rel="preconnect" href="${escapeHtml(assetOrigin)}" crossorigin>\n`
    : "";
  return `<!DOCTYPE html>
<html lang="sw">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="winga-build" content="${escapeHtml(buildVersion)}">
  <meta name="theme-color" content="#ff6a00">
  <meta name="msapplication-TileColor" content="#ff6a00">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Winga">
  <meta property="og:type" content="website">
  <meta property="og:title" content="NUNUA KWA WAUZAJI WALIOTHIBITISHWA">
  <meta property="og:description" content="Social commerce PWA for Tanzania">
  <meta property="og:image" content="https://wingamarket.com/winga-icon-512-v3.png">
  <meta property="og:url" content="https://wingamarket.com/">
  <meta property="og:site_name" content="Winga">
  <meta property="al:ios:url" content="winga://home">
  <meta property="al:android:url" content="winga://home">
  <meta property="al:web:url" content="https://wingamarket.com/">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="NUNUA KWA WAUZAJI WALIOTHIBITISHWA">
  <meta name="twitter:description" content="Social commerce PWA for Tanzania">
  <meta name="twitter:image" content="https://wingamarket.com/winga-icon-512-v3.png">
  <link rel="manifest" href="/manifest-v4.webmanifest">
  <link rel="icon" href="/winga-icon-192-v3.png" type="image/png" sizes="192x192">
  <link rel="apple-touch-icon" href="/apple-touch-icon-v3.png">
${lcpImagePreloadTag}${imageOriginPreconnectTag}  <title>Chap kwa haraka</title>
  <style id="winga-critical-boot"${styleNonceAttribute}>*{box-sizing:border-box}html,body{background:#ff6a00}body.app-booting{margin:0;min-height:100vh;overflow:hidden;background:#ff6a00}#boot-overlay.boot-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at 22% 18%,rgba(255,255,255,.38),transparent 28%),linear-gradient(135deg,#ff7a1a 0%,#ff6a00 48%,#d94f00 100%);color:#fff;opacity:1;visibility:visible;pointer-events:auto}#boot-overlay.boot-overlay.is-hidden{opacity:0;visibility:hidden;pointer-events:none}#boot-overlay .boot-overlay-card{width:min(360px,86vw);min-height:210px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:32px 28px;border:1px solid rgba(255,255,255,.28);border-radius:30px;background:rgba(255,255,255,.14);box-shadow:0 28px 70px rgba(99,38,0,.26);text-align:center}#boot-overlay .boot-overlay-mark{display:flex;align-items:center;justify-content:center;gap:14px}#boot-overlay .boot-overlay-badge{width:58px;height:58px;display:inline-flex;align-items:center;justify-content:center;border-radius:20px;background:#fff;color:#ff6a00;font-size:2rem;font-weight:900}#boot-overlay .boot-overlay-mark strong{display:block;font-size:2rem;line-height:1;letter-spacing:.02em}#boot-overlay .boot-overlay-mark span:not(.boot-overlay-badge),#boot-overlay .boot-overlay-copy p{color:rgba(255,255,255,.86);font-weight:700}#boot-overlay .boot-overlay-copy{display:flex;flex-direction:column;align-items:center;gap:12px}#boot-overlay .boot-overlay-copy p{min-height:1.2em;margin:0;font-size:.95rem}#boot-overlay .boot-overlay-spinner{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.38);border-top-color:#fff;animation:wingaCriticalBootSpin .82s linear infinite}@keyframes wingaCriticalBootSpin{to{transform:rotate(360deg)}}.feed-skeleton-card{overflow:hidden}.feed-skeleton-media,.feed-skeleton-line,.feed-skeleton-pill{position:relative;background:rgba(15,23,42,.08)}.feed-skeleton-media::after,.feed-skeleton-line::after,.feed-skeleton-pill::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);animation:winga-feed-skeleton-shimmer 1s linear infinite}.feed-skeleton-media{height:min(68vw,360px);background:rgba(15,23,42,.08)}.feed-skeleton-body{padding:18px 16px 20px;display:grid;gap:12px}.feed-skeleton-line{display:block;height:12px;border-radius:999px}.feed-skeleton-line-title{width:54%;height:16px}.feed-skeleton-line-copy{width:92%}.feed-skeleton-line-copy-short{width:68%}.feed-skeleton-actions{display:flex;gap:10px;padding-top:6px}.feed-skeleton-pill{width:92px;height:34px;border-radius:999px}.feed-skeleton-card.feed-skeleton-card{background:#fff;border-radius:24px;margin:0 0 18px;box-shadow:0 16px 36px rgba(15,23,42,.08)}@keyframes winga-feed-skeleton-shimmer{100%{transform:translateX(100%)}}@media (prefers-reduced-motion:reduce){#boot-overlay .boot-overlay-spinner,.feed-skeleton-media::after,.feed-skeleton-line::after,.feed-skeleton-pill::after{animation:none}}</style>
  <link rel="stylesheet" href="/style.css${assetVersionQuery}">
</head>
<body class="app-booting">
  <div id="boot-overlay" class="boot-overlay" aria-hidden="true">
    <div class="boot-overlay-card">
      <div class="boot-overlay-mark">
        <span class="boot-overlay-badge">W</span>
        <div>
          <strong>WINGA</strong>
          <span>Shop Fast</span>
        </div>
      </div>
      <div class="boot-overlay-copy">
        <div class="boot-overlay-spinner" aria-hidden="true"></div>
        <p></p>
      </div>
    </div>
  </div>
  <div class="form-container" id="auth-container" style="display:none;">
    <button id="auth-close-button" type="button" aria-label="Funga auth">&times;</button>
    <div id="auth-gate-prompt" style="display:none;">
      <p class="auth-label" id="auth-gate-title">You need an account to continue</p>
      <p class="auth-note" id="auth-gate-copy">Already have an account? Sign In. New here? Sign Up.</p>
      <div class="auth-gate-actions">
        <button class="auth-gate-secondary" id="auth-gate-login" type="button">Sign In</button>
        <button class="auth-gate-secondary" id="auth-gate-signup" type="button">Sign Up</button>
      </div>
    </div>
    <div class="brand-mark">
      <span class="brand-badge">W</span>
      <div>
        <h1>WINGA</h1>
        <p>Marketplace ya kuuza kwa haraka</p>
      </div>
    </div>
    <h3 id="form-title">Login</h3>
    <p class="auth-intro">Panga biashara yako kwa category ili uingie haraka na wateja wakupate kwa urahisi.</p>
    <p class="auth-note" id="auth-category-note">Signup sasa ni phone-first. Weka jina la duka, namba ya simu, na password. Verification ya ID itafanyika baadaye kupitia Profile &gt; Get Verified.</p>
    <div id="auth-details-step">
      <div id="auth-role-selector" class="auth-role-selector" style="display:none;">
        <button class="auth-role-option active" id="auth-role-seller" type="button" data-auth-role="seller"><span class="auth-role-dot"></span><span>Mimi ni muuzaji</span></button>
        <button class="auth-role-option" id="auth-role-buyer" type="button" data-auth-role="buyer"><span class="auth-role-dot"></span><span>Mimi ni mteja</span></button>
      </div>
      <input type="text" id="username" placeholder="Jina la duka" autocomplete="username">
      <input type="tel" id="phone-number" placeholder="Namba ya simu ya WhatsApp" required style="display:none;" autocomplete="tel">
      <input type="text" id="national-id" placeholder="Namba ya kitambulisho cha taifa" style="display:none;" autocomplete="off">
      <select id="seller-identity-document-type" style="display:none;">
        <option value="">Chagua identity document</option>
        <option value="NIDA">National ID (NIDA)</option>
        <option value="VOTER_ID">Voters ID</option>
      </select>
      <div id="seller-verification-uploads" style="display:none;">
        <p class="auth-note">Verification ya seller itafanyika baadaye kupitia Profile &gt; Get Verified.</p>
        <input type="text" id="seller-identity-document-number" placeholder="Enter ID number" style="display:none;" autocomplete="off">
        <label for="seller-identity-document-image" class="upload-btn auth-upload-btn">Upload ID image</label>
        <input type="file" id="seller-identity-document-image" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" style="display:none;">
        <div id="seller-identity-document-image-name" class="auth-file-name"></div>
        <div id="seller-identity-document-preview-wrap" class="auth-upload-preview" style="display:none;">
          <img id="seller-identity-document-preview" alt="Identity document preview">
        </div>
      </div>
      <div class="password-field">
        <input type="password" id="password" placeholder="Password" required autocomplete="current-password">
      </div>
      <div class="password-field" id="confirm-password-wrap" style="display:none;">
        <input type="password" id="confirm-password" placeholder="Confirm password" autocomplete="new-password">
      </div>
      <button class="password-toggle password-toggle-standalone" id="password-toggle" type="button">Show Passwords</button>
    </div>
    <button id="auth-button" type="button">Login</button>
    <span class="toggle-link" id="toggle-link">Tengeneza akaunti</span>
  </div>
  <div class="form-container" id="admin-login-container" style="display:none;">
    <div class="brand-mark">
      <span class="brand-badge">W</span>
      <div>
        <h1>WINGA</h1>
        <p>Admin Access</p>
      </div>
    </div>
    <h3 id="admin-login-title">Admin Login</h3>
    <p class="auth-intro">Njia hii ni ya admin au moderator pekee. Tumia route ya staff kwa usimamizi wa marketplace.</p>
    <p class="auth-note" id="admin-login-copy">Mteja na muuzaji wa kawaida wanapaswa kutumia login ya kawaida ya marketplace.</p>
    <input type="text" id="admin-login-identifier" placeholder="Admin username au phone number" autocomplete="username">
    <div class="password-field">
      <input type="password" id="admin-login-password" placeholder="Password" autocomplete="current-password">
    </div>
    <button id="admin-login-button" type="button">Login to Admin</button>
    <button class="auth-gate-secondary" id="admin-login-back" type="button">Back to Marketplace</button>
  </div>
  <div id="app-container" style="display:none;">
    <header id="top-bar" class="panel">
      <div id="header-brand">
        <h2 id="header-brand-title">WINGA</h2>
        <p id="top-bar-subtitle"><span>Discover</span> products first. Sign in only when you want to <span>buy</span>, <span>chat</span>, or <span>sell</span>.</p>
      </div>
      <p id="header-brand-tagline">Shop Fast</p>
      <div id="public-header-actions">
        <button class="public-header-btn" id="header-login-button" type="button">Login</button>
        <button class="public-header-btn public-header-btn-primary" id="header-signup-button" type="button">Sign Up</button>
      </div>
      <div id="header-search-area" role="search" aria-label="Marketplace search">
        <div id="search-box" class="panel">
          <div id="search-main-row">
            <input type="text" id="search-input" placeholder="Search bidhaa au duka" aria-label="Search bidhaa au duka">
            <input type="file" id="search-image-file" accept="image/*,.heic,.heif">
            <button id="search-image-button" type="button" aria-label="Search kwa picha">&#128247;</button>
            <button id="search-toggle-button" type="button" aria-label="Fungua search">&#128269;</button>
          </div>
          <div id="search-filter-row">
            <input type="number" id="filter-price-min" placeholder="Min price" min="0">
            <input type="number" id="filter-price-max" placeholder="Max price" min="0">
            <input type="text" id="filter-location" placeholder="Location / Shop (optional)">
            <select id="sort-select">
              <option value="default">Sort: Default</option>
              <option value="price-asc">Lowest price</option>
              <option value="price-desc">Highest price</option>
              <option value="newest">Newest</option>
              <option value="popular">Most popular</option>
            </select>
          </div>
          <div id="search-image-preview" style="display:none;"></div>
          <div id="search-dropdown" aria-live="polite"></div>
        </div>
      </div>
      <div id="mobile-category-shell">
        <button id="mobile-category-button" type="button" aria-label="Fungua categories" aria-expanded="false">&#9776;</button>
        <div id="mobile-category-menu" class="panel"></div>
      </div>
      <div id="header-user-menu" style="display:none;">
        <button id="header-user-trigger" type="button" aria-expanded="false" aria-label="Open account menu">
          <img id="header-user-avatar-image" alt="Profile avatar" style="display:none;">
          <span id="header-user-avatar-fallback">U</span>
          <span id="header-user-name">User</span>
        </button>
        <div id="header-user-dropdown" class="panel" style="display:none;"></div>
      </div>
    </header>
    <button id="view-home-back" type="button" aria-label="Rudi home">&#8592;</button>
    <div id="categories" class="panel"></div>
    <section id="hero-panel" class="panel">
      <div id="hero-slideshow">
        <div id="slides-track"></div>
        <button id="slide-prev" class="slide-arrow" type="button" aria-label="Slide ya nyuma">&#10094;</button>
        <button id="slide-next" class="slide-arrow" type="button" aria-label="Slide inayofuata">&#10095;</button>
        <div id="slide-dots"></div>
      </div>
    </section>
    <section id="market-showcase" class="panel">
      <div class="section-heading showcase-heading">
        <div>
          <p class="eyebrow">Marketplace Picks</p>
          <h3>Bidhaa zinazovuma sasa</h3>
        </div>
        <span class="meta-copy">Tembea kushoto au kulia kuona bidhaa zaidi</span>
      </div>
      <div id="showcase-track" class="showcase-track"></div>
    </section>
    <div id="upload-form" class="panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Upload bidhaa</p>
          <h3 id="upload-title">Ongeza Bidhaa</h3>
        </div>
        <button id="cancel-edit-button" type="button">Cancel</button>
      </div>
      <input type="text" id="product-name" placeholder="Jina la bidhaa" required>
      <input type="number" id="product-price" placeholder="Bei (TSh) - optional">
      <input type="text" id="product-shop" placeholder="Jina la duka" required>
      <input type="text" id="product-whatsapp" placeholder="Namba ya WhatsApp ya mawasiliano" required readonly>
      <p class="auth-note" id="product-whatsapp-note">Tunatumia namba ya WhatsApp ya account yako moja kwa moja kwenye bidhaa hii. Ukiitaka kubadilisha, tumia sehemu ya Profile kuthibitisha namba mpya.</p>
      <div class="product-fit-mode-wrap">
        <p class="upload-copy-label">Post Fit Toggle</p>
        <div class="product-fit-mode-toggle" role="radiogroup" aria-label="Post Fit Toggle">
          <label class="product-fit-mode-option">
            <input type="radio" name="product-fit-mode" value="cover" checked>
            <span>Crop to Square</span>
          </label>
          <label class="product-fit-mode-option">
            <input type="radio" name="product-fit-mode" value="contain">
            <span>Fit to Frame</span>
          </label>
        </div>
        <p class="auth-note">Crop keeps the feed uniform. Fit shows the full image with a natural frame.</p>
      </div>
      <select id="product-category-top" required></select>
      <select id="product-category" required></select>
      <div id="upload-custom-category-wrap" class="custom-category-wrap" style="display:none;">
        <input type="text" id="upload-custom-category-input" placeholder="Andika category mpya">
        <button id="upload-custom-category-add" type="button">Ongeza Category</button>
      </div>
      <p id="upload-guidelines">Pakia picha hadi 5, kila moja isiwe zaidi ya 3MB, na ziwe JPG, PNG, WEBP au GIF.</p>
      <label for="product-image-file" class="upload-btn">Chagua Picha Moja au Nyingi</label>
      <input type="file" id="product-image-file" accept="image/*" multiple>
      <div id="image-preview-list"></div>
      <button id="upload-button" type="button">Ongeza Bidhaa</button>
    </div>
    <section id="analytics-panel" class="panel" style="display:none;"></section>
    <section id="admin-panel" class="panel" style="display:none;"></section>
    <div id="products-container">`;
}

function buildFeedSkeletonChunk() {
  return Array.from({ length: 4 }, () => `
    <article class="seller-product-card feed-skeleton-card" data-feed-skeleton-card="true" aria-hidden="true">
      <div class="feed-skeleton-media"></div>
      <div class="feed-skeleton-body">
        <span class="feed-skeleton-line feed-skeleton-line-title"></span>
        <span class="feed-skeleton-line feed-skeleton-line-copy"></span>
        <span class="feed-skeleton-line feed-skeleton-line-copy-short"></span>
        <div class="feed-skeleton-actions">
          <span class="feed-skeleton-pill"></span>
          <span class="feed-skeleton-pill"></span>
        </div>
      </div>
    </article>
  `).join("");
}

function buildDocumentShellEnd(options = {}) {
  const scriptNonce = String(options?.scriptNonce || "").trim();
  const scriptNonceAttribute = scriptNonce ? ` nonce="${escapeHtml(scriptNonce)}"` : "";
  const buildVersion = String(options?.buildVersion || "00000000000000").trim();
  const assetVersionQuery = /^\d{14}$/.test(buildVersion) ? `?v=${buildVersion}` : "";
  return `</div>
    <div id="empty-state" class="panel" style="display:none;">
      <h3>Hakuna bidhaa zilizopatikana</h3>
      <p>Jaribu search nyingine, badili category, au upload bidhaa mpya.</p>
    </div>
    <div id="feed-loading-state" class="panel" style="display:none;" aria-live="polite" aria-busy="true">
      <div class="feed-loading-shell">
        <div class="feed-loading-spinner" aria-hidden="true"></div>
        <h3>Inapakia bidhaa...</h3>
        <p>Subiri kidogo, tunaleta bidhaa zako pamoja na picha zake.</p>
        <button id="feed-loading-retry-button" type="button">Jaribu tena</button>
      </div>
    </div>
    <footer id="bottom-nav">
      <button class="nav-item active" type="button" data-view="home"><span class="nav-icon">&#127968;</span><span>Home</span></button>
      <button class="nav-item" type="button" data-view="upload"><span class="nav-icon">&#11014;&#65039;</span><span>Upload</span></button>
      <button class="nav-item" type="button" data-view="profile"><span class="nav-icon">&#128100;</span><span>Profile</span></button>
      <button class="nav-item" id="admin-nav-item" type="button" data-view="admin" style="display:none;"><span class="nav-icon">&#128737;&#65039;</span><span>Admin</span></button>
    </footer>
    <button id="post-product-fab" type="button" aria-label="Post product">
      <span class="fab-icon">&#128221;</span>
      <span class="fab-label">Post</span>
    </button>
    <footer id="public-footer" class="panel" style="display:none;">
      <div class="public-footer-grid">
        <div>
          <h3>WINGA</h3>
          <p class="public-footer-copy">Shop fast. Sell smart. Discover products before signing in.</p>
        </div>
        <div>
          <p class="public-footer-heading">Quick Links</p>
          <div class="public-footer-links">
            <a href="#" data-public-link="home">Home</a>
            <a href="#" data-public-link="products">Products</a>
            <a href="#" data-public-auth="login">Sign In</a>
            <a href="#" data-public-auth="signup">Sign Up</a>
            <a href="#public-footer">Contact</a>
          </div>
        </div>
        <div>
          <p class="public-footer-heading">Contact</p>
          <p class="public-footer-copy">Email: contact@winga.app</p>
          <p class="public-footer-copy">Phone: <a href="tel:+255695237798">+255 695 237 798</a></p>
        </div>
      </div>
      <p class="public-footer-meta">&copy; 2026 Winga. Marketplace built for fast discovery and trusted transactions.</p>
      <span class="sr-only" data-winga-build-version>${escapeHtml(buildVersion)}</span>
    </footer>
  </div>
  <script${scriptNonceAttribute}>
    (function(){
      window.__BIGPIPE_ACTIVE__ = true;
      window.__WINGA_FEED_CONTINUATION_OWNER__ = "app-continuous-discovery";
      const urls = Array.isArray(window.__WINGA_BIG_PIPE_INITIAL_IMAGE_URLS__) ? window.__WINGA_BIG_PIPE_INITIAL_IMAGE_URLS__ : [];
      const cache = new Map();
      const preloadImage = (url) => {
        if (!url) return Promise.resolve();
        if (cache.has(url)) return cache.get(url);
        const promise = new Promise((resolve) => {
          const image = new Image();
          image.onload = image.onerror = () => resolve();
          image.src = url;
        });
        cache.set(url, promise);
        return promise;
      };
      window.__WINGA_BIG_PIPE_IMAGE_CACHE__ = cache;
      window.__WINGA_BIG_PIPE_IMAGE_PRELOAD_PROMISE__ = Promise.race([
        Promise.allSettled(urls.map(preloadImage)),
        new Promise((resolve) => setTimeout(resolve, 3000))
      ]);
      document.addEventListener("DOMContentLoaded", () => {
        document.dispatchEvent(new CustomEvent("winga:big-pipe-bootstrap", {
          detail: {
            products: window.__WINGA_BIG_PIPE_INITIAL_PRODUCTS__ || [],
            page: window.__WINGA_BIG_PIPE_INITIAL_PAGE__ || null,
            users: window.__WINGA_BIG_PIPE_INITIAL_USERS__ || [],
            session: window.__WINGA_BIG_PIPE_INITIAL_SESSION__ || null,
            status: window.__WINGA_BIG_PIPE_BOOTSTRAP_STATUS__ || "loaded"
          }
        }));
      }, { once: true });
    })();
  </script>
  <script defer src="/winga-config.js${assetVersionQuery}"></script>
  <script defer src="/mock-data.js${assetVersionQuery}"></script>
  <script defer src="/winga-modules.js${assetVersionQuery}"></script>
  <script defer src="/data-service.js${assetVersionQuery}"></script>
  <script defer src="/app-core.js${assetVersionQuery}"></script>
  <script defer src="/app.js${assetVersionQuery}"></script>
</body>
</html>`;
}

function buildDiscoveryProductCardHtml(product, index, context) {
  const safeCaption = escapeHtml(String(product.description || product.caption || product.name || product.shop || product.category || "").trim());
  const seller = getSellerRecord(product, context.usersById);
  const sellerName = escapeHtml(getProductSellerLabel(product, seller));
  const sellerAvatar = buildSellerAvatarMarkup(product, seller);
  const galleryMarkup = renderFeedGalleryMarkup(product, {
    eager: index < 2,
    priority: index === 0
  });
  const likeFollowShareMarkup = renderSellerCardInlineActions(product, context);
  const overflowMenuMarkup = renderProductOverflowMenu(product, context);
  const actionGroupMarkup = renderProductActionGroup(product, context, {
    extraClass: "seller-product-actions seller-product-actions-compact"
  });
  const requestedInitialIndex = Number(product?.feedInitialImageIndex ?? product?.visibleImageIndex ?? 0);
  const initialImageIndex = Number.isFinite(requestedInitialIndex) ? Math.max(0, requestedInitialIndex) : 0;
  const storedAspectRatio = Number(product?.imageAspectRatios?.[initialImageIndex] || 0);
  const stableMediaRatio = Number.isFinite(storedAspectRatio) && storedAspectRatio > 0.2 && storedAspectRatio < 5
    ? String(Number(storedAspectRatio.toFixed(6)))
    : "4 / 5";

  return `
    <article class="seller-product-card${Array.isArray(product.images) && product.images.length > 1 ? " has-gallery-count-badge" : ""}" data-open-product="${escapeHtml(product.id)}" data-open-image-index="${escapeHtml(product.feedInitialImageIndex || 0)}" data-feed-entry-key="product:${escapeHtml(product.id)}" data-feed-entry-type="product" data-feed-sequence-index="${index + 1}" data-variant-display-index="${escapeHtml(product.variantDisplayIndex || 0)}"${product.selectedVariantIndex != null && Number.isFinite(Number(product.selectedVariantIndex)) ? ` data-selected-variant-index="${escapeHtml(product.selectedVariantIndex)}"` : ""}>
      <div class="seller-product-card-media" style="--fit-media-aspect-ratio:${escapeHtml(stableMediaRatio)};aspect-ratio:${escapeHtml(stableMediaRatio)}">
        ${galleryMarkup}
        ${product.variantColor ? `<span class="variant-badge">${escapeHtml(product.variantColor)}</span>` : ""}
        ${product.availability === "sold_out" ? `<span class="sold-out-ribbon">SOLD OUT</span>` : ""}
      </div>
      ${overflowMenuMarkup}
      <div class="product-seller-row">
        <div class="product-seller-avatar">${sellerAvatar}</div>
        <div class="product-seller-copy">
          <strong class="product-seller-name">${sellerName}</strong>
        </div>
        <div class="product-seller-badge-row product-seller-inline-actions">
          ${likeFollowShareMarkup}
        </div>
      </div>
      <div class="product-card-caption-block${safeCaption.length > 120 ? " is-collapsed" : ""}">
        <p class="product-card-caption">${safeCaption}</p>
        ${safeCaption.length > 120 ? `<button class="product-caption-toggle" type="button" data-product-caption-toggle="true" aria-expanded="false">See more</button>` : ""}
      </div>
      ${product.feedVariantResurface ? `<p class="product-meta trust-badges"><span class="status-pill approved sponsored-pill">Other color</span></p>` : ""}
      ${actionGroupMarkup}
    </article>
  `;
}

function renderSellerCardInlineActions(product, context) {
  const sellerId = String(product?.uploadedBy || "").trim();
  if (!sellerId) {
    return "";
  }
  const currentUser = String(context?.session?.username || "").trim();
  const viewerRole = String(context?.session?.role || "").trim().toLowerCase();
  const liked = Boolean(product?.isLiked || product?.liked);
  const actions = [];

  actions.push(`<button class="product-seller-inline-action product-seller-like-chip${liked ? " is-active" : ""}" type="button" data-like-product="${escapeHtml(String(product?.id || "").trim())}">${liked ? "♥ Like" : "♡ Like"}</button>`);

  if (currentUser && sellerId !== currentUser && viewerRole !== "admin" && viewerRole !== "moderator") {
    actions.push(`<button class="product-seller-inline-action" type="button" data-follow-seller="${escapeHtml(sellerId)}">Follow</button>`);
  }

  actions.push(`<button class="product-seller-inline-action" type="button" data-share-seller-shop="${escapeHtml(sellerId)}">Share</button>`);

  if (currentUser && sellerId === currentUser && viewerRole === "seller") {
    actions.push(renderSellerCardPromoteChip(product));
  }

  return actions.join("");
}

function renderSellerCardPromoteChip(product) {
  return `<button class="product-seller-inline-action product-seller-promote-chip" type="button" data-promote-product="${escapeHtml(product.id)}" data-promote-authorized="true" data-promote-product-owner="${escapeHtml(product.uploadedBy || "")}" data-promote-product-name="${escapeHtml(product.name || "")}" data-promote-product-shop="${escapeHtml(product.shop || "")}" data-promote-product-whatsapp="${escapeHtml(product.whatsapp || "")}" data-promote-product-location="${escapeHtml(product.location || "")}" data-promote-product-category="${escapeHtml(product.category || "")}">Promote</button>`;
}

function renderProductOverflowMenu(product, context) {
  const currentUser = String(context?.session?.username || "").trim();
  const isOwner = Boolean(currentUser && product?.uploadedBy === currentUser);
  if (!isOwner) {
    return "";
  }
  return `
    <div class="product-menu product-menu-overlay" data-product-menu="${escapeHtml(product.id)}">
      <button class="product-menu-toggle" type="button" aria-label="Fungua menu" data-menu-toggle="${escapeHtml(product.id)}">&#8942;</button>
      <div class="product-menu-popup" data-menu-popup="${escapeHtml(product.id)}">
        <button class="product-menu-item" type="button" data-menu-action="share" data-id="${escapeHtml(product.id)}">Share</button>
        <button class="product-menu-item" type="button" data-menu-action="download" data-id="${escapeHtml(product.id)}">Download</button>
        <button class="product-menu-item product-menu-item-danger" type="button" data-menu-action="delete" data-id="${escapeHtml(product.id)}">Delete</button>
      </div>
    </div>
  `;
}

function renderProductActionGroup(product, context, options = {}) {
  const currentUser = String(context?.session?.username || "").trim();
  const viewerRole = String(context?.session?.role || "").trim().toLowerCase();
  const extraClass = String(options.extraClass || "").trim();
  const actions = [];

  if (product?.uploadedBy === currentUser) {
    if (viewerRole === "seller") {
      actions.push(`<button class="action-btn chat-btn" type="button" data-open-own-messages="${escapeHtml(product.id)}">Message</button>`);
    }
  } else if (product?.status === "approved") {
    actions.push(`<button class="action-btn chat-btn" type="button" data-chat-product="${escapeHtml(product.id)}">Message</button>`);
  } else {
    actions.push(`<button class="action-btn chat-btn is-disabled" type="button" disabled aria-disabled="true">Message</button>`);
  }

  if (viewerRole === "seller") {
    actions.push(`<button class="action-btn action-btn-secondary repost-btn" type="button" data-detail-repost="${escapeHtml(product.id)}">Uza</button>`);
  }

  if (String(product?.whatsapp || "").trim()) {
    actions.push(`<button class="button whatsapp-chat-btn" type="button" data-open-product-whatsapp="${escapeHtml(product.id)}">WhatsApp</button>`);
  }

  const actionCount = Math.min(Math.max(actions.length, 1), 3);
  const groupClass = extraClass
    ? `product-actions product-actions-simple product-actions-count-${actionCount} ${extraClass}`
    : `product-actions product-actions-simple product-actions-count-${actionCount}`;
  return actions.length ? `<div class="${groupClass}" data-action-count="${actionCount}">${actions.join("")}</div>` : "";
}

function renderFeedGalleryMarkup(product, options = {}) {
  const images = getRenderableMarketplaceImages(product);
  const total = images.length;
  const requestedInitialImageIndex = Number(
    product?.feedInitialImageIndex
    ?? product?.visibleImageIndex
    ?? product?.variantDisplayIndex
    ?? 0
  );
  const initialImageIndex = Math.max(
    0,
    Math.min(total - 1, Number.isFinite(requestedInitialImageIndex) ? requestedInitialImageIndex : 0)
  );
  const storedAspectRatio = Number(product?.imageAspectRatios?.[initialImageIndex] || 0);
  const hasStoredAspectRatio = Number.isFinite(storedAspectRatio) && storedAspectRatio > 0.2 && storedAspectRatio < 5;
  const stableFrameRatio = hasStoredAspectRatio
    ? String(Number(storedAspectRatio.toFixed(6)))
    : "4 / 5";
  const fitMode = hasStoredAspectRatio ? "contain" : "cover";
  const slidesMarkup = images.map((imageSrc, index) => {
    const safeSrc = escapeHtml(imageSrc);
    const isInitialImage = index === initialImageIndex;
    const shouldLoadEagerly = isInitialImage && Boolean(options.eager);
    const isLcpPriorityImage = isInitialImage && Boolean(options.priority);
    return `
      <div class="feed-gallery-carousel-slide" data-feed-gallery-slide="${index}">
        <span class="progressive-image-shell fit-mode-${fitMode} is-loaded">
          <img
            src="${safeSrc}"
            alt="${escapeHtml(`${product?.name || product?.shop || "Product image"} ${index + 1}`)}"
            class="progressive-image-full feed-gallery-image feed-gallery-image-social"
            loading="${shouldLoadEagerly ? "eager" : "lazy"}"
            fetchpriority="${isLcpPriorityImage ? "high" : "auto"}"
            decoding="async"
            draggable="false"
            data-preserve-image-ratio="true"
            data-marketplace-scroll-image="true"
            data-marketplace-real-src="${safeSrc}"
            data-marketplace-image-state="loaded"
            data-feed-gallery-primary="${index === initialImageIndex ? "true" : "false"}"
            data-feed-gallery-image-src="${safeSrc}"
            data-fallback-src="/winga-icon.svg"
            data-direct-visibility="true"
            ${index !== initialImageIndex ? `style="display:none"` : ""}
          >
        </span>
      </div>
    `;
  }).join("");

  return `
    <div class="product-gallery media-gallery feed-gallery-preview feed-gallery-carousel fit-mode-${fitMode}"
      data-feed-gallery-carousel="true"
      data-feed-gallery-total="${total}"
      data-feed-gallery-current="${initialImageIndex + 1}"
      data-feed-gallery-initial-index="${initialImageIndex}"
      data-feed-gallery-surface="feed"
      data-feed-gallery-stable-ratio="${escapeHtml(stableFrameRatio)}"
      data-feed-gallery-stable-fit-mode="${fitMode}"
      data-fit-mode="${fitMode}"
      style="--fit-media-aspect-ratio:${escapeHtml(stableFrameRatio)};--feed-gallery-fit-mode:${fitMode}">
      <div class="feed-gallery-carousel-track" data-feed-gallery-track>
        ${slidesMarkup}
      </div>
      ${total > 1 ? `<span class="feed-gallery-count-badge" data-feed-gallery-count>${initialImageIndex + 1}/${total}</span>` : ""}
    </div>
  `;
}

function normalizeProductCollection(payload) {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.products)
        ? payload.products
        : [];
  return source.map((product) => normalizeProductForStream(product)).filter(Boolean);
}

function getProductSortTimestamp(product) {
  return Number(new Date(
    product?.createdAt
    || product?.created_at
    || product?.timestamp
    || product?.updatedAt
    || 0
  ).getTime() || 0);
}

function compareProductsNewestFirst(first, second) {
  const secondTime = getProductSortTimestamp(second);
  const firstTime = getProductSortTimestamp(first);
  if (secondTime !== firstTime) {
    return secondTime - firstTime;
  }
  return String(second?.id || "").localeCompare(String(first?.id || ""));
}

function sortProductsNewestFirst(products = []) {
  return (Array.isArray(products) ? products : []).slice().sort(compareProductsNewestFirst);
}

function buildProductCursor(product) {
  if (!product || typeof product !== "object") {
    return "";
  }
  const timestamp = getProductSortTimestamp(product);
  const productId = String(product.id || product.productId || product.slug || "").trim();
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !productId) {
    return "";
  }
  return `${timestamp}|${productId}`;
}

function parseProductCursor(cursor) {
  const rawCursor = String(cursor || "").trim();
  if (!rawCursor || !rawCursor.includes("|")) {
    return null;
  }
  const [timestampValue, ...idParts] = rawCursor.split("|");
  const timestamp = Number(timestampValue);
  const productId = idParts.join("|").trim();
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !productId) {
    return null;
  }
  return {
    timestamp,
    productId
  };
}

function normalizeProductPageWindow(options = {}) {
  const requestedLimit = Number(options.limit || DEFAULT_FEED_LIMIT);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.max(1, Math.floor(requestedLimit))
    : DEFAULT_FEED_LIMIT;
  const requestedPage = Number(options.page || 1);
  const cursorValue = String(options.cursor || "").trim();
  const parsedCursor = cursorValue ? Number(cursorValue) : Number.NaN;
  const page = Number.isFinite(parsedCursor) && parsedCursor > 0
    ? Math.max(1, Math.floor(parsedCursor))
    : (Number.isFinite(requestedPage) && requestedPage > 0 ? Math.max(1, Math.floor(requestedPage)) : 1);
  return {
    limit,
    page,
    cursor: cursorValue
  };
}

function normalizeProductPageCollection(payload, options = {}) {
  const pageWindow = normalizeProductPageWindow(options);
  const isObjectPayload = payload && typeof payload === "object" && !Array.isArray(payload);
  const normalizedItems = sortProductsNewestFirst(normalizeProductCollection(payload));
  const cursorTarget = pageWindow.cursor ? parseProductCursor(pageWindow.cursor) : null;
  const cursorIndex = cursorTarget
    ? normalizedItems.findIndex((item) => buildProductCursor(item) === pageWindow.cursor)
    : -1;
  const pageIndex = Math.max(0, (pageWindow.page - 1) * pageWindow.limit);
  const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : pageIndex;
  const slicedItems = normalizedItems.slice(startIndex, startIndex + pageWindow.limit);
  const inferredNextCursor = slicedItems.length
    ? buildProductCursor(slicedItems[slicedItems.length - 1])
    : "";
  if (isObjectPayload) {
    const hasExplicitTotal = Number.isFinite(Number(payload.total));
    const total = hasExplicitTotal
      ? Math.max(0, Math.floor(Number(payload.total)))
      : normalizedItems.length;
    const limit = Number.isFinite(Number(payload.limit)) && Number(payload.limit) > 0
      ? Math.max(1, Math.floor(Number(payload.limit)))
      : pageWindow.limit;
    const page = Number.isFinite(Number(payload.page)) && Number(payload.page) > 0
      ? Math.max(1, Math.floor(Number(payload.page)))
      : pageWindow.page;
    const hasMore = typeof payload.hasMore === "boolean"
      ? payload.hasMore
      : Boolean(payload.nextCursor)
        || (hasExplicitTotal ? (page * limit) < total : normalizedItems.length >= limit);
    return {
      items: normalizedItems,
      nextCursor: payload.nextCursor != null ? String(payload.nextCursor) : (hasMore ? (slicedItems.length ? inferredNextCursor : buildProductCursor(normalizedItems[normalizedItems.length - 1] || null)) : ""),
      hasMore,
      total,
      page,
      limit
    };
  }

  const total = normalizedItems.length;
  const items = slicedItems;
  const hasMore = startIndex + items.length < total;
  return {
    items,
    nextCursor: hasMore ? inferredNextCursor : "",
    hasMore,
    total,
    page: pageWindow.page,
    limit: pageWindow.limit
  };
}

function normalizeProductForStream(product, options = {}) {
  if (!product || typeof product !== "object") {
    return null;
  }
  const baseImages = normalizeImageCollection(
    product.productImages
    || product.baseImages
    || product.images
    || product.imageUrls
    || product.gallery
    || []
  );
  if (typeof product.image === "string" && product.image.trim()) {
    baseImages.unshift(product.image.trim());
  }
  const dedupedBaseImages = dedupeUrls(baseImages);
  const variants = normalizeVariantCollection(product.variants || product.variations || [], options.usersById);
  const variantCount = variants.length;
  const feedPosition = Number(options.feedPosition || 0) || 0;
  const chosenVariantIndex = getSmartVariantIndex(feedPosition, variantCount);
  const chosenVariant = variantCount > 0 ? variants[chosenVariantIndex] : null;
  const hasChosenVariantImages = Boolean(chosenVariant?.images?.length);
  const displayImages = dedupeUrls(hasChosenVariantImages ? chosenVariant.images : dedupedBaseImages);
  const images = displayImages.length ? displayImages : ["/winga-icon.svg"];
  const baseAspectRatios = normalizeImageAspectRatios(product.imageAspectRatios, dedupedBaseImages.length);
  const selectedAspectRatios = hasChosenVariantImages
    ? normalizeImageAspectRatios(chosenVariant?.imageAspectRatios, images.length)
    : baseAspectRatios;
  const initialImageIndex = hasChosenVariantImages
    ? 0
    : getSmartVariantIndex(feedPosition, images.length);
  return {
    ...product,
    id: String(product.id || product.productId || product.slug || `product-${feedPosition}`).trim(),
    name: String(product.name || product.title || "Bidhaa").trim(),
    description: String(product.description || product.caption || "").trim(),
    shop: String(product.shop || product.shopName || product.sellerName || product.uploadedBy || "Seller").trim(),
    uploadedBy: String(product.uploadedBy || product.sellerId || product.username || "").trim(),
    price: Number(product.price || 0),
    comparePrice: Number(product.comparePrice || product.oldPrice || 0),
    category: String(product.category || "").trim(),
    whatsapp: String(product.whatsapp || product.whatsappNumber || "").trim(),
    location: String(product.location || "").trim(),
    status: String(product.status || "approved").trim(),
    availability: String(product.availability || "available").trim(),
    fitMode: String(product.fitMode || "contain").trim().toLowerCase() === "cover" ? "cover" : "contain",
    likes: Number(product.likes || 0),
    isLiked: Boolean(product.isLiked || product.liked),
    images,
    image: images[0] || "/winga-icon.svg",
    productImages: dedupedBaseImages,
    imageAspectRatios: selectedAspectRatios,
    variants,
    variantCount,
    selectedVariantIndex: chosenVariant ? chosenVariantIndex : null,
    variantColor: chosenVariant?.color || "",
    variantImageFallback: Boolean(chosenVariant && !hasChosenVariantImages),
    variantDisplayIndex: initialImageIndex,
    feedInitialImageIndex: initialImageIndex,
    visibleImageIndex: initialImageIndex,
    feedSequenceIndex: feedPosition + 1
  };
}

function normalizeVariantCollection(variants = []) {
  return (Array.isArray(variants) ? variants : [])
    .map((variant) => {
      if (!variant || typeof variant !== "object") {
        return null;
      }
      const images = dedupeUrls(normalizeImageCollection(
        variant.images
        || variant.imageUrls
        || variant.gallery
        || variant.image
        || []
      ));
      return {
        ...variant,
        color: String(variant.color || variant.name || "").trim(),
        images
      };
    })
    .filter(Boolean);
}

function getSmartVariantIndex(feedPosition = 0, variantCount = 0) {
  const safeVariantCount = Math.max(0, Number(variantCount || 0) || 0);
  if (safeVariantCount < 1) {
    return 0;
  }
  const safeFeedPosition = Math.max(0, Number(feedPosition || 0) || 0);
  return safeFeedPosition % safeVariantCount;
}

function normalizeImageAspectRatios(ratios = [], imageCount = 0) {
  return Array.from({ length: Math.max(0, Number(imageCount || 0) || 0) }, (_, index) => {
    const ratio = Number(Array.isArray(ratios) ? ratios[index] : 0);
    return Number.isFinite(ratio) && ratio > 0.2 && ratio < 5
      ? Number(ratio.toFixed(6))
      : 0;
  });
}

function normalizeImageCollection(images) {
  const source = Array.isArray(images) ? images : [images];
  return source
    .map((image) => {
      if (!image) {
        return "";
      }
      if (typeof image === "string") {
        return toEdgeImageUrl(image.trim());
      }
      const raw = image.url || image.src || image.imageUrl || image.secure_url || "";
      return toEdgeImageUrl(String(raw || "").trim());
    })
    .filter(Boolean);
}

function getRenderableMarketplaceImages(product) {
  const images = Array.isArray(product?.images) ? product.images : [];
  return images.length ? dedupeUrls(images.map((image) => toEdgeImageUrl(String(image || "").trim())).filter(Boolean)) : ["/winga-icon.svg"];
}

function getSellerRecord(product, usersById = {}) {
  const sellerId = String(product?.uploadedBy || "").trim();
  return sellerId ? usersById[sellerId] || null : null;
}

function getProductSellerLabel(product, seller) {
  return String(product?.shop || seller?.fullName || product?.uploadedBy || "Seller").trim();
}

function buildSellerAvatarMarkup(product, seller) {
  const sellerName = getProductSellerLabel(product, seller);
  const avatarSrc = toEdgeImageUrl(String(seller?.profileImage || "").trim());
  const verifiedBadge = seller?.verifiedSeller
    ? `<span class="product-seller-avatar-verified-badge" aria-label="Verified seller" title="Verified seller">✓</span>`
    : "";
  if (avatarSrc) {
    return `<img class="product-seller-avatar-image" src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(sellerName)}" loading="lazy" decoding="async">${verifiedBadge}`;
  }
  return `<span>${escapeHtml(getUserInitials(sellerName))}</span>${verifiedBadge}`;
}

function extractAllImageUrls(products = [], usersById = {}) {
  const urls = new Set();
  products.forEach((product) => {
    getRenderableMarketplaceImages(product).forEach((src) => urls.add(src));
    (product?.variants || []).forEach((variant) => {
      (variant?.images || []).forEach((src) => {
        if (src) {
          urls.add(toEdgeImageUrl(String(src || "").trim()));
        }
      });
    });
    const seller = getSellerRecord(product, usersById);
    const avatarSrc = toEdgeImageUrl(String(seller?.profileImage || "").trim());
    if (avatarSrc) {
      urls.add(avatarSrc);
    }
  });
  return Array.from(urls);
}

function getPrimaryFeedImageUrl(product) {
  if (!product || typeof product !== "object") {
    return "";
  }
  const images = getRenderableMarketplaceImages(product);
  const requestedIndex = Number(product?.feedInitialImageIndex ?? product?.visibleImageIndex ?? 0);
  const initialImageIndex = Number.isFinite(requestedIndex)
    ? Math.max(0, Math.min(images.length - 1, requestedIndex))
    : 0;
  return images[initialImageIndex] || images[0] || "";
}

function buildImagePreloadLinkHeader(products = []) {
  const lcpImageUrl = getPrimaryFeedImageUrl(products[0]);
  return lcpImageUrl
    ? `<${lcpImageUrl}>; rel=preload; as=image; fetchpriority=high`
    : "";
}

function toEdgeImageUrl(src = "") {
  const safeSrc = String(src || "").trim();
  if (!safeSrc) {
    return "";
  }
  if (/^data:/i.test(safeSrc)) {
    return safeSrc;
  }
  try {
    const parsed = new URL(safeSrc, "https://wingamarket.com");
    if (parsed.pathname.startsWith("/uploads/")) {
      return parsed.pathname + parsed.search;
    }
    if (parsed.hostname === "winga-pflp.onrender.com" && parsed.pathname.startsWith("/uploads/")) {
      return parsed.pathname + parsed.search;
    }
    if (parsed.origin === "https://wingamarket.com") {
      return parsed.pathname + parsed.search;
    }
    return parsed.toString();
  } catch (_error) {
    return safeSrc;
  }
}

function dedupeUrls(list = []) {
  return Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean)));
}

function getUserInitials(value = "") {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "S";
}

async function handleImageCache(request, env, ctx) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const origin = getOriginBaseUrl(env);
  const upstreamUrl = new URL(request.url);
  const originUrl = `${origin}${upstreamUrl.pathname}${upstreamUrl.search}`;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(originUrl, {
        cf: {
          cacheTtl: IMAGE_EDGE_TTL_SECONDS,
          cacheEverything: true
        }
      });
      if (!response.ok) {
        throw new Error(`Image origin failed with ${response.status}`);
      }
      const proxied = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "image/jpeg",
          "Cache-Control": `public, max-age=${IMAGE_EDGE_TTL_SECONDS}`
        }
      });
      ctx.waitUntil(cache.put(request, proxied.clone()));
      return proxied;
    } catch (_error) {
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="#f4f4f5"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#d94f00" font-family="Arial, sans-serif" font-size="120">W</text></svg>`,
    {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

async function proxyToOrigin(request, env) {
  const origin = getOriginBaseUrl(env);
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname === "/api/products" && (requestUrl.searchParams.has("limit") || requestUrl.searchParams.has("page") || requestUrl.searchParams.has("cursor"))) {
    const headers = forwardProxyHeaders(request);
    const targetUrl = `${origin}${requestUrl.pathname}${requestUrl.search}`;
    const response = await fetch(targetUrl, {
      method: request.method,
      headers
    });
    if (!response.ok) {
      return response;
    }
    try {
      const data = await response.json();
      const page = normalizeProductPageCollection(data, {
        limit: requestUrl.searchParams.get("limit") || DEFAULT_FEED_LIMIT,
        page: requestUrl.searchParams.get("page") || 1,
        cursor: requestUrl.searchParams.get("cursor") || ""
      });
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      });
    } catch (_error) {
      return response;
    }
  }
  const targetUrl = `${origin}${requestUrl.pathname}${requestUrl.search}`;
  return fetch(new Request(targetUrl, request));
}

function forwardProxyHeaders(request) {
  const headers = new Headers();
  const cookie = request.headers.get("Cookie");
  const authorization = request.headers.get("Authorization");
  const accept = request.headers.get("Accept");
  const userAgent = request.headers.get("User-Agent");
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  if (authorization) {
    headers.set("Authorization", authorization);
  }
  if (accept) {
    headers.set("Accept", accept);
  }
  if (userAgent) {
    headers.set("User-Agent", userAgent);
  }
  return headers;
}

function getOriginBaseUrl(env) {
  return String(env?.ORIGIN_BASE_URL || env?.ORIGIN || ORIGIN_BASE_URL).replace(/\/+$/, "");
}

function serializeForInlineScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getFallbackProducts() {
  return Array.from({ length: DEFAULT_FEED_LIMIT }, (_, index) => normalizeProductForStream({
    id: `fallback-${index + 1}`,
    name: "Bidhaa inakuja...",
    description: "Tunatafuta bidhaa za karibu na ladha yako.",
    shop: "Winga",
    uploadedBy: "winga",
    price: 0,
    images: ["/winga-icon.svg"],
    status: "approved",
    availability: "available",
    whatsapp: ""
  }, {
    feedPosition: index
  }));
}
