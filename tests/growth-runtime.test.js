const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {randomUUID} = require('node:crypto');
const contract = require('../src/growth/contract');

function fixture({storageDenied=false,online=true,request=async()=>({}),resolveInternalShare,loadCapabilities,getIdentity,accountRollout=false,performance=false,href='https://winga.test/',initialTime=10000,localEntries=[]}={}) {
  const session = new Map(), local = new Map(localEntries), timers = new Map(), events = [];
  let time = initialTime, number = 0, account = '';
  const storage = map => ({getItem:k=>{if(storageDenied)throw Error('denied');return map.get(k)||null;},setItem:(k,v)=>{if(storageDenied)throw Error('denied');map.set(k,v);}});
  const listeners = new Map();
  const win = {WingaModules:{growth:{contract}},WINGA_CONFIG:{growthProductSharing:true,growthMeasurement:true,growthAccountRolloutEnabled:accountRollout},
    crypto:{randomUUID},location:{origin:'https://winga.test',href},navigator:{onLine:online},
    performance:performance?{now:()=>time}:undefined,
    sessionStorage:storage(session),localStorage:storage(local),
    document:{visibilityState:'visible',body:{classList:{contains:name=>name==='product-detail-open'}},addEventListener:()=>{},removeEventListener:()=>{}},
    addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),dispatchEvent:e=>events.push(e),CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    setTimeout:(fn,delay)=>{timers.set(++number,{fn,at:time+delay});return number;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(fs.readFileSync('src/growth/runtime.js','utf8'),{window:win,URL});
  const runtime = win.WingaModules.growth.createRuntime({window:win,now:()=>time,request,resolveInternalShare,loadCapabilities,getIdentity,getAccount:()=>account});
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

test('dead-letter replay preserves original lifetime and event identity instead of renewing retention',async()=>{
  const sent=[],f=fixture({request:async(_kind,payload)=>{
    sent.push(payload.shareId);throw Object.assign(Error('invalid'),{status:400});
  }});
  const prepared=f.runtime.prepareShare('p1');prepared.commit();await f.advance(0);
  assert.equal(f.runtime.getHealth().deadLetters,1);
  f.win.navigator.onLine=false;await f.advance(23*60*60*1000);
  assert.equal(f.runtime.retryDeadLetters(),1);
  const pending=JSON.parse(f.local.get('winga-growth-outbox-v1'))[0];
  assert.equal(pending.createdAt,10000);
  assert.equal(pending.payload.shareId,new URL(prepared.url).searchParams.get('share'));
  await f.advance(2*60*60*1000);f.win.navigator.onLine=true;await f.runtime.flush();
  assert.equal(sent.length,1);
  assert.equal(f.runtime.getHealth().pending,0);
  assert.equal(f.runtime.retryDeadLetters(),0);
  assert.ok(f.events.some(e=>e.detail.code==='context_expired'));
  f.runtime.close();
});

test('restored records with missing, nonnumeric or future creation times cannot bypass retention',async()=>{
  for(const createdAt of [undefined,null,'10000',10001]) {
    const sent=[],eventId=randomUUID();
    const item={id:eventId,kind:'events',account:'',attempts:0,nextAt:0,createdAt,
      payload:{eventId,shareId:randomUUID(),sessionId:randomUUID(),eventType:'product_share_opened',schemaVersion:1}};
    const f=fixture({localEntries:[['winga-growth-outbox-v1',JSON.stringify([item])]],request:async(_kind,p)=>sent.push(p)});
    await f.advance(0);
    assert.equal(sent.length,0);
    assert.equal(f.runtime.getHealth().pending,0);
    assert.equal(f.runtime.getHealth().deadLetters,1);
    assert.equal(f.runtime.retryDeadLetters(),0);
    f.runtime.close();
  }
});

test('room touches preserve product first-touch and use the canonical bounded outbox without private content',async()=>{
  const sent=[],f=fixture({online:false,request:async(kind,p)=>sent.push({kind,p})}),productShare=randomUUID(),inviteId=randomUUID();
  f.runtime.capture('https://winga.test/product/p1?share='+productShare);
  f.runtime.roomInviteTouch(inviteId);
  assert.equal(f.runtime.getJourney().firstTouch.shareId,productShare);
  assert.equal(f.runtime.getJourney().lastTouch.destinationId,inviteId);
  const eventId=randomUUID();
  f.runtime.roomEvent('first_vote',{inviteId,tokenHash:'a'.repeat(64),conversationId:'private-room',message:'private body'},{eventId,optionId:'private-choice'});
  f.runtime.roomEvent('first_vote',{inviteId,tokenHash:'a'.repeat(64)},{eventId});
  const room=JSON.parse(f.local.get('winga-growth-outbox-v1')).filter(item=>item.kind==='room-events');
  assert.equal(room.length,1);
  assert.equal(room[0].payload.eventId,eventId);
  assert.equal(room[0].payload.sessionId,f.runtime.getSessionId());
  assert.ok(!JSON.stringify(room).includes('private'));
  f.win.navigator.onLine=true;await f.runtime.flush();
  assert.equal(sent.filter(item=>item.kind==='room-events').length,1);
  f.setAccount('first');f.runtime.roomInviteTouch(inviteId);f.setAccount('second');f.runtime.roomInviteTouch(randomUUID());
  assert.equal(f.runtime.getJourney().touches.length,1);
  f.runtime.close();
});

test('public-content multi-touch shares use the common outbox and clear value context on account change',async()=>{
  const f=fixture({online:false});f.win.WINGA_CONFIG.growthCollectionSharing=true;
  const shareId=randomUUID();f.win.location.href='https://winga.test/collection/public-picks?share='+shareId;
  f.runtime.contentVisible('COLLECTION','public-picks','curator');
  assert.equal(f.runtime.getJourney().firstTouch.destinationType,'COLLECTION');
  const prepared=f.runtime.prepareShare('public-picks','collection','COLLECTION');prepared.commit();
  assert.match(prepared.url,/\/collection\/public-picks\?share=/);
  const queued=JSON.parse(f.local.get('winga-growth-outbox-v1'));
  assert.equal(queued.find(i=>i.kind==='shares').payload.contentType,'COLLECTION');
  assert.equal(queued.find(i=>i.kind==='shares').payload.parentShareId,shareId);
  f.setAccount('first');f.runtime.contentFollowed('curator');
  const count=JSON.parse(f.local.get('winga-growth-outbox-v1')).length;
  f.setAccount('second');f.runtime.contentFollowed('curator');
  assert.equal(JSON.parse(f.local.get('winga-growth-outbox-v1')).length,count);assert.equal(f.runtime.getJourney().firstTouch,null);
});

test('content view requires visible context and prepared shares cannot change actors during handoff',async()=>{
  const f=fixture({online:false});f.win.WINGA_CONFIG.growthCollectionSharing=true;const shareId=randomUUID();
  f.win.location.href='https://winga.test/collection/picks?share='+shareId;
  f.runtime.contentVisible('COLLECTION','picks','curator',()=>false);await f.advance(5000);
  assert.equal(JSON.parse(f.local.get('winga-growth-outbox-v1')).some(i=>i.payload.eventType==='shared_content_viewed'),false);
  const share=f.runtime.prepareShare('picks','collection','COLLECTION');f.setAccount('different');share.commit();
  assert.equal(JSON.parse(f.local.get('winga-growth-outbox-v1')).some(i=>i.kind==='shares'),false);
});

test('restored telemetry strips arbitrary private payloads and future scheduling cannot renew expired records',async()=>{
  const event={eventId:randomUUID(),shareId:randomUUID(),sessionId:randomUUID(),eventType:'product_share_opened',schemaVersion:1,privateBody:'private message',orderId:{body:'private order'}};
  const f=fixture({online:false,initialTime:100000000,localEntries:[['winga-growth-outbox-v1',JSON.stringify([{id:event.eventId,kind:'events',payload:event,account:'',attempts:0,nextAt:1e20,createdAt:1}])]]});
  f.win.navigator.onLine=true;await f.runtime.flush();
  const dead=JSON.parse(f.local.get('winga-growth-dead-v1'));assert.equal(dead[0].reason,'context_expired');
  assert.equal(dead[0].payload.privateBody,undefined);assert.equal(dead[0].payload.orderId,undefined);
});

test('Room order attribution requires recent product context and never crosses accounts',async()=>{
  const sent=[],f=fixture({request:async(kind,payload)=>sent.push({kind,payload})});f.setAccount('recipient');
  const invite={inviteId:randomUUID(),tokenHash:'a'.repeat(64)};
  assert.equal(f.runtime.roomOrderStarted('p1','order-1'),undefined);
  f.runtime.roomEvent('first_product_viewed',invite,{productId:'p1'});
  assert.equal(f.runtime.roomOrderStarted('p2','order-1'),undefined);
  assert.equal(f.runtime.roomOrderStarted('p1','order-1'),true);
  await f.advance(300);await f.runtime.flush();
  const order=sent.find(item=>item.payload.eventType==='first_order_started');assert.equal(order.payload.orderId,'order-1');
  assert.equal(order.payload.productId,undefined);assert.equal(order.payload.conversationId,undefined);
  f.setAccount('other');assert.equal(f.runtime.roomOrderStarted('p1','order-2'),undefined);
  f.runtime.roomEvent('first_product_viewed',invite,{productId:'p1'});await f.advance(1800001);
  assert.equal(f.runtime.roomOrderStarted('p1','order-3'),undefined);f.runtime.close();
});

test('seller referral creation uses a durable canonical ID before handoff and strips private destination context',async()=>{
  const calls=[],canonicalId=randomUUID(),f=fixture({request:async(kind,payload)=>{calls.push({kind,payload});return {shareId:canonicalId};}});
  f.win.WINGA_CONFIG.growthSellerReferral=true;f.setAccount('seller');
  const prepared=await f.runtime.prepareSellerReferral('opp_private_context');
  assert.equal(prepared.url,'https://winga.test/seller-referral/'+canonicalId);assert.equal(prepared.url.includes('opp_private_context'),false);
  assert.equal(calls[0].kind,'shares');assert.equal(calls[0].payload.contentType,'SELLER_REFERRAL');
  f.runtime.referralVisible(canonicalId);await f.advance(300);
  const event=calls.find(call=>call.payload.eventType==='seller_referral_opened');assert.ok(event);assert.equal(event.payload.contentId,undefined);
  assert.equal(f.runtime.getJourney().lastTouch.destinationId,canonicalId);
  f.setAccount('other');assert.equal(f.runtime.getSessionId()===calls[0].payload.sessionId,false);assert.equal(f.runtime.getJourney().touches.length,0);f.runtime.close();
});

test('internal card attribution uses opaque journal context after independent destination access',async()=>{
 const sent=[],shareId=randomUUID(),messageId=randomUUID(),f=fixture({request:async(kind,payload)=>sent.push({kind,payload}),resolveInternalShare:async()=>({shareId,destinationType:'PRODUCT',destinationId:'p1'})});f.setAccount('recipient');
 f.runtime.noteInternalShare('PRODUCT','p1',messageId,'conversation');await f.advance(300);
 const source=sent.find(call=>call.kind==='shares');assert.equal(source.payload.messageId,messageId);assert.equal(source.payload.conversationId,undefined);
 f.runtime.productVisible('p1');await f.runtime.internalContentOpened(messageId,'PRODUCT','p1');await f.advance(2100);await f.runtime.flush();
 assert.ok(sent.some(call=>call.payload.eventType==='shared_product_viewed'&&call.payload.shareId===shareId));
 assert.equal(JSON.stringify(f.runtime.getJourney()).includes(messageId),false);f.runtime.close();
 const outage=fixture({resolveInternalShare:async()=>{throw Error('outage');}});outage.setAccount('recipient');outage.runtime.productVisible('p1');
 await outage.runtime.internalContentOpened(messageId,'PRODUCT','p1');assert.equal(outage.runtime.getJourney().touches.length,0);assert.ok(outage.events.some(e=>e.detail.type==='internal_attribution_unavailable'));outage.runtime.close();
});

 test('timing diagnostics bound samples, reject private keys and honor the measurement kill switch',()=>{
  const f=fixture();for(let i=0;i<120;i++)f.runtime.recordTiming('share_sheet_open_ms',i);
  f.runtime.recordTiming('private-room-secret',1);f.runtime.recordTiming('deep_link_to_content_ms',Infinity);
  assert.deepEqual(JSON.parse(JSON.stringify(f.runtime.getTimingSamples())),{share_sheet_open_ms:Array.from({length:100},(_,i)=>i+20)});
  f.win.WINGA_CONFIG.growthMeasurement=false;f.runtime.recordTiming('auth_return_to_destination_ms',5);
  assert.equal(f.runtime.getTimingSamples().auth_return_to_destination_ms,undefined);f.runtime.close();
 });

test('session-scoped capabilities keep guests unmeasured, resume exact shared context after login and stop on logout',async()=>{
  const sent=[],shareId=randomUUID(),f=fixture({accountRollout:true,href:'https://winga.test/product/p1?share='+shareId,loadCapabilities:async()=>({schemaVersion:1,account:'recipient',productSharing:true,measurement:true}),request:async(k,p)=>sent.push([k,p])});
  f.runtime.productVisible('p1');await f.advance(2500);assert.equal(sent.length,0);assert.equal(f.runtime.getJourney().touches.length,0);
  assert.equal(new URL(f.runtime.prepareShare('p1').url).searchParams.has('share'),false);
  f.win.location.href='https://winga.test/product/p1';f.runtime.capture();
  f.setAccount('recipient');await f.runtime.refreshCapabilities();await f.advance(2100);await f.runtime.flush();
  assert.ok(sent.some(([,p])=>p.shareId===shareId&&p.eventType==='shared_product_viewed'));
  assert.equal(f.runtime.getJourney().firstTouch.shareId,shareId);
  f.setAccount('');await f.runtime.refreshCapabilities();const before=sent.length;f.runtime.prepareShare('p1').commit();await f.advance(61000);assert.equal(sent.length,before);assert.equal(f.win.WINGA_CONFIG.growthMeasurement,false);f.runtime.close();
});
test('capability replies are account bound and outage or withdrawal preserves plain product access',async()=>{
  let resolve,mode='late',requests=0;const f=fixture({accountRollout:true,loadCapabilities:()=>{requests++;if(mode==='late')return new Promise(r=>resolve=r);if(mode==='outage')throw Error('down');return Promise.resolve({schemaVersion:1,account:'other',productSharing:false,measurement:false});}});
  f.setAccount('recipient');const pending=f.runtime.refreshCapabilities();f.setAccount('other');mode='withdrawn';await f.runtime.refreshCapabilities();
  // Resolving the old account cannot activate the new account.
  mode='withdrawn';await f.runtime.refreshCapabilities();resolve({schemaVersion:1,account:'recipient',productSharing:true,measurement:true});await pending;
  assert.equal(f.win.WINGA_CONFIG.growthMeasurement,false);
  mode='outage';await f.runtime.refreshCapabilities();assert.equal(f.win.WINGA_CONFIG.growthProductSharing,false);assert.match(f.runtime.prepareShare('p1').url,/\/product\/p1$/);assert.ok(requests>=3);f.runtime.close();
});

test('same-account session replacement cannot reuse a stale capability grant',async()=>{
 let key='old-session',resolve;const f=fixture({accountRollout:true,getIdentity:()=>key,loadCapabilities:()=>new Promise(r=>resolve=r)});
 f.setAccount('recipient');const pending=f.runtime.refreshCapabilities();key='new-session';resolve({schemaVersion:1,account:'recipient',productSharing:true,measurement:true});await pending;
 assert.equal(f.win.WINGA_CONFIG.growthMeasurement,false);assert.equal(f.win.WINGA_CONFIG.growthProductSharing,false);f.runtime.close();
});

test('a delayed capability response during transient auth Home navigation waits for the matching visible product',async()=>{
 const sent=[],shareId=randomUUID(),f=fixture({accountRollout:true,href:'https://winga.test/product/p1?share='+shareId,loadCapabilities:async()=>({schemaVersion:1,account:'recipient',productSharing:true,measurement:true}),request:async(k,p)=>sent.push([k,p])});
 f.runtime.productVisible('p1');f.win.location.href='https://winga.test/';f.win.document.body.classList.contains=()=>false;f.runtime.capture();
 f.setAccount('recipient');await f.runtime.refreshCapabilities();await f.advance(2100);assert.equal(sent.length,0);
 f.win.document.body.classList.contains=name=>name==='product-detail-open';f.runtime.productVisible('p1');f.win.location.href='https://winga.test/product/p1';await f.advance(2100);await f.runtime.flush();
 assert.ok(sent.some(([,p])=>p.eventType==='shared_product_viewed'&&p.shareId===shareId));f.runtime.close();
});
