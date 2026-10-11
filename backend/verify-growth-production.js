const { createGrowthPolicy } = require('./growth-policy');
const { createGrowthStore } = require('./growth-store');
const migrationIds = Object.freeze([
  require('./migrations/growth-loops').id,
  require('./migrations/growth-event-timing').id
]);

async function verifyGrowthProduction(client, env = process.env) {
  const rollout = createGrowthPolicy(env).summary;
  const result = {
    ok: false, mode: 'verify-growth-production', privacy: 'aggregate-only',
    databaseChanged: false, remoteWrites: false, flagsChanged: false,
    authenticatedShareFlowVerified: false, productionLoadVerified: false,
    guestAuthReturnVerified: false, canaryReady: false,
    features: {
      productSharing: env.WINGA_GROWTH_PRODUCT_SHARING_ENABLED === 'true',
      measurement: env.WINGA_GROWTH_MEASUREMENT_ENABLED === 'true'
    },
    rollout, alerts: []
  };
  const present = (await client.query(`SELECT
    to_regclass('schema_migrations') IS NOT NULL AS migrations,
    to_regclass('growth_shares') IS NOT NULL AS shares,
    to_regclass('growth_events') IS NOT NULL AS events,
    to_regclass('growth_rate_buckets') IS NOT NULL AS quotas,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
      AND table_name='growth_events' AND column_name='client_duration_ms') AS timing,
    (SELECT COUNT(*)::int FROM pg_constraint WHERE contype='p' AND conrelid IN
      (to_regclass('growth_shares'),to_regclass('growth_events'),to_regclass('growth_rate_buckets'))) AS "primaryKeys",
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('growth_events') AND contype='u'
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=to_regclass('growth_events') AND attname='share_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid=to_regclass('growth_events') AND attname='actor_key'),
        (SELECT attnum FROM pg_attribute WHERE attrelid=to_regclass('growth_events') AND attname='event_type')]::smallint[]) AS dedupe,
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('growth_events') AND contype='f'
      AND confrelid=to_regclass('growth_shares') AND confdeltype='c' AND convalidated
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=to_regclass('growth_events') AND attname='share_id')]::smallint[]
      AND confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=to_regclass('growth_shares') AND attname='id')]::smallint[]) AS "eventForeignKey"`)).rows[0];
  const applied = present.migrations ? Number((await client.query(`SELECT COUNT(*)::int AS count
    FROM schema_migrations WHERE migration_id=ANY($1::text[])`, [migrationIds])).rows[0].count) : 0;
  result.schema = { ready: Boolean(present.migrations && present.shares && present.events && present.quotas
    && present.timing && present.primaryKeys === 3 && present.dedupe && present.eventForeignKey && applied === migrationIds.length),
    migrationsApplied: applied, migrationsRequired: migrationIds.length,
    primaryKeysPresent: present.primaryKeys === 3, eventDedupePresent: Boolean(present.dedupe),
    eventForeignKeyPresent: Boolean(present.eventForeignKey) };
  if (!result.schema.ready) { result.alerts.push('growth_schema_not_ready'); return result; }
  result.integrity = (await client.query(`SELECT
    (SELECT COUNT(*)::int FROM growth_events e LEFT JOIN growth_shares s ON s.id=e.share_id
      WHERE s.id IS NULL) AS "orphanEvents",
    (SELECT COUNT(*)::int FROM (SELECT share_id,actor_key,event_type FROM growth_events
      GROUP BY share_id,actor_key,event_type HAVING COUNT(*)>1) d) AS "duplicateLogicalEvents",
    (SELECT COUNT(*)::int FROM growth_shares s WHERE NOT EXISTS(SELECT 1 FROM growth_events e
      WHERE e.share_id=s.id AND e.event_type='product_share_created' AND e.actor_key=s.actor_key
        AND e.verification='server' AND e.event_id='created:'||s.id)) AS "missingCanonicalEntries",
    (SELECT COUNT(*)::int FROM growth_events e JOIN growth_shares s ON s.id=e.share_id
      WHERE e.event_type='product_share_created' AND (e.actor_key<>s.actor_key OR e.verification<>'server'
        OR e.event_id<>'created:'||s.id)) AS "invalidCanonicalEntries",
    (SELECT COUNT(*)::int FROM growth_events WHERE
      event_type IN ('shared_product_saved','shared_product_order_started','shared_product_reshared')
      AND verification<>'server') AS "unverifiedValueEvents",
    (SELECT COUNT(*)::int FROM growth_shares s JOIN growth_shares p ON p.id=s.parent_share_id
      WHERE s.content_id<>p.content_id OR s.content_type<>p.content_type) AS "invalidParentLinks",
    (SELECT COUNT(*)::int FROM growth_events WHERE client_duration_ms IS NOT NULL AND
      (event_type<>'shared_product_viewed' OR client_duration_ms<0 OR client_duration_ms>300000)) AS "invalidTimingSamples"`)).rows[0];
  result.ok = Object.values(result.integrity).every(count => count === 0);
  if (!result.ok) result.alerts.push('growth_integrity_failed');
  const store = createGrowthStore({ query: (...args) => client.query(...args),
    withTransaction: async () => { throw new Error('READ_ONLY_VERIFIER'); } });
  result.metrics = await store.readGrowthHealth();
  result.canaryReady = result.ok && result.features.productSharing && result.features.measurement
    && rollout.mode === 'allowlist' && rollout.enrolledAccounts >= 2;
  result.limitations = [
    'Backend configuration only; frontend flags and authenticated user actions are not verified.',
    'Aggregate history is not production capacity, causal attribution or completed sales.',
    'Guest measurement opt-in applies to public links beyond selected recipient accounts.'
  ];
  return result;
}

async function readOnlyCheck(client, env) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const result = await verifyGrowthProduction(client, env);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function main() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL,
    ssl: String(process.env.DATABASE_SSL).toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  try {
    if (!process.env.DATABASE_URL || process.argv.length > 2) throw new Error('INVALID_CHECK_OPTIONS');
    await client.connect();
    const result = await readOnlyCheck(client, process.env);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ ok: false, mode: 'verify-growth-production', privacy: 'aggregate-only',
      errorCode: 'GROWTH_CHECK_FAILED', databaseChanged: false, remoteWrites: false, flagsChanged: false }));
    process.exitCode = 1;
  } finally { await client.end().catch(() => {}); }
}
if (require.main === module) main();
module.exports = { verifyGrowthProduction, readOnlyCheck, migrationIds };
