const {test}=require('node:test');
const assert=require('node:assert/strict');
const {watch}=require('../src/chat/preference-sync');
function fixture(options={}) {
  const document=new EventTarget(),window=new EventTarget();
  document.visibilityState='visible';window.navigator={onLine:true};
  let session={username:'alice',sessionId:'one',token:'session-a'},time=0,next=0,calls=0,changes=0;
  const timers=new Map();
  const state={document,window,timers,get calls(){return calls;},get changes(){return changes;},
    setSession:value=>{session=value;},getSession:()=>session,
    async advance(ms){time+=ms;const due=[...timers].filter(([,timer])=>timer.at<=time);
      for(const [id,timer] of due){timers.delete(id);await timer.run();}},
    delay:()=>[...timers.values()].map(timer=>timer.at-time)};
  state.sync=watch({getSession:()=>session,document,window,now:()=>time,
    setTimeout:(run,delay)=>{const id=++next;timers.set(id,{run,at:time+delay});return id;},
    clearTimeout:id=>timers.delete(id),refresh:async()=>{calls++;return true;},onChange:()=>{changes++;},...options});
  return state;
}
test('preferences reconcile every fifteen seconds without immediate duplicate startup I/O',async()=>{
  const f=fixture();assert.equal(f.calls,0);assert.deepEqual(f.delay(),[15000]);
  await f.advance(15000);assert.equal(f.calls,1);assert.equal(f.changes,1);
  await f.advance(15000);assert.equal(f.calls,2);f.sync.close();assert.equal(f.timers.size,0);
});
test('hidden, offline and inactive surfaces do not request preference state',async()=>{
  let active=false;const f=fixture({isActive:()=>active});await f.advance(15000);assert.equal(f.calls,0);
  active=true;f.document.visibilityState='hidden';await f.sync.wake();assert.equal(f.timers.size,0);
  f.document.visibilityState='visible';f.window.navigator.onLine=false;await f.sync.wake();assert.equal(f.calls,0);
  f.window.navigator.onLine=true;await f.sync.wake();assert.equal(f.calls,1);f.sync.close();
});
test('overlapping wakes coalesce and focus spam is throttled',async()=>{
  let release,calls=0;const f=fixture({refresh:()=>{calls++;return new Promise(resolve=>{release=resolve;});}});
  const running=f.sync.wake();await f.sync.wake();await f.sync.wake();assert.equal(calls,1);
  release(true);await running;await f.sync.wake();assert.equal(calls,1);assert.deepEqual(f.delay(),[1000]);
  const next=f.advance(1000);assert.equal(calls,2);release(false);await next;assert.equal(f.changes,1);f.sync.close();
});
test('late responses never rerender a hidden or closed surface',async()=>{
  let release;const f=fixture({refresh:()=>new Promise(resolve=>{release=resolve;})});
  const running=f.sync.wake();f.document.visibilityState='hidden';release(true);await running;
  assert.equal(f.changes,0);assert.equal(f.timers.size,0);
  f.document.visibilityState='visible';const second=f.advance(1000).then(()=>f.sync.wake());
  await Promise.resolve();await Promise.resolve();f.sync.close();release(true);await second;assert.equal(f.changes,0);
});
test('account, token or session replacement permanently stops a watcher',async()=>{
  for(const replacement of [{username:'bob',sessionId:'one',token:'session-a'},
    {username:'alice',sessionId:'two',token:'session-a'},
    {username:'alice',sessionId:'one',token:'session-b'},null]) {
    let release;const f=fixture({refresh:()=>new Promise(resolve=>{release=resolve;})});
    const running=f.sync.wake();f.setSession(replacement);release(true);await running;
    await f.advance(60000);assert.equal(f.changes,0);assert.equal(f.timers.size,0);
  }
});
test('failure backoff is bounded and successful reconciliation resets it',async()=>{
  let failing=true;const f=fixture({refresh:async()=>{if(failing)throw Error('unavailable');return false;}});
  await f.advance(15000);assert.deepEqual(f.delay(),[30000]);await f.advance(30000);assert.deepEqual(f.delay(),[60000]);
  await f.advance(60000);assert.deepEqual(f.delay(),[60000]);failing=false;
  await f.advance(60000);assert.deepEqual(f.delay(),[15000]);assert.equal(f.changes,0);f.sync.close();
});
test('close unregisters lifecycle listeners and invalid polling configuration is rejected',async()=>{
  const f=fixture();f.sync.close();f.window.dispatchEvent(new Event('online'));
  f.window.dispatchEvent(new Event('focus'));f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.calls,0);assert.equal(f.timers.size,0);
  assert.throws(()=>watch({getSession:()=>null,refresh:async()=>false,intervalMs:100}),/preference_sync_invalid/);
});
test('focus and online events cannot bypass a failed request backoff deadline',async()=>{
  let calls=0;const f=fixture({refresh:async()=>{calls++;throw Error('unavailable');}});
  await f.sync.wake();await f.advance(1000);await f.sync.wake();assert.equal(calls,1);
  assert.deepEqual(f.delay(),[29000]);await f.advance(29000);assert.equal(calls,2);f.sync.close();
});
