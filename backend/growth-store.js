const contract = require('../src/growth/contract');
const {fail, key, fields, publicProduct, publicContent, quota, insertEvent} = require('./growth-infrastructure');

function createGrowthStore({ query, withTransaction, authorizeInternalDirect,allowInternalRooms=true,referralMeasurementEnabled=process.env.WINGA_GROWTH_MEASUREMENT_ENABLED==='true' }) {
  const referrals=require('./growth-seller-referrals').createSellerReferrals({query,withTransaction,measurementEnabled:referralMeasurementEnabled});
  function identity(context, sessionId) {
    if (!contract.uuid(sessionId)) fail(400, 'growth_session_invalid');
    // A tab journey survives guest -> authenticated transition without joining unrelated devices.
    // Authentication independently verifies values and source-user self-touch suppression.
    return key('session:' + sessionId);
  }
  async function load(client, shareId, context) {
    if (!contract.uuid(shareId)) fail(404, 'growth_share_unavailable');
    const share = (await client.query(`SELECT * FROM growth_shares WHERE id=$1
      AND revoked_at IS NULL AND expires_at>NOW()`, [shareId])).rows[0];
    if (!share || !contract.publicTypes.includes(share.content_type) || !await publicContent(client, share.content_type,share.content_id, context.username || '', share.owner_username || ''))
      fail(404, 'growth_share_unavailable');
    return share;
  }
  async function createGrowthShare(payload, context) {
    if(payload?.contentType==='SELLER_REFERRAL')return referrals.createSellerReferral(payload,context);
    if (context.growthCohort && !context.growthCohort.allowsCreation(context.username || '')) fail(403, 'growth_cohort_excluded');
    if (!fields(payload, ['shareId','sessionId','contentType','contentId','sourceSurface','parentShareId','schemaVersion','messageId'])
      || payload.schemaVersion !== 1 || !contract.publicTypes.includes(payload.contentType) || !contract.uuid(payload.shareId)
      || !contract.destination(payload.contentType, payload.contentId) || !contract.surfaces.includes(payload.sourceSurface)
      || (payload.parentShareId && !contract.uuid(payload.parentShareId))) fail(400, 'growth_share_invalid');
    if(payload.messageId!==undefined&&(!contract.uuid(payload.messageId)||!['PRODUCT','COLLECTION','REEL','SHORT'].includes(payload.contentType)||!['conversation','room'].includes(payload.sourceSurface)))fail(400,'growth_share_invalid');
    const actorKey = identity(context, payload.sessionId);
    return withTransaction(async client => {
      let internal=null;
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['growth-share:' + payload.shareId]);
      if(payload.messageId)await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['growth-internal:'+payload.messageId+':'+payload.contentType+':'+payload.contentId]);
      const existing = (await client.query('SELECT * FROM growth_shares WHERE id=$1', [payload.shareId])).rows[0];
      if (existing) {
        if (existing.actor_key !== actorKey || (existing.owner_username || '') !== (context.username || '') || existing.content_type !== payload.contentType || existing.content_id !== payload.contentId
          || existing.source_surface !== payload.sourceSurface || (existing.parent_share_id || '') !== (payload.parentShareId || ''))
          fail(409, 'growth_share_conflict');
        await load(client, payload.shareId, context);
        if(payload.messageId){const mapping=(await client.query('SELECT message_id FROM growth_internal_shares WHERE share_id=$1',[existing.id])).rows[0];
          if(mapping?.message_id!==payload.messageId)fail(409,'growth_share_conflict');
          await require('./growth-internal-context').authorizeInternalShare(client,payload.messageId,context.username,{source:true});}
        return { shareId: existing.id, duplicate: true };
      }
      if(payload.messageId){
        internal=await require('./growth-internal-context').authorizeInternalShare(client,payload.messageId,context.username,{source:true});
        if(internal.surface!==payload.sourceSurface||Date.now()-new Date(internal.message.created_at).getTime()>86400000)fail(404,'growth_internal_share_unavailable');
        const reusable=(await client.query('SELECT share_id FROM growth_internal_shares WHERE message_id=$1 AND content_type=$2 AND content_id=$3',[payload.messageId,payload.contentType,payload.contentId])).rows[0];
        if(reusable){await load(client,reusable.share_id,context);return {shareId:reusable.share_id,duplicate:true};}
      }
      if (!await publicContent(client,payload.contentType,payload.contentId,context.username || '')) fail(404, 'growth_share_unavailable');
      const quotaActor = context.username ? key('user:' + context.username) : actorKey;
      await quota(client, 'share:actor:' + quotaActor, 30);
      await quota(client, 'share:ip:' + key(context.ip || 'unknown'), 60);
      // Daily caps supplement short burst limits. All counters roll back on rejection.
      await quota(client, 'share:daily:' + quotaActor, 300, 86400);
      let parent = null;
      if (payload.parentShareId) {
        parent = await load(client, payload.parentShareId, context);
        if (parent.content_type !== payload.contentType || parent.content_id !== payload.contentId) fail(400, 'growth_parent_invalid');
      }
      // Quota upserts can wait on another transaction. At READ COMMITTED,
      // use a fresh eligibility snapshot after those waits before persisting.
      if (!await publicContent(client,payload.contentType,payload.contentId,context.username || '')) fail(404, 'growth_share_unavailable');
      // Recheck the parent after the final eligibility read, not its earlier snapshot.
      if (parent) parent = await load(client, payload.parentShareId, context);
      const result = await client.query(`INSERT INTO growth_shares(id,content_type,content_id,source_surface,
        owner_username,actor_key,parent_share_id,created_at,expires_at)
        VALUES($1,$7,$2,$3,$4,$5,$6,COALESCE($8::timestamptz,NOW()),COALESCE($8::timestamptz,NOW())+INTERVAL '30 days') ON CONFLICT DO NOTHING RETURNING id`,
      [payload.shareId,payload.contentId,payload.sourceSurface,context.username || null,actorKey,parent?.id || null,payload.contentType,internal?.message.created_at||null]);
      if (!result.rows.length) fail(409, 'growth_share_conflict');
      if(payload.messageId){
        await require('./growth-internal-context').authorizeInternalShare(client,payload.messageId,context.username,{source:true});
        await client.query('INSERT INTO growth_internal_shares(share_id,message_id,content_type,content_id) VALUES($1,$2,$3,$4)',[payload.shareId,payload.messageId,payload.contentType,payload.contentId]);
      }
      await insertEvent(client, 'created:' + payload.shareId, payload.shareId, actorKey, payload.contentType==='PRODUCT'?'product_share_created':'content_share_created', 'server');
      if (parent && parent.actor_key !== actorKey && (!context.username || parent.owner_username !== context.username)
        && (!context.growthCohort || context.growthCohort.allowsMeasurement(parent.owner_username || '', context.username || '')))
        await insertEvent(client, 'reshared:' + payload.shareId, parent.id, actorKey, payload.contentType==='PRODUCT'?'shared_product_reshared':'shared_content_reshared', 'server');
      return { shareId: payload.shareId, duplicate: false };
    });
  }
  async function resolveGrowthShare(shareId, context) {
    const share = await load({ query }, shareId, context);
    // Never return source identity, private context or an arbitrary redirect.
    return { attributionId: share.id, destinationType: share.content_type, destinationId: share.content_id,
      sourceType: 'organic_share', sourceSurface: share.source_surface, campaignType: share.campaign_type,
      createdAt: new Date(share.created_at).toISOString(), expiresAt: new Date(share.expires_at).toISOString(), metadataVersion: 1 };
  }
  async function resolveInternalGrowthShare(messageId,contentType,contentId,context){
    if(!contract.uuid(messageId)||!['PRODUCT','COLLECTION','REEL','SHORT'].includes(contentType)||!contract.id(contentId))fail(404,'growth_internal_share_unavailable');
    if(!contract.uuid(context.actorDeviceId))fail(403,'growth_native_proof_required');
    return withTransaction(async client=>{
      await require('./growth-internal-context').authorizeInternalShare(client,messageId,context.username,{deviceId:context.actorDeviceId,authorizeDirect:authorizeInternalDirect,allowRooms:allowInternalRooms});
      const mapping=(await client.query('SELECT share_id FROM growth_internal_shares WHERE message_id=$1 AND content_type=$2 AND content_id=$3',[messageId,contentType,contentId])).rows[0];
      if(!mapping)fail(404,'growth_internal_share_unavailable');
      const share=await load(client,mapping.share_id,context);
      const content=await publicContent(client,share.content_type,share.content_id,context.username,share.owner_username||'');
      if(!content)fail(404,'growth_internal_share_unavailable');
      await require('./growth-internal-context').authorizeInternalShare(client,messageId,context.username,{deviceId:context.actorDeviceId,authorizeDirect:authorizeInternalDirect,allowRooms:allowInternalRooms});
      return {shareId:share.id,destinationType:share.content_type,destinationId:share.content_id,...(content.creator?{creatorRef:content.creator}:{}),metadataVersion:1};
    });
  }
  async function recordGrowthEvent(payload, context) {
    if(contract.referralEvents.includes(payload?.eventType))return referrals.recordSellerReferralEvent(payload,context);
    if (!fields(payload, ['eventId','shareId','sessionId','eventType','schemaVersion','orderId','durationMs'])
      || payload.schemaVersion !== 1 || !contract.uuid(payload.eventId)
      || !contract.uuid(payload.shareId) || ![...contract.events,...contract.contentEvents].includes(payload.eventType)
      || (payload.orderId && !contract.id(payload.orderId)) || payload.orderId!==undefined&&payload.eventType!=='shared_product_order_started') fail(400, 'growth_event_invalid');
    if (payload.durationMs !== undefined && (payload.eventType !== 'shared_product_viewed'
      || !Number.isInteger(payload.durationMs) || payload.durationMs < 0 || payload.durationMs > 300000)) fail(400, 'growth_event_invalid');
    const actorKey = identity(context, payload.sessionId);
    if (context.bot) return { accepted: false, reason: 'crawler' };
    return withTransaction(async client => {
      const share = await load(client, payload.shareId, context);
      if(!(share.content_type==='PRODUCT'?contract.events:contract.contentEvents).includes(payload.eventType))fail(400,'growth_event_invalid');
      if (context.growthCohort && !context.growthCohort.allowsMeasurement(share.owner_username || '', context.username || ''))
        fail(403, 'growth_cohort_excluded');
      if (share.actor_key === actorKey || (context.username && share.owner_username === context.username))
        return { accepted: false, reason: 'self_touch' };
      await quota(client, 'event:ip:' + key(context.ip || 'unknown'), 240);
      await quota(client, 'event:actor:' + (context.username ? key('user:' + context.username) : actorKey), 120);
      let verification = 'client_observed';
      if (payload.eventType === 'shared_product_saved') {
        if (!context.username || !(await client.query(`SELECT 1 FROM product_likes l JOIN products p ON p.id=l.product_id
          WHERE l.product_id=$1 AND l.user_id=$2 AND p.uploaded_by<>$2 AND l.created_at>=$3`,
          [share.content_id,context.username,share.created_at])).rows.length) fail(409, 'growth_value_unconfirmed');
        verification = 'server';
      }
      if (payload.eventType === 'shared_product_order_started') {
        if (!context.username || !payload.orderId || !(await client.query(`SELECT 1 FROM orders o JOIN products p ON p.id=o.product_id
          WHERE o.id=$1 AND o.product_id=$2 AND o.buyer_username=$3 AND p.uploaded_by<>$3 AND o.created_at>=$4`,
          [payload.orderId,share.content_id,context.username,share.created_at])).rows.length)
          fail(409, 'growth_value_unconfirmed');
        verification = 'server';
      }
      if(payload.eventType==='shared_content_followed'){
        const target=await publicContent(client,share.content_type,share.content_id,context.username||'',share.owner_username||'');
        if(!context.username||!target?.creator||target.creator===context.username||!(await client.query(`SELECT 1 FROM user_follows WHERE follower_username=$1 AND followed_username=$2 AND status='active' AND created_at>=$3`,[context.username,target.creator,share.created_at])).rows.length)fail(409,'growth_value_unconfirmed');
        verification='server';
      }
      if(payload.eventType==='shared_content_saved'){
        const target=await publicContent(client,share.content_type,share.content_id,context.username||'',share.owner_username||'');
        if(!['REEL','SHORT'].includes(share.content_type)||!context.username||target?.creator===context.username||!(await client.query('SELECT 1 FROM product_likes WHERE product_id=$1 AND user_id=$2 AND created_at>=$3',[share.content_id,context.username,share.created_at])).rows.length)fail(409,'growth_value_unconfirmed');
        verification='server';
      }
      // A revoked/expired link or privacy change committed during quota or
      // evidence waits must not authorize a new event using the earlier read.
      const finalShare = await load(client, payload.shareId, context);
      if (context.growthCohort && !context.growthCohort.allowsMeasurement(finalShare.owner_username || '', context.username || ''))
        fail(403, 'growth_cohort_excluded');
      const inserted = await insertEvent(client,payload.eventId,share.id,actorKey,payload.eventType,verification,payload.durationMs ?? null,context.username?key('user:'+context.username):null);
      return { accepted: true, duplicate: !inserted };
    });
  }
  async function revokeGrowthShare(shareId, context) {
    if (!contract.uuid(shareId) || !context.username) fail(404, 'growth_share_unavailable');
    const result = await query(`UPDATE growth_shares SET revoked_at=COALESCE(revoked_at,NOW())
      WHERE id=$1 AND owner_username=$2 RETURNING id`, [shareId,context.username]);
    if (!result.rows.length) fail(404, 'growth_share_unavailable');
    return { revoked: true };
  }
  async function resolveGrowthShareSafetyTarget(shareId,context){
    if(!context.username||!contract.uuid(shareId))fail(403,'growth_auth_required');
    const row=(await query("SELECT owner_username FROM growth_shares WHERE id=$1 AND content_type<>'SHOPPING_ROOM'",[shareId])).rows[0];
    if(!row?.owner_username)fail(404,'growth_share_unavailable');
    if(row.owner_username===context.username)fail(400,'growth_invite_self_action');
    return {username:row.owner_username};
  }
  async function readGrowthHealth() {
    const result = await query(`SELECT e.event_type,e.verification,COUNT(*)::int AS count FROM growth_events e
      JOIN growth_shares s ON s.id=e.share_id
      WHERE s.content_type='PRODUCT' AND e.created_at>=NOW()-INTERVAL '30 days' GROUP BY e.event_type,e.verification`);
    const counts = Object.fromEntries(result.rows.map(r => [r.event_type,Number(r.count)]));
    const created = counts.product_share_created || 0, opened = counts.product_share_opened || 0;
    const viewed = counts.shared_product_viewed || 0, saved = counts.shared_product_saved || 0;
    const orders = counts.shared_product_order_started || 0, reshared = counts.shared_product_reshared || 0;
    const cohort = (await query(`WITH journeys AS (
      SELECT e.share_id,e.actor_key,
        MIN(e.created_at) FILTER(WHERE e.event_type='product_share_opened') AS opened_at,
        MIN(e.created_at) FILTER(WHERE e.event_type IN ('shared_product_viewed','shared_product_saved','shared_product_order_started')) AS activated_at,
        MIN(e.created_at) FILTER(WHERE e.event_type IN ('shared_product_saved','shared_product_order_started')) AS value_at,
        MAX(e.created_at) FILTER(WHERE e.event_type='shared_product_reshared') AS continued_at
      FROM growth_events e JOIN growth_shares s ON s.id=e.share_id
      WHERE s.content_type='PRODUCT' AND s.created_at>=NOW()-INTERVAL '30 days' AND e.actor_key<>s.actor_key
      GROUP BY e.share_id,e.actor_key
    ) SELECT COUNT(*) FILTER(WHERE opened_at IS NOT NULL)::int AS opens,
      COUNT(DISTINCT share_id) FILTER(WHERE opened_at IS NOT NULL)::int AS opened_shares,
      COUNT(*) FILTER(WHERE activated_at>=opened_at)::int AS activations,
      COUNT(*) FILTER(WHERE activated_at>=opened_at AND value_at>=activated_at)::int AS values,
      COUNT(*) FILTER(WHERE activated_at>=opened_at AND value_at>=activated_at AND continued_at>=value_at)::int AS continuations,
      AVG(EXTRACT(EPOCH FROM value_at-opened_at)) FILTER(WHERE activated_at>=opened_at AND value_at>=activated_at)::float8 AS time_to_value_seconds,
      (SELECT COUNT(*)::int FROM (SELECT actor_key FROM journeys WHERE opened_at IS NOT NULL
        GROUP BY actor_key HAVING COUNT(*)>1) repeated) AS repeat_recipients
      FROM journeys`)).rows[0] || {};
    const sharesInCohort = Number((await query(`SELECT COUNT(*)::int AS count FROM growth_shares
      WHERE content_type='PRODUCT' AND created_at>=NOW()-INTERVAL '30 days'`)).rows[0]?.count || 0);
    const ratio = (a,b) => Number(b) ? Number(a)/Number(b) : null;
    const timing = (await query(`SELECT COUNT(*)::int AS samples, AVG(e.client_duration_ms)::float8 AS average,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY e.client_duration_ms)::float8 AS p95
      FROM growth_events e JOIN growth_shares s ON s.id=e.share_id
      WHERE s.content_type='PRODUCT' AND e.client_duration_ms IS NOT NULL AND e.created_at>=NOW()-INTERVAL '30 days'`)).rows[0] || {};
    // Recipient-per-share metrics can exceed 1; these are not unique-user funnel percentages.
    return { schemaVersion: 1, loop: 'product_share', windowDays: 30, counts,
      shares: created, recipientOpens: opened, meaningfulViews: viewed, confirmedSaves: saved, confirmedOrderStarts: orders,
      opensPerShare: created ? opened/created : null, viewsPerOpen: opened ? viewed/opened : null,
      resharesPerView: viewed ? reshared/viewed : null,
      cohort: { basis: 'shares_created_last_30_days', entryCount: sharesInCohort,
        humanOpenShareRate: ratio(cohort.opened_shares,sharesInCohort), recipientJourneys: Number(cohort.opens || 0),
        activationCount: Number(cohort.activations || 0), valueCount: Number(cohort.values || 0), continuationCount: Number(cohort.continuations || 0),
        activationRate: ratio(cohort.activations,cohort.opens), valueRate: ratio(cohort.values,cohort.activations),
        continuationRate: ratio(cohort.continuations,cohort.values), timeToValueSeconds: cohort.time_to_value_seconds ?? null,
        repeatRecipients: Number(cohort.repeat_recipients || 0), viralCoefficient: null },
      timing: { metric: 'deep_link_to_content_ms', verification: 'client_observed',
        basis: 'navigation_or_route_capture_to_visible_detail_excluding_activation_dwell',
        samples: Number(timing.samples || 0), averageMs: timing.average ?? null, p95Ms: timing.p95 ?? null },
      evidence: result.rows, limitations: ['Client-observed views and message starts are not verified sales.',
        'Known crawlers and self-touches excluded; unknown bots require production abuse analysis.',
        'Cohort denominators use opened recipient/share pairs, not registrations or claimed invitation deliveries.',
        'Time to value uses server event-receipt times; missing/unordered events are excluded.',
        'A save or order start is value, not a completed purchase. Cross-device identities are not inferred.'] };
  }
  async function readContentGrowthHealth(type){
    if(!['PROFILE','COLLECTION','REEL','SHORT'].includes(type))fail(400,'growth_content_type_invalid');
    const counts=(await query(`SELECT e.event_type,e.verification,COUNT(*)::int AS count FROM growth_events e JOIN growth_shares s ON s.id=e.share_id
      WHERE s.content_type=$1 AND s.created_at>=NOW()-INTERVAL '30 days' GROUP BY e.event_type,e.verification`,[type])).rows;
    const summary=(await query(`WITH journey AS (
      SELECT e.share_id,e.actor_key,MIN(e.created_at) FILTER(WHERE e.event_type='content_share_opened') AS opened_at,
        MIN(e.created_at) FILTER(WHERE e.event_type IN ('shared_content_viewed','shared_content_followed','shared_content_saved')) AS activated_at,
        MIN(e.created_at) FILTER(WHERE e.event_type IN ('shared_content_followed','shared_content_saved')) AS value_at,
        MAX(e.created_at) FILTER(WHERE e.event_type='shared_content_reshared') AS continued_at
      FROM growth_events e JOIN growth_shares s ON s.id=e.share_id
      WHERE s.content_type=$1 AND s.created_at>=NOW()-INTERVAL '30 days' AND e.actor_key<>s.actor_key GROUP BY e.share_id,e.actor_key
    ) SELECT COUNT(*) FILTER(WHERE opened_at IS NOT NULL)::int AS opens,
      COUNT(*) FILTER(WHERE opened_at IS NOT NULL AND activated_at>=opened_at)::int AS activations,
      COUNT(*) FILTER(WHERE activated_at>=opened_at AND value_at>=activated_at)::int AS values,
      COUNT(*) FILTER(WHERE activated_at>=opened_at AND value_at>=activated_at AND continued_at>=value_at)::int AS continuations,
      AVG(EXTRACT(EPOCH FROM value_at-opened_at)) FILTER(WHERE activated_at>=opened_at AND value_at>=activated_at)::float8 AS seconds
      FROM journey`,[type])).rows[0]||{};
    const entries=Number((await query("SELECT COUNT(*)::int AS count FROM growth_shares WHERE content_type=$1 AND created_at>=NOW()-INTERVAL '30 days'",[type])).rows[0]?.count||0);
    const rate=(n,d)=>Number(d)?Number(n)/Number(d):null;
    return {schemaVersion:1,loop:type.toLowerCase()+'_share',windowDays:30,entryCount:entries,evidence:counts,
      cohort:{recipientJourneys:Number(summary.opens||0),activationCount:Number(summary.activations||0),valueCount:Number(summary.values||0),continuationCount:Number(summary.continuations||0),
        activationRate:rate(summary.activations,summary.opens),valueRate:rate(summary.values,summary.activations),continuationRate:rate(summary.continuations,summary.values),timeToValueSeconds:summary.seconds===null?null:Number(summary.seconds),viralCoefficient:null},
      limitations:['Views are client observed. Follow/save values require canonical post-share evidence.','Registration is not activation; delivered shares and cross-device identity are unknown.','These metrics describe observed organic sharing, not revenue or causal lift.']};
  }
  async function pruneGrowthRecords() {
    // Retain bounded attribution history; explicit operations task, never a request-path scan.
    await query(`DELETE FROM growth_rate_buckets WHERE window_start<NOW()-INTERVAL '2 days'`);
    const result = await query(`DELETE FROM growth_shares WHERE created_at<NOW()-INTERVAL '90 days' RETURNING id`);
    return { deleted: result.rows.length };
  }
  return { ...referrals,createGrowthShare, resolveGrowthShare, resolveInternalGrowthShare,recordGrowthEvent, revokeGrowthShare, resolveGrowthShareSafetyTarget,readGrowthHealth, readContentGrowthHealth, pruneGrowthRecords };
}
module.exports = { createGrowthStore };
