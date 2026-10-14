const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
async function fixture(page,shareActivity=false){
  await page.clock.install();
  await page.route('https://activity-ui.test/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><main id="chat"><small class="thread-presence">Last message</small><div class="messages-thread-actions"></div><textarea id="message-compose-input"></textarea></main><script src="/activity.js"></script>'});
    if(url.pathname==='/activity.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.resolve(__dirname,'../../src/chat/activity-ui.js'),'utf8')});
    return route.abort();
  });await page.goto('https://activity-ui.test/');
  await page.evaluate(share=>{
    const f={session:{username:'alice',sessionId:'synthetic',token:'synthetic'},peer:'bob',calls:[],
      state:{version:1,revision:'0',shareActivity:share},response:{version:1,conversationId:'synthetic-room',enabled:true,states:[]}};
    const api={conversationActivityPreferences:async()=>({...f.state}),
      setConversationActivitySharing:async(value,revision,id)=>{f.calls.push({setting:value,revision,id});
        if(f.failSave)throw Error('synthetic unavailable');f.state={version:1,shareActivity:value,revision:String(Number(revision)+1)};return {...f.state};},
      conversationActivity:async(peer,online,typing)=>{f.calls.push({peer,online,typing});return f.response;},
      subscribeConversationActivity:callback=>{f.publish=callback;return()=>{f.unsubscribed=true;};}};
    WingaConversationActivityUi.bind(document.getElementById('chat'),{dataLayer:api,getSession:()=>f.session,getPeer:()=>f.peer});window.activityFixture=f;
  },shareActivity);
}
test('activity defaults off and requires an explicit unchecked privacy choice',async({page})=>{
  await fixture(page);await page.clock.fastForward(9000);
  expect(await page.evaluate(()=>activityFixture.calls)).toEqual([]);
  await page.getByRole('button',{name:'Activity privacy'}).click();
  await expect(page.locator('[data-chat-activity-choice]')).not.toBeChecked();
  await page.locator('[data-chat-activity-choice]').check();await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>activityFixture.calls[0].setting)).toBe(true);
  await page.locator('textarea').fill('private text is never sent as activity');await page.clock.fastForward(3000);
  const pulses=await page.evaluate(()=>activityFixture.calls.filter(v=>v.peer));
  expect(pulses.some(v=>v.typing===true)).toBe(true);
  expect(JSON.stringify(pulses)).not.toContain('private text');
});
test('typing expires before online and unavailable metadata restores the original context label',async({page})=>{
  await fixture(page,true);await page.waitForFunction(()=>activityFixture.calls.length>0);
  await page.evaluate(()=>activityFixture.publish({version:1,conversationId:'synthetic-room',enabled:true,
    states:[{owner:'bob',online:true,typing:true,typingTtlMs:2000,ttlMs:12000}]}));
  await expect(page.locator('.thread-presence')).toHaveText('Typing…');await page.clock.fastForward(2500);
  await expect(page.locator('.thread-presence')).toHaveText('Online');
  await page.evaluate(()=>activityFixture.publish({version:1,conversationId:'wrong',enabled:true,states:[]}));
  await expect(page.locator('.thread-presence')).toHaveText('Online');
  await page.clock.fastForward(13000);await expect(page.locator('.thread-presence')).toHaveText('Last message');
});
test('failed consent save does not show success and account changes stop metadata updates',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'Activity privacy'}).click();
  await page.locator('[data-chat-activity-choice]').check();await page.evaluate(()=>activityFixture.failSave=true);
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('[role=status]')).toContainText('Unable');
  await expect(page.locator('dialog')).toHaveCount(1);
  await page.evaluate(()=>activityFixture.session={username:'eve',sessionId:'other',token:'other'});await page.clock.fastForward(1000);
  await expect(page.locator('dialog')).toHaveCount(0);expect(await page.evaluate(()=>activityFixture.unsubscribed)).toBe(true);
});
