const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadFactory() {
  const window = { WingaModules: { marketplace: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "marketplace", "decision-authority.js"), "utf8"), { window, Date });
  return window.WingaModules.marketplace.createDecisionAuthority;
}

test("Home decision authority accepts one complete candidate permutation", () => {
  const factory = loadFactory();
  const authority = factory({ rankHomeFeed: items => items.slice().reverse() });
  const products = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(authority.rankHomeFeed(products, { now: 1789495200000 }).map(item => item.id), ["c", "b", "a"]);
  assert.equal(authority.getLastDecision().fallback, false);
  assert.equal(authority.getLastDecision().policyVersion, "wip-frontend-decision-policy-v1");
});

test("invalid or failed Home intelligence degrades to a complete deterministic feed", () => {
  const factory = loadFactory();
  const products = [{ id: "a", createdAt: "2026-09-14" }, { id: "b", createdAt: "2026-09-15" }];
  const authority = factory({
    rankHomeFeed: () => [{ id: "unknown" }],
    deterministicFallback: items => items.slice().reverse()
  });
  assert.deepEqual(authority.rankHomeFeed(products, {}).map(item => item.id), ["b", "a"]);
  assert.equal(authority.getLastDecision().fallback, true);
  assert.ok(authority.getLastDecision().reasonCodes.includes("invalid_candidate_contract"));
});

test("Home decisions preserve intentional image-variant resurfacing", () => {
  const factory = loadFactory();
  const authority = factory({
    rankHomeFeed: items => [
      items[0],
      { ...items[0], feedVariantResurface: true, feedInitialImageIndex: 2 }
    ]
  });
  const ranked = authority.rankHomeFeed([{ id: "a" }, { id: "b" }], {});
  assert.equal(ranked.length, 2);
  assert.equal(ranked[1].feedInitialImageIndex, 2);
  assert.equal(authority.getLastDecision().fallback, false);
});

test("discovery decisions allow bounded subsets and preserve sponsored disclosure", () => {
  const factory = loadFactory();
  const authority = factory({ rankSurface: items => [{ ...items[1], sponsored: true }] });
  const ranked = authority.rankDiscoverySurface([{ id: "a" }, { id: "b" }], {});
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].id, "b");
  assert.equal(authority.getLastDecision().sponsoredCount, 1);
  assert.ok(authority.getLastDecision().reasonCodes.includes("sponsored_disclosure_preserved"));
});
