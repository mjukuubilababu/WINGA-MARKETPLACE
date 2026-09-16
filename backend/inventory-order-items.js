function normalizeQuantity(value) {
  if (typeof value !== "number" && typeof value !== "string") return 0;
  const quantity=Number(value);
  return Number.isInteger(quantity) && quantity>=1 && quantity<=99 ? quantity : 0;
}

// Caller owns the canonical order transaction. All lines succeed or roll back together.
async function reserveOrderItems(client, order, items) {
  if(!Array.isArray(items) || !items.length || items.length>10) throw new Error("invalid_order_items");
  if(items.some(item=>!item || typeof item.productId!=="string" || typeof item.variantId!=="string")) throw new Error("invalid_order_items");
  if(order.currency && order.currency!=="TZS") throw new Error("unsupported_inventory_currency");
  const lines=items.map(item=>({...item,quantity:normalizeQuantity(item.quantity)}));
  if(lines.some(item=>!item.quantity || !item.productId || !item.variantId)) throw new Error("invalid_order_items");
  if(new Set(lines.map(item=>item.variantId)).size!==lines.length) throw new Error("duplicate_order_variant");
  let total=0;
  for(const item of lines.sort((a,b)=>a.productId.localeCompare(b.productId) || a.variantId.localeCompare(b.variantId))){
    const found=await client.query(
      `SELECT v.id,v.product_id,v.size,v.color,p.name,p.price,p.uploaded_by,p.status,
        v.stock_on_hand,v.stock_reserved,v.active
       FROM product_inventory_variants v JOIN products p ON p.id=v.product_id
       WHERE v.id=$1 AND v.product_id=$2 FOR UPDATE OF p,v`,[item.variantId,item.productId]);
    const variant=found.rows?.[0];
    if(!variant || !variant.active || variant.status!=="approved") throw new Error("variant_unavailable");
    if(variant.uploaded_by!==order.sellerUsername) throw new Error("order_seller_mismatch");
    if(variant.uploaded_by===order.buyerUsername) throw new Error("self_purchase");
    const price=Number(variant.price);
    if(variant.price==null || !Number.isFinite(price) || price<=0) throw new Error("invalid_product_price");
    if(Number(variant.stock_on_hand)-Number(variant.stock_reserved)<item.quantity) throw new Error("insufficient_stock");
    await client.query(
      `UPDATE product_inventory_variants SET stock_reserved=stock_reserved+$2,
        row_version=row_version+1,updated_at=NOW() WHERE id=$1`,[variant.id,item.quantity]);
    await client.query(
      `INSERT INTO order_items(id,order_id,product_id,variant_id,product_name,size,color,quantity,unit_price,currency,inventory_state)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'RESERVED')`,
      [`${order.id}:${variant.id}`,order.id,item.productId,variant.id,variant.name,variant.size,variant.color,item.quantity,price,order.currency || "TZS"]);
    total+=Math.round(price*100)*item.quantity;
  }
  return {total:total/100,count:lines.length};
}

async function settleOrderInventory(client, orderId, status) {
  if(!["cancelled","delivered"].includes(status)) return {changed:0};
  const rows=await client.query(
    `SELECT id,variant_id,quantity FROM order_items WHERE order_id=$1 AND inventory_state='RESERVED'
     ORDER BY variant_id FOR UPDATE`,[orderId]);
  for(const item of rows.rows||[]){
    await client.query(
      `UPDATE product_inventory_variants SET stock_reserved=stock_reserved-$2,
        stock_on_hand=stock_on_hand-$3,row_version=row_version+1,updated_at=NOW() WHERE id=$1`,
      [item.variant_id,item.quantity,status==="delivered"?item.quantity:0]);
    await client.query("UPDATE order_items SET inventory_state=$2 WHERE id=$1",
      [item.id,status==="delivered"?"COMMITTED":"RELEASED"]);
  }
  return {changed:(rows.rows||[]).length};
}

async function lockOrderInventoryProducts(client, orderIds) {
  await client.query(`SELECT id FROM products WHERE id IN (
    SELECT product_id FROM orders WHERE id=ANY($1::text[])
    UNION SELECT product_id FROM order_items WHERE order_id=ANY($1::text[])
  ) ORDER BY id FOR UPDATE`, [orderIds]);
}

async function refreshOrderInventoryAvailability(client,orderId) {
  await client.query(`UPDATE products p SET availability=CASE
      WHEN EXISTS(SELECT 1 FROM product_inventory_variants v WHERE v.product_id=p.id
        AND v.active AND v.stock_on_hand>v.stock_reserved) THEN 'available'
      WHEN EXISTS(SELECT 1 FROM product_inventory_variants v WHERE v.product_id=p.id AND v.stock_reserved>0)
        THEN 'reserved' ELSE 'sold_out' END,
      updated_at=NOW(),row_version=row_version+1
    WHERE p.id IN (SELECT product_id FROM order_items WHERE order_id=$1 AND variant_id IS NOT NULL)`,[orderId]);
}

module.exports={normalizeQuantity,reserveOrderItems,settleOrderInventory,refreshOrderInventoryAvailability,lockOrderInventoryProducts};
