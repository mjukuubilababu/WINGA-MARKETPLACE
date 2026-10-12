const { crawler, uuid } = require('../src/growth/contract');
const { createGrowthPolicy } = require('./growth-policy');

function createGrowthApi(deps) {
  const cohort = deps.cohort || createGrowthPolicy();
  return { async handle(req, res, url) {
    const path = url.pathname;
    if (!path.startsWith('/api/growth/') && !path.startsWith('/api/admin/growth/')) return false;
    const send = (status, body, headers = {}) => deps.sendJson(res, status, body, { 'Cache-Control': 'private, no-store', ...headers });
    const session = deps.findSession(deps.readAuthToken(req));
    const context = { username: session?.username || '', ip: deps.clientIp(req), bot: crawler(req.headers['user-agent']), growthCohort: cohort };
    const store = deps.getStore();
    try {
      if (path === '/api/admin/growth/health' && req.method === 'GET') {
        if (!session || !deps.isAdminSession(session)) { send(403, { code: 'growth_admin_required' }); return true; }
        if (!store?.readGrowthHealth) { send(503, { code: 'growth_unavailable' }); return true; }
        send(200, { ...await store.readGrowthHealth(), rollout: cohort.summary }); return true;
      }
      if (path === '/api/admin/growth/rooms' && req.method === 'GET') {
        if (!session || !deps.isAdminSession(session)) {send(403,{code:'growth_admin_required'});return true;}
        if (!store?.readRoomLoopHealth) {send(503,{code:'growth_unavailable'});return true;}
        send(200,{...await store.readRoomLoopHealth(),rollout:cohort.summary});return true;
      }
      if (path === '/api/admin/growth/prune' && req.method === 'POST') {
        if (!session || !deps.isAdminSession(session)) { send(403, { code: 'growth_admin_required' }); return true; }
        if (!store?.pruneGrowthRecords) { send(503, { code: 'growth_unavailable' }); return true; }
        send(200,await store.pruneGrowthRecords()); return true;
      }
      if (session && !deps.ensureUser(session, res)) return true;
      const inviteMatch = /^\/api\/growth\/invites\/([A-Za-z0-9_-]{43})$/.exec(path);
      if (inviteMatch && req.method === 'GET') {
        if (!store?.resolveLoopInvite) { send(503, {code: 'growth_unavailable'}); return true; }
        send(200, await store.resolveLoopInvite(inviteMatch[1], context)); return true;
      }
      const inviteSafety=/^\/api\/growth\/invites\/([A-Za-z0-9_-]{43})\/(block|report)$/.exec(path);
      if(inviteSafety&&req.method==='POST'){
        if(!session){send(403,{code:'growth_auth_required'});return true;}
        if(!store?.resolveInviteSafetyTarget){send(503,{code:'growth_unavailable'});return true;}
        const payload=await deps.collectBody(req,{maxBytes:1024});
        if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(k=>k!=='reason')||payload.reason!==undefined&&!['spam','harassment'].includes(payload.reason)){send(400,{code:'growth_invite_safety_invalid'});return true;}
        const target=await store.resolveInviteSafetyTarget(inviteSafety[1],context);
        if(inviteSafety[2]==='block'){
          if(!store.setUserBlock){send(503,{code:'growth_unavailable'});return true;}
          const result=await store.setUserBlock(context.username,target.username,true);
          if(!result.updated){send(404,{code:'growth_invite_unavailable'});return true;}
          Promise.resolve().then(()=>store.recordInviteSafetyEvent?.(target.inviteId,context,'room_inviter_blocked')).catch(()=>{});
          send(200,{blocked:true});return true;
        }
        if(!deps.reportInvite){send(503,{code:'growth_unavailable'});return true;}
        const result=await deps.reportInvite(context.username,target.username,payload.reason || 'spam');
        if(!result?.created&&result?.code!=='duplicate_report'){send(503,{code:'growth_unavailable'});return true;}
        Promise.resolve().then(()=>store.recordInviteSafetyEvent?.(target.inviteId,context,'room_invite_reported')).catch(()=>{});
        send(200,{reported:true,duplicate:result?.code==='duplicate_report'});return true;
      }
      if (path === '/api/growth/invite-preferences' && ['GET','PUT'].includes(req.method)) {
        if (!session) { send(403, {code: 'growth_auth_required'}); return true; }
        if (!store?.invitePreferences) { send(503, {code: 'growth_unavailable'}); return true; }
        let value;
        if (req.method === 'PUT') {
          const payload = await deps.collectBody(req, {maxBytes: 1024});
          if (!payload || Object.keys(payload).join(',') !== 'allowInvites' || typeof payload.allowInvites !== 'boolean') {send(400, {code: 'growth_invite_preferences_invalid'}); return true;}
          value = payload.allowInvites;
        }
        send(200, await store.invitePreferences(context, value)); return true;
      }
      if (path === '/api/growth/room-events' && req.method === 'POST') {
        if (!deps.measurementEnabled) {send(404, {code: 'growth_measurement_disabled'}); return true;}
        if (!store?.recordRoomGrowthEvent) {send(503, {code: 'growth_unavailable'}); return true;}
        send(202, await store.recordRoomGrowthEvent(await deps.collectBody(req, {maxBytes: 4096}), context)); return true;
      }
      const match = /^\/api\/growth\/shares\/([0-9a-f-]+)$/.exec(path);
      // Read existing envelopes even after creation/measurement is disabled.
      if (match && uuid(match[1]) && req.method === 'GET') {
        if (!store?.resolveGrowthShare) { send(503, { code: 'growth_unavailable' }); return true; }
        send(200, await store.resolveGrowthShare(match[1], context)); return true;
      }
      if (match && uuid(match[1]) && req.method === 'DELETE') {
        if (!store?.revokeGrowthShare) { send(503, { code: 'growth_unavailable' }); return true; }
        send(200, await store.revokeGrowthShare(match[1], context)); return true;
      }
      if (path === '/api/growth/shares' && req.method === 'POST') {
        if (!deps.productSharingEnabled) { send(404, { code: 'growth_sharing_disabled' }); return true; }
        if (!cohort.allowsCreation(context.username)) { send(403, { code: 'growth_cohort_excluded' }); return true; }
        if (context.bot) { send(400, { code: 'growth_crawler_rejected' }); return true; }
        if (!store?.createGrowthShare) { send(503, { code: 'growth_unavailable' }); return true; }
        const payload = await deps.collectBody(req, { maxBytes: 4096 });
        send(200, await store.createGrowthShare(payload, context)); return true;
      }
      if (path === '/api/growth/events' && req.method === 'POST') {
        if (!deps.measurementEnabled) { send(404, { code: 'growth_measurement_disabled' }); return true; }
        if (!store?.recordGrowthEvent) { send(503, { code: 'growth_unavailable' }); return true; }
        const payload = await deps.collectBody(req, { maxBytes: 4096 });
        send(202, await store.recordGrowthEvent(payload, context)); return true;
      }
      send(404, { code: 'growth_route_unavailable' });
    } catch (error) {
      const status = [400,403,404,409,429].includes(error.status) ? error.status : 503;
      send(status, { code: status === 503 ? 'growth_unavailable' : error.code }, status === 429 ? { 'Retry-After': '60' } : {});
    }
    return true;
  } };
}
module.exports = { createGrowthApi };
