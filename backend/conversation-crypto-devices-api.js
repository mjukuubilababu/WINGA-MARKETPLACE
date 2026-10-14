function createConversationCryptoDevicesApi({collectBody,sendJson,findSession,readAuthToken,ensureMarketplaceUser,getPostgresStore,enabled=false,packagesEnabled=false}) {
  async function handle(req,res,url) {
    const packages = url.pathname === '/api/conversations/crypto/key-packages';
    const activity=url.pathname==='/api/conversations/activity-preferences';
    if(url.pathname!=='/api/conversations/crypto/devices' && !packages&&!activity) return false;
    const headers={'Cache-Control':'private, no-store',Pragma:'no-cache'};
    if(!enabled || (packages && !packagesEnabled)) {sendJson(res,404,{code:'crypto_devices_disabled'},headers);return true;}
    const session=findSession(readAuthToken(req)),user=ensureMarketplaceUser(session,res);
    if(!user) return true;
    const store=getPostgresStore();
    const read = activity?store?.readConversationActivityPreferences:packages ? store?.readOwnCryptoKeyPackages : store?.readConversationCryptoDevices;
    const mutate = activity?store?.authorizeConversationActivity:packages ? store?.publishCryptoKeyPackage : store?.mutateConversationCryptoDevice;
    if(!read || !mutate) {sendJson(res,503,{code:'crypto_devices_unavailable'},headers);return true;}
    try {
      const context={owner:user.username,token:session.token,deviceId:session.sessionId};
      let payload;
      if(req.method==='POST'){
        payload=await collectBody(req,{maxBytes:packages?16384:4096});
        if(activity&&payload?.action!=='activity-preference'){
          sendJson(res,400,{code:'activity_preference_invalid'},headers);return true;
        }
      }
      const result=req.method==='GET'?await read(context)
        :req.method==='POST'?await mutate(context,payload):null;
      if(!result) sendJson(res,405,{code:'method_not_allowed'},{...headers,Allow:'GET, POST'});
      else sendJson(res,200,result,headers);
    } catch(error) {sendJson(res,error.status||503,{code:error.status?error.code:'crypto_devices_unavailable'},headers);}
    return true;
  }
  return {handle};
}
module.exports={createConversationCryptoDevicesApi};
