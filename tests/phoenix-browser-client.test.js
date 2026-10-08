const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const tick = () => new Promise(setImmediate);
const payload = {clientMessageId:'12345678-1234-4234-8234-123456789abc',receiverId:'bob',message:'synthetic'};

function fixture(options = {}) {
  let time = 100000, active = true, issued = 0;
  const timers = new Map(), sockets = [];
  function later(fn, ms) { const id = {}; timers.set(id, {fn, at:time+ms}); return id; }
  function every(fn, ms) { const id = {}; timers.set(id, {fn, at:time+ms,repeat:ms}); return id; }
  function cancel(id) { timers.delete(id); }
  class Push {
    constructor() { this.handlers = {}; }
    receive(kind, fn) { this.handlers[kind] = fn; return this; }
    respond(kind, result) { this.handlers[kind]?.(result); }
  }
  class Socket {
    constructor(url, config) {
      this.url = url; this.config = config; this.connected = false; this.pushes = []; this.connects=0; sockets.push(this);
    }
    channel(topic, params) {
      this.topic = topic; this.params = params;
      this.ch = {
        canPush: () => this.connected,
        on: (name, fn) => { this[name] = fn; },
        onError: fn => { this.channelError = fn; },
        onClose: fn => { this.channelClose = fn; },
        join: () => (this.join = new Push()),
        leave: () => this.channelClose?.(),
        push: (event, body) => { const push = new Push(); this.pushes.push({event,body,push}); return push; }
      };
      return this.ch;
    }
    onClose(fn) { this.closed = fn; }
    onOpen(fn) { this.open = fn; }
    onError(fn) { this.error = fn; }
    connect() { this.connected = true; this.connects++; queueMicrotask(()=>this.open?.()); }
    disconnect() { this.connected = false; }
  }
  const context = {window:{location:{hostname:'localhost'},Phoenix:{Socket}},URL,URLSearchParams,
    Date:class extends Date {static now(){return time;}},setTimeout:later,clearTimeout:cancel,setInterval:every,clearInterval:cancel};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/api/phoenix-transport.js'),'utf8'),context);
  const api = context.window.WingaModules.api.phoenix;
  const make = overrides => api.createPhoenixTransport({
    url:'ws://127.0.0.1:4100/socket', owner:'alice', deviceId:'a1',
    isCurrent:()=>active, loadSocket:async()=>Socket,
    fetchTicket:async()=>({version:1,ticket:'ticket-'+(++issued),expiresAt:time+300000}),
    onEvents:async(batch,ack)=>{ await ack(batch.events.map(e=>e.id)); return true; },
    now:()=>time, random:()=>0.5,setTimeout:later,clearTimeout:cancel,
    ...options,...overrides
  });
  async function join(socket) {
    await tick();
    socket ||= sockets.at(-1);
    socket.join.respond('ok',{deviceId:'a1',securityMode:'legacy-plaintext',expiresAt:time+300000});
    return socket;
  }
  async function advance(ms) {
    time+=ms;
    for(const [id,timer] of [...timers]) if(timer.at<=time) {if(timer.repeat)timer.at=time+timer.repeat;else timers.delete(id);timer.fn();}
    await tick();
  }
  return {api,context,make,join,advance,sockets,timers,issued:()=>issued,invalidate(){active=false;}};
}

test('canary needs an explicit account and safe socket URL; rich message fields are never discarded', () => {
  const f=fixture(),session={username:'alice'};
  const config={phoenixTransportEnabled:true,phoenixCanaryUsers:['alice'],phoenixTransportUrl:'wss://chat.example/socket'};
  assert.equal(f.api.canaryUrl(config,session),config.phoenixTransportUrl);
  for(const change of [{phoenixTransportEnabled:false},{phoenixCanaryUsers:[]},{phoenixTransportUrl:'wss://user:secret@chat.example/socket'},
    {phoenixTransportUrl:'wss://chat.example/socket?ticket=leak'},{phoenixTransportUrl:'https://chat.example/socket'},
    {phoenixTransportUrl:'ws://remote.example/socket'},{phoenixTransportUrl:'wss://chat.example/other'}]) {
    assert.equal(f.api.canaryUrl({...config,...change},session),'');
  }
  for(const extra of [{productId:'p'},{replyToMessageId:'r'},{productItems:[{id:'p'}]},{messageType:'contact_share'},{senderId:'forged'}]) {
    assert.equal(f.api.textPayload({...payload,...extra}),null);
  }
  assert.deepEqual({...f.api.textPayload({...payload,productId:'',productItems:[],messageType:'text'})},payload);
});

test('production configuration enables all accounts while local builds and explicit rollback remain disabled', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','winga-config.js'),'utf8');
  const load=(hostname,protocol='https:',override={})=>{
    const context={window:{location:{hostname,protocol},__WINGA_CONFIG_OVERRIDE__:override}};
    vm.runInNewContext(source,context);
    return context.window.WINGA_CONFIG;
  };
  const production=load('wingamarket.com');
  assert.equal(production.phoenixTransportEnabled,true);
  assert.equal(production.phoenixAllUsers,true);
  assert.equal(production.phoenixTransportUrl,'wss://winga-phoenix.onrender.com/socket');
  for (const host of ['localhost','127.0.0.1']) assert.equal(load(host).phoenixTransportEnabled,false);
  assert.equal(load('','file:').phoenixTransportEnabled,false);
  assert.equal(load('wingamarket.com','https:',{phoenixTransportEnabled:false}).phoenixTransportEnabled,false);
});

test('all-user rollout requires explicit booleans, a session and the same safe URL checks', () => {
  const f=fixture(), session={username:'outside-canary'};
  const config={phoenixTransportEnabled:true,phoenixAllUsers:true,phoenixCanaryUsers:[],phoenixTransportUrl:'wss://chat.example/socket'};
  assert.equal(f.api.canaryUrl(config,session),config.phoenixTransportUrl);
  for (const change of [{phoenixAllUsers:'true'},{phoenixAllUsers:false},{phoenixAllUsers:undefined},
    {phoenixTransportEnabled:false},{phoenixTransportEnabled:'true'},
    {phoenixTransportUrl:'wss://chat.example/socket?ticket=leak'}, {phoenixTransportUrl:'ws://chat.example/socket'}]) {
    assert.equal(f.api.canaryUrl({...config,...change},session),'');
  }
  for (const absent of [null,{}, {username:''}]) assert.equal(f.api.canaryUrl(config,absent),'');
});

test('send uses join-frame tickets and accepts only a canonical sender/receiver sequence', async () => {
  const f=fixture(),client=f.make();const socket=await f.join();
  assert.equal(f.issued(),1);assert.equal(socket.url.includes('ticket'),false);
  assert.deepEqual({...socket.config.params},{});assert.equal(socket.params.ticket,'ticket-1');
  const pending=client.sendMessage(payload);
  assert.deepEqual({...socket.pushes[0].body},payload);
  socket.pushes[0].push.respond('ok',{accepted:true,message:{id:'canonical',senderId:'alice',receiverId:'bob',conversationSequence:'1'}});
  assert.equal((await pending).id,'canonical');
  const invalid=client.sendMessage(payload);
  socket.pushes[1].push.respond('ok',{accepted:true,message:{id:'wrong',senderId:'eve',receiverId:'bob',conversationSequence:'1'}});
  await assert.rejects(invalid,{code:'outcome_unknown',retryable:true});
  client.close();assert.equal(f.timers.size,0);
});

test('timeouts and disconnects preserve the logical ID without hidden retransmission', async () => {
  const f=fixture(),client=f.make();const socket=await f.join();
  const send=client.sendMessage(payload);send.catch(()=>{});
  await f.advance(8001);await assert.rejects(send,{code:'outcome_unknown',retryable:true});
  assert.equal(socket.pushes.length,1);
  const next=client.sendMessage(payload);next.catch(()=>{});
  socket.closed();await assert.rejects(next,{code:'outcome_unknown'});
  assert.equal(await client.sendMessage(payload),null);
  await f.advance(1000);
  assert.equal(f.sockets.length,1);assert.equal(socket.params.ticket,'ticket-2');
  assert.equal(socket.connects,2);assert.equal(socket.pushes.length,2);
  client.close();
});

test('ticket renewal replaces the connection and cancels an uncertain in-flight send', async () => {
  const f=fixture(),client=f.make();const first=await f.join();
  const pending=client.sendMessage(payload);pending.catch(()=>{});
  await f.advance(270000);await assert.rejects(pending,{code:'outcome_unknown'});
  assert.equal(f.sockets.length,1);assert.equal(first.connects,2);assert.equal(f.issued(),2);
  assert.equal(first.params.ticket,'ticket-2');
  client.close();
});

test('event ACK waits for the durable consumer and failed storage leaves the queue unacknowledged', async () => {
  let complete;
  const f=fixture({onEvents:async(batch,ack)=>{await new Promise(resolve=>{complete=resolve;});await ack(['event-1']);return true;}});
  const client=f.make(),socket=await f.join();
  const consumed=socket.events({events:[{id:'event-1'}]});await tick();
  assert.equal(socket.pushes.length,0);
  complete();await tick();
  assert.equal(socket.pushes[0].event,'events.ack');
  socket.pushes[0].push.respond('ok',{ok:true,acknowledged:1});await consumed;client.close();
  const broken=f.make({onEvents:async()=>{throw new Error('storage aborted');}});
  const other=await f.join();
  await other.events({events:[{id:'event-2'}]});
  assert.equal(other.pushes.length,0);assert.equal(other.connected,false);broken.close();
});

test('SDK resume renews the ticket and cannot revive a closed account connection', async () => {
  const f=fixture(),client=f.make(),socket=await f.join();
  socket.open();await tick();
  assert.equal(f.issued(),2);assert.equal(client.isReady(),false);
  assert.equal(socket.params.ticket,'ticket-2');assert.equal(f.sockets.length,1);
  await f.join(socket);assert.equal(client.isReady(),true);
  client.close();socket.connected=true;socket.open();await tick();
  assert.equal(socket.connected,false);assert.equal(f.issued(),2);
  assert.equal(f.timers.size,0);
});

test('account switches and explicit close discard late enrollment and never checkpoint stale events', async () => {
  let issue;
  const f=fixture({fetchTicket:()=>new Promise(resolve=>{issue=resolve;})});
  const client=f.make();await tick();f.invalidate();client.close();
  issue({version:1,ticket:'late',expiresAt:400000});await tick();
  assert.equal(f.sockets.length,0);assert.equal(f.timers.size,0);
});

test('in-flight command count is bounded and a wrong device join fails closed', async () => {
  const f=fixture(),client=f.make();const socket=await f.join();
  const pending=Array.from({length:8},()=>client.sendMessage(payload));pending.forEach(p=>p.catch(()=>{}));
  await assert.rejects(client.sendMessage(payload),{code:'transport_unavailable'});
  assert.equal(socket.pushes.length,8);client.close();await Promise.allSettled(pending);
  const wrong=f.make();await tick();
  f.sockets.at(-1).join.respond('ok',{deviceId:'other',expiresAt:400000,securityMode:'legacy-plaintext'});
  assert.equal(wrong.isReady(),false);assert.equal(f.sockets.at(-1).connected,false);
});

test('communications canary keeps legacy events and falls back only before a socket send is attempted', async () => {
  const f=fixture(),requests=[],session={username:'alice',sessionId:'a1'};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/api/communications-client.js'),'utf8'),f.context);
  let legacyClosed=false;
  const client=f.context.window.WingaModules.api.communications.createCommunicationsApiClient({
    baseUrl:'/api',getSession:()=>session,getTransportConfig:()=>({
      phoenixTransportEnabled:true,phoenixCanaryUsers:['alice'],phoenixTransportUrl:'ws://127.0.0.1:4100/socket'
    }),
    getEventSource:()=>class {addEventListener(){} close(){legacyClosed=true;}},
    fetchJson:async(url,options)=>{
      requests.push({url,options});
      if(url.endsWith('/device'))return {supported:true,eventDelivery:true,username:'alice',deviceId:'a1'};
      if(url.endsWith('/transport-ticket'))return {version:1,ticket:'scoped',expiresAt:400000};
      if(url.includes('/encrypted/mode?'))return {version:1,mode:'legacy-plaintext'};
      if(url.endsWith('/messages'))return {id:'rest'};
      throw new Error('Unexpected request');
    }
  });
  const stream=client.openRealtimeChannel({isCurrent:()=>true,onDeviceEvents:async()=>true});
  const socket=await f.join();
  assert.equal(client.hasDeviceEventStream(),true);
  assert.equal((await client.sendMessage({...payload,productId:'product-reference'})).id,'rest');
  const before=requests.filter(r=>r.url.endsWith('/messages')).length;
  const pending=client.sendMessage(payload);pending.catch(()=>{});
  await tick();assert.equal(socket.pushes.at(-1).event,'message.send');
  await f.advance(8001);await assert.rejects(pending,{code:'outcome_unknown'});
  assert.equal(requests.filter(r=>r.url.endsWith('/messages')).length,before);
  socket.closed();
  assert.equal((await client.sendMessage(payload)).id,'rest');
  assert.equal(JSON.parse(requests.at(-1).options.body).clientMessageId,payload.clientMessageId);
  stream.close();assert.equal(legacyClosed,true);assert.equal(client.hasDeviceEventStream(),false);
  assert.equal(f.timers.size,0);
});
test('resume metrics require an actual reconnect and the first durably consumed batch, not ordinary live traffic',async()=>{
  const f=fixture(),observed=[];f.context.WingaConversationExperience={record:(...v)=>observed.push(v)};
  const t=f.make({onEvents:async()=>true});await f.join();const socket=f.sockets[0];
  await socket.events({events:[{id:'live'}]});assert.deepEqual(observed,[]);
  socket.error();await f.advance(1000);await f.join();
  await socket.events({events:[{id:'replay'}]});await socket.events({events:[{id:'live-2'}]});
  assert.deepEqual(observed.map(v=>v[0]),['transport-reconnect','transport-resume-confirmed']);
  t.close();
});

test('resume attempts count ticket rejection, join timeout and a joined connection without replay honestly',async()=>{
  let rejectTicket=false;const f=fixture(),observed=[];
  f.context.WingaConversationExperience={record:(...v)=>observed.push(v)};
  const client=f.make({fetchTicket:async()=>{if(rejectTicket)throw Object.assign(Error('denied'),{status:503});return {version:1,ticket:'scoped',expiresAt:400000};}});
  const socket=await f.join();socket.error();rejectTicket=true;await f.advance(1000);
  assert.equal(observed.filter(v=>v[0]==='transport-resume-failed').length,1);
  rejectTicket=false;await f.advance(2000);socket.join.respond('timeout');
  assert.equal(observed.filter(v=>v[0]==='transport-resume-failed').length,2);
  await f.advance(4000);socket.join.respond('ok',{deviceId:'a1',securityMode:'legacy-plaintext',expiresAt:400000});
  await f.advance(15001);
  assert.equal(observed.filter(v=>v[0]==='transport-resume-pending').length,1);
  assert.equal(observed.some(v=>v[0]==='transport-resume-confirmed'),false);client.close();
});
