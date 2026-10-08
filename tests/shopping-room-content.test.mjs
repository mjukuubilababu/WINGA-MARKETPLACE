import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {encodeRoomContent,parseRoomContent,projectRoomContent,resolveRoomProducts,createSellerQuestion,compareRoomProducts} from '../src/chat/shopping-room-content.mjs';
import rich from '../src/chat/rich-content.js';
const cid=randomUUID(),devices={alice:randomUUID(),bob:randomUUID(),carol:randomUUID(),bob2:randomUUID()};
const roster=[{owner:'alice',id:devices.alice,role:'admin'},{owner:'bob',id:devices.bob,role:'member'},
  {owner:'carol',id:devices.carol,role:'member'},{owner:'bob',id:devices.bob2,role:'member'}];
const epochs=new Map([['1',roster],['2',roster.filter(m=>m.owner!=='carol')]]),options={conversationId:cid,epochs,now:Date.parse('2026-10-06T12:00:00.000Z')};
const row=(sequence,owner,type,data,extra={})=>({id:randomUUID(),kind:'shopping-room',conversationId:cid,epoch:'1',owner,deviceId:devices[owner],
  sequence:String(sequence),timestamp:new Date(Date.parse('2026-10-06T10:00:00.000Z')+Number(sequence)*1000).toISOString(),status:'delivered',
  message:encodeRoomContent(type,data),...extra});
const product=(seq=1)=>row(seq,'alice','product-share',{productId:'product-1',note:'Chosen privately',snapshot:{name:'Old title',currency:'TZS',unitPriceMinor:10000}});
const poll=(seq=2)=>row(seq,'alice','poll-create',{question:'Which one?',options:[{id:randomUUID(),label:'First'},{id:randomUUID(),label:'Second'}],closesAt:null});

test('comparison uses only current authorized catalog attributes and keeps missing data unknown',()=>{
  const a=product(),b=row(2,'bob','product-share',{productId:'product-2',note:'',snapshot:null}),board=projectRoomContent([a,b],options);
  const catalog=new Map([['product-1',{id:'product-1',status:'approved',name:'Current',price:65000,currency:'TZS',uploadedBy:'seller',sizes:['M','L'],stockQuantity:0,availability:'sold_out'}]]);
  const compared=compareRoomProducts(board,['product-1','product-2'],catalog);
  assert.equal(compared[0].price,65000);assert.equal(compared[0].stock,0);assert.deepEqual(compared[0].sizes,['M','L']);
  assert.equal(compared[1].price,null);assert.equal(compared[1].availability,null);assert.equal(compared[1].available,false);
  catalog.set('product-1',{id:'product-1',status:'pending',price:99,sizes:['S']});assert.equal(compareRoomProducts(board,['product-1','product-2'],catalog)[0].price,null);
  for(const ids of [['product-1'],['product-1','product-1'],['product-1','foreign']])assert.throws(()=>compareRoomProducts(board,ids,catalog));
});
test('comparison rejects malformed attributes without inferring votes, currency or stock from notes and snapshots',()=>{
  const a=product(),b=row(2,'bob','product-share',{productId:'product-2',note:'100 votes',snapshot:null}),board=projectRoomContent([a,b],options);
  const c=compareRoomProducts(board,['product-1','product-2'],new Map([['product-1',{id:'product-1',status:'approved',price:'65000',stockQuantity:-1,sizes:['M',{}],colors:'red'}]]))[0];
  assert.equal(c.currency,null);assert.equal(c.price,null);assert.equal(c.stock,null);assert.equal(c.sizes,null);assert.equal(c.colors,null);assert.equal(Object.hasOwn(c,'votes'),false);
});
test('seller disclosure schemas reject room metadata, quotes, unknown fields and oversized texts',()=>{
  const id=randomUUID();for(const type of ['seller-question','seller-response']){
    const c=rich.create(type,'Question',{questionId:id,productId:'product-1'});assert.deepEqual(rich.parse(rich.encode(c)),c);
    for(const value of [{...c,reply:{id,quote:'private room history'}},{...c,data:{...c.data,roomId:cid}},{...c,text:'x'.repeat(2049)}])assert.throws(()=>rich.encode(value));
  }
});
test('Room seller cards require verified source hashes, original requester and exact answer binding',()=>{
  const share=product(),id=randomUUID(),answerId=randomUUID(),q=row(2,'bob','seller-question',{questionId:id,shareId:share.id,productId:'product-1',sellerId:'seller',question:'Size M?'}),
    answer=row(3,'bob','seller-response',{questionId:id,answerId,answer:'Yes, M is available.'});
  assert.equal(projectRoomContent([share,q,answer],options).sellerQuestions.length,0);
  const sellerEvidence=new Map([[id,{question:{id,shareId:share.id,productId:'product-1',sellerId:'seller',buyerId:'bob'},questionText:'Size M?',answer:{messageId:answerId},answerText:'Yes, M is available.'}]]);
  const result=projectRoomContent([answer,q,share,q],{...options,sellerEvidence});assert.equal(result.sellerQuestions[0].answer.text,'Yes, M is available.');
  for(const fake of [{...answer,owner:'carol',deviceId:devices.carol}, {...answer,message:encodeRoomContent('seller-response',{questionId:id,answerId,answer:'Forged'})}])
    assert.equal(projectRoomContent([share,q,fake],{...options,sellerEvidence}).sellerQuestions[0].answer,null);
});

test('strict room content roundtrips all core board and poll commands without becoming direct text',()=>{
  const share=product(),p=poll();
  for(const [type,data] of [['product-share',parseRoomContent(share.message).data],['product-remove',{shareId:share.id}],['shortlist',{shareId:share.id,selected:true}],
    ['poll-create',parseRoomContent(p.message).data],['poll-vote',{pollId:p.id,optionId:null}],['poll-close',{pollId:p.id}]]) {
    const encoded=encodeRoomContent(type,data);assert.equal(parseRoomContent(encoded).type,type);assert.equal(rich.contentOf({message:encoded}),null);
  }
});
test('room contracts reject executable URLs, money commands, malformed IDs, unknown fields and non-integer prices',()=>{
  const d=parseRoomContent(product().message).data;
  for(const [type,data]of [['product-share',{...d,productId:'https://seller/private'}],['product-share',{...d,roomHistory:[]}],
    ['product-share',{...d,snapshot:{...d.snapshot,unitPriceMinor:1.1}}],['product-share',{...d,note:'x'.repeat(2049)}],
    ['shortlist',{shareId:randomUUID(),selected:1}],['wallet-pay',{amount:10000}],['poll-vote',{pollId:'broken',optionId:null}]])
    assert.throws(()=>encodeRoomContent(type,data),{code:'room_content_invalid'});
  assert.equal(parseRoomContent('WINGA-ROOM/1\n{"type":"wallet-pay"}'),null);
});
test('order references converge as pointers only and never encode canonical financial truth',()=>{
  const a=row(1,'alice','order-reference',{orderId:'order-1'}),b=row(2,'bob','order-reference',{orderId:'order-1'});
  const result=projectRoomContent([b,a,b],options);
  assert.deepEqual(result.orders,[{orderId:'order-1',referenceId:a.id,sharedBy:['alice','bob']}]);
  assert.deepEqual(projectRoomContent([a,b],options),result);
  assert.equal(parseRoomContent(a.message).type,'order-reference');
  assert.deepEqual(projectRoomContent([{...a,status:'pending',sequence:undefined}],options).orders,[]);
  for(const data of [{orderId:'https://host/private'},{orderId:'order-1',amount:10000},{orderId:'order-1',status:'paid'},
    {orderId:'order-1',paymentKey:'private'},{orderId:'order-1',items:[]}]){
    assert.throws(()=>encodeRoomContent('order-reference',data),{code:'room_content_invalid'});
    assert.equal(parseRoomContent('WINGA-ROOM/1\n'+JSON.stringify({version:1,type:'order-reference',data})),null);
  }
  assert.throws(()=>projectRoomContent([{...b,epoch:'2',owner:'carol',deviceId:devices.carol}],options),{code:'room_history_membership_required'});
});
test('poll options are bounded and identities cannot collide',()=>{
  const p=parseRoomContent(poll().message).data;
  for(const data of [{...p,options:[p.options[0]]},{...p,options:Array.from({length:9},()=>({id:randomUUID(),label:'x'}))},
    {...p,options:[p.options[0],p.options[0]]},{...p,closesAt:'2026-10-07'}])assert.throws(()=>encodeRoomContent('poll-create',data));
});
test('board and votes converge regardless of history arrival order, duplicate delivery or device switching',()=>{
  const share=product(),p=poll(),choice=parseRoomContent(p.message).data.options;
  const events=[share,p,row(3,'bob','shortlist',{shareId:share.id,selected:true}),row(4,'bob','poll-vote',{pollId:p.id,optionId:choice[0].id}),
    row(5,'bob','poll-vote',{pollId:p.id,optionId:choice[1].id},{deviceId:devices.bob2}),
    row(6,'carol','poll-vote',{pollId:p.id,optionId:choice[1].id}),row(7,'bob','shortlist',{shareId:share.id,selected:false},{deviceId:devices.bob2})];
  const result=projectRoomContent(events,options);
  assert.deepEqual(projectRoomContent([...events].reverse().concat({...events[3],status:'read'}),options),result);
  assert.deepEqual(result.products[0].shortlistedBy,[]);assert.deepEqual(result.polls[0].options.map(o=>o.votes),[0,2]);
  assert.equal(Object.keys(result.polls[0].ballots).length,2);
});
test('pending outbox entries never increment ballots or appear as committed board items',()=>{
  const share=product(),p=poll(),vote=row(3,'bob','poll-vote',{pollId:p.id,optionId:parseRoomContent(p.message).data.options[0].id},{status:'pending',sequence:undefined});
  const result=projectRoomContent([share,p,vote,{...product(4),status:'pending',sequence:undefined}],options);
  assert.equal(result.products.length,1);assert.equal(result.polls[0].options[0].votes,0);
});
test('withdrawal is per account, not an extra vote per native device',()=>{
  const p=poll(1),option=parseRoomContent(p.message).data.options[0].id;
  const result=projectRoomContent([p,row(2,'bob','poll-vote',{pollId:p.id,optionId:option}),row(3,'bob','poll-vote',{pollId:p.id,optionId:null},{deviceId:devices.bob2})],options);
  assert.deepEqual(result.polls[0].ballots,{});
});
test('only author or authenticated epoch admin can close a poll or remove a shared product',()=>{
  const share=product(),p=row(2,'bob','poll-create',parseRoomContent(poll().message).data);
  const result=projectRoomContent([share,p,row(3,'carol','product-remove',{shareId:share.id}),row(4,'carol','poll-close',{pollId:p.id}),
    row(5,'alice','poll-close',{pollId:p.id})],options);
  assert.equal(result.products.length,1);assert.equal(result.polls[0].open,false);assert.equal(result.rejected.length,2);
  assert.equal(projectRoomContent([share,row(2,'alice','product-remove',{shareId:share.id})],options).products.length,0);
});
test('closed polls, absent options and votes at the deadline are rejected without silently re-opening the poll',()=>{
  const p=row(1,'alice','poll-create',{...parseRoomContent(poll().message).data,closesAt:'2026-10-06T10:00:05.000Z'}),option=parseRoomContent(p.message).data.options[0].id;
  const result=projectRoomContent([p,row(2,'bob','poll-vote',{pollId:p.id,optionId:randomUUID()}),row(3,'bob','poll-vote',{pollId:p.id,optionId:option}),
    row(5,'carol','poll-vote',{pollId:p.id,optionId:option})],options);
  assert.equal(result.polls[0].open,false);assert.equal(result.polls[0].options[0].votes,1);assert.equal(result.rejected.length,2);
  const closed=projectRoomContent([p,row(2,'alice','poll-close',{pollId:p.id}),row(3,'bob','poll-vote',{pollId:p.id,optionId:option})],options);
  assert.equal(closed.polls[0].options[0].votes,0);
});
test('historical membership authorizes old votes but removal denies future commands',()=>{
  const share=product(),old=row(2,'carol','shortlist',{shareId:share.id,selected:true});
  assert.deepEqual(projectRoomContent([share,old],options).products[0].shortlistedBy,['carol']);
  assert.throws(()=>projectRoomContent([share,{...old,epoch:'2'}],options),{code:'room_history_membership_required'});
});
test('epoch roles are account-wide and cannot be promoted through duplicate or conflicting native entries',()=>{
  const share=product();
  for(const invalid of [[...roster,roster[0]],roster.map(m=>({...m,role:'member'})),roster.map(m=>m.id===devices.bob2?{...m,role:'admin'}:m)])
    assert.throws(()=>projectRoomContent([share],{...options,epochs:new Map([['1',invalid]])}),{code:'room_history_membership_required'});
});
test('foreign rooms, strangers, malformed sequence and replayed content fail closed',()=>{
  const share=product();
  for(const extra of [{conversationId:randomUUID()},{kind:undefined},{sequence:'01'},{epoch:'9'},{owner:'seller'},{timestamp:'yesterday'}])
    assert.throws(()=>projectRoomContent([{...share,...extra}],options));
  assert.throws(()=>projectRoomContent([share,{...share,message:encodeRoomContent('product-share',{...parseRoomContent(share.message).data,note:'Changed'})}],options),{code:'room_history_replay_conflict'});
  assert.throws(()=>projectRoomContent([share,product()],options),{code:'room_history_sequence_conflict'});
});
test('catalog data is the only current price/stock authority; missing and incomplete products stay unknown',()=>{
  const result=projectRoomContent([product()],options),entry={id:'product-1',name:'Current',sellerId:'shop',currency:'TZS',unitPriceMinor:20000,availability:'sold_out',stock:0};
  const current=resolveRoomProducts(result,new Map([['product-1',entry]]))[0];
  assert.equal(current.current.unitPriceMinor,20000);assert.equal(current.historicalSnapshot.unitPriceMinor,10000);assert.equal(current.current.stock,0);
  assert.equal(resolveRoomProducts(result,new Map())[0].current,null);
  const missing=resolveRoomProducts(result,new Map([['product-1',{id:'product-1',name:'Known',sellerId:'shop'}]]))[0];
  assert.equal(missing.current.availability,'unknown');assert.equal(missing.current.stock,null);assert.equal(missing.current.unitPriceMinor,null);
});
test('Ask Seller requires explicit consent and discloses no room identifier, roster, notes or history',()=>{
  const share=product(),projected=projectRoomContent([share],options),request={shareId:share.id,question:'Is it available?',correlationId:randomUUID()};
  assert.throws(()=>createSellerQuestion(projected,request),{code:'room_seller_consent_required'});
  const disclosure=createSellerQuestion(projected,{...request,confirmed:true});
  assert.deepEqual(Object.keys(disclosure).sort(),['correlationId','productId','question','version']);assert.equal(disclosure.productId,'product-1');
  assert.throws(()=>createSellerQuestion(projected,{...request,shareId:randomUUID(),confirmed:true}),{code:'room_product_required'});
});
test('projection has explicit bounds instead of silently losing the last page of history',()=>{
  assert.throws(()=>projectRoomContent([product(),product(2)],{...options,maxEvents:1}),{code:'room_history_limit'});
  assert.throws(()=>projectRoomContent([],{...options,epochs:{}}),{code:'room_projection_invalid'});
});
test('large committed ballots preserve deterministic one-vote-per-owner totals across 1500 arrival records',()=>{
  const p=poll(1),option=parseRoomContent(p.message).data.options[0].id,events=[p];
  for(let i=2;i<=1500;i++)events.push(row(i,'bob','poll-vote',{pollId:p.id,optionId:i%2?option:null},{deviceId:i%3?devices.bob:devices.bob2}));
  const a=projectRoomContent(events,options),b=projectRoomContent([...events].reverse(),options);assert.deepEqual(a,b);
  assert.equal(Object.keys(a.polls[0].ballots).length,0);
});
