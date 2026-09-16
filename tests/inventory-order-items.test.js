const {test,before,after,beforeEach}=require("node:test");
const assert=require("node:assert/strict");
const {PGlite}=require("@electric-sql/pglite");
const migration=require("../backend/migrations/inventory-order-items");
const {reserveOrderItems,settleOrderInventory,normalizeQuantity}=require("../backend/inventory-order-items");
let db;
before(async()=>{
  db=new PGlite();
  await db.exec(`
    CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT,price NUMERIC(14,2),uploaded_by TEXT,status TEXT);
    CREATE TABLE orders(id TEXT PRIMARY KEY,product_id TEXT,product_name TEXT,price NUMERIC(14,2),currency TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
    INSERT INTO products VALUES('p1','Dress',25000,'seller','approved'),('p2','Shoes',40000,'seller','approved');
    INSERT INTO orders(id,product_id,product_name,price,currency) VALUES('old','p1','Dress',25000,'TZS');
  `);
  for(const sql of migration.statements)await db.exec(sql);
});
after(async()=>db?.close());
beforeEach(async()=>{
  await db.exec(`
    DELETE FROM order_items WHERE order_id<>'old';
    DELETE FROM product_inventory_variants;
    DELETE FROM orders WHERE id<>'old';
    INSERT INTO orders(id,product_id,product_name,price,currency) VALUES('o1','p1','Dress',25000,'TZS');
    INSERT INTO product_inventory_variants(id,product_id,size,color,stock_on_hand)
      VALUES('v1','p1','M','black',3),('v2','p2','42','white',2);
  `);
});
const order={id:"o1",buyerUsername:"buyer",sellerUsername:"seller",currency:"TZS"};
const line=(variantId="v1",productId="p1",quantity=1)=>({variantId,productId,quantity});
async function transaction(fn){
  await db.exec("BEGIN");
  try{const result=await fn(db);await db.exec("COMMIT");return result;}
  catch(error){await db.exec("ROLLBACK");throw error;}
}
async function stock(id="v1"){
  return (await db.query("SELECT stock_on_hand,stock_reserved FROM product_inventory_variants WHERE id=$1",[id])).rows[0];
}
test("migration preserves historic single-product orders without fabricated variant stock",async()=>{
  const row=(await db.query("SELECT quantity,variant_id,inventory_state FROM order_items WHERE order_id='old'")).rows[0];
  assert.deepEqual(row,{quantity:1,variant_id:null,inventory_state:"UNTRACKED"});
});
test("multi-item reservation uses canonical prices and quantities",async()=>{
  const result=await transaction(client=>reserveOrderItems(client,order,[line("v1","p1",2),line("v2","p2",1)]));
  assert.equal(result.total,90000);
  assert.deepEqual(await stock(),{stock_on_hand:3,stock_reserved:2});
  const items=await db.query("SELECT size,color,quantity FROM order_items WHERE order_id='o1' ORDER BY variant_id");
  assert.deepEqual(items.rows,[{size:"M",color:"black",quantity:2},{size:"42",color:"white",quantity:1}]);
});
test("failed basket rolls back every reservation and order line",async()=>{
  await assert.rejects(transaction(client=>reserveOrderItems(client,order,[line("v1","p1",2),line("v2","p2",3)])),/insufficient_stock/);
  assert.deepEqual(await stock(),{stock_on_hand:3,stock_reserved:0});
  assert.equal((await db.query("SELECT id FROM order_items WHERE order_id='o1'")).rows.length,0);
});
test("seller and product ownership cannot be replaced by client line metadata",async()=>{
  await assert.rejects(transaction(client=>reserveOrderItems(client,{...order,sellerUsername:"intruder"},[line()])),/order_seller_mismatch/);
  await assert.rejects(transaction(client=>reserveOrderItems(client,order,[line("v1","p2")])),/variant_unavailable/);
  await assert.rejects(transaction(client=>reserveOrderItems(client,{...order,buyerUsername:"seller"},[line()])),/self_purchase/);
  assert.equal((await stock()).stock_reserved,0);
});
test("cancellation releases reserved stock once",async()=>{
  await transaction(client=>reserveOrderItems(client,order,[line("v1","p1",2)]));
  assert.equal((await transaction(client=>settleOrderInventory(client,"o1","cancelled"))).changed,1);
  assert.equal((await transaction(client=>settleOrderInventory(client,"o1","cancelled"))).changed,0);
  assert.deepEqual(await stock(),{stock_on_hand:3,stock_reserved:0});
});
test("delivery consumes stock once and later cancellation cannot replenish sold units",async()=>{
  await transaction(client=>reserveOrderItems(client,order,[line("v1","p1",2)]));
  await transaction(client=>settleOrderInventory(client,"o1","delivered"));
  await transaction(client=>settleOrderInventory(client,"o1","delivered"));
  await transaction(client=>settleOrderInventory(client,"o1","cancelled"));
  assert.deepEqual(await stock(),{stock_on_hand:1,stock_reserved:0});
});
test("duplicate variants and invalid quantities cannot reserve stock",async()=>{
  assert.equal(normalizeQuantity(1.5),0);
  assert.equal(normalizeQuantity(100),0);
  await assert.rejects(transaction(client=>reserveOrderItems(client,order,[line(),line()])),/duplicate_order_variant/);
  await assert.rejects(transaction(client=>reserveOrderItems(client,order,[line("v1","p1",0)])),/invalid_order_items/);
  assert.equal((await stock()).stock_reserved,0);
});
