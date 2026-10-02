async function isLegacyConversation(client, sender, receiver) {
  const result = await client.query(`SELECT security_mode FROM conversation_event_streams
    WHERE participant_low=LEAST($1::text,$2::text) AND participant_high=GREATEST($1::text,$2::text)
    FOR UPDATE`, [sender, receiver]);
  return !result.rows.length || result.rows[0].security_mode === 'legacy-plaintext';
}
module.exports = { isLegacyConversation };
