(() => {
  function createShareVisuals(deps={}) {
    const win=deps.window||window,t=(key,fallback)=>deps.translate?.(key,fallback)||fallback;
    const el=(tag,text='',className='')=>{const node=win.document.createElement(tag);node.textContent=text;node.className=className;return node;};
    const paths={
      search:['m21 21-4.35-4.35','M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],
      people:['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M16 3a4 4 0 0 1 0 8','M22 21v-2a4 4 0 0 0-3-3.87','M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
      message:['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z'],
      arrow:['M7 17 17 7','M7 7h10v10'],
      send:['m22 2-7 20-4-9-9-4Z','M22 2 11 13'],
      link:['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71','M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
      close:['M18 6 6 18','m6 6 12 12'],
      bag:['M6 7h12l2 14H4L6 7Z','M9 7V5a3 3 0 0 1 6 0v2'],
      check:['m5 12 4 4L19 6'],
      globe:['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0','M3 12h18','M12 3a16 16 0 0 1 0 18 16 16 0 0 1 0-18'],
      spark:['m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z']
    };
    function icon(name) {
      const svg=win.document.createElementNS('http://www.w3.org/2000/svg','svg');
      for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
      svg.classList.add('winga-share-icon');
      for(const d of paths[name]||paths.arrow){const path=win.document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}return svg;
    }
    function hero(title,subtitle) {
      const node=el('header','','winga-share-hero'),brand=el('div','','winga-share-brand');
      const mark=el('span','','winga-share-brand-mark');mark.append(icon('spark'));brand.append(mark,el('span','WINGA'));
      const heading=el('h2',title,'winga-share-heading'),copy=el('p',subtitle,'winga-share-intro');
      const orbit=el('div','','winga-share-orbit');orbit.setAttribute('aria-hidden','true');
      for(const name of ['bag','message','people']){const dot=el('span');dot.append(icon(name));orbit.append(dot);}
      node.append(brand,heading,copy,orbit);return node;
    }
    function preview(product) {
      if(!product)return null;
      const node=el('div','','winga-share-product'),thumb=el('span','','winga-share-product-image');thumb.append(icon('bag'));
      const src=win.WingaModules.components.ui.sanitizeImageSource(product.image||'','');
      if(src){const image=el('img');image.src=src;image.alt='';image.onerror=()=>image.remove();thumb.append(image);}
      const copy=el('div','','winga-share-product-copy');
      copy.append(el('span',t('growth.yourFind','Your find'),'winga-share-kicker'),el('strong',product.name||t('common.product','Product')));
      const meta=[deps.price?.(product.price),product.shop].filter(Boolean).join(' · ');if(meta)copy.append(el('span',meta,'winga-share-product-meta'));
      node.append(thumb,copy);return node;
    }
    function avatar(person) {
      const name=person.fullName||person.username,initials=String(name).trim().split(/\s+/).slice(0,2).map(x=>Array.from(x)[0]||'').join('').toUpperCase();
      const node=el('span',initials,'winga-share-avatar');node.setAttribute('aria-hidden','true');
      node.dataset.tone=String(Array.from(String(person.username)).reduce((n,c)=>n+c.charCodeAt(0),0)%5);
      const src=win.WingaModules.components.ui.sanitizeImageSource(person.profileImage||'','');
      if(src){const image=el('img');image.src=src;image.alt='';image.referrerPolicy='no-referrer';image.onerror=()=>image.remove();node.append(image);}return node;
    }
    return {el,icon,hero,preview,avatar};
  }
  function createInternalShare(deps) {
    const win=deps.window||window,t=(key,fallback)=>deps.translate?.(key,fallback)||fallback;
    const visuals=createShareVisuals(deps);
    let active=null;
    const el=(tag,text='')=>{const node=win.document.createElement(tag);node.textContent=text;return node;};
    async function open(productId,contentType='PRODUCT') {
      const contract=win.WingaModules.growth.contract;
      if(!contract.id(productId)||!['PRODUCT','REEL','SHORT','COLLECTION'].includes(contentType))return;
      if(contentType!=='PRODUCT'&&win.WINGA_CONFIG?.growthInternalContentSharing!==true)return;
      active?.close();
      const owner=deps.getAccount(),identity=deps.getIdentity?.();
      if(!owner){deps.requireAuth(contentType==='PRODUCT'?{type:'share-to-winga',productId}:{type:'share-to-winga',contentId:productId,contentType});return;}
      const dialog=el('dialog');dialog.className='chat-security-dialog winga-share-picker';dialog.dataset.internalShare='true';
      const hero=visuals.hero(t('growth.recipientHeadline','Find your people.'),t('growth.recipientSubtitle','Share a find. Start a conversation. Decide together.'));
      const heading=hero.querySelector('h2');heading.id='winga-share-recipient-title';dialog.setAttribute('aria-labelledby',heading.id);
      const body=el('div');body.className='winga-share-body';
      const product=contentType==='PRODUCT'?deps.getProduct?.(productId):null,preview=visuals.preview(product);if(preview)body.append(preview);
      const status=el('p',t('inbox.loading','Loading...'));status.className='winga-share-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      const label=el('label');const labelText=el('span',t('growth.findShareRecipient','Find a person or Shopping Room'));labelText.className='visually-hidden';
      const input=el('input');input.type='search';input.maxLength=80;input.autocomplete='off';input.dataset.shareRecipientSearch='true';
      input.placeholder=t('growth.recipientSearchPlaceholder','Name, @username or Room');input.setAttribute('aria-label',labelText.textContent);label.append(visuals.icon('search'),labelText,input);
      const search=el('button');search.type='submit';search.append(visuals.icon('arrow'));search.setAttribute('aria-label',t('nav.search','Search'));
      const form=el('form');form.className='internal-share-search';form.append(label,search);
      const tabs=el('div');tabs.className='winga-share-filters';tabs.setAttribute('role','group');tabs.setAttribute('aria-label',t('growth.findShareRecipient','Find a person or Shopping Room'));
      let scope='all';
      for(const [value,key,fallback] of [['all','growth.shareAll','All'],['people','growth.sharePeople','People'],['rooms','inbox.rooms','Shopping Rooms']]){
        const tab=el('button',t(key,fallback));tab.type='button';tab.dataset.shareFilter=value;tab.setAttribute('aria-pressed',String(value===scope));
        tab.onclick=()=>{scope=value;for(const b of tabs.children)b.setAttribute('aria-pressed',String(b===tab));queueSearch();};tabs.append(tab);
      }
      const list=el('div');list.className='internal-share-results';
      const empty=el('div');empty.className='winga-share-empty';empty.hidden=true;empty.append(visuals.icon('people'),el('strong',t('growth.shareEmptyHeadline','Every good find can start a conversation.')));
      const security=el('div');security.className='internal-share-security';
      const invite=el('button');invite.className='winga-share-invite';invite.type='button';invite.hidden=contentType!=='PRODUCT'||!deps.inviteProduct;
      invite.append(visuals.icon('link'),el('span',t('growth.inviteToProduct','Invite someone to view this product')),visuals.icon('arrow'));
      invite.onclick=()=>{if(current()){dialog.close();deps.inviteProduct(productId);}};
      const close=el('button');close.className='winga-share-close';close.type='button';close.setAttribute('aria-label',t('common.close','Close'));close.append(visuals.icon('close'));close.onclick=()=>dialog.close();
      body.append(form,tabs,empty,status,list,security,invite);dialog.append(hero,close,body);win.document.body.append(dialog);dialog.showModal();active=dialog;win.document.body.classList.add('winga-internal-share-open');
      const current=()=>dialog.isConnected&&active===dialog&&deps.getAccount()===owner&&(!deps.getIdentity||deps.getIdentity()===identity);
      let busy=false,checking=false,sequence=0,debounce=0,loaded=false,searching=false,searchFailed=false;
      let recent=[],rooms=[],found=[];const states=new Map(),pending=new Map(),securityDialogs=new Set();
      const started=Date.now();
      const timer=win.setInterval(()=>{if(!current())dialog.close();},250);
      const poll=win.setInterval(()=>{if(current()&&pending.size&&Date.now()-started<600000)void resumePending();},8000);
      dialog.addEventListener('close',()=>{win.clearInterval(timer);win.clearInterval(poll);win.clearTimeout(debounce);sequence++;for(const child of securityDialogs)child.close();dialog.remove();if(active===dialog){active=null;win.document.body.classList.remove('winga-internal-share-open');}},{once:true});
      const needle=()=>input.value.trim().replace(/^@/,'').toLowerCase();
      const matches=(...values)=>!needle()||values.some(value=>String(value||'').toLowerCase().includes(needle()));
      const usable=person=>contract.id(person?.username)&&person.username!==owner;
      async function resumePending() {
        if(checking||busy||!current())return;checking=true;
        try{for(const [peer,attempt] of pending){if(!current()||busy)return;try{const info=await deps.dataLayer.inspectEncryptedConversation(peer);if(current()&&info?.status==='active')await attempt();}catch{}}}
        finally{checking=false;}
      }
      function choice(labelText,key,send,peer='',person=null) {
        const state=states.get(key);
        if(state?.sent)return;
        const button=el('button');button.type='button';button.className='winga-share-recipient';button.setAttribute('aria-label',labelText);
        const avatar=person?visuals.avatar(person):el('span');if(!person){avatar.className='winga-share-avatar winga-share-room-avatar';avatar.append(visuals.icon('people'));}
        const copy=el('span');copy.className='winga-share-recipient-copy';copy.append(el('strong',person?.fullName||person?.username||labelText));
        const detail=el('span',person?'@'+person.username:t('growth.shareRoomHint','Make a choice together'));copy.append(detail);
        const arrow=el('span');arrow.className='winga-share-recipient-arrow';arrow.append(visuals.icon('send'));button.append(avatar,copy,arrow);
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
        const readyRooms=scope==='people'?[]:rooms.filter(room=>matches(room.name)).slice(0,30);
        const people=new Map();for(const person of [...recent,...found])if(scope!=='rooms'&&usable(person)&&matches(person.username,person.fullName))people.set(person.username,person);
        if(readyRooms.length){const section=el('section');section.append(el('h3',t('inbox.rooms','Shopping Rooms')));
          for(const room of readyRooms){const b=choice(room.name||t('rooms.title','Shopping Room'),'room:'+room.id,id=>contentType==='PRODUCT'?deps.dataLayer.shoppingRoom('command',[room.id,'product-share',{productId,note:'',snapshot:null},id]):deps.dataLayer.shoppingRoom('send',[room.id,win.WingaRichContent.encode(win.WingaRichContent.create(contentType.toLowerCase(),'',{ids:[productId]})),id]));if(b)section.append(b);}if(section.querySelector('button'))list.append(section);}
        if(people.size){const section=el('section');section.append(el('h3',needle()?t('growth.sharePeople','People'):t('growth.recentSharePeople','Recent people')));
          for(const person of people.values()){const labelText=person.fullName&&person.fullName!==person.username?person.fullName+' (@'+person.username+')':person.username;
            const b=choice(labelText,'person:'+person.username,id=>deps.dataLayer.sendRichMessage(person.username,win.WingaRichContent.create(contentType.toLowerCase(),'',{ids:[productId]}),{clientMessageId:id}),person.username,person);if(b)section.append(b);}if(section.querySelector('button'))list.append(section);}
      }
      function showStatus() {
        if(!current()||busy)return;
        empty.hidden=searching||!loaded||Boolean(list.querySelector('button'));
        list.setAttribute('aria-busy',String(searching||!loaded));
        status.textContent=searching?t('inbox.loading','Loading...'):searchFailed?t('growth.peopleSearchUnavailable','People search is unavailable. You can still choose recent people or Rooms.'):
          list.querySelector('button')?t('growth.chooseShareDestination','Choose a person or Shopping Room.'):
          !loaded&&!needle()?t('inbox.loading','Loading...'):needle()?t('growth.shareSearchEmpty','No matching people or Rooms. Try another name or invite someone.'):
          scope==='rooms'?t('growth.shareRoomsEmpty','No ready Rooms yet. Choose People to find someone to share with.'):
          scope==='people'?t('growth.sharePeopleEmpty','No recent people here yet. Search by name or @username.'):
          t('growth.shareRecentEmpty','No recent people or Rooms yet. Search for someone to share with.');
      }
      function queueSearch(immediate=false) {
        win.clearTimeout(debounce);const request=++sequence;found=[];searchFailed=false;searching=false;render();showStatus();
        const query=needle();if(query.length<2||scope==='rooms')return;
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
      input.oninput=()=>queueSearch();form.onsubmit=event=>{event.preventDefault();queueSearch(true);};
      const results=await Promise.allSettled([deps.dataLayer.loadInboxPage({limit:20}),deps.dataLayer.shoppingRoom('list',[])]);
      if(!current())return;
      const known=new Map((deps.dataLayer.getUsers?.()||[]).map(user=>[user.username,user]));
      if(results[0].status==='fulfilled')recent=(results[0].value?.items||[]).map(row=>({username:row.withUser,fullName:known.get(row.withUser)?.fullName||row.withUser,profileImage:known.get(row.withUser)?.profileImage||''})).filter(usable).slice(0,20);
      if(results[1].status==='fulfilled')rooms=(results[1].value||[]).filter(room=>room.status==='active'&&room.transition?.status==='accepted'&&!room.departures?.length&&!room.preferences?.archived);
      loaded=true;render();showStatus();
    }
    return {open};
  }
  window.WingaModules.growth.createShareVisuals=createShareVisuals;
  window.WingaModules.growth.createInternalShare=createInternalShare;
})();
