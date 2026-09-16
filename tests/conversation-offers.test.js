const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { canAct, normalizeAmount, normalizeAction, statusForAction } = require("../backend/conversation-offers-domain");
const migration = require("../backend/migrations/conversation-offers");
const { createConversationOffersStore } = require("../backend/conversation-offers-store");
const { createConversationOffersApi } = require("../backend/conversation-offers-api");

test("better-price continuation uses authenticated identity, deduplicated structured demand and preserves goal", async () => {
  const events=[],goals=[];
  let response;
  const api=createConversationOffersApi({
    collectBody:async()=>({buyerUsername:"forged"}),readAuthToken:()=>"token",findSession:()=>({}),
    ensureMarketplaceUser:()=>({username:"buyer"}),sendJson:(_res,status,body)=>{response={status,body};},
    getPostgresStore:()=>({
      readOfferPriceContinuation:async(id,user)=>{
        assert.equal(id,"offer-1"); assert.equal(user,"buyer");
        return {id,productId:"p1",sellerUsername:"seller",name:"Black suit",category:"suits",price:50000};
      },
      appendDemandEvent:async event=>events.push(event),
      upsertCommerceGoal:async goal=>goals.push(goal)
    })
  });
  for(let n=0;n<2;n++)await api.handle({method:"POST",headers:{}},{},new URL("https://test/api/conversation-offers/offer-1/better-price"));
  assert.equal(response.status,200);
  assert.equal(response.body.price,50000);
  assert.equal(response.body.trackingRecorded,true);
  assert.equal(events[0].action,"price_mismatch");
  assert.equal(events[0].dedupeKey,events[1].dedupeKey);
  assert.equal(goals[0].userId,"buyer");
  assert.equal(goals[0].productId,"p1");
  assert.equal(goals[0].resolution,undefined);
  assert.equal(response.body.buyerUsername,undefined);
});

test("better-price rejects missing or unauthorized offers without demand writes", async () => {
  let response, writes=0;
  const api=createConversationOffersApi({
    readAuthToken:()=>"",findSession:()=>({}),ensureMarketplaceUser:()=>({username:"intruder"}),
    sendJson:(_res,status,body)=>{response={status,body};},
    getPostgresStore:()=>({readOfferPriceContinuation:async()=>null,appendDemandEvent:async()=>writes++})
  });
  await api.handle({method:"POST",headers:{}},{},new URL("https://test/api/conversation-offers/other/better-price"));
  assert.equal(response.status,404);
  assert.equal(writes,0);
});

test("better-price search remains usable when optional tracking fails", async () => {
  let response;
  const api=createConversationOffersApi({
    readAuthToken:()=>"",findSession:()=>({}),ensureMarketplaceUser:()=>({username:"buyer"}),
    sendJson:(_res,status,body)=>{response={status,body};},
    getPostgresStore:()=>({
      readOfferPriceContinuation:async()=>({id:"offer-1",name:"Suit",productId:"p1",price:50000}),
      appendDemandEvent:async()=>{throw new Error("test tracking outage");}
    })
  });
  await api.handle({method:"POST",headers:{}},{},new URL("https://test/api/conversation-offers/offer-1/better-price"));
  assert.equal(response.status,200);
  assert.equal(response.body.trackingRecorded,false);
  assert.equal(response.body.query,"Suit");
});

function replayStore(record, event) {
  const writes = [];
  const query = async (sql) => {
    if (/^UPDATE|^INSERT/.test(sql.trim())) writes.push(sql);
    if (sql.includes("FROM conversation_offer_events")) return {rowCount:event?1:0,rows:event?[event]:[]};
    if (sql.includes("FROM conversation_offers")) return {rowCount:1,rows:[record]};
    if (sql.includes("FROM products")) return {rowCount:1,rows:[{sellerUsername:"seller",status:"approved",availability:"available",sellerStatus:"active"}]};
    return {rowCount:0,rows:[]};
  };
  return {writes,store:createConversationOffersStore({query,withTransaction:fn=>fn({query}),toISOString:value=>value||""})};
}

test("offer replay rejects another participant's key and a different request", async () => {
  const record={id:"offer-1",buyerUsername:"buyer",sellerUsername:"seller",status:"ACCEPTED",amount:1000};
  const event={offer_id:"offer-1",actor_username:"seller",action:"ACCEPT",amount:1000};
  for(const input of [
    {actorUsername:"intruder",action:"ACCEPT"},
    {actorUsername:"buyer",action:"ACCEPT"},
    {actorUsername:"seller",action:"DECLINE"}
  ]){
    const {store,writes}=replayStore(record,event);
    const result=await store.transitionConversationOffer({offerId:"offer-1",idempotencyKey:"replayed-key",...input});
    assert.equal(result.updated,false);
    assert.equal(result.offer,undefined);
    assert.equal(writes.length,0);
  }
});

test("authorized identical offer retry returns canonical result without writes", async () => {
  const record={id:"offer-1",buyerUsername:"buyer",sellerUsername:"seller",status:"ACCEPTED",amount:1000};
  const {store,writes}=replayStore(record,{offer_id:"offer-1",actor_username:"seller",action:"ACCEPT",amount:1000});
  const result=await store.transitionConversationOffer({offerId:"offer-1",actorUsername:"seller",action:"ACCEPT",idempotencyKey:"same-key"});
  assert.equal(result.updated,true);
  assert.equal(result.duplicate,true);
  assert.equal(result.offer.status,"ACCEPTED");
  assert.equal(writes.length,0);
});

test("terminal offers cannot be expired by a later action", async () => {
  for(const status of ["ACCEPTED","CONVERTED_TO_ORDER","DECLINED","CANCELLED"]){
    const {store,writes}=replayStore({id:"offer-1",buyerUsername:"buyer",sellerUsername:"seller",lastActorUsername:"buyer",
      status,amount:1000,expiresAt:"2000-01-01T00:00:00.000Z"},null);
    const result=await store.transitionConversationOffer({offerId:"offer-1",actorUsername:"seller",action:"ACCEPT",idempotencyKey:"new-key"});
    assert.equal(result.updated,false);
    assert.equal(writes.length,0);
  }
});

test("creation cannot replay another buyer's offer", async () => {
  const {store,writes}=replayStore({id:"private-offer",buyerUsername:"other-buyer",sellerUsername:"seller",productId:"product-1",
    amount:1000,currency:"TZS"},{offer_id:"private-offer",actor_username:"other-buyer",action:"PROPOSE",amount:1000});
  const result=await store.createConversationOffer({productId:"product-1",buyerUsername:"buyer",expectedSellerUsername:"seller",
    amount:1000,currency:"TZS",idempotencyKey:"known-key"});
  assert.equal(result.created,false);
  assert.equal(result.offer,undefined);
  assert.equal(writes.length,0);
});

const offer = { status:"PROPOSED", buyerUsername:"buyer", sellerUsername:"seller", lastActorUsername:"buyer" };

test("conversation offer amounts and actions are bounded", () => {
  assert.equal(normalizeAmount(499),0);
  assert.equal(normalizeAmount(500),500);
  assert.equal(normalizeAmount(1000000001),0);
  assert.equal(normalizeAction("counter"),"COUNTER");
  assert.equal(normalizeAction("convert"),"");
});

test("conversation offer state machine enforces participant turns and terminal states", () => {
  assert.equal(canAct(offer,"seller","COUNTER"),true);
  assert.equal(canAct(offer,"seller","ACCEPT"),true);
  assert.equal(canAct(offer,"buyer","ACCEPT"),false);
  assert.equal(canAct(offer,"intruder","DECLINE"),false);
  assert.equal(canAct({...offer,status:"ACCEPTED"},"seller","COUNTER"),false);
  assert.equal(canAct(offer,"buyer","CANCEL"),true);
  assert.equal(statusForAction("counter"),"COUNTERED");
  assert.equal(statusForAction("accept"),"ACCEPTED");
});

test("conversation offers migration preserves canonical state and append-only transition history", () => {
  assert.equal(migration.id,"2026091602_conversation_offers");
  const sql=migration.statements.join("\n");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS conversation_offers/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS conversation_offer_events/);
  assert.match(sql,/idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(sql,/converted_order_id TEXT REFERENCES orders/);
  assert.match(sql,/buyer_username <> seller_username/);
});

test("conversation offers API and store enforce authentication ownership and idempotency", () => {
  const api=fs.readFileSync(require.resolve("../backend/conversation-offers-api.js"),"utf8");
  const store=fs.readFileSync(require.resolve("../backend/conversation-offers-store.js"),"utf8");
  const server=fs.readFileSync(require.resolve("../backend/server.js"),"utf8");
  assert.match(api,/ensureMarketplaceUser/);
  assert.match(api,/idempotency-key/);
  assert.match(store,/product\.sellerUsername!==input\.expectedSellerUsername/);
  assert.match(store,/FOR UPDATE/);
  assert.match(store,/conversation_offer_events/);
  assert.match(store,/notifications/);
  assert.match(store,/FROM user_blocks WHERE/);
  assert.doesNotMatch(store,/user_blocks WHERE status=/);
  assert.match(store,/status='EXPIRED'/);
  assert.match(server,/createConversationOffersApi/);
  assert.doesNotMatch(store,/INSERT INTO orders/);
});

test("accepted offer conversion stays inside the canonical order transaction", () => {
  const database=fs.readFileSync(require.resolve("../backend/db.js"),"utf8");
  const server=fs.readFileSync(require.resolve("../backend/server.js"),"utf8");
  assert.match(database,/FROM conversation_offers WHERE id = \$1 FOR UPDATE/);
  assert.match(database,/status = 'CONVERTED_TO_ORDER'/);
  assert.match(database,/'CONVERT_TO_ORDER'/);
  assert.match(database,/effectivePrice/);
  assert.match(server,/acceptedOfferId/);
  assert.match(server,/offer_not_convertible/);
});
