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
async function publicContent(client,type,contentId,viewer='',sharer='') {
  if(type==='PRODUCT')return await publicProduct(client,contentId,viewer,sharer)?{id:contentId}:null;
  let record;
  if(['REEL','SHORT'].includes(type)){
    if(!await publicProduct(client,contentId,viewer,sharer))return null;
    record=(await client.query(`SELECT id,uploaded_by AS creator FROM products p WHERE p.id=$1
      AND (EXISTS(SELECT 1 FROM jsonb_array_elements(p.media_items) m WHERE m->>'type'='video' AND m->>'status'='ready' AND COALESCE(m->>'moderationStatus','')<>'rejected')
        OR ($2='REEL' AND p.category='reels' AND jsonb_array_length(p.images)>0))`,[contentId,type])).rows[0];
  }else if(type==='PROFILE')record=(await client.query("SELECT username AS id,username AS creator FROM users WHERE username=$1 AND status='active'",[contentId])).rows[0];
  else if(type==='COLLECTION')record=(await client.query(`SELECT c.id,c.owner_username AS creator FROM public_collections c JOIN users u ON u.username=c.owner_username AND u.status='active'
    WHERE c.id=$1 AND c.status='published' AND COALESCE((SELECT visibility FROM public_content_visibility WHERE content_type='collection' AND content_id=c.id),'public')='public'
      AND EXISTS(SELECT 1 FROM public_collection_items i JOIN products p ON p.id=i.product_id JOIN users seller ON seller.username=p.uploaded_by AND seller.status='active'
        WHERE i.collection_id=c.id AND p.status='approved' AND COALESCE((SELECT visibility FROM public_content_visibility WHERE content_type='product' AND content_id=p.id),'public')='public'
          AND ($2='' OR NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_username=$2 AND b.blocked_username=p.uploaded_by) OR (b.blocked_username=$2 AND b.blocker_username=p.uploaded_by))))`,[contentId,viewer])).rows[0];
  if(!record)return null;
  if(viewer&&(await client.query(`SELECT 1 FROM user_blocks WHERE (blocker_username=$1 AND blocked_username IN ($2,$3)) OR (blocked_username=$1 AND blocker_username IN ($2,$3)) LIMIT 1`,[viewer,record.creator,sharer])).rows.length)return null;
  return record;
}
module.exports = {fail, key, fields, publicProduct, publicContent, quota, insertEvent};
