const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(id);
function createConversationReferenceReader({readProduct,readOrder,readCollection}) {
  return async function read(owner,kind,id) {
    if(!validId(owner))fail(401,'session_required');
    if(!validId(id)||!['product','reel','short','collection','order','payment','delivery'].includes(kind))fail(400,'invalid_conversation_reference');
    if(kind==='collection') {
      const c=await readCollection(id,owner);if(!c)fail(404,'conversation_reference_unavailable');
      return {kind,id:c.id,title:c.title,items:(c.items||[]).slice(0,30).map(p=>({id:p.productId,name:p.name,image:p.image||''}))};
    }
    if(['product','reel','short'].includes(kind)) {
      const p=await readProduct(id,owner);if(!p||p.status!=='approved')fail(404,'conversation_reference_unavailable');
      if(kind!=='product'&&!(p.mediaItems||[]).some(m=>m.type==='video'&&m.status==='ready'&&m.moderationStatus!=='rejected'))fail(404,'conversation_reference_unavailable');
      return {kind,id:p.id,name:p.name,price:p.price,currency:p.currency||'TZS',image:p.image||p.images?.[0]||'',
        availability:p.availability||'available',uploadedBy:p.uploadedBy,updatedAt:p.updatedAt||'',stockQuantity:p.stockQuantity??null};
    }
    const order=await readOrder(id,owner);
    if(!order||![order.buyerUsername,order.sellerUsername].includes(owner))fail(404,'conversation_reference_unavailable');
    if(kind==='payment'&&!order.paymentIntentStatus)fail(404,'conversation_reference_unavailable');
    return {kind,id:order.id,productId:order.productId,productName:order.productName,quantity:order.quantity||1,
      amount:order.totalAmount,currency:order.currency||'TZS',status:order.status,paymentStatus:order.paymentStatus,
      paymentIntentStatus:order.paymentIntentStatus||'',reserveExpiresAt:order.reserveExpiresAt||'',
      canSubmitReference:kind==='payment'&&order.buyerUsername===owner&&order.status==='placed'
        &&order.paymentIntentStatus==='awaiting_reference'&&Date.parse(order.reserveExpiresAt)>Date.now(),
      items:(order.items||[]).slice(0,10).map(item=>({productId:item.productId,name:item.productName,size:item.size||'',color:item.color||'',quantity:item.quantity}))};
  };
}
module.exports={createConversationReferenceReader};
