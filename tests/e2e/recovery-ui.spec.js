const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const kit={version:1,purpose:'winga-history-recovery',owner:'alice',key:'A'.repeat(43),
  checkpoint:{v:1,owner:'alice',revision:'1',hash:'0'.repeat(64)}};
async function fixture(page) {
  await page.route('http://recovery-ui.test/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><script src="/src/chat/rich-content.js"></script><script src="/src/chat/encrypted-media-client.js"></script><script src="/src/chat/recovery-ui.js"></script></body></html>'});
    if(!['/style.css','/src/chat/rich-content.js','/src/chat/encrypted-media-client.js','/src/chat/recovery-ui.js'].includes(url.pathname))return route.abort();
    return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(root,url.pathname.slice(1)))});
  });
  await page.goto('http://recovery-ui.test/');
  await page.evaluate(()=>{
    const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    const row=(n,message,offset=0)=>({id:id(n),message,owner:'alice',peer:'bob',conversationId:'c1',timestamp:new Date(1750000000000+offset).toISOString(),status:'sent'});
    const data={owner:'alice',closed:false,history:[
      row(1,'Original text'),row(2,'Deleted private text'),
      row(3,WingaRichContent.encode(WingaRichContent.create('edit','Corrected text',{targetId:id(1)})),1000),
      row(4,WingaRichContent.encode(WingaRichContent.create('hide','',{targetId:id(2)})),2000),
      row(5,WingaRichContent.encode(WingaRichContent.create('product','',{ids:['product-private-id']})),3000),
      row(6,WingaRichContent.encode(WingaRichContent.create('reaction','',{targetId:id(1),emoji:WingaRichContent.REACTIONS[1]})),4000),
      row(7,'WINGA-CONTENT/9\n{"text":"FUTURE PRIVATE PAYLOAD"}',5000)
    ]};
    const session={owner:'alice',check(){if(data.owner!=='alice'||data.closed)throw Error('recovery_session_changed');},
      state:async()=>({revision:'1'}),restore:async()=>({restored:data.history.length}),
      backup:async()=>new Promise(resolve=>data.releaseBackup=result=>resolve(result)),
      archive:async()=>{if(data.archiveFailure)throw Error('archive_unavailable');return data.defer?new Promise(resolve=>data.release=()=>resolve(data.history)):data.history;},
      close(){data.closed=true;}};
    window.recoveryFixture={data,session,open:()=>WingaRecoveryUi.open({dataLayer:{createEncryptedRecovery:async()=>session}})};
  });
  await page.evaluate(()=>recoveryFixture.open());
  await page.locator('[data-recovery-file]').setInputFiles({name:'synthetic-kit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(kit))});
  await expect(page.getByRole('button',{name:'Restore history',exact:true})).toBeEnabled();
}
test('restored rich preview projects edits and own deletion before slicing and never displays wire payloads',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'Restore history',exact:true}).click();
  const archive=page.locator('.chat-recovery-archive');
  await expect(archive).toContainText('Corrected text');await expect(archive).toContainText('Edited');
  await expect(archive).toContainText('Product');await expect(archive).toContainText('This item is unavailable.');
  const text=await archive.textContent();
  for(const hidden of ['Original text','Deleted private text','WINGA-CONTENT','targetId','product-private-id','FUTURE PRIVATE PAYLOAD'])expect(text).not.toContain(hidden);
  expect(await archive.locator('p').count()).toBe(3);
});
test('a missing rich projector fails preview closed without undoing a successful restore',async({page})=>{
  await fixture(page);await page.evaluate(()=>delete window.WingaRichContent);
  await page.getByRole('button',{name:'Restore history',exact:true}).click();
  await expect(page.locator('dialog [role=status]')).toContainText('History restored: 7');
  await expect(page.locator('.chat-recovery-archive')).toContainText('Preview is unavailable');
  expect(await page.locator('.chat-recovery-archive').textContent()).not.toContain('Original text');
});

test('mutation records cannot crowd the original message out of a bounded recovery preview',async({page})=>{
  await fixture(page);
  await page.evaluate(()=>{
    const first=recoveryFixture.data.history[0];
    recoveryFixture.data.history=[first,...Array.from({length:25},(_,n)=>({...first,
      id:'00000000-0000-4000-8000-'+String(n+100).padStart(12,'0'),
      timestamp:new Date(Date.parse(first.timestamp)+n+1).toISOString(),
      message:WingaRichContent.encode(WingaRichContent.create('reaction','',{targetId:first.id,emoji:WingaRichContent.REACTIONS[0]}))}))];
  });
  await page.getByRole('button',{name:'Restore history',exact:true}).click();
  await expect(page.locator('.chat-recovery-archive')).toContainText('Original text');
  await expect(page.locator('.chat-recovery-archive p')).toHaveCount(1);
});

test('a failed archive read does not falsely report that the successful restore failed',async({page})=>{
  await fixture(page);await page.evaluate(()=>recoveryFixture.data.archiveFailure=true);
  await page.getByRole('button',{name:'Restore history',exact:true}).click();
  await expect(page.locator('dialog [role=status]')).toContainText('History restored: 7');
  await expect(page.locator('.chat-recovery-archive')).toContainText('Preview is unavailable');
});
test('late archive read after account switch cannot append plaintext into a closed recovery dialog',async({page})=>{
  await fixture(page);await page.evaluate(()=>recoveryFixture.data.defer=true);
  await page.getByRole('button',{name:'Restore history',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof recoveryFixture.data.release)).toBe('function');
  await page.evaluate(()=>recoveryFixture.data.owner='other');
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.evaluate(()=>recoveryFixture.data.release());
  expect(await page.locator('body').textContent()).not.toContain('Corrected text');
});
test('hiding the app clears the open recovery key and confirmation surface',async({page})=>{
  await fixture(page);
  await page.locator('[data-recovery-confirm]').fill(kit.key);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>recoveryFixture.data.closed)).toBe(true);
});

test('a backup completed after the app is hidden cannot download a recovery key',async({page})=>{
  await fixture(page);const downloads=[];page.on('download',download=>downloads.push(download));
  await page.locator('[data-recovery-confirm]').fill(kit.key);
  await page.getByRole('button',{name:'Back up and export',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof recoveryFixture.data.releaseBackup)).toBe('function');
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('dialog')).toHaveCount(0);
  await page.evaluate(async result=>{recoveryFixture.data.releaseBackup(result);await new Promise(resolve=>setTimeout(resolve,100));},kit);
  expect(downloads).toHaveLength(0);
});
