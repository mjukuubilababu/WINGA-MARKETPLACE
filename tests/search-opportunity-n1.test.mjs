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
  for(const [region,color,actor]of [['mwanza','white','local-one'],['dar','white','local-two'],['mwanza','blue','local-three']])await db.query(`INSERT INTO search_demand_events
    VALUES('regional-dress','regional-dress','dress',$1,$1,$2,'user',$3,NOW(),true,0)`,[region,color,actor]);
  const local=(await store.readCommerceOpportunityCandidates()).filter(row=>row.queryKey==='regional-dress');
  assert.equal(local.length,3);assert.ok(local.every(row=>row.evidenceCount===1));
  assert.equal(buildCommerceOpportunities(local).length,3);
  assert.equal((await gated.readCommerceOpportunityCandidates()).some(row=>row.queryKey==='regional-dress'),false);
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
  await db.exec("ALTER TABLE demand_events ADD COLUMN color TEXT DEFAULT '';ALTER TABLE demand_events ADD COLUMN size TEXT DEFAULT '';ALTER TABLE search_demand_events ADD COLUMN detected_color TEXT DEFAULT '';");
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
  await db.exec("ALTER TABLE products ADD COLUMN price NUMERIC DEFAULT 100;ALTER TABLE products ADD COLUMN first_approved_at TIMESTAMPTZ;UPDATE products SET first_approved_at=created_at;ALTER TABLE search_demand_events ADD COLUMN country TEXT DEFAULT 'tz';INSERT INTO products(id,category,uploaded_by,status,availability,created_at,price,first_approved_at) VALUES('content-only','dress','seller','approved','available',NOW(),0,NOW());");
  const {createMarketplaceGrowth}=require('../backend/growth-marketplace');
  const report=await createMarketplaceGrowth({readQuery:(...args)=>db.query(...args)}).readMarketplaceLoopHealth();
  assert.deepEqual(report.categories[0],{category:'dress',listings:2,available:1,sellers:1,searches:2,matches:1,audiences:1,orders:1,delivered:1,failed:0,searchSuccessRate:0.5,deliveryRate:1});
  assert.equal(report.regions[0].searchSuccessRate,0.5);
  assert.equal(report.sellerActivation.cohorts.reduce((n,c)=>n+c.activated,0),1);
  assert.deepEqual(report.demandResolution,{eligible:2,linked:1,ordered:1,delivered:1});
  assert.equal(JSON.stringify(report).includes('buyer'),false);
});

async function resolutionFixture(t){
  const db=await roomDatabase(t);
  await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY,status TEXT);
    CREATE TABLE products(id TEXT PRIMARY KEY,status TEXT,uploaded_by TEXT,availability TEXT,created_at TIMESTAMPTZ);
    CREATE TABLE public_content_visibility(content_type TEXT,content_id TEXT,visibility TEXT);
    CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT);
    CREATE TABLE search_demand_events(event_id TEXT,query_key TEXT,detected_category TEXT,detected_color TEXT,region TEXT,audience_type TEXT,audience_key TEXT,happened_at TIMESTAMPTZ,zero_result BOOLEAN,result_count INT);
    CREATE TABLE notifications(id TEXT PRIMARY KEY,user_id TEXT,actor_username TEXT,type TEXT,message_id TEXT,conversation_id TEXT,title TEXT,body TEXT,is_read BOOLEAN,read_at TIMESTAMPTZ,created_at TIMESTAMPTZ);
    CREATE TABLE rediscovery_eligibility(product_id TEXT,supply_response_id TEXT,metadata JSONB,expires_at TIMESTAMPTZ);
    CREATE TABLE supply_responses(response_id TEXT,status TEXT);
    CREATE TABLE intelligence_recommendations(audience_type TEXT,audience_key TEXT,entity_type TEXT,entity_key TEXT,metadata JSONB);
    INSERT INTO users VALUES('buyer','active'),('seller','active');
    INSERT INTO products VALUES('new-dress','approved','seller','available',NOW());
    INSERT INTO search_demand_events VALUES('search-one','white-dress','dress','white','mwanza','user','buyer-key',NOW(),true,0);
    INSERT INTO supply_responses VALUES('response-one','active');
    INSERT INTO rediscovery_eligibility VALUES('new-dress','response-one','{"sourceEventId":"search-one"}',NOW()+INTERVAL '1 day');`);
  for(const migration of [require('../backend/migrations/commerce-goals'),require('../backend/migrations/commerce-goal-transitions')])for(const sql of migration.statements)await db.exec(sql);
  await db.exec(require('../backend/migrations/growth-loops').statements.find(sql=>sql.includes('CREATE TABLE growth_rate_buckets')));
  const store=createPostgresStore({databaseUrl:'postgres://test.invalid/winga',queryClient:db,demandResolutionEnabled:true});
  return {db,store};
}

test('opt-in search subscriptions resolve once through canonical goals and durable capped notifications',async t=>{
  const {db,store}=await resolutionFixture(t);
  await assert.rejects(store.subscribeSearchDemand({userId:'buyer',audienceKey:'other-key',query:'white dress'}),{code:'demand_subscription_evidence_required'});
  const input={userId:'buyer',audienceKey:'buyer-key',query:'white dress'};
  const subscribed=await store.subscribeSearchDemand(input);assert.equal(subscribed.status,'looking');
  assert.equal((await store.subscribeSearchDemand(input)).duplicate,true);
  const result=await store.processDemandResolutions();assert.equal(result.processed,1);
  assert.equal((await store.processDemandResolutions()).processed,0);
  const notice=(await db.query('SELECT * FROM notifications')).rows[0];
  assert.equal(notice.user_id,'buyer');assert.equal(notice.message_id,'new-dress');assert.equal(notice.conversation_id,subscribed.goalId);
  assert.equal((await db.query('SELECT status FROM commerce_goals')).rows[0].status,'matched');
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM commerce_goal_transitions WHERE to_status='matched'")).rows[0].count,1);
  const stopped=await store.resolveCommerceGoal(subscribed.goalId,'buyer','stopped');assert.equal(stopped.status,'stopped');
  assert.equal((await store.processDemandResolutions()).processed,0);
});

test('resolution blocks private/suspended/blocked products and notification failure rolls back matching for retry',async t=>{
  const {db,store}=await resolutionFixture(t);
  await store.subscribeSearchDemand({userId:'buyer',audienceKey:'buyer-key',query:'white dress'});
  await db.exec("INSERT INTO user_blocks VALUES('seller','buyer')");assert.equal((await store.processDemandResolutions()).processed,0);
  await db.exec("DELETE FROM user_blocks; INSERT INTO public_content_visibility VALUES('product','new-dress','private')");assert.equal((await store.processDemandResolutions()).processed,0);
  await db.exec("DELETE FROM public_content_visibility;UPDATE users SET status='suspended' WHERE username='seller'");assert.equal((await store.processDemandResolutions()).processed,0);
  await db.exec("UPDATE users SET status='active';ALTER TABLE notifications ADD CONSTRAINT simulate_provider_failure CHECK(FALSE)");
  await assert.rejects(store.processDemandResolutions());
  assert.equal((await db.query('SELECT status FROM commerce_goals')).rows[0].status,'looking');
  await db.exec('ALTER TABLE notifications DROP CONSTRAINT simulate_provider_failure');assert.equal((await store.processDemandResolutions()).processed,1);
});

test('demand notifications respect explicit consent, stopped goals and a shared recipient daily cap',async t=>{
  const {db,store}=await resolutionFixture(t);
  await db.exec(`INSERT INTO products VALUES('second','approved','seller','available',NOW()),('third','approved','seller','available',NOW()),('no-consent','approved','seller','available',NOW()),('stopped','approved','seller','available',NOW());
    INSERT INTO commerce_goals(goal_id,user_id,product_id,metadata) VALUES
      ('a','buyer','new-dress','{"notificationConsent":true,"notificationMode":"in_app"}'),
      ('b','buyer','second','{"notificationConsent":true,"notificationMode":"in_app"}'),
      ('c','buyer','third','{"notificationConsent":true,"notificationMode":"in_app"}'),
      ('d','buyer','no-consent','{"notificationConsent":false,"notificationMode":"in_app"}');
    INSERT INTO commerce_goals(goal_id,user_id,product_id,status,metadata) VALUES('e','buyer','stopped','stopped','{"notificationConsent":true,"notificationMode":"in_app"}');`);
  assert.equal((await store.processDemandResolutions()).processed,2);assert.equal((await store.processDemandResolutions()).processed,0);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM notifications WHERE user_id='buyer'")).rows[0].count,2);
  assert.equal((await db.query("SELECT status FROM commerce_goals WHERE goal_id='d'")).rows[0].status,'looking');
  await db.exec("UPDATE notifications SET created_at=NOW()-INTERVAL '2 days'");
  assert.equal((await store.processDemandResolutions()).processed,1);
  assert.equal((await db.query("SELECT status FROM commerce_goals WHERE goal_id='e'")).rows[0].status,'stopped');
});

test('exact Opportunity destination executes canonical relevance, expiry, dismissal and public-product safety',async t=>{
  const db=await roomDatabase(t);
  await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY,primary_category TEXT,status TEXT);
    CREATE TABLE products(id TEXT PRIMARY KEY,uploaded_by TEXT,category TEXT,status TEXT);
    CREATE TABLE public_content_visibility(content_type TEXT,content_id TEXT,visibility TEXT);
    CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT);
    CREATE TABLE supply_responses(response_id TEXT,opportunity_id TEXT,seller_id TEXT,action_type TEXT,status TEXT);
    INSERT INTO users VALUES('relevant','dress','active'),('unrelated','phone','active'),('source','dress','active');
    INSERT INTO products VALUES('public-product','source','dress','approved');`);
  await db.exec(MIGRATIONS.flatMap(m=>m.statements||[]).find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS commerce_opportunities')));
  await db.exec(`INSERT INTO commerce_opportunities(opportunity_id,type,category,product_id,expires_at) VALUES('opp_exact','sold_out_restock','dress','public-product',NOW()+INTERVAL '1 day');`);
  const store=createPostgresStore({databaseUrl:'postgres://fixture/primary',queryClient:db,readQueryClient:{query:async()=>{throw Error('canonical destination read must use primary');}}});
  assert.equal((await store.readSellerCommerceOpportunities('relevant',1,'opp_exact'))[0].opportunityId,'opp_exact');
  assert.deepEqual(await store.readSellerCommerceOpportunities('unrelated',1,'opp_exact'),[]);
  await db.exec("INSERT INTO supply_responses VALUES('dismiss','opp_exact','relevant','dismiss','active')");
  assert.deepEqual(await store.readSellerCommerceOpportunities('relevant',1,'opp_exact'),[]);await db.exec('DELETE FROM supply_responses');
  await db.exec("INSERT INTO user_blocks VALUES('source','relevant')");assert.deepEqual(await store.readSellerCommerceOpportunities('relevant',1,'opp_exact'),[]);await db.exec('DELETE FROM user_blocks');
  await db.exec("INSERT INTO public_content_visibility VALUES('product','public-product','private')");assert.deepEqual(await store.readSellerCommerceOpportunities('relevant',1,'opp_exact'),[]);await db.exec('DELETE FROM public_content_visibility');
  await db.exec("UPDATE commerce_opportunities SET expires_at=NOW()-INTERVAL '1 second'");assert.deepEqual(await store.readSellerCommerceOpportunities('relevant',1,'opp_exact'),[]);
});
