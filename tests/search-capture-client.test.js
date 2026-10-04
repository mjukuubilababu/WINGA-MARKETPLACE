const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"), vm=require("node:vm"), path=require("node:path");
const NOW=Date.now();
const capture={receipt:"server-signed-receipt",eventId:"search_observation_"+"a".repeat(32),expiresAt:NOW+86400000};
function fixture(shared=new Map(), send=async()=>({durablyRecorded:true,eventId:capture.eventId})) {
  let owner="alice", writable=true;
  const scheduled=[], requests=[];
  const storage={get length(){return shared.size;},key:i=>Array.from(shared.keys())[i],getItem:key=>shared.get(key)||null,
    setItem:(key,value)=>{if (!writable) throw Error("quota");shared.set(key,value);},removeItem:key=>shared.delete(key)};
  const context=vm.createContext({window:{},console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,"../src/api/intelligence-client.js"),"utf8"),context);
  const client=context.window.WingaModules.api.intelligence.createIntelligenceApiClient({baseUrl:"/api",now:()=>NOW,
    getCaptureStorage:()=>storage,getCaptureOwner:()=>owner,schedule:fn=>{scheduled.push(fn);return scheduled.length;},
    cancelSchedule:()=>{},fetchJson:async(url,options)=>{requests.push({url,options});return send(url,options);}});
  return {client,shared,scheduled,requests,setOwner:value=>{owner=value;},denyWrites:()=>{writable=false;}};
}

test("receipt is stored before asynchronous submission and removed only after matching durable acknowledgement",async()=>{
  const f=fixture();
  assert.equal(f.client.captureSearchReceipt(capture),true);
  assert.equal(f.shared.size,1);assert.equal(f.requests.length,0);
  await f.client.flushSearchCaptures();
  assert.equal(f.requests[0].url,"/api/search-demand/capture");
  assert.equal(f.shared.size,0);
  const g=fixture(new Map(),async()=>({ok:true,durablyRecorded:false}));
  g.client.captureSearchReceipt(capture);await g.client.flushSearchCaptures();
  assert.equal(g.shared.size,1);
});

test("reload retains failed receipts, retries same identity, and isolates accounts",async()=>{
  const shared=new Map(), first=fixture(shared,async()=>{throw Object.assign(Error("offline"),{status:503});});
  first.client.captureSearchReceipt(capture);await first.client.flushSearchCaptures();
  assert.equal(shared.size,1);
  const reloaded=fixture(shared);
  assert.equal(reloaded.scheduled.length,1,"resume on boot");
  reloaded.setOwner("bob");await reloaded.client.flushSearchCaptures();
  assert.equal(reloaded.requests.length,0);
  reloaded.setOwner("alice");await reloaded.client.flushSearchCaptures();
  assert.equal(reloaded.requests[0].options.body,first.requests[0].options.body);
  assert.equal(shared.size,0);
});

test("two tabs retain independent receipts and duplicate sends cannot resurrect an acknowledged record",async()=>{
  const shared=new Map();let release;
  const first=fixture(shared,()=>new Promise(resolve=>{release=resolve;})), second=fixture(shared);
  first.client.captureSearchReceipt(capture);
  const secondCapture={...capture,eventId:"search_observation_"+"b".repeat(32)};
  second.client.captureSearchReceipt(secondCapture);
  assert.equal(shared.size,2);
  const slow=first.client.flushSearchCaptures();
  await new Promise(resolve=>setImmediate(resolve));
  await second.client.flushSearchCaptures();
  assert.equal(shared.size,1);
  release({durablyRecorded:true,eventId:capture.eventId});await slow;
  assert.equal(shared.size,1);
  assert.ok([...shared.keys()][0].endsWith(secondCapture.eventId));
});

test("storage failure, terminal signature failure, expiry and exhausted budgets have bounded behavior",async()=>{
  const f=fixture();f.denyWrites();
  assert.equal(f.client.captureSearchReceipt(capture),false);assert.equal(f.requests.length,0);
  const g=fixture(new Map(),async()=>{throw Object.assign(Error("invalid signature"),{status:400});});
  g.client.captureSearchReceipt(capture);await g.client.flushSearchCaptures();assert.equal(g.shared.size,0);
  const h=fixture(new Map(),async()=>{throw Object.assign(Error("unavailable"),{status:503});});
  h.client.captureSearchReceipt(capture);
  for (let i=0;i<20;i++) await h.client.flushSearchCaptures();
  assert.equal(h.requests.length,12);assert.equal(h.shared.size,1);
  assert.equal(f.client.captureSearchReceipt({...capture,expiresAt:NOW}),false);
  const expired=new Map([["winga_search_capture_v1:"+capture.eventId,JSON.stringify({...capture,owner:"alice",expiresAt:NOW-1})]]);
  fixture(expired);assert.equal(expired.size,0);
});

test("backlog limit preserves pending work and quota loss stops automatic retry",async()=>{
  const f=fixture();
  for (let i=0;i<50;i++) assert.equal(f.client.captureSearchReceipt({...capture,eventId:"search_observation_"+i.toString(16).padStart(32,"0")}),true);
  assert.equal(f.client.captureSearchReceipt(capture),false);assert.equal(f.shared.size,50);
  const g=fixture();g.client.captureSearchReceipt(capture);g.denyWrites();
  const scheduled=g.scheduled.length;
  await g.client.flushSearchCaptures();
  assert.equal(g.requests.length,0);assert.equal(g.scheduled.length,scheduled);
});
