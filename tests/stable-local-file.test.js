const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readStableLocalFile } = require("../backend/stable-local-file");

async function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "winga-stable-read-"));
  const filename = path.join(directory, "image.webp");
  fs.writeFileSync(filename, "public-image");
  try { await run(filename, directory); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test("stable descriptor reads preserve bytes and enforce size bounds", async () => {
  await fixture(async (filename, directory) => {
    assert.equal((await readStableLocalFile(filename, { maxBytes: 12, expectedSize: 12 })).toString(), "public-image");
    for (const options of [{ maxBytes: 11 }, { maxBytes: 12, expectedSize: 11 }, { maxBytes: Infinity }]) {
      await assert.rejects(readStableLocalFile(filename, options), /LOCAL_FILE_CHANGED/);
    }
    await assert.rejects(readStableLocalFile(directory, { maxBytes: 12 }), /LOCAL_FILE_CHANGED/);
    fs.writeFileSync(filename, "");
    await assert.rejects(readStableLocalFile(filename, { maxBytes: 12 }), /LOCAL_FILE_CHANGED/);
  });
});

test("same-size replacement between lstat and open is rejected and the descriptor closes", async (t) => {
  await fixture(async (filename, directory) => {
    const open = fs.promises.open;
    let closes = 0;
    t.mock.method(fs.promises, "open", async (target, flags) => {
      assert.equal(flags, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      fs.renameSync(filename, path.join(directory, "previous.webp"));
      fs.writeFileSync(filename, "private-data");
      const handle = await open(target, flags);
      const close = handle.close.bind(handle);
      handle.close = async () => { closes += 1; return close(); };
      return handle;
    });
    await assert.rejects(readStableLocalFile(filename, { maxBytes: 12 }), /LOCAL_FILE_CHANGED/);
    assert.equal(closes, 1);
  });
});

test("growth during a descriptor read is rejected without allocating the grown size", async (t) => {
  await fixture(async (filename) => {
    const open = fs.promises.open;
    let closes = 0;
    t.mock.method(fs.promises, "open", async (...args) => {
      const handle = await open(...args);
      const read = handle.read.bind(handle), close = handle.close.bind(handle);
      handle.read = async (...readArgs) => {
        assert.equal(readArgs[0].length, 12);
        const result = await read(...readArgs);
        fs.appendFileSync(filename, "-changed");
        return result;
      };
      handle.close = async () => { closes += 1; return close(); };
      return handle;
    });
    await assert.rejects(readStableLocalFile(filename, { maxBytes: 12 }), /LOCAL_FILE_CHANGED/);
    assert.equal(closes, 1);
  });
});
