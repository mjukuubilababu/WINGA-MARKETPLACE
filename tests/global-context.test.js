const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildGlobalContext,
  buildRequestGlobalContext,
  canonicalizeLocale,
  parseLanguageList,
  normalizeUserPreference,
  validateUserPreference
} = require("../backend/global-context");

test("explicit language preference wins without coupling language to location", () => {
  const context = buildGlobalContext({
    userPreference: { language: "fr-FR", useDeviceLanguage: false },
    deviceLanguages: ["ar-SA"],
    headers: { "cf-ipcountry": "TZ" }
  });
  assert.equal(context.locale, "fr-FR");
  assert.equal(context.language, "fr");
  assert.equal(context.market.country, "TZ");
  assert.equal(context.currency, "TZS");
  assert.equal(context.provenance.language, "user");
  assert.equal(context.provenance.location, "edge");
});

test("device mode follows device language before browser and region fallbacks", () => {
  const context = buildGlobalContext({
    userPreference: { language: "fr-FR", useDeviceLanguage: true },
    deviceLanguages: ["ar-SA", "en-US"],
    browserLanguages: ["sw-TZ"],
    headers: { "cf-ipcountry": "SA" }
  });
  assert.equal(context.locale, "ar-SA");
  assert.equal(context.direction, "rtl");
  assert.equal(context.currency, "SAR");
  assert.equal(context.provenance.language, "device");
});

test("request context uses browser language and edge country without precise tracking", () => {
  const context = buildRequestGlobalContext({
    headers: {
      "accept-language": "sw-TZ,sw;q=0.9,en;q=0.8",
      "cf-ipcountry": "KE",
      "x-vercel-ip-city": "Nairobi"
    }
  });
  assert.equal(context.locale, "sw-TZ");
  assert.equal(context.market.country, "KE");
  assert.equal(context.currency, "KES");
  assert.equal(context.privacy.storesCoordinates, false);
  assert.equal(Object.hasOwn(context, "ip"), false);
});

test("unknown markets fail safely while preserving canonical locale data", () => {
  const context = buildGlobalContext({ browserLanguages: ["pt-BR"], locationHint: { country: "BR" } });
  assert.equal(context.locale, "pt-BR");
  assert.equal(context.market.country, "BR");
  assert.equal(context.currency, "USD");
  assert.equal(context.timezone, "UTC");
  assert.deepEqual(context.market.commerce.payments, ["card"]);
});

test("locale parsing rejects invalid input and deduplicates browser languages", () => {
  assert.equal(canonicalizeLocale("sw_TZ"), "sw-TZ");
  assert.equal(canonicalizeLocale("not a locale"), "");
  assert.deepEqual(parseLanguageList("sw-TZ, sw-TZ;q=0.9, en-US;q=0.8"), ["sw-TZ", "en-US"]);
});
test("locale preferences are validated and preserve optimistic versions", () => {
  assert.equal(validateUserPreference({ language: "fr-FR", currency: "EUR", timezone: "Europe/Paris", rowVersion: 4 }).ok, true);
  assert.equal(validateUserPreference({ language: "not a locale" }).ok, false);
  assert.equal(validateUserPreference({ timezone: "Mars/Olympus" }).ok, false);
  const preference = normalizeUserPreference({ language: "ar-SA", useDeviceLanguage: false, currency: "sar", rowVersion: 4, updatedAt: "2026-07-26T00:00:00.000Z" });
  assert.deepEqual(preference, {
    language: "ar-SA",
    useDeviceLanguage: false,
    currency: "SAR",
    timezone: "",
    rowVersion: 4,
    updatedAt: "2026-07-26T00:00:00.000Z"
  });
});