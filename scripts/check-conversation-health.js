const ALLOWED_HOSTS=new Set(['winga-pflp.onrender.com','wingamarket.com','www.wingamarket.com']);
async function checkConversationHealth({url='https://winga-pflp.onrender.com/api/ops/conversations/health',token,
  fetchImpl=fetch,allowLocal=false}={}) {
  let target;
  try {
    target=new URL(url);
    if(target.username||target.password||target.search||target.hash||target.pathname!=='/api/ops/conversations/health'
      ||!(target.protocol==='https:'&&ALLOWED_HOSTS.has(target.hostname)&&!target.port
        ||allowLocal&&target.protocol==='http:'&&target.hostname==='127.0.0.1'))throw Error();
    if(typeof token!=='string'||token.length<16)throw Error();
  }catch{return {ok:false,status:'configuration_error',privacy:'aggregate-only'};}
  try {
    const response=await fetchImpl(target,{headers:{'X-Ops-Health-Token':token},redirect:'error',signal:AbortSignal.timeout(45000)});
    if(![200,503].includes(response.status)||!response.headers.get('content-type')?.includes('application/json'))
      return {ok:false,status:'http_error',httpStatus:response.status,privacy:'aggregate-only'};
    const reader=response.body.getReader();let bytes=0;const chunks=[];
    try {while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
      if(bytes>262144)throw Error();chunks.push(Buffer.from(part.value));}}
    finally{await reader.cancel().catch(()=>{});}
    const health=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(health.privacy!=='aggregate-only'||health.mode!=='conversation-operational-health'
      ||typeof health.ok!=='boolean'||!Array.isArray(health.alerts)
      ||health.alerts.some(v=>typeof v!=='string'||!/^conversation_[a-z_]+$|^room_[a-z_]+$/.test(v)))throw Error();
    // Never print arbitrary response bodies, operational secrets or provider errors.
    const result={ok:response.status===200&&health.ok===true&&health.readiness==='ready'&&health.alerts.length===0,status:'checked',
      privacy:'aggregate-only',httpStatus:response.status,alerts:health.alerts,
      readiness:health.readiness==='ready'?'ready':'degraded',
      fullProfileEnabled:health.policy?.fullProfileEnabled===true,
      sufficientSamples:health.observation?.sufficientSamples===true,
      authenticatedDeviceFlowVerified:false,productionLoadVerified:false,cryptographicAuditApproved:false};
    return result;
  }catch{return {ok:false,status:'request_failed',privacy:'aggregate-only'};}
}
async function main() {
  if(process.argv.length>2){console.log(JSON.stringify({ok:false,status:'configuration_error'}));process.exitCode=1;return;}
  const result=await checkConversationHealth({url:process.env.CONVERSATION_HEALTH_URL,token:process.env.OPS_HEALTH_TOKEN});
  console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
}
if(require.main===module)main();
module.exports={checkConversationHealth};
