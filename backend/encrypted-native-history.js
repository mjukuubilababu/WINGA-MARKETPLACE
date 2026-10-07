const crypto=require('node:crypto');
const {failure,validateCapsule}=require('./encrypted-content-contract');
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const canonical=v=>JSON.stringify(v,Object.keys(v).sort());
const hash=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
const need=(v,code='encrypted_history_invalid',status=400)=>{if(!v)throw failure(status,code);};
const proof=(c,op)=>({owner:c.owner,sessionId:c.deviceId,...op});
const publicKey=v=>{
  need(typeof v==='string'&&/^[A-Za-z0-9_-]{87}$/.test(v));
  const b=Buffer.from(v,'base64url');need(b.length===65&&b[0]===4&&b.toString('base64url')===v);
  try{crypto.ECDH.convertKey(b,'prime256v1',undefined,undefined,'uncompressed');}catch{need(false);}
};
const fields=Object.freeze({
  'history-reserve':['id','conversationId','epoch','donorDeviceId','publicKey','historyHash'],
  'history-tasks':[],
  'history-page-put':['id','conversationId','epoch','index','capsule','hash'],
  'history-publish':['id','conversationId','epoch','publicKey','capsule','hash','pageCount'],
  'history-pages':['id','conversationId','epoch','after'],
  'history-accept':['id','conversationId','epoch','hash']
  ,'history-cancel':['id','conversationId','epoch']
});
function createNativeHistory({access,frozen,roster}) {
  async function authorized(client,c,op,g,r) {
    need(g&&g.status==='active'&&g.epoch===op.payload.epoch,'encrypted_history_membership_changed',409);
    await access(client,g,op.actorId,c.owner);
    need(!await frozen(client,g.id),'encrypted_membership_pending',409);
    if(r) {
      need(r.owner_id===c.owner&&r.epoch===g.epoch&&new Date(r.expires_at).getTime()>Date.now()
        && [r.recipient_device,r.donor_device].includes(op.actorId),'encrypted_history_access_denied',403);
      const members=await roster(client,g);
      need([r.recipient_device,r.donor_device].every(id=>members.some(m=>m.id===id&&m.owner===c.owner&&m.status==='active')),
        'encrypted_history_access_denied',403);
    }
  }
  async function handle(client,c,op,g) {
    const p=op.payload;
    if(op.action==='history-tasks') {
      // Lock group rows in group order without changing the task-ID keyset cursor.
      await client.query(`SELECT g.id FROM encrypted_conversations g WHERE EXISTS(
        SELECT 1 FROM encrypted_conversation_history_transfers t WHERE t.conversation_id=g.id AND t.owner_id=$1
          AND (t.donor_device=$2 OR t.recipient_device=$2) AND t.status IN ('pending','ready') AND t.expires_at>NOW()
          AND ($3::text IS NULL OR t.id>$3)) ORDER BY g.id FOR SHARE OF g`,[c.owner,op.actorId,p.after||null]);
      const rows=(await client.query(`SELECT t.* FROM encrypted_conversation_history_transfers t
        JOIN encrypted_conversations g ON g.id=t.conversation_id AND g.epoch=t.epoch AND g.status='active'
        WHERE t.owner_id=$1 AND (t.donor_device=$2 OR t.recipient_device=$2) AND t.status IN ('pending','ready')
        AND t.expires_at>NOW() AND ($3::text IS NULL OR t.id>$3) ORDER BY t.id LIMIT 26`,[c.owner,op.actorId,p.after||null])).rows;
      const tasks=[];
      for(const r of rows.slice(0,25)) {
        const group=(await client.query('SELECT * FROM encrypted_conversations WHERE id=$1',[r.conversation_id])).rows[0];
        try{await authorized(client,c,{...op,payload:{epoch:r.epoch}},group,r);}
        catch(e){if([403,409].includes(e.status))continue;throw e;}
        tasks.push({id:r.id,conversationId:r.conversation_id,epoch:r.epoch,owner:r.owner_id,recipientDeviceId:r.recipient_device,
          donorDeviceId:r.donor_device,status:r.status,request:r.request,requestProof:r.request_proof,
          publication:r.publication,publicationProof:r.publication_proof});
      }
      return {version:1,tasks,next:rows.length>25?rows[24].id:null};
    }
    need(uuid(p.id));await authorized(client,c,op,g);
    let r=(await client.query('SELECT * FROM encrypted_conversation_history_transfers WHERE id=$1 FOR UPDATE',[p.id])).rows[0];
    if(op.action==='history-reserve') {
      publicKey(p.publicKey);need(uuid(p.donorDeviceId)&&p.donorDeviceId!==op.actorId&&typeof p.historyHash==='string'&&/^[a-f0-9]{64}$/.test(p.historyHash));
      if(r) {
        await authorized(client,c,op,g,r);
        need(r.recipient_device===op.actorId&&canonical(r.request)===canonical(p),'encrypted_history_conflict',409);
        return {version:1,id:r.id,status:r.status,requestProof:r.request_proof};
      }
      const members=await roster(client,g);
      need(members.some(m=>m.id===p.donorDeviceId&&m.owner===c.owner&&m.status==='active'),'encrypted_history_access_denied',403);
      // Expired or superseded membership requests cannot pin an account's staging quota.
      await client.query(`DELETE FROM encrypted_conversation_history_transfers t WHERE t.owner_id=$1
        AND (t.expires_at<=NOW() OR NOT EXISTS(SELECT 1 FROM encrypted_conversations g WHERE g.id=t.conversation_id AND g.epoch=t.epoch))`,[c.owner]);
      need(!(await client.query(`SELECT 1 FROM encrypted_conversation_history_transfers WHERE conversation_id=$1 AND recipient_device=$2 AND status IN ('pending','ready')`,[g.id,op.actorId])).rows.length,
        'encrypted_history_pending',409);
      const count=(await client.query(`SELECT COUNT(*)::int AS n,COUNT(*) FILTER(WHERE status IN ('pending','ready'))::int AS pending
        FROM encrypted_conversation_history_transfers WHERE owner_id=$1 AND (created_at>NOW()-interval '1 minute' OR status IN ('pending','ready'))`,[c.owner])).rows[0];
      need(count.n<32&&count.pending<8,'encrypted_history_quota',429);
      await client.query(`INSERT INTO encrypted_conversation_history_transfers(id,conversation_id,owner_id,epoch,recipient_device,donor_device,request,request_proof)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[p.id,g.id,c.owner,g.epoch,op.actorId,p.donorDeviceId,canonical(p),JSON.stringify(proof(c,op))]);
      return {version:1,id:p.id,status:'pending',requestProof:proof(c,op)};
    }
    need(r,'encrypted_history_missing',404);await authorized(client,c,op,g,r);
    if(op.action==='history-cancel') {
      need(op.actorId===r.recipient_device,'encrypted_history_access_denied',403);
      need(r.status!=='accepted','encrypted_history_conflict',409);
      await client.query(`UPDATE encrypted_conversation_history_transfers SET status='cancelled',publication=NULL,publication_proof=NULL WHERE id=$1`,[r.id]);
      await client.query('DELETE FROM encrypted_conversation_history_pages WHERE transfer_id=$1',[r.id]);
      return {version:1,id:r.id,status:'cancelled'};
    }
    need(r.status!=='cancelled','encrypted_history_cancelled',409);
    if(op.action==='history-pages') {
      need(op.actorId===r.recipient_device,'encrypted_history_access_denied',403);
      need(Number.isInteger(p.after)&&p.after>=-1&&p.after<1024);
      need(r.status==='ready','encrypted_history_pending',409);
      const pages=(await client.query(`SELECT page_index AS index,capsule,hash FROM encrypted_conversation_history_pages
        WHERE transfer_id=$1 AND page_index>$2 ORDER BY page_index LIMIT 5`,[r.id,p.after])).rows;
      return {version:1,id:r.id,publication:r.publication,publicationProof:r.publication_proof,pages:pages.slice(0,4),next:pages.length>4?pages[3].index:null};
    }
    if(op.action==='history-accept') {
      need(op.actorId===r.recipient_device&&r.status!=='pending'&&p.hash===r.publication?.hash,'encrypted_history_conflict',409);
      // Retain only bounded retry evidence, not a completed encrypted archive.
      await client.query(`UPDATE encrypted_conversation_history_transfers SET status='accepted',publication=publication-'capsule',publication_proof='{}'::jsonb WHERE id=$1`,[r.id]);
      await client.query('DELETE FROM encrypted_conversation_history_pages WHERE transfer_id=$1',[r.id]);
      return {version:1,id:r.id,status:'accepted',hash:p.hash};
    }
    need(op.actorId===r.donor_device,'encrypted_history_access_denied',403);
    const capsule=validateCapsule(p.capsule,c.owner,'0'),bytes=Buffer.from(capsule.ciphertext,'base64url').length;
    need(typeof p.hash==='string'&&hash(capsule)===p.hash);
    if(op.action==='history-page-put') {
      need(Number.isInteger(p.index)&&p.index>=0&&p.index<1024&&capsule.id===r.id+':'+p.index&&bytes<=131088);
      const prior=(await client.query(`SELECT hash,capsule FROM encrypted_conversation_history_pages WHERE transfer_id=$1 AND page_index=$2`,[r.id,p.index])).rows[0];
      if(prior){need(prior.hash===p.hash&&canonical(prior.capsule)===canonical(capsule),'encrypted_history_conflict',409);return {version:1,id:r.id,index:p.index,hash:p.hash};}
      need(r.status==='pending','encrypted_history_conflict',409);
      await client.query(`INSERT INTO encrypted_conversation_history_pages(transfer_id,page_index,capsule,hash,bytes) VALUES($1,$2,$3,$4,$5)`,[r.id,p.index,JSON.stringify(capsule),p.hash,bytes]);
      return {version:1,id:r.id,index:p.index,hash:p.hash};
    }
    publicKey(p.publicKey);need(capsule.id===r.id&&bytes<=184320+16&&Number.isInteger(p.pageCount)&&p.pageCount>=0&&p.pageCount<=1024);
    if(r.status!=='pending') {
      const comparable=r.status==='accepted'?Object.fromEntries(Object.entries(p).filter(([k])=>k!=='capsule')):p;
      need(canonical(r.publication)===canonical(comparable),'encrypted_history_conflict',409);
      return {version:1,id:r.id,status:r.status,hash:p.hash};
    }
    const stats=(await client.query(`SELECT COUNT(*)::int AS n,MIN(page_index) AS first,MAX(page_index) AS last FROM encrypted_conversation_history_pages WHERE transfer_id=$1`,[r.id])).rows[0];
    need(stats.n===p.pageCount&&(!p.pageCount||(stats.first===0&&stats.last===p.pageCount-1)),'encrypted_history_incomplete',409);
    await client.query(`UPDATE encrypted_conversation_history_transfers SET status='ready',publication=$2,publication_proof=$3 WHERE id=$1`,[r.id,JSON.stringify(p),JSON.stringify(proof(c,op))]);
    return {version:1,id:r.id,status:'ready',hash:p.hash};
  }
  async function prune(client,batchSize=100) {
    need(Number.isInteger(batchSize)&&batchSize>=1&&batchSize<=1000);
    const result=await client.query(`DELETE FROM encrypted_conversation_history_transfers WHERE id IN
      (SELECT id FROM encrypted_conversation_history_transfers WHERE expires_at<=NOW() ORDER BY expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED)`,[batchSize]);
    return {pruned:result.rowCount};
  }
  return {handle,prune};
}
module.exports={createNativeHistory,fields};
