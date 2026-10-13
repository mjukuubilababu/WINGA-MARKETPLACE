const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(options={}){
 let account='',id=0;const timers=new Map(),opens=[],shares=[],touches=[];
 class Node{
   constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.listeners=new Map();this.isConnected=true;this.textContent='';}
   append(...nodes){this.children.push(...nodes);}
   setAttribute(){}
   addEventListener(name,callback){this.listeners.set(name,callback);}
   showModal(){this.open=true;}
   close(){this.open=false;this.listeners.get('close')?.();}
   remove(){this.isConnected=false;}
 }
 const body=new Node('body'),win={document:{createElement:tag=>new Node(tag),body},WingaModules:{growth:{}},
   WINGA_CONFIG:{growthInternalContentSharing:true},setInterval:f=>{timers.set(++id,f);return id;},clearInterval:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync('src/growth/content-ui.js','utf8'),{window:win});
 const deps={window:win,getAccount:()=>account,isFollowing:()=>false,follow:()=>false,
   dataLayer:{loadSharedCollection:async()=>({id:'picks',title:'Useful picks',ownerUsername:'curator',visibility:'public',status:'published',items:[{productId:'p1',name:'First product'},{productId:'p2',name:'Second product'}]}),...options.dataLayer},
   getGrowth:()=>({contentVisible(){},collectionProductOpened:(...args)=>touches.push(args)}),
   openProduct:async id=>{opens.push(id);return true;},shareCollection:c=>shares.push(c.id),shareInternally:(...args)=>shares.push(args),...options};
 const ui=win.WingaModules.growth.createContentUi(deps),dialog=()=>body.children.at(-1),buttons=()=>dialog().children.flatMap(n=>n.children.length?n.children:[n]).filter(n=>n.tag==='button');
 return {ui,win,dialog,buttons,opens,shares,touches,account:v=>{account=v;},timers};
}
test('guest Collection shows products before signup and failed item lookup remains retryable',async()=>{
 const f=fixture({openProduct:async()=>false});await f.ui.openCollection('picks');
 const item=f.buttons().find(b=>b.textContent==='First product');assert.ok(item);await item.onclick();
 assert.equal(f.dialog().open,true);assert.equal(item.disabled,false);assert.deepEqual(f.touches,[]);
});
test('Collection product opening records continuity only after success and optional analytics cannot block the product',async()=>{
 const f=fixture();await f.ui.openCollection('picks');await f.buttons().find(b=>b.textContent==='First product').onclick();
 assert.deepEqual(f.opens,['p1']);assert.deepEqual(f.touches,[['picks','p1']]);assert.equal(f.dialog().open,false);
 const broken=fixture({getGrowth:()=>({contentVisible(){},collectionProductOpened(){throw Error('analytics down');}})});
 await broken.ui.openCollection('picks');await broken.buttons().find(b=>b.textContent==='First product').onclick();assert.deepEqual(broken.opens,['p1']);assert.equal(broken.dialog().open,false);
});
test('closed or changed-account Collection actions cannot share or attribute late product results',async()=>{
 let complete;const f=fixture({openProduct:()=>new Promise(resolve=>{complete=resolve;})});await f.ui.openCollection('picks');
 const buttons=f.buttons(),pending=buttons.find(b=>b.textContent==='First product').onclick();f.account('other');
 await buttons.find(b=>b.textContent==='Share').onclick();await buttons.find(b=>b.textContent==='Share to Winga').onclick();
 complete(true);await pending;assert.deepEqual(f.shares,[]);assert.deepEqual(f.touches,[]);
 f.ui.close();assert.equal(f.timers.size,0);
});
test('late Collection loads cannot populate a newer dialog and text is rendered without HTML',async()=>{
 let resolve;const f=fixture({dataLayer:{loadSharedCollection:()=>new Promise(r=>{resolve=r;})}});
 const pending=f.ui.openCollection('picks');f.ui.close();resolve({title:'old',items:[]});await pending;assert.equal(f.dialog().isConnected,false);
 const text=fixture({dataLayer:{loadSharedCollection:async()=>({title:'<img onerror=evil()>',ownerUsername:'curator',visibility:'public',status:'published',items:[]})}});
 await text.ui.openCollection('picks');assert.equal(text.dialog().children.find(n=>n.tag==='h2').textContent,'<img onerror=evil()>');
});
test('authorized private Collection product access never enters public sharing attribution',async()=>{
 const f=fixture({dataLayer:{loadSharedCollection:async()=>({id:'picks',title:'Private picks',ownerUsername:'curator',visibility:'private',status:'published',items:[{productId:'p1',name:'First product'}]})}});
 await f.ui.openCollection('picks');assert.equal(f.buttons().some(b=>b.textContent==='Share'),false);
 await f.buttons().find(b=>b.textContent==='First product').onclick();assert.deepEqual(f.opens,['p1']);assert.deepEqual(f.touches,[]);
});
