const crypto = require('node:crypto');
const { failure } = require('./encrypted-content-contract');
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const canonical = v => JSON.stringify(v, Object.keys(v).sort());
const digest = v => crypto.createHash('sha256').update(canonical(v)).digest('hex');
const need = (v, code='encrypted_device_admission_conflict', status=409) => { if(!v)throw failure(status,code); };
const proof = (c,op) => ({owner:c.owner,sessionId:c.deviceId,...op});
function createDeviceAdmissions({access,currentEpoch,replacementFrozen}) {
  async function roster(client,g,epoch=g.epoch) {
    return (await client.query(`SELECT e.device_id AS id,e.owner_id AS owner,d.public_key,d.fingerprint,d.status,
      p.mls_public_key FROM encrypted_conversation_epoch_devices e JOIN conversation_crypto_devices d ON d.id=e.device_id
      JOIN LATERAL (SELECT mls_public_key FROM conversation_crypto_key_packages WHERE device_id=d.id
        ORDER BY published_at DESC,hash LIMIT 1) p ON TRUE WHERE e.conversation_id=$1 AND e.epoch=$2 ORDER BY e.device_id`,[g.id,epoch])).rows;
  }
  async function latest(client,id) {
    const row=(await client.query(`SELECT * FROM encrypted_conversation_device_admissions
      WHERE conversation_id=$1 ORDER BY previous_epoch::numeric DESC LIMIT 1`,[id])).rows[0];
    if(row)row.acceptances=(await client.query(`SELECT proof FROM encrypted_conversation_device_acceptances
      WHERE admission_id=$1 ORDER BY device_id`,[row.id])).rows.map(r=>r.proof);
    return row;
  }
  async function frozen(client,id) {
    return (await client.query(`SELECT 1 FROM encrypted_conversation_device_admissions
      WHERE conversation_id=$1 AND status<>'accepted'`,[id])).rows.length>0;
  }
  async function handle(client,c,op,g) {
    const p=op.payload;need(g,'encrypted_membership_required',403);
    const change=op.action.startsWith('device-change-'),action=change?op.action.replace('device-change-','device-'):op.action;
    if(action==='device-reserve' || action==='device-retire') {
      const added=p.addedDeviceId!=='';
      need(uuid(p.id) && p.actorDeviceId===op.actorId && p.actorOwner===c.owner
        && typeof p.previousEpoch==='string' && /^[1-9][0-9]{0,19}$/.test(p.previousEpoch)
        && (added?uuid(p.addedDeviceId) && [g.creator,g.recipient].includes(p.addedOwner) && /^[a-f0-9]{64}$/.test(p.packageHash)
          :change && p.addedOwner==='' && p.packageHash==='')
        && (!change || uuid(p.removedDeviceId) && p.removedDeviceId!==op.actorId && [g.creator,g.recipient].includes(p.removedOwner)
          && (!added || p.addedOwner===p.removedOwner && p.addedDeviceId!==p.removedDeviceId)),'encrypted_operation_invalid',400);
      await access(client,g,op.actorId,c.owner,{retiringDeviceId:change?p.removedDeviceId:null});
      const retired=(await client.query('SELECT * FROM encrypted_conversation_device_retirements WHERE id=$1',[p.id])).rows[0];
      if(retired) {
        need(retired.actor_device===op.actorId && canonical(retired.intent)===canonical(p));
        need(action==='device-retire','encrypted_device_admission_retired');
        return {version:1,id:p.id,status:'retired',conversationId:g.id,epoch:p.previousEpoch};
      }
      const prior=(await client.query(`SELECT * FROM encrypted_conversation_device_admissions
        WHERE conversation_id=$1 AND previous_epoch=$2 FOR UPDATE`,[g.id,p.previousEpoch])).rows[0];
      if(prior) {
        need(action!=='device-retire','encrypted_device_admission_exists');
        need(prior.id===p.id && prior.actor_device===op.actorId && canonical(prior.intent)===canonical(p));
        return {version:1,id:prior.id,status:prior.status};
      }
      need(g.status==='active' && g.epoch===p.previousEpoch && !await frozen(client,g.id) && !await replacementFrozen(client,g.id));
      if(action==='device-retire') {
        await client.query(`INSERT INTO encrypted_conversation_device_retirements(id,conversation_id,actor_device,intent,proof)
          VALUES($1,$2,$3,$4,$5)`,[p.id,g.id,op.actorId,canonical(p),JSON.stringify(proof(c,op))]);
        return {version:1,id:p.id,status:'retired',conversationId:g.id,epoch:g.epoch};
      }
      await currentEpoch(client,g);const members=await roster(client,g);
      const removed=change&&members.find(m=>m.id===p.removedDeviceId);
      if(change)need(removed?.owner===p.removedOwner && (removed.owner===c.owner || removed.status==='revoked'),
        'encrypted_membership_required',403);
      const retained=members.filter(m=>m.id!==removed?.id);
      need(members.length>=2 && (change || members.length<8)
        && (!added || retained.filter(m=>m.owner===p.addedOwner).length<4)
        && [g.creator,g.recipient].every(owner=>retained.some(m=>m.owner===owner)||added&&p.addedOwner===owner),'encrypted_device_limit');
      need(!members.some(m=>m.id===p.addedDeviceId),'encrypted_device_already_admitted');
      if(added)need(!(await client.query(`SELECT 1 FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1 AND device_id=$2 LIMIT 1`,
        [g.id,p.addedDeviceId])).rows.length,'encrypted_replacement_fresh_device_required');
      const pkg=!added || (await client.query(`SELECT p.* FROM conversation_crypto_key_packages p JOIN conversation_crypto_devices d ON d.id=p.device_id
        WHERE p.hash=$1 AND d.id=$2 AND d.owner_id=$3 AND d.status='active' AND p.consumed_at IS NULL
        AND p.expires_at>NOW() FOR UPDATE OF p FOR SHARE OF d`,[p.packageHash,p.addedDeviceId,p.addedOwner])).rows[0];
      need(pkg,'encrypted_package_unavailable');
      // Every retained endpoint drains its own old-epoch traffic before the group freezes.
      const pending=(await client.query(`SELECT 1 FROM encrypted_conversation_messages m
        JOIN encrypted_conversation_epoch_devices e ON e.conversation_id=m.conversation_id AND e.epoch=m.epoch
        JOIN encrypted_conversation_epoch_devices s ON s.conversation_id=m.conversation_id AND s.epoch=m.epoch AND s.device_id=m.sender_device
        WHERE m.conversation_id=$1 AND m.epoch=$2 AND e.device_id<>m.sender_device AND ($3::text IS NULL OR e.device_id<>$3)
        AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_rejections x WHERE x.message_id=m.id AND x.device_id=e.device_id)
        AND NOT ((e.owner_id<>s.owner_id AND EXISTS(SELECT 1 FROM encrypted_conversation_receipts r
          WHERE r.message_id=m.id AND r.device_id=e.device_id AND r.kind='delivered'))
          OR (e.owner_id=s.owner_id AND EXISTS(SELECT 1 FROM encrypted_conversation_sync_acks a
          WHERE a.message_id=m.id AND a.device_id=e.device_id))) LIMIT 1`,[g.id,g.epoch,removed?.id||null])).rows.length;
      need(!pending,'encrypted_device_inbox_pending');
      await client.query(`INSERT INTO encrypted_conversation_device_admissions(id,conversation_id,previous_epoch,epoch,
        actor_device,added_device,added_owner,package_hash,intent,reservation_proof,status,kind,removed_device,removed_owner,removed_status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'reserved',$11,$12,$13,$14)`,[p.id,g.id,g.epoch,String(BigInt(g.epoch)+1n),op.actorId,
        added?p.addedDeviceId:null,added?p.addedOwner:null,added?p.packageHash:null,canonical(p),JSON.stringify(proof(c,op)),
        change?(added?'replace':'remove'):'add',removed?.id||null,removed?.owner||null,removed?.status||null]);
      if(added)await client.query('UPDATE conversation_crypto_key_packages SET consumed_by=$1,consumed_at=NOW() WHERE hash=$2',[g.canonical_id,p.packageHash]);
      await client.query(`SELECT winga_append_conversation_event($1,'access_changed',NULL,$2,0)`,[g.canonical_id,c.owner]);
      return {version:1,id:p.id,status:'reserved'};
    }
    const r=(await client.query(`SELECT * FROM encrypted_conversation_device_admissions
      WHERE id=$1 AND conversation_id=$2 FOR UPDATE`,[p.transferId||p.id,g.id])).rows[0];
    need(r && change===(r.kind!=='add'));const oldMembers=await roster(client,g,r.previous_epoch),members=oldMembers.filter(m=>m.id!==r.removed_device);
    const added=op.actorId===r.added_device && c.owner===r.added_owner;
    await access(client,g,added?r.actor_device:op.actorId,added?members.find(m=>m.id===r.actor_device)?.owner:c.owner,{retiringDeviceId:r.removed_device||null});
    need(added || members.some(m=>m.id===op.actorId && m.owner===c.owner),'encrypted_membership_required',403);
    if(action==='device-transfer') {
      need(op.actorId===r.actor_device && canonical(r.intent)===canonical(Object.fromEntries(
        Object.keys(r.intent).map(k=>[k,p[k]]))) && p.version===(change?3:2) && p.epoch===r.epoch);
      need(typeof p.roster==='string' && p.roster.length<=8192,'encrypted_operation_invalid',400);
      let received;try {received=JSON.parse(p.roster);}catch {need(false,'encrypted_operation_invalid',400);}
      need(Array.isArray(received) && JSON.stringify(received)===p.roster && received.length===members.length+(r.added_device?1:0),'encrypted_device_roster_rejected');
      const target=r.added_device && (await client.query(`SELECT d.id,d.owner_id AS owner,d.fingerprint,p.mls_public_key
        FROM conversation_crypto_devices d JOIN conversation_crypto_key_packages p ON p.device_id=d.id
        WHERE d.id=$1 AND p.hash=$2 AND d.status='active' FOR SHARE OF d`,[r.added_device,r.package_hash])).rows[0];
      need(!r.added_device || target,'encrypted_package_unavailable');
      const expected=[...members,...(target?[target]:[])],seen=new Set();
      for(const entry of received) {
        const m=expected.find(m=>m.id===entry.id);
        need(m && !seen.has(entry.id) && Object.keys(entry).sort().join(',')==='fingerprint,id,key,owner'
          && entry.owner===m.owner && entry.fingerprint===m.fingerprint && Array.isArray(entry.key) && entry.key.length===32
          && entry.key.every(x=>Number.isInteger(x)&&x>=0&&x<=255)
          && Buffer.from(entry.key).toString('base64url')===m.mls_public_key,'encrypted_device_roster_rejected');
        seen.add(entry.id);
      }
      for(const key of ['commit','welcome','tree'])need(typeof p[key]==='string' && (/^[A-Za-z0-9_-]+$/.test(p[key]) || key==='welcome'&&!r.added_device&&p[key]==='')
        && Buffer.from(p[key],'base64url').length<=65536 && Buffer.from(p[key],'base64url').toString('base64url')===p[key],'encrypted_operation_invalid',400);
      const {decodeMlsMessage}=await import('ts-mls'),bytes=Buffer.from(p.commit,'base64url'),decoded=decodeMlsMessage(bytes,0);
      need(decoded && decoded[1]===bytes.length && decoded[0].wireformat==='mls_private_message'
        && decoded[0].privateMessage.contentType==='commit' && Buffer.from(decoded[0].privateMessage.groupId).toString('utf8')===g.id
        && String(decoded[0].privateMessage.epoch)===r.previous_epoch,'encrypted_operation_invalid',400);
      const h=digest(p);
      if(r.transfer_hash)need(r.transfer_hash===h,'encrypted_transfer_conflict');
      else {
        await client.query(`UPDATE encrypted_conversation_device_admissions SET transfer=$2,transfer_hash=$3,
          transfer_proof=$4,status='pending' WHERE id=$1`,[r.id,canonical(p),h,JSON.stringify(proof(c,op))]);
        await client.query(`SELECT winga_append_conversation_event($1,'access_changed',NULL,$2,0)`,[g.canonical_id,c.owner]);
      }
      return {version:1,id:r.id,status:r.status==='accepted'?'accepted':'pending'};
    }
    need(action==='device-accept' && r.transfer && p.epoch===r.epoch && p.transferHash===r.transfer_hash);
    need(members.every(m=>m.status==='active'),'encrypted_access_denied',403);
    const activeTarget=!r.added_device || (await client.query(`SELECT 1 FROM conversation_crypto_devices WHERE id=$1 AND owner_id=$2 AND status='active' FOR SHARE`,[r.added_device,r.added_owner])).rows.length;
    need(activeTarget,'encrypted_access_denied',403);
    await client.query(`INSERT INTO encrypted_conversation_device_acceptances(admission_id,device_id,proof)
      VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[r.id,op.actorId,JSON.stringify(proof(c,op))]);
    const accepted=(await client.query(`SELECT device_id FROM encrypted_conversation_device_acceptances WHERE admission_id=$1`,[r.id])).rows;
    const complete=[...members.map(m=>m.id),...(r.added_device?[r.added_device]:[])].every(id=>accepted.some(a=>a.device_id===id));
    if(complete && r.status!=='accepted') {
      need(g.epoch===r.previous_epoch && !await replacementFrozen(client,g.id));
      const nextMembers=[...members,...(r.added_device?[{id:r.added_device,owner:r.added_owner}]:[])];
      const next={...g,epoch:r.epoch};
      if(g.creator_device===r.removed_device)next.creator_device=nextMembers.find(m=>m.owner===g.creator).id;
      if(g.recipient_device===r.removed_device)next.recipient_device=nextMembers.find(m=>m.owner===g.recipient).id;
      await currentEpoch(client,next);
      for(const m of nextMembers)await client.query(`INSERT INTO encrypted_conversation_epoch_devices
        (conversation_id,epoch,device_id,owner_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[g.id,r.epoch,m.id,m.owner]);
      await client.query('UPDATE encrypted_conversations SET epoch=$2,creator_device=$3,recipient_device=$4 WHERE id=$1',[g.id,r.epoch,next.creator_device,next.recipient_device]);
      await client.query(`UPDATE encrypted_conversation_device_admissions SET status='accepted',accepted_at=NOW() WHERE id=$1`,[r.id]);
      await client.query('UPDATE conversation_event_streams SET membership_version=membership_version+1 WHERE id=$1',[g.canonical_id]);
      await client.query(`SELECT winga_append_conversation_event($1,'access_changed',NULL,$2,0)`,[g.canonical_id,c.owner]);
    }
    return {version:1,id:r.id,status:complete?'active':'pending'};
  }
  return {roster,latest,frozen,handle};
}
module.exports={createDeviceAdmissions};
