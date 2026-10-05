const {test}=require('node:test'),assert=require('node:assert/strict');
const rich=require('../src/chat/rich-content');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const time='2026-10-05T10:00:00.000Z';
const row=(n,owner='alice',value='Original',seconds=n)=>({id:id(n),owner,peer:owner==='alice'?'bob':'alice',
  conversationId:id(90),timestamp:new Date(Date.parse(time)+seconds*1000).toISOString(),message:value,status:'sent'});
test('versioned content roundtrips every active reference without financial authority',()=>{
  for(const type of ['product','reel','short','collection']) {
    const c=rich.create(type,'Caption',{ids:['product-1']});assert.deepEqual(rich.parse(rich.encode(c)),c);
  }
  for(const type of ['order','payment','delivery'])assert.equal(rich.parse(rich.encode(rich.create(type,'',{id:'order-1'}))).type,type);
  assert.equal(rich.parse(rich.encode(rich.create('text','Habari \uD83D\uDC4B\nBonjour'))).text,'Habari \uD83D\uDC4B\nBonjour');
});
test('strict schema bounds message sizes, typed identities, URL-like contacts and coordinates',()=>{
  const bad=[rich.create('text','ok'),rich.create('location','',{latitude:0,longitude:0,label:''})];
  bad[0].version=2;bad[1].data.latitude=91;
  for(const c of bad)assert.throws(()=>rich.encode(c),/rich_content_invalid/);
  assert.throws(()=>rich.create('text','x'.repeat(4097)));
  assert.throws(()=>rich.create('payment','',{id:'order-1',amount:10000}));
  assert.throws(()=>rich.create('contact','',{username:'https://evil.test',name:'Someone'}));
  assert.throws(()=>rich.create('product','',{ids:['a','a']}));
  assert.equal(rich.parse(rich.PREFIX+'{broken'),null);
});
test('quoted replies preserve IDs and bounded encrypted context',()=>{
  const c=rich.create('text','Answer',{}, {id:id(1),quote:'Question'});
  assert.equal(rich.parse(rich.encode(c)).reply.id,id(1));
  assert.throws(()=>rich.create('text','Answer',{}, {id:id(1),quote:'x'.repeat(257)}));
});
test('reactions are projected events, converge per actor and do not create normal bubbles',()=>{
  const reaction=(n,owner,emoji)=>row(n,owner,rich.encode(rich.create('reaction','',{targetId:id(1),emoji})));
  const rows=rich.project([reaction(4,'bob',''),row(1),reaction(2,'bob',rich.REACTIONS[0]),reaction(3,'alice',rich.REACTIONS[1])],'alice');
  assert.equal(rows.length,1);assert.deepEqual(rows[0].reactions,[{emoji:rich.REACTIONS[1],owners:['alice']}]);
});
test('only original sender can edit text within the approved fifteen-minute window',()=>{
  const edit=(n,owner,text,seconds)=>row(n,owner,rich.encode(rich.create('edit',text,{targetId:id(1)})),seconds);
  const rows=rich.project([row(1),edit(2,'bob','Forbidden',2),edit(3,'alice','Edited',3),edit(4,'alice','Late',902)],'bob');
  assert.equal(rows.length,1);assert.equal(rows[0].richContent.text,'Edited');assert.equal(rows[0].edited,true);
  assert.equal(rich.canEdit(row(1),'alice',Date.parse(time)+901001),false);
  const media=row(5,'alice','WINGA-MEDIA/1\n{}');assert.equal(rich.canEdit(media,'alice',Date.parse(time)+6000),false);
});
test('delete for me is owner scoped and cannot hide another participant history',()=>{
  const hide=row(2,'alice',rich.encode(rich.create('hide','',{targetId:id(1)})));
  assert.equal(rich.project([row(1),hide],'alice').length,0);
  assert.equal(rich.project([row(1),hide],'bob').length,1);
});
test('cross-conversation mutation, missing targets and unknown event actors are ignored',()=>{
  const c=rich.encode(rich.create('edit','Changed',{targetId:id(1)}));
  const evil={...row(2,'alice',c),conversationId:id(99)};
  const stranger=row(3,'eve',rich.encode(rich.create('reaction','',{targetId:id(1),emoji:rich.REACTIONS[0]})));
  const rows=rich.project([row(1),evil,stranger,row(4,'alice',rich.encode(rich.create('hide','',{targetId:id(88)})))],'alice');
  assert.equal(rows.length,1);assert.equal(rows[0].message,'Original');assert.deepEqual(rows[0].reactions,[]);
});

test('pending and pre-target mutations cannot prematurely alter accepted history',()=>{
  const make=(n,type,seconds)=>row(n,'alice',rich.encode(rich.create(type,type==='edit'?'Changed':'',{targetId:id(1)})),seconds);
  const pending={...make(2,'edit',3),status:'pending'};
  const rows=rich.project([row(1),pending,make(3,'hide',0)],'alice');
  assert.equal(rows.length,2);assert.equal(rows[0].message,'Original');assert.equal(rows[1].eventRecord,true);
  assert.equal(rich.canEdit(row(1,'alice','WINGA-CONTENT/2\n{}'),'alice',Date.parse(time)+2000),false);
  assert.equal(rich.canEdit({...row(1),richContent:rich.create('product','',{ids:['p1']})},'alice',Date.parse(time)+2000),false);
});

test('equal-time reactions converge deterministically regardless of transport ordering',()=>{
  const reaction=(n,emoji)=>row(n,'bob',rich.encode(rich.create('reaction','',{targetId:id(1),emoji})),5);
  const values=[row(1),reaction(2,rich.REACTIONS[0]),reaction(3,rich.REACTIONS[1])];
  assert.deepEqual(rich.project(values,'alice'),rich.project(values.slice().reverse(),'alice'));
});
