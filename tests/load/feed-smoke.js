import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = String(__ENV.BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const PAGE_LIMIT = Math.min(50, Math.max(1, Number(__ENV.PAGE_LIMIT || 12)));
const THINK_TIME_MIN = Math.max(0, Number(__ENV.THINK_TIME_MIN || 2));
const THINK_TIME_MAX = Math.max(THINK_TIME_MIN, Number(__ENV.THINK_TIME_MAX || 4));

const feedLatency = new Trend("winga_feed_latency", true);
const feedErrors = new Rate("winga_feed_errors");
const feedPages = new Counter("winga_feed_pages");

export const options = {
  stages: [
    { duration: "2m", target: 10 },
    { duration: "2m", target: 50 },
    { duration: "2m", target: 100 },
    { duration: "30s", target: 0 }
  ],
  thresholds: {
    checks: ["rate>0.99"],
    winga_feed_errors: ["rate<0.01"],
    winga_feed_latency: ["p(95)<1000", "p(99)<2000"]
  },
  discardResponseBodies: false,
  userAgent: "Winga-k6-feed-smoke/1.0"
};

function assertSafeTarget() {
  const match = BASE_URL.match(/^https?:\/\/([^/:?#]+)(?::\d+)?(?:[/?#]|$)/i);
  if (!match) {
    fail("BASE_URL must be a valid HTTP or HTTPS URL.");
  }
  const hostname = String(match?.[1] || "").toLowerCase();
  const isProduction = hostname === "wingamarket.com" || hostname === "www.wingamarket.com";
  if (isProduction && String(__ENV.ALLOW_PRODUCTION_LOAD_TEST || "").toLowerCase() !== "true") {
    fail("Production load testing is blocked. Use staging or explicitly set ALLOW_PRODUCTION_LOAD_TEST=true.");
  }
}

function readJson(response) {
  try {
    return response.json();
  } catch (error) {
    return null;
  }
}

function requestFeed(url, pageLabel) {
  const response = http.get(url, {
    tags: { name: "GET /api/products", feed_page: pageLabel },
    timeout: "15s",
    responseType: "text"
  });
  const body = readJson(response);
  const valid = check(response, {
    [`${pageLabel} returns 200`]: (result) => result.status === 200,
    [`${pageLabel} returns paginated items`]: () => Array.isArray(body?.items),
    [`${pageLabel} respects requested limit`]: () => Array.isArray(body?.items) && body.items.length <= PAGE_LIMIT,
    [`${pageLabel} exposes hasMore`]: () => typeof body?.hasMore === "boolean"
  });
  feedLatency.add(response.timings.duration, { feed_page: pageLabel });
  feedErrors.add(!valid, { feed_page: pageLabel });
  feedPages.add(1, { feed_page: pageLabel });
  return { body };
}

export function setup() {
  assertSafeTarget();
  return { baseUrl: BASE_URL };
}

export default function (data) {
  const first = requestFeed(`${data.baseUrl}/api/products?limit=${PAGE_LIMIT}&page=1`, "first");
  if (!Array.isArray(first.body?.items)) {
    sleep(1);
    return;
  }

  sleep(THINK_TIME_MIN + (Math.random() * (THINK_TIME_MAX - THINK_TIME_MIN)));

  const cursor = String(first.body?.nextCursor || "").trim();
  const continuation = cursor
    ? `${data.baseUrl}/api/products?limit=${PAGE_LIMIT}&page=2&cursor=${encodeURIComponent(cursor)}`
    : `${data.baseUrl}/api/products?limit=${PAGE_LIMIT}&page=2`;
  requestFeed(continuation, "continuation");
}
