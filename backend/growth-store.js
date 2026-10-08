const crypto = require('node:crypto');
const contract = require('../src/growth/contract');
const fail = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
const key = value => crypto.createHash('sha256').update(value).digest('hex');
const fields = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(k => allowed.includes(k));

function createGrowthStore({ query, withTransaction }) {
  // One privacy/safety predicate for share creation, resolution and events. No owner/staff bypass.
  async function publicProduct(client, productId, viewer = '', sharer = '') {
    const result = await client.query(`SELECT p.id FROM products p JOIN users u ON u.username=p.uploaded_by
      WHERE p.id=$1 AND p.status='approved' AND u.status='active'
      AND COALESCE((SELECT visibility FROM public_content_visibility WHERE content_type='product' AND content_id=p.id),'public')='public'
      AND ($2='' OR NOT EXISTS (SELECT 1 FROM user_blocks
        WHERE (blocker_username=$2 AND blocked_username IN (p.uploaded_by,$3))
          OR (blocked_username=$2 AND blocker_username IN (p.uploaded_by,$3))))`, [productId, viewer, sharer]);
    return !!result.rows.length;
  }
  async function quota(client, bucket, limit, windowSeconds = 60) {
    const result = await client.query(`INSERT INTO growth_rate_buckets(bucket_key,window_start,count)
      VALUES($1,to_timestamp(floor(extract(epoch FROM NOW())/$3)*$3),1)
      ON CONFLICT(bucket_key,window_start) DO UPDATE SET count=growth_rate_buckets.count+1
      WHERE growth_rate_buckets.count<$2 RETURNING count`, [bucket, limit, windowSeconds]);
    if (!result.rows.length) fail(429, 'growth_rate_limited');
  }
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
    if (!share || !await publicProduct(client, share.content_id, context.username || '', share.owner_username || ''))
      fail(404, 'growth_share_unavailable');
    return share;
  }
  async function insertEvent(client, eventId, shareId, actorKey, eventType, verification) {
    const result = await client.query(`INSERT INTO growth_events(event_id,share_id,actor_key,event_type,verification)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING event_id`,
    [eventId, shareId, actorKey, eventType, verification]);
    if (!result.rows.length) {
      const existing = (await client.query('SELECT share_id,actor_key,event_type FROM growth_events WHERE event_id=$1',[eventId])).rows[0];
      if (existing && (existing.share_id !== shareId || existing.actor_key !== actorKey || existing.event_type !== eventType))
        fail(409,'growth_event_conflict');
    }
    return result.rows.length > 0;
  }
  async function createGrowthShare(payload, context) {
    if (!fields(payload, ['shareId','sessionId','contentType','contentId','sourceSurface','parentShareId','schemaVersion'])
      || payload.schemaVersion !== 1 || !contract.uuid(payload.shareId)
      || !contract.destination(payload.contentType, payload.contentId) || !contract.surfaces.includes(payload.sourceSurface)
      || (payload.parentShareId && !contract.uuid(payload.parentShareId))) fail(400, 'growth_share_invalid');
    const actorKey = identity(context, payload.sessionId);
    return withTransaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['growth-share:' + payload.shareId]);
      const existing = (await client.query('SELECT * FROM growth_shares WHERE id=$1', [payload.shareId])).rows[0];
      if (existing) {
        if (existing.actor_key !== actorKey || (existing.owner_username || '') !== (context.username || '') || existing.content_id !== payload.contentId
          || existing.source_surface !== payload.sourceSurface || (existing.parent_share_id || '') !== (payload.parentShareId || ''))
          fail(409, 'growth_share_conflict');
        await load(client, payload.shareId, context);
        return { shareId: existing.id, duplicate: true };
      }
      if (!await publicProduct(client, payload.contentId, context.username || '')) fail(404, 'growth_share_unavailable');
      const quotaActor = context.username ? key('user:' + context.username) : actorKey;
      await quota(client, 'share:actor:' + quotaActor, 30);
      await quota(client, 'share:ip:' + key(context.ip || 'unknown'), 60);
      // Daily caps supplement short burst limits. All counters roll back on rejection.
      await quota(client, 'share:daily:' + quotaActor, 300, 86400);
      let parent = null;
      if (payload.parentShareId) {
        parent = await load(client, payload.parentShareId, context);
        if (parent.content_id !== payload.contentId) fail(400, 'growth_parent_invalid');
      }
      // Quota upserts can wait on another transaction. At READ COMMITTED,
      // use a fresh eligibility snapshot after those waits before persisting.
      if (!await publicProduct(client, payload.contentId, context.username || '')) fail(404, 'growth_share_unavailable');
      const result = await client.query(`INSERT INTO growth_shares(id,content_type,content_id,source_surface,
        owner_username,actor_key,parent_share_id,expires_at)
        VALUES($1,'PRODUCT',$2,$3,$4,$5,$6,NOW()+INTERVAL '30 days') ON CONFLICT DO NOTHING RETURNING id`,
      [payload.shareId,payload.contentId,payload.sourceSurface,context.username || null,actorKey,parent?.id || null]);
      if (!result.rows.length) fail(409, 'growth_share_conflict');
      await insertEvent(client, 'created:' + payload.shareId, payload.shareId, actorKey, 'product_share_created', 'server');
      if (parent && parent.actor_key !== actorKey && (!context.username || parent.owner_username !== context.username))
        await insertEvent(client, 'reshared:' + payload.shareId, parent.id, actorKey, 'shared_product_reshared', 'server');
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
  async function recordGrowthEvent(payload, context) {
    if (!fields(payload, ['eventId','shareId','sessionId','eventType','schemaVersion','orderId'])
      || payload.schemaVersion !== 1 || !contract.uuid(payload.eventId)
      || !contract.uuid(payload.shareId) || !contract.events.includes(payload.eventType)
      || (payload.orderId && !contract.id(payload.orderId))) fail(400, 'growth_event_invalid');
    const actorKey = identity(context, payload.sessionId);
    if (context.bot) return { accepted: false, reason: 'crawler' };
    return withTransaction(async client => {
      const share = await load(client, payload.shareId, context);
      if (share.actor_key === actorKey || (context.username && share.owner_username === context.username))
        return { accepted: false, reason: 'self_touch' };
      await quota(client, 'event:ip:' + key(context.ip || 'unknown'), 240);
      await quota(client, 'event:actor:' + (context.username ? key('user:' + context.username) : actorKey), 120);
      let verification = 'client_observed';
      if (payload.eventType === 'shared_product_saved') {
        if (!context.username || !(await client.query(`SELECT 1 FROM product_likes
          WHERE product_id=$1 AND user_id=$2 AND created_at>=$3`,
          [share.content_id,context.username,share.created_at])).rows.length) fail(409, 'growth_value_unconfirmed');
        verification = 'server';
      }
      if (payload.eventType === 'shared_product_order_started') {
        if (!context.username || !payload.orderId || !(await client.query(`SELECT 1 FROM orders
          WHERE id=$1 AND product_id=$2 AND buyer_username=$3 AND created_at>=$4`,
          [payload.orderId,share.content_id,context.username,share.created_at])).rows.length)
          fail(409, 'growth_value_unconfirmed');
        verification = 'server';
      }
      // A revoked/expired link or privacy change committed during quota or
      // evidence waits must not authorize a new event using the earlier read.
      await load(client, payload.shareId, context);
      const inserted = await insertEvent(client,payload.eventId,share.id,actorKey,payload.eventType,verification);
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
  async function readGrowthHealth() {
    const result = await query(`SELECT e.event_type,e.verification,COUNT(*)::int AS count FROM growth_events e
      WHERE e.created_at>=NOW()-INTERVAL '30 days' GROUP BY e.event_type,e.verification`);
    const counts = Object.fromEntries(result.rows.map(r => [r.event_type,Number(r.count)]));
    const created = counts.product_share_created || 0, opened = counts.product_share_opened || 0;
    const viewed = counts.shared_product_viewed || 0, saved = counts.shared_product_saved || 0;
    const orders = counts.shared_product_order_started || 0, reshared = counts.shared_product_reshared || 0;
    const cohort = (await query(`WITH journeys AS (
      SELECT e.share_id,e.actor_key,
        MIN(e.created_at) FILTER(WHERE e.event_type='product_share_opened') AS opened_at,
        BOOL_OR(e.event_type IN ('shared_product_viewed','shared_product_saved','shared_product_order_started')) AS activated,
        MIN(e.created_at) FILTER(WHERE e.event_type IN ('shared_product_saved','shared_product_order_started')) AS value_at,
        BOOL_OR(e.event_type='shared_product_reshared') AS continued
      FROM growth_events e JOIN growth_shares s ON s.id=e.share_id
      WHERE s.created_at>=NOW()-INTERVAL '30 days' AND e.actor_key<>s.actor_key
      GROUP BY e.share_id,e.actor_key
    ) SELECT COUNT(*) FILTER(WHERE opened_at IS NOT NULL)::int AS opens,
      COUNT(DISTINCT share_id) FILTER(WHERE opened_at IS NOT NULL)::int AS opened_shares,
      COUNT(*) FILTER(WHERE opened_at IS NOT NULL AND activated)::int AS activations,
      COUNT(*) FILTER(WHERE opened_at IS NOT NULL AND activated AND value_at IS NOT NULL)::int AS values,
      COUNT(*) FILTER(WHERE opened_at IS NOT NULL AND activated AND value_at IS NOT NULL AND continued)::int AS continuations,
      AVG(EXTRACT(EPOCH FROM value_at-opened_at)) FILTER(WHERE opened_at IS NOT NULL AND value_at>=opened_at)::float8 AS time_to_value_seconds,
      (SELECT COUNT(*)::int FROM (SELECT actor_key FROM journeys WHERE opened_at IS NOT NULL
        GROUP BY actor_key HAVING COUNT(*)>1) repeated) AS repeat_recipients
      FROM journeys`)).rows[0] || {};
    const sharesInCohort = Number((await query(`SELECT COUNT(*)::int AS count FROM growth_shares
      WHERE created_at>=NOW()-INTERVAL '30 days'`)).rows[0]?.count || 0);
    const ratio = (a,b) => Number(b) ? Number(a)/Number(b) : null;
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
      evidence: result.rows, limitations: ['Client-observed views and message starts are not verified sales.',
        'Known crawlers and self-touches excluded; unknown bots require production abuse analysis.',
        'Cohort denominators use opened recipient/share pairs, not registrations or claimed invitation deliveries.',
        'Time to value uses server event-receipt times; missing/unordered events are excluded.',
        'A save or order start is value, not a completed purchase. Cross-device identities are not inferred.'] };
  }
  async function pruneGrowthRecords() {
    // Retain bounded attribution history; explicit operations task, never a request-path scan.
    await query(`DELETE FROM growth_rate_buckets WHERE window_start<NOW()-INTERVAL '2 days'`);
    const result = await query(`DELETE FROM growth_shares WHERE created_at<NOW()-INTERVAL '90 days' RETURNING id`);
    return { deleted: result.rows.length };
  }
  return { createGrowthShare, resolveGrowthShare, recordGrowthEvent, revokeGrowthShare, readGrowthHealth, pruneGrowthRecords };
}
module.exports = { createGrowthStore };
