const { canAct, normalizeAmount, statusForAction } = require("./conversation-offers-domain");

function createConversationOffersStore({ query, withTransaction, toISOString }) {
  const selectOffer = `SELECT id,conversation_id AS "conversationId",product_id AS "productId",
    buyer_username AS "buyerUsername",seller_username AS "sellerUsername",amount,currency,status,
    last_actor_username AS "lastActorUsername",expires_at AS "expiresAt",accepted_at AS "acceptedAt",
    converted_order_id AS "convertedOrderId",created_at AS "createdAt",updated_at AS "updatedAt",
    row_version AS "rowVersion" FROM conversation_offers`;
  const normalize = row => row ? ({ ...row, amount:Number(row.amount||0), rowVersion:Number(row.rowVersion||1),
    expiresAt:toISOString(row.expiresAt),acceptedAt:toISOString(row.acceptedAt),createdAt:toISOString(row.createdAt),updatedAt:toISOString(row.updatedAt) }) : null;

  async function readConversationOffers(username = "", withUser = "", limit = 30) {
    const conversationId=[username,withUser].filter(Boolean).sort().join("::");
    if(!username || !withUser || username===withUser) return [];
    await query(`UPDATE conversation_offers SET status='EXPIRED',updated_at=NOW(),row_version=row_version+1
      WHERE conversation_id=$1 AND status IN ('PROPOSED','COUNTERED') AND expires_at<=NOW()`,[conversationId]);
    const result=await query(`${selectOffer} WHERE conversation_id=$1 AND ($2=buyer_username OR $2=seller_username)
      ORDER BY updated_at DESC,id DESC LIMIT $3`,[conversationId,username,Math.max(1,Math.min(50,Number(limit)||30))]);
    return (result.rows||[]).map(normalize);
  }

  async function createConversationOffer(input = {}) {
    return withTransaction(async client => {
      const amount=normalizeAmount(input.amount);
      if(!amount) return {created:false,code:"invalid_amount"};
      const productResult=await client.query(`SELECT p.id,p.uploaded_by AS "sellerUsername",p.status,p.availability,p.price,
        u.status AS "sellerStatus" FROM products p JOIN users u ON u.username=p.uploaded_by WHERE p.id=$1 FOR SHARE`,[input.productId]);
      const product=productResult.rows?.[0];
      if(!product) return {created:false,code:"product_not_found"};
      if(product.sellerUsername===input.buyerUsername) return {created:false,code:"self_offer"};
      if(input.expectedSellerUsername && product.sellerUsername!==input.expectedSellerUsername) return {created:false,code:"seller_mismatch"};
      if(product.status!=="approved" || product.availability!=="available") return {created:false,code:"product_unavailable"};
      if(product.sellerStatus!=="active") return {created:false,code:"seller_unavailable"};
      const blocked=await client.query(`SELECT 1 FROM user_blocks WHERE
        ((blocker_username=$1 AND blocked_username=$2) OR (blocker_username=$2 AND blocked_username=$1)) LIMIT 1`,
        [input.buyerUsername,product.sellerUsername]);
      if(blocked.rowCount) return {created:false,code:"offer_blocked"};
      const conversationId=[input.buyerUsername,product.sellerUsername].sort().join("::");
      const duplicate=await client.query(`SELECT offer_id FROM conversation_offer_events WHERE idempotency_key=$1`,[input.idempotencyKey]);
      if(duplicate.rowCount){
        const existing=await client.query(`${selectOffer} WHERE id=$1`,[duplicate.rows[0].offer_id]);
        return {created:true,duplicate:true,offer:normalize(existing.rows?.[0])};
      }
      await client.query(`INSERT INTO conversation_offers(id,conversation_id,product_id,buyer_username,seller_username,
        amount,currency,status,last_actor_username,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'PROPOSED',$4,$8)`,
        [input.id,conversationId,input.productId,input.buyerUsername,product.sellerUsername,amount,input.currency,input.expiresAt]);
      await client.query(`INSERT INTO conversation_offer_events(id,offer_id,actor_username,action,from_status,to_status,amount,idempotency_key)
        VALUES($1,$2,$3,'PROPOSE','','PROPOSED',$4,$5)`,[input.eventId,input.id,input.buyerUsername,amount,input.idempotencyKey]);
      await client.query(`INSERT INTO notifications(id,user_id,actor_username,type,conversation_id,title,body,is_read,created_at)
        VALUES($1,$2,$3,'offer',$4,'New offer','A buyer sent a structured offer.',FALSE,NOW())`,
        [input.notificationId,product.sellerUsername,input.buyerUsername,conversationId]);
      const created=await client.query(`${selectOffer} WHERE id=$1`,[input.id]);
      return {created:true,duplicate:false,offer:normalize(created.rows[0])};
    });
  }

  async function transitionConversationOffer(input = {}) {
    return withTransaction(async client => {
      const duplicate=await client.query(`SELECT offer_id FROM conversation_offer_events WHERE idempotency_key=$1`,[input.idempotencyKey]);
      if(duplicate.rowCount){
        const existing=await client.query(`${selectOffer} WHERE id=$1`,[duplicate.rows[0].offer_id]);
        return {updated:true,duplicate:true,offer:normalize(existing.rows?.[0])};
      }
      const found=await client.query(`${selectOffer} WHERE id=$1 FOR UPDATE`,[input.offerId]);
      const offer=normalize(found.rows?.[0]);
      if(!offer) return {updated:false,code:"offer_not_found"};
      if(new Date(offer.expiresAt).getTime()<=Date.now()){
        await client.query(`UPDATE conversation_offers SET status='EXPIRED',updated_at=NOW(),row_version=row_version+1 WHERE id=$1`,[offer.id]);
        return {updated:false,code:"offer_expired"};
      }
      const blocked=await client.query(`SELECT 1 FROM user_blocks WHERE
        ((blocker_username=$1 AND blocked_username=$2) OR (blocker_username=$2 AND blocked_username=$1)) LIMIT 1`,
        [offer.buyerUsername,offer.sellerUsername]);
      if(blocked.rowCount) return {updated:false,code:"offer_blocked"};
      if(!canAct(offer,input.actorUsername,input.action)) return {updated:false,code:"forbidden_transition"};
      const nextStatus=statusForAction(input.action);
      const amount=input.action==="COUNTER"?normalizeAmount(input.amount):offer.amount;
      if(!amount) return {updated:false,code:"invalid_amount"};
      const updated=await client.query(`UPDATE conversation_offers SET amount=$2,status=$3,last_actor_username=$4,
        accepted_at=CASE WHEN $3='ACCEPTED' THEN NOW() ELSE accepted_at END,updated_at=NOW(),row_version=row_version+1
        WHERE id=$1 RETURNING *`,[offer.id,amount,nextStatus,input.actorUsername]);
      await client.query(`INSERT INTO conversation_offer_events(id,offer_id,actor_username,action,from_status,to_status,amount,idempotency_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[input.eventId,offer.id,input.actorUsername,input.action,offer.status,nextStatus,amount,input.idempotencyKey]);
      const recipient=input.actorUsername===offer.buyerUsername?offer.sellerUsername:offer.buyerUsername;
      await client.query(`INSERT INTO notifications(id,user_id,actor_username,type,conversation_id,title,body,is_read,created_at)
        VALUES($1,$2,$3,'offer',$4,$5,$6,FALSE,NOW())`,[input.notificationId,recipient,input.actorUsername,offer.conversationId,
          `Offer ${nextStatus.toLowerCase().replace(/_/g," ")}`,`The offer is now ${nextStatus.toLowerCase().replace(/_/g," ")}.`]);
      const current=await client.query(`${selectOffer} WHERE id=$1`,[offer.id]);
      return {updated:true,duplicate:false,offer:normalize(current.rows[0])};
    });
  }

  return { readConversationOffers,createConversationOffer,transitionConversationOffer };
}
module.exports={createConversationOffersStore};
