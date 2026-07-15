#!/usr/bin/env node
"use strict";

const DEFAULT_BASE_URL = "https://winga-pflp.onrender.com";
const DEFAULT_TIMEOUT_MS = 15000;

function readEnv(name, fallback = "") {
  return String(process.env[name] || fallback || "").trim();
}

function printUsage() {
  process.stderr.write([
    "Usage:",
    "  OPS_HEALTH_TOKEN=... npm run ops:intelligence:list -- --status failed,dead --limit 50",
    "  OPS_HEALTH_TOKEN=... npm run ops:intelligence:retry -- 123,124",
    "  OPS_HEALTH_TOKEN=... npm run ops:intelligence:dead -- 125 --reason \"manual quarantine\"",
    "",
    "Environment:",
    "  INTELLIGENCE_OPS_BASE_URL defaults to https://winga-pflp.onrender.com",
    "  OPS_HEALTH_TOKEN or INTELLIGENCE_HEALTH_TOKEN is required"
  ].join("\n") + "\n");
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || "list";
  const options = {
    command,
    status: "failed,dead",
    limit: "50",
    cursor: "",
    reason: ""
  };
  const ids = [];
  while (args.length) {
    const arg = args.shift();
    if (arg === "--status") {
      options.status = args.shift() || options.status;
    } else if (arg === "--limit") {
      options.limit = args.shift() || options.limit;
    } else if (arg === "--cursor") {
      options.cursor = args.shift() || "";
    } else if (arg === "--reason") {
      options.reason = args.shift() || "";
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg && !arg.startsWith("--")) {
      ids.push(...String(arg).split(","));
    }
  }
  options.queueIds = ids
    .map((id) => Number(id || 0))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 100);
  return options;
}

function buildUrl(pathname, params = {}) {
  const base = readEnv("INTELLIGENCE_OPS_BASE_URL", DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = new URL(pathname, `${base}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value).trim());
    }
  });
  return url;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(readEnv("INTELLIGENCE_OPS_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)) || DEFAULT_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch (error) {
      body = { ok: false, error: "Response was not JSON.", bodyStart: text.slice(0, 200) };
    }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeOutput(body = {}) {
  const clone = JSON.parse(JSON.stringify(body));
  delete clone.token;
  delete clone.secret;
  delete clone.queueSecret;
  return clone;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const token = readEnv("OPS_HEALTH_TOKEN", readEnv("INTELLIGENCE_HEALTH_TOKEN"));
  if (!token) {
    printUsage();
    process.stderr.write("OPS_HEALTH_TOKEN or INTELLIGENCE_HEALTH_TOKEN is required.\n");
    process.exitCode = 3;
    return;
  }

  let url;
  let fetchOptions;
  if (options.command === "list") {
    url = buildUrl("/api/ops/intelligence/queue-items", {
      status: options.status,
      limit: options.limit,
      cursor: options.cursor
    });
    fetchOptions = {
      method: "GET",
      headers: {
        "X-Ops-Health-Token": token,
        Accept: "application/json"
      }
    };
  } else if (options.command === "retry") {
    if (!options.queueIds.length) {
      printUsage();
      process.stderr.write("retry requires at least one queue id.\n");
      process.exitCode = 3;
      return;
    }
    url = buildUrl("/api/ops/intelligence/queue-retry");
    fetchOptions = {
      method: "POST",
      headers: {
        "X-Ops-Health-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ queueIds: options.queueIds })
    };
  } else if (options.command === "dead") {
    if (!options.queueIds.length) {
      printUsage();
      process.stderr.write("dead requires at least one queue id.\n");
      process.exitCode = 3;
      return;
    }
    url = buildUrl("/api/ops/intelligence/queue-dead");
    fetchOptions = {
      method: "POST",
      headers: {
        "X-Ops-Health-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        queueIds: options.queueIds,
        reason: options.reason || "manual ops quarantine"
      })
    };
  } else {
    printUsage();
    process.stderr.write(`Unknown command: ${options.command}\n`);
    process.exitCode = 3;
    return;
  }

  try {
    const { response, body } = await fetchJson(url, fetchOptions);
    const output = {
      ok: response.ok && body?.ok !== false,
      httpStatus: response.status,
      url: String(url),
      ...sanitizeOutput(body)
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (!response.ok || body?.ok === false) {
      process.exitCode = response.status === 401 || response.status === 403 ? 2 : 1;
    }
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      status: "network_error",
      message: error?.name === "AbortError" ? "Request timed out." : String(error?.message || error)
    }, null, 2)}\n`);
    process.exitCode = 4;
  }
}

main();
