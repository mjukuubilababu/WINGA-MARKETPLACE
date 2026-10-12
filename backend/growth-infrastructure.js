const crypto = require('node:crypto');
const fail = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
const key = value => crypto.createHash('sha256').update(value).digest('hex');
const fields = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(k => allowed.includes(k));

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
async function insertEvent(client, eventId, shareId, actorKey, eventType, verification, durationMs = null) {
  const result = await client.query(`INSERT INTO growth_events(event_id,share_id,actor_key,event_type,verification,client_duration_ms)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING event_id`,
  [eventId, shareId, actorKey, eventType, verification, durationMs]);
  if (!result.rows.length) {
    const existing = (await client.query('SELECT share_id,actor_key,event_type FROM growth_events WHERE event_id=$1',[eventId])).rows[0];
    if (existing && (existing.share_id !== shareId || existing.actor_key !== actorKey || existing.event_type !== eventType))
      fail(409,'growth_event_conflict');
  }
  return result.rows.length > 0;
}
module.exports = {fail, key, fields, publicProduct, quota, insertEvent};
