(() => {
  function createInternalShare(deps) {
    const win=deps.window||window,t=(key,fallback)=>deps.translate?.(key,fallback)||fallback;
    let active=null;
    const el=(tag,text='')=>{const node=win.document.createElement(tag);node.textContent=text;return node;};
    async function open(productId,contentType='PRODUCT') {
      const contract=win.WingaModules.growth.contract;
      if(!contract.id(productId)||!['PRODUCT','REEL','SHORT','COLLECTION'].includes(contentType))return;
      if(contentType!=='PRODUCT'&&win.WINGA_CONFIG?.growthInternalContentSharing!==true)return;
      active?.close();
      const owner=deps.getAccount(),identity=deps.getIdentity?.();
      if(!owner){deps.requireAuth(contentType==='PRODUCT'?{type:'share-to-winga',productId}:{type:'share-to-winga',contentId:productId,contentType});return;}
      const dialog=el('dialog');dialog.className='chat-security-dialog';dialog.dataset.internalShare='true';
      const heading=el('h2',t('growth.shareToWinga','Share to Winga')),status=el('p',t('inbox.loading','Loading...'));
      status.setAttribute('role','status');
      const label=el('label',t('growth.findShareRecipient','Find a person or Shopping Room'));
      const input=el('input');input.type='search';input.maxLength=80;input.autocomplete='off';input.dataset.shareRecipientSearch='true';
      input.placeholder=t('growth.recipientSearchPlaceholder','Name, @username or Room');input.setAttribute('aria-label',label.textContent);label.append(input);
      const search=el('button','🔍');search.type='button';search.setAttribute('aria-label',t('nav.search','Search'));
      const form=el('form');form.className='internal-share-search';form.append(label,search);
      const list=el('div');list.className='internal-share-results';
      const security=el('div');security.className='internal-share-security';
      const invite=el('button',t('growth.inviteToProduct','Invite someone to view this product'));invite.type='button';invite.hidden=contentType!=='PRODUCT'||!deps.inviteProduct;
      invite.onclick=()=>{if(current()){dialog.close();deps.inviteProduct(productId);}};
      const close=el('button',t('common.close','Close'));close.type='button';close.onclick=()=>dialog.close();
      dialog.append(heading,form,status,list,security,invite,close);win.document.body.append(dialog);dialog.showModal();active=dialog;
      const current=()=>dialog.isConnected&&active===dialog&&deps.getAccount()===owner&&(!deps.getIdentity||deps.getIdentity()===identity);
      let busy=false,checking=false,sequence=0,debounce=0,loaded=false,searching=false,searchFailed=false;
      let recent=[],rooms=[],found=[];const states=new Map(),pending=new Map(),securityDialogs=new Set();
      const started=Date.now();
      const timer=win.setInterval(()=>{if(!current())dialog.close();},250);
      const poll=win.setInterval(()=>{if(current()&&pending.size&&Date.now()-started<600000)void resumePending();},8000);
      dialog.addEventListener('close',()=>{win.clearInterval(timer);win.clearInterval(poll);win.clearTimeout(debounce);sequence++;for(const child of securityDialogs)child.close();dialog.remove();if(active===dialog)active=null;},{once:true});
      const needle=()=>input.value.trim().replace(/^@/,'').toLowerCase();
      const matches=(...values)=>!needle()||values.some(value=>String(value||'').toLowerCase().includes(needle()));
      const usable=person=>contract.id(person?.username)&&person.username!==owner;
      async function resumePending() {
        if(checking||busy||!current())return;checking=true;
        try{for(const [peer,attempt] of pending){if(!current()||busy)return;try{const info=await deps.dataLayer.inspectEncryptedConversation(peer);if(current()&&info?.status==='active')await attempt();}catch{}}}
        finally{checking=false;}
      }
      function choice(labelText,key,send,peer='') {
        const state=states.get(key);
        if(state?.sent)return;
        const button=el('button',labelText);button.type='button';button.className='action-btn action-btn-secondary';
        if(peer)button.dataset.sharePerson=peer;else button.dataset.shareRoom=key.slice(5);
        button.disabled=busy||Boolean(state?.sending);
        const attempt=async()=>{
          if(!current()||busy)return;
          let action=states.get(key);
          if(!action){if(states.size>=100)return;action={id:win.crypto.randomUUID()};states.set(key,action);}
          if(action.sent||action.sending)return;action.sending=true;busy=true;render();status.textContent=t('chat.secureWorking','Working...');
          try{
            const product=contentType==='COLLECTION'?await deps.dataLayer.loadSharedCollection(productId):contentType==='PRODUCT'?await deps.dataLayer.loadSharedProduct(productId):await deps.dataLayer.readConversationReference(contentType.toLowerCase(),productId);
            if(!product||!current())throw new Error('growth_share_unavailable');
            if(contentType==='COLLECTION'&&(product.status!=='published'||product.visibility!=='public'||!product.items?.length))throw new Error('growth_share_unavailable');
            const result=await send(action.id);
            if(!current())return;action.sent=true;pending.delete(peer);action.securityNode?.remove();render();
            status.textContent=result?.status==='pending'||result?.sendState==='queued'?t('growth.internalShareQueued','Queued for sending; delivery is not confirmed.'):t('growth.internalShareSent','Shared.');
          }catch(error){
            if(!current())return;
            const needsSecurity=peer&&['mls_runtime_required','mls_membership_pending','mls_membership_unconfirmed','encrypted_membership_required','crypto_device_pending','mls_group_not_found'].includes(error?.code);
            status.textContent=needsSecurity?t('growth.shareChatSetup','Set up or confirm this conversation before sharing.'):t('growth.internalShareFailed','Unable to share. Try again to retry the same message.');
            if(needsSecurity&&deps.bindSecureShare&&!action.securityNode){
              const wrap=el('div'),securityButton=el('button',t('chat.security','Chat security'));securityButton.type='button';securityButton.dataset.chatSecurity=peer;
              wrap.append(el('p',labelText),securityButton);security.append(wrap);action.securityNode=wrap;
              pending.set(peer,attempt);deps.bindSecureShare(wrap,peer,resumePending,child=>{if(!current()){child.close();return;}securityDialogs.add(child);child.addEventListener('close',()=>securityDialogs.delete(child),{once:true});});
            }
          }finally{action.sending=false;busy=false;if(current())for(const b of list.querySelectorAll('button'))b.disabled=false;}
        };
        button.onclick=attempt;return button;
      }
      function render() {
        if(!current())return;list.replaceChildren();
        const readyRooms=rooms.filter(room=>matches(room.name)).slice(0,30);
        const people=new Map();for(const person of [...recent,...found])if(usable(person)&&matches(person.username,person.fullName))people.set(person.username,person);
        if(readyRooms.length){const section=el('section');section.append(el('h3',t('inbox.rooms','Shopping Rooms')));
          for(const room of readyRooms){const b=choice(room.name||t('rooms.title','Shopping Room'),'room:'+room.id,id=>contentType==='PRODUCT'?deps.dataLayer.shoppingRoom('command',[room.id,'product-share',{productId,note:'',snapshot:null},id]):deps.dataLayer.shoppingRoom('send',[room.id,win.WingaRichContent.encode(win.WingaRichContent.create(contentType.toLowerCase(),'',{ids:[productId]})),id]));if(b)section.append(b);}list.append(section);}
        if(people.size){const section=el('section');section.append(el('h3',needle()?t('growth.sharePeople','People'):t('growth.recentSharePeople','Recent people')));
          for(const person of people.values()){const labelText=person.fullName&&person.fullName!==person.username?person.fullName+' (@'+person.username+')':person.username;
            const b=choice(labelText,'person:'+person.username,id=>deps.dataLayer.sendRichMessage(person.username,win.WingaRichContent.create(contentType.toLowerCase(),'',{ids:[productId]}),{clientMessageId:id}),person.username);if(b)section.append(b);}list.append(section);}
      }
      function showStatus() {
        if(!current()||busy)return;
        status.textContent=searching?t('inbox.loading','Loading...'):searchFailed?t('growth.peopleSearchUnavailable','People search is unavailable. You can still choose recent people or Rooms.'):
          list.querySelector('button')?t('growth.chooseShareDestination','Choose a person or Shopping Room.'):
          !loaded&&!needle()?t('inbox.loading','Loading...'):needle()?t('growth.shareSearchEmpty','No matching people or Rooms. Try another name or invite someone.'):
          t('growth.shareRecentEmpty','No recent people or Rooms yet. Search for someone to share with.');
      }
      function queueSearch(immediate=false) {
        win.clearTimeout(debounce);const request=++sequence;found=[];searchFailed=false;searching=false;render();showStatus();
        const query=needle();if(query.length<2)return;
        searching=true;showStatus();
        const run=async()=>{
          let deadline;
          try{
            const result=await Promise.race([deps.dataLayer.searchPeople(query,{limit:20}),new Promise((_,reject)=>{deadline=win.setTimeout(()=>reject(new Error('people_search_timeout')),5500);})]);
            if(!current()||request!==sequence)return;found=(result?.items||[]).filter(usable).slice(0,20);
          }catch{if(current()&&request===sequence)searchFailed=true;}
          finally{win.clearTimeout(deadline);if(current()&&request===sequence){searching=false;render();showStatus();}}
        };
        if(immediate)void run();else debounce=win.setTimeout(run,300);
      }
      input.oninput=()=>queueSearch();form.onsubmit=event=>{event.preventDefault();queueSearch(true);};search.onclick=()=>queueSearch(true);
      const results=await Promise.allSettled([deps.dataLayer.loadInboxPage({limit:20}),deps.dataLayer.shoppingRoom('list',[])]);
      if(!current())return;
      const known=new Map((deps.dataLayer.getUsers?.()||[]).map(user=>[user.username,user]));
      if(results[0].status==='fulfilled')recent=(results[0].value?.items||[]).map(row=>({username:row.withUser,fullName:known.get(row.withUser)?.fullName||row.withUser})).filter(usable).slice(0,20);
      if(results[1].status==='fulfilled')rooms=(results[1].value||[]).filter(room=>room.status==='active'&&room.transition?.status==='accepted'&&!room.departures?.length&&!room.preferences?.archived);
      loaded=true;render();showStatus();
    }
    return {open};
  }
  window.WingaModules.growth.createInternalShare=createInternalShare;
})();
