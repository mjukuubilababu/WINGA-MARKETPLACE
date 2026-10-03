const crypto = require('node:crypto');
const { failure } = require('./encrypted-content-contract');
const { authenticateCryptoSession, verifyDeviceSignature } = require('./conversation-crypto-auth');
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const assert = (v, status = 400, code = 'encrypted_operation_invalid') => { if (!v) throw failure(status, code); };
function operationBytes(context, operation) {
  return Buffer.from(JSON.stringify(['winga-crypto-transport', 1, context.owner, context.deviceId,
    operation.action, operation.actorId, operation.requestId, operation.issuedAt, digest(JSON.stringify(operation.payload,Object.keys(operation.payload).sort()))]));
}
function createEncryptedConversationStore({ withTransaction, now = Date.now, enqueuePush = async()=>{} }) {
  async function authorize(client, context, operation) {
    await authenticateCryptoSession(client, context, now());
    assert(operation && uuid(operation.actorId) && uuid(operation.requestId) && Number.isSafeInteger(operation.issuedAt)
      && Math.abs(now() - operation.issuedAt) <= 30000 && operation.payload && typeof operation.payload === 'object', 401, 'encrypted_proof_expired');
    const device = (await client.query(`SELECT * FROM conversation_crypto_devices WHERE id=$1 AND owner_id=$2 AND status='active' FOR SHARE`,
      [operation.actorId, context.owner])).rows[0];
    assert(device && verifyDeviceSignature(device.public_key, operationBytes(context, operation), operation.signature), 403, 'encrypted_proof_rejected');
    return device;
  }
  async function access(client, group, actor, owner) {
    assert(group && ((group.creator === owner && group.creator_device === actor) || (group.recipient === owner && group.recipient_device === actor)), 403, 'encrypted_membership_required');
    const devices = await client.query(`SELECT id FROM conversation_crypto_devices WHERE id=ANY($1::text[]) AND status='active'`, [[group.creator_device, group.recipient_device]]);
    const users = await client.query(`SELECT username FROM users WHERE username=ANY($1::text[]) AND status='active'`, [[group.creator, group.recipient]]);
    const blocked = await client.query(`SELECT 1 FROM user_blocks WHERE (blocker_username=$1 AND blocked_username=$2) OR (blocker_username=$2 AND blocked_username=$1)`, [group.creator, group.recipient]);
    assert(devices.rows.length === 2 && users.rows.length === 2 && !blocked.rows.length, 403, 'encrypted_access_denied');
  }
  async function packages(client, hashes) {
    return (await client.query(`SELECT p.*,d.owner_id,d.public_key,d.fingerprint FROM conversation_crypto_key_packages p
      JOIN conversation_crypto_devices d ON d.id=p.device_id WHERE p.hash=ANY($1::text[]) ORDER BY p.hash`, [hashes])).rows.map(p => ({
      hash: p.hash, deviceId: p.device_id, owner: p.owner_id, publicKey: p.public_key, fingerprint: p.fingerprint,
      keyPackage: p.package, mlsPublicKey: p.mls_public_key, identityProof: p.identity_proof }));
  }
  async function encryptedOperation(context, op) {
    assert(['directory','reserve','transfer','accept','send','receipt','receipt-ack','reject','poll'].includes(op?.action));
    const p = op.payload;
    assert(p && Buffer.byteLength(JSON.stringify(op)) <= 262144);
    const fields={directory:['peer'],reserve:['conversationId','peer','sourceHash','targetHash'],
      transfer:['id','conversationId','epoch','packageHash','commit','welcome','tree'],accept:['conversationId','transferId'],
      send:['id','conversationId','epoch','deviceId','ciphertext','hash'],receipt:['id','conversationId','epoch','hash','kind'],
      'receipt-ack':['id','conversationId','epoch','hash','kind'],poll:[]};
    fields.reject=['id','conversationId','epoch','hash','reason'];
    assert(!Array.isArray(p) && Object.keys(p).sort().join(',')===fields[op.action].sort().join(','));
    assert(Object.keys(op).sort().join(',')==='action,actorId,issuedAt,payload,requestId,signature');
    return withTransaction(async client => {
      // Serialize membership and message writes before authentication's user lock.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('winga-encrypted-transport'))`);
      await authorize(client, context, op);
      if (op.action === 'directory') {
        assert(typeof p.peer === 'string' && p.peer !== context.owner);
        const allowed = (await client.query(`SELECT username FROM users WHERE username=$1 AND status='active'
          AND NOT EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_username=$1 AND blocked_username=$2) OR (blocker_username=$2 AND blocked_username=$1))`, [p.peer, context.owner])).rows.length;
        assert(allowed, 403, 'encrypted_access_denied');
        const rows = await client.query(`SELECT p.hash FROM conversation_crypto_key_packages p JOIN conversation_crypto_devices d ON d.id=p.device_id
          WHERE d.owner_id=$1 AND d.status='active' AND p.consumed_at IS NULL AND p.expires_at>NOW() ORDER BY p.published_at DESC LIMIT 20`, [p.peer]);
        return { version: 1, packages: await packages(client, rows.rows.map(r => r.hash)) };
      }
      if (op.action === 'reserve') {
        assert(uuid(p.conversationId) && typeof p.peer === 'string' && p.peer !== context.owner);
        const cid = (await client.query('SELECT winga_ensure_conversation($1,$2) AS id', [context.owner,p.peer])).rows[0].id;
        const prior = (await client.query('SELECT * FROM encrypted_conversations WHERE canonical_id=$1 FOR UPDATE',[cid])).rows[0];
        if (prior) {
          await access(client, prior, op.actorId, context.owner);
          assert(prior.id === p.conversationId && prior.source_hash === p.sourceHash && prior.target_hash === p.targetHash,409,'encrypted_group_exists');
          return { version:1, group:prior };
        }
        const rows = (await client.query(`SELECT p.*,d.owner_id FROM conversation_crypto_key_packages p JOIN conversation_crypto_devices d ON d.id=p.device_id
          WHERE p.hash=ANY($1::text[]) AND p.consumed_at IS NULL AND p.expires_at>NOW() AND d.status='active' ORDER BY p.hash FOR UPDATE OF p`, [[p.sourceHash,p.targetHash]])).rows;
        const source=rows.find(r=>r.hash===p.sourceHash),target=rows.find(r=>r.hash===p.targetHash);
        assert(source?.device_id===op.actorId && source.owner_id===context.owner && target?.owner_id===p.peer,409,'encrypted_package_unavailable');
        const group={ id:p.conversationId,creator:context.owner,recipient:p.peer,creator_device:source.device_id,recipient_device:target.device_id };
        await access(client,group,op.actorId,context.owner);
        await client.query(`INSERT INTO encrypted_conversations(id,canonical_id,creator,recipient,creator_device,recipient_device,source_hash,target_hash,status)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,'reserved')`,[group.id,cid,group.creator,group.recipient,group.creator_device,group.recipient_device,p.sourceHash,p.targetHash]);
        await client.query('UPDATE conversation_crypto_key_packages SET consumed_by=$1,consumed_at=NOW() WHERE hash=ANY($2::text[])',[cid,[p.sourceHash,p.targetHash]]);
        return {version:1,group:{...group,status:'reserved'}};
      }
      if (op.action === 'poll') {
        const groups=(await client.query(`SELECT * FROM encrypted_conversations WHERE creator_device=$1 OR recipient_device=$1 ORDER BY created_at LIMIT 100`,[op.actorId])).rows;
        const result=[];
        for(const g of groups) {
          try { await access(client,g,op.actorId,context.owner); } catch(error) { if(error.status===403) { result.push({id:g.id,status:'blocked'});continue; } throw error; }
          const messages=(await client.query(`SELECT m.* FROM encrypted_conversation_messages m WHERE m.conversation_id=$1 AND m.sender_device<>$2
            AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_receipts r WHERE r.message_id=m.id AND r.device_id=$2 AND r.kind='delivered')
            AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_rejections r WHERE r.message_id=m.id AND r.device_id=$2) ORDER BY m.sequence LIMIT 100`,[g.id,op.actorId])).rows;
          const receipts=(await client.query(`SELECT r.proof FROM encrypted_conversation_receipts r JOIN encrypted_conversation_messages m ON m.id=r.message_id
            WHERE m.conversation_id=$1 AND m.sender_device=$2 AND r.sender_ack_at IS NULL ORDER BY m.sequence LIMIT 100`,[g.id,op.actorId])).rows.map(r=>r.proof);
          result.push({...g,packages:await packages(client,[g.source_hash,g.target_hash]),messages,receipts});
        }
        return {version:1,groups:result};
      }
      assert(uuid(p.conversationId));
      const g=(await client.query('SELECT * FROM encrypted_conversations WHERE id=$1 FOR UPDATE',[p.conversationId])).rows[0];
      await access(client,g,op.actorId,context.owner);
      if(op.action==='transfer') {
        assert(g.creator_device===op.actorId && p.packageHash===g.target_hash && p.epoch==='1' && uuid(p.id),403,'encrypted_membership_required');
        for(const key of ['commit','welcome','tree']) assert(typeof p[key]==='string' && /^[A-Za-z0-9_-]+$/.test(p[key]) && p[key].length<=90000);
        const h=digest(JSON.stringify(p,Object.keys(p).sort()));
        if(g.transfer_hash) assert(g.transfer_hash===h,409,'encrypted_transfer_conflict');
        else await client.query(`UPDATE encrypted_conversations SET transfer=$2,transfer_hash=$3,transfer_proof=$4,status='pending' WHERE id=$1`,[g.id,JSON.stringify(p),h,JSON.stringify({owner:context.owner,sessionId:context.deviceId,...op})]);
        return {version:1,id:p.id,status:g.status==='active'?'active':'pending'};
      }
      if(op.action==='accept') {
        assert(g.recipient_device===op.actorId && g.transfer?.id===p.transferId,403,'encrypted_membership_required');
        await client.query(`UPDATE conversation_event_streams SET security_mode='encrypted' WHERE id=$1`,[g.canonical_id]);
        await client.query(`UPDATE encrypted_conversations SET status='active',acceptance=COALESCE(acceptance,$2::jsonb) WHERE id=$1`,[g.id,JSON.stringify({owner:context.owner,sessionId:context.deviceId,...op})]);
        return {version:1,status:'active'};
      }
      assert(g.status==='active',409,'encrypted_membership_pending');
      if(op.action==='send') {
        assert(uuid(p.id) && p.deviceId===op.actorId && p.epoch===g.epoch && typeof p.ciphertext==='string' && /^[A-Za-z0-9_-]+$/.test(p.ciphertext));
        const bytes=Buffer.from(p.ciphertext,'base64url');
        assert(bytes.length<=65536 && bytes.toString('base64url')===p.ciphertext && digest(bytes)===p.hash);
        const {decodeMlsMessage}=await import('ts-mls');
        const parsed=decodeMlsMessage(bytes,0);
        assert(parsed && parsed[1]===bytes.length && parsed[0].wireformat==='mls_private_message'
          && Buffer.from(parsed[0].privateMessage.groupId).toString('utf8')===g.id && String(parsed[0].privateMessage.epoch)===g.epoch);
        const prior=(await client.query('SELECT * FROM encrypted_conversation_messages WHERE id=$1',[p.id])).rows[0];
        if(prior) assert(prior.conversation_id===g.id && prior.sender_device===op.actorId && prior.hash===p.hash && prior.ciphertext===p.ciphertext,409,'encrypted_send_conflict');
        else {
          const seq=(await client.query('UPDATE encrypted_conversations SET next_sequence=next_sequence+1 WHERE id=$1 RETURNING next_sequence',[g.id])).rows[0].next_sequence;
          await client.query(`INSERT INTO encrypted_conversation_messages(id,conversation_id,sender_device,epoch,sequence,ciphertext,hash,proof) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [p.id,g.id,op.actorId,p.epoch,seq,p.ciphertext,p.hash,JSON.stringify({owner:context.owner,sessionId:context.deviceId,...op})]);
          await enqueuePush(client,{id:p.id,senderId:context.owner,receiverId:g.creator===context.owner?g.recipient:g.creator});
        }
        return {id:p.id,hash:p.hash,status:'sent'};
      }
      assert(['receipt','receipt-ack','reject'].includes(op.action) && uuid(p.id)
        && (op.action==='reject' ? p.reason==='invalid-ciphertext' : ['delivered','read'].includes(p.kind)));
      const m=(await client.query('SELECT * FROM encrypted_conversation_messages WHERE id=$1 AND conversation_id=$2',[p.id,g.id])).rows[0];
      if(op.action==='receipt-ack') {
        assert(m && m.sender_device===op.actorId && m.hash===p.hash && m.epoch===p.epoch,403,'encrypted_receipt_rejected');
        await client.query(`UPDATE encrypted_conversation_receipts SET sender_ack_at=COALESCE(sender_ack_at,NOW()) WHERE message_id=$1 AND kind=$2`,[p.id,p.kind]);
        return {version:1,ok:true};
      }
      assert(m && m.sender_device!==op.actorId && m.hash===p.hash && m.epoch===p.epoch,403,'encrypted_receipt_rejected');
      const proof={owner:context.owner,sessionId:context.deviceId,...op};
      if(op.action==='reject') {
        await client.query(`INSERT INTO encrypted_conversation_rejections(message_id,device_id,proof) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[p.id,op.actorId,JSON.stringify(proof)]);
        return {version:1,ok:true};
      }
      await client.query(`INSERT INTO encrypted_conversation_receipts(message_id,device_id,kind,proof) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[p.id,op.actorId,p.kind,JSON.stringify(proof)]);
      return {version:1,ok:true};
    });
  }
  async function readEncryptedConversationMode(context,peer) {
    assert(typeof peer==='string' && /^[A-Za-z0-9._:-]{1,128}$/.test(peer) && peer!==context.owner);
    return withTransaction(async client=>{
      await authenticateCryptoSession(client,context,now());
      const row=(await client.query(`SELECT security_mode FROM conversation_event_streams WHERE participant_low=LEAST($1::text,$2::text) AND participant_high=GREATEST($1::text,$2::text)`,[context.owner,peer])).rows[0];
      return {version:1,mode:row?.security_mode || 'legacy-plaintext'};
    });
  }
  return { encryptedOperation, readEncryptedConversationMode };
}
module.exports={createEncryptedConversationStore,operationBytes};
