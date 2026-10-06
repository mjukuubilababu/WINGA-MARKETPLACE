const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
async function fixture(page,{width=390,locale='en'}={}) {
  await page.setViewportSize({width,height:844});
  await page.route('http://local-search.test/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main id="chat"><button data-chat-message-search hidden>Search messages</button></main><script src="/src/chat/message-search.js"></script><script src="/src/chat/message-search-ui.js"></script></body></html>'});
    if(!['/style.css','/src/chat/message-search.js','/src/chat/message-search-ui.js'].includes(url.pathname))return route.abort();
    return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript',
      body:fs.readFileSync(path.join(root,url.pathname.slice(1)))});
  });
  await page.goto('http://local-search.test/');
  const messages=JSON.parse(fs.readFileSync(path.join(root,'src/localization/catalogs',locale+'.json'),'utf8')).messages;
  await page.evaluate(({locale,messages})=>{
    document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';
    const row=(id,more={})=>({id,senderId:'bob',receiverId:'alice',message:'Cream sofa',timestamp:'2026-10-06T10:00:00Z',...more});
    const state={session:{username:'alice',sessionId:'s1',token:'t1'},peer:'bob',
      messages:[row('one'),row('two',{senderId:'alice',receiverId:'bob',message:'Black sofa',timestamp:'2026-10-07T10:00:00Z'}),
        row('xss',{message:'<img src="https://private.test" onerror="alert(1)"> chair'}),
        row('raw',{message:'WINGA-MEDIA/SECRET sofa'}),row('outsider',{receiverId:'mallory',message:'UNRELATED sofa'})]};
    const options={getSession:()=>state.session,getPeer:()=>state.peer,getMessages:()=>state.messages,
      translate:(key,fallback)=>messages[key]||fallback};
    WingaMessageSearchUi.bind(document.getElementById('chat'),options);
    state.rebind=()=>WingaMessageSearchUi.bind(document.getElementById('chat'),options);
    window.searchFixture=state;
  },{locale,messages});
  await page.locator('[data-chat-message-search]').click();
}
test('search uses only local visible messages and sender/date filters without any private network request',async({page})=>{
  const network=[];page.on('request',request=>network.push(request.url()));
  await fixture(page);network.length=0;
  await page.locator('input[name=query]').fill('sofa');await page.locator('form button[type=submit]').click();
  await expect(page.locator('.chat-message-search-result')).toHaveCount(2);
  await page.locator('select').selectOption('bob');await page.locator('form button[type=submit]').click();
  await expect(page.locator('.chat-message-search-result')).toHaveCount(1);
  await page.locator('input[name=from]').fill('2026-10-07');await page.locator('form button[type=submit]').click();
  await expect(page.locator('.chat-message-search-result')).toHaveCount(0);
  await expect(page.locator('[role=status]')).toContainText('No matching messages');
  expect(network).toEqual([]);
  expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
});
test('results render as text, never private URLs or executable HTML',async({page})=>{
  await fixture(page);await page.locator('input[name=query]').fill('chair');
  await page.locator('form button[type=submit]').click();
  await expect(page.locator('.chat-message-search-result p')).toContainText('<img');
  await expect(page.locator('.chat-message-search-result img,.chat-message-search-result a')).toHaveCount(0);
});
for(const changed of ['account','session','peer','scope','hidden'])test('search clears plaintext on '+changed,async({page})=>{
  await fixture(page);await page.locator('input[name=query]').fill('sofa');
  await page.locator('form button[type=submit]').click();await expect(page.locator('.chat-message-search-result')).toHaveCount(2);
  await page.evaluate(changed=>{
    if(changed==='account')searchFixture.session.username='mallory';
    if(changed==='session')searchFixture.session.token='new-session';
    if(changed==='peer')searchFixture.peer='mallory';
    if(changed==='scope')document.getElementById('chat').remove();
    if(changed==='hidden'){
      Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
      document.dispatchEvent(new Event('visibilitychange'));
    }
  },changed);
  await expect(page.locator('dialog')).toHaveCount(0);await expect(page.locator('body')).not.toContainText('Cream sofa');
});
for(const [width,locale]of [[320,'en'],[390,'sw'],[1440,'fr'],[390,'ar']])test('search layout '+width+' '+locale,async({page},testInfo)=>{
  await fixture(page,{width,locale});await page.locator('input[name=query]').fill('sofa');
  await page.locator('form button[type=submit]').click();
  expect(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  const controls=await page.locator('dialog input,dialog select,dialog button').evaluateAll(els=>els.map(el=>{
    const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};}));
  expect(controls.every(r=>r.left>=0&&r.right<=width&&r.width>0)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('message-search.png')});
  await page.getByRole('button',{name:locale==='en'?'Close':locale==='sw'?'Funga':locale==='fr'?'Fermer':'إغلاق',exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);
});
