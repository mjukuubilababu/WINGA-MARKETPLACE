// Read-only reports over canonical marketplace domains. Growth never writes demand or ranking.
async function readSellerOpportunityHealth({readQuery}) {
  const row=(await readQuery(`WITH responses AS (
    SELECT s.response_id,s.seller_id,s.opportunity_id,s.product_id,s.created_at
    FROM supply_responses s JOIN users u ON u.username=s.seller_id AND u.status='active'
      JOIN products p ON p.id=s.product_id AND p.uploaded_by=s.seller_id
    WHERE s.status='active' AND s.action_type NOT IN ('ignore','dismiss')
      AND p.status='approved' AND p.price>0
      AND NOT EXISTS(SELECT 1 FROM public_content_visibility v
        WHERE v.content_type='product' AND v.content_id=p.id AND v.visibility<>'public')
  ), firsts AS (
    SELECT seller_id,MIN(created_at) AS responded_at FROM responses GROUP BY seller_id
  ), outcomes AS (
    SELECT DISTINCT s.seller_id,c.order_id,c.outcome_type,c.occurred_at
    FROM responses s JOIN rediscovery_eligibility r ON r.supply_response_id=s.response_id
      AND r.product_id=s.product_id AND r.audience_type='user' AND r.audience_key<>''
    JOIN commerce_order_outcomes initial ON initial.eligibility_id=r.eligibility_id
      AND initial.outcome_type='created' AND initial.seller_id=s.seller_id
      AND initial.product_id=s.product_id AND initial.audience_key=r.audience_key
      AND initial.occurred_at>=s.created_at
    JOIN commerce_order_outcomes c ON c.order_id=initial.order_id
      AND c.eligibility_id=initial.eligibility_id AND c.seller_id=initial.seller_id
      AND c.product_id=initial.product_id AND c.audience_key=initial.audience_key
      AND c.occurred_at>=initial.occurred_at
    JOIN orders o ON o.id=c.order_id AND o.seller_username=s.seller_id
      AND o.product_id=s.product_id AND o.buyer_username<>s.seller_id
    JOIN users buyer ON buyer.username=o.buyer_username AND buyer.status='active'
    WHERE o.status NOT IN ('cancelled','refunded') AND o.payment_status<>'refunded'
      AND NOT EXISTS(SELECT 1 FROM user_blocks b
        WHERE (b.blocker_username=o.buyer_username AND b.blocked_username=s.seller_id)
          OR (b.blocked_username=o.buyer_username AND b.blocker_username=s.seller_id))
  ), values AS (
    SELECT seller_id,BOOL_OR(outcome_type='created') AS ordered,
      BOOL_OR(outcome_type='paid') AS paid,BOOL_OR(outcome_type='delivered') AS delivered,
      MIN(occurred_at) FILTER(WHERE outcome_type IN ('paid','delivered')) AS value_at
    FROM outcomes GROUP BY seller_id
  ), cohort AS (
    SELECT f.*,v.ordered,v.paid,v.delivered,v.value_at,
      EXISTS(SELECT 1 FROM responses later WHERE later.seller_id=f.seller_id
        AND later.created_at>v.value_at AND later.created_at<=v.value_at+INTERVAL '7 days'
        AND NOT EXISTS(SELECT 1 FROM responses previous WHERE previous.seller_id=later.seller_id
          AND previous.opportunity_id=later.opportunity_id AND previous.created_at<=v.value_at)) AS repeat_7,
      EXISTS(SELECT 1 FROM responses later WHERE later.seller_id=f.seller_id
        AND later.created_at>v.value_at AND later.created_at<=v.value_at+INTERVAL '30 days'
        AND NOT EXISTS(SELECT 1 FROM responses previous WHERE previous.seller_id=later.seller_id
          AND previous.opportunity_id=later.opportunity_id AND previous.created_at<=v.value_at)) AS repeat_30
    FROM firsts f LEFT JOIN values v USING(seller_id)
    WHERE f.responded_at>=NOW()-INTERVAL '90 days'
  ) SELECT COUNT(*)::int AS responders,
    COUNT(*) FILTER(WHERE ordered)::int AS with_order_start,
    COUNT(*) FILTER(WHERE paid)::int AS with_paid_order,
    COUNT(*) FILTER(WHERE delivered)::int AS with_delivered_order,
    COUNT(*) FILTER(WHERE value_at<=NOW()-INTERVAL '7 days')::int AS mature_7,
    COUNT(*) FILTER(WHERE value_at<=NOW()-INTERVAL '7 days' AND repeat_7)::int AS repeat_7,
    COUNT(*) FILTER(WHERE value_at<=NOW()-INTERVAL '30 days')::int AS mature_30,
    COUNT(*) FILTER(WHERE value_at<=NOW()-INTERVAL '30 days' AND repeat_30)::int AS repeat_30,
    AVG(EXTRACT(EPOCH FROM value_at-responded_at)) FILTER(WHERE value_at>=responded_at)::float8 AS value_seconds
    FROM cohort`)).rows[0]||{};
  const n=key=>Number(row[key]||0),rate=(a,b)=>n(b)?n(a)/n(b):null;
  return {schemaVersion:1,windowDays:90,privacy:'aggregate-only',responders:n('responders'),
    withOrderStart:n('with_order_start'),withPaidOrder:n('with_paid_order'),withDeliveredOrder:n('with_delivered_order'),
    mature7:n('mature_7'),repeat7:n('repeat_7'),repeat7Rate:rate('repeat_7','mature_7'),
    mature30:n('mature_30'),repeat30:n('repeat_30'),repeat30Rate:rate('repeat_30','mature_30'),
    timeToFirstValueSeconds:row.value_seconds==null?null:Number(row.value_seconds),limitations:[
      'First response among currently active responses with eligible public paid inventory; legacy, withdrawn or moderated history may be incomplete.',
      'Value requires a canonical attributed paid/delivered nonself order; cancelled, refunded, blocked and inactive-account orders are excluded.',
      'Repeat means a response to a different previously unanswered Opportunity after value, not a page visit or proof of relevance.',
      'Seven/thirty-day repeat rates include only mature value cohorts; immature cohorts are unknown, not failures.',
      'Canonical payments/deliveries are marketplace evidence, not independent fulfillment verification or causal retention lift.'
    ]};
}
function createMarketplaceGrowth({readQuery}) {
  const ratio=(a,b)=>Number(b)?Number(a)/Number(b):null;
  async function readMarketplaceLoopHealth() {
    const result=await readQuery(`WITH supply AS (
      SELECT p.category,COUNT(*)::int AS listings,
        COUNT(*) FILTER(WHERE p.availability='available')::int AS available,
        COUNT(DISTINCT p.uploaded_by) FILTER(WHERE p.availability='available')::int AS sellers
      FROM products p JOIN users u ON u.username=p.uploaded_by AND u.status='active'
      WHERE p.status='approved' AND p.price>0 AND NOT EXISTS(SELECT 1 FROM public_content_visibility v
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
    const regions=await readQuery(`SELECT country,region,detected_category AS category,
      COUNT(*)::int AS searches,COUNT(*) FILTER(WHERE result_count>0 AND zero_result IS NOT TRUE)::int AS matches,
      COUNT(DISTINCT audience_type||':'||audience_key)::int AS audiences
      FROM search_demand_events WHERE happened_at>=NOW()-INTERVAL '30 days' AND region<>'' AND audience_key<>''
      GROUP BY country,region,detected_category ORDER BY COUNT(*) DESC LIMIT 50`);
    const cohorts=await readQuery(`WITH publication AS (
      SELECT p.uploaded_by AS seller,MIN(p.first_approved_at) AS published_at FROM products p JOIN users u ON u.username=p.uploaded_by AND u.status='active'
      WHERE p.status='approved' AND p.price>0 AND p.first_approved_at IS NOT NULL
        AND COALESCE((SELECT visibility FROM public_content_visibility WHERE content_type='product' AND content_id=p.id),'public')='public'
        AND NOT EXISTS(SELECT 1 FROM products older WHERE older.uploaded_by=p.uploaded_by AND older.status='approved' AND older.first_approved_at IS NULL)
      GROUP BY p.uploaded_by
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
    const demandRequests=await require('./demand-resolution').readDemandResolutionHealth({readQuery});
    const sellerOpportunity=await readSellerOpportunityHealth({readQuery});
    return {schemaVersion:1,windowDays:30,privacy:'aggregate-only',demandRequests,sellerOpportunity,
      categories:result.rows.map(r=>({...r,searchSuccessRate:ratio(r.matches,r.searches),deliveryRate:ratio(r.delivered,r.orders)})),
      regions:regions.rows.map(r=>({...r,searchSuccessRate:ratio(r.matches,r.searches)})),
      sellerActivation:{definition:'first_nonself_save_or_non_cancelled_order_after_first_known_currently_eligible_product_approval',windowDays:90,
        cohorts:cohorts.rows.map(r=>({week:new Date(r.week).toISOString(),published:Number(r.published),activated:Number(r.activated),activationRate:ratio(r.activated,r.published),timeToValueSeconds:r.seconds===null?null:Number(r.seconds)}))},
      demandResolution:lineage.rows[0]||{},limitations:[
        'Search success means at least one returned result, not verified relevance or satisfaction.',
        'Seller cohorts require protected first-approval timestamps and current public eligible paid inventory; legacy approvals remain unknown rather than guessed from creation dates.',
        'Supply excludes content-only items without a positive price; availability is canonical state, not an independently audited inventory or fulfillment guarantee.',
        'Seller saves and orders are marketplace signals, not guaranteed revenue; private messages are not inspected.',
        'Regions show demand only; attributed regional supply is reported by the canonical commerce report.',
        'Order starts are not purchases. Delivered uses canonical order status, not independent fulfillment verification.',
        'Legacy rediscovery rows without source-event metadata remain explicitly unlinked.'
      ]};
  }
  return {readMarketplaceLoopHealth};
}
module.exports={createMarketplaceGrowth,readSellerOpportunityHealth};
