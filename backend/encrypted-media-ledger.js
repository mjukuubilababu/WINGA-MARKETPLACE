const crypto = require('node:crypto');
const { validateObject } = require('./conversation-private-media');
const { failure } = require('./encrypted-content-contract');
const need = (v, code='private_media_access_rejected', status=403) => { if(!v)throw failure(status,code); };
const objectFor = row => ({id:row.id,bytes:row.bytes,sha256:row.sha256});
function createEncryptedMediaLedger({withTransaction,authorizeDevice,access}) {
  async function reserve(client,context,op,g) {
    const p=op.payload;validateObject({id:p.id,bytes:p.bytes,sha256:p.sha256});
    need(g.status==='active','encrypted_membership_pending',409);
    const prior=(await client.query('SELECT * FROM encrypted_conversation_media WHERE id=$1 FOR UPDATE',[p.id])).rows[0];
    if(prior) {
      need(prior.conversation_id===g.id && prior.message_id===p.messageId && prior.uploader_device===op.actorId
        && prior.bytes===p.bytes && prior.sha256===p.sha256 && ['reserved','uploaded','attached'].includes(prior.status),'private_media_conflict',409);
      return objectFor(prior);
    }
    const quota=(await client.query(`SELECT COUNT(*)::int AS n,COALESCE(SUM(bytes),0)::bigint AS bytes FROM encrypted_conversation_media
      WHERE uploader_device=$1 AND status IN ('reserved','uploaded','cleaning')`,[op.actorId])).rows[0];
    need(quota.n<50 && Number(quota.bytes)+p.bytes<=128*1024*1024,'private_media_quota',429);
    await client.query(`INSERT INTO encrypted_conversation_media(id,conversation_id,message_id,uploader_device,bytes,sha256)
      VALUES($1,$2,$3,$4,$5,$6)`,[p.id,g.id,p.messageId,op.actorId,p.bytes,p.sha256]);
    return {id:p.id,bytes:p.bytes,sha256:p.sha256};
  }
  async function attach(client,g,op,p) {
    if(!p.mediaId)return;
    const row=(await client.query('SELECT * FROM encrypted_conversation_media WHERE id=$1 FOR UPDATE',[p.mediaId])).rows[0];
    need(row && row.conversation_id===g.id && row.message_id===p.id && row.uploader_device===op.actorId
      && row.status==='uploaded','private_media_not_uploaded',409);
    await client.query(`UPDATE encrypted_conversation_media SET status='attached' WHERE id=$1`,[p.mediaId]);
    await client.query('UPDATE encrypted_conversation_messages SET media_id=$2 WHERE id=$1',[p.id,p.mediaId]);
  }
  async function authorize(context,object,action) {
    validateObject(object);
    return withTransaction(async client=>{
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('winga-encrypted-transport'))`);
      const row=(await client.query('SELECT * FROM encrypted_conversation_media WHERE id=$1 FOR UPDATE',[object.id])).rows[0];
      need(row && row.bytes===object.bytes && row.sha256===object.sha256);
      if(action==='cleanup') {
        need(row.status==='cleaning' && row.cleanup_lease===context.lease && Date.parse(row.lease_until)>Date.now());return true;
      }
      const op=context.proof;
      need(op && Object.keys(op).sort().join(',')==='action,actorId,issuedAt,payload,requestId,signature'
        && op.action===`media-${action}` && JSON.stringify(op.payload,Object.keys(op.payload||{}).sort())===JSON.stringify(object,Object.keys(object).sort()));
      await authorizeDevice(client,context,op);
      const g=(await client.query('SELECT * FROM encrypted_conversations WHERE id=$1',[row.conversation_id])).rows[0];
      await access(client,g,op.actorId,context.owner);need(g.status==='active');
      if(action==='upload') {
        need(row.uploader_device===op.actorId && ['reserved','uploaded','attached'].includes(row.status));
        // Extend before R2 I/O so cleanup cannot claim an in-flight bounded upload.
        if(row.status!=='attached')await client.query(`UPDATE encrypted_conversation_media SET expires_at=GREATEST(expires_at,NOW()+INTERVAL '1 hour') WHERE id=$1`,[row.id]);
      } else need(action==='download' && row.status==='attached');
      return true;
    });
  }
  async function uploaded(context,object) {
    await authorize(context,object,'upload');
    return withTransaction(async client=>{
      await client.query(`UPDATE encrypted_conversation_media SET status='uploaded' WHERE id=$1 AND status='reserved'`,[object.id]);
      return object;
    });
  }
  async function claim(limit=5) {
    need(Number.isInteger(limit)&&limit>=1&&limit<=5,'private_media_cleanup_invalid',400);
    return withTransaction(async client=>{
      const rows=(await client.query(`SELECT * FROM encrypted_conversation_media WHERE
        (status IN ('reserved','uploaded') AND expires_at<NOW()) OR (status='cleaning' AND lease_until<NOW())
        ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED`,[limit])).rows;
      const jobs=[];
      for(const row of rows) {
        const lease=crypto.randomUUID();
        await client.query(`UPDATE encrypted_conversation_media SET status='cleaning',cleanup_lease=$2,lease_until=NOW()+INTERVAL '5 minutes' WHERE id=$1`,[row.id,lease]);
        jobs.push({object:objectFor(row),lease});
      }
      return jobs;
    });
  }
  async function finish({object,lease}) {
    return withTransaction(client=>client.query(`UPDATE encrypted_conversation_media SET status='deleted',cleanup_lease=NULL,lease_until=NULL
      WHERE id=$1 AND status='cleaning' AND cleanup_lease=$2`,[object.id,lease]));
  }
  return {reserve,attach,authorize,uploaded,claim,finish};
}
module.exports={createEncryptedMediaLedger};
