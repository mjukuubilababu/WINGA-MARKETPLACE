const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.resolve(__dirname, "../scripts/build-vercel-static.js");
const source = fs.readFileSync(scriptPath, "utf8");
const mainOffset = source.lastIndexOf("\nmain()");
assert.ok(mainOffset > 0, "The test harness must exclude the build entry point");

const invalidIds = [
  "../../escape", "../escape", "..\\..\\escape",
  "/absolute", "C:\\absolute", "C:/absolute", "C:relative", "\\\\server\\share",
  "part/child", "part\\child", ".", "..", "", "   ",
  "%2e%2e%2fescape", "id?query", "id#fragment", "id\u0000", "id\nchild",
  "CON", "nul", "COM1", "lpt9", "a".repeat(101)
];
const validIds = [
  "mock-product-1", "product_123", "Product-123_test",
  "550e8400-e29b-41d4-a716-446655440000", "123", "a".repeat(100)
];

function loadBuildHelpers(payload = [], wrangler = null) {
  const writes = [];
  const directories = [];
  const filesystem = {
    mkdirSync(target) { directories.push(target); },
    writeFileSync(target, contents, encoding) { writes.push({ target, contents, encoding }); },
    existsSync(target) { return wrangler !== null && path.basename(target) === "wrangler.toml"; },
    readFileSync() { return wrangler; }
  };
  const context = vm.createContext({
    __dirname: path.dirname(scriptPath),
    require(name) { return name === "fs" ? filesystem : require(name); },
    process: { env: { WINGA_ASSET_VERSION: "20261009150025" } },
    console,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async () => ({ ok: true, json: async () => payload })
  });
  vm.runInContext(source.slice(0, mainOffset), context, { filename: scriptPath });
  assert.equal(writes.length, 0, "Loading helpers must not start a build");
  assert.equal(directories.length, 0);
  return { context, writes, directories };
}

test("product normalization rejects unsafe path segments", () => {
  const { context } = loadBuildHelpers();
  for (const id of invalidIds) {
    assert.equal(context.normalizeProductPathId(id), "", JSON.stringify(id));
    assert.equal(context.normalizeProductList([{ id }]).length, 0, JSON.stringify(id));
  }
});

test("worker version aliases advance together without changing other vars or environments", () => {
  for (const bindings of ['', 'WINGA_BUILD_VERSION = "old"\n', 'BUILD_VERSION = "stale"\nWINGA_BUILD_VERSION = "old"\n']) {
    const input = `[vars]\nORIGIN = "https://synthetic.invalid"\nCUSTOM = "preserve"\n${bindings}\n[env.preview.vars]\nBUILD_VERSION = "preview"\n`;
    const { context, writes } = loadBuildHelpers([], input);
    context.syncWorkerBuildVersionConfig();
    assert.equal(writes.length, 1);
    const expected = '[env.preview.vars]\nBUILD_VERSION = "preview"\n';
    const [vars, preview] = writes[0].contents.split('[env.preview.vars]');
    assert.match(vars, /^BUILD_VERSION = "20261009150025"$/m);
    assert.match(vars, /^WINGA_BUILD_VERSION = "20261009150025"$/m);
    assert.ok(vars.includes('CUSTOM = "preserve"'));
    assert.ok(vars.includes('ORIGIN = "https://synthetic.invalid"'));
    assert.equal('[env.preview.vars]' + preview, expected);
  }
});

test("worker version synchronization also handles vars at end of file", () => {
  const { context, writes } = loadBuildHelpers([], '[vars]\nBUILD_VERSION = "old"');
  context.syncWorkerBuildVersionConfig();
  assert.match(writes[0].contents, /^BUILD_VERSION = "20261009150025"$/m);
  assert.match(writes[0].contents, /^WINGA_BUILD_VERSION = "20261009150025"$/m);
});

test("ordinary product IDs retain their identity and list deduplication", () => {
  const { context } = loadBuildHelpers();
  const products = validIds.map(id => ({ id }));
  const normalized = context.normalizeProductList([...products, { id: " mock-product-1 " }, null]);
  assert.deepEqual(Array.from(normalized, product => product.id), validIds);
  products.forEach((product, index) => assert.equal(normalized[index], product));
  validIds.forEach(id => assert.equal(context.normalizeProductPathId(id), id));
  assert.equal(context.normalizeProductPathId(" product_123 "), "product_123");
});

test("remote prerender products cannot write outside either product tree", async () => {
  const products = [...invalidIds, ...validIds].map(id => ({ id, name: "Synthetic product" }));
  const { context, writes, directories } = loadBuildHelpers({ items: products });
  const images = await context.generateProductSharePages("", "https://synthetic.invalid");
  assert.equal(images.length, 0);
  assert.equal(writes.length, validIds.length * 2);
  assert.equal(directories.length, writes.length);
  const outputDir = path.resolve(__dirname, "../public");
  const expected = validIds.flatMap(id => [
    path.join(outputDir, "product", id, "index.html"),
    path.join(outputDir, "api", "product", id, "index.html")
  ]);
  assert.deepEqual(writes.map(write => write.target), expected);
  for (const write of writes) {
    assert.equal(write.encoding, "utf8");
    for (const api of [path.posix, path.win32]) {
      const portableRoot = outputDir.split(path.sep).join(api.sep);
      const portableTarget = write.target.split(path.sep).join(api.sep);
      const relative = api.relative(portableRoot, portableTarget);
      assert.ok(!relative.startsWith("..") && !api.isAbsolute(relative), write.target);
    }
  }
});

test("write boundary revalidates IDs even if normalization is bypassed", async () => {
  const { context, writes, directories } = loadBuildHelpers();
  context.loadProductsForPrerender = async () => invalidIds.map(id => ({ id }));
  await context.generateProductSharePages("", "https://synthetic.invalid");
  assert.equal(writes.length, 0);
  assert.equal(directories.length, 0);
});

test("valid share pages preserve HTML escaping and trimmed product paths", async () => {
  const { context, writes } = loadBuildHelpers([
    { id: " product_123 ", name: "Safe title", description: "Safe description", image: 'https://synthetic.invalid/image.png?x="<tag>&' }
  ]);
  await context.generateProductSharePages("", "https://synthetic.invalid");
  assert.equal(writes.length, 2);
  assert.ok(writes.every(write => write.target.endsWith(path.join("product_123", "index.html"))));
  for (const { contents } of writes) {
    assert.ok(contents.includes('content="https://synthetic.invalid/image.png?x=&quot;&lt;tag&gt;&amp;"'));
    assert.ok(contents.includes('href="https://synthetic.invalid/product/product_123"'));
    assert.ok(!contents.includes('x="<tag>'));
  }
});
