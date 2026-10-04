const test=require("node:test");
const assert=require("node:assert/strict");
const {buildSearchObservation}=require("../backend/search-outcome-observer");
const {issueSearchCaptureReceipt,verifySearchCaptureReceipt,acceptSearchCaptureReceipt,TTL_MS}=require("../backend/search-capture-receipt");
const secret="test-signing-secret-search-capture-only";
const input={query:"red jacket",total:0,page:1,freshPrimary:true,searchId:"stable-search-intent-123",
  audience:{audienceType:"user",audienceKey:"a".repeat(64)}};

test("search retry identity is stable across requests and separated by actor and intent",()=>{
  const first=buildSearchObservation(input), retry=buildSearchObservation(input);
  assert.equal(first.eventId,retry.eventId);
  assert.notEqual(first.eventId,buildSearchObservation({...input,query:"white dress"}).eventId);
  assert.notEqual(first.eventId,buildSearchObservation({...input,audience:{audienceType:"user",audienceKey:"b".repeat(64)}}).eventId);
  assert.notEqual(first.eventId,buildSearchObservation({...input,searchId:"later-search-intent-123"}).eventId);
});

test("only an unexpired authentic bounded server receipt verifies",()=>{
  const event=buildSearchObservation(input), now=Date.now();
  const capture=issueSearchCaptureReceipt(event,secret,now);
  assert.deepEqual(verifySearchCaptureReceipt(capture.receipt,secret,now+1000),event);
  const [body,sig]=capture.receipt.split(".");
  const tampered=JSON.parse(Buffer.from(body,"base64url"));
  tampered.event.metadata.searchObservation.resultCount=47;
  for (const receipt of ["", "x".repeat(9000), `${body}.bad`,
    `${Buffer.from(JSON.stringify(tampered)).toString("base64url")}.${sig}`]) {
    assert.throws(()=>verifySearchCaptureReceipt(receipt,secret,now),error=>error.code === "invalid_search_capture_receipt");
  }
  assert.throws(()=>verifySearchCaptureReceipt(capture.receipt,"different-key",now));
  assert.throws(()=>verifySearchCaptureReceipt(capture.receipt,secret,now+TTL_MS));
  assert.throws(()=>verifySearchCaptureReceipt(capture.receipt,secret,now-1000));
});

test("durable acknowledgement waits for queue commit; write failures never acknowledge",async()=>{
  const capture=issueSearchCaptureReceipt(buildSearchObservation(input),secret);
  let release, acknowledged=false;
  const result=acceptSearchCaptureReceipt({enqueueIntelligenceEvent:()=>new Promise(resolve=>{release=resolve;})},capture.receipt,secret)
    .then(value=>{acknowledged=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(acknowledged,false);
  release({enqueued:true});
  assert.equal((await result).durablyRecorded,true);
  await assert.rejects(acceptSearchCaptureReceipt({enqueueIntelligenceEvent:async()=>{throw Error("database_down");}},capture.receipt,secret));
  let called=false;
  await assert.rejects(acceptSearchCaptureReceipt({enqueueIntelligenceEvent:async()=>{called=true;}},"forged",secret));
  assert.equal(called,false);
});

test("concurrent receipts and retries survive one queue commit followed by a lost acknowledgement",async()=>{
  const {PGlite}=require("@electric-sql/pglite");
  const {createPostgresStore}=require("../backend/db");
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE intelligence_event_queue(event_id TEXT PRIMARY KEY,event_payload JSONB,
      score_payload JSONB,status TEXT,available_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);`);
    const store=createPostgresStore({databaseUrl:"postgres://test/capture",queryClient:db});
    const capture=issueSearchCaptureReceipt(buildSearchObservation(input),secret);
    await acceptSearchCaptureReceipt(store,capture.receipt,secret); // Response lost after commit.
    const results=await Promise.all(Array.from({length:100},()=>acceptSearchCaptureReceipt(store,capture.receipt,secret)));
    assert.ok(results.every(result=>result.durablyRecorded));
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM intelligence_event_queue")).rows[0].n,1);
    const next=issueSearchCaptureReceipt(buildSearchObservation({...input,searchId:"new-search-intent-456"}),secret);
    await acceptSearchCaptureReceipt(store,next.receipt,secret);
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM intelligence_event_queue")).rows[0].n,2);
  } finally {await db.close();}
});
