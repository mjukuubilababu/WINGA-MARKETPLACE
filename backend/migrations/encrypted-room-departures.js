module.exports=Object.freeze({id:'2026100801_encrypted_room_departures',statements:Object.freeze([
  `LOCK TABLE encrypted_shopping_rooms IN SHARE ROW EXCLUSIVE MODE;`,
  `CREATE TABLE encrypted_room_departures (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES encrypted_shopping_rooms(conversation_id),
    owner_id TEXT NOT NULL REFERENCES users(username), actor_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
    epoch TEXT NOT NULL CHECK(epoch ~ '^[1-9][0-9]{0,18}$'), revision BIGINT NOT NULL CHECK(revision>0), proof JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
    transition_id TEXT REFERENCES encrypted_room_transitions(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ,
    CHECK((status='pending' AND completed_at IS NULL AND transition_id IS NULL) OR (status='completed' AND completed_at IS NOT NULL))
  );`,
  `CREATE UNIQUE INDEX one_pending_room_departure ON encrypted_room_departures(conversation_id,owner_id) WHERE status='pending';`,
  `CREATE INDEX room_departures_scope ON encrypted_room_departures(conversation_id,status,epoch);`,
  `CREATE FUNCTION winga_guard_room_departure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Room departure evidence is immutable' USING ERRCODE='23514'; END IF;
    IF ROW(NEW.id,NEW.conversation_id,NEW.owner_id,NEW.actor_device,NEW.epoch,NEW.revision,NEW.proof,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.conversation_id,OLD.owner_id,OLD.actor_device,OLD.epoch,OLD.revision,OLD.proof,OLD.created_at)
      OR OLD.status='completed' OR NEW.status<>'completed'
      THEN RAISE EXCEPTION 'Room departure evidence is immutable' USING ERRCODE='23514'; END IF;
    IF NEW.transition_id IS NULL OR NOT EXISTS(SELECT 1 FROM encrypted_room_transitions t
      WHERE t.id=NEW.transition_id AND t.conversation_id=NEW.conversation_id AND t.status='accepted'
        AND t.previous_epoch=NEW.epoch AND t.revision=NEW.revision+1
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements((t.intent::jsonb->>'roster')::jsonb) m WHERE m->>'owner'=NEW.owner_id))
      THEN RAISE EXCEPTION 'Room departure completion requires an accepted removal' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END; $$;`,
  `CREATE TRIGGER guard_room_departure BEFORE UPDATE OR DELETE ON encrypted_room_departures FOR EACH ROW EXECUTE FUNCTION winga_guard_room_departure();`,
  `CREATE FUNCTION winga_guard_room_departure_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    PERFORM 1 FROM encrypted_conversations WHERE id=NEW.conversation_id AND kind='shopping-room' FOR SHARE;
    IF FOUND AND (EXISTS(SELECT 1 FROM encrypted_room_departures d JOIN encrypted_conversations g ON g.id=d.conversation_id
        WHERE d.conversation_id=NEW.conversation_id AND (d.status='pending' OR (d.status='completed' AND d.transition_id IS NULL AND d.epoch=g.epoch)))
      OR EXISTS(SELECT 1 FROM encrypted_room_transitions t WHERE t.conversation_id=NEW.conversation_id AND t.status<>'accepted'))
      THEN RAISE EXCEPTION 'Room membership is frozen' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END; $$;`,
  `CREATE TRIGGER guard_room_departure_message BEFORE INSERT ON encrypted_conversation_messages FOR EACH ROW EXECUTE FUNCTION winga_guard_room_departure_message();`
])});
