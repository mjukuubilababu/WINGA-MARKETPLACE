// Canonical relevance and current public-product safety for list/exact reads.
const toISOString=value=>{const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date.toISOString():'';};
async function readSellerCommerceOpportunities(client, sellerId = "", limit = 20, exactOpportunityId = "") {
    const safeSellerId = String(sellerId || "").trim().slice(0, 80);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
    if (!safeSellerId) return [];
    const exactId=String(exactOpportunityId||'');
    if(exactId&&!/^[A-Za-z0-9._:-]{1,100}$/.test(exactId))return [];
    const result = await client.query(
      `SELECT o.opportunity_id AS "opportunityId", o.type, o.source, o.query_key AS "queryKey",
              o.product_id AS "productId", o.category, o.region, o.color, o.size,
              o.demand_score::float8 AS "demandScore", o.supply_score::float8 AS "supplyScore",
              o.evidence_count AS "evidenceCount", o.metadata, o.status, o.expires_at AS "expiresAt",
              COUNT(sr.response_id) FILTER (WHERE sr.action_type NOT IN ('ignore', 'dismiss'))::int AS "responseCount",
              COALESCE(BOOL_OR(sr.seller_id = $1 AND sr.action_type NOT IN ('ignore', 'dismiss')), false) AS "sellerResponded"
       FROM commerce_opportunities o
       LEFT JOIN supply_responses sr ON sr.opportunity_id = o.opportunity_id AND sr.status = 'active'
       WHERE o.status IN ('open', 'responded') AND o.expires_at > NOW()
         ${exactId?'AND o.opportunity_id = $3':''}
         AND (
           o.category = '' OR EXISTS (
             SELECT 1 FROM products seller_product
             WHERE seller_product.uploaded_by = $1 AND seller_product.category = o.category
           ) OR EXISTS (
             SELECT 1 FROM users seller_user
             WHERE seller_user.username = $1
               AND (seller_user.primary_category = o.category OR o.category LIKE seller_user.primary_category || '-%')
           )
         )
       GROUP BY o.opportunity_id
       HAVING NOT COALESCE(BOOL_OR(sr.seller_id = $1 AND sr.action_type IN ('ignore', 'dismiss')), false)
       ORDER BY o.demand_score DESC, o.created_at DESC, o.opportunity_id
       LIMIT $2`,
      exactId?[safeSellerId,safeLimit,exactId]:[safeSellerId, safeLimit]
    );
    if(exactId&&result.rows?.[0]?.productId&&!await require('./growth-infrastructure').publicProduct(client,result.rows[0].productId,safeSellerId))return [];
    return (result.rows || []).map((row) => ({
      ...row,
      demandScore: Number(row.demandScore || 0),
      supplyScore: Number(row.supplyScore || 0),
      evidenceCount: Number(row.evidenceCount || 0),
      responseCount: Number(row.responseCount || 0),
      sellerResponded: row.sellerResponded === true,
      expiresAt: toISOString(row.expiresAt)
    }));
  }

module.exports={readSellerCommerceOpportunities};
