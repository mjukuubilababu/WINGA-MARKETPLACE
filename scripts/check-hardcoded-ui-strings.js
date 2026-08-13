const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const root = path.join(__dirname, "..");
const baselinePath = path.join(__dirname, "hardcoded-ui-baseline.json");
const scanRoots = ["app.js", "src/admin", "src/auth", "src/categories", "src/chat", "src/marketplace", "src/navigation", "src/notifications", "src/product-detail", "src/products", "src/profile", "src/requests", "src/reviews"];
const patterns = [
  ["property", /\b(?:title|subtitle|heading|eyebrow|label|helpText|body|textContent|placeholder)\s*:\s*(["'`])([^"'`]+)\1/g],
  ["accessible-name", /["'](?:aria-label|title)["']\s*:\s*(["'`])([^"'`]+)\1/g],
  ["dom-assignment", /\.textContent\s*=\s*(["'`])([^"'`]+)\1/g],
  ["confirmation", /\b(?:confirm|confirmAction)\s*\(\s*(["'`])([^"'`]+)\1/g],
  ["user-error", /\bnew\s+Error\s*\(\s*(["'`])([^"'`]+)\1/g]
];
function walk(target) {
  const absolute = path.join(root, target);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return absolute.endsWith(".js") ? [absolute] : [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "localization") return [];
    return walk(path.relative(root, path.join(absolute, entry.name)));
  });
}
function normalize(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function isLocalizedLine(line) { return /(?:translateUi|\btranslate|\bt)\s*\(/.test(line); }
function isNonUserLiteral(value) {
  const text = normalize(value);
  if (!text || text.length < 2) return true;
  if (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(text)) return true;
  if (/^(?:https?:\/\/|\/api\/|data:|#[A-Za-z0-9_-]+$)/.test(text)) return true;
  if (/^[A-Za-z0-9_.:-]+$/.test(text) && !/[A-Z][a-z]|[a-z]{3,}/.test(text)) return true;
  return false;
}
function collect() {
  const grouped = new Map();
  const files = Array.from(new Set(scanRoots.flatMap(walk))).sort();
  for (const file of files) {
    const relative = path.relative(root, file).replace(/\\/g, "/");
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
      if (isLocalizedLine(line) || /i18n-gate:\s*allow/.test(line)) return;
      for (const [kind, pattern] of patterns) {
        pattern.lastIndex = 0;
        for (const match of line.matchAll(pattern)) {
          const text = normalize(match[2]);
          if (isNonUserLiteral(text)) continue;
          const signature = `${relative}|${kind}|${text}`;
          const current = grouped.get(signature) || { signature, file: relative, kind, text, count: 0, lines: [] };
          current.count += 1;
          current.lines.push(index + 1);
          grouped.set(signature, current);
        }
      }
    });
  }
  return Array.from(grouped.values()).sort((a, b) => a.signature.localeCompare(b.signature));
}
function digest(entries) {
  return crypto.createHash("sha256").update(entries.map(({ signature, count }) => `${signature}|${count}`).join("\n")).digest("hex");
}
const findings = collect();
if (process.env.WINGA_I18N_GATE_PROBE === "1") {
  findings.push({ signature: "app.js|property|Synthetic untranslated production string", file: "app.js", kind: "property", text: "Synthetic untranslated production string", count: 1, lines: [0] });
  findings.sort((a, b) => a.signature.localeCompare(b.signature));
}
if (process.argv.includes("--update-baseline")) {
  const baseline = { schemaVersion: 1, policy: "Existing debt may decrease only. New or modified user-visible literals must use localization keys.", count: findings.reduce((sum, item) => sum + item.count, 0), digest: digest(findings), entries: findings.map(({ signature, count }) => ({ signature, count })) };
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  console.log(`Updated hard-coded UI baseline: ${baseline.count} occurrences across ${baseline.entries.length} fingerprints.`);
  process.exit(0);
}
if (!fs.existsSync(baselinePath)) throw new Error("Hard-coded UI baseline is missing. Run with --update-baseline after reviewing every finding.");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
if (baseline.schemaVersion !== 1 || !Array.isArray(baseline.entries)) throw new Error("Hard-coded UI baseline is invalid.");
if (baseline.digest !== digest(baseline.entries)) throw new Error("Hard-coded UI baseline digest is invalid; regenerate it through the review command.");
const expected = new Map(baseline.entries.map((entry) => [entry.signature, Number(entry.count || 0)]));
const violations = findings.filter((entry) => entry.count > (expected.get(entry.signature) || 0));
if (violations.length) {
  console.error("New or modified hard-coded user-visible strings detected:");
  violations.slice(0, 50).forEach((entry) => console.error(`- ${entry.file}:${entry.lines.join(",")} [${entry.kind}] ${entry.text}`));
  console.error("Use translateUi()/t() with catalog parity. Do not update the baseline unless the literal is intentionally reviewed.");
  process.exit(1);
}
const currentCount = findings.reduce((sum, item) => sum + item.count, 0);
if (currentCount > Number(baseline.count || 0)) throw new Error("Hard-coded UI debt increased.");
console.log(`Hard-coded UI gate passed: ${currentCount}/${baseline.count} grandfathered occurrences; new debt 0.`);
