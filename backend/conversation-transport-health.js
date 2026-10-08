async function readConversationTransportHealth({env=process.env,fetchImpl=fetch}={}) {
  const unavailable={available:false,scope:'phoenix-node-since-start'};
  if(env.WINGA_PHOENIX_TRANSPORT_ENABLED!=='true')return {...unavailable,enabled:false};
  const token=env.CONVERSATION_SERVICE_TOKEN;
  if(typeof token!=='string'||token.length<32||token.length>4096)return unavailable;
  try {
    const url=new URL(env.CONVERSATION_TRANSPORT_OPS_URL || 'https://winga-phoenix.onrender.com/ops/health');
    if(url.origin!=='https://winga-phoenix.onrender.com'||url.pathname!=='/ops/health'||url.search||url.hash||url.username||url.password)return unavailable;
    const response=await fetchImpl(url.href,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(3000)});
    if(!response.ok)return unavailable;
    const reader=response.body.getReader();let size=0;const parts=[];
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768)throw Error('oversize');parts.push(value);}}
    finally {await reader.cancel().catch(()=>{});}
    const data=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(data.ok!==true||data.privacy!=='aggregate-only'||data.scope!==unavailable.scope)return unavailable;
    const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
    const allowed=['send_accepted','send_unknown','poll_success','poll_failed','ack_success','ack_failed','protocol_error'];
    return {available:true,scope:unavailable.scope,securityMode:'legacy-plaintext-transport',
      connections:data.connectionGaugeComplete===true?number(data.connections):null,queuedMessages:number(data.queuedMessages),
      beamMemoryBytes:number(data.beamMemoryBytes),schedulerUtilization:number(data.schedulerUtilization),
      counters:Array.isArray(data.counters)?data.counters.filter(row=>allowed.includes(row.event)).slice(0,allowed.length)
        .map(row=>({event:row.event,count:number(row.count),averageDurationMs:number(row.averageDurationMs)})):[],
      reconnectRate:null,resumeSuccessRate:null,duplicateSuppression:null};
  }catch{return unavailable;}
}
module.exports={readConversationTransportHealth};
