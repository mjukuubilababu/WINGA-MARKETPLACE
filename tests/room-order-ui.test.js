const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto,randomUUID}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {createConversationReferenceReader}=require('../backend/conversation-references');

const root=path.resolve(__dirname,'..');
const roomId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const dataKey=name=>name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());

class TestElement {
  constructor(document,tag){
    this.document=document;this.tag=tag;this.children=[];this.parentNode=null;
    this.dataset={};this.attributes=new Map();this.className='';this.text='';this.selectedValue='';
    this.listeners=new Map();this.disabled=false;this.checked=false;this.scrollTop=0;
    this.scrollHeight=0;this.clientHeight=0;
    this.classList={toggle:(name,enabled)=>{
      const names=new Set(this.className.split(/\s+/).filter(Boolean));
      if(enabled)names.add(name);else names.delete(name);this.className=[...names].join(' ');
    }};
  }
  get isConnected(){return this===this.document.body||Boolean(this.parentNode?.isConnected);}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join('');}
  set textContent(value){this.text=String(value);this.replaceChildren();}
  get value(){return this.tag==='select'?(this.selectedValue||this.children[0]?.value||''):this.selectedValue;}
  set value(value){this.selectedValue=String(value);}
  append(...children){for(const child of children){child.remove();child.parentNode=this;this.children.push(child);}}
  prepend(...children){for(const child of [...children].reverse()){child.remove();child.parentNode=this;this.children.unshift(child);}}
  insertBefore(child,before){child.remove();child.parentNode=this;this.children.splice(this.children.indexOf(before),0,child);}
  replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this.selectedValue='';this.append(...children);}
  remove(){if(this.parentNode){const parent=this.parentNode;parent.children.splice(parent.children.indexOf(this),1);this.parentNode=null;}}
  setAttribute(name,value){if(name.startsWith('data-'))this.dataset[dataKey(name)]=String(value);else this.attributes.set(name,String(value));}
  getAttribute(name){return name.startsWith('data-')?(this.dataset[dataKey(name)]??null):(this.attributes.get(name)??null);}
  removeAttribute(name){if(name.startsWith('data-'))delete this.dataset[dataKey(name)];else this.attributes.delete(name);}
  addEventListener(name,fn,options){const listeners=this.listeners.get(name)||[];listeners.push({fn,once:options?.once});this.listeners.set(name,listeners);}
  removeEventListener(name,fn){this.listeners.set(name,(this.listeners.get(name)||[]).filter(listener=>listener.fn!==fn));}
  showModal(){this.open=true;}
  close(){this.open=false;for(const listener of this.listeners.get('close')||[])listener.fn();this.listeners.set('close',(this.listeners.get('close')||[]).filter(listener=>!listener.once));}
  contains(other){return other===this||this.children.some(child=>child.contains(other));}
  getBoundingClientRect(){return {top:0,bottom:0};}
  focus(){this.document.activeElement=this;}
  setSelectionRange(){}
  matches(selector){
    const tag=selector.match(/^[a-z][a-z0-9-]*/)?.[0];if(tag&&tag!==this.tag)return false;
    for(const match of selector.matchAll(/\.([a-z0-9-]+)/gi))if(!this.className.split(/\s+/).includes(match[1]))return false;
    for(const match of selector.matchAll(/\[([a-z0-9-]+)(?:=["']?([^"'\]]*)["']?)?\]/gi)){
      const value=this.getAttribute(match[1])??this[match[1]];
      if(value===undefined||value===null||match[2]!==undefined&&String(value)!==match[2])return false;
    }
    return true;
  }
  querySelectorAll(selector){
    const matches=node=>selector.split(',').some(part=>{
      const pieces=part.trim().split(/\s+/);if(!node.matches(pieces.pop()))return false;
      let parent=node.parentNode;
      while(pieces.length){const piece=pieces.pop();while(parent&&!parent.matches(piece))parent=parent.parentNode;if(!parent)return false;parent=parent.parentNode;}
      return true;
    });
    const descend=node=>node.children.flatMap(child=>[child,...descend(child)]);
    return descend(this).filter(matches);
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}

async function harness(t,{owner='alice',shared=true}={}){
  const codec=await import(pathToFileURL(path.join(root,'src/chat/shopping-room-content.mjs')).href);
  const observers=[],timers=new Map();let timerId=0,clock=Date.now();
  const document={visibilityState:'visible',activeElement:null,documentElement:{lang:'en'},addEventListener(){},removeEventListener(){},
    createElement(tag){return new TestElement(this,tag);},querySelectorAll(selector){return this.body.querySelectorAll(selector);}};
  document.body=document.createElement('body');
  const orders=new Map(['order-1','order-2'].map((id,index)=>[id,{id,buyerUsername:'alice',sellerUsername:'seller',
    productName:'Canonical purchase '+(index+1),quantity:2,totalAmount:12000,currency:'TZS',status:'placed',transactionId:'PRIVATE'}]));
  const room={id:roomId,name:'Orders Room',status:'active',epoch:'1',acceptances:[{},{}],
    transition:{id:randomUUID(),status:'accepted',intent:JSON.stringify({roster:JSON.stringify([{owner:'alice'},{owner:'seller'}]),
      roles:JSON.stringify([{owner:'alice',role:'admin'},{owner:'seller',role:'member'}])})}};
  const board={products:[],polls:[],sellerQuestions:[],orders:shared?[...orders.keys()].map(orderId=>({orderId,referenceId:randomUUID(),sharedBy:['alice']})):[]};
  const history=[],commands=[],referenceCalls=[],opened=[],errors=[];
  const fixture={session:{username:owner,sessionId:'synthetic-session-1',token:'synthetic-token-1'},referenceStatus:0,syncStatus:0,deferred:null};
  const read=createConversationReferenceReader({readOrder:async id=>orders.get(id)||null});
  const denied=status=>Object.assign(new Error(status===401?'session_required':'conversation_reference_unavailable'),
    {status,code:status===401?'session_required':'conversation_reference_unavailable'});
  const context=vm.createContext({WingaModules:{},document,crypto:webcrypto,URL,URLSearchParams,roomCodec:codec,
    Date:class extends Date{static now(){return clock;}},
    MutationObserver:class{constructor(callback){this.callback=callback;observers.push(this);}observe(){this.active=true;}disconnect(){this.active=false;}},
    setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
    requestAnimationFrame(fn){return fn();}});
  context.window=context;context.addEventListener=()=>{};context.removeEventListener=()=>{};
  vm.runInContext(fs.readFileSync(path.join(root,'src/api/communications-client.js'),'utf8'),context);
  const api=context.WingaModules.api.communications.createCommunicationsApiClient({baseUrl:'/api',getSession:()=>fixture.session,
    createAuthHeaders:()=>({}),fetchJson:async url=>{
      const parsed=new URL(url,'http://synthetic.invalid');
      if(parsed.pathname==='/api/orders/mine')return {purchases:[...orders.values()].filter(order=>order.buyerUsername===fixture.session.username),
        sales:[...orders.values()].filter(order=>order.sellerUsername===fixture.session.username)};
      assert.equal(parsed.pathname,'/api/conversations/references');
      const id=parsed.searchParams.get('id'),username=fixture.session.username;referenceCalls.push({id,username});
      if(fixture.referenceStatus)throw denied(fixture.referenceStatus);
      const result=await read(username,parsed.searchParams.get('kind'),id);
      if(fixture.deferred){const pending=fixture.deferred;fixture.deferred=null;pending.started();await pending.promise;}
      return result;
    }});
  const dataLayer={readRichCatalog:api.readRichCatalog,readConversationReference:api.readConversationReference,
    shoppingRoom:async(action,args)=>{
      switch(action){
        case 'limits':return {maxOwners:12,maxDevices:24};
        case 'sync':if(fixture.syncStatus)throw denied(fixture.syncStatus);return [room];
        case 'history':return history;
        case 'board':return board;
        case 'pendingTransitions':case 'pendingMedia':return [];
        case 'command':{
          const [id,type,data,messageId]=args;assert.equal(id,roomId);commands.push(structuredClone(args));
          const message=codec.encodeRoomContent(type,data);history.push({id:messageId,owner:fixture.session.username,status:'sent',message});
          if(!board.orders.some(ref=>ref.orderId===data.orderId))board.orders.push({orderId:data.orderId,referenceId:messageId,sharedBy:[fixture.session.username]});
          return {id:messageId,status:'sent'};
        }
        default:throw new Error('unexpected Room action: '+action);
      }
    }};
  // Resolve the browser's absolute module URL locally without exposing private UI closures.
  const source=fs.readFileSync(path.join(root,'src/chat/rooms-ui.js'),'utf8');
  assert.ok(source.includes("import('/src/chat/shopping-room-content.mjs')"));
  vm.runInContext(source.replaceAll("import('/src/chat/shopping-room-content.mjs')",'Promise.resolve(roomCodec)'),context);
  function bind(){
    const scope=document.createElement('section'),list=document.createElement('div'),detail=document.createElement('div');
    list.dataset.roomList='';detail.dataset.roomDetail='';scope.append(list,detail);document.body.append(scope);
    context.WingaShoppingRoomsUi.bind(scope,{dataLayer,getSession:()=>fixture.session,
      actions:{openOrder:id=>opened.push(id),onError:code=>errors.push(code)}});return scope;
  }
  let scope=bind();
  const turn=()=>new Promise(resolve=>setImmediate(resolve));
  async function until(predicate){for(let i=0;i<20;i++){if(predicate())return;await turn();}assert.ok(predicate(),'UI did not reach the expected state');}
  const button=(container,name)=>container.querySelectorAll('button').find(item=>item.textContent===name||item.getAttribute('aria-label')===name);
  async function click(item){assert.ok(item,'expected a UI control');assert.equal(item.disabled,false,'control should be enabled');await item.onclick();await turn();}
  async function ordersTab(){await until(()=>scope.querySelector('[data-room-row]'));await click(scope.querySelector('[data-room-row]'));await click(button(scope,'Orders'));}
  const rows=()=>scope.querySelectorAll('[data-room-order]');
  function assertUnavailable(){assert.equal(rows().length,board.orders.length);for(const row of rows()){
    assert.doesNotMatch(row.textContent,/Canonical purchase/);assert.match(row.textContent,/Order details are unavailable/);}
    assert.equal(scope.querySelectorAll('button').filter(item=>item.textContent==='View order').length,0);
  }
  t.after(()=>{for(const dialog of document.querySelectorAll('dialog'))dialog.close();scope.remove();
    for(const observer of observers)if(observer.active)observer.callback();timers.clear();});
  return {fixture,orders,history,commands,referenceCalls,opened,errors,document,board,button,click,ordersTab,rows,assertUnavailable,turn,until,
    get scope(){return scope;},
    async poll({expire=false}={}){if(expire)clock+=31000;assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);await fn();await turn();},
    async rebind(){scope.remove();for(const observer of observers)if(observer.active)observer.callback();
      fixture.session={...fixture.session,sessionId:'synthetic-session-2',token:'synthetic-token-2'};scope=bind();await until(()=>timers.size===1);},
    deferReference(){let resolve,started;const promise=new Promise(done=>resolve=done),began=new Promise(done=>started=done);
      fixture.deferred={promise,started};return {resolve,began};},
    async share(){await click(button(scope,'Share order reference'));const dialog=document.querySelectorAll('dialog').at(-1);assert.ok(dialog);return dialog;},
    async submit(dialog){await dialog.querySelector('form').onsubmit({preventDefault(){}});await turn();}
  };
}

async function prime(h){await h.ordersTab();assert.equal(h.rows().length,2);for(const row of h.rows())assert.match(row.textContent,/Canonical purchase/);}

test('reference 401 clears every cached canonical order, not only the clicked row',async t=>{
  const h=await harness(t);await prime(h);h.fixture.referenceStatus=401;
  await h.click(h.button(h.rows()[0],'View order'));h.assertUnavailable();assert.deepEqual(h.opened,[]);
  assert.ok(h.errors.includes('session_required'));
});

test('interactive Room sync 401 clears all cached order details before reference reads',async t=>{
  const h=await harness(t);await prime(h);const reads=h.referenceCalls.length;h.fixture.syncStatus=401;
  await h.click(h.button(h.scope,'Try again'));h.assertUnavailable();assert.equal(h.referenceCalls.length,reads);
});

test('background Room sync 401 clears all cached canonical order details',async t=>{
  const h=await harness(t);await prime(h);const reads=h.referenceCalls.length;h.fixture.syncStatus=401;
  await h.poll();h.assertUnavailable();assert.equal(h.referenceCalls.length,reads);
});

test('background reference refresh 401 clears other orders as well as the failing row',async t=>{
  const h=await harness(t);await prime(h);h.fixture.referenceStatus=401;
  await h.poll({expire:true});h.assertUnavailable();assert.deepEqual(h.opened,[]);
});

test('canonical participant removal clears the denied order but retains another authorized order',async t=>{
  const h=await harness(t);await prime(h);h.orders.get('order-1').buyerUsername='outside';
  await h.click(h.button(h.rows()[0],'View order'));
  assert.doesNotMatch(h.rows()[0].textContent,/Canonical purchase/);
  assert.match(h.rows()[0].textContent,/Order details are unavailable/);
  assert.match(h.rows()[1].textContent,/Canonical purchase 2/);assert.ok(h.button(h.rows()[1],'View order'));
  assert.deepEqual(h.opened,[]);
});

test('same-owner session rebind after navigating away rereads canonical orders instead of reusing old details',async t=>{
  const h=await harness(t);await prime(h);const reads=h.referenceCalls.length;
  h.orders.get('order-1').buyerUsername='outside';h.orders.get('order-2').buyerUsername='outside';
  await h.rebind();h.assertUnavailable();assert.equal(h.referenceCalls.length,reads+2);
});

test('an authorized read completing after a session change cannot open an order',async t=>{
  const h=await harness(t);await prime(h);const pending=h.deferReference();
  const opening=h.click(h.button(h.rows()[0],'View order'));await pending.began;
  h.fixture.session={...h.fixture.session,sessionId:'synthetic-session-changed',token:'synthetic-token-changed'};
  pending.resolve();await opening;assert.deepEqual(h.opened,[]);
});

test('seller-side canonical sales can be shared only with consent and encode an ID-only pointer',async t=>{
  const h=await harness(t,{owner:'seller',shared:false});await h.ordersTab();const dialog=await h.share();
  const select=dialog.querySelector('select[name="order"]'),send=dialog.querySelector('button[type="submit"]');
  assert.equal(select.value,'order-1');assert.equal(send.disabled,true);assert.equal(h.commands.length,0);
  const consent=dialog.querySelector('input[type="checkbox"]');consent.checked=true;consent.onchange();assert.equal(send.disabled,false);
  await h.submit(dialog);assert.equal(dialog.isConnected,false);assert.equal(h.commands.length,1);
  const [id,type,data,messageId]=h.commands[0];assert.equal(id,roomId);assert.equal(type,'order-reference');
  assert.deepEqual(data,{orderId:'order-1'});assert.match(messageId,/^[a-f0-9-]{36}$/);
  assert.equal(h.history[0].owner,'seller');assert.doesNotMatch(h.history[0].message,/Canonical purchase|12000|PRIVATE|payment/);
  assert.ok(h.referenceCalls.some(call=>call.username==='seller'&&call.id==='order-1'));
  assert.match(h.rows()[0].textContent,/Canonical purchase 1/);
  await h.click(h.button(h.rows()[0],'View order'));assert.deepEqual(h.opened,['order-1']);
});

test('seller removal between catalog selection and submission prevents sharing an order',async t=>{
  const h=await harness(t,{owner:'seller',shared:false});await h.ordersTab();const dialog=await h.share();
  assert.equal(dialog.querySelector('select[name="order"]').value,'order-1');h.orders.get('order-1').sellerUsername='outside';
  const consent=dialog.querySelector('input[type="checkbox"]');consent.checked=true;consent.onchange();await h.submit(dialog);
  assert.equal(h.commands.length,0);assert.equal(h.history.length,0);
  assert.match(dialog.querySelector('[data-room-error]').textContent,/Order details are unavailable/);
});
