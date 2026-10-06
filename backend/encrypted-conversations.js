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
function createEncryptedConversationStore({ withTransaction, now = Date.now, enqueuePush = async()=>{}, mediaEnabled=false, multiDeviceEnabled=false, roomsEnabled=false, newConversationLimitPerHour=20 }) {
  if(typeof multiDeviceEnabled!=='boolean')throw new TypeError('Invalid encrypted device feature gate');
  if(typeof roomsEnabled!=='boolean')throw new TypeError('Invalid encrypted room feature gate');
  const newConversationLimit=Number(newConversationLimitPerHour);
  if(!Number.isInteger(newConversationLimit) || newConversationLimit<1 || newConversationLimit>1000)throw new RangeError('Invalid encrypted new-conversation quota');
  const replacement=require('./encrypted-membership-replacement').createMembershipReplacement({access});
  const admission=require('./encrypted-device-admissions').createDeviceAdmissions({access,currentEpoch:replacement.currentEpoch,replacementFrozen:replacement.frozen});
  const frozen=async(client,id)=>await replacement.frozen(client,id) || (multiDeviceEnabled && await admission.frozen(client,id));
  const nativeHistory=require('./encrypted-native-history').createNativeHistory({access,frozen,roster:admission.roster});
  const media=require('./encrypted-media-ledger').createEncryptedMediaLedger({withTransaction,authorizeDevice:authorize,
    access:async(client,g,actor,owner,options)=>{if(g?.kind==='shopping-room'){assert(roomsEnabled,503,'encrypted_rooms_disabled');return rooms.access(client,{owner},actor,g,{pending:false});}return access(client,g,actor,owner,options);},
    membershipFrozen:async(client,id)=>roomsEnabled&&await rooms.frozen(client,id)||await frozen(client,id),historyRecoveryEnabled:multiDeviceEnabled});
  const rooms=require('./encrypted-shopping-rooms').createShoppingRooms({packages,consumeQuota:consumeNewConversationQuota,enqueuePush,media,mediaEnabled});
  const sellers=require('./encrypted-room-sellers').createRoomSellers({rooms,access,consumeQuota:consumeNewConversationQuota,frozen});
  async function consumeNewConversationQuota(client, owner) {
    const timestamp=now(),windowMs=3600000,bucket=Math.floor(timestamp/windowMs),start=bucket*windowMs,end=start+windowMs;
    const key=digest(JSON.stringify(['winga-encrypted-new-conversations',1,owner]));
    // Charge only committed new groups; the same transaction rolls back failed reservations.
    const result=await client.query(`INSERT INTO api_rate_limit_buckets(key_hash,bucket_id,scope,count,window_started_at,expires_at)
      VALUES($1,$2,'encrypted-new-conversations',1,$3,$4)
      ON CONFLICT(key_hash,bucket_id) DO UPDATE SET count=api_rate_limit_buckets.count+1,updated_at=NOW()
      WHERE api_rate_limit_buckets.count<$5 RETURNING count`,[key,bucket,new Date(start).toISOString(),new Date(end).toISOString(),newConversationLimit]);
    if(!result.rows.length)throw Object.assign(failure(429,'encrypted_new_conversation_limit'),{retryAfterSeconds:Math.max(1,Math.ceil((end-timestamp)/1000))});
  }
  async function authorize(client, context, operation) {
    await authenticateCryptoSession(client, context, now());
    assert(operation && uuid(operation.actorId) && uuid(operation.requestId) && Number.isSafeInteger(operation.issuedAt)
      && Math.abs(now() - operation.issuedAt) <= 30000 && operation.payload && typeof operation.payload === 'object', 401, 'encrypted_proof_expired');
    const device = (await client.query(`SELECT * FROM conversation_crypto_devices WHERE id=$1 AND owner_id=$2 AND status='active' FOR SHARE`,
      [operation.actorId, context.owner])).rows[0];
    assert(device && verifyDeviceSignature(device.public_key, operationBytes(context, operation), operation.signature), 403, 'encrypted_proof_rejected');
    return device;
  }
  async function access(client, group, actor, owner, {retiringIntent=false,retiringDeviceId=null}={}) {
    assert(group,403,'encrypted_membership_required');
    assert(!group.kind || group.kind==='direct',403,'encrypted_group_scope_rejected');
    const roster=multiDeviceEnabled && group.status==='active' ? await admission.roster(client,group) : [];
    const expanded=roster.length>=2 && [group.creator_device,group.recipient_device].every(id=>roster.some(d=>d.id===id));
    assert(expanded?roster.some(d=>d.id===actor && d.owner===owner):((group.creator===owner && group.creator_device===actor)
      || (group.recipient===owner && group.recipient_device===actor)),403,'encrypted_membership_required');
    const ids=(expanded?roster.map(d=>d.id):[group.creator_device,group.recipient_device]).filter(id=>id!==retiringDeviceId);
    assert(actor!==retiringDeviceId,403,'encrypted_membership_required');
    const devices = await client.query(`SELECT id FROM conversation_crypto_devices WHERE id=ANY($1::text[]) AND status='active' ORDER BY id FOR SHARE`, [ids]);
    const users = await client.query(`SELECT username FROM users WHERE username=ANY($1::text[]) AND status='active'`, [[group.creator, group.recipient]]);
    const blocked = await client.query(`SELECT 1 FROM user_blocks WHERE (blocker_username=$1 AND blocked_username=$2) OR (blocker_username=$2 AND blocked_username=$1)`, [group.creator, group.recipient]);
    assert((retiringIntent?devices.rows.some(d=>d.id===actor):devices.rows.length===ids.length) && users.rows.length === 2 && !blocked.rows.length, 403, 'encrypted_access_denied');
  }
  async function packages(client, hashes) {
    return (await client.query(`SELECT p.*,d.owner_id,d.public_key,d.fingerprint FROM conversation_crypto_key_packages p
      JOIN conversation_crypto_devices d ON d.id=p.device_id WHERE p.hash=ANY($1::text[]) ORDER BY p.hash`, [hashes])).rows.map(p => ({
      hash: p.hash, deviceId: p.device_id, owner: p.owner_id, publicKey: p.public_key, fingerprint: p.fingerprint,
      keyPackage: p.package, mlsPublicKey: p.mls_public_key, identityProof: p.identity_proof }));
  }
  async function encryptedOperation(context, op) {
    assert(['directory','reserve','transfer','accept','send','receipt','receipt-ack','reject','poll','media-reserve','replace-reserve','replace-transfer','replace-accept','replace-retire',
      'device-reserve','device-transfer','device-accept','device-retire','device-change-reserve','device-change-transfer','device-change-accept','device-change-retire','sync-ack','media-history-grant','archive-read','archive-read-ack',...Object.keys(require('./encrypted-native-history').fields),...Object.keys(require('./encrypted-shopping-rooms').fields),...Object.keys(require('./encrypted-room-sellers').fields)].includes(op?.action));
    if(op.action.startsWith('room-'))assert(roomsEnabled,503,'encrypted_rooms_disabled');
    if(op.action.startsWith('seller-'))assert(roomsEnabled,503,'encrypted_rooms_disabled');
    if(op.action.startsWith('device-') || op.action.startsWith('history-') || op.action.startsWith('archive-read') || op.action==='sync-ack' || op.action==='media-history-grant')assert(multiDeviceEnabled,503,'encrypted_multidevice_disabled');
    const p = op.payload;
    assert(p && Buffer.byteLength(JSON.stringify(op)) <= 262144);
    const fields={directory:['peer'],reserve:['conversationId','peer','sourceHash','targetHash'],
      transfer:['id','conversationId','epoch','packageHash','commit','welcome','tree'],accept:['conversationId','transferId'],
      send:['id','conversationId','epoch','deviceId','ciphertext','hash'],receipt:['id','conversationId','epoch','hash','kind'],
      'receipt-ack':['id','conversationId','epoch','hash','kind'],poll:[]};
    fields.reject=['id','conversationId','epoch','hash','reason'];
    fields['media-reserve']=['id','conversationId','messageId','bytes','sha256'];
    fields['media-history-grant']=fields['media-reserve'];
    fields['replace-reserve']=['id','conversationId','previousEpoch','removedDeviceId','replacementDeviceId','packageHash'];
    fields['replace-retire']=fields['replace-reserve'];
    fields['replace-transfer']=[...fields.transfer,'previousEpoch','removedDeviceId','replacementDeviceId'];
    fields['replace-accept']=['conversationId','transferId','epoch'];
    fields['device-reserve']=['id','conversationId','previousEpoch','actorOwner','actorDeviceId','addedOwner','addedDeviceId','packageHash'];
    fields['device-retire']=fields['device-reserve'];
    fields['device-transfer']=[...fields['device-reserve'],'version','epoch','roster','commit','welcome','tree'];
    fields['device-accept']=['conversationId','transferId','epoch','transferHash'];
    fields['device-change-reserve']=[...fields['device-reserve'],'removedOwner','removedDeviceId'];
    fields['device-change-retire']=fields['device-change-reserve'];
    fields['device-change-transfer']=[...fields['device-transfer'],'removedOwner','removedDeviceId'];
    fields['device-change-accept']=fields['device-accept'];
    fields['sync-ack']=['id','conversationId','epoch','hash'];
    fields['archive-read']=fields.receipt;
    fields['archive-read-ack']=[...fields.receipt,'receiptDeviceId'];
    Object.assign(fields,require('./encrypted-native-history').fields);
    Object.assign(fields,require('./encrypted-shopping-rooms').fields);
    Object.assign(fields,require('./encrypted-room-sellers').fields);
    if(op.action==='history-tasks' && Object.hasOwn(p,'after'))fields['history-tasks']=['after'];
    if(op.action==='send' && Object.hasOwn(p,'mediaId'))fields.send=[...fields.send,'mediaId'];
    if(op.action==='room-send' && Object.hasOwn(p,'mediaId'))fields['room-send']=[...fields['room-send'],'mediaId'];
    if(op.action==='poll' && Object.hasOwn(p,'after'))fields.poll=['after'];
    if(op.action==='receipt-ack' && Object.hasOwn(p,'receiptDeviceId'))fields['receipt-ack']=[...fields['receipt-ack'],'receiptDeviceId'];
    assert(!Array.isArray(p) && Object.keys(p).sort().join(',')===fields[op.action].sort().join(','));
    assert(Object.keys(op).sort().join(',')==='action,actorId,issuedAt,payload,requestId,signature');
    return withTransaction(async client => {
      // Serialize membership and message writes before authentication's user lock.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('winga-encrypted-transport'))`);
      await authorize(client, context, op);
      if(op.action.startsWith('seller-'))return sellers.handle(client,context,op);
      if(op.action.startsWith('room-'))return rooms.handle(client,context,op);
      if(op.action==='history-tasks') {
        assert(p.after===undefined||uuid(p.after));return nativeHistory.handle(client,context,op);
      }
      if (op.action === 'directory') {
        assert(typeof p.peer === 'string' && p.peer !== context.owner);
        const allowed = (await client.query(`SELECT username FROM users WHERE username=$1 AND status='active'
          AND NOT EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_username=$1 AND blocked_username=$2) OR (blocker_username=$2 AND blocked_username=$1))`, [p.peer, context.owner])).rows.length;
        assert(allowed, 403, 'encrypted_access_denied');
        const rows = await client.query(`SELECT p.hash FROM conversation_crypto_key_packages p JOIN conversation_crypto_devices d ON d.id=p.device_id
          WHERE d.owner_id=ANY($1::text[]) AND d.status='active' AND p.consumed_at IS NULL AND p.expires_at>NOW() ORDER BY p.published_at DESC LIMIT 20`, [multiDeviceEnabled?[p.peer,context.owner]:[p.peer]]);
        const group=(await client.query(`SELECT id,creator,recipient,creator_device,recipient_device,epoch,status FROM encrypted_conversations
          WHERE (creator=$1 AND recipient=$2) OR (creator=$2 AND recipient=$1)`,[context.owner,p.peer])).rows[0];
        const pending=group && await frozen(client,group.id),roster=group&&multiDeviceEnabled?await admission.roster(client,group):[];
        return { version: 1, packages: await packages(client, rows.rows.map(r => r.hash)),...(group?{group,canReplace:!pending&&roster.length<=2,
          ...(multiDeviceEnabled?{roster,canChange:!pending&&roster.some(m=>m.id===op.actorId&&m.owner===context.owner&&m.status==='active'),
            canAdmit:!pending&&roster.every(m=>m.status==='active')&&roster.some(m=>m.id===op.actorId&&m.owner===context.owner)}:{})}: {}) };
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
        await consumeNewConversationQuota(client,context.owner);
        await client.query(`INSERT INTO encrypted_conversations(id,canonical_id,creator,recipient,creator_device,recipient_device,source_hash,target_hash,status)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,'reserved')`,[group.id,cid,group.creator,group.recipient,group.creator_device,group.recipient_device,p.sourceHash,p.targetHash]);
        await client.query('UPDATE conversation_crypto_key_packages SET consumed_by=$1,consumed_at=NOW() WHERE hash=ANY($2::text[])',[cid,[p.sourceHash,p.targetHash]]);
        return {version:1,group:{...group,status:'reserved'}};
      }
      if (op.action === 'poll') {
        assert(p.after===undefined || uuid(p.after));
        // UUID keyset order cannot repeat rows when timestamps collide or new groups arrive.
        const extra=multiDeviceEnabled?`OR EXISTS(SELECT 1 FROM encrypted_conversation_epoch_devices e WHERE e.conversation_id=g.id AND e.epoch=g.epoch AND e.device_id=$1)
          OR EXISTS(SELECT 1 FROM encrypted_conversation_device_admissions a WHERE a.conversation_id=g.id AND a.added_device=$1 AND a.status<>'accepted')`:'';
        const page=(await client.query(`SELECT g.* FROM encrypted_conversations g WHERE (creator_device=$1 OR recipient_device=$1 ${extra}
          OR EXISTS(SELECT 1 FROM encrypted_conversation_replacements r WHERE r.conversation_id=g.id AND r.replacement_device=$1 AND r.status<>'accepted'))
          AND COALESCE(to_jsonb(g)->>'kind','direct')='direct'
          AND ($2::text IS NULL OR g.id>$2) ORDER BY g.id LIMIT 101`,[op.actorId,p.after || null])).rows;
        const groups=page.slice(0,100);
        const result=[];
        for(const g of groups) {
          const a=multiDeviceEnabled && await admission.latest(client,g.id),aPending=a&&a.status!=='accepted';
          if(aPending) {
            const oldRoster=await admission.roster(client,g,a.previous_epoch);
            if(a.removed_device===op.actorId){result.push({id:g.id,status:'blocked'});continue;}
            try {await access(client,g,a.added_device===op.actorId?a.actor_device:op.actorId,
              a.added_device===op.actorId?oldRoster.find(m=>m.id===a.actor_device)?.owner:context.owner,{retiringDeviceId:a.removed_device||null});}
            catch(error){if(error.status===403){result.push({id:g.id,status:'blocked'});continue;}throw error;}
            const target=!a.added_device || (await client.query(`SELECT 1 FROM conversation_crypto_devices WHERE id=$1 AND owner_id=$2 AND status='active'`,[a.added_device,a.added_owner])).rows.length;
            if(!target){result.push({id:g.id,status:'blocked'});continue;}
            const hashes=(await client.query(`SELECT DISTINCT ON(device_id) hash FROM conversation_crypto_key_packages
              WHERE device_id=ANY($1::text[]) ORDER BY device_id,published_at DESC,hash`,[oldRoster.filter(m=>m.id!==a.removed_device).map(m=>m.id)])).rows.map(p=>p.hash);
            result.push({...g,status:`device-${a.status}`,admission:a,roster:oldRoster,packages:await packages(client,[...hashes,a.package_hash]),messages:[],receipts:[]});continue;
          }
          const r=await replacement.latest(client,g.id),pending=r && r.status!=='accepted';
          try { await access(client,pending?replacement.projected(g,r):g,op.actorId,context.owner); } catch(error) { if(error.status===403) { result.push({id:g.id,status:'blocked'});continue; } throw error; }
          if(pending) {
            const fresh=(await client.query(`SELECT hash FROM conversation_crypto_key_packages WHERE device_id=$1 AND expires_at>NOW() ORDER BY published_at DESC LIMIT 1`,[r.initiator_device])).rows[0];
            result.push({...g,status:`replacement-${r.status}`,replacement:r,packages:await packages(client,[fresh?.hash || (r.initiator_device===g.creator_device?g.source_hash:g.target_hash),r.package_hash]),messages:[],receipts:[]});continue;
          }
          const messages=(await client.query(`SELECT m.* FROM encrypted_conversation_messages m WHERE m.conversation_id=$1 AND m.sender_device<>$2
            AND m.epoch=$3
            AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_receipts r WHERE r.message_id=m.id AND r.device_id=$2 AND r.kind='delivered')
            AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_rejections r WHERE r.message_id=m.id AND r.device_id=$2)
            ${multiDeviceEnabled?'AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_sync_acks a WHERE a.message_id=m.id AND a.device_id=$2)':''}
            ORDER BY m.sequence LIMIT 100`,[g.id,op.actorId,g.epoch])).rows;
          const receipts=(await client.query(`SELECT r.proof FROM encrypted_conversation_receipts r JOIN encrypted_conversation_messages m ON m.id=r.message_id
            WHERE m.conversation_id=$1 AND ${multiDeviceEnabled?`(EXISTS(SELECT 1 FROM encrypted_conversation_epoch_devices s
              JOIN encrypted_conversation_epoch_devices o ON o.conversation_id=s.conversation_id AND o.epoch=s.epoch AND o.owner_id=s.owner_id
              WHERE s.conversation_id=m.conversation_id AND s.epoch=m.epoch AND s.device_id=m.sender_device AND o.device_id=$2)
              OR (r.kind='read' AND r.device_id<>$2 AND EXISTS(SELECT 1 FROM encrypted_conversation_epoch_devices e
                WHERE e.conversation_id=m.conversation_id AND e.epoch=m.epoch AND e.device_id=r.device_id AND e.owner_id=$3)))`:'m.sender_device=$2'}
            AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_receipt_acks a WHERE a.message_id=r.message_id
              AND a.receipt_device=r.device_id AND a.kind=r.kind AND a.observer_device=$2)
            ORDER BY ${multiDeviceEnabled?'EXISTS(SELECT 1 FROM encrypted_conversation_epoch_devices d WHERE d.conversation_id=m.conversation_id AND d.epoch=$4 AND d.device_id=r.device_id) DESC,':''}
              m.sequence,r.device_id,r.kind LIMIT 100`,multiDeviceEnabled?[g.id,op.actorId,context.owner,g.epoch]:[g.id,op.actorId])).rows.map(r=>r.proof);
          const archiveReceipts=multiDeviceEnabled?(await client.query(`SELECT r.proof FROM encrypted_conversation_archive_reads r
            JOIN encrypted_conversation_messages m ON m.id=r.message_id WHERE m.conversation_id=$1 AND r.device_id<>$2
            AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_archive_read_acks a WHERE a.message_id=r.message_id AND a.receipt_device=r.device_id AND a.observer_device=$2)
            ORDER BY EXISTS(SELECT 1 FROM encrypted_conversation_epoch_devices d WHERE d.conversation_id=m.conversation_id AND d.epoch=$3 AND d.device_id=r.device_id) DESC,
              m.sequence,r.device_id LIMIT 100`,[g.id,op.actorId,g.epoch])).rows.map(r=>r.proof):[];
          const roster=multiDeviceEnabled?await admission.roster(client,g):null;
          const hashes=roster?.length?(await client.query(`SELECT DISTINCT ON(device_id) hash FROM conversation_crypto_key_packages
            WHERE device_id=ANY($1::text[]) ORDER BY device_id,published_at DESC,hash`,[roster.map(m=>m.id)])).rows.map(p=>p.hash):[g.source_hash,g.target_hash];
          result.push({...g,...(r?{replacement:r}:{}),...(a && a.epoch===g.epoch?{admission:a}:{}),...(roster?{roster,archiveReceipts}:{}),packages:await packages(client,hashes),messages,receipts});
        }
        return {version:1,groups:result,next:page.length>100?groups.at(-1).id:null};
      }
      assert(uuid(p.conversationId));
      const g=(await client.query('SELECT * FROM encrypted_conversations WHERE id=$1 FOR UPDATE',[p.conversationId])).rows[0];
      assert(!g?.kind || g.kind==='direct',403,'encrypted_group_scope_rejected');
      if(op.action.startsWith('history-'))return nativeHistory.handle(client,context,op,g);
      if(op.action.startsWith('device-'))return admission.handle(client,context,op,g);
      if(op.action.startsWith('replace-')) {
        if(multiDeviceEnabled){assert(!await admission.frozen(client,g?.id),409,'encrypted_membership_pending');
          assert(g && (await admission.roster(client,g)).length<=2,409,'encrypted_multidevice_replacement_required');}
        return replacement.handle(client,context,op,g);
      }
      await access(client,g,op.actorId,context.owner);
      if(op.action==='media-history-grant') {
        assert(mediaEnabled,503,'private_media_disabled');
        assert(!await frozen(client,g.id),409,'encrypted_membership_pending');
        assert(uuid(p.id)&&uuid(p.messageId));return media.grantHistory(client,context,op,g);
      }
      if(op.action==='media-reserve') {
        assert(!await frozen(client,g.id),409,'encrypted_membership_pending');
        assert(mediaEnabled,503,'private_media_disabled');assert(uuid(p.id)&&uuid(p.messageId));
        return media.reserve(client,context,op,g);
      }
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
        await replacement.currentEpoch(client,g);
        return {version:1,status:'active'};
      }
      assert(g.status==='active',409,'encrypted_membership_pending');
      if(op.action==='send') {
        assert(!await frozen(client,g.id),409,'encrypted_membership_pending');
        if(Object.hasOwn(p,'mediaId'))assert(mediaEnabled && uuid(p.mediaId),503,'private_media_disabled');
        assert(uuid(p.id) && p.deviceId===op.actorId && p.epoch===g.epoch && typeof p.ciphertext==='string' && /^[A-Za-z0-9_-]+$/.test(p.ciphertext));
        const bytes=Buffer.from(p.ciphertext,'base64url');
        assert(bytes.length<=65536 && bytes.toString('base64url')===p.ciphertext && digest(bytes)===p.hash);
        const {decodeMlsMessage}=await import('ts-mls');
        const parsed=decodeMlsMessage(bytes,0);
        assert(parsed && parsed[1]===bytes.length && parsed[0].wireformat==='mls_private_message'
          && Buffer.from(parsed[0].privateMessage.groupId).toString('utf8')===g.id && String(parsed[0].privateMessage.epoch)===g.epoch);
        const prior=(await client.query('SELECT * FROM encrypted_conversation_messages WHERE id=$1',[p.id])).rows[0];
        let acceptedAt=prior?.created_at;
        if(prior) assert(prior.conversation_id===g.id && prior.sender_device===op.actorId && prior.hash===p.hash && prior.ciphertext===p.ciphertext
          && (prior.media_id || null)===(p.mediaId || null),409,'encrypted_send_conflict');
        else {
          const seq=(await client.query('UPDATE encrypted_conversations SET next_sequence=next_sequence+1 WHERE id=$1 RETURNING next_sequence',[g.id])).rows[0].next_sequence;
          const inserted=await client.query(`INSERT INTO encrypted_conversation_messages(id,conversation_id,sender_device,epoch,sequence,ciphertext,hash,proof) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING created_at`,
            [p.id,g.id,op.actorId,p.epoch,seq,p.ciphertext,p.hash,JSON.stringify({owner:context.owner,sessionId:context.deviceId,...op})]);
          acceptedAt=inserted.rows[0].created_at;
          await media.attach(client,g,op,p);
          await enqueuePush(client,{id:p.id,senderId:context.owner,receiverId:g.creator===context.owner?g.recipient:g.creator});
          if(multiDeviceEnabled)await client.query(`SELECT winga_append_conversation_event($1,'message_created',$2,$3,0)`,[g.canonical_id,p.id,context.owner]);
        }
        return {id:p.id,hash:p.hash,status:'sent',createdAt:new Date(acceptedAt).toISOString()};
      }
      assert(['receipt','receipt-ack','reject','sync-ack','archive-read','archive-read-ack'].includes(op.action) && uuid(p.id)
        && (op.action==='reject' ? p.reason==='invalid-ciphertext' : op.action==='sync-ack'||['delivered','read'].includes(p.kind)));
      const m=(await client.query('SELECT * FROM encrypted_conversation_messages WHERE id=$1 AND conversation_id=$2',[p.id,g.id])).rows[0];
      const epochMember=m && (await client.query(`SELECT 1 FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1 AND epoch=$2
        AND device_id=$3 AND owner_id=$4`,[g.id,m.epoch,op.actorId,context.owner])).rows.length;
      const epochOwner=multiDeviceEnabled&&m&&(await client.query(`SELECT 1 FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1 AND epoch=$2 AND owner_id=$3 LIMIT 1`,[g.id,m.epoch,context.owner])).rows.length;
      assert(epochMember||(op.action.startsWith('archive-read')&&epochOwner),403,'encrypted_receipt_rejected');
      const senderOwner=m && (await client.query(`SELECT owner_id FROM encrypted_conversation_epoch_devices
        WHERE conversation_id=$1 AND epoch=$2 AND device_id=$3`,[g.id,m.epoch,m.sender_device])).rows[0]?.owner_id;
      if(op.action==='archive-read') {
        assert(m&&p.kind==='read'&&senderOwner!==context.owner&&m.epoch===p.epoch&&m.hash===p.hash
          &&BigInt(m.epoch)<BigInt(g.epoch),403,'encrypted_receipt_rejected');
        const inserted=await client.query(`INSERT INTO encrypted_conversation_archive_reads(message_id,device_id,owner_id,proof) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [m.id,op.actorId,context.owner,JSON.stringify({owner:context.owner,sessionId:context.deviceId,...op})]);
        if(inserted.rowCount)await client.query(`SELECT winga_append_conversation_event($1,'message_state_changed',$2,$3,0)`,[g.canonical_id,m.id,context.owner]);
        return {version:1,ok:true};
      }
      if(op.action==='archive-read-ack') {
        assert(m&&p.kind==='read'&&m.epoch===p.epoch&&m.hash===p.hash&&uuid(p.receiptDeviceId)&&p.receiptDeviceId!==op.actorId,403,'encrypted_receipt_rejected');
        assert((await client.query(`SELECT 1 FROM encrypted_conversation_archive_reads WHERE message_id=$1 AND device_id=$2`,[m.id,p.receiptDeviceId])).rows.length,403,'encrypted_receipt_rejected');
        await client.query(`INSERT INTO encrypted_conversation_archive_read_acks(message_id,receipt_device,observer_device,proof) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [m.id,p.receiptDeviceId,op.actorId,JSON.stringify({owner:context.owner,sessionId:context.deviceId,...op})]);
        return {version:1,ok:true};
      }
      if(op.action==='sync-ack') {
        assert(senderOwner===context.owner && m.sender_device!==op.actorId && m.hash===p.hash && m.epoch===p.epoch,403,'encrypted_receipt_rejected');
        await client.query(`INSERT INTO encrypted_conversation_sync_acks(message_id,device_id,proof) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
          [p.id,op.actorId,JSON.stringify({owner:context.owner,sessionId:context.deviceId,...op})]);
        return {version:1,ok:true};
      }
      if(op.action==='receipt-ack') {
        const ownRead=multiDeviceEnabled&&p.kind==='read'&&senderOwner!==context.owner;
        assert(m && (senderOwner===context.owner||ownRead) && (multiDeviceEnabled||m.sender_device===op.actorId) && m.hash===p.hash && m.epoch===p.epoch,403,'encrypted_receipt_rejected');
        assert(p.receiptDeviceId===undefined || uuid(p.receiptDeviceId));
        const receipts=(await client.query(`SELECT r.device_id FROM encrypted_conversation_receipts r
          JOIN encrypted_conversation_epoch_devices e ON e.conversation_id=$3 AND e.epoch=$4 AND e.device_id=r.device_id
          WHERE r.message_id=$1 AND r.kind=$2 AND ${ownRead?'e.owner_id=$5 AND r.device_id<>$7':'e.owner_id<>$5'}
          AND ($6::text IS NULL OR r.device_id=$6) ORDER BY r.device_id LIMIT 2`,
          ownRead?[p.id,p.kind,g.id,m.epoch,context.owner,p.receiptDeviceId || null,op.actorId]:[p.id,p.kind,g.id,m.epoch,context.owner,p.receiptDeviceId || null])).rows;
        // Old clients may omit the device only when exactly one authenticated receipt exists.
        assert(receipts.length===1,409,'encrypted_receipt_ack_ambiguous');
        await client.query(`INSERT INTO encrypted_conversation_receipt_acks(message_id,receipt_device,kind,observer_device,proof)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [p.id,receipts[0].device_id,p.kind,op.actorId,JSON.stringify({owner:context.owner,sessionId:context.deviceId,...op})]);
        return {version:1,ok:true};
      }
      assert(m && m.sender_device!==op.actorId && senderOwner && (op.action==='reject' || senderOwner!==context.owner)
        && m.hash===p.hash && m.epoch===p.epoch,403,'encrypted_receipt_rejected');
      const proof={owner:context.owner,sessionId:context.deviceId,...op};
      if(op.action==='reject') {
        await client.query(`INSERT INTO encrypted_conversation_rejections(message_id,device_id,proof) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[p.id,op.actorId,JSON.stringify(proof)]);
        return {version:1,ok:true};
      }
      const receipt=await client.query(`INSERT INTO encrypted_conversation_receipts(message_id,device_id,kind,proof) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[p.id,op.actorId,p.kind,JSON.stringify(proof)]);
      if(multiDeviceEnabled && receipt.rowCount)await client.query(`SELECT winga_append_conversation_event($1,'message_state_changed',$2,$3,0)`,[g.canonical_id,p.id,context.owner]);
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
  return { encryptedOperation, readEncryptedConversationMode,
    pruneEncryptedNativeHistory:({batchSize=100}={})=>multiDeviceEnabled?withTransaction(async client=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext('winga-encrypted-transport'))");return nativeHistory.prune(client,batchSize);
    }):Promise.resolve({pruned:0}),
    authorizeEncryptedMedia:(context,object,action)=>{assert(mediaEnabled,503,'private_media_disabled');return media.authorize(context,object,action);},
    completeEncryptedMediaUpload:media.uploaded,claimEncryptedMediaCleanup:media.claim,finishEncryptedMediaCleanup:media.finish };
}
module.exports={createEncryptedConversationStore,operationBytes};
