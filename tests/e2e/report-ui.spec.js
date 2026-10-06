const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
async function fixture(page,{width=390,locale='en'}={}) {
  await page.setViewportSize({width,height:844});
  await page.route('http://localhost:4389/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main id="chat"><button data-chat-report hidden>Report conversation</button><button data-message-report="m1" hidden>Report one</button></main><script src="/src/chat/secure-content.js"></script><script src="/src/chat/report-ui.js"></script></body></html>'});
    if(!['/style.css','/src/chat/report-ui.js','/src/chat/secure-content.js'].includes(url.pathname))return route.abort();
    return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(root,url.pathname.slice(1)))});
  });
  await page.goto('http://localhost:4389/');
  const messages=JSON.parse(fs.readFileSync(path.join(root,'src/localization/catalogs',locale+'.json'),'utf8')).messages;
  await page.evaluate(({messages,locale})=>{
    document.documentElement.dir=locale==='ar'?'rtl':'ltr';document.documentElement.lang=locale;
    const data={session:{username:'alice',sessionId:'sa',token:'ta',role:'buyer'},peer:'bob',calls:[],reads:[],
      messages:[{id:'m1',senderId:'bob',receiverId:'alice',message:'Selected incoming message'},
        {id:'m2',senderId:'bob',receiverId:'alice',message:'Private other message'},
        {id:'own',senderId:'alice',receiverId:'bob',message:'My reply'},
        {id:'media1',senderId:'bob',receiverId:'alice',message:'WINGA-MEDIA/SECRET-FILENAME-KEY',attachmentId:'attachment-secret'},
        {id:'outsider',senderId:'bob',receiverId:'mallory',message:'UNRELATED SECRET'},
        {id:'pending',senderId:'bob',receiverId:'alice',status:'pending',message:'PENDING SECRET'},
        {id:'event',senderId:'bob',receiverId:'alice',eventRecord:true,message:'MUTATION SECRET'},
        {id:'raw',senderId:'bob',receiverId:'alice',message:'WINGA-CONTENT/RAW SECRET'}]};
    const layer={async createConversationReport(payload){data.calls.push(payload);
      if(data.deferred)return new Promise(resolve=>data.release=()=>resolve({ok:true,id:'report-test'}));
      if(data.fail)throw Error('PRIVATE PROVIDER ERROR');
      return {ok:true,id:'report-test'};
    },async readSharedReportEvidence(payload){data.reads.push(payload);
      const result={id:payload.reportId,plaintextVerified:false,filesShared:false,selection:[{sender:'bob',text:'<img src="https://secret.test/file" onerror="alert(1)"> selected evidence'}]};
      if(data.deferred)return new Promise(resolve=>data.release=()=>resolve(result));
      if(data.fail)throw Error('PRIVATE ERROR');
      return result;
    }};
    const options={getSession:()=>data.session,getPeer:()=>data.peer,getMessages:()=>data.messages,dataLayer:layer,
      translate:(key,fallback)=>messages[key]||fallback};
    WingaConversationReports.bind(document.getElementById('chat'),options);
    data.review=()=>{data.session.role='moderator';WingaConversationReports.review(document.getElementById('chat'),options,'report-test');};
    data.rebind=()=>WingaConversationReports.bind(document.getElementById('chat'),options);
    data.enableFiles=()=>{
      data.downloads=[];data.uploads=[];
      layer.downloadEncryptedMedia=async id=>{
        data.downloads.push(id);
        const result={blob:new Blob(['synthetic selected evidence'],{type:'text/plain'}),name:'evidence.txt'};
        if(data.deferDownload)return new Promise(resolve=>data.releaseDownload=()=>resolve(result));
        return result;
      };
      layer.uploadReportFile=async payload=>{
        data.uploads.push(payload);if(data.uploadFail)throw Error('PRIVATE ERROR');
        return {ok:true,id:payload.fileId};
      };
      data.openFileReview=()=>{
        data.session.role='moderator';
        layer.readSharedReportEvidence=async payload=>{
          data.reads.push(payload);return {id:payload.reportId,plaintextVerified:false,filesShared:true,
            selection:[{sender:'bob',text:'Selected attachment'}],
            files:[{id:data.calls[0].files[0].id,bytes:data.calls[0].files[0].bytes,available:true}]};
        };
        data.fileReads=[];
        layer.readSharedReportFile=async payload=>{
          data.fileReads.push(payload);return {ok:true,id:payload.fileId,
            descriptor:data.calls[0].files[0].descriptor,ciphertext:data.uploads[0].ciphertext};
        };
        WingaConversationReports.review(document.getElementById('chat'),options,'report-test');
      };
    };
    window.reportFixture=data;
  },{messages,locale});
}
const submit=page=>page.locator('dialog .chat-security-actions button').first();
const consent=page=>page.locator('[data-report-consent]');
test('report subjects require selected incoming canonical evidence, not unrelated or outgoing targets',async({page})=>{
  await fixture(page);await page.locator('[data-chat-report]').click();
  const subject=page.locator('dialog select').first();
  await subject.selectOption('media');
  await page.locator('[data-report-message="m1"]').check();await consent(page).check();
  await expect(submit(page)).toBeDisabled();
  await page.locator('[data-report-message="media1"]').check();await expect(submit(page)).toBeEnabled();
  await submit(page).click();
  expect(await page.evaluate(()=>reportFixture.calls[0].subject)).toEqual({type:'media',id:'media1'});
});
test('only explicit selected evidence is shared; no automatic disclosure or private attachment bytes',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'Report one',exact:true}).click();
  await expect(page.locator('[data-report-message]')).toHaveCount(4);
  await expect(page.locator('[data-report-message="m1"]')).toBeChecked();
  await expect(submit(page)).toBeDisabled();await expect(consent(page)).not.toBeChecked();
  expect(await page.evaluate(()=>reportFixture.calls)).toHaveLength(0);
  await page.locator('[data-report-message="media1"]').check();await consent(page).check();await submit(page).click();
  await expect(page.locator('dialog [role=status]')).toContainText('Report received');
  const calls=await page.evaluate(()=>reportFixture.calls);expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({owner:'alice',sessionId:'sa',peer:'bob',consent:'share-selected-message-evidence-v1'});
  expect(calls[0].selection).toEqual([{id:'m1',kind:'text',text:'Selected incoming message'},
    {id:'media1',kind:'media',text:'Encrypted attachment (file not shared)'}]);
  for(const secret of ['SECRET','Private other message','My reply','attachment-secret','token'])expect(JSON.stringify(calls)).not.toContain(secret);
  await expect(submit(page)).toBeDisabled();
});
test('conversation reports start with no selection and allow at most ten messages',async({page})=>{
  await fixture(page);await page.evaluate(()=>{
    reportFixture.messages=Array.from({length:12},(_,i)=>({id:'m'+i,senderId:'bob',receiverId:'alice',message:'Message '+i}));
  });await page.getByRole('button',{name:'Report conversation',exact:true}).click();
  await expect(page.locator('[data-report-message]:checked')).toHaveCount(0);
  await consent(page).check();await expect(submit(page)).toBeDisabled();
  for(let i=0;i<10;i++)await page.locator('[data-report-message="m'+i+'"]').check();
  await expect(page.locator('[data-report-message="m10"]')).toBeDisabled();
  await page.locator('[data-report-message="m0"]').uncheck();
  await expect(page.locator('[data-report-message="m10"]')).toBeEnabled();
});
test('a user report cannot submit only the reporter own outgoing message',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'Report conversation',exact:true}).click();
  await page.locator('[data-report-message="own"]').check();await consent(page).check();
  await expect(submit(page)).toBeDisabled();expect(await page.evaluate(()=>reportFixture.calls)).toHaveLength(0);
  await page.locator('[data-report-message="m1"]').check();await expect(submit(page)).toBeEnabled();
});
test('failure preserves selection and uses the same request UUID until intent changes',async({page})=>{
  await fixture(page);await page.evaluate(()=>reportFixture.fail=true);
  await page.getByRole('button',{name:'Report one',exact:true}).click();await consent(page).check();await submit(page).click();
  await expect(page.locator('dialog [role=status]')).toContainText('Your selection is unchanged');
  await expect(page.locator('[data-report-message="m1"]')).toBeChecked();await expect(consent(page)).toBeChecked();
  await submit(page).click();await expect.poll(()=>page.evaluate(()=>reportFixture.calls.length)).toBe(2);
  let calls=await page.evaluate(()=>reportFixture.calls);expect(calls[0].requestId).toBe(calls[1].requestId);
  await page.locator('dialog textarea').fill('Additional context');
  await page.evaluate(()=>reportFixture.fail=false);await submit(page).click();
  await expect(page.locator('dialog [role=status]')).toContainText('Report received');
  calls=await page.evaluate(()=>reportFixture.calls);expect(calls[2].requestId).not.toBe(calls[1].requestId);
  await expect(page.locator('dialog')).not.toContainText('PRIVATE PROVIDER ERROR');
});
for(const change of ['account','peer','hidden'])test('late submit is discarded after '+change+' changes',async({page})=>{
  await fixture(page);await page.evaluate(()=>reportFixture.deferred=true);
  await page.getByRole('button',{name:'Report one',exact:true}).click();await consent(page).check();await submit(page).click();
  await expect.poll(()=>page.evaluate(()=>typeof reportFixture.release)).toBe('function');
  await page.evaluate(change=>{
    if(change==='account')reportFixture.session={username:'other',sessionId:'other',token:'other',role:'buyer'};
    if(change==='peer')reportFixture.peer='other';
    if(change==='hidden'){Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));}
    reportFixture.release();
  },change);
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Report received');
});
test('moderator must give a reason; evidence is inert text, not links or executable markup',async({page})=>{
  await fixture(page);await page.evaluate(()=>reportFixture.review());
  expect(await page.evaluate(()=>reportFixture.reads)).toHaveLength(0);
  await expect(submit(page)).toBeDisabled();await page.locator('dialog textarea').fill('Investigating harassment');
  await submit(page).click();await expect(page.locator('dialog article')).toHaveCount(1);
  await expect(page.locator('dialog article')).toContainText('<img src=');
  await expect(page.locator('dialog img,dialog a')).toHaveCount(0);
  expect(await page.evaluate(()=>reportFixture.reads)).toEqual([{owner:'alice',sessionId:'sa',reportId:'report-test',reason:'Investigating harassment'}]);
  await page.evaluate(()=>reportFixture.session.role='buyer');await expect(page.locator('dialog')).toHaveCount(0);
});
test('late moderator response never discloses plaintext after account change',async({page})=>{
  await fixture(page);await page.evaluate(()=>{reportFixture.deferred=true;reportFixture.review();});
  await page.locator('dialog textarea').fill('Review selected evidence');await submit(page).click();
  await expect.poll(()=>page.evaluate(()=>typeof reportFixture.release)).toBe('function');
  await page.evaluate(()=>{reportFixture.session={username:'other',sessionId:'other',role:'moderator'};reportFixture.release();});
  await expect(page.locator('dialog')).toHaveCount(0);await expect(page.locator('body')).not.toContainText('selected evidence');
});
test('failed moderator read shows a fixed error and no previous evidence',async({page})=>{
  await fixture(page);await page.evaluate(()=>reportFixture.review());
  await page.locator('dialog textarea').fill('Initial review');await submit(page).click();
  await expect(page.locator('dialog article')).toHaveCount(1);
  await page.evaluate(()=>reportFixture.fail=true);await submit(page).click();
  await expect(page.locator('dialog article')).toHaveCount(0);
  await expect(page.locator('dialog [role=status]')).toHaveText('Shared evidence is unavailable. Try again.');
});
for(const [width,locale]of [[320,'sw'],[1280,'en'],[390,'ar']])test('report dialog fits '+width+' '+locale,async({page},testInfo)=>{
  await fixture(page,{width,locale});await page.evaluate(()=>reportFixture.enableFiles());await page.getByRole('button',{name:'Report one',exact:true}).click();
  await page.locator('[data-report-message="media1"]').check();await page.locator('[data-report-file="media1"]').check();
  const rect=await page.locator('dialog').boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(width);
  expect(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('report-'+width+'-'+locale+'.png')});
});

test('real WebCrypto report file selection is separate consent, opaque copy encryption and stable upload retry',async({page})=>{
  await fixture(page);await page.evaluate(()=>{reportFixture.enableFiles();reportFixture.uploadFail=true;});
  await page.locator('[data-chat-report]').click();
  const file=page.locator('[data-report-file="media1"]');await expect(file).not.toBeChecked();await expect(file).toBeDisabled();
  expect(await page.evaluate(()=>reportFixture.downloads.length)).toBe(0);
  await page.locator('[data-report-message="media1"]').check();await file.check();await consent(page).check();await submit(page).click();
  await expect(page.locator('dialog [role=status]')).toContainText('some file copies are not uploaded');
  await expect(page.locator('[data-report-message="media1"]')).toBeDisabled();await expect(submit(page)).toBeEnabled();
  await page.evaluate(()=>reportFixture.uploadFail=false);await submit(page).click();
  await expect(page.locator('dialog [role=status]')).toContainText('Report received');
  const data=await page.evaluate(async()=>{
    const f=reportFixture,metadata=f.calls[0].files[0],raw=f.uploads[0].ciphertext;
    const bytes=Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const codec=await WingaSecureContent.loadSecureContent();
    const opened=await codec.decryptMedia(new Blob([bytes]),metadata.descriptor,{conversationId:metadata.descriptor.conversationId,attachmentId:metadata.id});
    return {calls:f.calls,uploads:f.uploads,downloads:f.downloads,text:await opened.blob.text(),magic:new TextDecoder().decode(bytes.subarray(0,8))};
  });
  expect(data.calls).toHaveLength(1);expect(data.uploads).toHaveLength(2);expect(data.downloads).toEqual(['attachment-secret']);
  expect(data.uploads[0]).toEqual(data.uploads[1]);expect(data.text).toBe('synthetic selected evidence');expect(data.magic).toBe('WINGAEM2');
  expect(data.calls[0].files[0].descriptor.conversationId).toBe('report-evidence-v1:'+data.calls[0].requestId);
  expect(JSON.stringify(data.calls)).not.toContain('attachment-secret');expect(JSON.stringify(data.uploads)).not.toContain('synthetic selected evidence');
});

test('selected media without Share file never decrypts, uploads or shares a copy key',async({page})=>{
  await fixture(page);await page.evaluate(()=>reportFixture.enableFiles());await page.locator('[data-chat-report]').click();
  await page.locator('[data-report-message="media1"]').check();await consent(page).check();await submit(page).click();
  await expect(page.locator('dialog [role=status]')).toContainText('Report received');
  expect(await page.evaluate(()=>({downloads:reportFixture.downloads,uploads:reportFixture.uploads,files:reportFixture.calls[0].files})))
    .toEqual({downloads:[],uploads:[],files:undefined});
});

test('late original file decryption after account change cannot submit a report or upload a copy',async({page})=>{
  await fixture(page);await page.evaluate(()=>{reportFixture.enableFiles();reportFixture.deferDownload=true;});
  await page.locator('[data-chat-report]').click();await page.locator('[data-report-message="media1"]').check();
  await page.locator('[data-report-file="media1"]').check();await consent(page).check();await submit(page).click();
  await expect.poll(()=>page.evaluate(()=>typeof reportFixture.releaseDownload)).toBe('function');
  await page.evaluate(()=>{reportFixture.session.token='other-session';reportFixture.releaseDownload();});
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>[reportFixture.calls.length,reportFixture.uploads.length])).toEqual([0,0]);
});

test('moderator copy decryption waits for explicit reason and download, never renders HTML or auto-fetches files',async({page})=>{
  await fixture(page);await page.evaluate(()=>reportFixture.enableFiles());await page.locator('[data-chat-report]').click();
  await page.locator('[data-report-message="media1"]').check();await page.locator('[data-report-file="media1"]').check();
  await consent(page).check();await submit(page).click();await expect(page.locator('dialog [role=status]')).toContainText('Report received');
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.evaluate(()=>reportFixture.openFileReview());
  await page.locator('dialog textarea').fill('Review reported attachment');await submit(page).click();
  const download=page.getByRole('button',{name:'Download shared file copy',exact:true});await expect(download).toBeEnabled();
  expect(await page.evaluate(()=>reportFixture.fileReads)).toHaveLength(0);
  const event=page.waitForEvent('download');await download.click();const result=await event;
  expect(result.suggestedFilename()).toBe('winga-report-evidence.bin');
  expect(await page.evaluate(()=>reportFixture.fileReads)).toHaveLength(1);
  await expect(page.locator('dialog img,dialog iframe,dialog object')).toHaveCount(0);
});
