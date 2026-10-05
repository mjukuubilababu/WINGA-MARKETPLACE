const {test}=require('node:test'),assert=require('node:assert/strict');
const {createConversationReferenceReader}=require('../backend/conversation-references');
const order={id:'o1',buyerUsername:'alice',sellerUsername:'bob',productId:'p1',productName:'Dress',quantity:2,totalAmount:10000,
  status:'placed',paymentStatus:'pending',paymentIntentStatus:'awaiting_reference',reserveExpiresAt:new Date(Date.now()+60000).toISOString(),transactionId:'PRIVATE'};
const reader=createConversationReferenceReader({readOrder:async()=>order,readProduct:async id=>id==='missing'?null:
  {id,status:'approved',name:'Dress',price:5000,uploadedBy:'bob',availability:'sold_out',whatsapp:'PRIVATE',moderationNote:'PRIVATE',mediaItems:[{type:'video',status:'ready'}]},
  readCollection:async()=>({id:'c1',title:'Looks',items:[{productId:'p1',name:'Dress',image:'/image.jpg',note:'PRIVATE'}]})});
test('reference projection reads current product state and excludes privileged fields',async()=>{
  const p=await reader('alice','product','p1');assert.equal(p.price,5000);assert.equal(p.availability,'sold_out');
  assert.equal(JSON.stringify(p).includes('PRIVATE'),false);
  assert.equal((await reader('alice','reel','p1')).kind,'reel');
  await assert.rejects(reader('alice','product','missing'),{code:'conversation_reference_unavailable'});
});
test('order, payment and delivery references require canonical participant authorization',async()=>{
  for(const kind of ['order','payment','delivery']) {
    const c=await reader('alice',kind,'o1');assert.equal(c.amount,10000);assert.equal(c.status,'placed');
    assert.equal(JSON.stringify(c).includes('PRIVATE'),false);
    await assert.rejects(reader('eve',kind,'o1'),{status:404});
  }
  assert.equal((await reader('alice','payment','o1')).canSubmitReference,true);
  assert.equal((await reader('bob','payment','o1')).canSubmitReference,false);
});
test('collection projection excludes private notes and invalid identities fail before lookup',async()=>{
  assert.equal(JSON.stringify(await reader('alice','collection','c1')).includes('PRIVATE'),false);
  await assert.rejects(reader('', 'product','p1'),{status:401});
  await assert.rejects(reader('alice','product','../../p1'),{status:400});
  await assert.rejects(reader('alice','wallet','p1'),{status:400});
});

test('exact-ID PostgreSQL reads retain canonical visibility and block clauses on the primary',async()=>{
  const {createPostgresStore}=require('../backend/db'),calls=[];
  const queryClient={query:async(text,params)=>{calls.push({text,params});return {rows:text.includes('SELECT owner_username')?[{owner_username:'bob'}]:text.includes('COUNT(*)')?[{total:0}]:[]};}};
  const store=createPostgresStore({databaseUrl:'postgres://fixture/canonical',queryClient,readQueryClient:{query:async()=>{throw new Error('replica forbidden');}}});
  await store.readProductsPage({limit:1,productId:'p1',viewerUsername:'alice',usePrimary:true});
  const query=calls.find(c=>c.text.includes('ORDER BY p.created_at'));
  assert.match(query.text,/p.id = \$/);assert.ok(query.params.includes('p1'));
  assert.match(query.text,/user_blocks/);assert.match(query.text,/public_content_visibility/);assert.ok(query.params.includes('alice'));
  calls.length=0;assert.equal(await store.readConversationCollection('c1','alice'),null);
  const collection=calls.find(c=>c.text.includes('FROM public_collections c'));
  assert.match(collection.text,/AND c.id = \$3/);assert.deepEqual(collection.params,['bob','alice','c1',2]);
  assert.match(collection.text,/user_blocks/);assert.match(collection.text,/public_content_visibility/);
});
