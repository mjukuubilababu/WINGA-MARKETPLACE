const test = require("node:test");
const assert = require("node:assert/strict");
const {buildSearchObservation, createSearchOutcomeObserver, validateSearchObservation} = require("../backend/search-outcome-observer");
const input = {query:"red leather jacket", total:0, page:1, freshPrimary:true,
  audience:{audienceType:"user", audienceKey:"a".repeat(64)}};

test("server counts are observable without claiming adequate matches or verified supply gaps",()=>{
  for (const total of [0,1,20]) {
    const event = buildSearchObservation({...input,total});
    assert.equal(event.metadata.searchObservation.resultCount,total);
    assert.equal(event.metadata.searchObservation.outcome,total === 0 ? "ZERO_RESULTS_UNVERIFIED" : "MATCH_QUALITY_UNVERIFIED");
    assert.equal(event.metadata.demandContract.eligible,false);
    assert.equal(event.metadata.demandContract.unmet,false);
  }
  const verified = buildSearchObservation({...input,searchQualityVerified:true});
  assert.equal(verified.metadata.searchObservation.outcome,"VALID_ZERO_RESULTS");
  assert.equal(verified.metadata.demandContract.eligible,false,"policy not accepted");
  const cached = buildSearchObservation({...input,searchQualityVerified:true,freshPrimary:false});
  assert.equal(cached.metadata.searchObservation.outcome,"ZERO_RESULTS_UNVERIFIED");
});

test("pagination, seller scopes, category filters and malformed outcomes cannot create observations",()=>{
  for (const patch of [{page:2},{cursor:"next"},{seller:"bob"},{category:"shirts"},{staff:true},
    {total:NaN},{total:-1},{total:0.2},{query:""}]) {
    assert.equal(buildSearchObservation({...input,...patch}),null);
  }
});

test("disabled capture does no work; enabled capture is deferred and bounded without blocking search",async()=>{
  const scheduled=[], captured=[];
  const disabled=createSearchOutcomeObserver({schedule:()=>assert.fail("disabled")});
  assert.equal(disabled.observe(input),false);
  const observer=createSearchOutcomeObserver({enabled:true,maxPending:1,schedule:fn=>scheduled.push(fn),
    readEvidence:async()=>[{shopMatch:true}],enqueue:async event=>captured.push(event)});
  assert.equal(observer.observe(input),true);
  assert.equal(observer.observe(input),false);
  assert.equal(captured.length,0,"HTTP response can finish before processing begins");
  await scheduled.shift()();
  assert.equal(captured[0].metadata.demandContract.classification,"SHOP_INTENT");
  assert.deepEqual(observer.snapshot(),{enabled:true,pending:0,captured:1,failed:0,shed:1,skipped:0,
    durability:"queue_commit",sellerCutover:false});
  assert.ok(!JSON.stringify(observer.snapshot()).includes("red leather"));
  assert.ok(!JSON.stringify(observer.snapshot()).includes("a".repeat(64)));
});

test("pre-enqueue retries reuse one event ID and stop with bounded backoff and a counted failure",async()=>{
  const jobs=[], ids=[], delays=[];
  const observer=createSearchOutcomeObserver({enabled:true,schedule:fn=>jobs.push(fn),random:()=>0.5,
    readEvidence:async()=>{throw Error("private database error");},
    enqueue:async event=>{ids.push(event.eventId);throw Error("secret credentials");},delay:async ms=>delays.push(ms)});
  observer.observe(input);
  await jobs[0]();
  assert.equal(new Set(ids).size,1);
  assert.equal(ids.length,3);
  assert.deepEqual(delays,[375,625]);
  assert.equal(observer.snapshot().failed,1);
  assert.equal(observer.snapshot().pending,0);
  assert.ok(!JSON.stringify(observer.snapshot()).includes("secret"));
});

test("terminal failures never retry; unverified evidence still stays ineligible",async()=>{
  const jobs=[];
  let attempts=0;
  const observer=createSearchOutcomeObserver({enabled:true,schedule:fn=>jobs.push(fn),
    readEvidence:async()=>{throw Error("unavailable");},enqueue:async event=>{
      assert.equal(event.metadata.demandContract.eligible,false);
      attempts++;throw Object.assign(Error("invalid"),{retryable:false});
    },delay:()=>assert.fail("no terminal backoff")});
  observer.observe(input);await jobs[0]();
  assert.equal(attempts,1);
});

test("client telemetry cannot impersonate the reserved server event",async()=>{
  const {createIntelligencePlatform}=require("../backend/intelligence-platform");
  const platform=createIntelligencePlatform({logger:{warn(){}}});
  for (const event of ["server_search_outcome_observed", "server_search_outcome_observed\u0000", "'server_search_outcome_observed'"]) {
    await assert.rejects(platform.ingestClientEvent({event,context:{resultCount:0}}),error=>error.code === "reserved_server_event");
  }
  assert.equal(platform.getSummary().counts.recentEvents,0);
});

test("PostgreSQL durable queue replays have one ledger effect and no scoring writes",async()=>{
  const {PGlite}=require("@electric-sql/pglite");
  const {createPostgresStore}=require("../backend/db");
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE intelligence_event_queue(queue_id BIGSERIAL PRIMARY KEY,event_id TEXT UNIQUE,
      event_payload JSONB,score_payload JSONB,status TEXT,attempts INT DEFAULT 0,available_at TIMESTAMPTZ,
      locked_at TIMESTAMPTZ,locked_by TEXT,processed_at TIMESTAMPTZ,last_error TEXT,updated_at TIMESTAMPTZ);
      CREATE TABLE intelligence_events(event_id TEXT PRIMARY KEY,event_type TEXT,source_event TEXT,happened_at TIMESTAMPTZ,metadata JSONB);`);
    await db.exec("CREATE TABLE products(name TEXT, shop TEXT, category TEXT, status TEXT); CREATE TABLE users(username TEXT,full_name TEXT);");
    const store=createPostgresStore({databaseUrl:"postgres://test/search",queryClient:db});
    const event=buildSearchObservation(input);
    assert.equal((await store.enqueueIntelligenceEvent(event)).enqueued,true);
    assert.equal((await store.enqueueIntelligenceEvent(event)).enqueued,false);
    const [job]=await store.claimIntelligenceQueueBatch({workerId:"worker-a"});
    assert.equal((await store.appendIntelligenceEvent(job.event)).applied,true);
    // Simulate crash after ledger COMMIT but before queue acknowledgement.
    for (let retry=0;retry<100;retry++) assert.equal((await store.appendIntelligenceEvent(job.event)).applied,false);
    await store.completeIntelligenceQueueItem(job.queueId);
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM intelligence_events")).rows[0].n,1);
    assert.equal((await db.query("SELECT status FROM intelligence_event_queue")).rows[0].status,"completed");
    // No score tables exist: the shadow path must not require or write them.
    assert.deepEqual(await store.claimIntelligenceQueueBatch(),[]);
  } finally {await db.close();}
});

test("poison observations fail validation and enter durable terminal state immediately",async()=>{
  const {createPostgresStore}=require("../backend/db");
  const calls=[];
  const store=createPostgresStore({databaseUrl:"postgres://test/search",queryClient:{query:async(text,params)=>{
    calls.push({text,params});return {rows:[]};}}});
  const bad=buildSearchObservation(input);bad.schemaVersion="future-version";
  assert.throws(()=>validateSearchObservation(bad),error=>error.retryable === false);
  await assert.rejects(store.enqueueIntelligenceEvent(bad));
  assert.equal(calls.length,0);
  await store.failIntelligenceQueueItem(7,Object.assign(Error("invalid_search_observation"),{retryable:false}),{attempts:1,maxAttempts:12});
  assert.equal(calls[0].params[1],"dead");
});
