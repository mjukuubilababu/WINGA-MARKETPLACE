const {setTimeout:delay}=require('node:timers/promises');
const targets=Object.freeze([
  {name:'backend',url:'https://winga-pflp.onrender.com/api/health',valid:b=>b.ok===true&&b.readiness==='ready',identity:(b,r)=>r.headers.get('x-winga-commit')},
  {name:'frontend',url:'https://wingamarket.com/build-version.json',valid:b=>/^\d{14}$/.test(String(b.version)),identity:b=>String(b.version)},
  {name:'phoenix',url:'https://winga-phoenix.onrender.com/health',valid:b=>b.ok===true&&b.service==='conversations-transport',identity:()=>null}
]);
function options(args) {
  const o={durationMs:300000,intervalMs:10000,loadRequests:12,timeoutMs:10000,confirmed:false};
  for(const arg of args) {
    if(arg==='--confirm=read-only-production-soak')o.confirmed=true;
    else {
      const m=/^--(duration-seconds|interval-seconds|load-requests)=(\d+)$/.exec(arg);
      if(!m)throw new Error('INVALID_SOAK_OPTIONS');const n=Number(m[2]);
      if(m[1]==='duration-seconds'&&n>=30&&n<=1800)o.durationMs=n*1000;
      else if(m[1]==='interval-seconds'&&n>=10&&n<=60)o.intervalMs=n*1000;
      else if(m[1]==='load-requests'&&n>=0&&n<=60)o.loadRequests=n;
      else throw new Error('INVALID_SOAK_OPTIONS');
    }
  }
  if(!o.confirmed)throw new Error('PRODUCTION_SOAK_CONFIRMATION_REQUIRED');return o;
}
async function boundedJson(response) {
  const reader=response.body?.getReader();if(!reader)throw new Error('INVALID_RESPONSE');
  let bytes=0;const chunks=[];
  try {
    while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
      if(bytes>16384)throw new Error('RESPONSE_TOO_LARGE');chunks.push(part.value);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
function percentile(values,p){const s=[...values].sort((a,b)=>a-b);return s.length?Math.round(s[Math.ceil(s.length*p)-1]):null;}
function requestError(error) {
  const known=['HTTP_NOT_READY','HEALTH_CONTRACT_FAILED','RELEASE_ID_UNAVAILABLE','RELEASE_CHANGED_DURING_SOAK','RESPONSE_TOO_LARGE'];
  if(known.includes(error?.message))return error.message;
  if(error?.name==='TimeoutError'||error?.name==='AbortError')return 'REQUEST_TIMEOUT';
  const code=error?.cause?.code;
  if(['ENOTFOUND','EAI_AGAIN'].includes(code))return 'DNS_FAILED';
  if(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'].includes(code))return 'CONNECTION_FAILED';
  return 'REQUEST_FAILED';
}
async function run(config,{fetchImpl=fetch,now=()=>performance.now(),sleep=delay,progress=()=>{}}={}) {
  const start=now(),samples=[],identities=new Map(),targetFailures=new Map();let failures=0,stopCode=null;
  async function probe(target,phase) {
    const began=now();let httpStatus=0,ok=false,errorCode=null;
    try {
      const r=await fetchImpl(target.url,{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'application/json'},signal:AbortSignal.timeout(config.timeoutMs)});
      httpStatus=r.status;if(httpStatus===429)stopCode='PRODUCTION_RATE_LIMITED';
      if(httpStatus!==200){await r.body?.cancel();throw new Error('HTTP_NOT_READY');}
      const b=await boundedJson(r);if(!target.valid(b))throw new Error('HEALTH_CONTRACT_FAILED');
      const identity=target.identity(b,r);
      if(target.name==='backend'&&!/^[a-f0-9]{40}$/.test(identity||''))throw new Error('RELEASE_ID_UNAVAILABLE');
      if(identity){if(identities.has(target.name)&&identities.get(target.name)!==identity){stopCode='RELEASE_CHANGED_DURING_SOAK';throw new Error(stopCode);}identities.set(target.name,identity);}
      ok=true;
    } catch(e){errorCode=requestError(e);}
    const s={target:target.name,phase,httpStatus,ok,errorCode,latencyMs:Math.round(now()-began)};
    samples.push(s);failures=ok?0:failures+1;targetFailures.set(target.name,ok?0:(targetFailures.get(target.name)||0)+1);
    if(failures>=3||targetFailures.get(target.name)>=3)stopCode||='CONSECUTIVE_FAILURE_LIMIT';progress(s);
  }
  // Slow requests move the next slot forward, never creating catch-up bursts.
  for(let slot=start;slot<start+config.durationMs&&!stopCode;slot=Math.max(slot+config.intervalMs,now()+config.intervalMs)) {
    await sleep(Math.max(0,slot-now()));for(const target of targets){if(stopCode)break;await probe(target,'soak');}
  }
  if(!stopCode)await sleep(Math.max(0,start+config.durationMs-now()));
  if(!stopCode&&samples.some(s=>!s.ok))stopCode='SOAK_BASELINE_FAILED';
  // Public liveness only: at most two in flight, at most one start each second.
  const inFlight=new Set();
  for(let i=0;i<config.loadRequests&&!stopCode;i++) {
    if(inFlight.size>=2)await Promise.race(inFlight);if(stopCode)break;
    const task=probe(targets[i%targets.length],'bounded-load');inFlight.add(task);
    void task.finally(()=>inFlight.delete(task));await sleep(1000);
  }
  await Promise.all(inFlight);
  return {ok:!stopCode&&samples.length>0&&samples.every(s=>s.ok),mode:'production-public-read-only-soak',privacy:'aggregate-only',
    durationMs:Math.round(now()-start),requests:samples.length,soakRequests:samples.filter(s=>s.phase==='soak').length,
    loadRequests:samples.filter(s=>s.phase==='bounded-load').length,failures:samples.filter(s=>!s.ok).length,stopCode,
    maxConcurrency:2,loadStartSpacingMs:1000,applicationWrites:false,authenticatedMessagingVerified:false,
    encryptedRoomFlowVerified:false,productionCapacityProven:false,cryptographicAuditApproved:false,
    backendCommit:identities.get('backend')||null,frontendBuild:identities.get('frontend')||null,
    targets:targets.map(t=>{const rows=samples.filter(s=>s.target===t.name);return {name:t.name,requests:rows.length,failures:rows.filter(s=>!s.ok).length,
      p50Ms:percentile(rows.map(s=>s.latencyMs),0.5),p95Ms:percentile(rows.map(s=>s.latencyMs),0.95),
      httpStatuses:[...new Set(rows.map(s=>s.httpStatus))],errorCodes:[...new Set(rows.map(s=>s.errorCode).filter(Boolean))]};})};
}
if(require.main===module)(async()=>{
  const config=options(process.argv.slice(2));let count=0;
  const result=await run(config,{progress:s=>{if(++count%15===0||!s.ok)console.error(JSON.stringify({requests:count,target:s.target,ok:s.ok,httpStatus:s.httpStatus,errorCode:s.errorCode}));}});
  console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
})().catch(e=>{console.error(JSON.stringify({ok:false,errorCode:['INVALID_SOAK_OPTIONS','PRODUCTION_SOAK_CONFIRMATION_REQUIRED'].includes(e.message)?e.message:'SOAK_FAILED'}));process.exitCode=1;});
module.exports={options,run,boundedJson,requestError};
