import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {roomDatabase} from './helpers/shopping-room-database.mjs';
const require=createRequire(import.meta.url);
const {readSellerOpportunityHealth}=require('../backend/growth-marketplace');

async function fixture(t){
  const db=await roomDatabase(t);
  await db.exec(`CREATE TABLE users(username TEXT,status TEXT);
    CREATE TABLE products(id TEXT,uploaded_by TEXT,status TEXT,price NUMERIC);
    CREATE TABLE public_content_visibility(content_type TEXT,content_id TEXT,visibility TEXT);
    CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT);
    CREATE TABLE supply_responses(response_id TEXT,seller_id TEXT,opportunity_id TEXT,product_id TEXT,created_at TIMESTAMPTZ,status TEXT,action_type TEXT);
    CREATE TABLE rediscovery_eligibility(eligibility_id TEXT,supply_response_id TEXT,product_id TEXT,audience_type TEXT,audience_key TEXT);
    CREATE TABLE commerce_order_outcomes(order_id TEXT,eligibility_id TEXT,seller_id TEXT,product_id TEXT,audience_key TEXT,outcome_type TEXT,occurred_at TIMESTAMPTZ);
    CREATE TABLE orders(id TEXT,product_id TEXT,seller_username TEXT,buyer_username TEXT,status TEXT,payment_status TEXT);
    INSERT INTO users VALUES('seller','active'),('buyer','active');
    INSERT INTO products VALUES('dress','seller','approved',100);
    INSERT INTO supply_responses VALUES('first','seller','need-one','dress',NOW()-INTERVAL '45 days','active','restock');
    INSERT INTO rediscovery_eligibility VALUES('eligible','first','dress','user','opaque-audience');
    INSERT INTO orders VALUES('order','dress','seller','buyer','delivered','paid');
    INSERT INTO commerce_order_outcomes VALUES
      ('order','eligible','seller','dress','opaque-audience','created',NOW()-INTERVAL '41 days'),
      ('order','eligible','seller','dress','opaque-audience','paid',NOW()-INTERVAL '40 days'),
      ('order','eligible','seller','dress','opaque-audience','delivered',NOW()-INTERVAL '39 days');`);
  return {db,read:()=>readSellerOpportunityHealth({readQuery:(...args)=>db.query(...args)})};
}

test('seller value uses owned canonical outcome lineage and mature distinct-Opportunity repeat cohorts',async t=>{
  const {db,read}=await fixture(t);
  // Many eligibility/outcome rows must not inflate seller-level activation.
  await db.exec(`INSERT INTO supply_responses VALUES
    ('retry-same','seller','need-one','dress',NOW()-INTERVAL '38 days','active','restock'),
    ('next','seller','need-two','dress',NOW()-INTERVAL '35 days','active','create_product');
    INSERT INTO rediscovery_eligibility VALUES('extra','first','dress','user','other-audience');`);
  const report=await read();
  assert.equal(report.responders,1);assert.equal(report.withOrderStart,1);
  assert.equal(report.withPaidOrder,1);assert.equal(report.withDeliveredOrder,1);
  assert.equal(report.mature7,1);assert.equal(report.repeat7,1);assert.equal(report.repeat7Rate,1);
  assert.equal(report.mature30,1);assert.equal(report.repeat30,1);assert.equal(report.repeat30Rate,1);
  assert.equal(Math.round(report.timeToFirstValueSeconds),5*86400);
  for(const privateValue of ['opaque-audience','need-one','dress','eligible','buyer'])
    assert.equal(JSON.stringify({...report,limitations:[]}).includes(privateValue),false);
  await db.exec("DELETE FROM supply_responses WHERE response_id='next'");
  const same=await read();assert.equal(same.repeat7,0);assert.equal(same.repeat30,0);
});

test('immature seller value has unknown repeat rates and responses alone are not value',async t=>{
  const {db,read}=await fixture(t);
  await db.exec("UPDATE commerce_order_outcomes SET occurred_at=NOW()-INTERVAL '1 day'");
  let report=await read();assert.equal(report.withPaidOrder,1);
  assert.equal(report.mature7,0);assert.equal(report.repeat7Rate,null);assert.equal(report.repeat30Rate,null);
  await db.exec('DELETE FROM commerce_order_outcomes');report=await read();
  assert.equal(report.responders,1);assert.equal(report.withPaidOrder,0);assert.equal(report.timeToFirstValueSeconds,null);
});

test('seller value rejects mismatched, missing, self, cancelled, refunded, blocked and unsafe evidence',async t=>{
  const {db,read}=await fixture(t);
  for(const [change,restore] of [
    ["UPDATE commerce_order_outcomes SET audience_key='different' WHERE outcome_type='created'","UPDATE commerce_order_outcomes SET audience_key='opaque-audience'"],
    ["UPDATE commerce_order_outcomes SET product_id='foreign'","UPDATE commerce_order_outcomes SET product_id='dress'"],
    ["UPDATE commerce_order_outcomes SET seller_id='foreign'","UPDATE commerce_order_outcomes SET seller_id='seller'"],
    ["UPDATE commerce_order_outcomes SET outcome_type='unknown' WHERE outcome_type='created'","UPDATE commerce_order_outcomes SET outcome_type='created' WHERE outcome_type='unknown'"],
    ["UPDATE orders SET buyer_username='seller'","UPDATE orders SET buyer_username='buyer'"],
    ["UPDATE orders SET status='cancelled'","UPDATE orders SET status='delivered'"],
    ["UPDATE orders SET payment_status='refunded'","UPDATE orders SET payment_status='paid'"],
    ["INSERT INTO user_blocks VALUES('seller','buyer')","DELETE FROM user_blocks"],
    ["UPDATE users SET status='suspended' WHERE username='buyer'","UPDATE users SET status='active' WHERE username='buyer'"],
    ["INSERT INTO public_content_visibility VALUES('product','dress','private')","DELETE FROM public_content_visibility"],
    ["UPDATE products SET price=0","UPDATE products SET price=100"],
    ["UPDATE supply_responses SET action_type='dismiss'","UPDATE supply_responses SET action_type='restock'"]
  ]){
    await db.exec(change);const report=await read();assert.equal(report.withPaidOrder,0,change);assert.equal(report.withDeliveredOrder,0,change);
    await db.exec(restore);assert.equal((await read()).withPaidOrder,1,restore);
  }
});
