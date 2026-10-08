import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { growthFixture as fixture } from './helpers/growth-database.mjs';
const require = createRequire(import.meta.url);
const contract = require('../src/growth/contract');
const { createGrowthApi } = require('../backend/growth-api');


test('canonical product links reject redirects, traversal, malformed encoding and gated private domains', () => {
  for (const path of ['https://evil.test/product/p1','//evil.test/product/p1','/product/%2fsecret','/product/%ZZ','/product/p1/extra','/product/..','/product/p1#private'])
    assert.equal(contract.parseDestination(path,'https://winga.test'),null,path);
  for (const type of ['SHOPPING_ROOM','CONVERSATION','OPPORTUNITY','PROFILE','COLLECTION','REEL','SHORT'])
    assert.equal(contract.destination(type,'private-id'),null);
  assert.deepEqual(contract.parseDestination('/product/p1?share=invalid','https://winga.test'),{type:'PRODUCT',id:'p1',path:'/product/p1'});
  const url = new URL(contract.shareUrl('https://winga.test','p1',randomUUID()));
  assert.deepEqual([...url.searchParams.keys()],['share']);
  assert.equal(contract.shareUrl('javascript:alert(1)','p1'),null);
});

test('auth returns allow only bounded, expiring internal actions and strip untrusted fields', () => {
  const now = Date.now();
  assert.deepEqual(contract.authIntent({type:'open-chat',productId:'p1',createdAt:now,url:'https://evil.test',message:'private'},now),{type:'open-chat',productId:'p1',createdAt:now});
  assert.equal(contract.authIntent({type:'redirect',createdAt:now},now),null);
  assert.equal(contract.authIntent({type:'open-chat',productId:'p1',createdAt:now-1800001},now),null);
  assert.equal(contract.authIntent({type:'open-chat',productId:'p1',createdAt:now+60001},now),null);
  assert.equal(contract.authIntent({type:'open-chat',productId:'../secret',createdAt:now},now),null);
});

test('durable creation and repeated/concurrent retries produce exactly one envelope and entry', async t => {
  const f = await fixture(t);
  const result = await Promise.all([f.store.createGrowthShare(f.payload,f.source),f.store.createGrowthShare(f.payload,f.source)]);
  assert.equal(result.filter(x => !x.duplicate).length,1);
  assert.equal((await f.db.query('SELECT * FROM growth_shares')).rows.length,1);
  assert.equal((await f.db.query('SELECT * FROM growth_events')).rows.length,1);
  await assert.rejects(f.store.createGrowthShare({...f.payload,contentId:'p2'},f.source),{code:'growth_share_conflict'});
  const envelope = await f.store.resolveGrowthShare(f.payload.shareId,f.recipient);
  assert.equal(envelope.destinationId,'p1');
  assert.equal(envelope.sourceUserId,undefined);
  assert.equal(envelope.actor_key,undefined);
  assert.equal(envelope.campaignType,'organic_share');
});

test('share access rechecks privacy, seller safety, blocks, expiry and revocation', async t => {
  const f = await fixture(t);
  for (const contentId of ['private','pending','deleted'])
    await assert.rejects(f.store.createGrowthShare({...f.payload,shareId:randomUUID(),contentId},f.source),{code:'growth_share_unavailable'});
  await f.store.createGrowthShare(f.payload,f.source);
  await f.db.query("INSERT INTO user_blocks VALUES('sender','recipient')");
  await assert.rejects(f.store.resolveGrowthShare(f.payload.shareId,f.recipient),{code:'growth_share_unavailable'});
  await f.db.query('DELETE FROM user_blocks');
  await f.db.query("UPDATE users SET status='suspended' WHERE username='seller'");
  await assert.rejects(f.store.resolveGrowthShare(f.payload.shareId,f.recipient),{code:'growth_share_unavailable'});
  await f.db.query("UPDATE users SET status='active' WHERE username='seller'");
  await f.db.query("INSERT INTO public_content_visibility VALUES('product','p1','followers')");
  await assert.rejects(f.store.resolveGrowthShare(f.payload.shareId,f.recipient),{code:'growth_share_unavailable'});
  await f.db.query("DELETE FROM public_content_visibility WHERE content_id='p1'");
  await assert.rejects(f.store.revokeGrowthShare(f.payload.shareId,f.recipient),{code:'growth_share_unavailable'});
  assert.deepEqual(await f.store.revokeGrowthShare(f.payload.shareId,f.source),{revoked:true});
  assert.deepEqual(await f.store.revokeGrowthShare(f.payload.shareId,f.source),{revoked:true});
  await assert.rejects(f.store.resolveGrowthShare(f.payload.shareId,f.recipient),{code:'growth_share_unavailable'});
  await f.db.query("UPDATE growth_shares SET revoked_at=NULL,created_at=NOW()-INTERVAL '31 days',expires_at=NOW()-INTERVAL '1 day'");
  await assert.rejects(f.store.resolveGrowthShare(f.payload.shareId,f.recipient),{code:'growth_share_unavailable'});
});

test('crawler/self traffic, duplicate IDs and duplicate logical events never inflate conversion counts', async t => {
  const f = await fixture(t);
  await f.store.createGrowthShare(f.payload,f.source);
  const event = f.event('product_share_opened');
  assert.equal((await f.store.recordGrowthEvent(event,{...f.recipient,bot:true})).reason,'crawler');
  assert.equal((await f.store.recordGrowthEvent(event,f.source)).reason,'self_touch');
  assert.equal((await f.store.recordGrowthEvent(event,f.recipient)).duplicate,false);
  assert.equal((await f.store.recordGrowthEvent(event,f.recipient)).duplicate,true);
  assert.equal((await f.store.recordGrowthEvent({...event,eventId:randomUUID()},f.recipient)).duplicate,true);
  await assert.rejects(f.store.recordGrowthEvent({...event,eventType:'shared_product_viewed'},f.recipient),{code:'growth_event_conflict'});
  const health = await f.store.readGrowthHealth();
  assert.equal(health.counts.product_share_created,1);
  assert.equal(health.counts.product_share_opened,1);
  assert.equal(health.confirmedSaves,0);
  assert.equal(health.confirmedOrderStarts,0);
});

test('value events need canonical save/order evidence; reshares link to matching safe content', async t => {
  const f = await fixture(t);
  await f.store.createGrowthShare(f.payload,f.source);
  await assert.rejects(f.store.recordGrowthEvent(f.event('shared_product_saved'),f.recipient),{code:'growth_value_unconfirmed'});
  await f.db.query("INSERT INTO product_likes(product_id,user_id) VALUES('p1','recipient')");
  await f.db.query("UPDATE product_likes SET created_at=NOW()-INTERVAL '1 day'");
  await assert.rejects(f.store.recordGrowthEvent(f.event('shared_product_saved'),f.recipient),{code:'growth_value_unconfirmed'});
  await f.db.query('UPDATE product_likes SET created_at=NOW()');
  await f.store.recordGrowthEvent(f.event('shared_product_saved'),f.recipient);
  const order = {...f.event('shared_product_order_started'),orderId:'order1'};
  await f.db.query("INSERT INTO orders(id,product_id,buyer_username) VALUES('order1','p1','other')");
  await assert.rejects(f.store.recordGrowthEvent(order,f.recipient),{code:'growth_value_unconfirmed'});
  await f.db.query("UPDATE orders SET buyer_username='recipient' WHERE id='order1'");
  await f.db.query("UPDATE orders SET created_at=NOW()-INTERVAL '1 day' WHERE id='order1'");
  await assert.rejects(f.store.recordGrowthEvent(order,f.recipient),{code:'growth_value_unconfirmed'});
  await f.db.query("UPDATE orders SET created_at=NOW() WHERE id='order1'");
  await f.store.recordGrowthEvent(order,f.recipient);
  await f.store.createGrowthShare({...f.payload,shareId:randomUUID(),sessionId:randomUUID(),parentShareId:f.payload.shareId},f.recipient);
  const health = await f.store.readGrowthHealth();
  assert.equal(health.confirmedSaves,1); assert.equal(health.confirmedOrderStarts,1);
  assert.equal(health.counts.shared_product_reshared,1);
  assert.ok(health.evidence.filter(x => x.event_type==='shared_product_saved').every(x => x.verification==='server'));
  await assert.rejects(f.store.createGrowthShare({...f.payload,shareId:randomUUID(),contentId:'p2',parentShareId:f.payload.shareId},f.recipient),{code:'growth_parent_invalid'});
});

test('rate limits are durable and retries do not consume new share quota', async t => {
  const f = await fixture(t);
  for (let i=0;i<30;i++) await f.store.createGrowthShare({...f.payload,shareId:randomUUID()},f.source);
  await assert.rejects(f.store.createGrowthShare(f.payload,f.source),{code:'growth_rate_limited',status:429});
  const last = (await f.db.query('SELECT id FROM growth_shares LIMIT 1')).rows[0];
  assert.equal((await f.store.createGrowthShare({...f.payload,shareId:last.id},f.source)).duplicate,true);
  assert.equal((await f.db.query('SELECT COUNT(*)::int AS n FROM growth_shares')).rows[0].n,30);
  await assert.rejects(f.store.createGrowthShare({...f.payload,shareId:randomUUID(),metadata:{message:'private'}},f.source),{code:'growth_share_invalid'});
  await assert.rejects(f.store.recordGrowthEvent({...f.event('product_share_opened'),eventType:'paid_reach'},f.recipient),{code:'growth_event_invalid'});
});

test('API isolates unavailable analytics, protects reports, preserves reads during kill switches and filters preview agents', async () => {
  let result, calls=0;
  const deps = { collectBody:async()=>({}),sendJson:(_res,status,body,headers)=>{result={status,body,headers};},findSession:()=>null,
    readAuthToken:()=>'',clientIp:()=> '127.0.0.1',ensureUser:()=>true,isAdminSession:()=>false,
    getStore:()=>({recordGrowthEvent:async()=>{calls++;throw new Error('database down');},resolveGrowthShare:async()=>({destinationId:'p1'})}),
    productSharingEnabled:false,measurementEnabled:true };
  const api=createGrowthApi(deps),req={method:'POST',headers:{'user-agent':'Mozilla/5.0'}};
  await api.handle(req,{},new URL('https://winga.test/api/growth/events'));
  assert.equal(result.status,503); assert.equal(calls,1); assert.equal(result.body.code,'growth_unavailable');
  await api.handle({...req,method:'GET'},{},new URL('https://winga.test/api/admin/growth/health'));
  assert.equal(result.status,403);
  await api.handle({...req,method:'GET'},{},new URL('https://winga.test/api/growth/shares/'+randomUUID()));
  assert.equal(result.status,200); assert.equal(result.body.destinationId,'p1');
  await api.handle(req,{},new URL('https://winga.test/api/growth/shares'));
  assert.equal(result.status,404); assert.equal(result.body.code,'growth_sharing_disabled');
  for (const ua of ['WhatsApp/2','facebookexternalhit/1','Googlebot','Discordbot','HeadlessChrome','']) assert.equal(contract.crawler(ua),true,ua);
  assert.equal(contract.crawler('Mozilla/5.0 Chrome/128 Safari/537.36'),false);
});

test('guest to authenticated value preserves the same journey and reports a cohort funnel',async t=>{
  const f=await fixture(t);
  await f.store.createGrowthShare(f.payload,f.source);
  const sessionId=randomUUID();
  const opened={...f.event('product_share_opened'),sessionId};
  await f.store.recordGrowthEvent(opened,{username:'',ip:'127.0.0.2',bot:false});
  await f.store.recordGrowthEvent({...f.event('shared_product_viewed'),sessionId},f.recipient);
  await f.db.query("INSERT INTO product_likes(product_id,user_id) VALUES('p1','recipient')");
  await f.store.recordGrowthEvent({...f.event('shared_product_saved'),sessionId},f.recipient);
  await f.store.createGrowthShare({...f.payload,shareId:randomUUID(),sessionId,parentShareId:f.payload.shareId},f.recipient);
  const health=await f.store.readGrowthHealth();
  assert.equal(health.cohort.recipientJourneys,1);
  assert.equal(health.cohort.activationCount,1);
  assert.equal(health.cohort.valueCount,1);
  assert.equal(health.cohort.continuationCount,1);
  assert.equal(health.cohort.activationRate,1);
  assert.equal(health.cohort.valueRate,1);
  assert.equal(health.cohort.continuationRate,1);
  assert.equal(health.cohort.viralCoefficient,null);
});
