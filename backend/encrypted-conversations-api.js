function createEncryptedConversationsApi({collectBody,sendJson,findSession,readAuthToken,ensureMarketplaceUser,getPostgresStore,enabled=false,legacyOnly=false,mediaEnabled=false,multiDeviceEnabled=false,roomsEnabled=false,metrics=require('./conversation-metrics').conversationMetrics}) {
  async function handle(req,res,url) {
    if(!['/api/conversations/encrypted/capabilities','/api/conversations/encrypted/operations','/api/conversations/encrypted/mode'].includes(url.pathname)) return false;
    const headers={'Cache-Control':'private, no-store',Pragma:'no-cache'};
    const mode=url.pathname.endsWith('/mode');
    if(!enabled && !mode) {sendJson(res,404,{code:'encrypted_conversations_disabled'},headers);return true;}
    const session=findSession(readAuthToken(req)),user=ensureMarketplaceUser(session,res);if(!user)return true;
    let measuredAction;const started=performance.now();
    const record=status=>{try{metrics.record(measuredAction,status,performance.now()-started);}catch{/* Metrics never affect durable delivery. */}};
    try {
      if(mode && req.method==='GET') {
        const store=getPostgresStore();
        if(store?.readEncryptedConversationMode)sendJson(res,200,await store.readEncryptedConversationMode({owner:user.username,token:session.token,deviceId:session.sessionId},url.searchParams.get('peer')),headers);
        else if(!enabled && legacyOnly)sendJson(res,200,{version:1,mode:'legacy-plaintext'},headers);
        else sendJson(res,503,{code:'encrypted_store_unavailable'},headers);
      }
      else if(url.pathname.endsWith('/capabilities') && req.method==='GET') sendJson(res,200,{version:1,enabled:true,mediaEnabled:enabled&&mediaEnabled,multiDeviceEnabled:enabled&&multiDeviceEnabled,...(roomsEnabled?{roomsEnabled:true}:{})},headers);
      else if(url.pathname.endsWith('/operations') && req.method==='POST') {
        const store=getPostgresStore();if(!store?.encryptedOperation)throw Object.assign(new Error(),{status:503,code:'encrypted_store_unavailable'});
        const operation=await collectBody(req,{maxBytes:262144});measuredAction=operation?.action;
        const result=await store.encryptedOperation({owner:user.username,token:session.token,deviceId:session.sessionId},operation);
        record(200);sendJson(res,200,result,headers);
      } else sendJson(res,405,{code:'method_not_allowed'},headers);
    }catch(error){
      record(error.status||503);
      if(error.status===429 && Number.isInteger(error.retryAfterSeconds) && error.retryAfterSeconds>0 && error.retryAfterSeconds<=3600)
        headers['Retry-After']=String(error.retryAfterSeconds);
      sendJson(res,error.status||503,{code:error.status?error.code:'encrypted_transport_unavailable'},headers);
    }
    return true;
  }
  return {handle};
}
module.exports={createEncryptedConversationsApi};
