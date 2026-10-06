const test=require('node:test'),assert=require('node:assert/strict');
const {search,MAX_SCAN}=require('../src/chat/message-search');
const options={owner:'alice',peer:'bob',query:'sofa'};
const row=(id,more={})=>({id,senderId:'bob',receiverId:'alice',message:'Cream sofa',timestamp:'2026-10-06T10:00:00Z',...more});
test('search is local, bounded, Unicode-compatible and returns only whitelisted visible fields',()=>{
  const value=row('one',{descriptor:{key:'SECRET'},ciphertext:'SECRET',recoveryKey:'SECRET'});
  assert.deepEqual(search([value],{...options,query:'ＳＯＦＡ'}).items,
    [{id:'one',sender:'bob',text:'Cream sofa',productName:'',timestamp:value.timestamp}]);
  assert.equal(JSON.stringify(search([value],options)).includes('SECRET'),false);
  assert.equal(search([value],{...options,query:'cream sofa'}).matches,1);
  assert.equal(search([value],{...options,query:'cream missing'}).matches,0);
});
test('search excludes unrelated, hidden, deleted, mutation, unavailable and reserved envelopes',()=>{
  const rows=[row('ok'),row('outsider',{receiverId:'mallory'}),row('hidden',{hidden:true}),row('deleted',{deleted:true}),
    row('event',{eventRecord:true}),row('unknown',{richUnavailable:true}),
    row('raw',{message:'WINGA-MEDIA/sofa secret'}),row('raw2',{message:'WINGA-CONTENT/sofa secret'}),
    row('mutation',{richContent:{type:'edit',text:'sofa'}}),row('bad-date',{timestamp:'invalid'}),row('ok')];
  assert.deepEqual(search(rows,options).items.map(v=>v.id),['ok']);
});
test('search uses edited projection, products, sender and inclusive UTC dates without network lookup',()=>{
  const rows=[row('edited',{message:'OLD SECRET',richContent:{type:'text',text:'new sofa'}}),
    row('product',{message:'',richContent:{type:'product',text:'',data:{ids:['product-123']}}}),
    row('mine',{senderId:'alice',receiverId:'bob',timestamp:'2026-10-07T00:00:00Z'})];
  assert.equal(search(rows,{...options,query:'OLD SECRET'}).matches,0);
  assert.deepEqual(search(rows,{...options,query:'product-123'}).items.map(v=>v.id),['product']);
  assert.deepEqual(search(rows,{...options,query:'',sender:'alice'}).items.map(v=>v.id),['mine']);
  assert.deepEqual(search(rows,{...options,from:'2026-10-06',to:'2026-10-06'}).items.map(v=>v.id),['edited']);
  assert.equal(search(rows,{...options,from:'2026-10-07',to:'2026-10-07'}).matches,1);
});
test('invalid filters fail closed and result/storage bounds are explicit',()=>{
  for(const more of [{owner:''},{peer:'alice'},{sender:'mallory'},{query:'x'.repeat(201)},{limit:101},
    {from:'2026-02-30'},{to:'not-date'},{from:'2026-10-07',to:'2026-10-06'}])
    assert.throws(()=>search([], {...options,...more}),{code:'message_search_invalid'});
  const result=search(Array.from({length:MAX_SCAN+1},(_,i)=>row(String(i))),options);
  assert.equal(result.items.length,100);assert.equal(result.truncated,true);
  assert.equal(result.matches,MAX_SCAN);assert.equal(result.scope,'loaded-device-history');
});
