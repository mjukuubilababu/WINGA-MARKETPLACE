const enabledGuards=`(SELECT COUNT(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND (
  (tgrelid=to_regclass('encrypted_conversation_messages') AND tgname IN ('record_encrypted_acceptance','guard_encrypted_message_record','guard_encrypted_message_truncate'))
  OR (tgrelid=to_regclass('encrypted_message_acceptances') AND tgname IN ('guard_encrypted_acceptance','guard_encrypted_acceptance_truncate'))))`;
async function readConversationInvariants(client) {
  const schema=(await client.query(`SELECT to_regclass('encrypted_message_acceptances') IS NOT NULL
    AND to_regclass('encrypted_message_push_outbox') IS NOT NULL AS available,
    ${enabledGuards} AS guards`)).rows[0];
  if(!schema.available)return {available:false,ok:false,privacy:'aggregate-only',guardTriggersEnabled:schema.guards};
  const records=(await client.query(`SELECT COUNT(*) FILTER(WHERE m.id IS NULL)::int AS "missingAccepted",
    COUNT(*) FILTER(WHERE a.message_id IS NULL)::int AS "missingEvidence",
    COUNT(*) FILTER(WHERE m.id IS NOT NULL AND a.message_id IS NOT NULL AND
      ROW(m.conversation_id,m.sender_device,m.epoch,m.sequence,m.hash,m.media_id,m.created_at,encode(sha256(convert_to(m.ciphertext,'UTF8')),'hex'))
      IS DISTINCT FROM ROW(a.conversation_id,a.sender_device,a.epoch,a.sequence,a.hash,a.media_id,a.accepted_at,a.ciphertext_digest))::int AS mismatched,
    COUNT(*) FILTER(WHERE a.evidence_source='migration-baseline')::int AS "baselineRecords",
    COUNT(*) FILTER(WHERE a.evidence_source='transaction')::int AS "transactionRecords"
    FROM encrypted_message_acceptances a FULL JOIN encrypted_conversation_messages m ON m.id=a.message_id`)).rows[0];
  const ordering=(await client.query(`SELECT COUNT(*)::int AS "invalidSequences" FROM encrypted_conversations g
    WHERE g.next_sequence IS DISTINCT FROM COALESCE((SELECT MAX(a.sequence) FROM encrypted_message_acceptances a WHERE a.conversation_id=g.id),0)`)).rows[0];
  const push=(await client.query(`SELECT COUNT(*) FILTER(WHERE expires_at>NOW())::int AS pending,
    COALESCE(MAX(GREATEST(0,EXTRACT(EPOCH FROM(NOW()-created_at)))) FILTER(WHERE expires_at>NOW()),0)::float8 AS "oldestPendingAgeSeconds"
    FROM encrypted_message_push_outbox`)).rows[0];
  return {available:true,privacy:'aggregate-only',scope:'canonical-ciphertext-evidence-not-client-ack-observation',
    guardTriggersEnabled:schema.guards,...records,...ordering,push,
    ok:schema.guards===5&&!records.missingAccepted&&!records.missingEvidence&&!records.mismatched&&!ordering.invalidSequences};
}
async function assertEncryptedAcceptance(client,id) {
  const result=await client.query(`SELECT 1 FROM encrypted_conversation_messages m JOIN encrypted_message_acceptances a ON a.message_id=m.id
    WHERE m.id=$1 AND ${enabledGuards}=5 AND ROW(m.conversation_id,m.sender_device,m.epoch,m.sequence,m.hash,m.media_id,m.created_at,encode(sha256(convert_to(m.ciphertext,'UTF8')),'hex'))
      IS NOT DISTINCT FROM ROW(a.conversation_id,a.sender_device,a.epoch,a.sequence,a.hash,a.media_id,a.accepted_at,a.ciphertext_digest)`,[id]);
  if(result.rows.length!==1)throw require('./encrypted-content-contract').failure(503,'encrypted_message_durability_unavailable');
}
module.exports={readConversationInvariants,assertEncryptedAcceptance};
