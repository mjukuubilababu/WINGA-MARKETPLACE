module.exports = Object.freeze({
  id: "2026092802_message_conversation_sequence",
  statements: Object.freeze([
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_sequence BIGINT
      CHECK (conversation_sequence > 0);`,
    `CREATE TABLE IF NOT EXISTS message_conversation_streams (
      participant_low TEXT NOT NULL, participant_high TEXT NOT NULL,
      position BIGINT NOT NULL CHECK (position > 0),
      PRIMARY KEY (participant_low, participant_high)
    );`,
    // Bindings survive message deletion/snapshot restore; they contain no message content.
    `CREATE TABLE IF NOT EXISTS message_conversation_positions (
      message_id TEXT PRIMARY KEY, participant_low TEXT NOT NULL, participant_high TEXT NOT NULL,
      position BIGINT NOT NULL CHECK (position > 0),
      UNIQUE (participant_low, participant_high, position)
    );`,
    `CREATE OR REPLACE FUNCTION winga_assign_message_sequence() RETURNS trigger AS $$
    DECLARE
      low_id TEXT := LEAST(NEW.sender_id, NEW.receiver_id);
      high_id TEXT := GREATEST(NEW.sender_id, NEW.receiver_id);
      binding message_conversation_positions%ROWTYPE;
      next_position BIGINT;
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.id <> NEW.id THEN
        RAISE EXCEPTION 'Message identity cannot change';
      END IF;
      SELECT * INTO binding FROM message_conversation_positions WHERE message_id = NEW.id;
      IF FOUND THEN
        IF binding.participant_low <> low_id OR binding.participant_high <> high_id THEN
          RAISE EXCEPTION 'Message participant binding cannot change';
        END IF;
        NEW.conversation_sequence := binding.position;
        RETURN NEW;
      END IF;
      INSERT INTO message_conversation_streams (participant_low, participant_high, position)
        VALUES (low_id, high_id, 1)
        ON CONFLICT (participant_low, participant_high) DO UPDATE
        SET position = message_conversation_streams.position + 1
        RETURNING position INTO next_position;
      INSERT INTO message_conversation_positions (message_id, participant_low, participant_high, position)
        VALUES (NEW.id, low_id, high_id, next_position);
      NEW.conversation_sequence := next_position;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;`,
    `DROP TRIGGER IF EXISTS winga_message_sequence ON messages;`,
    `CREATE TRIGGER winga_message_sequence BEFORE INSERT OR UPDATE OF id, sender_id, receiver_id, conversation_sequence
      ON messages FOR EACH ROW EXECUTE FUNCTION winga_assign_message_sequence();`,
    // DDL's transaction lock excludes concurrent writes while historical order is reconstructed.
    `DO $$ DECLARE legacy RECORD; BEGIN
      FOR legacy IN SELECT id FROM messages WHERE conversation_sequence IS NULL ORDER BY timestamp, id LOOP
        UPDATE messages SET conversation_sequence = NULL WHERE id = legacy.id;
      END LOOP;
    END $$;`,
    `ALTER TABLE messages ALTER COLUMN conversation_sequence SET NOT NULL;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_sequence
      ON messages (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), conversation_sequence);`
  ])
});
