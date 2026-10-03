function createEncryptedConversationBackupsApi(deps) {
  const { collectBody, sendJson, findSession, readAuthToken, ensureMarketplaceUser,
    getPostgresStore, enabled = false } = deps;
  async function handle(req, res, url) {
    if (!['/api/conversations/recovery','/api/conversations/recovery/capabilities'].includes(url.pathname)) return false;
    const headers = { 'Cache-Control': 'private, no-store', 'Pragma': 'no-cache' };
    if (!enabled) { sendJson(res, 404, { code: 'encrypted_backup_disabled' }, headers); return true; }
    const session = findSession(readAuthToken(req));
    const user = ensureMarketplaceUser(session, res);
    if (!user) return true;
    if(url.pathname.endsWith('/capabilities')) {
      sendJson(res,req.method==='GET'?200:405,req.method==='GET'?{enabled:true,version:1}:{code:'method_not_allowed'},headers);return true;
    }
    const store = getPostgresStore();
    if (!store?.readEncryptedConversationBackup) {
      sendJson(res, 503, { code: 'encrypted_backup_unavailable' }, headers); return true;
    }
    const context = { owner: user.username, token: session.token, deviceId: session.sessionId };
    try {
      let result;
      if (req.method === 'GET') result = await store.readEncryptedConversationBackup(context);
      else if (req.method === 'PUT') result = await store.writeEncryptedConversationBackup(
        context, await collectBody(req, { maxBytes: 6 * 1024 * 1024 }),
      );
      else if (req.method === 'DELETE') result = await store.deleteEncryptedConversationBackup(
        context, await collectBody(req, { maxBytes: 256 }),
      );
      else { sendJson(res, 405, { code: 'method_not_allowed' }, { ...headers, Allow: 'GET, PUT, DELETE' }); return true; }
      sendJson(res, 200, result, headers);
    } catch (error) {
      sendJson(res, error.status || 503, {
        code: error.status ? error.code : 'encrypted_backup_unavailable'
      }, headers);
    }
    return true;
  }
  return { handle };
}
module.exports = { createEncryptedConversationBackupsApi };
