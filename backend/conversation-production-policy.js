const FLAGS=Object.freeze({
  devices:'WINGA_CRYPTO_DEVICES_ENABLED',mls:'WINGA_MLS_CANDIDATE_ENABLED',
  conversations:'WINGA_ENCRYPTED_CONVERSATIONS_ENABLED',media:'WINGA_ENCRYPTED_MEDIA_ENABLED',
  recovery:'WINGA_ENCRYPTED_BACKUP_ENABLED',multiDevice:'WINGA_ENCRYPTED_MULTIDEVICE_ENABLED',
  rooms:'WINGA_ENCRYPTED_ROOMS_ENABLED'
});
function readConversationProductionPolicy(env=process.env) {
  const features=Object.fromEntries(Object.entries(FLAGS).map(([name,key])=>[name,env[key]==='true']));
  const missingFlags=Object.entries(FLAGS).filter(([name])=>!features[name]).map(([,key])=>key);
  const dependencyErrors=[];
  if(features.mls&&!features.devices)dependencyErrors.push('mls_requires_devices');
  if(features.conversations&&(!features.devices||!features.mls))dependencyErrors.push('conversations_require_devices_and_mls');
  for(const name of ['media','recovery','multiDevice','rooms'])
    if(features[name]&&!features.conversations)dependencyErrors.push(name+'_requires_conversations');
  if(features.multiDevice&&!features.recovery)dependencyErrors.push('multi_device_requires_recovery');
  return {features,missingFlags,dependencyErrors,fullProfileEnabled:missingFlags.length===0&&dependencyErrors.length===0,
    dispatchEnabled:env.WINGA_MESSAGE_DISPATCH_ENABLED!=='false',pushEnabled:env.WINGA_WEB_PUSH_ENABLED!=='false'};
}
module.exports={FLAGS,readConversationProductionPolicy};
