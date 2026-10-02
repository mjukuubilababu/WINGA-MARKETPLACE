module.exports = Object.freeze({
  id: '2026100302_conversation_security_mode',
  statements: Object.freeze([
    `LOCK TABLE conversation_event_streams, messages IN SHARE ROW EXCLUSIVE MODE;`,
    `ALTER TABLE conversation_event_streams ADD COLUMN IF NOT EXISTS security_mode TEXT NOT NULL
      DEFAULT 'legacy-plaintext' CHECK(security_mode IN ('legacy-plaintext','encrypted'));`,
    `CREATE OR REPLACE FUNCTION winga_guard_conversation_security_mode() RETURNS trigger AS $$ BEGIN
      IF OLD.security_mode='encrypted' THEN
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'conversation_security_mode_immutable'; END IF;
        IF NEW.security_mode<>OLD.security_mode OR NEW.id<>OLD.id
          OR NEW.participant_low<>OLD.participant_low OR NEW.participant_high<>OLD.participant_high THEN
          RAISE EXCEPTION 'conversation_security_mode_immutable';
        END IF;
      END IF;
      IF TG_OP='DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;`,
    `DROP TRIGGER IF EXISTS guard_conversation_security_mode ON conversation_event_streams;`,
    `CREATE TRIGGER guard_conversation_security_mode BEFORE UPDATE OR DELETE ON conversation_event_streams
      FOR EACH ROW EXECUTE FUNCTION winga_guard_conversation_security_mode();`,
    `CREATE OR REPLACE FUNCTION winga_guard_legacy_message() RETURNS trigger AS $$
      DECLARE cid TEXT; mode TEXT; BEGIN
      IF TG_OP='UPDATE' THEN
        IF ROW(OLD.id,OLD.sender_id,OLD.receiver_id,OLD.conversation_id,OLD.message,OLD.message_type,
          OLD.product_id,OLD.product_name,OLD.product_items,OLD.reply_to_message_id)
          IS NOT DISTINCT FROM ROW(NEW.id,NEW.sender_id,NEW.receiver_id,NEW.conversation_id,NEW.message,NEW.message_type,
          NEW.product_id,NEW.product_name,NEW.product_items,NEW.reply_to_message_id) THEN RETURN NEW; END IF;
        SELECT security_mode INTO mode FROM conversation_event_streams
          WHERE participant_low=LEAST(OLD.sender_id,OLD.receiver_id)
            AND participant_high=GREATEST(OLD.sender_id,OLD.receiver_id) FOR UPDATE;
        IF mode='encrypted' THEN RAISE EXCEPTION 'conversation_encryption_required'; END IF;
      END IF;
      -- Ensure and lock the stream before accepting a write, including previously unseen pairs.
      cid := winga_ensure_conversation(NEW.sender_id,NEW.receiver_id);
      SELECT security_mode INTO mode FROM conversation_event_streams WHERE id=cid FOR UPDATE;
      IF mode IS DISTINCT FROM 'legacy-plaintext' THEN RAISE EXCEPTION 'conversation_encryption_required'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;`,
    `DROP TRIGGER IF EXISTS guard_legacy_message ON messages;`,
    `CREATE TRIGGER guard_legacy_message BEFORE INSERT OR UPDATE ON messages
      FOR EACH ROW EXECUTE FUNCTION winga_guard_legacy_message();`
  ])
});
