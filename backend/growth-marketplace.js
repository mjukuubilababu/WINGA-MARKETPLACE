// Read-only reports over canonical marketplace domains. Growth never writes demand or ranking.
function createMarketplaceGrowth({readQuery}) {
  const ratio=(a,b)=>Number(b)?Number(a)/Number(b):null;
  async function readMarketplaceLoopHealth() {
    const result=await readQuery(`WITH supply AS (
      SELECT p.category,COUNT(*)::int AS listings,
        COUNT(*) FILTER(WHERE p.availability='available')::int AS available,
        COUNT(DISTINCT p.uploaded_by) FILTER(WHERE p.availability='available')::int AS sellers
      FROM products p JOIN users u ON u.username=p.uploaded_by AND u.status='active'
      WHERE p.status='approved' AND NOT EXISTS(SELECT 1 FROM public_content_visibility v
        WHERE v.content_type='product' AND v.content_id=p.id AND v.visibility<>'public') GROUP BY p.category
    ), demand AS (
      SELECT detected_category AS category,COUNT(*)::int AS searches,
        COUNT(*) FILTER(WHERE result_count>0 AND zero_result IS NOT TRUE)::int AS matches,
        COUNT(DISTINCT audience_type||':'||audience_key)::int AS audiences
      FROM search_demand_events WHERE happened_at>=NOW()-INTERVAL '30 days' AND audience_key<>'' GROUP BY detected_category
    ), transactions AS (
      SELECT p.category,COUNT(*)::int AS orders,
        COUNT(*) FILTER(WHERE o.status='delivered')::int AS delivered,
        COUNT(*) FILTER(WHERE o.status IN ('cancelled','refunded'))::int AS failed
      FROM orders o JOIN products p ON p.id=o.product_id
      WHERE o.created_at>=NOW()-INTERVAL '30 days' AND o.buyer_username<>o.seller_username GROUP BY p.category
    ) SELECT COALESCE(s.category,d.category,t.category) AS category,
      COALESCE(s.listings,0)::int AS listings,COALESCE(s.available,0)::int AS available,
      COALESCE(s.sellers,0)::int AS sellers,COALESCE(d.searches,0)::int AS searches,
      COALESCE(d.matches,0)::int AS matches,COALESCE(d.audiences,0)::int AS audiences,
      COALESCE(t.orders,0)::int AS orders,COALESCE(t.delivered,0)::int AS delivered,COALESCE(t.failed,0)::int AS failed
      FROM supply s FULL JOIN demand d USING(category) FULL JOIN transactions t USING(category)
      ORDER BY COALESCE(d.searches,0) DESC,COALESCE(s.available,0) DESC LIMIT 50`);
    const regions=await readQuery(`SELECT region,detected_category AS category,
      COUNT(*)::int AS searches,COUNT(*) FILTER(WHERE result_count>0 AND zero_result IS NOT TRUE)::int AS matches,
      COUNT(DISTINCT audience_type||':'||audience_key)::int AS audiences
      FROM search_demand_events WHERE happened_at>=NOW()-INTERVAL '30 days' AND region<>'' AND audience_key<>''
      GROUP BY region,detected_category ORDER BY COUNT(*) DESC LIMIT 50`);
    const cohorts=await readQuery(`WITH publication AS (
      SELECT uploaded_by AS seller,MIN(created_at) AS published_at FROM products
      WHERE status='approved' GROUP BY uploaded_by
    ), first_value AS (
      SELECT p.uploaded_by AS seller,MIN(l.created_at) AS value_at FROM product_likes l JOIN products p ON p.id=l.product_id JOIN publication published ON published.seller=p.uploaded_by
      WHERE l.user_id<>p.uploaded_by AND l.created_at>=published.published_at GROUP BY p.uploaded_by
      UNION ALL SELECT o.seller_username,MIN(o.created_at) FROM orders o JOIN publication published ON published.seller=o.seller_username
      WHERE o.buyer_username<>o.seller_username AND o.status NOT IN ('cancelled','refunded') AND o.created_at>=published.published_at GROUP BY o.seller_username
    ), seller_value AS (SELECT seller,MIN(value_at) AS value_at FROM first_value GROUP BY seller)
    SELECT date_trunc('week',p.published_at) AS week,COUNT(*)::int AS published,
      COUNT(*) FILTER(WHERE v.value_at>=p.published_at)::int AS activated,
      AVG(EXTRACT(EPOCH FROM v.value_at-p.published_at)) FILTER(WHERE v.value_at>=p.published_at)::float8 AS seconds
      FROM publication p LEFT JOIN seller_value v USING(seller) WHERE p.published_at>=NOW()-INTERVAL '90 days'
      GROUP BY date_trunc('week',p.published_at) ORDER BY week DESC`);
    const lineage=await readQuery(`SELECT COUNT(DISTINCT r.eligibility_id)::int AS eligible,
      COUNT(DISTINCT r.eligibility_id) FILTER(WHERE r.metadata->>'sourceEventId' IS NOT NULL)::int AS linked,
      COUNT(DISTINCT r.eligibility_id) FILTER(WHERE c.outcome_type='created')::int AS ordered,
      COUNT(DISTINCT r.eligibility_id) FILTER(WHERE c.outcome_type='delivered')::int AS delivered
      FROM rediscovery_eligibility r LEFT JOIN commerce_order_outcomes c ON c.eligibility_id=r.eligibility_id
      WHERE r.eligible_at>=NOW()-INTERVAL '30 days'`);
    return {schemaVersion:1,windowDays:30,privacy:'aggregate-only',
      categories:result.rows.map(r=>({...r,searchSuccessRate:ratio(r.matches,r.searches),deliveryRate:ratio(r.delivered,r.orders)})),
      regions:regions.rows.map(r=>({...r,searchSuccessRate:ratio(r.matches,r.searches)})),
      sellerActivation:{definition:'first_nonself_save_or_non_cancelled_order_after_first_approved_publication',windowDays:90,
        cohorts:cohorts.rows.map(r=>({week:new Date(r.week).toISOString(),published:Number(r.published),activated:Number(r.activated),activationRate:ratio(r.activated,r.published),timeToValueSeconds:r.seconds===null?null:Number(r.seconds)}))},
      demandResolution:lineage.rows[0]||{},limitations:[
        'Search success means at least one returned result, not verified relevance or satisfaction.',
        'Seller publication cohorts use currently approved products, not a historical moderation snapshot.',
        'Seller saves and orders are marketplace signals, not guaranteed revenue; private messages are not inspected.',
        'Regions show demand only; attributed regional supply is reported by the canonical commerce report.',
        'Order starts are not purchases. Delivered uses canonical order status, not independent fulfillment verification.',
        'Legacy rediscovery rows without source-event metadata remain explicitly unlinked.'
      ]};
  }
  return {readMarketplaceLoopHealth};
}
module.exports={createMarketplaceGrowth};
