const {ACK_RETENTION_ELIGIBLE}=require('./conversation-event-ledger');
async function inspectConversationRetention(client,{ackRetentionDays=30}={}){
  if(!Number.isInteger(ackRetentionDays)||ackRetentionDays<7||ackRetentionDays>365)throw Object.assign(new Error('RETENTION_POLICY_INVALID'),{code:'RETENTION_POLICY_INVALID'});
  // Caller owns a READ ONLY transaction. Reuse the exact canonical eligibility
  // predicate; there is no second deletion engine or history-purge endpoint.
  const queue=(await client.query(`SELECT COUNT(*)::text AS total,
    COUNT(*) FILTER(WHERE d.acknowledged_at IS NULL AND d.cancelled_at IS NULL)::text AS pending,
    COUNT(*) FILTER(WHERE ${ACK_RETENTION_ELIGIBLE})::text AS eligible
    FROM conversation_device_deliveries d JOIN conversation_events e ON e.id=d.event_id
    LEFT JOIN conversation_device_progress p ON p.device_id=d.device_id AND p.conversation_id=e.conversation_id`,[ackRetentionDays])).rows[0];
  const history=(await client.query(`SELECT COUNT(*)::text AS total,
    COUNT(*) FILTER(WHERE expires_at<=NOW())::text AS expiredStaging
    FROM encrypted_conversation_history_transfers`)).rows[0];
  const native=(await client.query('SELECT COUNT(*)::text AS total FROM encrypted_conversation_messages')).rows[0];
  return {version:1,mode:'conversation-retention-dry-run',privacy:'aggregate-only',
    policy:{ackRetentionDays,historyStagingHours:24,ciphertextHistoryDays:null,replayLedgerDays:null,
      moderationEvidenceDays:null,backupExpiryDays:null,accountErasurePolicyAccepted:false},
    queue:{total:queue.total,pendingProtected:queue.pending,eligibleAcknowledged:queue.eligible},
    history:{stagingTotal:history.total,expiredStaging:history.expiredstaging??history.expiredStaging,acceptedMessagesPreserved:native.total},
    deletionExecuted:false,productionRetentionAccepted:false};
}
module.exports={inspectConversationRetention};
