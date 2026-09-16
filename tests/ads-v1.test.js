const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CAMPAIGN_STATUSES, PLACEMENTS, canTransition, deriveApprovedStatus,
  normalizeEventType, quoteAd, validateDestination
} = require("../backend/ads-domain");
const adsMigration = require("../backend/migrations/ads-v1");

test("Ads V1 quote is authoritative, deterministic, and supports configured durations", () => {
  const now = new Date("2026-09-16T10:00:00.000Z");
  const quote = quoteAd({ placementCode: "HOME_FEED_SPONSORED", durationDays: 7 }, now);
  assert.equal(quote.ok, true);
  assert.equal(quote.amount, 7000);
  assert.equal(quote.currency, "TZS");
  assert.equal(quote.startsAt, now.toISOString());
  assert.equal(quote.endsAt, "2026-09-23T10:00:00.000Z");
  assert.equal(quoteAd({ placementCode: "UNKNOWN", durationDays: 7 }, now).code, "invalid_placement");
  assert.equal(quoteAd({ placementCode: "HOME_FEED_SPONSORED", durationDays: 2 }, now).code, "invalid_duration");
  assert.deepEqual(Object.keys(PLACEMENTS), ["HOME_FEED_SPONSORED", "SEARCH_SPONSORED"]);
});

test("Ads V1 campaign state machine prevents invalid lifecycle jumps", () => {
  assert.equal(canTransition("DRAFT", "PENDING_PAYMENT"), true);
  assert.equal(canTransition("PENDING_PAYMENT", "PENDING_REVIEW"), true);
  assert.equal(canTransition("PENDING_REVIEW", "APPROVED"), true);
  assert.equal(canTransition("ACTIVE", "EXPIRED"), true);
  assert.equal(canTransition("REJECTED", "ACTIVE"), false);
  assert.equal(canTransition("PENDING_PAYMENT", "ACTIVE"), false);
  assert.equal(CAMPAIGN_STATUSES.includes("SCHEDULED"), true);
  assert.equal(deriveApprovedStatus("2026-09-16T09:00:00.000Z", new Date("2026-09-16T10:00:00.000Z")), "ACTIVE");
  assert.equal(deriveApprovedStatus("2026-09-17T09:00:00.000Z", new Date("2026-09-16T10:00:00.000Z")), "SCHEDULED");
});

test("Ads V1 validates destinations and view events", () => {
  assert.equal(validateDestination("product-123"), true);
  assert.equal(validateDestination("https://wingamarket.com/product/123"), true);
  assert.equal(validateDestination("javascript:alert(1)"), false);
  assert.equal(normalizeEventType("impression"), "IMPRESSION");
  assert.equal(normalizeEventType("click"), "CLICK");
  assert.equal(normalizeEventType("conversion"), "");
});

test("Ads V1 migration creates relational state, inventory, payments, reviews, and append events", () => {
  assert.equal(adsMigration.id, "2026091601_ads_v1");
  const sql = adsMigration.statements.join("\n");
  ["ad_accounts","ad_placements","ad_creatives","ad_campaigns","ad_bookings",
    "ad_payment_references","ad_reviews","ad_events","ad_campaign_metrics"].forEach((table) => {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  });
  assert.match(sql, /PENDING_PAYMENT/);
  assert.match(sql, /transaction_reference TEXT NOT NULL UNIQUE/);
  assert.match(sql, /dedupe_key TEXT NOT NULL UNIQUE/);
  assert.match(sql, /CHECK \(ends_at > starts_at\)/);
});

test("Ads V1 frontend measures only viewable sponsored cards and exposes reports", () => {
  const fs = require("node:fs");
  const ui = fs.readFileSync(require.resolve("../src/marketplace/ui.js"), "utf8");
  const feed = fs.readFileSync(require.resolve("../src/marketplace/feed-modules.js"), "utf8");
  const client = fs.readFileSync(require.resolve("../src/api/commerce-client.js"), "utf8");
  assert.match(feed, /adCampaignId/);
  assert.match(ui, /intersectionRatio < 0\.5/);
  assert.match(ui, /viewableMs: 1000/);
  assert.match(ui, /eventType: "CLICK"/);
  assert.match(client, /async function loadAdCampaignReport/);
  assert.match(client, /tracking_failed_open/);
});
