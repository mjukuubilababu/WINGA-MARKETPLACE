const ACTIONS=Object.freeze(['directory','reserve','transfer','accept','send','receipt','receipt-ack','reject','poll',
  'direct-duplicate-send','send-commit','protocol-error','media-upload','media-download',
  'media-reserve','replace-reserve','replace-transfer','replace-accept','replace-retire',
  'device-reserve','device-transfer','device-accept','device-retire','device-change-reserve','device-change-transfer','device-change-accept','device-change-retire','sync-ack','media-history-grant',
  'history-reserve','history-tasks','history-page-put','history-publish','history-pages','history-accept','history-cancel','archive-read','archive-read-ack',
  ...Object.keys(require('./encrypted-shopping-rooms').fields),...Object.keys(require('./encrypted-room-sellers').fields)]);
function createConversationMetrics({now=Date.now}={}) {
  const started=now(),counts=new Map(),buckets=new Map();
  const runId=require('node:crypto').randomUUID();
  function record(action,status,durationMs) {
    // Strict dimensions: never stringify payloads, errors, users, IDs or ciphertext.
    if(!ACTIONS.includes(action)||!Number.isInteger(status)||status<100||status>599
      ||!Number.isFinite(durationMs)||durationMs<0)return;
    const outcome=status<400?'success':status===429?'limited':status<500?'rejected':'unavailable';
    const key=action+':'+outcome,row=counts.get(key)||{action,outcome,count:0,totalDurationMs:0,maxDurationMs:0};
    row.count=Math.min(Number.MAX_SAFE_INTEGER,row.count+1);
    const duration=Math.min(300000,Math.round(durationMs));
    row.totalDurationMs=Math.min(Number.MAX_SAFE_INTEGER,row.totalDurationMs+duration);
    row.maxDurationMs=Math.max(row.maxDurationMs,duration);counts.set(key,row);
    const hour=Math.floor(now()/3600000)*3600000;
    for(const saved of buckets.keys())if(saved<hour-23*3600000)buckets.delete(saved);
    if(!buckets.has(hour))buckets.set(hour,new Map());
    const entries=buckets.get(hour),bucket=entries.get(key)||{action,outcome,count:0,totalDurationMs:0,maxDurationMs:0};
    bucket.count=Math.min(Number.MAX_SAFE_INTEGER,bucket.count+1);
    bucket.totalDurationMs=Math.min(Number.MAX_SAFE_INTEGER,bucket.totalDurationMs+duration);
    bucket.maxDurationMs=Math.max(bucket.maxDurationMs,duration);entries.set(key,bucket);
  }
  function snapshot() {
    return {version:1,privacy:'aggregate-only',scope:'process-since-start',startedAt:new Date(started).toISOString(),
      sampledAt:new Date(now()).toISOString(),operations:[...counts.values()].map(row=>({...row,
        averageDurationMs:Math.round(row.totalDurationMs/row.count)}))};
  }
  function fleetSnapshot() {
    const hour=Math.floor(now()/3600000)*3600000;
    return {runId,buckets:[...buckets].filter(([saved])=>saved>=hour-23*3600000)
      .flatMap(([saved,entries])=>[...entries.values()].map(row=>({...row,hour:new Date(saved).toISOString()})))};
  }
  return {record,snapshot,fleetSnapshot};
}
const conversationMetrics=createConversationMetrics();
module.exports={ACTIONS,createConversationMetrics,conversationMetrics};
