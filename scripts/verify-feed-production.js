const assert = require("node:assert/strict");

const ORIGIN = String(process.env.WINGA_PRODUCTION_ORIGIN || "https://wingamarket.com").replace(/\/$/, "");
const PAGE_LIMIT = 12;

async function fetchChecked(pathname) {
  const response = await fetch(`${ORIGIN}${pathname}`, {
    headers: { accept: pathname.startsWith("/api/") ? "application/json" : "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(30000)
  });
  assert.equal(response.ok, true, `${pathname} returned ${response.status}`);
  return response;
}

function productTuple(product) {
  const timestamp = Date.parse(product?.createdAt || "");
  return [Number.isFinite(timestamp) ? timestamp : 0, String(product?.id || "")];
}

function assertStableDescending(products) {
  for (let index = 1; index < products.length; index += 1) {
    const previous = productTuple(products[index - 1]);
    const current = productTuple(products[index]);
    const descends = previous[0] > current[0]
      || (previous[0] === current[0] && previous[1].localeCompare(current[1]) >= 0);
    assert.equal(descends, true, `Unstable product ordering at index ${index}`);
  }
}

async function main() {
  const homeResponse = await fetchChecked("/");
  const homeHtml = await homeResponse.text();
  assert.match(String(homeResponse.headers.get("server") || "").toLowerCase(), /cloudflare/, "Home is not served by Cloudflare Worker");
  assert.equal(Boolean(homeResponse.headers.get("cf-ray")), true, "Cloudflare request identity is missing");
  assert.equal(Boolean(homeResponse.headers.get("x-vercel-id")), false, "Production domain bypassed the frontend Worker");

  const versionResponse = await fetchChecked("/build-version.json");
  const build = await versionResponse.json();
  assert.match(String(build?.version || ""), /^\d{14}$/, "Build version is invalid");
  assert.equal(homeHtml.includes(`content="${build.version}"`), true, "HTML and build-version.json do not match");

  const pageOneResponse = await fetchChecked(`/api/products?limit=${PAGE_LIMIT}&page=1`);
  const pageOne = await pageOneResponse.json();
  assert.equal(Array.isArray(pageOne?.items), true, "Page one items contract is invalid");
  assert.equal(pageOne.items.length <= PAGE_LIMIT, true, "Page one exceeded its bounded limit");
  assert.equal(typeof pageOne.hasMore, "boolean", "Page one hasMore is missing");
  assert.equal(typeof pageOne.nextCursor, "string", "Page one nextCursor is missing");
  assertStableDescending(pageOne.items);

  let pageTwo = null;
  if (pageOne.hasMore) {
    assert.equal(Boolean(pageOne.nextCursor), true, "hasMore=true without nextCursor");
    const path = `/api/products?limit=${PAGE_LIMIT}&page=2&cursor=${encodeURIComponent(pageOne.nextCursor)}`;
    const pageTwoResponse = await fetchChecked(path);
    pageTwo = await pageTwoResponse.json();
    assert.equal(Array.isArray(pageTwo?.items), true, "Page two items contract is invalid");
    assert.equal(pageTwo.items.length <= PAGE_LIMIT, true, "Page two exceeded its bounded limit");
    assert.equal(typeof pageTwo.hasMore, "boolean", "Page two hasMore is missing");
    assert.equal(typeof pageTwo.nextCursor, "string", "Page two nextCursor is missing");
    assert.notEqual(pageTwo.nextCursor, pageOne.nextCursor, "Cursor did not progress");
    const combined = [...pageOne.items, ...pageTwo.items];
    const ids = combined.map((product) => String(product?.id || ""));
    assert.equal(ids.every(Boolean), true, "A product has no stable id");
    assert.equal(new Set(ids).size, ids.length, "Product identity repeated across cursor pages");
    assertStableDescending(combined);
  }

  console.log(JSON.stringify({
    ok: true,
    origin: ORIGIN,
    buildVersion: build.version,
    worker: "cloudflare",
    pageOneItems: pageOne.items.length,
    pageTwoItems: pageTwo?.items?.length || 0,
    cursorProgressed: pageOne.hasMore ? pageTwo.nextCursor !== pageOne.nextCursor : true,
    duplicateIds: 0,
    stableOrdering: true
  }, null, 2));
}

main().catch((error) => {
  console.error(`Feed production verification failed: ${error.message}`);
  process.exitCode = 1;
});