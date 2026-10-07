const {test}=require('node:test');
const assert=require('node:assert/strict');
const {options,run,boundedJson}=require('../scripts/production-conversation-soak');
const config=()=>options(['--confirm=read-only-production-soak','--duration-seconds=30','--load-requests=3']);
function harness(replace) {
  let time=0;const requests=[];
  return {requests,deps:{now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async(url,init)=>{
    requests.push({url,init});if(replace)return replace(url,requests.length);
    return new Response(JSON.stringify(url.includes('build-version')?{version:'20261007224751'}:
      url.includes('phoenix')?{ok:true,service:'conversations-transport'}:{ok:true,readiness:'ready'}),{headers:{'x-winga-commit':'a'.repeat(40)}});
  }}};
}
test('confirmation and hard bounds precede production access',()=>{
  assert.throws(()=>options([]),/CONFIRMATION_REQUIRED/);
  for(const arg of ['--duration-seconds=1801','--interval-seconds=1','--load-requests=61','--url=https://example.com'])assert.throws(()=>options(['--confirm=read-only-production-soak',arg]),/INVALID_SOAK_OPTIONS/);
});
test('successful read-only soak reports aggregates without encrypted-capacity claims',async()=>{
  const h=harness(),r=await run(config(),h.deps);assert.equal(r.ok,true);assert.equal(r.requests,12);
  assert.equal(r.authenticatedMessagingVerified,false);assert.equal(r.productionCapacityProven,false);assert.equal(r.applicationWrites,false);
  assert.ok(r.durationMs>=30000);
  for(const {url,init} of h.requests){assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.headers.Authorization,undefined);assert.ok(url.startsWith('https://winga'));}
});
test('429 stops without retries or load',async()=>{
  const h=harness(()=>new Response('{}',{status:429})),r=await run(config(),h.deps);assert.equal(r.ok,false);assert.equal(r.requests,1);assert.equal(r.stopCode,'PRODUCTION_RATE_LIMITED');
});
test('three consecutive failures open circuit',async()=>{
  const h=harness(()=>new Response('{}',{status:503})),r=await run(config(),h.deps);assert.equal(r.requests,3);assert.equal(r.stopCode,'CONSECUTIVE_FAILURE_LIMIT');
});
test('a failing backend stops even when frontend and Phoenix remain healthy',async()=>{
  const h=harness(url=>new Response(JSON.stringify(url.includes('build-version')?{version:'20261007224751'}:{ok:true,service:'conversations-transport'}),
    {status:url.includes('pflp')?503:200})),r=await run(config(),h.deps);
  assert.equal(r.stopCode,'CONSECUTIVE_FAILURE_LIMIT');assert.equal(r.requests,7);assert.equal(r.loadRequests,0);
});
test('release change invalidates soak',async()=>{
  const h=harness((url,n)=>new Response(JSON.stringify(url.includes('build-version')?{version:'20261007224751'}:url.includes('phoenix')?{ok:true,service:'conversations-transport'}:{ok:true,readiness:'ready'}),
    {headers:{'x-winga-commit':(n>3?'b':'a').repeat(40)}})),r=await run(config(),h.deps);
  assert.equal(r.ok,false);assert.equal(r.stopCode,'RELEASE_CHANGED_DURING_SOAK');assert.equal(r.requests,4);
});
test('untrusted response fields never reach output',async()=>{
  const h=harness(()=>new Response(JSON.stringify({ok:false,readiness:'ready',token:'never-output'}))),r=await run(config(),h.deps);
  assert.equal(r.ok,false);assert.equal(JSON.stringify(r).includes('never-output'),false);
});
test('response bytes are bounded',async()=>{await assert.rejects(boundedJson(new Response('x'.repeat(16385))),/RESPONSE_TOO_LARGE/);});
test('slow public probes never exceed two simultaneous requests',async()=>{
  const {setTimeout:delay}=require('node:timers/promises');let time=0,active=0,peak=0;
  const r=await run({...config(),loadRequests:6},{now:()=>time,sleep:async ms=>{time+=ms;await delay(1);},
    fetchImpl:async url=>{active++;peak=Math.max(peak,active);await delay(10);active--;
      return new Response(JSON.stringify(url.includes('build-version')?{version:'20261007224751'}:
        url.includes('phoenix')?{ok:true,service:'conversations-transport'}:{ok:true,readiness:'ready'}),{headers:{'x-winga-commit':'a'.repeat(40)}});}});
  assert.equal(r.ok,true);assert.equal(r.loadRequests,6);assert.equal(active,0);assert.equal(peak,2);
});
