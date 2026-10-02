const { validateRevision, validateCapsule, failure } = require('./encrypted-content-contract');

function createEncryptedConversationBackupStore({ withTransaction, now = Date.now }) {
  async function authenticated(client, context) {
    if (!context?.owner || !context.token || !context.deviceId) throw failure(401, 'backup_unauthorized');
    // Serialize one owner's revisions and order writes against session/account revocation.
    const result = await client.query(`SELECT s.session_id FROM sessions s JOIN users u ON u.username=s.username
      WHERE s.token=$1 AND s.username=$2 AND s.session_id=$3 AND s.expires_at>$4 AND u.status='active'
      FOR SHARE OF s FOR UPDATE OF u`, [context.token, context.owner, context.deviceId, now()]);
    if (!result.rows.length) throw failure(401, 'backup_unauthorized');
  }
  async function current(client, owner) {
    const result = await client.query(`SELECT revision::text, capsule
      FROM encrypted_conversation_backups WHERE owner_id=$1 FOR UPDATE`, [owner]);
    return result.rows[0] || { revision: '0', capsule: null };
  }
  function view(row) { return { version: 1, revision: row.revision, capsule: row.capsule }; }
  async function readEncryptedConversationBackup(context) {
    return withTransaction(async client => {
      await authenticated(client, context);
      return view(await current(client, context.owner));
    });
  }
  async function writeEncryptedConversationBackup(context, payload) {
    if (!payload || Object.keys(payload).length !== 2
      || !Object.hasOwn(payload, 'capsule') || !Object.hasOwn(payload, 'expectedRevision')) {
      throw failure(400, 'invalid_encrypted_backup');
    }
    const expected = validateRevision(payload.expectedRevision);
    const capsule = validateCapsule(payload.capsule, context?.owner, expected);
    return withTransaction(async client => {
      await authenticated(client, context);
      const previous = await current(client, context.owner);
      if (previous.revision !== expected) {
        // An ambiguous response may be retried, but only the exact accepted capsule is idempotent.
        if (previous.revision === String(Number(expected) + 1)
          && previous.capsule && JSON.stringify(validateCapsule(previous.capsule, context.owner, expected))
            === JSON.stringify(capsule)) return view(previous);
        throw failure(409, 'backup_revision_conflict');
      }
      const result = await client.query(`INSERT INTO encrypted_conversation_backups(owner_id,revision,capsule)
        VALUES($1,$2::bigint+1,$3::jsonb) ON CONFLICT(owner_id) DO UPDATE
        SET revision=EXCLUDED.revision,capsule=EXCLUDED.capsule,updated_at=NOW()
        RETURNING revision::text,capsule`, [context.owner, expected, JSON.stringify(capsule)]);
      return view(result.rows[0]);
    });
  }
  async function deleteEncryptedConversationBackup(context, payload) {
    if (!payload || Object.keys(payload).length !== 1 || !Object.hasOwn(payload, 'expectedRevision')) {
      throw failure(400, 'invalid_encrypted_backup');
    }
    const expected = validateRevision(payload.expectedRevision);
    return withTransaction(async client => {
      await authenticated(client, context);
      const previous = await current(client, context.owner);
      if (previous.revision !== expected) throw failure(409, 'backup_revision_conflict');
      if (expected === '0') return view(previous);
      const result = await client.query(`UPDATE encrypted_conversation_backups
        SET revision=revision+1,capsule=NULL,updated_at=NOW() WHERE owner_id=$1
        RETURNING revision::text,capsule`, [context.owner]);
      return view(result.rows[0]);
    });
  }
  return { readEncryptedConversationBackup, writeEncryptedConversationBackup, deleteEncryptedConversationBackup };
}
module.exports = { createEncryptedConversationBackupStore };
