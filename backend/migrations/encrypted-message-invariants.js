module.exports=Object.freeze({id:'2026100803_encrypted_message_invariants',statements:Object.freeze([
  `LOCK TABLE encrypted_conversation_messages IN SHARE ROW EXCLUSIVE MODE`,
  // No cascading message FK: evidence must survive a privileged canonical-record loss.
  `CREATE TABLE encrypted_message_acceptances (
    message_id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,sender_device TEXT NOT NULL,
    epoch TEXT NOT NULL,sequence BIGINT NOT NULL,hash TEXT NOT NULL,ciphertext_digest TEXT NOT NULL,
    media_id TEXT,accepted_at TIMESTAMPTZ NOT NULL,evidence_source TEXT NOT NULL CHECK(evidence_source IN ('migration-baseline','transaction')),
    UNIQUE(conversation_id,sequence))`,
  `INSERT INTO encrypted_message_acceptances
    SELECT id,conversation_id,sender_device,epoch,sequence,hash,encode(sha256(convert_to(ciphertext,'UTF8')),'hex'),
      media_id,created_at,'migration-baseline' FROM encrypted_conversation_messages`,
  `CREATE TABLE encrypted_message_push_outbox (
    message_id TEXT PRIMARY KEY REFERENCES encrypted_message_acceptances(message_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours')`,
  `CREATE INDEX encrypted_message_push_outbox_due ON encrypted_message_push_outbox(next_attempt_at,created_at,message_id)`,
  `CREATE FUNCTION winga_record_encrypted_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    INSERT INTO encrypted_message_acceptances VALUES(NEW.id,NEW.conversation_id,NEW.sender_device,NEW.epoch,NEW.sequence,NEW.hash,
      encode(sha256(convert_to(NEW.ciphertext,'UTF8')),'hex'),NEW.proof->'payload'->>'mediaId',NEW.created_at,'transaction');
    INSERT INTO encrypted_message_push_outbox(message_id) VALUES(NEW.id);
    RETURN NEW;
  END; $$`,
  `CREATE FUNCTION winga_guard_encrypted_message_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.media_id IS NULL AND NEW.media_id IS NOT NULL
      AND NEW.media_id=OLD.proof->'payload'->>'mediaId'
      AND (to_jsonb(NEW)-'media_id')=(to_jsonb(OLD)-'media_id')
      AND EXISTS(SELECT 1 FROM encrypted_conversation_media a WHERE a.id=NEW.media_id AND a.message_id=OLD.id
        AND a.conversation_id=OLD.conversation_id AND a.uploader_device=OLD.sender_device AND a.status='attached')
      THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'encrypted_message_invariant_violation' USING ERRCODE='23514';
  END; $$`,
  `CREATE FUNCTION winga_guard_encrypted_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'encrypted_message_invariant_violation' USING ERRCODE='23514';
  END; $$`,
  `CREATE TRIGGER record_encrypted_acceptance AFTER INSERT ON encrypted_conversation_messages
    FOR EACH ROW EXECUTE FUNCTION winga_record_encrypted_acceptance()`,
  `CREATE TRIGGER guard_encrypted_message_record BEFORE UPDATE OR DELETE ON encrypted_conversation_messages
    FOR EACH ROW EXECUTE FUNCTION winga_guard_encrypted_message_record()`,
  `CREATE TRIGGER guard_encrypted_message_truncate BEFORE TRUNCATE ON encrypted_conversation_messages
    FOR EACH STATEMENT EXECUTE FUNCTION winga_guard_encrypted_acceptance()`,
  `CREATE TRIGGER guard_encrypted_acceptance BEFORE UPDATE OR DELETE ON encrypted_message_acceptances
    FOR EACH ROW EXECUTE FUNCTION winga_guard_encrypted_acceptance()`,
  `CREATE TRIGGER guard_encrypted_acceptance_truncate BEFORE TRUNCATE ON encrypted_message_acceptances
    FOR EACH STATEMENT EXECUTE FUNCTION winga_guard_encrypted_acceptance()`
])});
