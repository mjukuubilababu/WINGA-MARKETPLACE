const crypto = require('node:crypto');
const contract = require('../src/growth/contract');
const {fail, key, publicProduct, quota} = require('./growth-infrastructure');
const {withTransportLocks} = require('./encrypted-transport-locks');
const fields = Object.freeze({
  'room-invite-create': ['conversationId', 'inviteId', 'previewProducts', 'purpose', 'ttlHours'],
  'room-invite-revoke': ['conversationId', 'inviteId'],
  'room-invite-request': ['conversationId', 'inviteId', 'tokenHash', 'sessionId'],
  'room-invite-confirm': ['conversationId', 'inviteId', 'tokenHash'],
  'room-invite-requests': ['conversationId'],
  'room-invite-decline': ['conversationId', 'inviteId', 'recipient']
});
const tokenValid = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
const hashValid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const participationEvents = ['room_participation_started', 'first_vote', 'first_comment', 'first_product_added', 'first_product_viewed', 'room_shortlist_created', 'room_poll_closed'];

function createLoopInvites({withTransaction, authorizeRoom, enabled = false, measurementEnabled=false, secret = '', cohort = require('./growth-policy').createGrowthPolicy(process.env), eventWriter = require('./growth-event-jobs').enqueueGrowthEvent, onEventFailure = () => {}}) {
  const actor = username => key('user:' + username);
  async function room(client, id) {
    return (await client.query('SELECT * FROM encrypted_conversations WHERE id=$1', [id])).rows[0];
  }
  async function authority(client, id, username, deviceId) {
    const group = await room(client, id);
    let info;
    try { info = await authorizeRoom(client, {owner: username}, deviceId, group, {pending: false}); }
    catch { fail(404, 'growth_invite_unavailable'); }
    return {group, info};
  }
  const admin = (info, owner) => info.roles.some(role => role.owner === owner && role.role === 'admin');
  async function safeEvent(client, ...args) {
    if (!measurementEnabled) return;
    // Failure in optional measurement never rolls back invitation/request state.
    await client.query('SAVEPOINT growth_invite_measurement');
    try { await eventWriter(client, ...args); await client.query('RELEASE SAVEPOINT growth_invite_measurement'); }
    catch {
      await client.query('ROLLBACK TO SAVEPOINT growth_invite_measurement');
      await client.query('RELEASE SAVEPOINT growth_invite_measurement');
      try { onEventFailure(); } catch {}
    }
  }
  async function load(client, id, context = {}, tokenHash = null, {admission = true} = {}) {
    if (!contract.uuid(id) || tokenHash !== null && !hashValid(tokenHash)) fail(404, 'growth_invite_unavailable');
    const invite = (await client.query(`SELECT s.*,i.token_hash,i.issuer_device_id,i.purpose,i.preview_products,i.ttl_hours,
      i.measurement_enabled,i.expires_at AS invite_expires_at FROM growth_shares s JOIN growth_loop_invites i ON i.share_id=s.id
      WHERE s.id=$1 AND s.content_type='SHOPPING_ROOM' AND s.revoked_at IS NULL AND s.expires_at>NOW()
        AND ($2::text IS NULL OR i.token_hash=$2) AND (NOT $3::boolean OR i.expires_at>NOW())`, [id, tokenHash, admission])).rows[0];
    if (!invite?.owner_username) fail(404, 'growth_invite_unavailable');
    const state = await authority(client, invite.content_id, invite.owner_username, invite.issuer_device_id);
    if (!admin(state.info, invite.owner_username)) fail(404, 'growth_invite_unavailable');
    if (context.username && (await client.query(`SELECT 1 FROM user_blocks
      WHERE (blocker_username=$1 AND blocked_username=ANY($2::text[]))
         OR (blocked_username=$1 AND blocker_username=ANY($2::text[])) LIMIT 1`, [context.username, state.info.owners])).rows.length) fail(404, 'growth_invite_unavailable');
    return {invite, ...state};
  }
  async function visibleProducts(client, invite, viewer = '') {
    const visible = [];
    for (const id of invite.preview_products) if (await publicProduct(client, id, viewer, invite.owner_username)) visible.push(id);
    return visible;
  }
  function makeToken(inviteId, owner, roomId) {
    if (typeof secret !== 'string' || secret.length < 32) fail(503, 'growth_invite_configuration_unavailable');
    return crypto.createHmac('sha256', secret).update(JSON.stringify(['winga-loop-invite', 1, inviteId, owner, roomId])).digest('base64url');
  }
  async function handle(client, context, operation) {
    const p = operation.payload, owner = context.owner, deviceId = operation.actorId;
    if (!contract.uuid(p.conversationId) || p.inviteId !== undefined && !contract.uuid(p.inviteId)) fail(400, 'growth_invite_invalid');
    if (!enabled && ['room-invite-create','room-invite-request','room-invite-confirm'].includes(operation.action)) fail(503, 'growth_room_invites_disabled');
    if (operation.action === 'room-invite-create') {
      if (!enabled) fail(503, 'growth_room_invites_disabled');
      if (!cohort.allowsCreation(owner)) fail(403, 'growth_cohort_excluded');
      let products;
      try { products = JSON.parse(p.previewProducts); } catch { fail(400, 'growth_invite_invalid'); }
      if (!Array.isArray(products) || JSON.stringify(products) !== p.previewProducts || products.length < 1 || products.length > 4
        || new Set(products).size !== products.length || !products.every(contract.id) || p.purpose !== 'choose_products'
        || !Number.isInteger(p.ttlHours) || p.ttlHours < 1 || p.ttlHours > 168) fail(400, 'growth_invite_invalid');
      const state = await authority(client, p.conversationId, owner, deviceId);
      if (!admin(state.info, owner)) fail(403, 'growth_invite_admin_required');
      for (const id of products) if (!await publicProduct(client, id, owner)) fail(404, 'growth_invite_product_unavailable');
      const token = makeToken(p.inviteId, owner, p.conversationId);
      const prior = (await client.query(`SELECT s.*,i.* FROM growth_shares s JOIN growth_loop_invites i ON i.share_id=s.id WHERE s.id=$1`, [p.inviteId])).rows[0];
      if (prior) {
        if (prior.owner_username !== owner || prior.content_id !== p.conversationId || prior.issuer_device_id !== deviceId
          || prior.purpose !== p.purpose || prior.ttl_hours !== p.ttlHours || JSON.stringify(prior.preview_products) !== p.previewProducts
          || prior.token_hash !== key(token)) fail(409, 'growth_invite_conflict');
        await load(client, p.inviteId, {username: owner}, key(token));
        return {version: 1, inviteId: p.inviteId, token, expiresAt: new Date(prior.expires_at).toISOString(), duplicate: true};
      }
      if ((await client.query('SELECT 1 FROM growth_shares WHERE id=$1', [p.inviteId])).rows.length) fail(409, 'growth_invite_conflict');
      await quota(client, 'invite:actor:' + actor(owner), 5);
      await quota(client, 'invite:device:' + key(deviceId), 5);
      await quota(client, 'invite:ip:' + key(context.ip || 'unknown'), 20);
      await quota(client, 'invite:daily:' + actor(owner), 50, 86400);
      const final = await authority(client, p.conversationId, owner, deviceId);
      if (!admin(final.info, owner)) fail(403, 'growth_invite_admin_required');
      for (const id of products) if (!await publicProduct(client, id, owner)) fail(404, 'growth_invite_product_unavailable');
      await client.query(`INSERT INTO growth_shares(id,content_type,content_id,source_surface,campaign_type,owner_username,actor_key,expires_at)
        VALUES($1,'SHOPPING_ROOM',$2,'room','organic_invite',$3,$4,NOW()+INTERVAL '30 days')`, [p.inviteId, p.conversationId, owner, actor(owner)]);
      const created = (await client.query(`INSERT INTO growth_loop_invites(share_id,token_hash,issuer_device_id,purpose,preview_products,ttl_hours,expires_at,measurement_enabled)
        VALUES($1,$2,$3,$4,$5::jsonb,$6::integer,NOW()+($6::integer)*INTERVAL '1 hour',$7::boolean) RETURNING expires_at`, [p.inviteId, key(token), deviceId, p.purpose, p.previewProducts, p.ttlHours,measurementEnabled])).rows[0];
      await safeEvent(client, 'invite-created:' + p.inviteId, p.inviteId, actor(owner), 'room_invite_created', 'server');
      return {version: 1, inviteId: p.inviteId, token, expiresAt: new Date(created.expires_at).toISOString(), duplicate: false};
    }
    if (operation.action === 'room-invite-requests') {
      const state = await authority(client, p.conversationId, owner, deviceId);
      if (!admin(state.info, owner)) fail(403, 'growth_invite_admin_required');
      const result = await client.query(`SELECT DISTINCT ON(r.recipient_username) r.invite_id AS "inviteId",r.recipient_username AS username,r.created_at AS "createdAt"
        FROM growth_invite_requests r JOIN growth_loop_invites i ON i.share_id=r.invite_id JOIN growth_shares s ON s.id=i.share_id
        JOIN users u ON u.username=r.recipient_username AND u.status='active'
        WHERE s.content_id=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND i.expires_at>NOW() AND r.status='requested'
          AND NOT EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_username=r.recipient_username AND blocked_username=ANY($2::text[]))
             OR (blocked_username=r.recipient_username AND blocker_username=ANY($2::text[])))
        ORDER BY r.recipient_username,r.created_at DESC LIMIT 50`, [p.conversationId, state.info.owners]);
      return {version: 1, requests: result.rows};
    }
    if (operation.action === 'room-invite-revoke') {
      const own = await authority(client, p.conversationId, owner, deviceId);
      if (!admin(own.info, owner)) fail(403, 'growth_invite_admin_required');
      const row = (await client.query(`SELECT 1 FROM growth_shares s JOIN growth_loop_invites i ON i.share_id=s.id
        WHERE s.id=$1 AND s.content_id=$2 AND s.content_type='SHOPPING_ROOM'`, [p.inviteId, p.conversationId])).rows[0];
      if (!row) fail(404, 'growth_invite_unavailable');
      await client.query('UPDATE growth_shares SET revoked_at=COALESCE(revoked_at,NOW()) WHERE id=$1', [p.inviteId]);
      return {version: 1, revoked: true};
    }
    const state = await load(client, p.inviteId, {username: owner}, p.tokenHash ?? null);
    if (state.invite.content_id !== p.conversationId) fail(404, 'growth_invite_unavailable');
    if (operation.action === 'room-invite-decline') {
      const own = await authority(client, p.conversationId, owner, deviceId);
      if (!admin(own.info, owner)) fail(403, 'growth_invite_admin_required');
      if (!contract.id(p.recipient)) fail(400, 'growth_invite_invalid');
      await client.query("UPDATE growth_invite_requests SET status='rejected' WHERE invite_id=$1 AND recipient_username=$2 AND status='requested'", [p.inviteId, p.recipient]);
      return {version: 1, declined: true};
    }
    if (!enabled) fail(503, 'growth_room_invites_disabled');
    if (!hashValid(p.tokenHash)) fail(404, 'growth_invite_unavailable');
    const prior = (await client.query('SELECT * FROM growth_invite_requests WHERE invite_id=$1 AND recipient_username=$2', [p.inviteId, owner])).rows[0];
    if (prior?.status === 'rejected') fail(403, 'growth_invite_declined');
    if (operation.action === 'room-invite-confirm') {
      if (!prior) fail(404, 'growth_invite_request_required');
      await authority(client, p.conversationId, owner, deviceId);
      await client.query("UPDATE growth_invite_requests SET status='accepted',accepted_at=COALESCE(accepted_at,NOW()) WHERE invite_id=$1 AND recipient_username=$2", [p.inviteId, owner]);
      if (measurementEnabled && prior.measurement_enabled && !prior.existing_member && owner !== state.invite.owner_username && cohort.allowsMeasurement(state.invite.owner_username, owner))
        await safeEvent(client, 'invite-accepted:' + p.inviteId + ':' + actor(owner), p.inviteId, actor(owner), 'room_invite_accepted', 'server');
      return {version: 1, status: 'accepted', conversationId: p.conversationId, duplicate: prior.status === 'accepted'};
    }
    if (prior) {
      if (prior.status === 'accepted') await authority(client, p.conversationId, owner, deviceId);
      return {version: 1, status: prior.status, conversationId: p.conversationId, duplicate: true};
    }
    if (!contract.uuid(p.sessionId)) fail(400, 'growth_invite_invalid');
    if ((await client.query('SELECT allow_invites FROM growth_invite_preferences WHERE owner_username=$1', [owner])).rows[0]?.allow_invites === false) fail(403, 'growth_invitations_disabled');
    await quota(client, 'invite-request:actor:' + actor(owner), 10);
    await quota(client, 'invite-request:ip:' + key(context.ip || 'unknown'), 30);
    const final = await load(client, p.inviteId, {username: owner}, p.tokenHash);
    const existingMember = final.info.owners.includes(owner);
    const accepted=existingMember&&final.info.roster.some(m=>m.owner===owner&&m.id===deviceId);
    if(accepted)await authority(client,p.conversationId,owner,deviceId);
    await client.query(`INSERT INTO growth_invite_requests(invite_id,recipient_username,actor_device_id,existing_member,actor_key,journey_actor_key,status,accepted_at,measurement_enabled)
      VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8 THEN NOW() ELSE NULL END,$9::boolean)`, [p.inviteId, owner, deviceId, existingMember, actor(owner), key('session:' + p.sessionId),accepted?'accepted':'requested',accepted,measurementEnabled&&final.invite.measurement_enabled&&!existingMember&&cohort.allowsMeasurement(final.invite.owner_username,owner)]);
    if (measurementEnabled && final.invite.measurement_enabled && !existingMember && cohort.allowsMeasurement(final.invite.owner_username, owner))
      await safeEvent(client, 'invite-requested:' + p.inviteId + ':' + actor(owner), p.inviteId, actor(owner), 'room_invite_requested', 'server');
    return {version: 1, status: accepted?'accepted':'requested', conversationId: p.conversationId, existingMember, duplicate: false};
  }
  async function resolveLoopInvite(token, context = {}) {
    if (!tokenValid(token)) fail(404, 'growth_invite_unavailable');
    return withTransaction(async client => {
      const row = (await client.query('SELECT share_id FROM growth_loop_invites WHERE token_hash=$1', [key(token)])).rows[0];
      if (!row) fail(404, 'growth_invite_unavailable');
      const initial = (await client.query('SELECT content_id FROM growth_shares WHERE id=$1', [row.share_id])).rows[0];
      if (!initial) fail(404, 'growth_invite_unavailable');
      return withTransportLocks(client, ['group:' + initial.content_id], async () => {
        const {invite} = await load(client, row.share_id, context, key(token));
        return {version: 1, inviteId: invite.id, purpose: invite.purpose,joiningEnabled:enabled,measurementEnabled:invite.measurement_enabled&&measurementEnabled,
          attributionContext:{attributionId:invite.id,sourceType:'shopping_room_invite',sourceSurface:'room',campaignType:'organic_invite',
            destinationType:'SHOPPING_ROOM',destinationId:invite.id,createdAt:new Date(invite.created_at).toISOString(),expiresAt:new Date(invite.expires_at).toISOString(),metadataVersion:1},
          productIds: await visibleProducts(client, invite, context.username || ''), expiresAt: new Date(invite.invite_expires_at).toISOString(),
          ...(context.username ? {joinContext: {conversationId: invite.content_id, tokenHash: key(token)}} : {})};
      });
    });
  }
  async function recordRoomGrowthEvent(payload, context) {
    if (!payload || Object.keys(payload).some(k => !['eventId', 'shareId', 'tokenHash', 'sessionId', 'eventType', 'schemaVersion'].includes(k))
      || payload.schemaVersion !== 1 || !contract.uuid(payload.eventId) || !contract.uuid(payload.sessionId)
      || !contract.uuid(payload.shareId) || !hashValid(payload.tokenHash)
      || !['room_invite_opened','room_invite_accepted', ...participationEvents].includes(payload.eventType)) fail(400, 'growth_invite_event_invalid');
    if (context.bot) return {ignored: 'crawler'};
    if (!measurementEnabled) return {ignored:'measurement_disabled'};
    return withTransaction(async client => {
      const {invite} = await load(client, payload.shareId, context, payload.tokenHash, {admission: payload.eventType === 'room_invite_opened'});
      if(!invite.measurement_enabled)return {ignored:'unmeasured_invitation'};
      if (!cohort.allowsMeasurement(invite.owner_username, context.username || '')) return {ignored: 'cohort'};
      if (invite.owner_username === context.username) return {ignored: 'source'};
      let actorKey = key('session:' + payload.sessionId);
      if (payload.eventType !== 'room_invite_opened') {
        if (!context.username) fail(403, 'growth_invite_membership_required');
        const request = (await client.query("SELECT * FROM growth_invite_requests WHERE invite_id=$1 AND recipient_username=$2 AND status IN ('requested','accepted')", [payload.shareId, context.username])).rows[0];
        if (!request || !request.measurement_enabled || request.existing_member) fail(403, 'growth_invite_membership_required');
        const info = await load(client, payload.shareId, context, payload.tokenHash, {admission: false});
        if (!info.info.owners.includes(context.username)) fail(403, 'growth_invite_membership_required');
        actorKey = actor(context.username);
        if(['first_vote','first_comment','first_product_added','room_shortlist_created','room_poll_closed'].includes(payload.eventType)){
          const message=(await client.query(`SELECT 1 FROM encrypted_conversation_messages m
            JOIN encrypted_conversation_epoch_devices d ON d.conversation_id=m.conversation_id AND d.epoch=m.epoch AND d.device_id=m.sender_device
            WHERE m.id=$1 AND m.conversation_id=$2 AND d.owner_id=$3 AND m.created_at>=$4::timestamptz LIMIT 1`,
          [payload.eventId,invite.content_id,context.username,new Date(request.created_at).toISOString()])).rows[0];
          if(!message)fail(403,'growth_room_action_required');
        }
        await client.query("UPDATE growth_invite_requests SET status='accepted',accepted_at=COALESCE(accepted_at,NOW()) WHERE invite_id=$1 AND recipient_username=$2", [payload.shareId, context.username]);
        const accepted = await eventWriter(client, 'invite-accepted:' + payload.shareId + ':' + actorKey, payload.shareId, actorKey, 'room_invite_accepted', 'server');
        if (payload.eventType === 'room_invite_accepted') return {accepted:true,duplicate:!accepted};
      }
      await quota(client, 'invite-event:actor:' + actorKey, 60);
      await quota(client, 'invite-event:ip:' + key(context.ip || 'unknown'), 120);
      const inserted = await eventWriter(client, payload.eventId, payload.shareId, actorKey, payload.eventType, 'client_observed');
      if (['first_vote','first_comment','first_product_added','room_shortlist_created','room_poll_closed'].includes(payload.eventType))
        await eventWriter(client, 'participated:' + payload.shareId + ':' + actorKey, payload.shareId, actorKey, 'room_participation_started', 'client_observed');
      return {accepted: true, duplicate: !inserted};
    });
  }
  async function invitePreferences(context, allowInvites) {
    if (!context.username) fail(403, 'growth_auth_required');
    if (allowInvites !== undefined && typeof allowInvites !== 'boolean') fail(400, 'growth_invite_preferences_invalid');
    return withTransaction(async client => {
      if (allowInvites !== undefined) await client.query(`INSERT INTO growth_invite_preferences(owner_username,allow_invites) VALUES($1,$2)
        ON CONFLICT(owner_username) DO UPDATE SET allow_invites=EXCLUDED.allow_invites,updated_at=NOW()`, [context.username, allowInvites]);
      const row = (await client.query('SELECT allow_invites FROM growth_invite_preferences WHERE owner_username=$1', [context.username])).rows[0];
      return {allowInvites: row?.allow_invites !== false};
    });
  }
  async function readRoomLoopHealth() {
    return withTransaction(async client => {
      const events = (await client.query(`SELECT e.event_type,e.verification,COUNT(*)::int AS count FROM growth_events e
        JOIN growth_shares s ON s.id=e.share_id JOIN growth_loop_invites i ON i.share_id=s.id AND i.measurement_enabled WHERE s.content_type='SHOPPING_ROOM'
        AND s.created_at>=NOW()-INTERVAL '30 days' GROUP BY e.event_type,e.verification`)).rows;
      const counts = {};
      for (const row of events) counts[row.event_type]=(counts[row.event_type] || 0)+Number(row.count);
      const summary = (await client.query(`WITH opens AS (
          SELECT e.share_id,e.actor_key,MIN(e.created_at) AS opened_at FROM growth_events e JOIN growth_shares s ON s.id=e.share_id JOIN growth_loop_invites i ON i.share_id=s.id AND i.measurement_enabled
          WHERE s.content_type='SHOPPING_ROOM' AND s.created_at>=NOW()-INTERVAL '30 days' AND e.event_type='room_invite_opened'
          AND e.actor_key<>s.actor_key GROUP BY e.share_id,e.actor_key
        ), journeys AS (
          SELECT o.*,r.status,r.existing_member,r.actor_key AS member_actor,
            MIN(e.created_at) FILTER(WHERE e.event_type='room_participation_started' AND e.created_at>=r.accepted_at) AS activated_at,
            MIN(e.created_at) FILTER(WHERE e.event_type IN ('room_shortlist_created','room_poll_closed','first_order_started') AND e.created_at>=r.accepted_at) AS value_at,
            BOOL_OR(e.event_type='new_room_created_from_invited_user' AND e.created_at>=r.accepted_at) AS continued
          FROM opens o LEFT JOIN growth_invite_requests r ON r.invite_id=o.share_id AND r.journey_actor_key=o.actor_key AND r.measurement_enabled
          LEFT JOIN growth_events e ON e.share_id=o.share_id AND e.actor_key=r.actor_key
          GROUP BY o.share_id,o.actor_key,o.opened_at,r.status,r.existing_member,r.actor_key
        ) SELECT COUNT(*)::int AS opens,COUNT(DISTINCT share_id)::int AS opened_invites,
          COUNT(*) FILTER(WHERE status IS NOT NULL AND NOT existing_member)::int AS requests,
          COUNT(*) FILTER(WHERE status='accepted' AND NOT existing_member)::int AS accepts,
          COUNT(*) FILTER(WHERE activated_at IS NOT NULL AND NOT existing_member)::int AS activations,
          COUNT(*) FILTER(WHERE activated_at IS NOT NULL AND value_at>=activated_at AND NOT existing_member)::int AS values,
          COUNT(*) FILTER(WHERE value_at>=activated_at AND continued AND NOT existing_member)::int AS continuations,
          AVG(EXTRACT(EPOCH FROM value_at-opened_at)) FILTER(WHERE activated_at IS NOT NULL AND value_at>=activated_at AND value_at>=opened_at AND NOT existing_member)::float8 AS time_to_value_seconds,
          (SELECT COUNT(*)::int FROM (SELECT member_actor FROM journeys WHERE activated_at IS NOT NULL AND NOT existing_member
            GROUP BY member_actor HAVING COUNT(*)>1) repeated)::int AS repeat_recipients
        FROM journeys`)).rows[0] || {};
      const entryCount = Number((await client.query(`SELECT COUNT(*)::int AS count FROM growth_shares s JOIN growth_loop_invites i ON i.share_id=s.id AND i.measurement_enabled
        WHERE content_type='SHOPPING_ROOM' AND s.created_at>=NOW()-INTERVAL '30 days'`)).rows[0]?.count || 0);
      const ratio = (numerator, denominator) => Number(denominator) ? Number(numerator)/Number(denominator) : null;
      return {schemaVersion:1,loop:'shopping_room',windowDays:30,entryCount,counts,
        invitationsCreated:counts.room_invite_created || 0,invitationsDelivered:null,
        cohort:{basis:'measurement_eligible_invites_created_last_30_days',humanOpenShareRate:ratio(summary.opened_invites,entryCount),
          humanOpenJourneys:Number(summary.opens || 0),requestCount:Number(summary.requests || 0),canonicalAcceptCount:Number(summary.accepts || 0),
          activationCount:Number(summary.activations || 0),valueCount:Number(summary.values || 0),continuationCount:Number(summary.continuations || 0),
          requestRate:ratio(summary.requests,summary.opens),joinRate:ratio(summary.accepts,summary.requests),
          activationRate:ratio(summary.activations,summary.accepts),valueRate:ratio(summary.values,summary.activations),
          continuationRate:ratio(summary.continuations,summary.values),timeToValueSeconds:summary.time_to_value_seconds ?? null,
          repeatRecipients:Number(summary.repeat_recipients || 0),viralCoefficient:null},
        limitations:['Membership acceptance is server verified; E2EE participation and shortlist/poll events are client observed.',
          'Guest preview reveals only explicitly selected, currently public products; no room history or private message bodies enter analytics.',
          'Existing members, source-user touches and known preview crawlers do not count as acquired participation.',
          'No external recipient delivery is known; no delivered-invite count, purchase claim or K-factor is inferred.',
          'Cohort joins use the bounded browser journey declared on the signed request; cross-device acquisition is not inferred.']};
    });
  }
  async function resolveInviteSafetyTarget(token,context){
    if(!context.username)fail(403,'growth_auth_required');
    if(!tokenValid(token))fail(404,'growth_invite_unavailable');
    return withTransaction(async client=>{
      const row=(await client.query(`SELECT s.owner_username,s.id FROM growth_loop_invites i JOIN growth_shares s ON s.id=i.share_id
        WHERE i.token_hash=$1 AND s.content_type='SHOPPING_ROOM'`,[key(token)])).rows[0];
      if(!row?.owner_username)fail(404,'growth_invite_unavailable');
      if(row.owner_username===context.username)fail(400,'growth_invite_self_action');
      return {username:row.owner_username,inviteId:row.id};
    });
  }
  async function recordInviteSafetyEvent(inviteId,context,eventType){
    if(!measurementEnabled||!context.username||!contract.uuid(inviteId)||!['room_invite_reported','room_inviter_blocked'].includes(eventType))return;
    return withTransaction(async client=>{
      const source=(await client.query('SELECT s.owner_username FROM growth_loop_invites i JOIN growth_shares s ON s.id=i.share_id WHERE i.share_id=$1 AND i.measurement_enabled',[inviteId])).rows[0];
      if(!source?.owner_username||!cohort.allowsMeasurement(source.owner_username,context.username))return;
      await safeEvent(client,'invite-safety:'+inviteId+':'+actor(context.username)+':'+eventType,inviteId,actor(context.username),eventType,'server');
    });
  }
  return {handle, resolveLoopInvite, recordRoomGrowthEvent, invitePreferences, readRoomLoopHealth,resolveInviteSafetyTarget,recordInviteSafetyEvent};
}
module.exports = {fields, createLoopInvites};
