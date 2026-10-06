const migrationId='2026100701_encrypted_room_sellers';
async function verifyRoomSellerRequests(client){
  const result={ok:false,mode:'verify-room-seller-requests',privacy:'aggregate-only',databaseChanged:false,remoteWrites:false,
    authenticatedSellerFlowVerified:false,cryptographicAuditApproved:false};
  const s=(await client.query(`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE migration_id=$1) AS migration,
    to_regclass('encrypted_room_seller_questions') IS NOT NULL AS questions,to_regclass('encrypted_room_seller_answers') IS NOT NULL AS answers,
    (SELECT COUNT(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND
      ((tgname='immutable_room_seller_question' AND tgrelid=to_regclass('encrypted_room_seller_questions')) OR
       (tgname='immutable_room_seller_answer' AND tgrelid=to_regclass('encrypted_room_seller_answers')))) AS guards`,[migrationId])).rows[0];
  result.schemaReady=Boolean(s.migration&&s.questions&&s.answers&&s.guards===2);if(!result.schemaReady)return result;
  result.health=(await client.query(`SELECT (SELECT COUNT(*)::int FROM encrypted_room_seller_questions) AS questions,
    (SELECT COUNT(*)::int FROM encrypted_room_seller_answers) AS answers,
    (SELECT COUNT(*)::int FROM encrypted_room_seller_questions q JOIN encrypted_conversations g ON g.id=q.direct_id
      WHERE g.kind<>'direct' OR q.buyer_id NOT IN(g.creator,g.recipient) OR q.seller_id NOT IN(g.creator,g.recipient)) AS "invalidDirectBindings",
    (SELECT COUNT(*)::int FROM encrypted_room_seller_answers a JOIN encrypted_room_seller_questions q ON q.id=a.question_id
      JOIN encrypted_conversation_messages m ON m.id=a.message_id WHERE m.conversation_id<>q.direct_id
      OR a.proof->>'owner' IS DISTINCT FROM q.seller_id OR a.proof->>'action' IS DISTINCT FROM 'seller-answer-register'
      OR a.proof->>'actorId' IS DISTINCT FROM m.sender_device OR a.anchor->>'owner' IS DISTINCT FROM q.seller_id
      OR a.anchor->>'id' IS DISTINCT FROM m.sender_device OR a.proof->'payload'->>'id' IS DISTINCT FROM q.id
      OR a.proof->'payload'->>'messageId' IS DISTINCT FROM a.message_id
      OR a.proof->'payload'->>'conversationId' IS DISTINCT FROM q.direct_id
      OR a.proof->'payload'->>'answerHash' IS DISTINCT FROM a.answer_hash) AS "invalidAnswerBindings"`)).rows[0];
  result.ok=result.health.invalidDirectBindings===0&&result.health.invalidAnswerBindings===0;return result;
}
async function main(){const {Client}=require('pg'),c=new Client({connectionString:process.env.DATABASE_URL,
  ssl:String(process.env.DATABASE_SSL).toLowerCase()==='true'?{rejectUnauthorized:false}:false,connectionTimeoutMillis:10000,statement_timeout:10000});
  try{if(!process.env.DATABASE_URL||process.argv.length>2)throw new Error();await c.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const r=await verifyRoomSellerRequests(c);await c.query('COMMIT');console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;
  }catch{console.log(JSON.stringify({ok:false,errorCode:'ROOM_SELLER_CHECK_FAILED',databaseChanged:false,remoteWrites:false}));process.exitCode=1;}
  finally{await c.end().catch(()=>{});}}
if(require.main===module)main();module.exports={verifyRoomSellerRequests,migrationId};
