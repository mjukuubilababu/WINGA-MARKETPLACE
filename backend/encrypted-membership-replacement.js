const crypto = require('node:crypto');
const { failure } = require('./encrypted-content-contract');
const need = (value, code='encrypted_replacement_conflict', status=409) => { if(!value)throw failure(status,code); };
const uuid = v => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const canonical = value => JSON.stringify(value,Object.keys(value).sort());
const digest = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
function createMembershipReplacement({access}) {
  const proof = (context,op) => ({owner:context.owner,sessionId:context.deviceId,...op});
  async function currentEpoch(client,g) {
    await client.query(`INSERT INTO encrypted_conversation_epochs(conversation_id,epoch,creator_device,recipient_device)
      VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[g.id,g.epoch,g.creator_device,g.recipient_device]);
  }
  async function latest(client,id) {
    return (await client.query(`SELECT * FROM encrypted_conversation_replacements WHERE conversation_id=$1 ORDER BY previous_epoch::numeric DESC LIMIT 1`,[id])).rows[0];
  }
  async function frozen(client,id) {
    return (await client.query(`SELECT 1 FROM encrypted_conversation_replacements WHERE conversation_id=$1 AND status<>'accepted'`,[id])).rows.length>0;
  }
  function projected(g,r) {
    return r.initiator_device===g.creator_device ? {...g,recipient_device:r.replacement_device} : {...g,creator_device:r.replacement_device};
  }
  async function handle(client,context,op,g) {
    const p=op.payload;need(g,'encrypted_membership_required',403);
    if(op.action==='replace-reserve') {
      need(uuid(p.id) && uuid(p.removedDeviceId) && uuid(p.replacementDeviceId)
        && typeof p.previousEpoch==='string' && /^[1-9][0-9]{0,19}$/.test(p.previousEpoch)
        && typeof p.packageHash==='string' && /^[a-f0-9]{64}$/.test(p.packageHash),'encrypted_operation_invalid',400);
      const prior=(await client.query(`SELECT * FROM encrypted_conversation_replacements WHERE conversation_id=$1 AND previous_epoch=$2 FOR UPDATE`,[g.id,p.previousEpoch])).rows[0];
      if(prior) {
        need(prior.initiator_device===op.actorId && canonical(prior.intent)===canonical(p));
        await access(client,projected(g,prior),op.actorId,context.owner);
        return {version:1,id:prior.id,status:prior.status};
      }
      const creator=g.creator===context.owner && g.creator_device===op.actorId;
      const recipient=g.recipient===context.owner && g.recipient_device===op.actorId;
      need(creator||recipient,'encrypted_membership_required',403);
      need(g.status==='active' && g.epoch===p.previousEpoch && !await frozen(client,g.id));
      need(p.removedDeviceId===(creator?g.recipient_device:g.creator_device) && p.replacementDeviceId!==p.removedDeviceId);
      const peer=creator?g.recipient:g.creator;
      const pkg=(await client.query(`SELECT p.* FROM conversation_crypto_key_packages p JOIN conversation_crypto_devices d ON d.id=p.device_id
        WHERE p.hash=$1 AND p.device_id=$2 AND d.owner_id=$3 AND d.status='active' AND p.consumed_at IS NULL AND p.expires_at>NOW() FOR UPDATE OF p`,[p.packageHash,p.replacementDeviceId,peer])).rows[0];
      need(pkg,'encrypted_package_unavailable');
      const candidate=creator?{...g,recipient_device:p.replacementDeviceId}:{...g,creator_device:p.replacementDeviceId};
      await access(client,candidate,op.actorId,context.owner);
      const seen=(await client.query(`SELECT 1 FROM encrypted_conversation_epochs WHERE conversation_id=$1 AND (creator_device=$2 OR recipient_device=$2)`,[g.id,p.replacementDeviceId])).rows.length;
      need(!seen,'encrypted_replacement_fresh_device_required');
      const undrained=(await client.query(`SELECT 1 FROM encrypted_conversation_messages m WHERE conversation_id=$1 AND epoch=$2 AND sender_device<>$3
        AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_receipts r WHERE r.message_id=m.id AND r.device_id=$3 AND r.kind='delivered')
        AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_rejections r WHERE r.message_id=m.id AND r.device_id=$3) LIMIT 1`,[g.id,g.epoch,op.actorId])).rows.length;
      need(!undrained,'encrypted_replacement_inbox_pending');
      await currentEpoch(client,g);
      await client.query(`INSERT INTO encrypted_conversation_replacements(id,conversation_id,previous_epoch,epoch,initiator_device,removed_device,replacement_device,package_hash,intent,reservation_proof,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'reserved')`,[p.id,g.id,g.epoch,String(BigInt(g.epoch)+1n),op.actorId,p.removedDeviceId,p.replacementDeviceId,p.packageHash,canonical(p),JSON.stringify(proof(context,op))]);
      await client.query('UPDATE conversation_crypto_key_packages SET consumed_by=$1,consumed_at=NOW() WHERE hash=$2',[g.canonical_id,p.packageHash]);
      return {version:1,id:p.id,status:'reserved'};
    }
    const r=(await client.query(`SELECT * FROM encrypted_conversation_replacements WHERE id=$1 AND conversation_id=$2 FOR UPDATE`,[p.transferId||p.id,g.id])).rows[0];
    need(r);await access(client,projected(g,r),op.actorId,context.owner);
    if(op.action==='replace-transfer') {
      need(op.actorId===r.initiator_device && p.previousEpoch===r.previous_epoch && p.epoch===r.epoch
        && p.removedDeviceId===r.removed_device && p.replacementDeviceId===r.replacement_device && p.packageHash===r.package_hash);
      for(const key of ['commit','welcome','tree']) {
        need(typeof p[key]==='string' && /^[A-Za-z0-9_-]+$/.test(p[key]) && p[key].length<=90000,'encrypted_operation_invalid',400);
        need(Buffer.from(p[key],'base64url').toString('base64url')===p[key],'encrypted_operation_invalid',400);
      }
      const {decodeMlsMessage}=await import('ts-mls'),bytes=Buffer.from(p.commit,'base64url'),decoded=decodeMlsMessage(bytes,0);
      need(decoded && decoded[1]===bytes.length && decoded[0].wireformat==='mls_private_message'
        && decoded[0].privateMessage.contentType==='commit' && Buffer.from(decoded[0].privateMessage.groupId).toString('utf8')===g.id
        && String(decoded[0].privateMessage.epoch)===r.previous_epoch,'encrypted_operation_invalid',400);
      const h=digest(p);
      if(r.transfer_hash)need(r.transfer_hash===h,'encrypted_transfer_conflict');
      else await client.query(`UPDATE encrypted_conversation_replacements SET transfer=$2,transfer_hash=$3,transfer_proof=$4,status='pending' WHERE id=$1`,[r.id,canonical(p),h,JSON.stringify(proof(context,op))]);
      return {version:1,id:r.id,status:r.status==='accepted'?'accepted':'pending'};
    }
    need(op.action==='replace-accept' && op.actorId===r.replacement_device && p.epoch===r.epoch && r.transfer,'encrypted_membership_required',403);
    if(r.status!=='accepted') {
      need(g.epoch===r.previous_epoch);
      const creator=r.removed_device===g.creator_device;
      await client.query(`UPDATE encrypted_conversations SET creator_device=$2,recipient_device=$3,source_hash=$4,target_hash=$5,epoch=$6 WHERE id=$1`,
        [g.id,creator?r.replacement_device:g.creator_device,creator?g.recipient_device:r.replacement_device,creator?r.package_hash:g.source_hash,creator?g.target_hash:r.package_hash,r.epoch]);
      const next=projected(g,r);await currentEpoch(client,{...next,epoch:r.epoch});
      await client.query(`UPDATE encrypted_conversation_replacements SET status='accepted',acceptance=$2,accepted_at=NOW() WHERE id=$1`,[r.id,JSON.stringify(proof(context,op))]);
    }
    return {version:1,id:r.id,status:'active'};
  }
  return {latest,frozen,projected,handle,currentEpoch};
}
module.exports={createMembershipReplacement};
