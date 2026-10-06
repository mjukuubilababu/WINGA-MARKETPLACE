const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
async function fixture(page,viewport={width:390,height:844}) {
  await page.setViewportSize(viewport);
  await page.route('http://notification-ui.test/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main id="chat"><button data-chat-notifications="bob" hidden>Notifications</button></main><script src="/src/chat/preference-sync.js"></script><script src="/src/chat/notification-ui.js"></script></body></html>'});
    if(!['/style.css','/src/chat/preference-sync.js','/src/chat/notification-ui.js'].includes(url.pathname))return route.abort();
    return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(root,url.pathname.slice(1)))});
  });await page.goto('http://notification-ui.test/');
  await page.evaluate(()=>{
    const data={session:{username:'alice',sessionId:'device-1'},peer:'bob',calls:[],state:{revision:'0',muted:false}};
    WingaConversationNotifications.bind(document.getElementById('chat'),{
      getSession:()=>data.session,getPeer:()=>data.peer,dataLayer:{async pushRequest(route,payload,method){
        data.calls.push({route,payload,method});
        if(data.deferred&&(data.deferred===true||data.deferred===route)){
          const saved={...data.state};return new Promise(resolve=>data.release=()=>resolve(saved));
        }
        if(data.conflict&&route==='mute')throw Object.assign(Error('conflict'),{status:409});
        if(route==='mute')data.state={revision:String(Number(data.state.revision)+1),muted:payload.muted};
        return data.state;
      }}});window.muteFixture=data;
  });
}
test('notification settings persist one indefinite switch and revision without a message send',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await page.getByRole('switch').check();await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('dialog [role=status]')).toHaveText('Alerts muted');
  expect(await page.evaluate(()=>muteFixture.calls)).toEqual([
    {route:'mute/state',payload:{owner:'alice',sessionId:'device-1',peer:'bob'},method:'POST'},
    {route:'mute',payload:{owner:'alice',sessionId:'device-1',peer:'bob',muted:true,revision:'0'},method:'POST'}
  ]);
  await page.getByRole('switch').uncheck();await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('dialog [role=status]')).toHaveText('Alerts on');
});
test('a stale revision failure is visible and never claims mute was saved',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await page.evaluate(()=>muteFixture.conflict=true);await page.getByRole('switch').check();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('dialog [role=status]')).toHaveText('Unable to update notifications. Try again.');
  expect(await page.evaluate(()=>muteFixture.state.muted)).toBe(false);
});
test('late preference lookup cannot open a dialog for a different account',async({page})=>{
  await fixture(page);await page.evaluate(()=>muteFixture.deferred=true);
  await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof muteFixture.release)).toBe('function');
  await page.evaluate(()=>{muteFixture.session={username:'other',sessionId:'device-2'};muteFixture.release();});
  await expect(page.locator('dialog')).toHaveCount(0);
});
test('changing the current participant closes notification settings',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await page.evaluate(()=>muteFixture.peer='mallory');await expect(page.locator('dialog')).toHaveCount(0);
});
test('backgrounding closes the single-switch dialog without saving',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await page.getByRole('switch').check();
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>muteFixture.calls.filter(item=>item.route==='mute'))).toHaveLength(0);
});
test('an open untouched switch reconciles a change made on another device',async({page})=>{
  await fixture(page);await page.clock.install();await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await page.evaluate(()=>muteFixture.state={revision:'1',muted:true});await page.clock.runFor(15000);
  await expect(page.getByRole('switch')).toBeChecked();await expect(page.locator('dialog [role=status]')).toHaveText('Alerts muted');
  expect(await page.evaluate(()=>muteFixture.calls.filter(item=>item.route==='mute'))).toHaveLength(0);
});
test('an unsaved choice is preserved and conflicts require another explicit Save',async({page})=>{
  await fixture(page);await page.clock.install();await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await page.getByRole('switch').check();await page.evaluate(()=>{muteFixture.state={revision:'7',muted:false};muteFixture.conflict=true;});
  await page.clock.runFor(15000);await expect(page.getByRole('switch')).toBeChecked();
  expect(await page.evaluate(()=>muteFixture.calls)).toHaveLength(1);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('dialog [role=status]')).toHaveText('Unable to update notifications. Try again.');
  await expect(page.getByRole('switch')).toBeChecked();
  expect(await page.evaluate(()=>muteFixture.calls.filter(item=>item.route==='mute'))).toHaveLength(1);
  await page.evaluate(()=>muteFixture.conflict=false);await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('dialog [role=status]')).toHaveText('Alerts muted');
  expect(await page.evaluate(()=>muteFixture.calls.filter(item=>item.route==='mute').at(-1).payload.revision)).toBe('7');
});
test('a delayed poll cannot overwrite a newer explicit save',async({page})=>{
  await fixture(page);await page.clock.install();await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await page.evaluate(()=>muteFixture.deferred='mute/state');await page.clock.runFor(15000);
  await expect.poll(()=>page.evaluate(()=>typeof muteFixture.release)).toBe('function');
  await page.getByRole('switch').check();await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('dialog [role=status]')).toHaveText('Alerts muted');await page.evaluate(()=>muteFixture.release());
  await expect(page.getByRole('switch')).toBeChecked();await expect(page.locator('dialog [role=status]')).toHaveText('Alerts muted');
});
test('closing settings cancels reconciliation and prevents any background writes',async({page})=>{
  await fixture(page);await page.clock.install();await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.clock.runFor(60000);
  expect(await page.evaluate(()=>muteFixture.calls)).toHaveLength(1);
});
for(const width of [320,1280])test('notification settings fit viewport '+width,async({page})=>{
  await fixture(page,{width,height:844});await page.getByRole('button',{name:'Notifications',exact:true}).click();
  const rect=await page.locator('dialog').boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(width);
  await expect(page.getByRole('switch')).toHaveCount(1);await expect(page.locator('select')).toHaveCount(0);
  await page.screenshot({path:path.join(root,'.tmp-chat-ui','mute-settings-'+width+'.png')});
});
