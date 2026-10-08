const {ACTIONS}=require('./conversation-metrics');
const OUTCOMES=['success','limited','rejected','unavailable'];
function createConversationOperationsStore({withTransaction,getPoolHealth=()=>({available:false})}) {
  async function publishConversationMetrics(snapshot) {
    if(!snapshot||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(snapshot.runId)||!Array.isArray(snapshot.buckets)
      ||snapshot.buckets.length>24*ACTIONS.length*4||snapshot.buckets.some(row=>
        !row||Object.keys(row).sort().join(',')!=='action,count,hour,maxDurationMs,outcome,totalDurationMs'
        ||!ACTIONS.includes(row.action)||!OUTCOMES.includes(row.outcome)
        ||!Number.isSafeInteger(row.count)||row.count<1||!Number.isSafeInteger(row.totalDurationMs)||row.totalDurationMs<0
        ||!Number.isInteger(row.maxDurationMs)||row.maxDurationMs<0||row.maxDurationMs>300000
        ||!/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/.test(row.hour)||!Number.isFinite(Date.parse(row.hour))))
      throw new TypeError('conversation_metrics_snapshot_invalid');
    const runId=snapshot.runId,records=JSON.stringify(snapshot.buckets);
    return withTransaction(async client=>{
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '1s'");
      // Cumulative per-boot buckets make a retry after an uncertain commit idempotent.
      await client.query(`INSERT INTO conversation_operation_metrics(run_id,hour,action,outcome,count,total_duration_ms,max_duration_ms)
        SELECT $1::uuid,r.hour,r.action,r.outcome,r.count,r."totalDurationMs",r."maxDurationMs"
        FROM jsonb_to_recordset($2::jsonb) AS r(hour timestamptz,action text,outcome text,count bigint,"totalDurationMs" bigint,"maxDurationMs" integer)
        WHERE r.hour BETWEEN date_trunc('hour',NOW())-INTERVAL '23 hours' AND date_trunc('hour',NOW())
        ON CONFLICT(run_id,hour,action,outcome) DO UPDATE SET
          count=GREATEST(conversation_operation_metrics.count,EXCLUDED.count),
          total_duration_ms=GREATEST(conversation_operation_metrics.total_duration_ms,EXCLUDED.total_duration_ms),
          max_duration_ms=GREATEST(conversation_operation_metrics.max_duration_ms,EXCLUDED.max_duration_ms),updated_at=NOW()`,
        [runId,records]);
      await client.query(`INSERT INTO conversation_metrics_publishers(run_id) VALUES($1::uuid)
        ON CONFLICT(run_id) DO UPDATE SET updated_at=NOW()`,[runId]);
      await client.query(`DELETE FROM conversation_operation_metrics WHERE (run_id,hour,action,outcome) IN
        (SELECT run_id,hour,action,outcome FROM conversation_operation_metrics
          WHERE hour<date_trunc('hour',NOW())-INTERVAL '7 days' ORDER BY hour LIMIT 5000)`);
      await client.query(`DELETE FROM conversation_metrics_publishers WHERE run_id IN
        (SELECT run_id FROM conversation_metrics_publishers WHERE updated_at<NOW()-INTERVAL '7 days' ORDER BY updated_at LIMIT 1000)`);
      return {ok:true};
    });
  }
  async function readConversationOperationsHealth() {
    return withTransaction(async client=>{
      await client.query("SET LOCAL statement_timeout = '10s'");
      const chat=await require('./verify-encrypted-chat-readiness').verifyEncryptedChatReadiness({client,checkStorage:false});
      const rooms=await require('./verify-shopping-rooms').verifyShoppingRooms(client);
      const schema=(await client.query(`SELECT to_regclass('conversation_operation_metrics') IS NOT NULL
        AND to_regclass('conversation_metrics_publishers') IS NOT NULL AS metrics`)).rows[0];
      let metrics={privacy:'aggregate-only',scope:'fleet-hour-buckets',windowHours:24,available:false,operations:[]};
      if(schema.metrics) {
        const operations=(await client.query(`SELECT action,outcome,SUM(count)::float8 AS count,
          ROUND(SUM(total_duration_ms)::numeric/NULLIF(SUM(count),0))::float8 AS "averageDurationMs",
          MAX(max_duration_ms) AS "maxDurationMs"
          FROM conversation_operation_metrics WHERE hour>=date_trunc('hour',NOW())-INTERVAL '23 hours' AND action=ANY($1::text[])
          GROUP BY action,outcome ORDER BY action,outcome`,[ACTIONS])).rows;
        const sample=(await client.query(`SELECT MAX(updated_at) AS "lastPublishedAt",
          COUNT(*) FILTER(WHERE updated_at>=NOW()-INTERVAL '120 seconds')::int AS "activePublishers"
          FROM conversation_metrics_publishers`)).rows[0];
        metrics={...metrics,available:true,operations,...sample};
      }
      const dispatch=(await client.query(`SELECT COUNT(*)::int AS "pendingOwners",
        COALESCE(GREATEST(0,EXTRACT(EPOCH FROM(NOW()-MIN(created_at)))),0)::float8 AS "oldestPendingAgeSeconds"
        FROM message_dispatch_outbox`)).rows[0];
      const push=(await client.query(`SELECT
        COUNT(*) FILTER(WHERE completed_at IS NULL AND expires_at>NOW())::int AS pending,
        COUNT(*) FILTER(WHERE completed_at IS NULL AND expires_at>NOW() AND attempts>=8)::int AS exhausted,
        COALESCE(MAX(GREATEST(0,EXTRACT(EPOCH FROM(NOW()-next_attempt_at))))
          FILTER(WHERE completed_at IS NULL AND expires_at>NOW()),0)::float8 AS "oldestDueAgeSeconds"
        FROM web_push_jobs`)).rows[0];
      const media=(await client.query(`SELECT COUNT(*)::int AS "cleanupOverdue",
        COALESCE(MAX(EXTRACT(EPOCH FROM(NOW()-expires_at))),0)::float8 AS "oldestCleanupAgeSeconds"
        FROM encrypted_conversation_media WHERE status IN ('reserved','uploaded','cleaning') AND expires_at<NOW()`)).rows[0];
      const durable=(await client.query(`SELECT COUNT(*)::int AS "ciphertextRecordsAccepted"
        FROM encrypted_conversation_messages WHERE created_at>=date_trunc('hour',NOW())-INTERVAL '23 hours'`)).rows[0];
      const experienceSchema=(await client.query(`SELECT to_regclass('conversation_experience_metrics') IS NOT NULL AS ready`)).rows[0];
      let experience={available:false,scope:'client-reported-hour-buckets',windowHours:24,metrics:[]};
      if(experienceSchema.ready)experience={...experience,available:true,metrics:(await client.query(`SELECT name,SUM(count)::float8 AS count,
        ROUND(SUM(total_duration_ms)::numeric/NULLIF(SUM(count),0))::float8 AS "averageDurationMs",MAX(max_duration_ms) AS "maxDurationMs"
        FROM conversation_experience_metrics WHERE hour>=date_trunc('hour',NOW())-INTERVAL '23 hours' GROUP BY name ORDER BY name`)).rows};
      const receiptSchema=(await client.query(`SELECT EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='encrypted_conversation_receipts' AND column_name='recorded_at') AS ready`)).rows[0];
      let reliability={available:false,scope:'ciphertext-records-not-human-messages',windowHours:24};
      if(receiptSchema.ready){
        const observed=(await client.query(`WITH records AS (
          SELECT id,created_at FROM encrypted_conversation_messages WHERE created_at>=date_trunc('hour',NOW())-INTERVAL '23 hours'
        ), receipts AS (
          SELECT m.id,m.created_at,MIN(r.recorded_at) FILTER(WHERE r.kind='delivered') AS delivered,
            BOOL_OR(r.kind='delivered') AS has_delivered,BOOL_OR(r.kind='read') AS has_read
          FROM records m LEFT JOIN encrypted_conversation_receipts r ON r.message_id=m.id GROUP BY m.id,m.created_at
        ) SELECT COUNT(*)::int AS accepted,
          COUNT(*) FILTER(WHERE has_delivered)::int AS delivered,COUNT(*) FILTER(WHERE has_read)::int AS read,
          COUNT(delivered)::int AS "timedDeliverySamples",
          AVG(GREATEST(0,EXTRACT(EPOCH FROM(delivered-created_at))*1000)) FILTER(WHERE delivered IS NOT NULL)::float8 AS "averageDeliveryMs"
          FROM receipts`)).rows[0];
        reliability={...reliability,available:true,...observed,deliveredRecordRate:observed.accepted?observed.delivered/observed.accepted:null};
      }
      const multiDevice=(await client.query(`SELECT COUNT(*)::int AS samples,
        AVG(GREATEST(0,EXTRACT(EPOCH FROM(a.acknowledged_at-m.created_at))*1000))::float8 AS "averageSyncDelayMs"
        FROM encrypted_conversation_sync_acks a JOIN encrypted_conversation_messages m ON m.id=a.message_id
        WHERE m.created_at>=date_trunc('hour',NOW())-INTERVAL '23 hours'`)).rows[0];
      const invariants=await require('./conversation-invariants').readConversationInvariants(client);
      return {schema:chat.schema,rooms:{ok:rooms.ok,schemaReady:rooms.schemaReady,health:rooms.health},metrics,dispatch,push,media,durable,invariants,
        multiDevice:{scope:'verified-native-sync-acks',...multiDevice},
        reliability,experience,pool:getPoolHealth()};
    });
  }
  return {publishConversationMetrics,readConversationOperationsHealth};
}
module.exports={createConversationOperationsStore};
