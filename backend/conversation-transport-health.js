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
    const number=(value,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max?value:null;
    const count=value=>Number.isSafeInteger(value)&&value>=0?value:null;
    const allowed=['send_accepted','send_unknown','poll_success','poll_failed','ack_success','ack_failed','protocol_error',
      'native_confirmed','native_unknown'];
    const counters=[];
    const rows=Array.isArray(data.counters)?data.counters:[];
    for(const event of allowed) {
      const matches=rows.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)&&row.event===event);
      // An ambiguous or invalid observation must not become a fabricated healthy zero.
      if(matches.length!==1||count(matches[0].count)===null)continue;
      counters.push({event,count:matches[0].count,
        averageDurationMs:matches[0].count>0?number(matches[0].averageDurationMs,300000):null});
    }
    const modes=Array.isArray(data.supportedOperationModes)?data.supportedOperationModes:[];
    return {available:true,scope:unavailable.scope,securityMode:'legacy-plaintext-transport',
      securityModeScope:'legacy-message-command-only',
      supportedOperationModes:['legacy-message','signed-native-operation'].filter(mode=>modes.includes(mode)),
      connections:data.connectionGaugeComplete===true?count(data.connections):null,queuedMessages:count(data.queuedMessages),
      beamMemoryBytes:count(data.beamMemoryBytes),schedulerUtilization:number(data.schedulerUtilization,1),
      counters,
      reconnectRate:null,resumeSuccessRate:null,duplicateSuppression:null};
  }catch{return unavailable;}
}
module.exports={readConversationTransportHealth};
