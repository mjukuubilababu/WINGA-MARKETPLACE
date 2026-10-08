const {readConversationProductionPolicy}=require('./conversation-production-policy');
function evaluateConversationOperations({state,privateStorage,policy,now=Date.now(),nodeVersion=process.versions.node}) {
  const alerts=[];
  const runtime={nodeVersion,supported:Number(nodeVersion.split('.')[0])===24};
  if(!runtime.supported)alerts.push('conversation_runtime_unsupported');
  if(!state?.schema?.ready)alerts.push('conversation_schema_not_ready');
  if(!state?.rooms?.schemaReady||!state.rooms.ok)alerts.push('room_invariants_not_ready');
  if(!state?.metrics?.available)alerts.push('conversation_fleet_metrics_unavailable');
  if(state?.metrics?.available&&!(state.metrics.activePublishers>=1))alerts.push('conversation_metrics_publisher_stale');
  if(!privateStorage.privacyVerified)alerts.push('conversation_private_storage_not_verified');
  if(!policy.fullProfileEnabled)alerts.push('conversation_full_profile_not_enabled');
  if(!policy.dispatchEnabled)alerts.push('conversation_dispatch_disabled');
  if(!policy.pushEnabled)alerts.push('conversation_push_disabled');
  if(!state?.dispatch||state.dispatch.oldestPendingAgeSeconds>60)alerts.push('conversation_dispatch_delayed');
  if(!state?.push||state.push.oldestDueAgeSeconds>300||state.push.exhausted>0)alerts.push('conversation_push_delayed');
  if(!state?.media||state.media.oldestCleanupAgeSeconds>600)alerts.push('conversation_media_cleanup_delayed');
  const operations=state?.metrics?.operations||[];
  const samples=operations.reduce((total,row)=>total+row.count,0);
  const unavailable=operations.filter(row=>row.outcome==='unavailable').reduce((total,row)=>total+row.count,0);
  const rate=samples?unavailable/samples:0;
  if(samples>=20&&rate>0.1)alerts.push('conversation_operation_unavailability_exceeded');
  const sampledAt=Date.parse(state?.metrics?.lastPublishedAt);
  if(samples&&(!Number.isFinite(sampledAt)||now-sampledAt>120000)&&!alerts.includes('conversation_metrics_publisher_stale'))alerts.push('conversation_metrics_publisher_stale');
  const sends=operations.filter(row=>['send','room-send'].includes(row.action));
  const sendAttempts=sends.reduce((total,row)=>total+row.count,0),sendUnavailable=sends.filter(row=>row.outcome==='unavailable').reduce((total,row)=>total+row.count,0);
  if(sendAttempts>=20&&sendUnavailable/sendAttempts>0.1)alerts.push('conversation_send_unavailability_exceeded');
  return {ok:alerts.length===0,readiness:alerts.length?'degraded':'ready',mode:'conversation-operational-health',
    privacy:'aggregate-only',time:new Date(now).toISOString(),alerts,policy,privateStorage,...state,runtime,
    observation:{samples,unavailable,unavailabilityRate:rate,sendAttempts,sendUnavailable,sufficientSamples:samples>=20,
      accounting:'operation-attempts-including-retries',window:'current-and-previous-23-UTC-hours'},
    acceptance:{authenticatedDeviceFlowVerified:false,productionLoadVerified:false,cryptographicAuditApproved:false},
    databaseChanged:false,remoteWrites:false};
}
function createConversationOperationsHealth({getStore,env=process.env,now=Date.now,
  privacyCheck=require('./backup-legacy-private-media').assertPrivateBucket}={}) {
  let cached,inflight,expires=0;
  return async function read() {
    if(cached&&now()<expires)return structuredClone(cached);
    if(inflight)return structuredClone(await inflight);
    inflight=(async()=>{
      const store=getStore();
      if(!store?.readConversationOperationsHealth)throw Error('conversation_health_unavailable');
      const policy=readConversationProductionPolicy(env);
      const privateStorage={configurationValid:false,privacyVerified:false};
      try {
        const config=require('./conversation-private-media').readPrivateMediaConfig(env);
        privateStorage.configurationValid=true;
        await privacyCheck(config);privateStorage.privacyVerified=true;
      }catch {privateStorage.errorCode=privateStorage.configurationValid?'PRIVATE_BUCKET_PRIVACY_CHECK_FAILED':'PRIVATE_BUCKET_CONFIGURATION_REQUIRED';}
      const state=await store.readConversationOperationsHealth();
      cached=evaluateConversationOperations({state,privateStorage,policy,now:now()});
      expires=now()+(cached.ok?30000:5000);return cached;
    })();
    try{return structuredClone(await inflight);}finally{inflight=null;}
  };
}
module.exports={evaluateConversationOperations,createConversationOperationsHealth};
