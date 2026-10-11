const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {randomUUID} = require('node:crypto');
const contract = require('../src/growth/contract');

function fixture({storageDenied=false,online=true,request=async()=>({}),performance=false,href='https://winga.test/',initialTime=10000,
  initialAccount='',storedJourney=null}={}) {
  const session = new Map(), local = new Map(), timers = new Map(), events = [];
  if(storedJourney)session.set('winga-growth-journey-v1',JSON.stringify(storedJourney));
  let time = initialTime, number = 0, account = initialAccount;
  let authSession=account?{username:account,sessionId:randomUUID(),token:'synthetic-test-token'}:null;
  const storage = map => ({getItem:k=>{if(storageDenied)throw Error('denied');return map.get(k)||null;},setItem:(k,v)=>{if(storageDenied)throw Error('denied');map.set(k,v);}});
  const listeners = new Map();
  const win = {WingaModules:{growth:{contract}},WINGA_CONFIG:{growthProductSharing:true,growthMeasurement:true},
    crypto:{randomUUID},location:{origin:'https://winga.test',href},navigator:{onLine:online},
    performance:performance?{now:()=>time}:undefined,
    sessionStorage:storage(session),localStorage:storage(local),
    document:{visibilityState:'visible',body:{classList:{contains:()=>true}},addEventListener:()=>{},removeEventListener:()=>{}},
    addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),dispatchEvent:e=>events.push(e),CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    setTimeout:(fn,delay)=>{timers.set(++number,{fn,at:time+delay});return number;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(fs.readFileSync('src/growth/runtime.js','utf8'),{window:win,URL});
  const create=()=>win.WingaModules.growth.createRuntime({window:win,now:()=>time,request,
    getAccount:()=>account,getSession:()=>authSession});
  let runtime = create();
  const advance = async ms => {time+=ms;const ready=[...timers.entries()].filter(([,v])=>v.at<=time);for(const [id,v] of ready){timers.delete(id);await v.fn();}await new Promise(r=>setImmediate(r));};
  return {win,get runtime(){return runtime;},local,session,events,advance,
    setAccount:v=>{account=v;authSession=v?{username:v,sessionId:randomUUID(),token:'synthetic-test-token'}:null;},
    reload:()=>{runtime.close();runtime=create();return runtime;}};
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

test('a prepared share cannot credit a changed account or retain its previous parent',async()=>{
  const sent=[],f=fixture({online:false,initialAccount:'first-person',request:async(k,p)=>sent.push([k,p])});
  f.runtime.capture('https://winga.test/product/p1?share='+randomUUID());
  const share=f.runtime.prepareShare('p1');
  f.setAccount('second-person');
  assert.equal(share.commit(),false);
  assert.equal(f.runtime.getJourney().firstTouch,null);
  f.win.navigator.onLine=true;await f.runtime.flush();await f.advance(0);
  assert.equal(sent.length,0);
  assert.equal(new URL(share.url).pathname,'/product/p1');
  f.runtime.close();
});

test('late native and clipboard completion do not attribute a share to the replacement account',async()=>{
  const source=fs.readFileSync('app.js','utf8'),start=source.indexOf('async function handleShareProduct('),end=source.indexOf('\nfunction getGrowthRuntime()',start);
  assert.ok(start>=0&&end>start);
  for(const channel of ['native','copy']) {
    const sent=[],f=fixture({initialAccount:'first-person',request:async(k,p)=>sent.push([k,p])});
    let finish;const completion=new Promise(resolve=>{finish=resolve;});
    const context={window:f.win,document:f.win.document,
      navigator:channel==='native'?{share:()=>completion}:{clipboard:{writeText:()=>completion}},
      getGrowthRuntime:()=>f.runtime,getProductDetailPath:id=>'/product/'+id,formatProductPrice:()=> '10',
      translateUi:(_key,_args,fallback)=>fallback,showInAppNotification:()=>{},alert:()=>assert.fail('unexpected fallback')};
    vm.runInNewContext(source.slice(start,end)+'\nglobalThis.share=handleShareProduct;',context);
    const pending=context.share({id:'p1',name:'Product',price:10,shop:'Shop'},{channel});
    f.setAccount('second-person');finish();await pending;await f.advance(0);
    assert.equal(sent.length,0,channel);
    f.runtime.close();
  }
});

test('replaced login sessions and logout invalidate an outstanding share even for the same account',async()=>{
  for(const logout of [false,true]) {
    const sent=[],f=fixture({initialAccount:'same-person',request:async(k,p)=>sent.push([k,p])});
    const prepared=f.runtime.prepareShare('p1');
    f.setAccount(logout?'':'same-person');
    assert.equal(prepared.commit(),false);
    await f.advance(0);assert.equal(sent.length,0);
    f.runtime.close();
  }
});

test('journey ownership survives reload without transferring another account context',()=>{
  const f=fixture({online:false,initialAccount:'first-person'}),shareId=randomUUID();
  f.runtime.capture('https://winga.test/product/p1?share='+shareId);
  const firstSession=f.session.get('winga-growth-session');
  f.reload();assert.equal(f.runtime.getJourney().firstTouch.shareId,shareId);
  f.setAccount('second-person');f.reload();
  assert.equal(f.runtime.getJourney().firstTouch,null);
  assert.notEqual(f.session.get('winga-growth-session'),firstSession);
  const stored=JSON.parse(f.session.get('winga-growth-journey-v1'));
  assert.equal(stored.owner,'second-person');assert.equal(stored.touches.length,0);
  assert.deepEqual(Object.keys(stored).sort(),['firstTouch','lastTouch','owner','touches']);
  assert.ok([...f.session.values(),...f.local.values()].every(value=>!value.includes('synthetic-test-token')));
  f.runtime.close();
});

test('guest attribution retains its session through login and reload',()=>{
  const f=fixture({online:false}),shareId=randomUUID();
  f.runtime.capture('https://winga.test/product/p1?share='+shareId);
  const guestSession=f.session.get('winga-growth-session');
  f.setAccount('first-person');f.reload();
  assert.equal(f.runtime.getJourney().firstTouch.shareId,shareId);
  assert.equal(f.session.get('winga-growth-session'),guestSession);
  f.runtime.close();
});

test('session updates persist logout isolation before reload without requiring another Growth action',()=>{
  const f=fixture({online:false,initialAccount:'first-person'});
  f.runtime.capture('https://winga.test/product/p1?share='+randomUUID());
  f.setAccount('');f.runtime.syncIdentity();
  assert.equal(f.runtime.getJourney().firstTouch,null);
  f.setAccount('second-person');f.reload();
  assert.equal(f.runtime.getJourney().firstTouch,null);
  f.runtime.close();
});

test('the app session transition clears Growth context and survives an unavailable analytics hook',()=>{
  const source=fs.readFileSync('app.js','utf8'),start=source.indexOf('function applySessionState('),end=source.indexOf('\nfunction getBootLifecycleTools()',start);
  assert.ok(start>=0&&end>start);
  const f=fixture({online:false,initialAccount:'first-person'});
  const context={window:{},currentUser:'first-person',currentSession:{username:'first-person'},
    hydrateSharedCollectionIntentState:()=>{}};
  context.window.WingaGrowth={syncIdentity:()=>{f.setAccount(context.currentUser);f.runtime.syncIdentity();}};
  vm.runInNewContext(source.slice(start,end),context);
  f.runtime.capture('https://winga.test/product/p1?share='+randomUUID());
  context.applySessionState(null);
  assert.equal(context.currentUser,'');assert.equal(context.currentSession,null);
  assert.equal(JSON.parse(f.session.get('winga-growth-journey-v1')).touches.length,0);
  context.window.WingaGrowth.syncIdentity=()=>{throw Error('analytics unavailable');};
  for(const session of [{username:'second-person',role:'buyer'},{username:''},null]) {
    assert.doesNotThrow(()=>context.applySessionState(session));
    assert.equal(context.currentUser,session?.username||'');
  }
  f.runtime.close();
});

test('an unowned legacy journey is discarded instead of guessing its authenticated owner',()=>{
  const touch={shareId:randomUUID(),productId:'p1',at:10000};
  const f=fixture({online:false,initialAccount:'current-person',storedJourney:{firstTouch:touch,lastTouch:touch,touches:[touch]}});
  assert.equal(f.runtime.getJourney().firstTouch,null);
  f.runtime.close();
});

test('one successful handoff commits once after the outbox has drained',async()=>{
  const sent=[],f=fixture({request:async(k,p)=>sent.push([k,p])}),share=f.runtime.prepareShare('p1');
  assert.equal(share.commit(),true);await f.advance(0);
  assert.equal(f.runtime.getHealth().pending,0);
  assert.equal(share.commit(),false);await f.advance(0);
  assert.equal(sent.length,1);
  f.runtime.close();
});

test('closed runtimes and a disabled creation flag cannot enqueue late handoffs',async()=>{
  for(const close of [true,false]) {
    const sent=[],f=fixture({request:async(k,p)=>sent.push([k,p])}),share=f.runtime.prepareShare('p1');
    if(close)f.runtime.close();else f.win.WINGA_CONFIG.growthProductSharing=false;
    assert.equal(share.commit(),false);
    if(!close){f.win.WINGA_CONFIG.growthProductSharing=true;assert.equal(share.commit(),false);}
    assert.equal(f.runtime.getHealth().pending,0);
    await f.advance(0);assert.equal(sent.length,0);
    assert.equal(f.local.has('winga-growth-outbox-v1'),true);
    assert.equal(JSON.parse(f.local.get('winga-growth-outbox-v1')).length,0);
    f.runtime.close();
  }
});

test('deep-link timing ends at visible content and excludes activation dwell',async()=>{
  const sent=[],f=fixture({request:async(_k,p)=>sent.push(p)});
  f.runtime.capture('https://winga.test/product/p1?share='+randomUUID());
  await f.advance(450);f.runtime.productVisible('p1');await f.advance(2000);
  const viewed=sent.find(p=>p.eventType==='shared_product_viewed');
  assert.equal(viewed.durationMs,450);
  assert.deepEqual(Object.keys(viewed).sort(),['durationMs','eventId','eventType','schemaVersion','sessionId','shareId']);
  f.runtime.close();
});

test('initial document timing includes bootstrap and retry reuses the same latency observation',async()=>{
  const sent=[],f=fixture({performance:true,initialTime:750,href:'https://winga.test/product/p1?share='+randomUUID(),request:async(_k,p)=>{
    sent.push(p);if(p.durationMs!==undefined)throw Object.assign(Error('down'),{status:503});
  }});
  await f.advance(100);f.runtime.productVisible('p1');await f.advance(2000);await f.advance(30000);
  const viewed=sent.filter(p=>p.eventType==='shared_product_viewed');
  assert.equal(viewed.length,2);assert.equal(viewed[0].durationMs,850);
  assert.equal(viewed[1].durationMs,850);assert.equal(viewed[1].eventId,viewed[0].eventId);
  f.runtime.close();
});

test('hidden initial routes and excessive durations do not fabricate latency samples',async()=>{
  for(const hidden of [true,false]) {
    const sent=[],f=fixture({request:async(_k,p)=>sent.push(p)});
    if(hidden)f.win.document.visibilityState='hidden';
    f.runtime.capture('https://winga.test/product/p1?share='+randomUUID());
    await f.advance(hidden?1000:300001);f.win.document.visibilityState='visible';
    f.runtime.productVisible('p1');await f.advance(2000);
    assert.equal(sent.find(p=>p.eventType==='shared_product_viewed').durationMs,undefined);
    f.runtime.close();
  }
});
