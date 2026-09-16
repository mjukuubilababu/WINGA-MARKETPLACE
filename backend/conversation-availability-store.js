const {
  canTransitionAvailability,
  normalizeQuantity,
  statusForAvailabilityAction
} = require("./conversation-availability-domain");

function createConversationAvailabilityStore({ query, withTransaction, toISOString }) {
  const selectRequest = `SELECT id,conversation_id AS "conversationId",product_id AS "productId",
    buyer_username AS "buyerUsername",seller_username AS "sellerUsername",
    requested_size AS "requestedSize",requested_color AS "requestedColor",
    requested_quantity AS "requestedQuantity",status,response_product_id AS "responseProductId",
    responded_at AS "respondedAt",created_at AS "createdAt",updated_at AS "updatedAt",
    row_version AS "rowVersion" FROM conversation_availability_requests`;
  const normalize = row => row ? ({
    ...row,
    requestedQuantity: Number(row.requestedQuantity || 1),
    rowVersion: Number(row.rowVersion || 1),
    respondedAt: toISOString(row.respondedAt),
    createdAt: toISOString(row.createdAt),
    updatedAt: toISOString(row.updatedAt)
  }) : null;

  async function readConversationAvailabilityRequests(username = "", withUser = "", limit = 30) {
    const conversationId = [username, withUser].filter(Boolean).sort().join("::");
    if (!username || !withUser || username === withUser) return [];
    const result = await query(
      `${selectRequest} WHERE conversation_id=$1 AND ($2=buyer_username OR $2=seller_username)
       ORDER BY updated_at DESC,id DESC LIMIT $3`,
      [conversationId, username, Math.max(1, Math.min(50, Number(limit) || 30))]
    );
    return (result.rows || []).map(normalize);
  }

  async function createConversationAvailabilityRequest(input = {}) {
    return withTransaction(async client => {
      const quantity = normalizeQuantity(input.requestedQuantity);
      if (!quantity) return { created: false, code: "invalid_quantity" };
      const productResult = await client.query(
        `SELECT p.id,p.uploaded_by AS "sellerUsername",p.status,p.availability,
                u.status AS "sellerStatus"
           FROM products p JOIN users u ON u.username=p.uploaded_by
          WHERE p.id=$1 FOR SHARE`,
        [input.productId]
      );
      const product = productResult.rows?.[0];
      if (!product) return { created: false, code: "product_not_found" };
      if (product.sellerUsername === input.buyerUsername) return { created: false, code: "self_request" };
      if (input.expectedSellerUsername && product.sellerUsername !== input.expectedSellerUsername) {
        return { created: false, code: "seller_mismatch" };
      }
      if (product.status !== "approved" || product.availability === "sold_out") {
        return { created: false, code: "product_unavailable" };
      }
      if (product.sellerStatus !== "active") return { created: false, code: "seller_unavailable" };
      const blocked = await client.query(
        `SELECT 1 FROM user_blocks WHERE
         ((blocker_username=$1 AND blocked_username=$2) OR (blocker_username=$2 AND blocked_username=$1)) LIMIT 1`,
        [input.buyerUsername, product.sellerUsername]
      );
      if (blocked.rowCount) return { created: false, code: "availability_blocked" };
      const conversationId = [input.buyerUsername, product.sellerUsername].sort().join("::");
      const duplicate = await client.query(
        "SELECT request_id,actor_username,action FROM conversation_availability_events WHERE idempotency_key=$1",
        [input.idempotencyKey]
      );
      if (duplicate.rowCount) {
        const existing = await client.query(`${selectRequest} WHERE id=$1`, [duplicate.rows[0].request_id]);
        const previous=normalize(existing.rows?.[0]);
        const event=duplicate.rows[0];
        if(event.actor_username!==input.buyerUsername || event.action!=="REQUEST"
          || previous?.buyerUsername!==input.buyerUsername || previous?.sellerUsername!==product.sellerUsername
          || previous?.productId!==input.productId || previous?.requestedSize!==input.requestedSize
          || previous?.requestedColor!==input.requestedColor || previous?.requestedQuantity!==quantity){
          return {created:false,code:"idempotency_conflict"};
        }
        return { created: true, duplicate: true, request: normalize(existing.rows?.[0]) };
      }
      await client.query(
        `INSERT INTO conversation_availability_requests(
           id,conversation_id,product_id,buyer_username,seller_username,
           requested_size,requested_color,requested_quantity,status
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'REQUESTED')`,
        [input.id, conversationId, input.productId, input.buyerUsername, product.sellerUsername,
          input.requestedSize, input.requestedColor, quantity]
      );
      await client.query(
        `INSERT INTO conversation_availability_events(
           id,request_id,actor_username,action,from_status,to_status,idempotency_key
         ) VALUES($1,$2,$3,'REQUEST','','REQUESTED',$4)`,
        [input.eventId, input.id, input.buyerUsername, input.idempotencyKey]
      );
      await client.query(
        `INSERT INTO notifications(id,user_id,actor_username,type,conversation_id,title,body,is_read,created_at)
         VALUES($1,$2,$3,'request',$4,'Availability request','A buyer asked about product availability.',FALSE,NOW())`,
        [input.notificationId, product.sellerUsername, input.buyerUsername, conversationId]
      );
      const created = await client.query(`${selectRequest} WHERE id=$1`, [input.id]);
      return { created: true, duplicate: false, request: normalize(created.rows[0]) };
    });
  }

  async function transitionConversationAvailabilityRequest(input = {}) {
    return withTransaction(async client => {
      const found = await client.query(`${selectRequest} WHERE id=$1 FOR UPDATE`, [input.requestId]);
      const request = normalize(found.rows?.[0]);
      if (!request) return { updated: false, code: "request_not_found" };
      if (![request.buyerUsername,request.sellerUsername].includes(input.actorUsername)) {
        return {updated:false,code:"forbidden_transition"};
      }
      const duplicate = await client.query(
        "SELECT request_id,actor_username,action FROM conversation_availability_events WHERE idempotency_key=$1",
        [input.idempotencyKey]
      );
      if (duplicate.rowCount) {
        const event=duplicate.rows[0];
        if(event.request_id!==request.id || event.actor_username!==input.actorUsername || event.action!==input.action
          || (input.action==="SUGGEST_ALTERNATIVE" && request.responseProductId!==input.responseProductId)){
          return {updated:false,code:"idempotency_conflict"};
        }
        return { updated: true, duplicate: true, request };
      }
      const blocked = await client.query(
        `SELECT 1 FROM user_blocks WHERE
         ((blocker_username=$1 AND blocked_username=$2) OR (blocker_username=$2 AND blocked_username=$1)) LIMIT 1`,
        [request.buyerUsername, request.sellerUsername]
      );
      if (blocked.rowCount) return { updated: false, code: "availability_blocked" };
      if (!canTransitionAvailability(request, input.actorUsername, input.action)) {
        return { updated: false, code: "forbidden_transition" };
      }
      let responseProductId = null;
      if (input.action === "SUGGEST_ALTERNATIVE") {
        const alternative = await client.query(
          `SELECT id FROM products WHERE id=$1 AND uploaded_by=$2 AND status='approved'
             AND availability='available' FOR SHARE`,
          [input.responseProductId, request.sellerUsername]
        );
        if (!alternative.rowCount || input.responseProductId === request.productId) {
          return { updated: false, code: "invalid_alternative" };
        }
        responseProductId = input.responseProductId;
      }
      const nextStatus = statusForAvailabilityAction(input.action);
      await client.query(
        `UPDATE conversation_availability_requests
            SET status=$2,response_product_id=$3,
                responded_at=CASE WHEN $2<>'CANCELLED' THEN NOW() ELSE responded_at END,
                updated_at=NOW(),row_version=row_version+1
          WHERE id=$1`,
        [request.id, nextStatus, responseProductId]
      );
      await client.query(
        `INSERT INTO conversation_availability_events(
           id,request_id,actor_username,action,from_status,to_status,idempotency_key
         ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [input.eventId, request.id, input.actorUsername, input.action, request.status, nextStatus, input.idempotencyKey]
      );
      const recipient = input.actorUsername === request.buyerUsername
        ? request.sellerUsername
        : request.buyerUsername;
      await client.query(
        `INSERT INTO notifications(id,user_id,actor_username,type,conversation_id,title,body,is_read,created_at)
         VALUES($1,$2,$3,'request',$4,$5,$6,FALSE,NOW())`,
        [input.notificationId, recipient, input.actorUsername, request.conversationId,
          "Availability updated", `The availability request is now ${nextStatus.toLowerCase().replace(/_/g, " ")}.`]
      );
      const current = await client.query(`${selectRequest} WHERE id=$1`, [request.id]);
      const updatedRequest = normalize(current.rows[0]);
      return {
        updated: true,
        duplicate: false,
        request: updatedRequest,
        demandEvent: nextStatus === "OUT_OF_STOCK" ? {
          demandId: `demand-${request.id}`,
          dedupeKey: `conversation-availability:${request.id}`,
          productId: request.productId,
          sellerId: request.sellerUsername,
          buyerId: request.buyerUsername,
          sessionId: "",
          action: "notify_when_available",
          color: request.requestedColor,
          size: request.requestedSize,
          country: "",
          region: "",
          demandScore: 4,
          metadata: { source: "conversation_availability", requestId: request.id, quantity: request.requestedQuantity },
          createdAt: new Date().toISOString(),
          audienceType: "user",
          audienceKey: `user:${request.buyerUsername}`
        } : null
      };
    });
  }

  return {
    readConversationAvailabilityRequests,
    createConversationAvailabilityRequest,
    transitionConversationAvailabilityRequest
  };
}

module.exports = { createConversationAvailabilityStore };
