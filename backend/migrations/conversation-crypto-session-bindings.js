module.exports = Object.freeze({
  id: '2026100804_crypto_session_bindings',
  statements: Object.freeze([
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_crypto_binding_identity
      ON sessions(token,session_id,username);`,
    // Existing native session IDs do not prove crypto identity; require signed re-enrollment.
    `CREATE TABLE IF NOT EXISTS conversation_crypto_session_bindings (
      session_id TEXT PRIMARY KEY CHECK(session_id<>''),
      session_token TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      crypto_device_id TEXT NOT NULL REFERENCES conversation_crypto_devices(id) ON DELETE CASCADE,
      FOREIGN KEY(session_token,session_id,owner_id)
        REFERENCES sessions(token,session_id,username) ON DELETE CASCADE ON UPDATE CASCADE
    );`
  ])
});
