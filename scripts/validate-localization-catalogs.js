const fs = require("fs");
const path = require("path");
const catalogDir = path.join(__dirname, "..", "src", "localization", "catalogs");
const files = fs.readdirSync(catalogDir).filter((file) => file.endsWith(".json")).sort();
if (!files.includes("en.json")) throw new Error("Canonical English catalog is missing.");
const catalogs = files.map((file) => ({ file, value: JSON.parse(fs.readFileSync(path.join(catalogDir, file), "utf8")) }));
const canonical = catalogs.find(({ file }) => file === "en.json").value;
const canonicalKeys = Object.keys(canonical.messages).sort();
const placeholderPattern = /\{([A-Za-z0-9_]+)\}/g;
const unsafeMarkup = /<\/?[A-Za-z][^>]*>/;
const unsafeControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0080-\u009F\u202A-\u202E\u2066-\u2069]/;
const suspectedMojibake = /(?:Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â(?:€|‚|„|€¦)|[ØÙ][\u0080-\u00BF])/;
function variants(message) {
  if (typeof message === "string") return [message];
  if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("Message must be a string or plural object.");
  if (typeof message.other !== "string") throw new Error("Plural message must define other.");
  return Object.values(message);
}
function placeholders(message) {
  const found = new Set();
  variants(message).forEach((text) => {
    for (const match of String(text).matchAll(placeholderPattern)) found.add(match[1]);
  });
  return Array.from(found).sort();
}
for (const { file, value } of catalogs) {
  if (value.schemaVersion !== 1) throw new Error(`${file}: unsupported schemaVersion`);
  if (!value.version || typeof value.version !== "string") throw new Error(`${file}: version is required`);
  if (path.basename(file, ".json") !== value.locale) throw new Error(`${file}: locale must match filename`);
  const keys = Object.keys(value.messages || {}).sort();
  if (JSON.stringify(keys) !== JSON.stringify(canonicalKeys)) throw new Error(`${file}: keys differ from en.json`);
  for (const key of canonicalKeys) {
    const expected = placeholders(canonical.messages[key]);
    const actual = placeholders(value.messages[key]);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${file}:${key}: placeholder mismatch`);
    for (const text of variants(value.messages[key])) {
      if (!String(text).trim()) throw new Error(`${file}:${key}: empty translation`);
      if (unsafeMarkup.test(text)) throw new Error(`${file}:${key}: HTML is not allowed`);
      if (unsafeControls.test(text)) throw new Error(`${file}:${key}: unsafe control character`);
      if (suspectedMojibake.test(text)) throw new Error(`${file}:${key}: suspected mojibake encoding`);
    }
  }
}
console.log(`Localization catalogs valid: ${catalogs.length} locales, ${canonicalKeys.length} keys each.`);
