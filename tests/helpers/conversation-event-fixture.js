module.exports = `CREATE TABLE users(username TEXT PRIMARY KEY,status TEXT DEFAULT 'active');
  INSERT INTO users(username) VALUES ('alice'),('bob'),('eve');
  CREATE TABLE sessions(token TEXT PRIMARY KEY,username TEXT,session_id TEXT UNIQUE,expires_at BIGINT);
  INSERT INTO sessions VALUES ('a','alice','a',9999999999999),('b1','bob','b1',9999999999999),
    ('b2','bob','b2',9999999999999),('e','eve','e',9999999999999);
  CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT,PRIMARY KEY(blocker_username,blocked_username));
  CREATE TABLE api_rate_limit_buckets(key_hash TEXT NOT NULL,bucket_id BIGINT NOT NULL,scope TEXT NOT NULL DEFAULT '',
    count INTEGER NOT NULL DEFAULT 0,window_started_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(key_hash,bucket_id));
  CREATE TABLE messages(id TEXT PRIMARY KEY,sender_id TEXT,receiver_id TEXT,conversation_id TEXT DEFAULT '',
    conversation_sequence BIGINT DEFAULT 1,message TEXT DEFAULT 'private text',message_type TEXT DEFAULT 'text',
    product_id TEXT DEFAULT '',product_name TEXT DEFAULT '',product_items JSONB DEFAULT '[]',reply_to_message_id TEXT DEFAULT '',
    timestamp TIMESTAMPTZ DEFAULT NOW(),is_read BOOLEAN DEFAULT FALSE,is_delivered BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,delivered_at TIMESTAMPTZ);
  CREATE TABLE message_device_receipts(message_id TEXT,device_id TEXT,sender_id TEXT,receiver_id TEXT,
    stored_at TIMESTAMPTZ DEFAULT NOW(),read_at TIMESTAMPTZ,PRIMARY KEY(message_id,device_id));
  INSERT INTO messages(id,sender_id,receiver_id) VALUES ('legacy','alice','bob');`;
