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
      size TEXT, demand_score FLOAT, created_at TIMESTAMPTZ, audience_type TEXT, audience_key TEXT, action TEXT, seller_id TEXT, buyer_id TEXT);`);
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

// Product-demand N=1 is kept separate from aggregate regional/trend thresholds.
test('one explicit restock/variant requester creates a low-evidence opportunity without repeat inflation',async t=>{
  const db=await roomDatabase(t);
  await db.exec(`CREATE TABLE search_demand_events(query_key TEXT, detected_category TEXT, region TEXT, location TEXT, detected_color TEXT, audience_type TEXT, audience_key TEXT, happened_at TIMESTAMPTZ, zero_result BOOLEAN, result_count INT);
    CREATE TABLE products(id TEXT, category TEXT, availability TEXT);
    CREATE TABLE product_demand_summaries(product_id TEXT,demand_score FLOAT);
    CREATE TABLE demand_events(demand_id TEXT,product_id TEXT,region TEXT,color TEXT,size TEXT,demand_score FLOAT,created_at TIMESTAMPTZ,audience_type TEXT,audience_key TEXT,action TEXT,seller_id TEXT,buyer_id TEXT);
    INSERT INTO products VALUES('dress','dress','sold_out');`);
  const store=createPostgresStore({databaseUrl:'postgres://test.invalid/winga',queryClient:db});
  const demand=(id,actor,action='notify_when_available',buyer='buyer')=>db.query(`INSERT INTO demand_events VALUES($1,'dress','mwanza','white','M',99,NOW(),'user',$2,$3,'seller',$4)`,[id,actor,action,buyer]);
  await demand('one','buyer');
  let candidates=(await store.readCommerceOpportunityCandidates()).filter(c=>['sold_out_restock','variant_gap'].includes(c.type));
  const first=buildCommerceOpportunities(candidates);assert.equal(first.length,2);
  assert.ok(first.every(c=>c.evidenceCount===1&&c.metadata.evidenceLevel==='single_signal'));
  for(let i=0;i<10;i++)await demand('repeat-'+i,'buyer');
  await demand('not-interest','other','show_similar');await demand('no-identity','');await demand('self','seller','want_back','seller');
  candidates=(await store.readCommerceOpportunityCandidates()).filter(c=>['sold_out_restock','variant_gap'].includes(c.type));
  assert.ok(candidates.every(c=>c.evidenceCount===1&&c.demandScore===2));
  await demand('two','buyer-two','want_back');
  const second=buildCommerceOpportunities(await store.readCommerceOpportunityCandidates()).filter(c=>['sold_out_restock','variant_gap'].includes(c.type));
  assert.ok(second.every(c=>c.evidenceCount===2&&c.metadata.evidenceLevel==='corroborated'));
  assert.deepEqual(second.map(c=>c.opportunityId).sort(),first.map(c=>c.opportunityId).sort());
});

test('canonical supply response keeps exact search/demand lineage and excludes unrelated discovery',async t=>{
  const db=await roomDatabase(t);
  await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY);
    CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT,category TEXT,uploaded_by TEXT,availability TEXT);
    CREATE TABLE demand_events(demand_id TEXT PRIMARY KEY,product_id TEXT,region TEXT,audience_type TEXT,audience_key TEXT,created_at TIMESTAMPTZ,action TEXT,buyer_id TEXT,seller_id TEXT);
    CREATE TABLE search_demand_events(event_id TEXT PRIMARY KEY,query_key TEXT,detected_category TEXT,region TEXT,location TEXT,audience_type TEXT,audience_key TEXT,happened_at TIMESTAMPTZ,zero_result BOOLEAN,result_count INTEGER);
    INSERT INTO users VALUES('seller');INSERT INTO products VALUES('new-dress','White dress','dress','seller','available');`);
  const all=MIGRATIONS.flatMap(m=>m.statements||[]);
  for(const table of ['commerce_opportunities','supply_responses','rediscovery_eligibility','regional_supply_snapshots'])
    await db.exec(all.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS '+table+' (')));
  for(const sql of all.filter(sql=>sql.includes('ALTER TABLE rediscovery_eligibility')))await db.exec(sql);
  const store=createPostgresStore({databaseUrl:'postgres://test.invalid/winga',queryClient:db});
  const opportunity=buildCommerceOpportunities([{type:'zero_result',queryKey:'white-dress',category:'dress',region:'mwanza',evidenceCount:1,demandScore:2,supplyScore:0}])[0];
  await store.upsertCommerceOpportunities([opportunity]);
  await db.exec(`INSERT INTO search_demand_events VALUES
    ('search-first','white-dress','dress','mwanza','mwanza','user','buyer-key',NOW()-INTERVAL '1 hour',true,0),
    ('search-repeat','white-dress','dress','mwanza','mwanza','user','buyer-key',NOW(),true,0),
    ('search-other','linen-shirt','dress','mwanza','mwanza','user','unrelated-key',NOW(),true,0),
    ('search-success','white-dress','dress','mwanza','mwanza','user','discovery-key',NOW(),false,20);
    INSERT INTO demand_events VALUES('demand-first','new-dress','mwanza','user','restock-key',NOW(),'notify_when_available','buyer','seller'),
      ('demand-similar','new-dress','mwanza','user','similar-key',NOW(),'show_similar','buyer','seller');`);
  const input={sellerId:'seller',productId:'new-dress',actionType:'create_product',opportunityId:opportunity.opportunityId};
  const response=await store.recordSupplyResponse(input);assert.equal(response.linked,true);assert.equal(response.eligibleAudienceCount,2);
  const rows=(await db.query('SELECT metadata,audience_key,eligibility_id FROM rediscovery_eligibility ORDER BY audience_key')).rows;
  assert.deepEqual(rows.map(r=>r.audience_key),['buyer-key','restock-key']);
  assert.deepEqual(rows.map(r=>r.metadata.sourceEventId),['search-first','demand-first']);
  assert.deepEqual(rows.map(r=>r.metadata.sourceType),['SEARCH_DEMAND','PRODUCT_DEMAND']);
  const retry=await store.recordSupplyResponse(input);assert.equal(retry.responseId,response.responseId);assert.equal(retry.eligibleAudienceCount,0);
  assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM rediscovery_eligibility')).rows[0].count,2);
});

test('marketplace loop report measures eligible supply and value without raw users or repeated order join inflation',async t=>{
  const db=await roomDatabase(t);
  await db.exec(`CREATE TABLE users(username TEXT,status TEXT);
    CREATE TABLE products(id TEXT,category TEXT,uploaded_by TEXT,status TEXT,availability TEXT,created_at TIMESTAMPTZ);
    CREATE TABLE public_content_visibility(content_type TEXT,content_id TEXT,visibility TEXT);
    CREATE TABLE search_demand_events(detected_category TEXT,region TEXT,audience_type TEXT,audience_key TEXT,happened_at TIMESTAMPTZ,result_count INT,zero_result BOOLEAN);
    CREATE TABLE orders(id TEXT,product_id TEXT,buyer_username TEXT,seller_username TEXT,status TEXT,created_at TIMESTAMPTZ);
    CREATE TABLE product_likes(product_id TEXT,user_id TEXT,created_at TIMESTAMPTZ);
    CREATE TABLE rediscovery_eligibility(eligibility_id TEXT,metadata JSONB,eligible_at TIMESTAMPTZ);
    CREATE TABLE commerce_order_outcomes(eligibility_id TEXT,outcome_type TEXT);
    INSERT INTO users VALUES('seller','active'),('banned','suspended');
    INSERT INTO products VALUES('one','dress','seller','approved','available',NOW()-INTERVAL '1 day'),
      ('two','dress','seller','approved','sold_out',NOW()),('private','dress','seller','approved','available',NOW()),
      ('blocked','dress','banned','approved','available',NOW());
    INSERT INTO public_content_visibility VALUES('product','private','private');
    INSERT INTO search_demand_events VALUES('dress','mwanza','user','buyer',NOW(),0,true),('dress','mwanza','user','buyer',NOW(),2,false);
    INSERT INTO orders VALUES('order','one','buyer','seller','delivered',NOW());
    INSERT INTO product_likes VALUES('one','seller',NOW());
    INSERT INTO rediscovery_eligibility VALUES('resolved','{"sourceEventId":"search"}',NOW()),('legacy','{}',NOW());
    INSERT INTO commerce_order_outcomes VALUES('resolved','created'),('resolved','paid'),('resolved','delivered');`);
  const {createMarketplaceGrowth}=require('../backend/growth-marketplace');
  const report=await createMarketplaceGrowth({readQuery:(...args)=>db.query(...args)}).readMarketplaceLoopHealth();
  assert.deepEqual(report.categories[0],{category:'dress',listings:2,available:1,sellers:1,searches:2,matches:1,audiences:1,orders:1,delivered:1,failed:0,searchSuccessRate:0.5,deliveryRate:1});
  assert.equal(report.regions[0].searchSuccessRate,0.5);
  assert.equal(report.sellerActivation.cohorts.reduce((n,c)=>n+c.activated,0),1);
  assert.deepEqual(report.demandResolution,{eligible:2,linked:1,ordered:1,delivered:1});
  assert.equal(JSON.stringify(report).includes('buyer'),false);
});
