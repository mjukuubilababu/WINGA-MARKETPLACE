const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
async function fixture(page) {
  await page.route('http://archive-ui.test/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><main id="chat"><button data-chat-archive="bob" hidden><span>Archive</span></button><p data-chat-archive-status role="status" hidden></p></main><script src="/src/chat/archive-ui.js"></script>'});
    if(url.pathname!=='/src/chat/archive-ui.js')return route.abort();
    return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'src/chat/archive-ui.js'))});
  });await page.goto('http://archive-ui.test/');
  await page.evaluate(()=>{
    const data={session:{username:'alice',sessionId:'d1'},peer:'bob',calls:[],peers:[],state:{revision:'0',archived:false},rerenders:0};
    const options={getSession:()=>data.session,getPeer:()=>data.peer,refresh:()=>data.rerenders++,
      dataLayer:{async pushRequest(route,payload,method){
        data.calls.push({route,payload,method});
        if(data.deferred&&route===data.deferred)return new Promise(resolve=>data.release=()=>resolve(route==='archive/list'?{peers:data.peers}:data.state));
        if(data.failure)throw Error('PRIVATE ERROR');
        if(route==='archive/list')return {peers:data.peers.slice()};
        if(route==='archive'){data.state={revision:String(Number(data.state.revision)+1),archived:payload.archived};data.peers=payload.archived?['bob']:[];}
        return {...data.state};
      }}};
    WingaConversationArchive.bind(document.getElementById('chat'),options);
    window.archiveFixture={data,options,refresh:()=>WingaConversationArchive.refresh(options),
      rows:mode=>WingaConversationArchive.filter([{withUser:'bob',unreadCount:2},{withUser:'other',unreadCount:0}],mode,data.session).map(row=>row.withUser)};
  });
}
test('archive and unarchive use account binding and revisions without deleting or muting',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'Archive',exact:true}).click();
  await expect(page.getByRole('button',{name:'Move to Inbox',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>archiveFixture.rows('all'))).toEqual(['other']);
  expect(await page.evaluate(()=>archiveFixture.rows('archived'))).toEqual(['bob']);
  expect(await page.evaluate(()=>archiveFixture.data.calls)).toEqual([
    {route:'archive/state',payload:{owner:'alice',sessionId:'d1',peer:'bob'},method:'POST'},
    {route:'archive',payload:{owner:'alice',sessionId:'d1',peer:'bob',revision:'0',archived:true},method:'POST'}
  ]);
  await page.getByRole('button',{name:'Move to Inbox',exact:true}).click();
  expect(await page.evaluate(()=>archiveFixture.rows('all'))).toEqual(['bob','other']);
  expect(await page.evaluate(()=>archiveFixture.data.rerenders)).toBe(2);
});
test('an existing remote archive is not toggled off by an Archive intent',async({page})=>{
  await fixture(page);await page.evaluate(()=>archiveFixture.data.state={revision:'8',archived:true});
  await page.getByRole('button',{name:'Archive',exact:true}).click();
  expect(await page.evaluate(()=>archiveFixture.data.calls[1].payload)).toMatchObject({revision:'8',archived:true});
});
test('failed archive writes stay visible and do not claim an archived state',async({page})=>{
  await fixture(page);await page.evaluate(()=>archiveFixture.data.failure=true);
  await page.getByRole('button',{name:'Archive',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Unable to update archived chats. Try again.');
  expect(await page.evaluate(()=>archiveFixture.rows('all'))).toEqual(['bob','other']);
});
test('account changes discard archived peers and late lookups cannot send another account action',async({page})=>{
  await fixture(page);await page.evaluate(()=>{archiveFixture.data.peers=['bob'];return archiveFixture.refresh();});
  expect(await page.evaluate(()=>archiveFixture.rows('archived'))).toEqual(['bob']);
  await page.evaluate(()=>archiveFixture.data.deferred='archive/state');await page.getByRole('button',{name:'Archive',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof archiveFixture.data.release)).toBe('function');
  await page.evaluate(()=>{archiveFixture.data.session={username:'mallory',sessionId:'d2'};archiveFixture.data.release();});
  expect(await page.evaluate(()=>archiveFixture.rows('archived'))).toEqual([]);
  expect(await page.evaluate(()=>archiveFixture.data.calls.filter(row=>row.route==='archive'))).toEqual([]);
});
test('background or peer changes prevent an action after late lookup',async({page})=>{
  await fixture(page);await page.evaluate(()=>archiveFixture.data.deferred='archive/state');await page.getByRole('button',{name:'Archive',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof archiveFixture.data.release)).toBe('function');
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});archiveFixture.data.release();});
  expect(await page.evaluate(()=>archiveFixture.data.calls.filter(row=>row.route==='archive'))).toEqual([]);
});
test('a stale list response cannot undo a newer successful archive action',async({page})=>{
  await fixture(page);await page.evaluate(()=>{archiveFixture.data.deferred='archive/list';archiveFixture.refresh();});
  await expect.poll(()=>page.evaluate(()=>typeof archiveFixture.data.release)).toBe('function');
  await page.getByRole('button',{name:'Archive',exact:true}).click();
  await page.evaluate(()=>{archiveFixture.data.peers=[];archiveFixture.data.release();});
  expect(await page.evaluate(()=>archiveFixture.rows('archived'))).toEqual(['bob']);
});
test('failed refresh retains this session archive snapshot, without breaking message filters',async({page})=>{
  await fixture(page);await page.evaluate(()=>{archiveFixture.data.peers=['bob'];return archiveFixture.refresh();});
  await page.evaluate(()=>{archiveFixture.data.failure=true;return archiveFixture.refresh();});
  expect(await page.evaluate(()=>WingaConversationArchive.snapshot(archiveFixture.data.session).error)).toBe(true);
  expect(await page.evaluate(()=>archiveFixture.rows('archived'))).toEqual(['bob']);
});
test('unchanged snapshots do not request another Inbox render',async({page})=>{
  await fixture(page);
  expect(await page.evaluate(()=>archiveFixture.refresh())).toBe(true);
  expect(await page.evaluate(()=>archiveFixture.refresh())).toBe(false);
  expect(await page.evaluate(()=>{archiveFixture.data.peers=['bob'];return archiveFixture.refresh();})).toBe(true);
  expect(await page.evaluate(()=>archiveFixture.refresh())).toBe(false);
});
