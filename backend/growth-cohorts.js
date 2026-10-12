// Authenticated account cohorts over consented, accepted growth metadata only.
// Anonymous tabs are never guessed into accounts; no message bodies are read.
function createGrowthCohorts({query}) {
  async function readGrowthCohorts(){
    const rows=(await query(`WITH recipient_events AS (
      SELECT e.authenticated_actor_key AS actor,e.event_type,e.created_at,s.content_type
      FROM growth_events e JOIN growth_shares s ON s.id=e.share_id
      WHERE e.authenticated_actor_key IS NOT NULL AND e.created_at>=NOW()-INTERVAL '90 days'
        AND e.event_type NOT IN ('product_share_created','content_share_created','room_invite_created','room_invite_reported','room_inviter_blocked')
    ), ranked AS (
      SELECT *,ROW_NUMBER() OVER(PARTITION BY actor ORDER BY created_at,content_type,event_type) AS position FROM recipient_events
    ), first_touch AS (SELECT actor,created_at AS acquired_at,content_type FROM ranked WHERE position=1),
    milestones AS (
      SELECT f.*,EXISTS(SELECT 1 FROM recipient_events e WHERE e.actor=f.actor AND e.created_at>=f.acquired_at
        AND e.event_type IN ('shared_product_viewed','shared_product_saved','shared_product_order_started','shared_content_viewed','shared_content_saved','shared_content_followed','room_participation_started','seller_first_product')) AS activated,
        EXISTS(SELECT 1 FROM recipient_events e WHERE e.actor=f.actor AND e.created_at>=f.acquired_at
        AND e.event_type IN ('shared_product_saved','shared_product_order_started','shared_content_saved','shared_content_followed','room_shortlist_created','room_poll_closed','first_order_started','seller_first_value_event')) AS received_value,
        EXISTS(SELECT 1 FROM recipient_events e WHERE e.actor=f.actor AND e.created_at>=f.acquired_at+INTERVAL '1 day' AND e.created_at<f.acquired_at+INTERVAL '2 days') AS d1,
        EXISTS(SELECT 1 FROM recipient_events e WHERE e.actor=f.actor AND e.created_at>=f.acquired_at+INTERVAL '7 days' AND e.created_at<f.acquired_at+INTERVAL '8 days') AS d7,
        EXISTS(SELECT 1 FROM recipient_events e WHERE e.actor=f.actor AND e.created_at>=f.acquired_at+INTERVAL '30 days' AND e.created_at<f.acquired_at+INTERVAL '31 days') AS d30
      FROM first_touch f
    ) SELECT content_type,date_trunc('week',acquired_at) AS week,COUNT(*)::int AS accounts,
      COUNT(*) FILTER(WHERE activated)::int AS activated,COUNT(*) FILTER(WHERE received_value)::int AS received_value,
      COUNT(*) FILTER(WHERE acquired_at<=NOW()-INTERVAL '2 days')::int AS d1_eligible,
      COUNT(*) FILTER(WHERE acquired_at<=NOW()-INTERVAL '2 days' AND d1)::int AS d1_returned,
      COUNT(*) FILTER(WHERE acquired_at<=NOW()-INTERVAL '8 days')::int AS d7_eligible,
      COUNT(*) FILTER(WHERE acquired_at<=NOW()-INTERVAL '8 days' AND d7)::int AS d7_returned,
      COUNT(*) FILTER(WHERE acquired_at<=NOW()-INTERVAL '31 days')::int AS d30_eligible,
      COUNT(*) FILTER(WHERE acquired_at<=NOW()-INTERVAL '31 days' AND d30)::int AS d30_returned
      FROM milestones GROUP BY content_type,date_trunc('week',acquired_at) ORDER BY week DESC,content_type`)).rows;
    const ratio=(a,b)=>Number(b)?Number(a)/Number(b):null;
    return {schemaVersion:1,windowDays:90,privacy:'aggregate-only',basis:'first_authenticated_recipient_touch_in_observed_90_day_window',
      cohorts:rows.map(r=>({loop:r.content_type,week:new Date(r.week).toISOString(),accounts:Number(r.accounts),activationRate:ratio(r.activated,r.accounts),valueRate:ratio(r.received_value,r.accounts),
        retention:Object.fromEntries([1,7,30].map(day=>['D'+day,{eligible:Number(r['d'+day+'_eligible']),returned:Number(r['d'+day+'_returned']),rate:ratio(r['d'+day+'_returned'],r['d'+day+'_eligible'])}]))})),
      limitations:['Retention means another accepted growth event in the exact 24-hour D1/D7/D30 window; it is not whole-app retention.',
        'Only server-authenticated account hashes are joined across devices. Anonymous opens and historical events without account evidence remain unlinked.',
        'Acquisition uses first observed authenticated recipient context in the bounded window, not proven first-ever registration or anonymous first-touch.',
        'Immature retention cohorts report unknown rates. Order starts and delivered order states are not revenue.',
        'Organic sharing only; organic Search, sponsored reach and seller referral cohorts require their own canonical evidence. No private messages are inspected.']};
  }
  return {readGrowthCohorts};
}
module.exports={createGrowthCohorts};
