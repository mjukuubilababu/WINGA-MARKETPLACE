const {test,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
async function fixture(page,mode='normal') {
  const assets=['src/chat/rich-content.js','src/growth/contract.js','src/growth/internal-share.js'];
  await page.route('https://internal-share.test/**',route=>{
    const name=new URL(route.request().url()).pathname.slice(1);
    if(!name)return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script>window.WingaModules={growth:{},components:{ui:{sanitizeImageSource:()=>""}}};</script>'+assets.map(s=>'<script src="/'+s+'"></script>').join('')+'</body></html>'});
    if(!assets.includes(name))return route.abort();
    return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,name))});
  });
  await page.goto('https://internal-share.test/');
  await page.evaluate(mode=>{
    const state={owner:'alice',session:'a',calls:[],mode};
    const api={
      loadInboxPage:async()=>({items:[{withUser:'bob'}]}),
      shoppingRoom:async(action,args)=>{
        if(action==='list'){
          if(mode==='room-stalled')return new Promise(()=>{});
          if(mode==='unavailable')throw Error('room down');
          return [{id:'11111111-1111-4111-8111-111111111111',name:'Choose a gift',status:'active',transition:{status:'accepted'}}];
        }
        state.calls.push({room:true,id:args[3]});return {id:args[3],status:'sent'};
      },
      getUsers:()=>[{username:'bob',fullName:'Bob'}],searchPeople:async()=>({items:[{username:'carol',fullName:'Carol'}]}),
      loadSharedProduct:async()=>({id:'p1'}),
      sendRichMessage:async(peer,content,options)=>{
        state.calls.push({peer,content,id:options.clientMessageId});
        if(state.mode==='malformed')return {ok:false};
        if(state.mode==='wrong-id')return {id:crypto.randomUUID(),status:'sent'};
        if(state.mode==='queued')return {id:options.clientMessageId,isQueued:true,sendState:'pending'};
        if(state.mode==='failed')return {id:options.clientMessageId,status:'pending',isQueued:true,sendState:'failed'};
        if(state.mode==='security')throw Object.assign(Error('membership'),{code:'encrypted_membership_pending'});
        return {id:options.clientMessageId,status:'sent'};
      }
    };
    if(mode==='unavailable')api.loadInboxPage=async()=>{throw Error('inbox down');};
    const ui=WingaModules.growth.createInternalShare({window,getAccount:()=>state.owner,getIdentity:()=>state.session,
      dataLayer:api,bindSecureShare:()=>{state.securityBound=true;}});
    window.pickerFixture={state,api,ui};void ui.open('p1');
  },mode);
  return page.locator('dialog[data-internal-share]');
}
test('recent people remain usable while Room loading stalls',async({page})=>{
  const picker=await fixture(page,'room-stalled');
  await expect(picker.locator('[data-share-person="bob"]')).toBeVisible();
  await picker.locator('[data-share-person="bob"]').click();
  await expect(picker.locator('[role=status]')).toHaveText('Sent. Recipient delivery is not confirmed.');
});
test('unavailable recents never claim empty history and search still permits explicit sharing',async({page})=>{
  const picker=await fixture(page,'unavailable');
  await expect(picker.locator('[role=status]')).toContainText('could not load');
  await picker.locator('input[type=search]').fill('@carol');
  await picker.locator('[data-share-person="carol"]').click();
  expect(await page.evaluate(()=>pickerFixture.state.calls.map(c=>c.peer))).toEqual(['carol']);
});
for(const mode of ['queued','failed','malformed','wrong-id'])test(mode+' response cannot claim successful sharing and retry retains the same ID',async({page})=>{
  const picker=await fixture(page,mode),person=picker.locator('[data-share-person="bob"]');
  await person.click();
  await expect(picker.locator('[role=status]')).toContainText(mode==='queued'?'Queued for sending':'Unable to share');
  await expect(person).toBeVisible();
  await page.evaluate(()=>pickerFixture.state.mode='normal');await person.click();
  await expect(person).toHaveCount(0);
  const calls=await page.evaluate(()=>pickerFixture.state.calls);
  expect(calls).toHaveLength(2);expect(calls[0].id).toBe(calls[1].id);
  expect(calls[1].content).toMatchObject({type:'product',data:{ids:['p1']}});
});
test('membership pending exposes canonical security setup without sending to someone else',async({page})=>{
  const picker=await fixture(page,'security');await picker.locator('[data-share-person="bob"]').click();
  await expect(picker.locator('[data-chat-security="bob"]')).toBeVisible();
  expect(await page.evaluate(()=>pickerFixture.state.securityBound)).toBe(true);
  expect(await page.evaluate(()=>pickerFixture.state.calls.length)).toBe(1);
});
for(const change of ['close','session'])test(change+' during content lookup prevents a late send',async({page})=>{
  const picker=await fixture(page);
  await page.evaluate(()=>pickerFixture.api.loadSharedProduct=()=>new Promise(resolve=>pickerFixture.release=resolve));
  await picker.locator('[data-share-person="bob"]').click();
  await expect.poll(()=>page.evaluate(()=>typeof pickerFixture.release)).toBe('function');
  await page.evaluate(change=>{
    if(change==='close')document.querySelector('dialog[data-internal-share]').close();else pickerFixture.state.session='replacement';
    pickerFixture.release({id:'p1'});
  },change);
  await expect(picker).toHaveCount(0);expect(await page.evaluate(()=>pickerFixture.state.calls)).toEqual([]);
});
