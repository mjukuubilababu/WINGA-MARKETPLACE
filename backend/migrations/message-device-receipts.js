module.exports = Object.freeze({
  id: "2026092803_message_device_receipts",
  statements: Object.freeze([
    // Deliberately independent of snapshot-rewritten messages and sessions.
    `CREATE TABLE IF NOT EXISTS message_device_receipts (
      message_id TEXT NOT NULL, device_id TEXT NOT NULL,
      sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL,
      stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ,
      PRIMARY KEY(message_id, device_id), CHECK(sender_id <> receiver_id),
      CHECK(read_at IS NULL OR read_at >= stored_at)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_message_device_receipts_owner
      ON message_device_receipts(receiver_id, device_id);`,
    `CREATE OR REPLACE FUNCTION preserve_message_device_receipts() RETURNS trigger AS $$
      DECLARE stored TIMESTAMPTZ; seen TIMESTAMPTZ;
      BEGIN
        SELECT MIN(stored_at), MIN(read_at) INTO stored, seen FROM message_device_receipts
          WHERE message_id = NEW.id AND sender_id = NEW.sender_id AND receiver_id = NEW.receiver_id;
        IF stored IS NOT NULL THEN
          NEW.is_delivered := TRUE;
          NEW.delivered_at := COALESCE(NEW.delivered_at, stored);
        END IF;
        IF seen IS NOT NULL THEN
          NEW.is_read := TRUE;
          NEW.read_at := COALESCE(NEW.read_at, seen);
        END IF;
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql;`,
    `DROP TRIGGER IF EXISTS preserve_message_device_receipts ON messages;`,
    `CREATE TRIGGER preserve_message_device_receipts BEFORE INSERT OR UPDATE ON messages
      FOR EACH ROW EXECUTE FUNCTION preserve_message_device_receipts();`
  ])
});
