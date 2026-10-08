const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {setTimeout:delay} = require('node:timers/promises');

// Called only by the isolated localhost PostgreSQL/two-node fixture.
module.exports = async function exercise({pool,device,firstPort,secondPort,tickets,stopFirst,restartWriter,sampleNodes}) {
  const concurrency=8, senders=16, perSender=4, expected=65;
  const clients=[], payloads=[], canonical=new Map(), latencies=[];
  for(let i=0;i<senders;i++) {
    clients.push(await device(i%2 ? secondPort : firstPort,tickets[`load${i}`]));
    payloads.push(Array.from({length:perSender},()=>({clientMessageId:randomUUID(),receiverId:'bob',message:'synthetic bounded load'})));
  }
  const slow=await device(firstPort,tickets.bob2);
  const started=performance.now();
  const sending=Promise.allSettled(Array.from({length:concurrency},async(_,worker)=>{
    for(let i=worker;i<senders;i+=concurrency) for(const payload of payloads[i]) {
      const start=performance.now();
      const reply=await clients[i].command('message.send',payload);
      latencies.push(performance.now()-start);
      assert.equal(reply.status,'ok');
      assert.equal(reply.response.accepted,true);
      assert.ok(reply.response.message.id);
      canonical.set(payload.clientMessageId,reply.response.message.id);
    }
  })).then(results=>{for(const result of results)if(result.status==='rejected')throw result.reason;});
  // Observe both promises on failure, so fixture cleanup never races live sends.
  const [sendResult,batchResult]=await Promise.allSettled([sending,slow.wait(frame=>frame[3]==='events')]);
  if(sendResult.status==='rejected')throw sendResult.reason;
  if(batchResult.status==='rejected')throw batchResult.reason;
  const held=batchResult.value[4];
  assert.ok(held.events.length>0 && held.events.length<=50);
  const fifth={clientMessageId:randomUUID(),receiverId:'bob',message:'synthetic hot conversation fifth'};
  const fifthReply=await clients[0].command('message.send',fifth);
  assert.equal(fifthReply.status,'ok');
  payloads[0].push(fifth);
  canonical.set(fifth.clientMessageId,fifthReply.response.message.id);
  const limited=await clients[0].command('message.send',{...fifth,clientMessageId:randomUUID(),message:'synthetic over-limit send'});
  assert.equal(limited.status,'error');
  assert.equal(limited.response.code,'outcome_unknown');
  const sendElapsedMs=Math.round(performance.now()-started);
  await delay(2500);
  assert.equal(slow.pendingBatches(),0,'withheld ACK must not stream additional batches');
  const ids=[...canonical.values()];
  assert.equal(new Set(ids).size,expected);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM messages WHERE sender_id='load0'")).rows[0].n,5);
  async function counts() {
    return (await pool.query(`SELECT COUNT(*)::int AS messages,
      COUNT(DISTINCT (conversation_id,conversation_sequence))::int AS sequences,
      COUNT(*) FILTER (WHERE is_delivered OR is_read)::int AS receipts
      FROM messages WHERE id=ANY($1::text[])`,[ids])).rows[0];
  }
  assert.deepEqual(await counts(),{messages:expected,sequences:expected,receipts:0});
  const pendingBefore=(await pool.query(`SELECT COUNT(*)::int AS n FROM conversation_device_deliveries d
    JOIN conversation_events e ON e.id=d.event_id WHERE d.device_id='bob2'
    AND d.acknowledged_at IS NULL AND e.message_id=ANY($1::text[])`,[ids])).rows[0].n;
  assert.equal(pendingBefore,expected);

  // Point-in-time aggregate measurement, not a saturation/capacity claim.
  let measuredNodes = null;
  try {if (sampleNodes) measuredNodes = await sampleNodes();} catch {}
  await stopFirst();
  for(const client of clients)client.ws.close();
  await restartWriter();
  // Retrying after both process failures must resolve to the original rows.
  const retries=[];
  for(let i=0;i<senders;i++)retries.push(await device(secondPort,tickets[`load${i}`]));
  const retryResults=await Promise.allSettled(Array.from({length:concurrency},async(_,worker)=>{
    for(let i=worker;i<senders;i+=concurrency) for(const payload of payloads[i]) {
      const reply=await retries[i].command('message.send',payload);
      assert.equal(reply.status,'ok');
      assert.equal(reply.response.message.id,canonical.get(payload.clientMessageId));
    }
  }));
  for(const result of retryResults)if(result.status==='rejected')throw result.reason;
  assert.deepEqual(await counts(),{messages:expected,sequences:expected,receipts:0});

  const recovered=await device(secondPort,tickets.bob2), seen=new Set();
  let batches=0;
  while(true) {
    const pending=(await pool.query(`SELECT COUNT(*)::int AS n FROM conversation_device_deliveries
      WHERE device_id='bob2' AND acknowledged_at IS NULL AND cancelled_at IS NULL`)).rows[0].n;
    if(!pending)break;
    assert.ok(++batches<=10,'replay must drain a bounded fixture backlog');
    const batch=(await recovered.wait(frame=>frame[3]==='events'))[4];
    assert.ok(batch.events.length>0 && batch.events.length<=50);
    for(const event of batch.events){assert.equal(seen.has(event.id),false);seen.add(event.id);}
    const ack=await recovered.command('events.ack',{eventIds:batch.events.map(event=>event.id)});
    assert.equal(ack.status,'ok');
  }
  for(const event of held.events)assert.ok(seen.has(event.id),'unacknowledged pre-failure events must replay');
  const acknowledged=(await pool.query(`SELECT COUNT(*)::int AS n FROM conversation_device_deliveries d
    JOIN conversation_events e ON e.id=d.event_id WHERE d.device_id='bob2'
    AND d.acknowledged_at IS NOT NULL AND e.message_id=ANY($1::text[])`,[ids])).rows[0].n;
  assert.equal(acknowledged,expected);
  assert.deepEqual(await counts(),{messages:expected,sequences:expected,receipts:0});
  for(const client of [...retries,recovered])client.ws.close();
  latencies.sort((a,b)=>a-b);
  return {mode:'local-bounded-phoenix-load',concurrency,senders,messages:expected,retries:expected,
    hotConversationBurstRejected:true,
    canonicalDuplicates:0,ackStalledSingleBatch:true,phoenixNodeLossRecovered:true,
    writerRestartRecovered:true,replayedAndAcknowledged:acknowledged,implicitReceipts:0,
    sendElapsedMs,p50SendMs:Math.round(latencies[Math.ceil(latencies.length*0.5)-1]),
    p95SendMs:Math.round(latencies[Math.ceil(latencies.length*0.95)-1]),
    measuredNodes,productionCapacityProven:false};
};
