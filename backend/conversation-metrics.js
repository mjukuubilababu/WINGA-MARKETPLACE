const ACTIONS=Object.freeze(['directory','reserve','transfer','accept','send','receipt','receipt-ack','reject','poll',
  'media-reserve','replace-reserve','replace-transfer','replace-accept','replace-retire',
  'device-reserve','device-transfer','device-accept','device-retire','device-change-reserve','device-change-transfer','device-change-accept','device-change-retire','sync-ack','media-history-grant']);
function createConversationMetrics({now=Date.now}={}) {
  const started=now(),counts=new Map();
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
  }
  function snapshot() {
    return {version:1,privacy:'aggregate-only',scope:'process-since-start',startedAt:new Date(started).toISOString(),
      sampledAt:new Date(now()).toISOString(),operations:[...counts.values()].map(row=>({...row,
        averageDurationMs:Math.round(row.totalDurationMs/row.count)}))};
  }
  return {record,snapshot};
}
const conversationMetrics=createConversationMetrics();
module.exports={ACTIONS,createConversationMetrics,conversationMetrics};
