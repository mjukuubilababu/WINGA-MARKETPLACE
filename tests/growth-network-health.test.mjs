import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {roomDatabase} from './helpers/shopping-room-database.mjs';
const require=createRequire(import.meta.url),{createNetworkGrowth}=require('../backend/growth-network-health'),{createPostgresStore}=require('../backend/db');
async function fixture(t){const db=await roomDatabase(t);await db.exec(`
 CREATE TABLE users(username TEXT PRIMARY KEY,status TEXT);
 CREATE TABLE products(id TEXT PRIMARY KEY,uploaded_by TEXT,status TEXT,created_at TIMESTAMPTZ);
 CREATE TABLE public_content_visibility(content_type TEXT,content_id TEXT,owner_username TEXT,visibility TEXT,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,row_version INT,PRIMARY KEY(content_type,content_id));
 CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT);
 CREATE TABLE user_follows(follower_username TEXT,followed_username TEXT,status TEXT,created_at TIMESTAMPTZ);
 CREATE TABLE product_likes(product_id TEXT,user_id TEXT,created_at TIMESTAMPTZ);
 CREATE TABLE orders(id TEXT PRIMARY KEY,product_id TEXT,buyer_username TEXT,seller_username TEXT,status TEXT,created_at TIMESTAMPTZ);
 CREATE TABLE reviews(id TEXT PRIMARY KEY,user_id TEXT,product_id TEXT,seller_id TEXT,rating INT,comment TEXT,verified_buyer BOOLEAN,date TIMESTAMPTZ,row_version INT);
 CREATE TABLE review_claims(user_id TEXT,product_id TEXT,review_id TEXT,PRIMARY KEY(user_id,product_id));
 CREATE TABLE encrypted_conversations(id TEXT PRIMARY KEY,kind TEXT);
 CREATE TABLE conversation_crypto_devices(id TEXT PRIMARY KEY,owner_id TEXT);
 CREATE TABLE encrypted_conversation_messages(id TEXT PRIMARY KEY,conversation_id TEXT,sender_device TEXT,created_at TIMESTAMPTZ,ciphertext TEXT);
 CREATE TABLE encrypted_conversation_receipts(message_id TEXT,device_id TEXT,kind TEXT);
 INSERT INTO users VALUES('alice','active'),('bob','active'),('eve','active');
 INSERT INTO products VALUES('public','bob','approved',NOW()-INTERVAL '1 day'),('self','alice','approved',NOW()-INTERVAL '1 day');
 INSERT INTO orders VALUES('delivered','public','alice','bob','delivered',NOW()),('self-order','self','alice','alice','delivered',NOW());
 INSERT INTO reviews VALUES('verified','alice','public','bob',4,'PRIVATE_REVIEW_BODY',TRUE,NOW(),1),('fake','alice','self','alice',5,'PRIVATE_REVIEW_BODY',TRUE,NOW(),1);
 INSERT INTO user_follows VALUES('alice','bob','active',NOW()-INTERVAL '2 days'),('eve','bob','active',NOW()-INTERVAL '2 days');
 INSERT INTO user_blocks VALUES('bob','eve');INSERT INTO product_likes VALUES('public','alice',NOW());
 INSERT INTO encrypted_conversations VALUES('PRIVATE_THREAD_ONE','direct'),('PRIVATE_THREAD_TWO','direct'),('PRIVATE_ROOM','shopping-room');
 INSERT INTO conversation_crypto_devices VALUES('a','alice'),('a2','alice'),('b','bob');
 INSERT INTO encrypted_conversation_messages VALUES
 ('one','PRIVATE_THREAD_ONE','a',NOW()-INTERVAL '10 minutes','PRIVATE_CIPHERTEXT'),('two','PRIVATE_THREAD_ONE','a2',NOW()-INTERVAL '8 minutes','PRIVATE_CIPHERTEXT'),
 ('three','PRIVATE_THREAD_TWO','a',NOW()-INTERVAL '10 minutes','PRIVATE_CIPHERTEXT'),('four','PRIVATE_THREAD_TWO','b',NOW()-INTERVAL '8 minutes','PRIVATE_CIPHERTEXT'),
 ('room','PRIVATE_ROOM','b',NOW(),'PRIVATE_CIPHERTEXT');
 INSERT INTO encrypted_conversation_receipts VALUES('one','a2','read'),('three','b','read');`);return db;}
test('network utility counts distinct-account replies and verified public trust without private content',async t=>{
 const db=await fixture(t),report=await createNetworkGrowth({readQuery:(...args)=>db.query(...args)}).readNetworkLoopHealth();
 assert.deepEqual(report.conversation,{entryCount:2,acceptedMessages:4,responseCount:1,responseRate:0.5,timeToReplySeconds:120,recipientReadCount:1});
 assert.deepEqual(report.trust,{verifiedPublicReviews:1,reviewedProducts:1,reviewedSellers:1,averageRating:4});
 assert.equal(report.follow.entryCount,1);assert.equal(report.follow.pairsWithCanonicalSave,1);
 for(const secret of ['PRIVATE_REVIEW_BODY','PRIVATE_CIPHERTEXT','PRIVATE_THREAD_ONE','alice','bob'])assert.equal(JSON.stringify(report).includes(secret),false);
 await db.exec("INSERT INTO public_content_visibility(content_type,content_id,visibility) VALUES('review','verified','private')");
 assert.equal((await createNetworkGrowth({readQuery:(...args)=>db.query(...args)}).readNetworkLoopHealth()).trust.verifiedPublicReviews,0);
});
test('canonical review proof rejects self orders and binds seller, verification and time to delivered evidence',async t=>{
 const db=await fixture(t);await db.exec('DELETE FROM reviews');
 const store=createPostgresStore({databaseUrl:'postgres://isolated/review',queryClient:db});
 const review={id:'review',userId:'alice',productId:'self',sellerId:'forged',rating:5,comment:'Good',verifiedBuyer:false,date:'2099-01-01T00:00:00Z'};
 assert.deepEqual(await store.createReview(review),{created:false,code:'not_delivered'});
 const result=await store.createReview({...review,productId:'public'});assert.equal(result.created,true);assert.equal(result.review.sellerId,'bob');assert.equal(result.review.verifiedBuyer,true);
 assert.ok(new Date(result.review.date).getTime()<Date.now()+1000);
 const saved=(await db.query("SELECT seller_id,verified_buyer,date FROM reviews WHERE id='review'")).rows[0];assert.equal(saved.seller_id,'bob');assert.equal(saved.verified_buyer,true);
 assert.deepEqual(await store.createReview({...review,id:'retry',productId:'public'}),{created:false,code:'duplicate_review'});
});
