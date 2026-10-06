module.exports=Object.freeze({
  id:'2026100610_encrypted_shopping_rooms',
  statements:Object.freeze([
    `LOCK TABLE conversation_event_streams, encrypted_conversations, encrypted_conversation_epochs IN SHARE ROW EXCLUSIVE MODE;`,
    `ALTER TABLE conversation_event_streams ADD COLUMN kind TEXT NOT NULL DEFAULT 'direct' CHECK(kind IN ('direct','shopping-room')),
      ALTER COLUMN participant_low DROP NOT NULL, ALTER COLUMN participant_high DROP NOT NULL;`,
    `ALTER TABLE conversation_event_streams ADD CONSTRAINT conversation_stream_shape CHECK(
      (kind='direct' AND participant_low IS NOT NULL AND participant_high IS NOT NULL AND participant_low<participant_high)
      OR (kind='shopping-room' AND participant_low IS NULL AND participant_high IS NULL AND security_mode='encrypted'));`,
    `CREATE OR REPLACE FUNCTION winga_guard_conversation_security_mode() RETURNS trigger AS $$ BEGIN
      IF TG_OP='DELETE' THEN
        IF OLD.security_mode='encrypted' THEN RAISE EXCEPTION 'conversation_security_mode_immutable'; END IF;
        RETURN OLD;
      END IF;
      IF NEW.kind IS DISTINCT FROM OLD.kind OR (OLD.security_mode='encrypted' AND
        (NEW.security_mode IS DISTINCT FROM OLD.security_mode OR NEW.id IS DISTINCT FROM OLD.id
          OR NEW.participant_low IS DISTINCT FROM OLD.participant_low OR NEW.participant_high IS DISTINCT FROM OLD.participant_high))
        THEN RAISE EXCEPTION 'conversation_security_mode_immutable'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;`,
    `ALTER TABLE encrypted_conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'direct' CHECK(kind IN ('direct','shopping-room')),
      ALTER COLUMN recipient DROP NOT NULL, ALTER COLUMN recipient_device DROP NOT NULL,
      ALTER COLUMN source_hash DROP NOT NULL, ALTER COLUMN target_hash DROP NOT NULL;`,
    `ALTER TABLE encrypted_conversations ADD CONSTRAINT encrypted_conversation_shape CHECK(
      (kind='direct' AND recipient IS NOT NULL AND recipient_device IS NOT NULL AND source_hash IS NOT NULL AND target_hash IS NOT NULL AND creator<>recipient)
      OR (kind='shopping-room' AND recipient IS NULL AND recipient_device IS NULL AND source_hash IS NULL AND target_hash IS NULL));`,
    `ALTER TABLE encrypted_conversation_epochs ALTER COLUMN creator_device DROP NOT NULL, ALTER COLUMN recipient_device DROP NOT NULL;`,
    `CREATE TABLE encrypted_shopping_rooms (
      conversation_id TEXT PRIMARY KEY REFERENCES encrypted_conversations(id), name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
      revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`,
    `CREATE TABLE encrypted_room_transitions (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES encrypted_shopping_rooms(conversation_id),
      previous_epoch TEXT NOT NULL CHECK(previous_epoch ~ '^(0|[1-9][0-9]{0,18})$'),
      epoch TEXT NOT NULL, revision BIGINT NOT NULL, actor_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      intent TEXT NOT NULL, source_hash TEXT, reservation_proof JSONB NOT NULL,
      transfer JSONB, transfer_hash TEXT, transfer_proof JSONB,
      status TEXT NOT NULL CHECK(status IN ('reserved','pending','accepted')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(conversation_id,previous_epoch), UNIQUE(conversation_id,revision), CHECK(epoch::numeric=previous_epoch::numeric+1));`,
    `CREATE TABLE encrypted_room_acceptances (
      transition_id TEXT NOT NULL REFERENCES encrypted_room_transitions(id), device_id TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      owner_id TEXT NOT NULL REFERENCES users(username), signature TEXT NOT NULL, proof JSONB NOT NULL,
      PRIMARY KEY(transition_id,device_id));`,
    `CREATE TABLE encrypted_room_epochs (
      conversation_id TEXT NOT NULL REFERENCES encrypted_shopping_rooms(conversation_id), epoch TEXT NOT NULL,
      roster TEXT NOT NULL, roles TEXT NOT NULL, transfer_hash TEXT NOT NULL, revision BIGINT NOT NULL,
      PRIMARY KEY(conversation_id,epoch));`,
    `CREATE OR REPLACE FUNCTION winga_guard_encrypted_epoch_device() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Encrypted epoch membership is immutable' USING ERRCODE='23514'; END IF;
      IF NOT EXISTS(SELECT 1 FROM conversation_crypto_devices d JOIN encrypted_conversations g ON g.id=NEW.conversation_id
        WHERE d.id=NEW.device_id AND d.owner_id=NEW.owner_id AND (
          (g.kind='direct' AND NEW.owner_id IN (g.creator,g.recipient)) OR (g.kind='shopping-room' AND EXISTS(
            SELECT 1 FROM encrypted_room_epochs e, jsonb_array_elements(e.roster::jsonb) m WHERE e.conversation_id=g.id
              AND e.epoch=NEW.epoch AND m->>'id'=NEW.device_id AND m->>'owner'=NEW.owner_id))))
        THEN RAISE EXCEPTION 'Encrypted epoch device owner rejected' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END; $$;`,
    `CREATE FUNCTION winga_guard_room_epoch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'Room epoch evidence is immutable' USING ERRCODE='23514';
    END; $$;`,
    `CREATE TRIGGER immutable_room_epoch BEFORE UPDATE OR DELETE ON encrypted_room_epochs FOR EACH ROW EXECUTE FUNCTION winga_guard_room_epoch();`,
    `CREATE FUNCTION winga_guard_encrypted_group_kind() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.kind IS DISTINCT FROM OLD.kind OR NEW.id IS DISTINCT FROM OLD.id OR NEW.canonical_id IS DISTINCT FROM OLD.canonical_id
        THEN RAISE EXCEPTION 'Encrypted conversation identity is immutable' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END; $$;`,
    `CREATE TRIGGER immutable_encrypted_group_kind BEFORE UPDATE ON encrypted_conversations FOR EACH ROW EXECUTE FUNCTION winga_guard_encrypted_group_kind();`,
    `CREATE FUNCTION winga_guard_encrypted_epoch_shape() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Encrypted epoch evidence is immutable' USING ERRCODE='23514'; END IF;
      IF NOT EXISTS(SELECT 1 FROM encrypted_conversations g WHERE g.id=NEW.conversation_id AND (
        (g.kind='direct' AND NEW.creator_device IS NOT NULL AND NEW.recipient_device IS NOT NULL AND NEW.creator_device<>NEW.recipient_device)
        OR (g.kind='shopping-room' AND NEW.creator_device IS NULL AND NEW.recipient_device IS NULL AND EXISTS(
          SELECT 1 FROM encrypted_room_epochs e WHERE e.conversation_id=g.id AND e.epoch=NEW.epoch))))
        THEN RAISE EXCEPTION 'Encrypted epoch shape rejected' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END; $$;`,
    `CREATE TRIGGER guard_encrypted_epoch_shape BEFORE INSERT OR UPDATE OR DELETE ON encrypted_conversation_epochs
      FOR EACH ROW EXECUTE FUNCTION winga_guard_encrypted_epoch_shape();`,
    `CREATE FUNCTION winga_guard_room_transition() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Room transition evidence is immutable' USING ERRCODE='23514'; END IF;
      IF ROW(NEW.id,NEW.conversation_id,NEW.previous_epoch,NEW.epoch,NEW.revision,NEW.actor_device,NEW.intent,NEW.source_hash,NEW.reservation_proof,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id,OLD.conversation_id,OLD.previous_epoch,OLD.epoch,OLD.revision,OLD.actor_device,OLD.intent,OLD.source_hash,OLD.reservation_proof,OLD.created_at)
        OR (OLD.transfer IS NOT NULL AND ROW(NEW.transfer,NEW.transfer_hash,NEW.transfer_proof) IS DISTINCT FROM ROW(OLD.transfer,OLD.transfer_hash,OLD.transfer_proof))
        OR NOT(NEW.status=OLD.status OR (OLD.status='reserved' AND NEW.status='pending') OR (OLD.status='pending' AND NEW.status='accepted'))
        THEN RAISE EXCEPTION 'Room transition evidence is immutable' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END; $$;`,
    `ALTER TABLE encrypted_room_transitions ADD CONSTRAINT room_transition_shape CHECK(
      (status='reserved' AND transfer IS NULL AND transfer_hash IS NULL AND transfer_proof IS NULL)
      OR (status IN ('pending','accepted') AND transfer IS NOT NULL AND transfer_hash ~ '^[a-f0-9]{64}$' AND transfer_proof IS NOT NULL));`,
    `CREATE TRIGGER guard_room_transition BEFORE UPDATE OR DELETE ON encrypted_room_transitions FOR EACH ROW EXECUTE FUNCTION winga_guard_room_transition();`,
    `CREATE TRIGGER immutable_room_acceptance BEFORE UPDATE OR DELETE ON encrypted_room_acceptances FOR EACH ROW EXECUTE FUNCTION winga_guard_room_epoch();`
  ])
});
