const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {randomUUID} = require('node:crypto');
const contract = require('../src/growth/contract');

function fixture({storageDenied=false,online=true,request=async()=>({})}={}) {
  const session = new Map(), local = new Map(), timers = new Map(), events = [];
  let time = 10000, number = 0, account = '';
  const storage = map => ({getItem:k=>{if(storageDenied)throw Error('denied');return map.get(k)||null;},setItem:(k,v)=>{if(storageDenied)throw Error('denied');map.set(k,v);}});
  const listeners = new Map();
  const win = {WingaModules:{growth:{contract}},WINGA_CONFIG:{growthProductSharing:true,growthMeasurement:true},
    crypto:{randomUUID},location:{origin:'https://winga.test',href:'https://winga.test/'},navigator:{onLine:online},
    sessionStorage:storage(session),localStorage:storage(local),
    document:{visibilityState:'visible',body:{classList:{contains:()=>true}},addEventListener:()=>{},removeEventListener:()=>{}},
    addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),dispatchEvent:e=>events.push(e),CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    setTimeout:(fn,delay)=>{timers.set(++number,{fn,at:time+delay});return number;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(fs.readFileSync('src/growth/runtime.js','utf8'),{window:win,URL});
  const runtime = win.WingaModules.growth.createRuntime({window:win,now:()=>time,request,getAccount:()=>account});
  const advance = async ms => {time+=ms;const ready=[...timers.entries()].filter(([,v])=>v.at<=time);for(const [id,v] of ready){timers.delete(id);await v.fn();}await new Promise(r=>setImmediate(r));};
  return {win,runtime,local,session,events,advance,setAccount:v=>{account=v;}};
}

test('multi-touch keeps first and latest context; invalid attribution never prevents a destination', async () => {
  const sent=[],f=fixture({request:async(k,p)=>sent.push([k,p])});
  const a=randomUUID(),b=randomUUID();
  f.runtime.capture('https://winga.test/product/p1?share='+a);
  await f.runtime.flush();
  f.runtime.capture('https://winga.test/product/p2?share='+b);
  f.runtime.capture('https://winga.test/product/p1?share='+a);
  await f.advance(300);
  const journey=f.runtime.getJourney();
  assert.equal(journey.firstTouch.shareId,a);assert.equal(journey.lastTouch.shareId,a);assert.equal(journey.touches.length,3);
  f.runtime.capture('https://evil.test/product/p1?share='+b);
  f.runtime.capture('https://winga.test/product/p1?share=malicious');
  assert.equal(f.runtime.getJourney().touches.length,3);
  f.runtime.close();
});

test('storage unavailable still supports sharing and measurement without private content',async()=>{
  const sent=[],f=fixture({storageDenied:true,request:async(k,p)=>sent.push([k,p])});
  const prepared=f.runtime.prepareShare('p1');
  assert.match(prepared.url,/\/product\/p1\?share=/);
  assert.equal(sent.length,0); // preparation/canceling is not share creation
  prepared.commit();await f.runtime.flush();await f.advance(300);
  assert.equal(sent.length,1);assert.equal(sent[0][0],'shares');
  assert.equal(sent[0][1].contentId,'p1');
  assert.equal(sent[0][1].sourceUserId,undefined);
  f.runtime.close();
});

test('visible detail dwell is measured separately from opening; hidden content is not activation',async()=>{
  const sent=[],f=fixture({request:async(k,p)=>sent.push(p)});
  f.runtime.capture('https://winga.test/product/p1?share='+randomUUID());await f.runtime.flush();
  f.runtime.productVisible('p1');await f.advance(1900);
  assert.equal(sent.filter(x=>x.eventType==='shared_product_viewed').length,0);
  f.win.document.visibilityState='hidden';await f.advance(100);
  assert.equal(sent.filter(x=>x.eventType==='shared_product_viewed').length,0);
  f.win.document.visibilityState='visible';f.runtime.productVisible('p1');await f.advance(2000);
  assert.equal(sent.filter(x=>x.eventType==='shared_product_viewed').length,1);
  f.runtime.close();
});

test('analytics outage retries stable event IDs, bounds failures and exposes replayable dead letters',async()=>{
  const sent=[],f=fixture({request:async(k,p)=>{sent.push(p.eventId);throw Object.assign(Error('down'),{status:503});}});
  f.runtime.capture('https://winga.test/product/p1?share='+randomUUID());
  await f.advance(0);
  for(let i=0;i<6;i++)await f.advance(30000);
  assert.equal(new Set(sent).size,1);assert.equal(sent.length,6);
  assert.equal(f.runtime.getHealth().pending,0);assert.equal(f.runtime.getHealth().deadLetters,1);
  assert.ok(f.events.some(e=>e.detail.type==='dead_letter'));
  assert.equal(f.runtime.retryDeadLetters(),1);
  f.runtime.close();
});

test('offline queues and account changes cannot credit another person; kill switches preserve plain sharing',async()=>{
  const sent=[],f=fixture({online:false,request:async(k,p)=>sent.push(p)});
  const share=f.runtime.prepareShare('p1');share.commit();
  assert.equal(f.runtime.getHealth().pending,1);assert.equal(sent.length,0);
  f.setAccount('different-person');f.win.navigator.onLine=true;await f.runtime.flush();
  assert.equal(sent.length,0);assert.equal(f.runtime.getHealth().deadLetters,1);
  f.win.WINGA_CONFIG.growthProductSharing=false;
  const plain=f.runtime.prepareShare('p1');assert.equal(plain.url,'https://winga.test/product/p1');plain.commit();
  assert.equal(sent.length,0);f.runtime.close();
});

test('login preserves attribution, while changing an authenticated account clears the prior journey',()=>{
  const f=fixture({online:false});
  const shareId=randomUUID();f.runtime.capture('https://winga.test/product/p1?share='+shareId);
  f.setAccount('first-person');f.runtime.event('shared_product_saved','p1');
  assert.equal(f.runtime.getJourney().firstTouch.shareId,shareId);
  f.setAccount('second-person');f.runtime.prepareShare('p1');
  assert.equal(f.runtime.getJourney().firstTouch,null);
  f.runtime.close();
});
