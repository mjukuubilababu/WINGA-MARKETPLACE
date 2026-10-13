import {createRequire} from 'node:module';
import {roomDatabase} from './shopping-room-database.mjs';
const require=createRequire(import.meta.url);
const {createPostgresStore}=require('../../backend/db');

export async function resolutionFixture(t){
  const db=await roomDatabase(t);
  await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY,status TEXT);
    CREATE TABLE products(id TEXT PRIMARY KEY,status TEXT,uploaded_by TEXT,availability TEXT,created_at TIMESTAMPTZ);
    CREATE TABLE public_content_visibility(content_type TEXT,content_id TEXT,visibility TEXT);
    CREATE TABLE product_inventory_variants(id TEXT,product_id TEXT,color TEXT,size TEXT,active BOOLEAN,stock_on_hand INT,stock_reserved INT);
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
    INSERT INTO rediscovery_eligibility VALUES('new-dress','response-one','{"sourceEventId":"search-one"}',NOW()+INTERVAL '1 day');
    ALTER TABLE search_demand_events ADD COLUMN location TEXT DEFAULT '';
    ALTER TABLE rediscovery_eligibility ADD COLUMN audience_type TEXT DEFAULT 'user';
    ALTER TABLE rediscovery_eligibility ADD COLUMN audience_key TEXT DEFAULT 'buyer-key';
    ALTER TABLE rediscovery_eligibility ADD COLUMN status TEXT DEFAULT 'eligible';`);
  for(const migration of [require('../../backend/migrations/commerce-goals'),require('../../backend/migrations/commerce-goal-transitions')])for(const sql of migration.statements)await db.exec(sql);
  await db.exec(require('../../backend/migrations/growth-loops').statements.find(sql=>sql.includes('CREATE TABLE growth_rate_buckets')));
  // Transactions must retain one connection. The PostgreSQL adapter's generic
  // query() may choose a different connection per statement; use its real pool.
  // PGlite has one connection, so serialize complete transactions for parity.
  let pending=Promise.resolve();
  const queryClient=db.pool||{query:(...args)=>db.query(...args),async connect(){
    const previous=pending;let release;pending=new Promise(resolve=>{release=resolve;});await previous;
    return {query:(...args)=>db.query(...args),release};
  }};
  const store=createPostgresStore({databaseUrl:'postgres://test.invalid/winga',queryClient,demandResolutionEnabled:true});
  return {db,store};
}

