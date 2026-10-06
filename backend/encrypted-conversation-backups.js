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
    const result = await client.query(`SELECT revision::text, capsule, page_ids
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
    if (!payload || !['capsule,expectedRevision','capsule,expectedRevision,pageIds'].includes(Object.keys(payload).sort().join(','))
      || !Object.hasOwn(payload, 'capsule') || !Object.hasOwn(payload, 'expectedRevision')) {
      throw failure(400, 'invalid_encrypted_backup');
    }
    const expected = validateRevision(payload.expectedRevision);
    const capsule = validateCapsule(payload.capsule, context?.owner, expected);
    const pageIds = Object.hasOwn(payload,'pageIds')?payload.pageIds:[];
    if (!Array.isArray(pageIds) || pageIds.length>64 || new Set(pageIds).size!==pageIds.length
      || pageIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(id))) throw failure(400,'invalid_encrypted_backup');
    return withTransaction(async client => {
      await authenticated(client, context);
      const previous = await current(client, context.owner);
      if (previous.revision !== expected) {
        // An ambiguous response may be retried, but only the exact accepted capsule is idempotent.
        if (previous.revision === String(Number(expected) + 1)
          && previous.capsule && JSON.stringify(validateCapsule(previous.capsule, context.owner, expected))
            === JSON.stringify(capsule) && JSON.stringify(previous.page_ids || [])===JSON.stringify(pageIds)) return view(previous);
        throw failure(409, 'backup_revision_conflict');
      }
      const pages=await client.query(`SELECT id FROM encrypted_conversation_backup_pages WHERE owner_id=$1 AND generation=$2::bigint+1 AND id=ANY($3::text[]) FOR SHARE`,[context.owner,expected,pageIds]);
      if(pages.rows.length!==pageIds.length)throw failure(409,'backup_pages_incomplete');
      const result = await client.query(`INSERT INTO encrypted_conversation_backups(owner_id,revision,capsule,page_ids)
        VALUES($1,$2::bigint+1,$3::jsonb,$4) ON CONFLICT(owner_id) DO UPDATE
        SET revision=EXCLUDED.revision,capsule=EXCLUDED.capsule,page_ids=EXCLUDED.page_ids,updated_at=NOW()
        RETURNING revision::text,capsule`, [context.owner, expected, JSON.stringify(capsule),pageIds]);
      await client.query(`DELETE FROM encrypted_conversation_backup_pages WHERE owner_id=$1 AND NOT(id=ANY($2::text[]))`,[context.owner,pageIds]);
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
      if (expected === '0') {
        const staged=(await client.query('SELECT 1 FROM encrypted_conversation_backup_pages WHERE owner_id=$1 LIMIT 1',[context.owner])).rows.length;
        if(!staged)return view(previous);
        await client.query('INSERT INTO encrypted_conversation_backups(owner_id,revision,capsule) VALUES($1,1,NULL)',[context.owner]);
        await client.query('DELETE FROM encrypted_conversation_backup_pages WHERE owner_id=$1',[context.owner]);
        return view({revision:'1',capsule:null});
      }
      const result = await client.query(`UPDATE encrypted_conversation_backups
        SET revision=revision+1,capsule=NULL,page_ids='{}',updated_at=NOW() WHERE owner_id=$1
        RETURNING revision::text,capsule`, [context.owner]);
      await client.query('DELETE FROM encrypted_conversation_backup_pages WHERE owner_id=$1',[context.owner]);
      return view(result.rows[0]);
    });
  }
  async function writeEncryptedHistoryPage(context,payload) {
    if(!payload || Object.keys(payload).sort().join(',')!=='capsule,expectedRevision')throw failure(400,'invalid_encrypted_backup');
    const expected=validateRevision(payload.expectedRevision),capsule=validateCapsule(payload.capsule,context?.owner,expected);
    if(Buffer.from(capsule.ciphertext,'base64url').length>2*1024*1024+16)throw failure(400,'invalid_encrypted_backup');
    return withTransaction(async client=>{
      await authenticated(client,context);const root=await current(client,context.owner);
      const old=(await client.query('SELECT capsule FROM encrypted_conversation_backup_pages WHERE owner_id=$1 AND id=$2',[context.owner,capsule.id])).rows[0];
      if(old) {
        if(JSON.stringify(validateCapsule(old.capsule,context.owner,expected))!==JSON.stringify(capsule))throw failure(409,'backup_page_conflict');
        if(root.revision!==expected && !(root.revision===String(Number(expected)+1)&&root.page_ids?.includes(capsule.id)))throw failure(409,'backup_revision_conflict');
        return {version:1,id:capsule.id};
      }
      if(root.revision!==expected)throw failure(409,'backup_revision_conflict');
      await client.query(`DELETE FROM encrypted_conversation_backup_pages WHERE owner_id=$1 AND (generation<>$2::bigint+1 OR created_at<NOW()-interval '24 hours') AND NOT(id=ANY($3::text[]))`,[context.owner,expected,root.page_ids||[]]);
      const count=(await client.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_backup_pages WHERE owner_id=$1 AND generation=$2::bigint+1',[context.owner,expected])).rows[0].n;
      if(count>=64)throw failure(429,'backup_page_limit');
      await client.query('INSERT INTO encrypted_conversation_backup_pages(owner_id,id,generation,capsule) VALUES($1,$2,$3,$4)',[context.owner,capsule.id,capsule.generation,JSON.stringify(capsule)]);
      return {version:1,id:capsule.id};
    });
  }
  async function readEncryptedHistoryPage(context,{id,revision}={}) {
    if(typeof id!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(id))throw failure(400,'invalid_encrypted_backup');
    validateRevision(revision);
    return withTransaction(async client=>{
      await authenticated(client,context);const root=await current(client,context.owner);
      if(root.revision!==revision)throw failure(409,'backup_revision_conflict');
      if(!root.capsule || !root.page_ids?.includes(id))throw failure(404,'backup_page_unavailable');
      const row=(await client.query('SELECT capsule FROM encrypted_conversation_backup_pages WHERE owner_id=$1 AND id=$2 AND generation=$3',[context.owner,id,revision])).rows[0];
      if(!row)throw failure(404,'backup_page_unavailable');
      return {version:1,capsule:row.capsule,revision};
    });
  }
  return { readEncryptedConversationBackup, writeEncryptedConversationBackup, deleteEncryptedConversationBackup, writeEncryptedHistoryPage, readEncryptedHistoryPage };
}
module.exports = { createEncryptedConversationBackupStore };
