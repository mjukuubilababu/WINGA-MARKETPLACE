const {test,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
async function fixture(page,width=390,rtl=false) {
  await page.setViewportSize({width,height:844});
  await page.route('http://rich-chat.test/**',async route=>{
    const url=new URL(route.request().url()),icon=url.pathname.match(/^\/icons\/navigation\/([a-z-]+)\.svg$/);
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main id="chat"><div data-chat-security="bob"></div><div id="messages"></div><form><div class="chat-compose-footer"><button type="button">Send</button></div></form></main><script>window.WingaModules={chat:{}};</script><script src="/src/chat/rich-content.js"></script><script src="/src/chat/ui.js"></script><script src="/src/chat/voice-ui.js"></script><script src="/src/chat/rich-ui.js"></script></body></html>'});
    const file=icon?path.join(root,'node_modules/lucide-static/icons',icon[1]+'.svg'):path.join(root,url.pathname.slice(1));
    if(!icon&&!['/style.css','/src/chat/rich-content.js','/src/chat/ui.js','/src/chat/voice-ui.js','/src/chat/rich-ui.js'].includes(url.pathname))return route.abort();
    return route.fulfill({contentType:icon?'image/svg+xml':url.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(file)});
  });
  await page.goto('http://rich-chat.test/');
  const messages=JSON.parse(fs.readFileSync(path.join(root,'src/localization/catalogs',rtl?'ar.json':'en.json'),'utf8')).messages;
  await page.evaluate(({messages,rtl})=>{
    document.documentElement.lang=rtl?'ar':'en';document.documentElement.dir=rtl?'rtl':'ltr';
    const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    const state={session:{username:'alice',sessionId:'a'},peer:'bob',menu:id(1),sends:[],mutations:[],actions:[],draft:null};
    const rows=[{id:id(1),owner:'alice',peer:'bob',senderId:'alice',receiverId:'bob',message:'A safe message',timestamp:new Date().toISOString(),status:'sent',encrypted:true}];
    const t=(k,f)=>messages[k]||f;
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const api={
      readRichCatalog:async()=>[{id:'p1',name:'Phone'}],readRichContact:async username=>({username,fullName:'Bob'}),
      readConversationReference:async()=>({id:'p1',name:'Phone',price:850000,currency:'TZS',availability:'available',image:''}),
      sendRichMessage:async(peer,content)=>{state.sends.push({peer,content});},
      mutateEncryptedMessage:async(peer,type,targetId,value)=>{state.mutations.push({peer,type,targetId,value});},
      readEncryptedMediaDraft:async()=>state.draft,
      stageEncryptedMediaDraft:async(peer,file,kind)=>{state.draft={id:id(10),blob:file,name:file.name,kind,checkSession:()=>{}};return state.draft;},
      sendEncryptedMediaDraft:async peer=>{state.sends.push({peer,media:true});state.draft=null;return {id:id(10)};},
      discardEncryptedMediaDraft:async()=>{state.draft=null;}
    };
    const ui=WingaModules.chat.createChatUiModule({getCurrentUser:()=>state.session.username,getActiveChatContext:()=>({withUser:state.peer}),escapeHtml:esc,getMessageProductItems:()=>[],getReplyPreviewMessage:()=>null,getOpenChatMessageMenuId:()=>state.menu,translate:(k,_v,f)=>t(k,f)});
    function render(){
      const scope=document.getElementById('chat');document.getElementById('messages').innerHTML=ui.renderConversationMessagesMarkup(rows,{enableActions:true});
      WingaRichUi.bind(scope,{peer:'bob',dataLayer:api,translate:t,getSession:()=>state.session,getPeer:()=>state.peer,getMessages:()=>rows,refresh:render,
        actions:{mediaEnabled:true,openProduct:id=>state.actions.push(['product',id]),saveProduct:id=>state.actions.push(['save',id]),buyProduct:id=>state.actions.push(['buy',id])}});
    }
    window.richFixture={state,rows,api,render,id};render();
  },{messages,rtl});
}
test('secure rich composer includes all reference types, sends selected IDs and exposes canonical card actions',async({page})=>{
  await fixture(page);
  await page.getByRole('button',{name:'Attach',exact:true}).click();
  for(const name of ['Photo','Voice','Video','Encrypted file','Product','Reel','Short','Collection','Order','Payment reference','Delivery','Location','Contact'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Product',exact:true}).click();await page.getByRole('button',{name:'Phone',exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>richFixture.state.sends[0].content.data)).toEqual({ids:['p1']});
  await page.evaluate(()=>{richFixture.rows[0].richContent=WingaRichContent.create('product','',{ids:['p1']});richFixture.render();});
  await expect(page.locator('.chat-rich-card')).toContainText('850,000');
  await expect(page.locator('[data-rich-edit]')).toHaveCount(0);
  await page.getByRole('button',{name:'View product',exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('button',{name:'Add to order',exact:true}).click();
  expect(await page.evaluate(()=>richFixture.state.actions)).toEqual([['product','p1'],['save','p1'],['buy','p1']]);
});
test('sender edit, reaction and delete-for-me controls call the encrypted mutation path only',async({page})=>{
  await fixture(page);
  await page.getByRole('button',{name:'Edit message',exact:true}).click();await page.locator('dialog textarea').fill('Updated');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'React',exact:true}).click();await page.locator('.chat-reaction-choice').nth(1).click();
  await page.getByRole('button',{name:'Delete for me',exact:true}).click();await page.locator('dialog').getByRole('button',{name:'Delete for me',exact:true}).click();
  expect(await page.evaluate(()=>richFixture.state.mutations.map(v=>v.type))).toEqual(['edit','reaction','hide']);
  await page.evaluate(()=>{richFixture.rows[0].timestamp=new Date(Date.now()-900001).toISOString();richFixture.render();});
  await expect(page.locator('[data-rich-edit]')).toHaveCount(0);
  await expect(page.getByText('Delete for everyone')).toHaveCount(0);
});
test('dialogs close on owner or peer change and do not send stale selections',async({page})=>{
  await fixture(page);
  await page.getByRole('button',{name:'Attach',exact:true}).click();await page.getByRole('button',{name:'Contact',exact:true}).click();
  await page.evaluate(()=>richFixture.state.session={username:'eve',sessionId:'e'});
  await expect(page.locator('dialog')).toHaveCount(0);expect(await page.evaluate(()=>richFixture.state.sends.length)).toBe(0);
});
for(const [width,rtl] of [[320,false],[390,false],[1280,false],[390,true]])test('rich composer layout '+width+(rtl?' RTL':''),async({page})=>{
  await fixture(page,width,rtl);
  await page.locator('[data-rich-composer]').click();
  expect(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=innerWidth&&el.getBoundingClientRect().left>=0)).toBe(true);
  expect(await page.locator('dialog button').evaluateAll(buttons=>buttons.every(b=>b.scrollWidth<=b.clientWidth))).toBe(true);
  await page.screenshot({path:'test-results/rich-composer-'+width+(rtl?'-rtl':'')+'.png'});
});

test('voice records only after user action, previews a persistent draft and sends or cancels explicitly',async({page})=>{
  await fixture(page);
  await page.evaluate(()=>{
    window.WingaEncryptedMedia={MAX_FILE_BYTES:2*1024*1024};
    richFixture.state.permissionCalls=0;richFixture.state.stopped=0;
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
      richFixture.state.permissionCalls++;return {getTracks:()=>[{stop:()=>richFixture.state.stopped++}]};
    }}});
    window.MediaRecorder=class {
      static isTypeSupported(){return true;}
      constructor(){this.state='inactive';}
      start(){this.state='recording';}
      stop(){this.state='inactive';this.ondataavailable({data:new Blob([new Uint8Array([26,69,223,163,0,0,0,0])],{type:'audio/webm'})});queueMicrotask(()=>this.onstop());}
    };
  });
  await page.getByRole('button',{name:'Attach',exact:true}).click();await page.getByRole('button',{name:'Voice',exact:true}).click();
  expect(await page.evaluate(()=>richFixture.state.permissionCalls)).toBe(0);
  await page.getByRole('button',{name:'Record',exact:true}).click();await page.getByRole('button',{name:'Stop recording',exact:true}).click();
  await expect(page.locator('dialog audio')).toBeVisible();
  expect(await page.evaluate(()=>({calls:richFixture.state.permissionCalls,stopped:richFixture.state.stopped,draft:richFixture.state.draft?.kind}))).toEqual({calls:1,stopped:1,draft:'voice'});
  await page.getByRole('button',{name:'Send encrypted file',exact:true}).click();expect(await page.evaluate(()=>richFixture.state.sends[0].media)).toBe(true);
  await page.getByRole('button',{name:'Attach',exact:true}).click();await page.getByRole('button',{name:'Voice',exact:true}).click();
  await page.getByRole('button',{name:'Record',exact:true}).click();await page.getByRole('button',{name:'Stop recording',exact:true}).click();await expect(page.locator('dialog audio')).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(await page.evaluate(()=>richFixture.state.draft)).toBeNull();
  expect(await page.evaluate(()=>richFixture.state.sends.length)).toBe(1);
});

test('late microphone permission after dialog close releases tracks without recording or sending',async({page})=>{
  await fixture(page);
  await page.evaluate(()=>{
    window.WingaEncryptedMedia={MAX_FILE_BYTES:2*1024*1024};
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(resolve=>{
      richFixture.resolveMicrophone=()=>resolve({getTracks:()=>[{stop:()=>richFixture.state.tracksReleased=true}]});
    })}});
  });
  await page.getByRole('button',{name:'Attach',exact:true}).click();await page.getByRole('button',{name:'Voice',exact:true}).click();await page.getByRole('button',{name:'Record',exact:true}).click();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.evaluate(()=>richFixture.resolveMicrophone());
  await expect.poll(()=>page.evaluate(()=>richFixture.state.tracksReleased)).toBe(true);
  expect(await page.evaluate(()=>richFixture.state.sends.length)).toBe(0);
});

test('playback refuses executable content and checks supported audio and video container signatures',async({page})=>{
  await fixture(page);
  expect(await page.evaluate(async()=>{
    const head=new Uint8Array([26,69,223,163,0,0,0,0]);
    return [
      await WingaVoiceUi.playable(new Blob([head],{type:'audio/webm'})),
      await WingaVoiceUi.playable(new Blob([head],{type:'video/webm'})),
      await WingaVoiceUi.playable(new Blob(['<script>alert(1)</script>'],{type:'audio/webm'})),
      await WingaVoiceUi.playable(new Blob(['<svg/>'],{type:'image/svg+xml'}))
    ];
  })).toEqual(['audio','video',null,null]);
});

test('restored generic image draft retains sendability without rendering oversized decoded pixels',async({page})=>{
  await fixture(page);
  await page.evaluate(()=>{
    window.WingaEncryptedMedia={MAX_FILE_BYTES:2*1024*1024};
    window.createImageBitmap=async()=>({width:10000,height:10000,close:()=>{richFixture.state.bitmapClosed=true;}});
    richFixture.state.draft={id:richFixture.id(10),blob:new Blob(['synthetic'],{type:'image/png'}),name:'large.png',kind:'file',checkSession:()=>{}};
  });
  await page.getByRole('button',{name:'Attach',exact:true}).click();await page.getByRole('button',{name:'Encrypted file',exact:true}).click();
  await expect(page.getByRole('button',{name:'Send encrypted file',exact:true})).toBeEnabled();
  await expect(page.locator('dialog .chat-decrypted-preview')).toHaveCount(0);
  expect(await page.evaluate(()=>richFixture.state.bitmapClosed)).toBe(true);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
});
