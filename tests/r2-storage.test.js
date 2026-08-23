const test = require("node:test");
const assert = require("node:assert/strict");
const { isR2StorageEnabled, readR2Config, uploadImageToR2 } = require("../backend/storage-r2");

const completeEnv = {
  R2_ACCOUNT_ID: "account-123",
  R2_ACCESS_KEY_ID: "access-key",
  R2_SECRET_ACCESS_KEY: "secret-key",
  R2_BUCKET_NAME: "winga-product-images",
  R2_PUBLIC_URL_BASE: "https://media.wingamarket.com/"
};

test("R2 image storage stays disabled without R2_ACCOUNT_ID", () => {
  assert.equal(isR2StorageEnabled({}), false);
  assert.equal(readR2Config({}), null);
});

test("R2 image upload sends immutable image metadata and returns its public URL", async () => {
  let commandInput = null;
  const client = {
    async send(command) {
      commandInput = command.input;
      return { ETag: "test-etag" };
    }
  };

  const body = Buffer.from("test-image");
  const url = await uploadImageToR2(body, "products/test image.jpg", {
    env: completeEnv,
    client,
    contentType: "image/jpeg"
  });

  assert.equal(url, "https://media.wingamarket.com/products/test%20image.jpg");
  assert.equal(commandInput.Bucket, "winga-product-images");
  assert.equal(commandInput.Key, "products/test image.jpg");
  assert.equal(commandInput.Body, body);
  assert.equal(commandInput.ContentType, "image/jpeg");
  assert.equal(commandInput.CacheControl, "public, max-age=31536000, immutable");
});

test("R2 image storage rejects incomplete enabled configuration", async () => {
  assert.throws(
    () => readR2Config({ R2_ACCOUNT_ID: "account-123" }),
    /R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY.*R2_BUCKET_NAME.*R2_PUBLIC_URL_BASE/
  );
  await assert.rejects(
    uploadImageToR2(Buffer.from("image"), "products/test.jpg", {
      env: { R2_ACCOUNT_ID: "account-123" },
      client: { send: async () => ({}) }
    }),
    /missing configuration/
  );
});
