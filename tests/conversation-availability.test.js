const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  canTransitionAvailability,
  normalizeAvailabilityAction,
  normalizeQuantity,
  statusForAvailabilityAction
} = require("../backend/conversation-availability-domain");
const migration = require("../backend/migrations/conversation-availability");
const { createConversationAvailabilityStore } = require("../backend/conversation-availability-store");

test("availability retries enforce actor, request, action and alternative identity", async () => {
  const record={id:"request-1",buyerUsername:"buyer",sellerUsername:"seller",status:"ALTERNATIVE_SUGGESTED",
    responseProductId:"alternative-1",requestedQuantity:1};
  for(const [actorUsername,requestId,action,responseProductId,expected] of [
    ["intruder","request-1","SUGGEST_ALTERNATIVE","alternative-1",false],
    ["buyer","request-1","SUGGEST_ALTERNATIVE","alternative-1",false],
    ["seller","request-2","SUGGEST_ALTERNATIVE","alternative-1",false],
    ["seller","request-1","OUT_OF_STOCK","",false],
    ["seller","request-1","SUGGEST_ALTERNATIVE","alternative-2",false],
    ["seller","request-1","SUGGEST_ALTERNATIVE","alternative-1",true]
  ]){
    const writes=[];
    const query=async sql=>{
      if(/^UPDATE|^INSERT/.test(sql.trim()))writes.push(sql);
      if(sql.includes("FROM conversation_availability_events"))return {rowCount:1,rows:[{
        request_id:"request-1",actor_username:"seller",action:"SUGGEST_ALTERNATIVE"
      }]};
      if(sql.includes("FROM conversation_availability_requests"))return {rowCount:1,rows:[{...record,id:requestId}]};
      return {rowCount:0,rows:[]};
    };
    const store=createConversationAvailabilityStore({query,withTransaction:fn=>fn({query}),toISOString:value=>value||""});
    const result=await store.transitionConversationAvailabilityRequest({actorUsername,requestId,action,responseProductId,idempotencyKey:"known-key"});
    assert.equal(result.updated,expected);
    assert.equal(Boolean(result.request),expected);
    assert.equal(writes.length,0);
  }
});

const request = {
  status: "REQUESTED",
  buyerUsername: "buyer",
  sellerUsername: "seller"
};

test("conversation availability validates actions and quantities", () => {
  assert.equal(normalizeQuantity(0), 0);
  assert.equal(normalizeQuantity(1), 1);
  assert.equal(normalizeQuantity(99), 99);
  assert.equal(normalizeQuantity(100), 0);
  assert.equal(normalizeAvailabilityAction("out_of_stock"), "OUT_OF_STOCK");
  assert.equal(normalizeAvailabilityAction("invent"), "");
});

test("only the seller answers availability and only the buyer cancels", () => {
  assert.equal(canTransitionAvailability(request, "seller", "AVAILABLE"), true);
  assert.equal(canTransitionAvailability(request, "seller", "OUT_OF_STOCK"), true);
  assert.equal(canTransitionAvailability(request, "buyer", "AVAILABLE"), false);
  assert.equal(canTransitionAvailability(request, "buyer", "CANCEL"), true);
  assert.equal(canTransitionAvailability(request, "intruder", "CANCEL"), false);
  assert.equal(canTransitionAvailability({ ...request, status: "AVAILABLE" }, "seller", "OUT_OF_STOCK"), false);
  assert.equal(statusForAvailabilityAction("suggest_alternative"), "ALTERNATIVE_SUGGESTED");
});

test("availability migration preserves canonical state and append-only events", () => {
  assert.equal(migration.id, "2026091603_conversation_availability");
  const sql = migration.statements.join("\n");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS conversation_availability_requests/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS conversation_availability_events/);
  assert.match(sql, /idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(sql, /requested_quantity INTEGER/);
  assert.match(sql, /response_product_id TEXT REFERENCES products/);
});

test("availability is authorized, idempotent, and hands out-of-stock demand to canonical intelligence", () => {
  const api = fs.readFileSync(require.resolve("../backend/conversation-availability-api.js"), "utf8");
  const store = fs.readFileSync(require.resolve("../backend/conversation-availability-store.js"), "utf8");
  const offersApi = fs.readFileSync(require.resolve("../backend/conversation-offers-api.js"), "utf8");
  const server = fs.readFileSync(require.resolve("../backend/server.js"), "utf8");
  assert.match(api, /ensureMarketplaceUser/);
  assert.match(api, /idempotency-key/);
  assert.match(api, /appendDemandEvent/);
  assert.match(api, /upsertCommerceGoal/);
  assert.match(store, /uploaded_by=\$2/);
  assert.match(store, /FOR UPDATE/);
  assert.match(store, /FROM user_blocks WHERE/);
  assert.doesNotMatch(store, /user_blocks WHERE status=/);
  assert.match(store, /notify_when_available/);
  assert.match(offersApi, /return false/);
  assert.match(server, /createConversationAvailabilityApi/);
  assert.doesNotMatch(store, /UPDATE products SET/);
});
