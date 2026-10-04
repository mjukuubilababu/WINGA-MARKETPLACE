const test = require("node:test");
const assert = require("node:assert/strict");
const {classifySearchIntent,evaluateSearchDemand,summarizeShadowDemand,normalizeIntentText} = require("../backend/search-demand-contract");
const {normalizeSearchDemandSignal} = require("../backend/search-demand-service");

test("identity matches cannot become product demand, including vocabulary collisions",()=>{
  assert.equal(classifySearchIntent("White Dress",{shopNames:["White Dress"]}).classification,"SHOP_INTENT");
  assert.equal(classifySearchIntent("Wilhard",{personNames:["Wilhard"]}).classification,"PERSON_INTENT");
  assert.equal(classifySearchIntent("White Dress",{shopNames:["White Dress"],productNames:["White Dress"]}).classification,"UNKNOWN");
  assert.equal(classifySearchIntent("login").classification,"NAVIGATION_INTENT");
  assert.equal(classifySearchIntent("red jacket",{bot:true}).classification,"SPAM");
});

test("emerging product vocabulary does not require inventory or taxonomy membership",()=>{
  for (const query of ["red leather jacket","gauni jeupe","robe blanche"]) {
    assert.equal(classifySearchIntent(query).classification,"PRODUCT_INTENT");
  }
  assert.equal(classifySearchIntent("家具",{categoryNames:["家具"]}).classification,"CATEGORY_INTENT");
  assert.equal(normalizeIntentText(" ＳＨＩＲＴ  家具 "),"shirt 家具");
  assert.equal(classifySearchIntent("unseen ambiguous term").classification,"UNKNOWN");
});

test("search outage, timeout, partial and client claimed zero results never create eligible unmet demand",()=>{
  for (const authoritativeOutcome of [undefined,"SEARCH_UNAVAILABLE","SEARCH_TIMEOUT","PARTIAL_RESULTS"]) {
    const result=evaluateSearchDemand("red leather jacket",{authoritativeOutcome,resultCount:0,zeroResult:true});
    assert.equal(result.eligible,false);
    assert.equal(result.unmet,false);
  }
  assert.equal(evaluateSearchDemand("red jacket",{authoritativeOutcome:"VALID_ZERO_RESULTS",evidenceAvailable:false}).eligible,false);
  assert.equal(evaluateSearchDemand("red jacket",{authoritativeOutcome:"VALID_ZERO_RESULTS",sensitive:true}).eligible,false);
});

test("N=1 shadow candidate exists with low confidence and never implies trending",()=>{
  const demandContract=evaluateSearchDemand("red jacket",{authoritativeOutcome:"VALID_ZERO_RESULTS"});
  const event={eventId:"first-event",query:"red jacket",audienceType:"user",audienceKey:"private-actor",metadata:{demandContract}};
  const result=summarizeShadowDemand(Array(100).fill(event));
  assert.equal(result.demands[0].rawSearchCount,1);
  assert.equal(result.demands[0].uniqueActorCount,1);
  assert.equal(result.demands[0].opportunityCandidate,true);
  assert.equal(result.demands[0].confidence,"LOW");
  assert.equal(result.demands[0].trending,false);
  assert.ok(!JSON.stringify(result).includes("private-actor"));
  const repeated=summarizeShadowDemand([event,{...event,eventId:"later-event"}]);
  assert.equal(repeated.demands[0].uniqueActorCount,1);
  assert.equal(repeated.demands[0].repeatSearchCount,1);
});

test("shadow retry identities remain stable across days without changing legacy dedupe",()=>{
  const payload={eventId:"search-client-event-123",query:"red jacket",resultCount:0};
  const first=normalizeSearchDemandSignal(payload,{audienceReference:"alice",timestamp:"2026-10-04T23:59:59Z"});
  const retry=normalizeSearchDemandSignal(payload,{audienceReference:"alice",timestamp:"2026-10-05T00:00:01Z"});
  const other=normalizeSearchDemandSignal(payload,{audienceReference:"bob"});
  assert.equal(first.metadata.demandContract.retryIdentity,retry.metadata.demandContract.retryIdentity);
  assert.notEqual(first.dedupeKey,retry.dedupeKey);
  assert.notEqual(first.metadata.demandContract.retryIdentity,other.metadata.demandContract.retryIdentity);
  assert.equal(first.metadata.demandContract.eligible,false);
});

test("classification evidence reads primary, uses bound input and excludes mixed identity search_vector",async()=>{
  const {createPostgresStore}=require("../backend/db");
  const calls=[];
  const store=createPostgresStore({databaseUrl:"postgres://test/demand",queryClient:{query:async(text,params)=>{calls.push({text,params});return {rows:[]};}},
    readQueryClient:{query:async()=>{throw Error("must not use replica");}}});
  await store.readSearchDemandClassificationEvidence(["Shop Secret", "x' OR true --", "Shop Secret"]);
  assert.deepEqual(calls[0].params,[["shop secret","x' or true --"]]);
  assert.ok(!calls[0].text.includes("x'"));
  assert.ok(!calls[0].text.includes("search_vector"));
  assert.ok(calls[0].text.includes("LOWER(u.full_name)"));
});

test("one poison event cannot reject healthy entries or shift their actor attribution",()=>{
  const {createSearchDemandService}=require("../backend/search-demand-service");
  const result=createSearchDemandService().normalizeBatchWithReport({events:[
    null, {query:"red jacket",anonymousId:"buyer-a",resultCount:0},
    {query:"phone",version:"unsupported"}, {query:"chair",anonymousId:"buyer-b",resultCount:2}
  ]},{timestamp:"2026-10-04T12:00:00Z"});
  assert.equal(result.invalid,2);
  assert.deepEqual(result.entries.map(entry=>entry.index),[1,3]);
  assert.deepEqual(result.entries.map(entry=>entry.event.query),["red jacket","chair"]);
});

test("client metadata and classification cannot forge eligible demand",()=>{
  const event=normalizeSearchDemandSignal({query:"Wilhard",resultCount:0,zeroResult:true,
    classification:"PRODUCT_INTENT",metadata:{demandContract:{eligible:true}},
    authoritativeOutcome:"VALID_ZERO_RESULTS"},{evidence:{personNames:["Wilhard"]}});
  assert.equal(event.metadata.demandContract.classification,"PERSON_INTENT");
  assert.equal(event.metadata.demandContract.eligible,false);
  assert.equal(event.metadata.demandContract.outcome,"UNVERIFIED");
});

test("PostgreSQL-engine evidence and shadow report preserve collisions and aggregate privacy",async()=>{
  const {PGlite}=require("@electric-sql/pglite");
  const {createPostgresStore}=require("../backend/db");
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE products(name TEXT, shop TEXT, category TEXT, status TEXT);
      CREATE TABLE users(username TEXT,full_name TEXT);
      CREATE TABLE search_demand_events(metadata JSONB, happened_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE intelligence_events(source_event TEXT, metadata JSONB, happened_at TIMESTAMPTZ DEFAULT NOW());
      INSERT INTO products VALUES ('White Dress','White Dress','dress','approved');
      INSERT INTO users VALUES ('wilhard','Wilhard Mmbando');`);
    const store=createPostgresStore({databaseUrl:"postgres://test/demand",queryClient:db});
    const evidence=await store.readSearchDemandClassificationEvidence(["white dress","wilhard"]);
    assert.equal(classifySearchIntent("white dress",evidence[0]).classification,"UNKNOWN");
    assert.equal(classifySearchIntent("wilhard",evidence[1]).classification,"PERSON_INTENT");
    await db.query("INSERT INTO search_demand_events(metadata) VALUES($1::jsonb)",
      [JSON.stringify({demandContract:{classification:"PERSON_INTENT",reason:"known_person",eligible:false},privateQuery:"secret-name"})]);
    await db.exec("INSERT INTO search_demand_events(metadata) VALUES('{}')");
    const report=await store.readSearchDemandShadowReport();
    assert.equal(report.mode,"shadow");
    assert.equal(report.sellerCutover,false);
    assert.equal(report.rows.find(row=>row.classification==="PERSON_INTENT").events,1);
    assert.equal(report.rows.find(row=>row.classification==="LEGACY_UNKNOWN").events,1);
    assert.ok(!JSON.stringify(report).includes("secret-name"));
  } finally {await db.close();}
});
