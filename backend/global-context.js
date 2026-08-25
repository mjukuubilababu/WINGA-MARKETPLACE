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
const CURRENCY_SYMBOL_OVERRIDES = Object.freeze({ TZS: "TSh", KES: "KSh", UGX: "USh", RWF: "RF" });

function resolveCurrencySymbol(currencyCode = "TZS", locale = "sw-TZ") {
  const code = clean(currencyCode, 3).toUpperCase();
  if (CURRENCY_SYMBOL_OVERRIDES[code]) return CURRENCY_SYMBOL_OVERRIDES[code];
  try {
    const part = new Intl.NumberFormat(canonicalizeLocale(locale) || "en-US", {
      style: "currency",
      currency: /^[A-Z]{3}$/.test(code) ? code : "TZS",
      currencyDisplay: "narrowSymbol"
    }).formatToParts(0).find((entry) => entry.type === "currency");
    return clean(part?.value || code || "TSh", 12);
  } catch (_error) {
    return code || "TSh";
  }
}
function formatPrice(amount, currencyContext = {}) {
  const numericValue = Number(amount);
  const code = clean(currencyContext.currencyCode || currencyContext.currency || "TZS", 3).toUpperCase();
  const currency = /^[A-Z]{3}$/.test(code) ? code : "TZS";
  const locale = canonicalizeLocale(currencyContext.locale || "sw-TZ") || "sw-TZ";
  const maximumFractionDigits = new Set(["TZS", "KES", "UGX", "RWF"]).has(currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits
    }).format(Number.isFinite(numericValue) ? numericValue : 0);
  } catch (_error) {
    return `${resolveCurrencySymbol(currency, locale)} ${new Intl.NumberFormat("sw-TZ", { maximumFractionDigits }).format(Number.isFinite(numericValue) ? numericValue : 0)}`;
  }
}

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
function normalizeUserPreference(input = {}, current = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const previous = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  const language = Object.prototype.hasOwnProperty.call(source, "language")
    ? canonicalizeLocale(source.language)
    : canonicalizeLocale(previous.language);
  const currencyCandidate = clean(
    Object.prototype.hasOwnProperty.call(source, "currency") ? source.currency : previous.currency,
    3
  ).toUpperCase();
  const timezoneCandidate = clean(
    Object.prototype.hasOwnProperty.call(source, "timezone") ? source.timezone : previous.timezone,
    80
  );
  let timezone = "";
  if (timezoneCandidate) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezoneCandidate }).format(new Date(0));
      timezone = timezoneCandidate;
    } catch (_error) {
      timezone = "";
    }
  }
  return {
    language,
    useDeviceLanguage: Object.prototype.hasOwnProperty.call(source, "useDeviceLanguage")
      ? source.useDeviceLanguage === true
      : previous.useDeviceLanguage !== false,
    currency: /^[A-Z]{3}$/.test(currencyCandidate) ? currencyCandidate : "",
    timezone,
    rowVersion: Math.max(0, Number.parseInt(source.rowVersion ?? previous.rowVersion, 10) || 0),
    updatedAt: clean(Object.prototype.hasOwnProperty.call(source, "updatedAt") ? source.updatedAt : previous.updatedAt, 40)
  };
}

function validateUserPreference(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Preference payload is invalid." };
  if (Object.prototype.hasOwnProperty.call(input, "language") && input.language && !canonicalizeLocale(input.language)) return { ok: false, error: "Language locale is invalid." };
  if (Object.prototype.hasOwnProperty.call(input, "useDeviceLanguage") && typeof input.useDeviceLanguage !== "boolean") return { ok: false, error: "Device language preference is invalid." };
  if (Object.prototype.hasOwnProperty.call(input, "currency") && input.currency && !/^[A-Za-z]{3}$/.test(String(input.currency))) return { ok: false, error: "Currency code is invalid." };
  if (Object.prototype.hasOwnProperty.call(input, "timezone") && input.timezone) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: String(input.timezone) }).format(new Date(0)); }
    catch (_error) { return { ok: false, error: "Timezone is invalid." }; }
  }
  if (Object.prototype.hasOwnProperty.call(input, "rowVersion") && (!Number.isInteger(Number(input.rowVersion)) || Number(input.rowVersion) < 0)) return { ok: false, error: "Preference version is invalid." };
  return { ok: true };
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
    currencyCode: /^[A-Z]{3}$/.test(requestedCurrency) ? requestedCurrency : "USD",
    currencySymbol: resolveCurrencySymbol(/^[A-Z]{3}$/.test(requestedCurrency) ? requestedCurrency : "USD", locale),
    timezone: clean(input.userPreference?.timezone || market.timezone || "UTC", 80),
    units: market.units || "metric",
    location,
    market: Object.freeze({ country: location.country, languages: market.languages || [languageCode], commerce: { payments: market.payments, delivery: ["local_delivery", "courier", "pickup"] }, discoveryPolicy: "local_priority_global_discovery" }),
    provenance: Object.freeze({ language: language.source, languageConfidence: language.confidence, location: location.source, locationConfidence: location.confidence }),
    preference: Object.freeze(normalizeUserPreference(input.userPreference || {})),
    privacy: Object.freeze({ precision: location.city ? "city" : location.region ? "region" : "country", storesCoordinates: false, analyticsMode: "aggregate" })
  });
}
function buildRequestGlobalContext(req = {}, options = {}) {
  return buildGlobalContext({ headers: req.headers || {}, browserLanguages: getHeader(req.headers, "accept-language"), userPreference: options.userPreference || {}, locationHint: options.locationHint || {} });
}
module.exports = { PLATFORM_VERSION, MARKET_PROFILES, buildGlobalContext, buildRequestGlobalContext, canonicalizeLocale, parseLanguageList, normalizeUserPreference, validateUserPreference, resolveCurrencySymbol, formatPrice };
