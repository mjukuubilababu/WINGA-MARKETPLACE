module.exports=Object.freeze({id:'2026100701_encrypted_room_sellers',statements:Object.freeze([
  `CREATE TABLE encrypted_room_seller_questions (
    id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES encrypted_shopping_rooms(conversation_id),
    room_epoch TEXT NOT NULL, share_id TEXT NOT NULL REFERENCES encrypted_conversation_messages(id),
    buyer_id TEXT NOT NULL REFERENCES users(username), seller_id TEXT NOT NULL REFERENCES users(username),
    actor_device TEXT NOT NULL REFERENCES conversation_crypto_devices(id), product_id TEXT NOT NULL,
    direct_id TEXT NOT NULL REFERENCES encrypted_conversations(id), question_hash TEXT NOT NULL CHECK(question_hash ~ '^[a-f0-9]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK(buyer_id<>seller_id));`,
  `CREATE INDEX encrypted_room_seller_questions_room ON encrypted_room_seller_questions(room_id,id);`,
  `CREATE TABLE encrypted_room_seller_answers (
    question_id TEXT PRIMARY KEY REFERENCES encrypted_room_seller_questions(id),
    message_id TEXT NOT NULL UNIQUE REFERENCES encrypted_conversation_messages(id),
    answer_hash TEXT NOT NULL CHECK(answer_hash ~ '^[a-f0-9]{64}$'),
    proof JSONB NOT NULL, anchor JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`,
  `CREATE FUNCTION winga_immutable_room_seller_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'Seller disclosure evidence is immutable' USING ERRCODE='23514'; END; $$;`,
  `CREATE TRIGGER immutable_room_seller_question BEFORE UPDATE OR DELETE ON encrypted_room_seller_questions
    FOR EACH ROW EXECUTE FUNCTION winga_immutable_room_seller_record();`,
  `CREATE TRIGGER immutable_room_seller_answer BEFORE UPDATE OR DELETE ON encrypted_room_seller_answers
    FOR EACH ROW EXECUTE FUNCTION winga_immutable_room_seller_record();`
])});
