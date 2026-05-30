const ORIGIN_BASE_URL = "https://winga-pflp.onrender.com";
const DEFAULT_FEED_LIMIT = 12;
const IMAGE_EDGE_TTL_SECONDS = 60 * 60 * 24;
const encoder = new TextEncoder();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/feed") {
      return streamFeedPage(request, env, ctx);
    }

    if (url.pathname.startsWith("/uploads/")) {
      return handleImageCache(request, env, ctx);
    }

    if (url.pathname.startsWith("/api/")) {
      return proxyToOrigin(request, env);
    }

    if (env.ASSETS?.fetch) {
      return env.ASSETS.fetch(request);
    }

    return fetch(request);
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

async function streamFeedPage(request, env, ctx) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const write = (html) => writer.write(encoder.encode(String(html || "")));
  const origin = getOriginBaseUrl(env);

  ctx.waitUntil((async () => {
    try {
      await write(buildDocumentHead());
      await write(buildSkeletonChunk());

      const initialProducts = await fetchInitialProducts(origin, request);
      const cardsHtml = initialProducts.items.map((product, index) => buildCardHtml(product, index)).join("");
      const serializedProducts = serializeForInlineScript(initialProducts.items);

      await write(`
    <script>
      const skeletons = document.getElementById("skeletons");
      if (skeletons) skeletons.remove();
      window.__WINGA_BIG_PIPE_INITIAL_PRODUCTS__ = ${serializedProducts};
    </script>
    ${cardsHtml}
`);

      await write(buildClientScript(origin));
    } catch (error) {
      await write(`
        <script>
          console.error("[WINGA] Big Pipe stream failed", ${serializeForInlineScript(String(error?.message || error || "unknown"))});
          const splash = document.getElementById("splash");
          const app = document.getElementById("app");
          if (app) app.classList.add("ready");
          if (splash) {
            splash.style.opacity = "0";
            setTimeout(() => { splash.style.display = "none"; }, 120);
          }
        </script>
        </body>
        </html>
      `);
    } finally {
      await writer.close();
    }
  })());

  return new Response(readable, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function fetchInitialProducts(origin, request) {
  const feedUrl = new URL(`${origin}/api/products`);
  feedUrl.searchParams.set("limit", String(DEFAULT_FEED_LIMIT));
  feedUrl.searchParams.set("page", "1");

  try {
    const response = await fetch(feedUrl.toString(), {
      headers: forwardProxyHeaders(request)
    });
    if (!response.ok) {
      throw new Error(`Initial feed request failed with ${response.status}`);
    }
    const payload = await response.json();
    const items = normalizeProductCollection(payload);
    if (!items.length) {
      return { items: getFallbackProducts() };
    }
    return { items };
  } catch (_error) {
    return { items: getFallbackProducts() };
  }
}

function buildDocumentHead() {
  return `<!DOCTYPE html>
<html lang="sw">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#FF6B00">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Winga Market</title>
  <link rel="manifest" href="/manifest.json">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    :root{color-scheme:light;font-family:"Segoe UI",Arial,sans-serif}
    body{background:#FF6B00;min-height:100vh;overflow-x:hidden}
    #splash{position:fixed;inset:0;background:#FF6B00;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;transition:opacity .24s ease}
    #splash img{width:120px;height:120px;object-fit:contain}
    #splash .name{color:#fff;font-size:26px;font-weight:800;margin-top:12px;letter-spacing:-.4px}
    #splash .tagline{color:rgba(255,255,255,.8);font-size:13px;margin-top:4px}
    #app{opacity:0;visibility:hidden;background:#f5f5f5;min-height:100vh}
    #app.ready{opacity:1;visibility:visible;transition:opacity .2s ease}
    .feed{padding:8px 0 88px}
    .card-skeleton,.card{background:#fff;border-radius:16px;margin:8px 12px 16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
    .card-skeleton{height:480px}
    .skeleton-img{height:360px;background:linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%);background-size:200% 100%;animation:shimmer 1.5s infinite}
    .skeleton-info{padding:12px}
    .skeleton-line{height:14px;border-radius:8px;background:linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;margin-bottom:8px}
    .skeleton-line.short{width:60%}
    @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    .card{transform:translateY(16px);opacity:0;animation:cardIn .35s ease forwards}
    @keyframes cardIn{to{transform:translateY(0);opacity:1}}
    .seller{display:flex;align-items:center;gap:8px;padding:10px 14px}
    .seller-avatar{width:32px;height:32px;border-radius:50%;background:#FF6B00;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700}
    .seller-name{font-size:13px;font-weight:600;color:#444}
    .card-img-wrap{position:relative;height:380px;overflow:hidden;background:#f0f0f0}
    .card-img-wrap img{width:100%;height:100%;object-fit:cover;display:block}
    .carousel-dots{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:4px}
    .dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.6)}
    .dot.active{background:#fff;width:18px;border-radius:999px}
    .card-body{padding:12px 14px}
    .card-title{font-size:15px;font-weight:600;color:#1a1a1a;margin-bottom:4px;line-height:1.32}
    .card-price{font-size:18px;font-weight:800;color:#FF6B00}
    .card-price span{font-size:13px;color:#999;font-weight:400;text-decoration:line-through;margin-left:6px}
    .card-actions{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-top:1px solid #f5f5f5}
    .btn-buy{background:#FF6B00;color:#fff;border:none;padding:10px 24px;border-radius:999px;font-size:14px;font-weight:700;cursor:pointer}
    .btn-like{background:none;border:none;cursor:pointer;font-size:22px;padding:6px}
    #navbar{position:fixed;bottom:0;left:0;right:0;background:#fff;display:flex;justify-content:space-around;padding:12px 0 max(12px,env(safe-area-inset-bottom));box-shadow:0 -1px 12px rgba(0,0,0,.08);z-index:1000}
    .nav-btn{display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;cursor:pointer;font-size:10px;color:#999;font-weight:500}
    .nav-btn.active{color:#FF6B00}
    .nav-btn svg{width:22px;height:22px}
  </style>
</head>
<body>
  <div id="splash">
    <img src="/splash-logo.png" alt="Winga" width="120" height="120">
    <div class="name">WINGA</div>
    <div class="tagline">Fashion. Fast. Social.</div>
  </div>
  <div id="app">
    <div id="navbar">
      <button class="nav-btn active" aria-label="Home">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        Home
      </button>
      <button class="nav-btn" aria-label="Tafuta">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        Tafuta
      </button>
      <button class="nav-btn" aria-label="Akaunti">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
        Akaunti
      </button>
    </div>
    <div class="feed" id="feed">
`;
}

function buildSkeletonChunk() {
  return `
      <div id="skeletons">
        ${Array.from({ length: 4 }, () => `
          <div class="card-skeleton">
            <div class="skeleton-img"></div>
            <div class="skeleton-info">
              <div class="skeleton-line"></div>
              <div class="skeleton-line short"></div>
            </div>
          </div>
        `).join("")}
      </div>
`;
}

function buildClientScript(origin) {
  return `
    </div>
  </div>
  <script>
    const WingaPipe = {
      page: 1,
      isFetching: false,
      readyQueue: [],
      totalLoaded: (window.__WINGA_BIG_PIPE_INITIAL_PRODUCTS__ || []).length,
      sentinelObserver: null,
      sentinelNodes: [],

      async boot() {
        const urls = this.collectImageUrls(window.__WINGA_BIG_PIPE_INITIAL_PRODUCTS__ || []);
        await Promise.race([
          this.preloadImages(urls),
          new Promise((resolve) => setTimeout(resolve, 3000))
        ]);

        const app = document.getElementById("app");
        const splash = document.getElementById("splash");
        if (app) app.classList.add("ready");
        setTimeout(() => {
          if (!splash) return;
          splash.style.opacity = "0";
          setTimeout(() => { splash.style.display = "none"; }, 240);
        }, 80);

        this.initCarousels();
        this.initSentinels();
      },

      collectImageUrls(products) {
        const urls = [];
        products.forEach((product) => {
          (product.images || []).forEach((image) => urls.push(this.getImageUrl(image)));
          (product.variants || product.variations || []).forEach((variant) => {
            (variant.images || []).forEach((image) => urls.push(this.getImageUrl(image)));
          });
        });
        return [...new Set(urls.filter(Boolean))];
      },

      getImageUrl(image) {
        if (!image) return "";
        if (typeof image === "string") return image;
        return image.url || image.src || image.imageUrl || "";
      },

      preloadImages(urls) {
        return Promise.allSettled(
          [...new Set((urls || []).filter(Boolean))].map((url) => new Promise((resolve) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = resolve;
            img.src = url;
          }))
        );
      },

      createSentinel(targetCard, callback) {
        if (!(targetCard instanceof Element)) return null;
        const sentinel = document.createElement("div");
        sentinel.style.cssText = "height:1px;width:100%;pointer-events:none";
        targetCard.after(sentinel);
        this.sentinelObserver.observe(sentinel);
        sentinel.__wingaCallback = callback;
        this.sentinelNodes.push(sentinel);
        return sentinel;
      },

      initSentinels() {
        this.sentinelNodes.forEach((node) => {
          this.sentinelObserver?.unobserve(node);
          node.remove();
        });
        this.sentinelNodes = [];

        const cards = [...document.querySelectorAll("#feed .card")];
        if (cards.length < 4) return;

        if (!this.sentinelObserver) {
          this.sentinelObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              const callback = entry.target.__wingaCallback;
              this.sentinelObserver.unobserve(entry.target);
              entry.target.remove();
              if (typeof callback === "function") callback();
            });
          }, { rootMargin: "1200px 0px 1200px 0px", threshold: 0 });
        }

        this.createSentinel(cards[Math.max(0, cards.length - 12)], () => { this.fetchNextBatch(); });
        this.createSentinel(cards[Math.max(0, cards.length - 5)], async () => {
          if (!this.readyQueue.length && !this.isFetching) {
            this.fetchNextBatch();
          }
          await this.waitForQueue(1800);
        });
        this.createSentinel(cards[Math.max(0, cards.length - 2)], async () => {
          if (!this.readyQueue.length) {
            await this.waitForQueue(3200);
          }
          this.injectBatch();
        });
      },

      async fetchNextBatch() {
        if (this.isFetching) return;
        this.isFetching = true;
        this.page += 1;

        try {
          const response = await fetch("/api/products?limit=12&page=" + this.page, {
            credentials: "same-origin"
          });
          if (!response.ok) throw new Error("feed fetch failed");
          const payload = await response.json();
          const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
          const urls = this.collectImageUrls(items);
          await this.preloadImages(urls);
          this.readyQueue.push(...items);
        } catch (error) {
          console.warn("[WINGA] next batch fetch failed", error);
        } finally {
          this.isFetching = false;
        }
      },

      waitForQueue(maxWaitMs = 2500) {
        return new Promise((resolve) => {
          const startedAt = Date.now();
          const check = () => {
            if (this.readyQueue.length || !this.isFetching || Date.now() - startedAt >= maxWaitMs) {
              resolve();
              return;
            }
            setTimeout(check, 80);
          };
          check();
        });
      },

      injectBatch() {
        if (!this.readyQueue.length) return;
        const batch = this.readyQueue.splice(0, 12);
        const feed = document.getElementById("feed");
        if (!feed) return;

        requestAnimationFrame(() => {
          const fragment = document.createDocumentFragment();
          batch.forEach((product, index) => {
            const wrapper = document.createElement("div");
            wrapper.innerHTML = this.buildCard(product, this.totalLoaded + index);
            if (wrapper.firstElementChild) fragment.appendChild(wrapper.firstElementChild);
          });
          feed.appendChild(fragment);
          this.totalLoaded += batch.length;
          this.initCarousels();
          this.initSentinels();
        });
      },

      initCarousels() {
        document.querySelectorAll(".card-img-wrap:not([data-carousel-init='true'])").forEach((wrap) => {
          wrap.setAttribute("data-carousel-init", "true");
          let startX = 0;
          let currentIndex = 0;
          const images = [...wrap.querySelectorAll("img")];
          const dots = [...wrap.querySelectorAll(".dot")];
          if (images.length < 2) return;

          const goTo = (index) => {
            currentIndex = Math.max(0, Math.min(images.length - 1, index));
            images.forEach((image, imageIndex) => {
              image.style.display = imageIndex === currentIndex ? "block" : "none";
            });
            dots.forEach((dot, dotIndex) => {
              dot.classList.toggle("active", dotIndex === currentIndex);
            });
          };

          wrap.addEventListener("touchstart", (event) => {
            startX = event.touches[0]?.clientX || 0;
          }, { passive: true });

          wrap.addEventListener("touchend", (event) => {
            const endX = event.changedTouches[0]?.clientX || 0;
            const diff = startX - endX;
            if (Math.abs(diff) > 40) {
              goTo(currentIndex + (diff > 0 ? 1 : -1));
            }
          }, { passive: true });

          goTo(0);
        });
      },

      buildCard(product, index) {
        const images = Array.isArray(product?.images) && product.images.length
          ? product.images
          : [{ url: "" }];
        const title = this.escapeHtml(product?.title || product?.name || "Bidhaa");
        const seller = this.escapeHtml(product?.seller?.name || product?.shopName || product?.shop || "Winga Seller");
        const sellerBadge = this.escapeHtml((seller || "W").trim().charAt(0).toUpperCase() || "W");
        const price = Number(product?.price || 0);
        const oldPrice = Number(product?.comparePrice || product?.originalPrice || 0);
        const delay = (index % 12) * 0.04;
        return \`
          <div class="card" style="animation-delay:\${delay}s">
            <div class="seller">
              <div class="seller-avatar">\${sellerBadge}</div>
              <div class="seller-name">\${seller}</div>
            </div>
            <div class="card-img-wrap">
              \${images.map((image, imageIndex) => {
                const url = this.escapeAttribute(this.getImageUrl(image) || "");
                return \`<img src="\${url}" alt="\${title}" style="display:\${imageIndex === 0 ? "block" : "none"}" loading="\${index < 3 ? "eager" : "lazy"}" fetchpriority="\${index < 2 ? "high" : "auto"}">\`;
              }).join("")}
              \${images.length > 1 ? \`<div class="carousel-dots">\${images.map((_, imageIndex) => \`<div class="dot \${imageIndex === 0 ? "active" : ""}"></div>\`).join("")}</div>\` : ""}
            </div>
            <div class="card-body">
              <div class="card-title">\${title}</div>
              <div class="card-price">
                TSh \${price.toLocaleString()}
                \${oldPrice > price ? \`<span>TSh \${oldPrice.toLocaleString()}</span>\` : ""}
              </div>
            </div>
            <div class="card-actions">
              <button class="btn-like" aria-label="Like">🤍</button>
              <button class="btn-buy">Nunua Sasa</button>
            </div>
          </div>
        \`;
      },

      escapeHtml(value) {
        return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char] || char));
      },

      escapeAttribute(value) {
        return this.escapeHtml(value).replace(/'/g, "&#39;");
      }
    };

    WingaPipe.boot();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("[WINGA] SW registration failed", error);
      });
    }

    setInterval(() => {
      fetch("/api/ping").catch(() => {});
    }, 10 * 60 * 1000);
  </script>
</body>
</html>`;
}

function buildCardHtml(product, index) {
  const images = getProductImages(product);
  const title = escapeHtml(product?.title || product?.name || "Bidhaa");
  const sellerName = escapeHtml(product?.seller?.name || product?.shopName || product?.shop || "Winga Seller");
  const sellerInitial = escapeHtml((sellerName || "W").trim().charAt(0).toUpperCase() || "W");
  const price = Number(product?.price || 0);
  const oldPrice = Number(product?.comparePrice || product?.originalPrice || 0);
  const delay = (index % DEFAULT_FEED_LIMIT) * 0.04;

  return `
    <div class="card" style="animation-delay:${delay}s">
      <div class="seller">
        <div class="seller-avatar">${sellerInitial}</div>
        <div class="seller-name">${sellerName}</div>
      </div>
      <div class="card-img-wrap">
        ${images.map((image, imageIndex) => `
          <img
            src="${escapeAttribute(getImageUrl(image) || "")}"
            alt="${title}"
            style="display:${imageIndex === 0 ? "block" : "none"}"
            loading="${index < 3 ? "eager" : "lazy"}"
            fetchpriority="${index < 2 ? "high" : "auto"}"
          >
        `).join("")}
        ${images.length > 1 ? `
          <div class="carousel-dots">
            ${images.map((_, imageIndex) => `<div class="dot ${imageIndex === 0 ? "active" : ""}"></div>`).join("")}
          </div>
        ` : ""}
      </div>
      <div class="card-body">
        <div class="card-title">${title}</div>
        <div class="card-price">
          TSh ${price.toLocaleString()}
          ${oldPrice > price ? `<span>TSh ${oldPrice.toLocaleString()}</span>` : ""}
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-like" aria-label="Like">🤍</button>
        <button class="btn-buy">Nunua Sasa</button>
      </div>
    </div>
  `;
}

async function handleImageCache(request, env, ctx) {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const origin = getOriginBaseUrl(env);
  const originUrl = new URL(request.url);
  originUrl.hostname = new URL(origin).hostname;
  originUrl.protocol = new URL(origin).protocol;
  originUrl.port = new URL(origin).port;

  try {
    const response = await fetch(originUrl.toString(), {
      cf: {
        cacheTtl: IMAGE_EDGE_TTL_SECONDS,
        cacheEverything: true
      },
      headers: forwardProxyHeaders(request)
    });

    if (!response.ok) {
      return buildPlaceholderImageResponse();
    }

    const headers = new Headers(response.headers);
    headers.set("Cache-Control", `public, max-age=${IMAGE_EDGE_TTL_SECONDS}, s-maxage=${IMAGE_EDGE_TTL_SECONDS}`);

    const toCache = new Response(response.body, {
      status: response.status,
      headers
    });
    ctx.waitUntil(cache.put(request, toCache.clone()));
    return toCache;
  } catch (_error) {
    return buildPlaceholderImageResponse();
  }
}

async function proxyToOrigin(request, env) {
  const origin = getOriginBaseUrl(env);
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(sourceUrl.pathname + sourceUrl.search, origin);
  return fetch(new Request(targetUrl.toString(), request), {
    headers: forwardProxyHeaders(request)
  });
}

function forwardProxyHeaders(request) {
  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", new URL(request.url).host);
  return headers;
}

function getOriginBaseUrl(env) {
  return String(env?.ORIGIN_BASE_URL || ORIGIN_BASE_URL).replace(/\/+$/, "");
}

function normalizeProductCollection(payload) {
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload?.products)) {
    return payload.products;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return [];
}

function getProductImages(product) {
  const images = Array.isArray(product?.images) && product.images.length
    ? product.images
    : Array.isArray(product?.gallery) && product.gallery.length
      ? product.gallery
      : Array.isArray(product?.photos) && product.photos.length
        ? product.photos
        : [{ url: "" }];
  return images;
}

function getImageUrl(image) {
  if (!image) {
    return "";
  }
  if (typeof image === "string") {
    return image;
  }
  return image.url || image.src || image.imageUrl || image.feedImage || image.feedImageUrl || "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function serializeForInlineScript(value) {
  return JSON.stringify(value ?? null).replace(/</g, "\\u003c");
}

function buildPlaceholderImageResponse() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720" role="img" aria-label="Winga image placeholder">
      <rect width="720" height="720" fill="#f5ede7"/>
      <rect x="150" y="150" width="420" height="420" rx="36" fill="#ffffff"/>
      <circle cx="360" cy="305" r="72" fill="#ff6b00" opacity="0.18"/>
      <path d="M220 500l96-118 84 76 64-84 116 126H220z" fill="#ff6b00" opacity="0.28"/>
      <text x="360" y="620" text-anchor="middle" fill="#ff6b00" font-family="Arial, sans-serif" font-size="34" font-weight="700">WINGA</text>
    </svg>
  `.trim();
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}

function getFallbackProducts() {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `fallback-${index + 1}`,
    title: "Bidhaa Inapakia...",
    price: 0,
    images: [{ url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
      <svg xmlns='http://www.w3.org/2000/svg' width='720' height='720' viewBox='0 0 720 720'>
        <rect width='720' height='720' fill='#f5ede7'/>
        <text x='360' y='360' text-anchor='middle' fill='#ff6b00' font-family='Arial, sans-serif' font-size='38' font-weight='700'>Winga</text>
      </svg>
    `.trim()) }],
    seller: { name: "Winga" }
  }));
}
