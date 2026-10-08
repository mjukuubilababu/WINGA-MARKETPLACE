const ledger=require('./migrations/conversation-event-ledger');
const originalBackfill=ledger.statements.find(sql=>sql.startsWith('DO $$ DECLARE m messages%ROWTYPE; cid TEXT; BEGIN'));
if(!originalBackfill || require('node:crypto').createHash('sha256').update(originalBackfill).digest('hex')
  !=='db42e2fd6e956aae742193c87cfa843a6ad49ff89121a1dca351ce1092cb9fad')throw new Error('legacy_compatibility_contract_changed');
const compatible=`entry.sender_id IS NOT NULL AND entry.receiver_id IS NOT NULL AND btrim(entry.sender_id)<>'' AND btrim(entry.receiver_id)<>''
  AND entry.sender_id<>entry.receiver_id AND EXISTS(SELECT 1 FROM users u WHERE u.username=entry.sender_id)
  AND EXISTS(SELECT 1 FROM users u WHERE u.username=entry.receiver_id)`;
async function classifyLegacyConversationHistory(client) {
  const row=(await client.query(`SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER(WHERE sender_id IS NULL OR receiver_id IS NULL OR btrim(sender_id)='' OR btrim(receiver_id)='')::int AS incomplete,
    COUNT(*) FILTER(WHERE sender_id=receiver_id AND btrim(sender_id)<>'')::int AS "selfAddressed",
    COUNT(*) FILTER(WHERE ${compatible})::int AS compatible
    FROM messages entry`)).rows[0];
  return {privacy:'aggregate-only',...row,retainedOutsideLedger:row.total-row.compatible};
}
const compatibilityBackfill=`DO $$ DECLARE m messages%ROWTYPE; cid TEXT; BEGIN
  FOR m IN SELECT * FROM messages entry WHERE ${compatible} ORDER BY timestamp,id LOOP
    cid := winga_ensure_conversation(m.sender_id,m.receiver_id);
    INSERT INTO conversation_message_state(message_id,conversation_id,sender_id,receiver_id,digest,revision)
      VALUES(m.id,cid,m.sender_id,m.receiver_id,winga_message_event_digest(m),1) ON CONFLICT DO NOTHING;
    IF FOUND THEN PERFORM winga_append_conversation_event(cid,'message_imported',m.id,m.sender_id,1); END IF;
  END LOOP;
END $$;`;
async function verifyLegacyConversationImport(client) {
  const row=(await client.query(`SELECT COUNT(*)::int AS missing FROM messages entry
    WHERE ${compatible} AND NOT EXISTS(
      SELECT 1 FROM conversation_message_state s JOIN conversation_event_streams c ON c.id=s.conversation_id
      WHERE s.message_id=entry.id AND s.sender_id=entry.sender_id AND s.receiver_id=entry.receiver_id
        AND c.participant_low=LEAST(entry.sender_id,entry.receiver_id) AND c.participant_high=GREATEST(entry.sender_id,entry.receiver_id)
        AND EXISTS(SELECT 1 FROM conversation_events e WHERE e.conversation_id=c.id AND e.message_id=entry.id AND e.kind='message_imported'))`)).rows[0];
  if(row.missing!==0)throw new Error('legacy_compatibility_import_incomplete');
}
module.exports={ledgerId:ledger.id,originalBackfill,compatibilityBackfill,classifyLegacyConversationHistory,verifyLegacyConversationImport};
