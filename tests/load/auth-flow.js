import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const BASE_URL = String(__ENV.BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const REQUEST_ORIGIN = String(__ENV.REQUEST_ORIGIN || BASE_URL).replace(/\/+$/, "");
const THINK_TIME_MIN = Math.max(1, Number(__ENV.THINK_TIME_MIN || 3));
const THINK_TIME_MAX = Math.max(THINK_TIME_MIN, Number(__ENV.THINK_TIME_MAX || 6));
const parsedAccounts = (() => {
  try {
    const value = JSON.parse(String(__ENV.AUTH_ACCOUNTS_JSON || "[]"));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
})();

const authLatency = new Trend("winga_auth_latency", true);
const messageLatency = new Trend("winga_message_latency", true);
const authErrors = new Rate("winga_auth_errors");
const messageErrors = new Rate("winga_message_errors");
const throttledRequests = new Counter("winga_throttled_requests");
const messagesSent = new Counter("winga_messages_sent");

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 429));

export const options = {
  stages: [
    { duration: "2m", target: 10 },
    { duration: "2m", target: 50 },
    { duration: "2m", target: 100 },
    { duration: "30s", target: 0 }
  ],
  thresholds: {
    winga_auth_errors: ["rate<0.01"],
    winga_message_errors: ["rate<0.01"],
    winga_auth_latency: ["p(95)<1500", "p(99)<3000"],
    winga_message_latency: ["p(95)<1200", "p(99)<2500"]
  },
  userAgent: "Winga-k6-auth-flow/1.0"
};

function assertSafeConfiguration() {
  const match = BASE_URL.match(/^https?:\/\/([^/:?#]+)(?::\d+)?(?:[/?#]|$)/i);
  if (!match) {
    fail("BASE_URL must be a valid HTTP or HTTPS URL.");
  }
  const hostname = String(match?.[1] || "").toLowerCase();
  const isProduction = hostname === "wingamarket.com" || hostname === "www.wingamarket.com";
  if (isProduction && String(__ENV.ALLOW_PRODUCTION_LOAD_TEST || "").toLowerCase() !== "true") {
    fail("Production load testing is blocked. Use staging or explicitly set ALLOW_PRODUCTION_LOAD_TEST=true.");
  }
  if (!parsedAccounts.length) {
    fail("AUTH_ACCOUNTS_JSON must contain isolated staging sender accounts and receiverId values.");
  }
}

function accountForVu() {
  return parsedAccounts[(__VU - 1) % parsedAccounts.length] || null;
}

function responseCookie(response, name) {
  const entries = response?.cookies?.[name] || [];
  return String(entries[0]?.value || "");
}

function csrfSession() {
  const response = http.get(`${BASE_URL}/api/auth/csrf-token`, {
    tags: { name: "GET /api/auth/csrf-token" },
    timeout: "15s"
  });
  let token = "";
  try {
    token = String(response.json("csrfToken") || "");
  } catch (error) {
    token = "";
  }
  check(response, {
    "CSRF endpoint returns 200": (result) => result.status === 200,
    "CSRF endpoint returns a token": () => token.length >= 32
  });
  return { token, cookie: responseCookie(response, "winga_csrf") };
}

function requestHeaders(token, cookie = "") {
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": token,
    Origin: REQUEST_ORIGIN,
    ...(cookie ? { Cookie: cookie } : {})
  };
}

export function setup() {
  assertSafeConfiguration();
  return { configuredAccounts: parsedAccounts.length };
}

export default function () {
  const account = accountForVu();
  if (!account?.username || !account?.password || !account?.receiverId || account.username === account.receiverId) {
    authErrors.add(true);
    sleep(1);
    return;
  }

  const csrf = csrfSession();
  if (!csrf.token) {
    authErrors.add(true);
    sleep(1);
    return;
  }

  const login = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    username: account.username,
    identifier: account.username,
    password: account.password
  }), {
    headers: requestHeaders(csrf.token, csrf.cookie ? `winga_csrf=${csrf.cookie}` : ""),
    tags: { name: "POST /api/auth/login" },
    timeout: "15s"
  });
  authLatency.add(login.timings.duration);
  if (login.status === 429) {
    throttledRequests.add(1, { route: "login" });
    sleep(THINK_TIME_MAX);
    return;
  }
  const loginOk = check(login, { "login succeeds": (response) => response.status === 200 });
  authErrors.add(!loginOk);
  if (!loginOk) {
    sleep(1);
    return;
  }

  sleep(THINK_TIME_MIN + (Math.random() * (THINK_TIME_MAX - THINK_TIME_MIN)));

  const authCookie = responseCookie(login, "winga_auth");
  const sessionCookies = [
    csrf.cookie ? `winga_csrf=${csrf.cookie}` : "",
    authCookie ? `winga_auth=${authCookie}` : ""
  ].filter(Boolean).join("; ");

  const message = http.post(`${BASE_URL}/api/messages`, JSON.stringify({
    receiverId: account.receiverId,
    messageType: "text",
    message: `k6 staging probe vu=${__VU} iter=${__ITER} nonce=${Date.now()}`
  }), {
    headers: requestHeaders(csrf.token, sessionCookies),
    tags: { name: "POST /api/messages" },
    timeout: "15s"
  });
  messageLatency.add(message.timings.duration);
  if (message.status === 429) {
    throttledRequests.add(1, { route: "messages" });
    sleep(THINK_TIME_MAX);
    return;
  }
  const messageOk = check(message, { "message is persisted": (response) => response.status === 200 });
  messageErrors.add(!messageOk);
  if (messageOk) {
    messagesSent.add(1);
  }
}

