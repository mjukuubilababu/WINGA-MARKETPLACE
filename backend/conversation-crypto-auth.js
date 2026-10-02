const crypto = require('node:crypto');
const { failure } = require('./encrypted-content-contract');
async function authenticateCryptoSession(client, context, now = Date.now()) {
  if (!context?.owner || !context.token || !context.deviceId) throw failure(401, 'crypto_device_unauthorized');
  const result = await client.query(`SELECT s.session_id FROM sessions s JOIN users u ON u.username=s.username
    WHERE s.token=$1 AND s.username=$2 AND s.session_id=$3 AND s.expires_at>$4 AND u.status='active'
    FOR SHARE OF s FOR UPDATE OF u`, [context.token, context.owner, context.deviceId, now]);
  if (!result.rows.length) throw failure(401, 'crypto_device_unauthorized');
}
function verifyDeviceSignature(publicKey, bytes, signature) {
  const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from(publicKey, 'base64url')]), type: 'spki', format: 'der' });
  return crypto.verify(null, bytes, key, Buffer.from(signature, 'base64url'));
}
module.exports = { authenticateCryptoSession, verifyDeviceSignature };
