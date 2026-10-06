module.exports = Object.freeze({
  id: '2026100605_encrypted_device_delivery',
  statements: Object.freeze([
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_epoch_devices (
      conversation_id TEXT NOT NULL, epoch TEXT NOT NULL,
      device_id TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      owner_id TEXT NOT NULL REFERENCES users(username),
      PRIMARY KEY(conversation_id,epoch,device_id),
      FOREIGN KEY(conversation_id,epoch) REFERENCES encrypted_conversation_epochs(conversation_id,epoch)
    );`,
    `CREATE OR REPLACE FUNCTION winga_guard_encrypted_epoch_device() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP<>'INSERT' THEN
          RAISE EXCEPTION 'Encrypted epoch membership is immutable' USING ERRCODE='23514';
        END IF;
        IF NOT EXISTS(SELECT 1 FROM conversation_crypto_devices d JOIN encrypted_conversations g
          ON g.id=NEW.conversation_id WHERE d.id=NEW.device_id AND d.owner_id=NEW.owner_id
          AND NEW.owner_id IN (g.creator,g.recipient)) THEN
          RAISE EXCEPTION 'Encrypted epoch device owner rejected' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END;
    $$;`,
    `DROP TRIGGER IF EXISTS guard_encrypted_epoch_device ON encrypted_conversation_epoch_devices;`,
    `CREATE TRIGGER guard_encrypted_epoch_device BEFORE INSERT OR UPDATE OR DELETE
      ON encrypted_conversation_epoch_devices FOR EACH ROW EXECUTE FUNCTION winga_guard_encrypted_epoch_device();`,
    `CREATE OR REPLACE FUNCTION winga_seed_encrypted_epoch_devices() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO encrypted_conversation_epoch_devices(conversation_id,epoch,device_id,owner_id)
          SELECT NEW.conversation_id,NEW.epoch,d.id,d.owner_id FROM conversation_crypto_devices d
          WHERE d.id IN (NEW.creator_device,NEW.recipient_device) ON CONFLICT DO NOTHING;
        RETURN NEW;
      END;
    $$;`,
    `DROP TRIGGER IF EXISTS seed_encrypted_epoch_devices ON encrypted_conversation_epochs;`,
    `CREATE TRIGGER seed_encrypted_epoch_devices AFTER INSERT ON encrypted_conversation_epochs
      FOR EACH ROW EXECUTE FUNCTION winga_seed_encrypted_epoch_devices();`,
    `INSERT INTO encrypted_conversation_epoch_devices(conversation_id,epoch,device_id,owner_id)
      SELECT e.conversation_id,e.epoch,d.id,d.owner_id FROM encrypted_conversation_epochs e
      JOIN conversation_crypto_devices d ON d.id IN (e.creator_device,e.recipient_device) ON CONFLICT DO NOTHING;`,
    `CREATE TABLE IF NOT EXISTS encrypted_conversation_receipt_acks (
      message_id TEXT NOT NULL, receipt_device TEXT NOT NULL, kind TEXT NOT NULL,
      observer_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id),
      proof JSONB NOT NULL, acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(message_id,receipt_device,kind,observer_device),
      FOREIGN KEY(message_id,receipt_device,kind) REFERENCES encrypted_conversation_receipts(message_id,device_id,kind)
    );`,
    // Legacy ACKs were authorized only for the actual sender, never all of its devices.
    `INSERT INTO encrypted_conversation_receipt_acks(message_id,receipt_device,kind,observer_device,proof,acknowledged_at)
      SELECT r.message_id,r.device_id,r.kind,m.sender_device,'{"legacy":true}'::jsonb,r.sender_ack_at
      FROM encrypted_conversation_receipts r JOIN encrypted_conversation_messages m ON m.id=r.message_id
      WHERE r.sender_ack_at IS NOT NULL ON CONFLICT DO NOTHING;`
  ])
});
