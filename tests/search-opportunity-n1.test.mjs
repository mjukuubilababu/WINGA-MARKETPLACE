import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {roomDatabase} from './helpers/shopping-room-database.mjs';
const require = createRequire(import.meta.url);
const {createPostgresStore} = require('../backend/db');
const {buildCommerceOpportunities} = require('../backend/commerce-opportunity');
const {MIGRATIONS} = require('../backend/migrations');

test('N=1 search gaps reach canonical opportunities without becoming corroborated trends', async t => {
  const db = await roomDatabase(t);
  await db.exec(`CREATE TABLE search_demand_events (
    query TEXT, query_key TEXT, detected_category TEXT, region TEXT, location TEXT,
    detected_color TEXT, audience_type TEXT, audience_key TEXT,
    happened_at TIMESTAMPTZ, zero_result BOOLEAN, result_count INT);
    CREATE TABLE products (id TEXT, category TEXT, availability TEXT, uploaded_by TEXT);
    CREATE TABLE users (username TEXT, primary_category TEXT);
    CREATE TABLE supply_responses (response_id TEXT, opportunity_id TEXT, seller_id TEXT, action_type TEXT, status TEXT);
    CREATE TABLE product_demand_summaries (product_id TEXT, demand_score FLOAT);
    CREATE TABLE demand_events (demand_id TEXT, product_id TEXT, region TEXT, color TEXT,
      size TEXT, demand_score FLOAT, created_at TIMESTAMPTZ);`);
  const opportunitySchema = MIGRATIONS.flatMap(m => m.statements || [])
    .find(sql => sql.includes('CREATE TABLE IF NOT EXISTS commerce_opportunities'));
  assert.ok(opportunitySchema);
  await db.exec(opportunitySchema);
  const store = createPostgresStore({databaseUrl: 'postgres://test.invalid/winga', queryClient: db});
  const insert = (key, actor, count = 0) => db.query(`INSERT INTO search_demand_events
    VALUES ($1,$1,'dress','mwanza','mwanza','white','session',$2,NOW(),$3,$4)`,
    [key, actor, count === 0, count]);
  await insert('white-dress', 'buyer-one');
  await insert('linen-shirt', 'buyer-one', 2);
  await insert('missing-identity', '');
  await insert('stale-demand', 'buyer-one');
  await db.query("UPDATE search_demand_events SET happened_at=NOW()-INTERVAL '31 days' WHERE query_key='stale-demand'");
  let candidates = await store.readCommerceOpportunityCandidates();
  let gaps = candidates.filter(row => row.source === 'search_gap_aggregate');
  assert.deepEqual(gaps.map(row => row.queryKey).sort(), ['linen-shirt', 'white-dress']);
  const first = buildCommerceOpportunities(gaps);
  assert.equal(first.length, 2);
  assert.ok(first.every(row => row.evidenceCount === 1 && row.metadata.evidenceLevel === 'single_signal'));
  await store.upsertCommerceOpportunities(first);
  await db.query("INSERT INTO users VALUES ('seller-one','dress')");
  const sellerRows = await store.readSellerCommerceOpportunities('seller-one');
  assert.equal(sellerRows.length, 2);
  assert.ok(sellerRows.every(row => row.metadata.evidenceLevel === 'single_signal'));
  assert.deepEqual((await store.readSearchDemandSummary()).trendingSearches, []);
  const initialScore = gaps.find(row => row.queryKey === 'white-dress').demandScore;
  for (let i=0; i<10; i++) await insert('white-dress', 'buyer-one');
  gaps = (await store.readCommerceOpportunityCandidates()).filter(row => row.source === 'search_gap_aggregate');
  const repeated = gaps.find(row => row.queryKey === 'white-dress');
  assert.equal(repeated.evidenceCount, 1);
  assert.equal(repeated.demandScore, initialScore);
  assert.equal(buildCommerceOpportunities([repeated])[0].metadata.evidenceLevel, 'single_signal');
  const gated = createPostgresStore({databaseUrl: 'postgres://test.invalid/winga', queryClient: db, searchOpportunityMinimumAudience: 2});
  assert.ok(!(await gated.readCommerceOpportunityCandidates()).some(row => row.source === 'search_gap_aggregate'));
  await insert('white-dress', 'buyer-two');
  candidates = await gated.readCommerceOpportunityCandidates();
  const corroborated = buildCommerceOpportunities(candidates).find(row => row.queryKey === 'white-dress');
  assert.equal(corroborated.evidenceCount, 2);
  assert.equal(corroborated.metadata.evidenceLevel, 'corroborated');
  assert.equal(corroborated.opportunityId, first.find(row => row.queryKey === 'white-dress').opportunityId);
  await store.upsertCommerceOpportunities([corroborated]);
  const updated = (await store.readSellerCommerceOpportunities('seller-one')).find(row => row.queryKey === 'white-dress');
  assert.equal(updated.evidenceCount, 2);
  assert.equal(updated.metadata.evidenceLevel, 'corroborated');
  assert.equal((await store.readSearchDemandSummary()).trendingSearches[0].queryKey, 'white-dress');
});
