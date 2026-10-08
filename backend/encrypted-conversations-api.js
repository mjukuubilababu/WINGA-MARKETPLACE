function createEncryptedConversationsApi({collectBody,sendJson,findSession,readAuthToken,ensureMarketplaceUser,getPostgresStore,enabled=false,legacyOnly=false,mediaEnabled=false,multiDeviceEnabled=false,roomsEnabled=false,roomLimits,env=process.env,metrics=require('./conversation-metrics').conversationMetrics}) {
  const limits=require('./encrypted-room-limits').roomLimits(roomLimits);
  async function handle(req,res,url) {
    if(!['/api/conversations/encrypted/capabilities','/api/conversations/encrypted/operations','/api/conversations/encrypted/mode','/api/conversations/experience'].includes(url.pathname)) return false;
    const headers={'Cache-Control':'private, no-store',Pragma:'no-cache'};
    const mode=url.pathname.endsWith('/mode');
    const experience=url.pathname==='/api/conversations/experience';
    if(!enabled && !mode && !experience) {sendJson(res,404,{code:'encrypted_conversations_disabled'},headers);return true;}
    const session=findSession(readAuthToken(req)),user=ensureMarketplaceUser(session,res);if(!user)return true;
    let measuredAction;const started=performance.now();
    const record=status=>{try{metrics.record(measuredAction,status,performance.now()-started);}catch{/* Metrics never affect durable delivery. */}};
    try {
      if(experience){
        if(req.method!=='POST'){sendJson(res,405,{code:'method_not_allowed'},headers);return true;}
        const store=getPostgresStore();if(!store?.publishConversationExperience)throw Object.assign(new Error(),{status:503,code:'conversation_experience_unavailable'});
        sendJson(res,200,await store.publishConversationExperience({owner:user.username,token:session.token,deviceId:session.sessionId},await collectBody(req,{maxBytes:65536})),headers);
        return true;
      }
      if(!mode){const release=require('./conversation-release-policy');release.assertCompatibleProtocol(release.readConversationReleasePolicy(env));}
      if(mode && req.method==='GET') {
        const store=getPostgresStore();
        if(store?.readEncryptedConversationMode)sendJson(res,200,await store.readEncryptedConversationMode({owner:user.username,token:session.token,deviceId:session.sessionId},url.searchParams.get('peer')),headers);
        else if(!enabled && legacyOnly)sendJson(res,200,{version:1,mode:'legacy-plaintext'},headers);
        else sendJson(res,503,{code:'encrypted_store_unavailable'},headers);
      }
      else if(url.pathname.endsWith('/capabilities') && req.method==='GET') sendJson(res,200,{version:1,enabled:true,mediaEnabled:enabled&&mediaEnabled,multiDeviceEnabled:enabled&&multiDeviceEnabled,...(roomsEnabled?{roomsEnabled:true,roomLimits:limits}:{})},headers);
      else if(url.pathname.endsWith('/operations') && req.method==='POST') {
        const store=getPostgresStore();if(!store?.encryptedOperation)throw Object.assign(new Error(),{status:503,code:'encrypted_store_unavailable'});
        const operation=await collectBody(req,{maxBytes:262144});measuredAction=operation?.action;
        const result=await store.encryptedOperation({owner:user.username,token:session.token,deviceId:session.sessionId},operation);
        record(200);sendJson(res,200,result,headers);
      } else sendJson(res,405,{code:'method_not_allowed'},headers);
    }catch(error){
      record(error.status||503);
      if(error.status===426||['encrypted_operation_invalid','encrypted_proof_expired','encrypted_proof_rejected','encrypted_send_conflict'].includes(error.code))
        try{metrics.record('protocol-error',error.status||400,performance.now()-started);}catch{}
      if(error.status===429 && Number.isInteger(error.retryAfterSeconds) && error.retryAfterSeconds>0 && error.retryAfterSeconds<=3600)
        headers['Retry-After']=String(error.retryAfterSeconds);
      sendJson(res,error.status||503,{code:error.status?error.code:'encrypted_transport_unavailable'},headers);
    }
    return true;
  }
  return {handle};
}
module.exports={createEncryptedConversationsApi};
