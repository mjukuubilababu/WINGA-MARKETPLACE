const migrationId = '2026100610_encrypted_shopping_rooms';

async function verifyShoppingRooms(client, env = process.env) {
  const limits=require('./encrypted-room-limits').readRoomLimits(env);
  const result = { ok: false, mode: 'verify-shopping-rooms', privacy: 'aggregate-only',
    databaseChanged: false, remoteWrites: false, flagsChanged: false,
    enabled: env.WINGA_ENCRYPTED_ROOMS_ENABLED === 'true',roomLimits:limits,
    authenticatedRoomFlowVerified: false, crossConnectionConcurrencyVerified: false,
    cryptographicAuditApproved: false };
  const schema = (await client.query(`SELECT
    EXISTS(SELECT 1 FROM schema_migrations WHERE migration_id=$1) AS migration,
    to_regclass('encrypted_shopping_rooms') IS NOT NULL AS rooms,
    to_regclass('encrypted_room_transitions') IS NOT NULL AS transitions,
    to_regclass('encrypted_room_acceptances') IS NOT NULL AS acceptances,
    to_regclass('encrypted_room_epochs') IS NOT NULL AS epochs,
    (SELECT COUNT(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND
      ((tgname='guard_room_transition' AND tgrelid=to_regclass('encrypted_room_transitions')) OR
       (tgname='immutable_room_acceptance' AND tgrelid=to_regclass('encrypted_room_acceptances')) OR
       (tgname='immutable_room_epoch' AND tgrelid=to_regclass('encrypted_room_epochs')) OR
       (tgname='guard_encrypted_epoch_shape' AND tgrelid=to_regclass('encrypted_conversation_epochs')) OR
       (tgname='immutable_encrypted_group_kind' AND tgrelid=to_regclass('encrypted_conversations')))) AS guards`, [migrationId])).rows[0];
  result.schemaReady = Boolean(schema.migration && schema.rooms && schema.transitions && schema.acceptances && schema.epochs && schema.guards === 5);
  result.guardTriggersEnabled = schema.guards;
  if (!result.schemaReady) return result;
  result.health = (await client.query(`SELECT
    (SELECT COUNT(*)::int FROM encrypted_shopping_rooms) AS rooms,
    (SELECT COUNT(*)::int FROM encrypted_room_epochs e JOIN encrypted_conversations g ON g.id=e.conversation_id AND g.epoch=e.epoch
      WHERE (SELECT COUNT(DISTINCT m->>'owner') FROM jsonb_array_elements(e.roster::jsonb) m)>$1) AS "roomsAboveConfiguredOwnerLimit",
    (SELECT COUNT(*)::int FROM encrypted_room_epochs e JOIN encrypted_conversations g ON g.id=e.conversation_id AND g.epoch=e.epoch
      WHERE jsonb_array_length(e.roster::jsonb)>$2) AS "roomsAboveConfiguredDeviceLimit",
    (SELECT COUNT(*)::int FROM encrypted_room_transitions WHERE status<>'accepted') AS "pendingTransitions",
    (SELECT COUNT(*)::int FROM encrypted_room_epochs) AS epochs,
    (SELECT COUNT(*)::int FROM encrypted_conversations g JOIN encrypted_shopping_rooms r ON r.conversation_id=g.id
      LEFT JOIN conversation_event_streams c ON c.id=g.canonical_id WHERE g.kind<>'shopping-room' OR c.id IS NULL
      OR c.kind<>'shopping-room' OR c.security_mode<>'encrypted' OR c.participant_low IS NOT NULL OR c.participant_high IS NOT NULL) AS "invalidCanonicalStreams",
    (SELECT COUNT(*)::int FROM encrypted_room_epochs e WHERE
      EXISTS(SELECT 1 FROM jsonb_array_elements(e.roster::jsonb) m WHERE NOT EXISTS(
        SELECT 1 FROM encrypted_conversation_epoch_devices d WHERE d.conversation_id=e.conversation_id AND d.epoch=e.epoch
          AND d.device_id=m->>'id' AND d.owner_id=m->>'owner')) OR
      EXISTS(SELECT 1 FROM encrypted_conversation_epoch_devices d WHERE d.conversation_id=e.conversation_id AND d.epoch=e.epoch
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e.roster::jsonb) m WHERE m->>'id'=d.device_id AND m->>'owner'=d.owner_id))) AS "invalidEpochGrants",
    (SELECT COUNT(*)::int FROM encrypted_room_transitions t WHERE t.status='accepted' AND
      (EXISTS(SELECT 1 FROM jsonb_array_elements((t.intent::jsonb->>'roster')::jsonb) m WHERE NOT EXISTS(
        SELECT 1 FROM encrypted_room_acceptances a WHERE a.transition_id=t.id AND a.device_id=m->>'id' AND a.owner_id=m->>'owner')) OR
       EXISTS(SELECT 1 FROM encrypted_room_acceptances a WHERE a.transition_id=t.id AND NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements((t.intent::jsonb->>'roster')::jsonb) m WHERE m->>'id'=a.device_id AND m->>'owner'=a.owner_id)))) AS "invalidAcceptances",
    (SELECT COUNT(*)::int FROM encrypted_shopping_rooms r JOIN encrypted_conversations g ON g.id=r.conversation_id
      LEFT JOIN encrypted_room_epochs e ON e.conversation_id=g.id AND e.epoch=g.epoch
      WHERE g.status='active' AND (e.epoch IS NULL OR e.revision<>r.revision)) AS "invalidActiveEpochs"`,[limits.maxOwners,limits.maxDevices])).rows[0];
  result.ok = ['invalidCanonicalStreams','invalidEpochGrants','invalidAcceptances','invalidActiveEpochs'].every(key => result.health[key] === 0);
  return result;
}

async function main() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL,
    ssl: String(process.env.DATABASE_SSL).toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  try {
    if (!process.env.DATABASE_URL || process.argv.length > 2) throw new Error();
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await verifyShoppingRooms(client);
    await client.query('COMMIT');
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ ok: false, errorCode: 'SHOPPING_ROOMS_CHECK_FAILED', databaseChanged: false, remoteWrites: false }));
    process.exitCode = 1;
  } finally { await client.end().catch(() => {}); }
}
if (require.main === module) main();
module.exports = { verifyShoppingRooms, migrationId };
