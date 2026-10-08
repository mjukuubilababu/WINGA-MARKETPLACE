const {failure}=require('./encrypted-content-contract');
const NAMES=Object.freeze(['open-shell','open-recent','send-confirmed','send-failed','send-pending','retry-confirmed','retry-failed','sync-confirmed','sync-failed',
  'offline-confirmed','offline-failed','transport-reconnect','transport-resume-confirmed','transport-resume-failed','transport-resume-pending']);
function validateExperience(snapshot){
  const valid=snapshot && Object.keys(snapshot).sort().join(',')==='buckets,runId,version' && snapshot.version===1
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(snapshot.runId)
    && Array.isArray(snapshot.buckets)&&snapshot.buckets.length<=24*NAMES.length
    && snapshot.buckets.every(row=>row && Object.keys(row).sort().join(',')==='count,hour,maxDurationMs,name,totalDurationMs'
      && NAMES.includes(row.name)&&Number.isSafeInteger(row.count)&&row.count>0&&row.count<=1e9
      && Number.isSafeInteger(row.totalDurationMs)&&row.totalDurationMs>=0&&row.totalDurationMs<=row.count*300000
      && Number.isInteger(row.maxDurationMs)&&row.maxDurationMs>=0&&row.maxDurationMs<=300000
      && /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/.test(row.hour)&&Number.isFinite(Date.parse(row.hour)))
    && new Set(snapshot.buckets.map(row=>row.hour+'|'+row.name)).size===snapshot.buckets.length;
  if(!valid)throw failure(400,'conversation_experience_invalid');
}
function createConversationExperienceStore({withTransaction}){
  async function publishConversationExperience(context,snapshot){
    validateExperience(snapshot);
    return withTransaction(async client=>{
      await client.query("SET LOCAL statement_timeout='3s'");await client.query("SET LOCAL lock_timeout='500ms'");
      const authenticated=(await client.query(`SELECT 1 FROM sessions s JOIN users u ON u.username=s.username
        WHERE s.token=$1 AND s.username=$2 AND s.session_id=$3 AND s.expires_at>$4 AND u.status='active'`,
        [context.token,context.owner,context.deviceId,Date.now()])).rows.length;
      if(!authenticated)throw failure(401,'conversation_experience_unauthorized');
      const timestamp=Date.now(),bucket=Math.floor(timestamp/60000),key=require('node:crypto').createHash('sha256')
        .update(JSON.stringify(['conversation-experience',context.owner,context.deviceId])).digest('hex');
      const rate=await client.query(`INSERT INTO api_rate_limit_buckets(key_hash,bucket_id,scope,count,window_started_at,expires_at)
        VALUES($1,$2,'conversation-experience',1,$3,$4) ON CONFLICT(key_hash,bucket_id)
        DO UPDATE SET count=api_rate_limit_buckets.count+1 WHERE api_rate_limit_buckets.count<10 RETURNING count`,
        [key,bucket,new Date(bucket*60000).toISOString(),new Date((bucket+1)*60000).toISOString()]);
      if(!rate.rows.length)throw failure(429,'conversation_experience_limited');
      const publisher=await client.query(`INSERT INTO conversation_experience_publishers(run_id,owner_id,session_id)
        VALUES($1::uuid,$2,$3) ON CONFLICT(run_id) DO UPDATE SET updated_at=NOW()
        WHERE conversation_experience_publishers.owner_id=EXCLUDED.owner_id AND conversation_experience_publishers.session_id=EXCLUDED.session_id
        RETURNING run_id`,[snapshot.runId,context.owner,context.deviceId]);
      if(!publisher.rows.length)throw failure(409,'conversation_experience_scope_conflict');
      const count=(await client.query(`SELECT COUNT(*)::int AS n FROM conversation_experience_publishers
        WHERE session_id=$1 AND owner_id=$2 AND created_at>=NOW()-INTERVAL '1 hour'`,[context.deviceId,context.owner])).rows[0].n;
      if(count>60)throw failure(429,'conversation_experience_limited');
      await client.query(`INSERT INTO conversation_experience_metrics(run_id,hour,name,count,total_duration_ms,max_duration_ms)
        SELECT $1::uuid,r.hour,r.name,r.count,r."totalDurationMs",r."maxDurationMs" FROM jsonb_to_recordset($2::jsonb)
        AS r(hour timestamptz,name text,count bigint,"totalDurationMs" bigint,"maxDurationMs" integer)
        WHERE r.hour BETWEEN date_trunc('hour',NOW())-INTERVAL '23 hours' AND date_trunc('hour',NOW())
        ON CONFLICT(run_id,hour,name) DO UPDATE SET count=GREATEST(conversation_experience_metrics.count,EXCLUDED.count),
          total_duration_ms=GREATEST(conversation_experience_metrics.total_duration_ms,EXCLUDED.total_duration_ms),
          max_duration_ms=GREATEST(conversation_experience_metrics.max_duration_ms,EXCLUDED.max_duration_ms)`,
        [snapshot.runId,JSON.stringify(snapshot.buckets)]);
      await client.query(`DELETE FROM conversation_experience_publishers WHERE run_id IN
        (SELECT run_id FROM conversation_experience_publishers WHERE updated_at<NOW()-INTERVAL '7 days' LIMIT 1000)`);
      await client.query(`DELETE FROM conversation_experience_metrics WHERE (run_id,hour,name) IN
        (SELECT run_id,hour,name FROM conversation_experience_metrics WHERE hour<NOW()-INTERVAL '7 days' ORDER BY hour LIMIT 5000)`);
      return {ok:true};
    });
  }
  return {publishConversationExperience};
}
module.exports={NAMES,validateExperience,createConversationExperienceStore};
