const {failure}=require('./encrypted-content-contract');
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const need=(ok,code='encrypted_seller_request_rejected',status=403)=>{if(!ok)throw failure(status,code);};
const fields=Object.freeze({
  'seller-question-reserve':['id','conversationId','shareId','productId','sellerId','directId','questionHash'],
  'seller-question-read':['id','conversationId'],
  'seller-answer-register':['id','conversationId','messageId','answerHash'],
  'seller-evidence':['id','conversationId']
});
function createRoomSellers({rooms,access,consumeQuota,frozen}){
  async function group(client,id){return (await client.query('SELECT * FROM encrypted_conversations WHERE id=$1',[id])).rows[0];}
  async function roomAccess(client,c,actor,id,epoch){const g=await group(client,id);await rooms.access(client,c,actor,g,{pending:false});
    if(epoch)need((await client.query(`SELECT 1 FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1 AND epoch=$2 AND device_id=$3 AND owner_id=$4`,[id,epoch,actor,c.owner])).rows.length);
    return g;}
  async function directAccess(client,c,op,q){const g=await group(client,q.direct_id);
    need(g?.kind==='direct'&&g.status==='active'&&[g.creator,g.recipient].includes(q.buyer_id)&&[g.creator,g.recipient].includes(q.seller_id));
    await access(client,g,op.actorId,c.owner);need(!await frozen(client,g.id),'encrypted_membership_pending',409);return g;}
  async function product(client,id,seller){need(typeof id==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(id));
    const r=(await client.query(`SELECT p.id FROM products p WHERE p.id=$1 AND p.uploaded_by=$2 AND p.status='approved'
      AND NOT EXISTS(SELECT 1 FROM public_content_visibility v WHERE v.content_type='product' AND v.content_id=p.id AND v.visibility<>'public') FOR SHARE OF p`,[id,seller])).rows;
    need(r.length===1,'encrypted_seller_product_unavailable',404);}
  async function questionMessage(client,q){const m=(await client.query('SELECT * FROM encrypted_conversation_messages WHERE id=$1',[q.id])).rows[0];
    need(m&&m.conversation_id===q.direct_id&&m.sender_device===q.actor_device,'encrypted_seller_question_pending',409);return m;}
  function evidence(q,a){return {version:1,question:{id:q.id,shareId:q.share_id,productId:q.product_id,buyerId:q.buyer_id,sellerId:q.seller_id,questionHash:q.question_hash},
    answer:a?{messageId:a.message_id,answerHash:a.answer_hash,proof:a.proof,anchor:a.anchor}:null};}
  async function handle(client,c,op){const p=op.payload;need(uuid(p.id)&&uuid(p.conversationId),'encrypted_seller_request_invalid',400);
    if(op.action==='seller-question-reserve'){
      need(uuid(p.shareId)&&uuid(p.directId)&&digest(p.questionHash),'encrypted_seller_request_invalid',400);
      const g=await roomAccess(client,c,op.actorId,p.conversationId);
      const share=(await client.query('SELECT * FROM encrypted_conversation_messages WHERE id=$1',[p.shareId])).rows[0];
      need(share?.conversation_id===g.id);await roomAccess(client,c,op.actorId,g.id,share.epoch);
      await product(client,p.productId,p.sellerId);
      const q={id:p.id,room_id:g.id,room_epoch:share.epoch,share_id:p.shareId,buyer_id:c.owner,seller_id:p.sellerId,
        actor_device:op.actorId,product_id:p.productId,direct_id:p.directId,question_hash:p.questionHash};
      await directAccess(client,c,op,q);need(c.owner!==p.sellerId);
      const prior=(await client.query('SELECT * FROM encrypted_room_seller_questions WHERE id=$1',[p.id])).rows[0];
      if(prior){need(Object.keys(q).every(k=>prior[k]===q[k]),'encrypted_seller_request_conflict',409);return {version:1,id:p.id};}
      await consumeQuota(client,c.owner);
      await client.query(`INSERT INTO encrypted_room_seller_questions(id,room_id,room_epoch,share_id,buyer_id,seller_id,actor_device,product_id,direct_id,question_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,Object.values(q));return {version:1,id:p.id};
    }
    const q=(await client.query('SELECT * FROM encrypted_room_seller_questions WHERE id=$1',[p.id])).rows[0];need(q);
    if(op.action==='seller-evidence'){
      need(p.conversationId===q.room_id);await roomAccess(client,c,op.actorId,q.room_id,q.room_epoch);await questionMessage(client,q);
      const a=(await client.query('SELECT * FROM encrypted_room_seller_answers WHERE question_id=$1',[q.id])).rows[0];return evidence(q,a);
    }
    need(p.conversationId===q.direct_id&&[q.buyer_id,q.seller_id].includes(c.owner));
    await directAccess(client,c,op,q);await questionMessage(client,q);
    if(op.action==='seller-question-read')return {version:1,question:{id:q.id,productId:q.product_id,buyerId:q.buyer_id,sellerId:q.seller_id,questionHash:q.question_hash},
      answered:Boolean((await client.query('SELECT 1 FROM encrypted_room_seller_answers WHERE question_id=$1',[q.id])).rows.length)};
    need(c.owner===q.seller_id&&uuid(p.messageId)&&digest(p.answerHash),'encrypted_seller_answer_rejected');
    await product(client,q.product_id,c.owner);
    const m=(await client.query('SELECT * FROM encrypted_conversation_messages WHERE id=$1',[p.messageId])).rows[0];
    need(m?.conversation_id===q.direct_id&&m.sender_device===op.actorId,'encrypted_seller_answer_pending',409);
    const prior=(await client.query('SELECT * FROM encrypted_room_seller_answers WHERE question_id=$1',[q.id])).rows[0];
    if(prior){need(prior.message_id===p.messageId&&prior.answer_hash===p.answerHash,'encrypted_seller_answer_conflict',409);return {version:1,id:q.id};}
    const d=(await client.query(`SELECT id,owner_id AS owner,public_key AS "publicKey",fingerprint,status FROM conversation_crypto_devices WHERE id=$1 AND status='active'`,[op.actorId])).rows[0];need(d?.owner===c.owner);
    await client.query(`INSERT INTO encrypted_room_seller_answers(question_id,message_id,answer_hash,proof,anchor) VALUES($1,$2,$3,$4,$5)`,
      [q.id,p.messageId,p.answerHash,JSON.stringify({owner:c.owner,sessionId:c.deviceId,...op}),JSON.stringify(d)]);
    return {version:1,id:q.id};
  }
  return {handle};
}
module.exports={fields,createRoomSellers};
