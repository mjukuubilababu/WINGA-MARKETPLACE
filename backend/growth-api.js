const { crawler, uuid } = require('../src/growth/contract');

function createGrowthApi(deps) {
  return { async handle(req, res, url) {
    const path = url.pathname;
    if (!path.startsWith('/api/growth/') && !path.startsWith('/api/admin/growth/')) return false;
    const send = (status, body, headers = {}) => deps.sendJson(res, status, body, { 'Cache-Control': 'private, no-store', ...headers });
    const session = deps.findSession(deps.readAuthToken(req));
    const context = { username: session?.username || '', ip: deps.clientIp(req), bot: crawler(req.headers['user-agent']) };
    const store = deps.getStore();
    try {
      if (path === '/api/admin/growth/health' && req.method === 'GET') {
        if (!session || !deps.isAdminSession(session)) { send(403, { code: 'growth_admin_required' }); return true; }
        if (!store?.readGrowthHealth) { send(503, { code: 'growth_unavailable' }); return true; }
        send(200, await store.readGrowthHealth()); return true;
      }
      if (path === '/api/admin/growth/prune' && req.method === 'POST') {
        if (!session || !deps.isAdminSession(session)) { send(403, { code: 'growth_admin_required' }); return true; }
        if (!store?.pruneGrowthRecords) { send(503, { code: 'growth_unavailable' }); return true; }
        send(200,await store.pruneGrowthRecords()); return true;
      }
      if (session && !deps.ensureUser(session, res)) return true;
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
