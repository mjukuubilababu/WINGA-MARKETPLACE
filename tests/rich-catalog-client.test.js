const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function client(fetchJson) {
  const context={WingaModules:{},URLSearchParams,crypto:require('node:crypto').webcrypto};
  context.window=context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/api/communications-client'),'utf8'),context);
  return context.WingaModules.api.communications.createCommunicationsApiClient({baseUrl:'/api',getSession:()=>({username:'alice'}),createAuthHeaders:()=>({'X-Session':'fixture'}),fetchJson});
}
test('bounded catalogs use authenticated canonical queries and reject non-ready public video',async()=>{
  const calls=[],api=client(async(url,options)=>{
    calls.push([url,options.headers]);
    return {products:[{id:'p1',name:'Phone',mediaItems:[{type:'video',status:'ready'}]},{id:'p2',name:'Phone',mediaItems:[{type:'video',status:'processing'}]}]};
  });
  assert.equal((await api.readRichCatalog('reel','Phone')).length,1);
  assert.equal(calls[0][1]['X-Session'],'fixture');assert.match(calls[0][0],/limit=12&q=Phone/);
});
test('order catalogs deduplicate canonical IDs and contact lookup verifies returned identity',async()=>{
  const api=client(async url=>url.includes('/orders/')?{purchases:[{id:'o1',productName:'Phone',paymentIntentStatus:'awaiting_reference'}],sales:[{id:'o1',productName:'Phone'},{id:'o2'}]}:{profile:{username:'bob',fullName:'Bob'}});
  assert.equal((await api.readRichCatalog('order')).length,2);
  assert.equal((await api.readRichCatalog('payment')).length,0);
  assert.equal((await api.readRichContact('bob')).username,'bob');
  await assert.rejects(()=>api.readRichContact('eve'),/contact_lookup_invalid/);
  await assert.rejects(()=>api.readRichContact('https://evil.test'),/contact_lookup_invalid/);
});

test('commerce actions hydrate an exact currently authorized approved product, never the first unrelated result',async()=>{
  const api=client(async(url,options)=>{assert.match(url,/productId=p1/);assert.equal(options.headers['X-Session'],'fixture');return {products:[{id:'p1',status:'approved',price:5000}]};});
  assert.equal((await api.readConversationProduct('p1')).price,5000);
  const denied=client(async()=>({products:[{id:'other',status:'approved'},{id:'p1',status:'pending'}]}));
  await assert.rejects(()=>denied.readConversationProduct('p1'),/conversation_reference_unavailable/);
});

test('order lookup searches canonical IDs before the twelve-result UI bound',async()=>{
  const purchases=Array.from({length:20},(_,i)=>({id:'order-'+i,productName:'Same product'}));
  const api=client(async()=>({purchases,sales:[]}));
  assert.equal((await api.readRichCatalog('order')).length,12);
  assert.deepEqual(Array.from(await api.readRichCatalog('order','order-19'),o=>o.id),['order-19']);
});
