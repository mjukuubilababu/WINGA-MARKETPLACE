module.exports = Object.freeze({
  id: "2026092805_conversation_event_ledger",
  statements: Object.freeze([
    // Hold writers across backfill and trigger installation so no mutation falls between them.
    `LOCK TABLE sessions, user_blocks, messages, message_device_receipts IN SHARE ROW EXCLUSIVE MODE;`,
    `CREATE TABLE IF NOT EXISTS conversation_event_streams (
      id TEXT PRIMARY KEY, participant_low TEXT NOT NULL, participant_high TEXT NOT NULL,
      position BIGINT NOT NULL DEFAULT 0 CHECK(position>=0),
      membership_version BIGINT NOT NULL DEFAULT 1 CHECK(membership_version>0),
      blocked BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE(participant_low,participant_high), CHECK(participant_low<participant_high)
    );`,
    `CREATE TABLE IF NOT EXISTS conversation_event_members (
      conversation_id TEXT NOT NULL REFERENCES conversation_event_streams(id),
      owner_id TEXT NOT NULL, joined_position BIGINT NOT NULL DEFAULT 1,
      PRIMARY KEY(conversation_id,owner_id)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_event_members_owner ON conversation_event_members(owner_id,conversation_id);`,
    `CREATE TABLE IF NOT EXISTS conversation_events (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversation_event_streams(id),
      position BIGINT NOT NULL CHECK(position>0), membership_version BIGINT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('membership_initialized','access_changed','message_imported',
        'message_created','message_edited','message_deleted','message_state_changed','device_stored','device_read')),
      message_id TEXT, actor_id TEXT NOT NULL, revision BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(conversation_id,position)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_events_message ON conversation_events(message_id,position);`,
    // Independent from the legacy snapshot tables: deletion must not erase evidence.
    `CREATE TABLE IF NOT EXISTS conversation_message_state (
      message_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversation_event_streams(id),
      sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL, digest TEXT NOT NULL,
      revision BIGINT NOT NULL CHECK(revision>0), deleted BOOLEAN NOT NULL DEFAULT FALSE
    );`,
    `CREATE TABLE IF NOT EXISTS conversation_delivery_devices (
      device_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    );`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_delivery_devices_owner ON conversation_delivery_devices(owner_id) WHERE revoked_at IS NULL;`,
    `CREATE TABLE IF NOT EXISTS conversation_device_deliveries (
      device_id TEXT NOT NULL REFERENCES conversation_delivery_devices(device_id),
      event_id TEXT NOT NULL REFERENCES conversation_events(id), owner_id TEXT NOT NULL,
      offered_at TIMESTAMPTZ, attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
      acknowledged_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ,
      PRIMARY KEY(device_id,event_id)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_conversation_device_pending ON conversation_device_deliveries(device_id,event_id)
      WHERE acknowledged_at IS NULL AND cancelled_at IS NULL;`,
    `CREATE OR REPLACE FUNCTION winga_append_conversation_event(cid TEXT, event_kind TEXT, mid TEXT, actor TEXT, rev BIGINT)
      RETURNS TEXT AS $$ DECLARE seq BIGINT; mv BIGINT; eid TEXT; BEGIN
      UPDATE conversation_event_streams SET position=position+1 WHERE id=cid
        RETURNING position,membership_version INTO seq,mv;
      IF NOT FOUND THEN RAISE EXCEPTION 'Conversation stream missing'; END IF;
      eid := cid || ':' || seq::text;
      INSERT INTO conversation_events(id,conversation_id,position,membership_version,kind,message_id,actor_id,revision)
        VALUES(eid,cid,seq,mv,event_kind,mid,actor,rev);
      INSERT INTO conversation_device_deliveries(device_id,event_id,owner_id)
        SELECT d.device_id,eid,d.owner_id FROM conversation_delivery_devices d
        JOIN conversation_event_members m ON m.owner_id=d.owner_id AND m.conversation_id=cid
        JOIN sessions s ON s.session_id=d.device_id AND s.username=d.owner_id
        JOIN users u ON u.username=d.owner_id AND u.status='active'
        WHERE d.revoked_at IS NULL AND s.expires_at>(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint
        ON CONFLICT DO NOTHING;
      PERFORM pg_notify('winga_messages',json_build_object('version',1,'type','message_state_changed',
        'owners',(SELECT json_agg(owner_id ORDER BY owner_id) FROM conversation_event_members WHERE conversation_id=cid))::text);
      RETURN eid;
    END; $$ LANGUAGE plpgsql;`,
    `CREATE OR REPLACE FUNCTION winga_ensure_conversation(a TEXT,b TEXT) RETURNS TEXT AS $$
      DECLARE lo TEXT := LEAST(a,b); hi TEXT := GREATEST(a,b); cid TEXT; fresh BOOLEAN; BEGIN
      IF a=b THEN RAISE EXCEPTION 'Direct conversation requires two participants'; END IF;
      cid := md5(jsonb_build_array(lo,hi)::text);
      INSERT INTO conversation_event_streams(id,participant_low,participant_high,blocked)
        VALUES(cid,lo,hi,EXISTS(SELECT 1 FROM user_blocks WHERE
          (blocker_username=lo AND blocked_username=hi) OR (blocker_username=hi AND blocked_username=lo)))
        ON CONFLICT(participant_low,participant_high) DO NOTHING;
      fresh := FOUND;
      IF fresh THEN
        INSERT INTO conversation_event_members(conversation_id,owner_id) VALUES(cid,lo),(cid,hi);
        PERFORM winga_append_conversation_event(cid,'membership_initialized',NULL,lo,0);
      END IF;
      RETURN cid;
    END; $$ LANGUAGE plpgsql;`,
    `CREATE OR REPLACE FUNCTION winga_message_event_digest(m messages) RETURNS TEXT AS $$
      SELECT md5(jsonb_build_array(m.sender_id,m.receiver_id,m.message,m.message_type,m.product_id,
        m.product_name,m.product_items,m.reply_to_message_id)::text);
    $$ LANGUAGE SQL IMMUTABLE;`,
    `CREATE OR REPLACE FUNCTION winga_capture_message_event() RETURNS trigger AS $$
      DECLARE cid TEXT; digest_value TEXT; state conversation_message_state%ROWTYPE; rev BIGINT; BEGIN
      IF TG_OP='DELETE' THEN
        IF current_setting('winga.snapshot_restore',true)='on' THEN RETURN OLD; END IF;
        SELECT * INTO state FROM conversation_message_state WHERE message_id=OLD.id FOR UPDATE;
        IF FOUND AND NOT state.deleted THEN
          UPDATE conversation_message_state SET deleted=TRUE,revision=revision+1 WHERE message_id=OLD.id RETURNING revision INTO rev;
          PERFORM winga_append_conversation_event(state.conversation_id,'message_deleted',OLD.id,OLD.sender_id,rev);
        END IF;
        RETURN OLD;
      END IF;
      cid := winga_ensure_conversation(NEW.sender_id,NEW.receiver_id);
      digest_value := winga_message_event_digest(NEW);
      SELECT * INTO state FROM conversation_message_state WHERE message_id=NEW.id FOR UPDATE;
      IF FOUND THEN
        IF state.deleted OR state.sender_id<>NEW.sender_id OR state.receiver_id<>NEW.receiver_id THEN
          RAISE EXCEPTION 'Message event identity is immutable';
        END IF;
        IF current_setting('winga.snapshot_restore',true)='on' AND state.digest<>digest_value THEN
          RAISE EXCEPTION 'Snapshot would overwrite a message revision';
        END IF;
        IF state.digest<>digest_value THEN
          UPDATE conversation_message_state SET digest=digest_value,revision=revision+1 WHERE message_id=NEW.id RETURNING revision INTO rev;
          PERFORM winga_append_conversation_event(cid,'message_edited',NEW.id,NEW.sender_id,rev);
        ELSIF TG_OP='UPDATE' AND (OLD.is_read IS DISTINCT FROM NEW.is_read OR OLD.is_delivered IS DISTINCT FROM NEW.is_delivered)
          AND current_setting('winga.snapshot_restore',true) IS DISTINCT FROM 'on' THEN
          PERFORM winga_append_conversation_event(cid,'message_state_changed',NEW.id,NEW.receiver_id,state.revision);
        END IF;
      ELSE
        INSERT INTO conversation_message_state(message_id,conversation_id,sender_id,receiver_id,digest,revision)
          VALUES(NEW.id,cid,NEW.sender_id,NEW.receiver_id,digest_value,1);
        PERFORM winga_append_conversation_event(cid,'message_created',NEW.id,NEW.sender_id,1);
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;`,
    // Backfill current history only; do not invent past edits, reads or deletions.
    `DO $$ DECLARE m messages%ROWTYPE; cid TEXT; BEGIN
      FOR m IN SELECT * FROM messages ORDER BY timestamp,id LOOP
        cid := winga_ensure_conversation(m.sender_id,m.receiver_id);
        INSERT INTO conversation_message_state(message_id,conversation_id,sender_id,receiver_id,digest,revision)
          VALUES(m.id,cid,m.sender_id,m.receiver_id,winga_message_event_digest(m),1) ON CONFLICT DO NOTHING;
        IF FOUND THEN PERFORM winga_append_conversation_event(cid,'message_imported',m.id,m.sender_id,1); END IF;
      END LOOP;
    END $$;`,
    `DROP TRIGGER IF EXISTS capture_conversation_message ON messages;`,
    `CREATE TRIGGER capture_conversation_message AFTER INSERT OR UPDATE OR DELETE ON messages
      FOR EACH ROW EXECUTE FUNCTION winga_capture_message_event();`,
    `CREATE OR REPLACE FUNCTION winga_capture_device_receipt_event() RETURNS trigger AS $$
      DECLARE state conversation_message_state%ROWTYPE; BEGIN
      SELECT * INTO state FROM conversation_message_state WHERE message_id=NEW.message_id;
      IF NOT FOUND OR state.deleted THEN RETURN NEW; END IF;
      IF TG_OP='INSERT' THEN
        PERFORM winga_append_conversation_event(state.conversation_id,'device_stored',NEW.message_id,NEW.receiver_id,state.revision);
      ELSIF OLD.read_at IS NULL AND NEW.read_at IS NOT NULL THEN
        PERFORM winga_append_conversation_event(state.conversation_id,'device_read',NEW.message_id,NEW.receiver_id,state.revision);
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;`,
    `DROP TRIGGER IF EXISTS capture_conversation_receipt ON message_device_receipts;`,
    `CREATE TRIGGER capture_conversation_receipt AFTER INSERT OR UPDATE ON message_device_receipts
      FOR EACH ROW EXECUTE FUNCTION winga_capture_device_receipt_event();`,
    `CREATE OR REPLACE FUNCTION winga_capture_conversation_access() RETURNS trigger AS $$
      DECLARE a TEXT; b TEXT; cid TEXT; now_blocked BOOLEAN; BEGIN
      IF current_setting('winga.snapshot_restore',true)='on' THEN RETURN NULL; END IF;
      IF TG_OP='DELETE' THEN a:=OLD.blocker_username; b:=OLD.blocked_username;
      ELSE a:=NEW.blocker_username; b:=NEW.blocked_username; END IF;
      SELECT id INTO cid FROM conversation_event_streams WHERE participant_low=LEAST(a,b) AND participant_high=GREATEST(a,b) FOR UPDATE;
      IF NOT FOUND THEN RETURN NULL; END IF;
      now_blocked := EXISTS(SELECT 1 FROM user_blocks WHERE
        (blocker_username=a AND blocked_username=b) OR (blocker_username=b AND blocked_username=a));
      UPDATE conversation_event_streams SET blocked=now_blocked,membership_version=membership_version+1
        WHERE id=cid AND blocked IS DISTINCT FROM now_blocked;
      IF FOUND THEN PERFORM winga_append_conversation_event(cid,'access_changed',NULL,a,0); END IF;
      RETURN NULL;
    END; $$ LANGUAGE plpgsql;`,
    `DROP TRIGGER IF EXISTS capture_conversation_access ON user_blocks;`,
    `CREATE TRIGGER capture_conversation_access AFTER INSERT OR DELETE ON user_blocks
      FOR EACH ROW EXECUTE FUNCTION winga_capture_conversation_access();`,
    `CREATE OR REPLACE FUNCTION winga_revoke_delivery_device() RETURNS trigger AS $$ BEGIN
      IF current_setting('winga.snapshot_restore',true)='on' THEN RETURN OLD; END IF;
      UPDATE conversation_delivery_devices SET revoked_at=COALESCE(revoked_at,NOW()) WHERE device_id=OLD.session_id;
      UPDATE conversation_device_deliveries SET cancelled_at=COALESCE(cancelled_at,NOW())
        WHERE device_id=OLD.session_id AND acknowledged_at IS NULL;
      RETURN OLD;
    END; $$ LANGUAGE plpgsql;`,
    `DROP TRIGGER IF EXISTS revoke_conversation_delivery_device ON sessions;`,
    `CREATE TRIGGER revoke_conversation_delivery_device AFTER DELETE ON sessions
      FOR EACH ROW EXECUTE FUNCTION winga_revoke_delivery_device();`,
    `CREATE OR REPLACE FUNCTION winga_reconcile_conversation_snapshot() RETURNS void AS $$
      DECLARE s RECORD; now_blocked BOOLEAN; BEGIN
      FOR s IN SELECT * FROM conversation_message_state x WHERE NOT x.deleted AND NOT EXISTS(
        SELECT 1 FROM messages m WHERE m.id=x.message_id) ORDER BY x.conversation_id,x.message_id FOR UPDATE LOOP
        UPDATE conversation_message_state SET deleted=TRUE,revision=revision+1 WHERE message_id=s.message_id;
        PERFORM winga_append_conversation_event(s.conversation_id,'message_deleted',s.message_id,s.sender_id,s.revision+1);
      END LOOP;
      FOR s IN SELECT * FROM conversation_event_streams ORDER BY id FOR UPDATE LOOP
        now_blocked := EXISTS(SELECT 1 FROM user_blocks WHERE
          (blocker_username=s.participant_low AND blocked_username=s.participant_high)
          OR (blocker_username=s.participant_high AND blocked_username=s.participant_low));
        IF s.blocked IS DISTINCT FROM now_blocked THEN
          UPDATE conversation_event_streams SET blocked=now_blocked,membership_version=membership_version+1 WHERE id=s.id;
          PERFORM winga_append_conversation_event(s.id,'access_changed',NULL,s.participant_low,0);
        END IF;
      END LOOP;
      UPDATE conversation_delivery_devices d SET revoked_at=NOW() WHERE d.revoked_at IS NULL AND NOT EXISTS(
        SELECT 1 FROM sessions live_session WHERE live_session.session_id=d.device_id AND live_session.username=d.owner_id
        AND live_session.expires_at>(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint);
      UPDATE conversation_device_deliveries d SET cancelled_at=NOW() WHERE d.acknowledged_at IS NULL AND d.cancelled_at IS NULL
        AND EXISTS(SELECT 1 FROM conversation_delivery_devices v WHERE v.device_id=d.device_id AND v.revoked_at IS NOT NULL);
    END; $$ LANGUAGE plpgsql;`,
    `CREATE OR REPLACE FUNCTION winga_reject_event_rewrite() RETURNS trigger AS $$ BEGIN
      RAISE EXCEPTION 'Conversation events are append-only';
    END; $$ LANGUAGE plpgsql;`,
    `DROP TRIGGER IF EXISTS immutable_conversation_event ON conversation_events;`,
    `CREATE TRIGGER immutable_conversation_event BEFORE UPDATE OR DELETE ON conversation_events
      FOR EACH ROW EXECUTE FUNCTION winga_reject_event_rewrite();`
  ])
});
