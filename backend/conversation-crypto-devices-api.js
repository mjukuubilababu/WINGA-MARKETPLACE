function createConversationCryptoDevicesApi({collectBody,sendJson,findSession,readAuthToken,ensureMarketplaceUser,getPostgresStore,enabled=false,packagesEnabled=false}) {
  async function handle(req,res,url) {
    const packages = url.pathname === '/api/conversations/crypto/key-packages';
    if(url.pathname!=='/api/conversations/crypto/devices' && !packages) return false;
    const headers={'Cache-Control':'private, no-store',Pragma:'no-cache'};
    if(!enabled || (packages && !packagesEnabled)) {sendJson(res,404,{code:'crypto_devices_disabled'},headers);return true;}
    const session=findSession(readAuthToken(req)),user=ensureMarketplaceUser(session,res);
    if(!user) return true;
    const store=getPostgresStore();
    const read = packages ? store?.readOwnCryptoKeyPackages : store?.readConversationCryptoDevices;
    const mutate = packages ? store?.publishCryptoKeyPackage : store?.mutateConversationCryptoDevice;
    if(!read || !mutate) {sendJson(res,503,{code:'crypto_devices_unavailable'},headers);return true;}
    try {
      const context={owner:user.username,token:session.token,deviceId:session.sessionId};
      const result=req.method==='GET'?await read(context)
        :req.method==='POST'?await mutate(context,await collectBody(req,{maxBytes:packages?16384:4096})):null;
      if(!result) sendJson(res,405,{code:'method_not_allowed'},{...headers,Allow:'GET, POST'});
      else sendJson(res,200,result,headers);
    } catch(error) {sendJson(res,error.status||503,{code:error.status?error.code:'crypto_devices_unavailable'},headers);}
    return true;
  }
  return {handle};
}
module.exports={createConversationCryptoDevicesApi};
