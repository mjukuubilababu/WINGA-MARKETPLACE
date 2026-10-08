const crypto = require('node:crypto');
const { failure } = require('./encrypted-content-contract');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const fields = ['action','deviceId','actorId','publicKey','fingerprint','requestId','issuedAt','signature'];
function keyBytes(value, size) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw failure(400,'crypto_device_invalid');
  const bytes = Buffer.from(value,'base64url');
  if (bytes.length !== size || bytes.toString('base64url') !== value) throw failure(400,'crypto_device_invalid');
  return bytes;
}
function operationBytes(context, value) {
  if (!value || Array.isArray(value) || Object.keys(value).length !== fields.length
    || fields.some(key => !Object.hasOwn(value,key)) || !['register','approve','revoke'].includes(value.action)
    || !uuid(value.deviceId) || !uuid(value.actorId) || !uuid(value.requestId)
    || !Number.isSafeInteger(value.issuedAt) || value.issuedAt < 0
    || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)) throw failure(400,'crypto_device_invalid');
  const publicKey = keyBytes(value.publicKey,32); keyBytes(value.signature,64);
  if (crypto.createHash('sha256').update(publicKey).digest('hex') !== value.fingerprint) throw failure(400,'crypto_device_invalid');
  return Buffer.from(JSON.stringify(['winga-crypto-device-operation',1,context.owner,context.deviceId,
    ...fields.filter(key=>key!=='signature').map(key=>value[key])]));
}
function createConversationCryptoDeviceStore({ withTransaction, now = Date.now }) {
  async function authenticate(client, context) {
    if (!context?.owner || !context.token || !context.deviceId) throw failure(401,'crypto_device_unauthorized');
    // Account row serializes enrollment and tombstones; session lock orders
    // these mutations against logout/account revocation in the same database.
    const found = await client.query(`SELECT s.session_id FROM sessions s JOIN users u ON u.username=s.username
      WHERE s.token=$1 AND s.username=$2 AND s.session_id=$3 AND s.expires_at>$4 AND u.status='active'
      FOR SHARE OF s FOR UPDATE OF u`,[context.token,context.owner,context.deviceId,now()]);
    if (!found.rows.length) throw failure(401,'crypto_device_unauthorized');
  }
  const view = row => ({id:row.id,owner:row.owner_id,publicKey:row.public_key,fingerprint:row.fingerprint,status:row.status});
  async function bindRegistration(client, context, payload, row) {
    if (!row || row.owner_id !== context.owner || row.public_key !== payload.publicKey
      || row.fingerprint !== payload.fingerprint || row.status === 'revoked') {
      throw failure(409,'crypto_device_identity_conflict');
    }
    await client.query(`INSERT INTO conversation_crypto_session_bindings(session_id,session_token,owner_id,crypto_device_id)
      VALUES($1,$2,$3,$4) ON CONFLICT(session_id) DO UPDATE
      SET session_token=EXCLUDED.session_token,owner_id=EXCLUDED.owner_id,crypto_device_id=EXCLUDED.crypto_device_id`,
    [context.deviceId,context.token,context.owner,row.id]);
  }
  async function readConversationCryptoDevices(context) {
    return withTransaction(async client => {
      await authenticate(client,context);
      return {version:1,devices:(await client.query('SELECT * FROM conversation_crypto_devices WHERE owner_id=$1 ORDER BY created_at,id LIMIT 32',[context.owner])).rows.map(view)};
    });
  }
  async function mutateConversationCryptoDevice(context, payload) {
    const signed = operationBytes(context || {},payload);
    const digest = crypto.createHash('sha256').update(signed).update(payload.signature).digest('hex');
    return withTransaction(async client => {
      // Native revocation and MLS transitions use the same lock before account locks.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('winga-encrypted-transport'))`);
      await authenticate(client,context);
      const cached=(await client.query('SELECT digest,result FROM conversation_crypto_operations WHERE owner_id=$1 AND request_id=$2',[context.owner,payload.requestId])).rows[0];
      if (cached) {
        if (cached.digest!==digest) throw failure(409,'crypto_device_operation_conflict');
        if (payload.action==='register') {
          const row=(await client.query('SELECT * FROM conversation_crypto_devices WHERE id=$1 FOR UPDATE',[payload.deviceId])).rows[0];
          await bindRegistration(client,context,payload,row);
        }
        return cached.result;
      }
      if (Math.abs(now()-payload.issuedAt)>30000) throw failure(401,'crypto_device_proof_expired');
      const target=(await client.query('SELECT * FROM conversation_crypto_devices WHERE id=$1 FOR UPDATE',[payload.deviceId])).rows[0];
      let actor;
      if (payload.action==='register') {
        if(payload.actorId!==payload.deviceId) throw failure(403,'crypto_device_proof_rejected');
        actor={public_key:payload.publicKey};
      } else {
        actor=(await client.query("SELECT * FROM conversation_crypto_devices WHERE id=$1 AND owner_id=$2 AND status='active' FOR UPDATE",[payload.actorId,context.owner])).rows[0];
        if (!actor || !target || target.owner_id!==context.owner || target.fingerprint!==payload.fingerprint
          || target.public_key!==payload.publicKey) throw failure(403,'crypto_device_proof_rejected');
      }
      const publicKey=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),keyBytes(actor.public_key,32)]),type:'spki',format:'der'});
      if(!crypto.verify(null,signed,publicKey,keyBytes(payload.signature,64))) throw failure(403,'crypto_device_proof_rejected');
      let row;
      if(payload.action==='register') {
        if(target) {
          if(target.owner_id!==context.owner || target.public_key!==payload.publicKey || target.status==='revoked') throw failure(409,'crypto_device_identity_conflict');
          row=target;
        } else {
          const previous=(await client.query('SELECT status,public_key FROM conversation_crypto_devices WHERE owner_id=$1',[context.owner])).rows;
          if(previous.some(device=>device.public_key===payload.publicKey)) throw failure(409,'crypto_device_identity_conflict');
          if(previous.length>=32) throw failure(409,'crypto_device_limit');
          if(previous.length && !previous.some(device=>device.status==='active')) throw failure(409,'crypto_identity_recovery_required');
          row=(await client.query(`INSERT INTO conversation_crypto_devices(id,owner_id,public_key,fingerprint,status)
            VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *`,[payload.deviceId,context.owner,payload.publicKey,payload.fingerprint,previous.length?'pending':'active'])).rows[0];
          if (!row) throw failure(409,'crypto_device_identity_conflict');
        }
      } else {
        if ((payload.action === 'approve' && target.status !== 'pending')
          || (payload.action === 'revoke' && target.status === 'revoked')) throw failure(409,'crypto_device_transition_rejected');
        row=(await client.query(`UPDATE conversation_crypto_devices SET status=$2,
          revoked_at=CASE WHEN $2='revoked' THEN NOW() ELSE NULL END WHERE id=$1 RETURNING *`,[payload.deviceId,payload.action==='approve'?'active':'revoked'])).rows[0];
      }
      if (payload.action==='register') await bindRegistration(client,context,payload,row);
      const result={version:1,device:view(row)};
      await client.query('INSERT INTO conversation_crypto_operations(owner_id,request_id,digest,result) VALUES($1,$2,$3,$4)',[context.owner,payload.requestId,digest,JSON.stringify(result)]);
      return result;
    });
  }
  return {readConversationCryptoDevices,mutateConversationCryptoDevice};
}
module.exports={createConversationCryptoDeviceStore,operationBytes};
