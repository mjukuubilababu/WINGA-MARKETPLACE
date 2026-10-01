async function verifyConversationEvents(client) {
  const schema = (await client.query(`SELECT
    EXISTS(SELECT 1 FROM schema_migrations WHERE migration_id='2026092805_conversation_event_ledger') AS "migrationApplied",
    to_regclass('conversation_device_deliveries') IS NOT NULL AS "queuePresent",
    to_regclass('conversation_device_progress') IS NOT NULL AS "progressPresent",
    (SELECT COUNT(*)=5 FROM pg_trigger WHERE tgenabled='O' AND
      (tgrelid,tgname) IN ((to_regclass('messages'),'capture_conversation_message'),
        (to_regclass('message_device_receipts'),'capture_conversation_receipt'),
        (to_regclass('user_blocks'),'capture_conversation_access'),
        (to_regclass('sessions'),'revoke_conversation_delivery_device'),
        (to_regclass('conversation_events'),'immutable_conversation_event'))) AS "triggersEnabled"`)).rows[0];
  const ready=Object.values(schema).every(value=>value===true);
  const counts=ready ? (await client.query(`SELECT
    (SELECT COUNT(*)::int FROM conversation_event_streams) AS conversations,
    (SELECT COUNT(*)::int FROM conversation_events) AS events,
    (SELECT COUNT(*)::int FROM conversation_delivery_devices WHERE revoked_at IS NULL) AS "registeredDevices",
    (SELECT COUNT(*)::int FROM conversation_device_deliveries WHERE acknowledged_at IS NULL AND cancelled_at IS NULL) AS pending,
    (SELECT COUNT(*)::int FROM conversation_device_deliveries WHERE acknowledged_at IS NOT NULL) AS acknowledged,
    (SELECT COUNT(DISTINCT device_id)::int FROM conversation_device_deliveries
      WHERE acknowledged_at IS NULL AND cancelled_at IS NULL) AS "devicesWithPending",
    (SELECT COUNT(*)::int FROM conversation_device_deliveries
      WHERE acknowledged_at IS NULL AND cancelled_at IS NULL AND enqueued_at<NOW()-INTERVAL '24 hours') AS "pendingOver24Hours",
    (SELECT COALESCE(EXTRACT(EPOCH FROM NOW()-MIN(enqueued_at))::int,0) FROM conversation_device_deliveries
      WHERE acknowledged_at IS NULL AND cancelled_at IS NULL) AS "oldestPendingSeconds",
    (SELECT COALESCE(MAX(attempts),0)::int FROM conversation_device_deliveries
      WHERE acknowledged_at IS NULL AND cancelled_at IS NULL) AS "maxPendingAttempts",
    NOT EXISTS(SELECT 1 FROM conversation_device_progress p JOIN conversation_events e
      ON e.conversation_id=p.conversation_id AND e.position<=p.acknowledged_position
      LEFT JOIN conversation_device_deliveries d ON d.device_id=p.device_id AND d.event_id=e.id
      WHERE d.event_id IS NOT NULL AND (d.acknowledged_at IS NULL OR d.cancelled_at IS NOT NULL)) AS "progressConsistent",
    NOT EXISTS(SELECT 1 FROM conversation_event_streams c WHERE c.position<>(SELECT COUNT(*) FROM conversation_events e WHERE e.conversation_id=c.id)
      OR c.position<>COALESCE((SELECT MAX(position) FROM conversation_events e WHERE e.conversation_id=c.id),0)) AS "sequencesConsistent",
    NOT EXISTS(SELECT 1 FROM conversation_device_deliveries d JOIN conversation_delivery_devices v ON v.device_id=d.device_id
      WHERE d.owner_id<>v.owner_id OR (d.acknowledged_at IS NOT NULL AND d.offered_at IS NULL)) AS "queueConsistent"`)).rows[0] : {};
  return {ok:ready && counts.sequencesConsistent && counts.queueConsistent && counts.progressConsistent,
    mode:'verify-conversation-events',privacy:'aggregate-only',
    ...schema,...counts,databaseChanged:false,authenticatedDeviceFlowVerified:false,crossConnectionConcurrencyVerified:false};
}
if(require.main===module){
  const {Client}=require('pg');
  const client=new Client({connectionString:process.env.DATABASE_URL,
    ssl:String(process.env.DATABASE_SSL).toLowerCase()==='true'?{rejectUnauthorized:false}:false,
    connectionTimeoutMillis:10000,statement_timeout:10000});
  (async()=>{
    try{
      if(!process.env.DATABASE_URL)throw new Error('Database unavailable');
      await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result=await verifyConversationEvents(client);await client.query('COMMIT');
      console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
    }catch{
      console.log(JSON.stringify({ok:false,errorCode:'CONVERSATION_EVENT_CHECK_FAILED',databaseChanged:false}));process.exitCode=1;
    }finally{await client.end().catch(()=>{});}
  })();
}
module.exports={verifyConversationEvents};
