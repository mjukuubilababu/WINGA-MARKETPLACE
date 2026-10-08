const fs = require("node:fs");

function changed() {
  throw new Error("LOCAL_FILE_CHANGED");
}

async function readStableLocalFile(filename, { maxBytes, expectedSize } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) changed();
  const before = await fs.promises.lstat(filename);
  if (!before.isFile() || !Number.isSafeInteger(before.size) || before.size <= 0
    || before.size > maxBytes || (expectedSize !== undefined && before.size !== expectedSize)) changed();
  const handle = await fs.promises.open(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev
      || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs
      || opened.ctimeMs !== before.ctimeMs) changed();
    // Read only the checked descriptor and reject mutations before publishing its bytes.
    const bytes = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) changed();
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs
      || after.ctimeMs !== opened.ctimeMs) changed();
    return bytes;
  } finally {
    await handle.close();
  }
}

module.exports = { readStableLocalFile };
