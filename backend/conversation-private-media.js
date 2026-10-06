const crypto = require('node:crypto');
const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { assertPrivateBucket } = require('./backup-legacy-private-media');
const { failure } = require('./encrypted-content-contract');
const MAX_BYTES = 8 * 1024 * 1024 + 4136;
const magic = Buffer.from('WINGAEM2');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
function readPrivateMediaConfig(env = process.env) {
  const config = {
    accountId: String(env.R2_ACCOUNT_ID || '').trim(), publicBucket: String(env.R2_BUCKET_NAME || '').trim(),
    bucket: String(env.R2_CONVERSATION_BUCKET_NAME || '').trim(),
    accessKeyId: String(env.R2_CONVERSATION_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: String(env.R2_CONVERSATION_SECRET_ACCESS_KEY || '').trim(),
    apiToken: String(env.R2_CONVERSATION_API_TOKEN || '').trim()
  };
  if (Object.values(config).some(value => !value) || !/^[a-f0-9]{32}$/.test(config.accountId)
    || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket) || config.bucket === config.publicBucket
    || (env.R2_BACKUP_BUCKET_NAME && config.bucket === String(env.R2_BACKUP_BUCKET_NAME).trim())
    || env.R2_CONVERSATION_ISOLATION_CONFIRMED !== 'true') throw failure(503, 'private_media_configuration_required');
  return config;
}
function validateObject(object) {
  if (!object || Object.keys(object).length !== 3 || !['id', 'bytes', 'sha256'].every(key => Object.hasOwn(object, key))
    || !uuid(object.id) || !Number.isSafeInteger(object.bytes) || object.bytes < 40 || object.bytes > MAX_BYTES
    || typeof object.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(object.sha256)) throw failure(400, 'private_media_invalid');
  return `conversation-encrypted/v1/${object.id}/${object.sha256}.bin`;
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function createPrivateMediaStorage({ env = process.env, client, authorize, fetchImpl = globalThis.fetch,
  privacyCheck = assertPrivateBucket, timeoutMs = 30000, purpose = 'conversation' } = {}) {
  const config = readPrivateMediaConfig(env);
  if (typeof authorize !== 'function' || typeof privacyCheck !== 'function' || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > 30000 || !['conversation','report-evidence'].includes(purpose)) throw failure(503, 'private_media_unavailable');
  // A trusted constructor selects the namespace, never a caller-supplied object key.
  const objectKey = object => {
    const key = validateObject(object);
    return purpose === 'report-evidence' ? key.replace('conversation-encrypted/v1/', 'report-evidence/v1/') : key;
  };
  const ownedClient = !client;
  client ||= new S3Client({ region: 'auto', endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 2 });
  const allowed = async (context, object, action) => {
    if (await authorize(context, object, action) !== true) throw failure(403, 'private_media_access_rejected');
  };
  const privateBucket = async () => {
    try { await privacyCheck(config, fetchImpl); }
    catch { throw failure(503, 'private_media_privacy_unverified'); }
  };
  async function readObject(key, object) {
    const controller = new AbortController(); let response, timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); response?.Body?.destroy?.(); reject(failure(503, 'private_media_unavailable')); }, timeoutMs);
      });
      return await Promise.race([timeout, (async () => {
        response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: controller.signal });
        if (!response.Body?.[Symbol.asyncIterator] || response.ContentLength !== object.bytes
          || response.ContentType !== 'application/octet-stream' || response.Metadata?.sha256 !== object.sha256) throw failure(503, 'private_media_integrity_rejected');
        const chunks = []; let size = 0;
        for await (const chunk of response.Body) {
          const bytes = Buffer.from(chunk); size += bytes.length;
          if (size > object.bytes) throw failure(503, 'private_media_integrity_rejected');
          chunks.push(bytes);
        }
        const bytes = Buffer.concat(chunks);
        if (size !== object.bytes || hash(bytes) !== object.sha256 || !bytes.subarray(0, magic.length).equals(magic)) throw failure(503, 'private_media_integrity_rejected');
        return bytes;
      })()]);
    } finally { clearTimeout(timer); controller.abort(); response?.Body?.destroy?.(); }
  }
  async function put(context, object, input) {
    context = Object.freeze({ ...context }); object = Object.freeze({ ...object });
    const key = objectKey(object);
    if (!(input instanceof Uint8Array) || input.byteLength !== object.bytes) throw failure(400, 'private_media_invalid');
    // Copy before any await: the caller must not change the bytes after validation.
    const bytes = Buffer.from(input);
    if (!bytes.subarray(0, magic.length).equals(magic) || hash(bytes) !== object.sha256) throw failure(400, 'private_media_invalid');
    await allowed(context, object, 'upload'); await privateBucket(); await allowed(context, object, 'upload');
    try {
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes,
        ContentType: 'application/octet-stream', CacheControl: 'private, no-store',
        IfNoneMatch: '*', Metadata: { sha256: object.sha256 } }), { abortSignal: AbortSignal.timeout(timeoutMs) });
    } catch (error) { if (error?.$metadata?.httpStatusCode !== 412) throw failure(503, 'private_media_unavailable'); }
    let stored;
    try { stored = await readObject(key, object); }
    catch (error) { throw failure(503, error?.code === 'private_media_integrity_rejected' ? error.code : 'private_media_unavailable'); }
    if (!stored.equals(bytes)) throw failure(503, 'private_media_integrity_rejected');
    await allowed(context, object, 'upload'); await privateBucket();
    return { ...object };
  }
  async function get(context, object) {
    context = Object.freeze({ ...context }); object = Object.freeze({ ...object });
    const key = objectKey(object);
    await allowed(context, object, 'download'); await privateBucket(); await allowed(context, object, 'download');
    let bytes;
    try {
      bytes = await readObject(key, object);
      await allowed(context, object, 'download'); await privateBucket();
      return bytes;
    } catch (error) {
      bytes?.fill(0);
      if (error?.code === 'private_media_access_rejected' || error?.code === 'private_media_privacy_unverified'
        || error?.code === 'private_media_integrity_rejected') throw error;
      throw failure(503, 'private_media_unavailable');
    }
  }
  async function remove(context,object) {
    context=Object.freeze({...context});object=Object.freeze({...object});const key=objectKey(object);
    await allowed(context,object,'cleanup');await privateBucket();await allowed(context,object,'cleanup');
    try {await client.send(new DeleteObjectCommand({Bucket:config.bucket,Key:key}),{abortSignal:AbortSignal.timeout(timeoutMs)});}
    catch {throw failure(503,'private_media_unavailable');}
  }
  return { put, get, remove, close: () => { if (ownedClient) client.destroy(); } };
}
module.exports = { createPrivateMediaStorage, readPrivateMediaConfig, validateObject, MAX_BYTES };
