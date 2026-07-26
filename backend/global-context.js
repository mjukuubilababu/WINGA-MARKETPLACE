const PLATFORM_VERSION = "2026-07-26.1";

const MARKET_PROFILES = Object.freeze({
  TZ: { locale: "sw-TZ", languages: ["sw", "en"], currency: "TZS", timezone: "Africa/Dar_es_Salaam", units: "metric", payments: ["mobile_money", "card", "cash"] },
  KE: { locale: "sw-KE", languages: ["sw", "en"], currency: "KES", timezone: "Africa/Nairobi", units: "metric", payments: ["mobile_money", "card", "cash"] },
  UG: { locale: "en-UG", languages: ["en", "sw"], currency: "UGX", timezone: "Africa/Kampala", units: "metric", payments: ["mobile_money", "card", "cash"] },
  RW: { locale: "rw-RW", languages: ["rw", "en", "fr"], currency: "RWF", timezone: "Africa/Kigali", units: "metric", payments: ["mobile_money", "card"] },
  ZA: { locale: "en-ZA", languages: ["en", "zu", "xh", "af"], currency: "ZAR", timezone: "Africa/Johannesburg", units: "metric", payments: ["card", "bank_transfer", "wallet"] },
  FR: { locale: "fr-FR", languages: ["fr", "en"], currency: "EUR", timezone: "Europe/Paris", units: "metric", payments: ["card", "wallet", "bank_transfer"] },
  US: { locale: "en-US", languages: ["en", "es"], currency: "USD", timezone: "America/New_York", units: "us", payments: ["card", "wallet"] },
  GB: { locale: "en-GB", languages: ["en"], currency: "GBP", timezone: "Europe/London", units: "metric", payments: ["card", "wallet", "bank_transfer"] },
  SA: { locale: "ar-SA", languages: ["ar", "en"], currency: "SAR", timezone: "Asia/Riyadh", units: "metric", payments: ["card", "wallet", "cash"] },
  IN: { locale: "en-IN", languages: ["hi", "en"], currency: "INR", timezone: "Asia/Kolkata", units: "metric", payments: ["upi", "card", "wallet", "cash"] }
});
const LANGUAGE_REGION_FALLBACKS = Object.freeze({ sw: "TZ", rw: "RW", fr: "FR", ar: "SA", hi: "IN", en: "US" });
const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur"]);

function clean(value, maxLength = 120) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}
function getHeader(headers = {}, name = "") {
  const key = String(name || "").toLowerCase();
  return clean(headers[key] || headers[name] || "", 240);
}
function normalizeCountry(value = "") {
  const country = clean(value, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : "";
}
function canonicalizeLocale(value = "") {
  const candidate = clean(value, 40).replace(/_/g, "-");
  if (!candidate) return "";
  try { return Intl.getCanonicalLocales(candidate)[0] || ""; } catch (_error) { return ""; }
}
function parseLanguageList(value = "") {
  const entries = Array.isArray(value) ? value : String(value || "").split(",");
  return Array.from(new Set(entries.map((entry) => canonicalizeLocale(String(entry || "").split(";")[0])).filter(Boolean))).slice(0, 12);
}
function languageOf(locale = "") { return canonicalizeLocale(locale).split("-")[0].toLowerCase(); }
function inferCountryFromLocale(locale = "") {
  const canonical = canonicalizeLocale(locale);
  const region = canonical.split("-").find((part, index) => index > 0 && /^[A-Z]{2}$/.test(part));
  return normalizeCountry(region || LANGUAGE_REGION_FALLBACKS[languageOf(canonical)] || "");
}
function selectLanguage({ userPreference = {}, deviceLanguages = [], browserLanguages = [], country = "" } = {}) {
  const selected = canonicalizeLocale(userPreference.language);
  if (selected && userPreference.useDeviceLanguage !== true) return { locale: selected, source: "user", confidence: 1 };
  const device = parseLanguageList(deviceLanguages)[0];
  if (device) return { locale: device, source: "device", confidence: 0.9 };
  const browser = parseLanguageList(browserLanguages)[0];
  if (browser) return { locale: browser, source: "browser", confidence: 0.8 };
  const profile = MARKET_PROFILES[normalizeCountry(country)];
  if (profile?.locale) return { locale: profile.locale, source: "region", confidence: 0.65 };
  return { locale: "en-US", source: "fallback", confidence: 0.4 };
}
function resolveLocation({ headers = {}, locationHint = {}, languageCountry = "" } = {}) {
  const explicit = normalizeCountry(locationHint.country);
  const edge = normalizeCountry(getHeader(headers, "cf-ipcountry") || getHeader(headers, "x-vercel-ip-country"));
  const country = explicit || edge || normalizeCountry(languageCountry) || "US";
  return {
    country,
    region: clean(locationHint.region || getHeader(headers, "x-vercel-ip-country-region"), 100),
    city: clean(locationHint.city || getHeader(headers, "x-vercel-ip-city"), 100),
    source: explicit ? "user" : edge ? "edge" : languageCountry ? "language_fallback" : "fallback",
    confidence: explicit ? 1 : edge ? 0.9 : languageCountry ? 0.45 : 0.25
  };
}
function buildGlobalContext(input = {}) {
  const requestedLanguages = parseLanguageList(input.deviceLanguages?.length ? input.deviceLanguages : input.browserLanguages);
  const languageCountry = inferCountryFromLocale(input.userPreference?.language || requestedLanguages[0]);
  const location = resolveLocation({ headers: input.headers, locationHint: input.locationHint, languageCountry });
  const language = selectLanguage({ userPreference: input.userPreference, deviceLanguages: input.deviceLanguages, browserLanguages: input.browserLanguages || getHeader(input.headers, "accept-language"), country: location.country });
  const market = MARKET_PROFILES[location.country] || { locale: language.locale || "en-US", languages: [languageOf(language.locale) || "en"], currency: "USD", timezone: "UTC", units: "metric", payments: ["card"] };
  const locale = canonicalizeLocale(language.locale || market.locale) || "en-US";
  const languageCode = languageOf(locale) || "en";
  const requestedCurrency = clean(input.userPreference?.currency || market.currency || "USD", 3).toUpperCase();
  return Object.freeze({
    schemaVersion: 1,
    platformVersion: PLATFORM_VERSION,
    locale,
    language: languageCode,
    requestedLanguages,
    direction: RTL_LANGUAGES.has(languageCode) ? "rtl" : "ltr",
    currency: /^[A-Z]{3}$/.test(requestedCurrency) ? requestedCurrency : "USD",
    timezone: clean(input.userPreference?.timezone || market.timezone || "UTC", 80),
    units: market.units || "metric",
    location,
    market: Object.freeze({ country: location.country, languages: market.languages || [languageCode], commerce: { payments: market.payments, delivery: ["local_delivery", "courier", "pickup"] }, discoveryPolicy: "local_priority_global_discovery" }),
    provenance: Object.freeze({ language: language.source, languageConfidence: language.confidence, location: location.source, locationConfidence: location.confidence }),
    privacy: Object.freeze({ precision: location.city ? "city" : location.region ? "region" : "country", storesCoordinates: false, analyticsMode: "aggregate" })
  });
}
function buildRequestGlobalContext(req = {}, options = {}) {
  return buildGlobalContext({ headers: req.headers || {}, browserLanguages: getHeader(req.headers, "accept-language"), userPreference: options.userPreference || {}, locationHint: options.locationHint || {} });
}
module.exports = { PLATFORM_VERSION, MARKET_PROFILES, buildGlobalContext, buildRequestGlobalContext, canonicalizeLocale, parseLanguageList };
