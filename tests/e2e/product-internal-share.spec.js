const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
async function fixture(page,{inboxFailure=false,roomFailure=false,delayed=false,failSend=false,pending=false,rtl=false}={}) {
  await page.setViewportSize({width:390,height:844});
  await page.route('http://127.0.0.1:47861/**',route=>{
    const name=new URL(route.request().url()).pathname;
    if(name==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><script src="/src/chat/rich-content.js"></script><script src="/src/chat/rich-ui.js"></script>'});
    if(!['/style.css','/src/chat/rich-content.js','/src/chat/rich-ui.js'].includes(name))return route.abort();
    return route.fulfill({contentType:name.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(root,name.slice(1)))});
  });
  await page.goto('http://127.0.0.1:47861/');
  const messages=JSON.parse(fs.readFileSync(path.join(root,'src/localization/catalogs',rtl?'ar.json':'en.json'),'utf8')).messages;
  await page.evaluate(({inboxFailure,roomFailure,delayed,failSend,pending,messages,rtl})=>{
    document.documentElement.dir=rtl?'rtl':'ltr';
    const state={session:{username:'alice',sessionId:'device-a',token:'synthetic-only'},sends:[],reads:[],failSend,pending};
    const peers={items:[{withUser:'bob',latestMessage:'PRIVATE_BODY_SENTINEL'},{withUser:'bob'},{withUser:'alice'},{withUser:'blocked',blocked:true},{withUser:'<img src=x onerror=alert(1)>'}]};
    const room=(id,extra={})=>({id,name:id,status:'active',transition:{status:'accepted'},...extra});
    const rooms=[room('friends'),room('pending',{transition:{status:'pending'}}),room('removed',{status:'removed'}),room('departing',{departures:[{}]}),room('archived',{preferences:{archived:true}}),room('broken',{clientError:'unavailable'})];
    let resolveReads;const wait=delayed?new Promise(r=>resolveReads=r):Promise.resolve();
    const send=async value=>{state.sends.push(value);if(state.pending)throw Object.assign(new Error('synthetic private provider diagnostic'),{code:'crypto_device_pending'});if(state.failSend){state.failSend=false;throw new TypeError('synthetic response lost');}};
    const api={loadInboxPage:async opts=>{state.reads.push(['inbox',opts]);await wait;if(inboxFailure)throw Error();return peers;},
      shoppingRoom:async(action,args)=>{if(action==='list'){state.reads.push(['rooms']);await wait;if(roomFailure)throw Error();return rooms;}return send({kind:'room',action,args});},
      sendRichMessage:(peer,content,id)=>send({kind:'conversation',peer,content,id})};
    const open=()=>WingaRichUi.openProductShare({productId:'p1',dataLayer:api,getSession:()=>state.session,translate:(k,f)=>messages[k]||f});
    window.internalFixture={state,api,open,release:()=>resolveReads?.()};open();
  },{inboxFailure,roomFailure,delayed,failSend,pending,messages,rtl});
}
const target=(page,kind,id)=>page.locator(`[data-share-kind="${kind}"][data-share-target="${id}"]`);
test('mobile picker lists canonical contacts and accepted rooms, with no automatic send or private preview',async({page})=>{
  await fixture(page);await expect(target(page,'conversation','bob')).toHaveCount(1);await expect(target(page,'room','friends')).toBeVisible();
  await expect(page.locator('[data-share-target]')).toHaveCount(2);await expect(page.locator('body')).not.toContainText('PRIVATE_BODY_SENTINEL');
  await expect(page.getByRole('button',{name:'Send message',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>internalFixture.state.sends)).toEqual([]);
  await target(page,'conversation','bob').click();expect(await page.evaluate(()=>internalFixture.state.sends)).toEqual([]);
  await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  const sent=await page.evaluate(()=>internalFixture.state.sends);expect(sent).toHaveLength(1);expect(sent[0].content.data).toEqual({ids:['p1']});expect(sent[0].content.text).toBe('');expect(sent[0].peer).toBe('bob');expect(sent[0].id).toMatch(/^[0-9a-f-]{36}$/);
});
test('room sharing reuses canonical encrypted command with only the selected product reference',async({page})=>{
  await fixture(page);await target(page,'room','friends').click();await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);const [s]=await page.evaluate(()=>internalFixture.state.sends);
  expect(s.kind).toBe('room');expect(s.action).toBe('command');expect(s.args.slice(0,3)).toEqual(['friends','product-share',{productId:'p1',note:'',snapshot:null}]);expect(s.args[3]).toMatch(/^[0-9a-f-]{36}$/);
});
test('in-flight sending ignores repeated clicks; late completion cannot close a new picker',async({page})=>{
  await fixture(page);await page.evaluate(()=>{internalFixture.api.sendRichMessage=async(peer,content,id)=>{internalFixture.state.sends.push({peer,content,id});await new Promise(r=>internalFixture.finishSend=r);};});
  await target(page,'conversation','bob').click();await page.getByRole('button',{name:'Send message',exact:true}).click();
  await page.evaluate(()=>document.querySelector('.chat-rich-actions button').click());expect(await page.evaluate(()=>internalFixture.state.sends.length)).toBe(1);
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.evaluate(()=>{internalFixture.open();internalFixture.finishSend();});
  await expect(page.locator('dialog')).toHaveCount(1);await expect(target(page,'room','friends')).toBeVisible();
});
test('room labels remain text and malformed identities never become destinations',async({page})=>{
  await fixture(page);await page.evaluate(()=>{document.querySelector('dialog').close();internalFixture.api.loadInboxPage=async()=>({items:[{},null,{withUser:'bob'}]});
    internalFixture.api.shoppingRoom=async()=>[{id:'friends',name:'<img src=x onerror=alert(1)>',status:'active',transition:{status:'accepted'}}];internalFixture.open();});
  await expect(page.locator('[data-share-target]')).toHaveCount(2);await expect(target(page,'room','friends')).toHaveText('<img src=x onerror=alert(1)>');await expect(page.locator('dialog img')).toHaveCount(0);
});
test('uncertain acceptance retries the same action ID and destination without duplicate clicks',async({page})=>{
  await fixture(page,{failSend:true});await target(page,'conversation','bob').click();await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();await expect(target(page,'room','friends')).toBeDisabled();
  await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
  const sent=await page.evaluate(()=>internalFixture.state.sends);expect(sent).toHaveLength(2);expect(sent[1]).toEqual(sent[0]);
});
test('canonical device approval rejection keeps the action pending and exposes no provider details',async({page})=>{
  await fixture(page,{pending:true});await target(page,'conversation','bob').click();await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.locator('[role="status"]')).toHaveText('Unable to finish. Try again.');await expect(page.locator('body')).not.toContainText('provider diagnostic');
  await expect(page.locator('dialog')).toHaveCount(1);expect(await page.evaluate(()=>internalFixture.state.sends.length)).toBe(1);
});
for(const change of ['account','auth-session','logout'])test(`stale ${change} closes picker and cannot send`,async({page})=>{
  await fixture(page);await target(page,'conversation','bob').click();
  await page.evaluate(change=>{const s=internalFixture.state;s.session=change==='logout'?null:change==='account'?{username:'eve',sessionId:'new',token:'new'}:{...s.session,token:'replacement'};},change);
  await expect(page.locator('dialog')).toHaveCount(0);expect(await page.evaluate(()=>internalFixture.state.sends)).toEqual([]);
});
test('late destination reads after account change or close are discarded',async({page})=>{
  await fixture(page,{delayed:true});await page.evaluate(()=>{internalFixture.state.session=null;internalFixture.release();});
  await expect(page.locator('dialog')).toHaveCount(0);await expect(page.locator('[data-share-target]')).toHaveCount(0);
  expect(await page.evaluate(()=>internalFixture.state.sends)).toEqual([]);
});
for(const failing of ['inboxFailure','roomFailure'])test(`${failing} does not block the other canonical destination type`,async({page})=>{
  await fixture(page,{[failing]:true});const kind=failing==='inboxFailure'?'room':'conversation',id=kind==='room'?'friends':'bob';
  await expect(target(page,kind,id)).toBeVisible();await expect(page.locator('[role="status"]')).toHaveText('Some destinations could not be loaded.');
  await target(page,kind,id).click();await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
});
test('closing on a phone cancels selection and preserves the public product action',async({page})=>{
  await fixture(page);await target(page,'room','friends').click();await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);expect(await page.evaluate(()=>internalFixture.state.sends)).toEqual([]);
});
test('Arabic phone picker remains within the viewport and guests cannot open authenticated destination lists',async({page})=>{
  await fixture(page,{rtl:true});await expect(target(page,'room','friends')).toBeVisible();
  const box=await page.locator('dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  await page.evaluate(()=>{document.querySelector('dialog').close();internalFixture.state.session=null;internalFixture.open();});await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>internalFixture.state.reads.length)).toBe(2);
});
