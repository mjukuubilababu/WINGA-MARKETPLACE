(() => {
  const states=new Map();
  const element=(tag,text='',className='')=>{const el=document.createElement(tag);el.textContent=text;el.className=className;return el;};
  function bind(scope,{dataLayer,getSession,translate,actions={}}){
    const list=scope.querySelector('[data-room-list]'),detail=scope.querySelector('[data-room-detail]');if(!list||!detail||list.dataset.bound)return;
    list.dataset.bound='true';const session=getSession?.(),owner=session?.username;if(!owner)return;
    let state=states.get(owner);if(!state){state={selected:'',tab:'chat',query:'',drafts:{},shown:100,boards:new Map(),history:new Map(),catalog:new Map()};states.set(owner,state);}
    const t=(key,fallback,variables={})=>Object.entries(variables).reduce((text,[name,value])=>text.replaceAll('{'+name+'}',String(value)),translate?.(key,fallback,variables)||fallback);
    const current=()=>scope.isConnected&&getSession?.()?.username===owner&&getSession?.()?.token===session.token&&getSession?.()?.sessionId===session.sessionId;
    const call=(action,...args)=>dataLayer.shoppingRoom(action,args);
    const fail=(code,member)=>{throw Object.assign(new Error(code),{code,member});};
    const memberNames=value=>[...new Set(value.split(/[\s,]+/).filter(Boolean).map(name=>name.toLowerCase()))].filter(name=>name!==owner.toLowerCase());
    async function resolveMembers(value,{initial=false}={}){const names=memberNames(value);
      if(!names.length)fail(initial?'encrypted_room_members_required':'encrypted_room_usernames_invalid');
      if(initial&&names.length<2)fail('encrypted_room_members_required');
      if(names.length>11)fail('encrypted_room_member_limit');
      if(!names.every(name=>/^[A-Za-z0-9._:-]{1,40}$/.test(name)))fail('encrypted_room_usernames_invalid');
      const resolved=[];for(const name of names){let profile;try{profile=await dataLayer.readRichContact(name);}catch(error){
        if(error.status===404||error.code==='social_profile_not_found')fail('encrypted_room_account_unavailable',name);throw error;}
        if(!current())fail('mls_session_changed');
        if(typeof profile?.username!=='string'||profile.username.toLowerCase()!==name)fail('encrypted_room_account_unavailable',name);
        resolved.push(profile.username);}
      return [...new Set(resolved)].filter(name=>name!==owner);}
    function errorText(error){switch(error?.code){
      case 'encrypted_rooms_disabled':return t('rooms.unavailable','Chatrooms are unavailable.');
      case 'encrypted_room_members_required':return t('rooms.membersRequired','At least two other accounts are required.');
      case 'encrypted_room_usernames_invalid':return t('rooms.usernamesInvalid','One or more usernames are invalid.');
      case 'encrypted_room_member_limit':return t('rooms.memberLimit','A chatroom can have up to 12 accounts.');
      case 'encrypted_room_account_unavailable':return t('rooms.accountUnavailable','Account {member} is unavailable.',{member:error.member});
      case 'encrypted_room_member_unavailable':return t('rooms.devicesUnavailable','Some members do not have a ready encrypted chat device yet.');
      case 'encrypted_room_access_denied':return t('rooms.accessUnavailable','Some members are unavailable or blocked.');
      case 'encrypted_package_unavailable':return t('rooms.packageUnavailable','A member device changed. Review devices again.');
      default:return t('rooms.actionFailed','Unable to finish. Try again.');}}
    const memberName=id=>actions.memberName?.(id)||id;
    function memberAvatar(id){const wrap=element('span','','message-thread-avatar'),fallback=()=>wrap.replaceChildren(element('span',memberName(id).slice(0,1),'conversation-avatar-initial'));
      const src=actions.sanitizeImage?.(actions.getMemberProfile?.(id)?.profileImage||'','');
      if(src){const image=document.createElement('img');image.src=src;image.alt='';image.loading='lazy';image.addEventListener('error',fallback,{once:true});wrap.append(image);}else fallback();return wrap;}
    let rooms=[],busy=false,stopped=false,signature='',timer,pendingFiles=[],pendingTransitions=[],readQueued=false;const urls=new Set(),dialogs=new Set();
    function visibleRead(){if(readQueued||!current()||state.tab!=='chat')return;const id=state.selected,history=state.history.get(id)||[];
      if(!history.some(m=>m.owner!==owner&&m.status!=='read'))return;readQueued=true;
      requestAnimationFrame(async()=>{try{if(current()&&state.selected===id&&state.tab==='chat')await call('markRead',id,history.slice(-state.shown).map(m=>m.id));}catch{}finally{readQueued=false;}});}
    const status=element('p','','empty-copy room-operation-status');status.setAttribute('role','status');
    function control(b){b.dataset.roomControl='true';if(busy){b.disabled=true;b.dataset.roomBusyDisabled='true';}return b;}
    const iconButton=(name,label,fn)=>{const b=control(element('button','','conversation-icon-button'));b.type='button';b.title=label;b.setAttribute('aria-label',label);
      const image=document.createElement('img');image.src='/icons/navigation/'+name+'.svg';image.width=20;image.height=20;image.alt='';b.append(image);b.onclick=()=>run(fn);return b;};
    const button=(text,fn,className='action-btn action-btn-secondary')=>{const b=control(element('button',text,className));b.type='button';b.onclick=()=>run(fn);return b;};
    const run=async fn=>{if(busy||!current())return;busy=true;status.textContent='';scope.setAttribute('aria-busy','true');
      for(const message of document.querySelectorAll('.room-dialog [data-room-error]'))message.textContent='';
      for(const b of [...scope.querySelectorAll('[data-room-control]'),...document.querySelectorAll('.room-dialog [data-room-control]')])if(!b.disabled){b.disabled=true;b.dataset.roomBusyDisabled='true';}
      try{await fn();if(current())await refresh(true);}catch(error){actions.onError?.(error?.code||'room_operation_failed');if(current()){status.textContent=errorText(error);
        const dialog=document.querySelector('.room-dialog form');if(dialog){let message=dialog.querySelector('[data-room-error]');if(!message){message=element('p','','empty-copy');message.dataset.roomError='true';message.setAttribute('role','alert');dialog.append(message);}message.textContent=status.textContent;}
        if(!status.isConnected)detail.prepend(status);}}
      finally{busy=false;scope.removeAttribute('aria-busy');for(const b of [...scope.querySelectorAll('[data-room-busy-disabled]'),...document.querySelectorAll('.room-dialog [data-room-busy-disabled]')]){b.disabled=false;delete b.dataset.roomBusyDisabled;}}};
    function modal(title){const d=element('dialog','','chat-security-dialog room-dialog'),form=element('form'),heading=element('h3',title);
      d.append(heading,form);const close=iconButton('x',t('chat.closeAria','Close chat'),async()=>d.close());close.onclick=()=>d.close();d.prepend(close);
      document.body.append(d);dialogs.add(d);d.addEventListener('close',()=>{dialogs.delete(d);d.remove();},{once:true});d.showModal();return {d,form};}
    function input(form,label,name,{area=false,max=120,value=''}={}){const wrap=element('label',label),field=document.createElement(area?'textarea':'input');field.name=name;field.required=true;field.maxLength=max;field.value=value;
      if(!area)field.type='text';wrap.append(field);form.append(wrap);return field;}
    function submit(form,label,fn){const b=button(label,()=>{},'action-btn buy-btn');b.type='submit';b.onclick=null;form.append(b);form.onsubmit=event=>{event.preventDefault();return run(fn);};return b;}
    function identities(form,selected){const ul=element('ul','','room-key-review');for(const p of selected){const li=element('li');li.append(element('strong',p.owner),element('code',p.fingerprint));ul.append(li);}form.append(ul);}
    async function createRoom(){const view=modal(t('rooms.create','New chatroom'));const name=input(view.form,t('rooms.name','Room name'),'name',{max:80}),members=input(view.form,t('rooms.usernames','Member usernames'),'members',{area:true,max:1536});
      const review=submit(view.form,t('rooms.review','Review devices'),async()=>{const names=await resolveMembers(members.value,{initial:true});const selected=await call('inspectOwners',names);if(!current())return view.d.close();
        name.disabled=true;members.disabled=true;review.remove();identities(view.form,selected);submit(view.form,t('rooms.create','New chatroom'),async()=>{state.selected=await call('create',name.value,selected);state.tab='chat';view.d.close();});});}
    async function reviewRoom(room){const view=modal(t('rooms.review','Review devices')),i=JSON.parse(room.transition.intent);
      const selected=JSON.parse(i.roster).map(m=>({owner:m.owner,fingerprint:m.fingerprint}));identities(view.form,selected);
      submit(view.form,t('rooms.join','Approve and join'),async()=>{await call('join',room.id);state.selected=room.id;view.d.close();});}
    async function addMembers(room){const view=modal(t('rooms.addMembers','Add members')),names=input(view.form,t('rooms.usernames','Member usernames'),'members',{area:true,max:1536});
      const review=submit(view.form,t('rooms.review','Review devices'),async()=>{const selected=await call('inspectChange',room.id,await resolveMembers(names.value));if(!current())return view.d.close();names.disabled=true;review.remove();identities(view.form,selected);
        submit(view.form,t('rooms.addMembers','Add members'),async()=>{await call('change',room.id,selected,'');view.d.close();});});}
    async function members(room){const view=modal(t('chat.roomMembers','Room members')),i=JSON.parse(room.transition.intent),roles=JSON.parse(i.roles),ul=element('ul','','room-members-list');
      const admin=roles.some(r=>r.owner===owner&&r.role==='admin');
      for(const r of roles){const li=element('li');li.append(element('strong',memberName(r.owner)),element('small',r.role==='admin'?t('chat.roomAdmin','Admin'):t('rooms.member','Member')));
        if(admin&&r.owner!==owner)li.append(button(t('rooms.remove','Remove'),async()=>{const confirm=modal(t('rooms.removeMember','Remove member?'));confirm.form.append(element('p',r.owner));
          submit(confirm.form,t('rooms.remove','Remove'),async()=>{await call('change',room.id,[],r.owner);confirm.d.close();view.d.close();});}));ul.append(li);}
      view.form.append(ul);if(admin)view.form.append(button(t('rooms.addMembers','Add members'),()=>{view.d.close();return addMembers(room);}));}
    function listView(){list.replaceChildren();const toolbar=element('div','','rooms-list-toolbar');toolbar.append(element('strong',t('inbox.rooms','Chatrooms')),
      iconButton('plus',t('rooms.create','New chatroom'),createRoom),iconButton('refresh-cw',t('inbox.retry','Try again'),()=>refresh(true)));list.append(toolbar);
      const search=scope.querySelector('[data-inbox-search]');if(search){search.value=state.query;search.oninput=()=>{state.query=search.value;listView();};}
      const visible=rooms.filter(r=>r.name?.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
      for(const draft of pendingTransitions)list.append(button(t('inbox.retry','Try again')+': '+draft.name,async()=>{state.selected=await call(draft.kind==='create'?'resumeCreate':'resumeChange',draft.id);state.tab='chat';}));
      for(const room of visible){const b=button('',async()=>{state.selected=room.id;state.shown=100;state.tab='chat';},'message-thread-item'+(state.selected===room.id?' active':''));
        b.dataset.roomRow=room.id;const avatar=element('span','','message-thread-avatar');avatar.append(element('span',(room.name||'W').slice(0,1),'conversation-avatar-initial'));
        const meta=element('span','','message-thread-meta');meta.append(element('strong',room.name));
        const history=state.history.get(room.id)||[],last=history.filter(m=>!m.message.startsWith('WINGA-ROOM/')).at(-1);
        const preview=last?.message.startsWith('WINGA-MEDIA/')?t('rooms.attachment','Attachment'):last?.message;
        meta.append(element('small',room.clientError?t('rooms.actionFailed','Unable to finish. Try again.'):room.status==='removed'?t('rooms.removed','Access ended'):room.transition?.status!=='accepted'?t('rooms.pending','Waiting for member approval'):preview||t('rooms.encrypted','Encrypted chatroom'),'inbox-preview'));b.append(avatar,meta);list.append(b);}
      if(!visible.length)list.append(element('p',t('inbox.roomsEmpty','No chatrooms yet.'),'empty-copy'));
    }
    async function productSearch(room){const view=modal(t('chat.productFinder','Find a product')),query=input(view.form,t('chat.productFinder','Find a product'),'query');
      const results=element('div','','room-product-results');view.form.append(results);
      submit(view.form,t('nav.search','Search'),async()=>{const products=await dataLayer.readRichCatalog('product',query.value);if(!current())return view.d.close();results.replaceChildren();
        for(const p of products||[]){if(p.status!=='approved')continue;const row=element('div','','room-product-result');row.append(element('strong',p.name||p.id),element('span',actions.formatPrice?.(p.price)||String(p.price)),
          button(t('rooms.share','Share product'),async()=>{await call('command',room.id,'product-share',{productId:p.id,note:'',snapshot:null});view.d.close();}));results.append(row);}
        if(!results.childElementCount)results.append(element('p',t('chat.noSearchMatches','No matching products found yet.')));});}
    async function newPoll(room){const view=modal(t('rooms.newPoll','New poll')),question=input(view.form,t('rooms.question','Question'),'question',{max:512}),choices=input(view.form,t('rooms.options','Options, one per line'),'options',{area:true,max:1280});
      submit(view.form,t('rooms.newPoll','New poll'),async()=>{const options=choices.value.split('\n').map(label=>label.trim()).filter(Boolean).map(label=>({id:crypto.randomUUID(),label}));
        await call('command',room.id,'poll-create',{question:question.value,options,closesAt:null});view.d.close();});}
    async function attachFile(room){const view=modal(t('rooms.attach','Attach file')),field=document.createElement('input');field.type='file';field.required=true;field.name='file';field.setAttribute('aria-label',t('rooms.attach','Attach file'));view.form.append(field);
      const caption=input(view.form,t('rooms.caption','Caption'),'caption',{area:true,max:4096});caption.required=false;
      submit(view.form,t('inbox.send','Send message'),async()=>{const file=field.files[0];if(!file)return;
        await call('sendMedia',room.id,file,caption.value,/^image\//.test(file.type)?'image':'file');view.d.close();});}
    async function openFile(room,item){const result=await call('downloadMedia',room.id,item.id);if(!current())return;result.checkSession?.();
      const view=modal(t('rooms.attachment','Attachment')),url=URL.createObjectURL(result.blob);urls.add(url);
      view.d.addEventListener('close',()=>{URL.revokeObjectURL(url);urls.delete(url);},{once:true});
      if(['image/jpeg','image/png','image/webp','image/gif'].includes(result.mime||result.blob.type)){const image=document.createElement('img');image.src=url;image.alt=result.name||'';image.className='room-attachment-preview';view.form.append(image);}
      const link=element('a',t('rooms.download','Download'),'action-btn action-btn-secondary');link.href=url;link.download=(result.name||'attachment').replace(/[\\/\u0000-\u001f]/g,'_');view.form.append(link);}
    function productView(room,board,shortlist=false){const wrap=element('div','','room-products'),toolbar=element('div','','rooms-list-toolbar');
      toolbar.append(element('strong',shortlist?t('rooms.shortlist','Shortlist'):t('rooms.products','Products')),
        iconButton('plus',t('rooms.share','Share product'),()=>productSearch(room)));wrap.append(toolbar);
      const products=shortlist?board.products.filter(p=>p.shortlistedBy.includes(owner)):board.products;
      for(const share of products.slice(0,state.shown)){const p=state.catalog.get(share.productId)?.product,row=element('article','','room-product-item');
        const image=actions.sanitizeImage?.(p?.image||p?.images?.[0]||'','');if(image){const img=document.createElement('img');img.src=image;img.alt=p.name||'';img.loading='lazy';row.append(img);}
        const body=element('div');body.append(element('strong',p?.name||share.productId));
        if(p)body.append(element('span',actions.formatPrice?.(p.price)||String(p.price)),element('small',p.availability==='sold_out'?t('rooms.soldOut','Sold out'):t('rooms.current','Current product')));
        else body.append(element('small',t('rooms.productUnavailable','Current product unavailable')));
        const controls=element('div','','room-product-actions');controls.append(iconButton(share.shortlistedBy.includes(owner)?'bookmark-check':'bookmark',t('rooms.shortlist','Shortlist'),()=>call('command',room.id,'shortlist',{shareId:share.shareId,selected:!share.shortlistedBy.includes(owner)})));
        if(p){controls.append(button(t('rooms.viewProduct','View product'),async()=>actions.openProduct?.(p.id)));
          if(p.sellerId&&p.sellerId!==owner&&actions.openContact)controls.append(button(t('rooms.askSeller','Ask seller'),async()=>actions.openContact(p.sellerId)));}
        if(share.owner===owner||JSON.parse(JSON.parse(room.transition.intent).roles).some(r=>r.owner===owner&&r.role==='admin'))controls.append(iconButton('trash-2',t('rooms.remove','Remove'),()=>call('command',room.id,'product-remove',{shareId:share.shareId})));
        body.append(controls);row.append(body);wrap.append(row);}
      if(!products.length)wrap.append(element('p',t('rooms.noProducts','No products shared yet.'),'empty-copy'));
      if(products.length>state.shown)wrap.append(button(t('rooms.more','Load more'),async()=>{state.shown+=100;}));return wrap;
    }
    function pollsView(room,board){const wrap=element('div','','room-polls');wrap.append(button(t('rooms.newPoll','New poll'),()=>newPoll(room)));
      for(const poll of board.polls.slice(0,state.shown)){const section=element('article','','room-poll');section.append(element('h4',poll.question));const total=poll.options.reduce((sum,o)=>sum+o.votes,0);
        for(const o of poll.options){const label=element('label','','room-poll-option'),radio=poll.open?control(document.createElement('input')):document.createElement('input');radio.type='radio';radio.name='poll-'+poll.id;radio.value=o.id;radio.checked=poll.ballots[owner]===o.id;radio.disabled=!poll.open||busy;
          radio.onchange=()=>run(()=>call('command',room.id,'poll-vote',{pollId:poll.id,optionId:o.id}));const meter=document.createElement('meter');meter.min=0;meter.max=Math.max(1,total);meter.value=o.votes;
          label.append(radio,element('span',o.label),element('strong',String(o.votes)),meter);section.append(label);}
        if(poll.open&&poll.ballots[owner])section.append(button(t('rooms.withdraw','Withdraw vote'),()=>call('command',room.id,'poll-vote',{pollId:poll.id,optionId:null})));
        if(poll.open&&(poll.owner===owner||JSON.parse(JSON.parse(room.transition.intent).roles).some(r=>r.owner===owner&&r.role==='admin')))
          section.append(button(t('rooms.closePoll','Close poll'),()=>call('command',room.id,'poll-close',{pollId:poll.id})));
        if(!poll.open)section.append(element('small',t('rooms.pollClosed','Poll closed')));wrap.append(section);}
      if(!board.polls.length)wrap.append(element('p',t('rooms.noPolls','No polls yet.'),'empty-copy'));
      if(board.polls.length>state.shown)wrap.append(button(t('rooms.more','Load more'),async()=>{state.shown+=100;}));return wrap;
    }
    function detailView(){const room=rooms.find(r=>r.id===state.selected),oldThread=detail.dataset.roomId===room?.id?detail.querySelector('.room-thread'):null;
      const keepPosition=oldThread&&oldThread.scrollHeight-oldThread.clientHeight-oldThread.scrollTop>40;
      const oldTop=oldThread?.getBoundingClientRect().top,anchor=keepPosition?[...oldThread.querySelectorAll('[data-room-message]')].find(row=>row.getBoundingClientRect().bottom>oldTop):null;
      const anchorId=anchor?.dataset.roomMessage,anchorOffset=anchor?anchor.getBoundingClientRect().top-oldTop:0,oldScroll=oldThread?.scrollTop||0;
      scope.dataset.conversationSelected=String(Boolean(room));scope.querySelector('.messages-shell')?.classList.toggle('compact-detail',Boolean(room));detail.replaceChildren(status);
      if(!room){detail.append(element('div',t('inbox.selectChat','Select a conversation'),'conversation-empty-state'));return;}
      detail.dataset.roomId=room.id;const head=element('div','','messages-thread-head'),identity=element('div','','room-head-identity');identity.append(element('strong',room.name));
      if(room.transition?.status==='accepted')identity.append(element('p',t('chat.roomMemberCount','{count} members',{count:JSON.parse(JSON.parse(room.transition.intent).roles).length})));
      head.append(iconButton('arrow-left',t('inbox.back','Back'),async()=>{state.selected='';delete detail.dataset.roomId;}),identity);
      if(room.status!=='removed')head.append(iconButton('info',t('chat.roomMembers','Room members'),()=>members(room)));detail.append(head);
      if(room.status==='removed'){detail.append(element('p',t('rooms.removed','Access ended'),'empty-copy'));return;}
      if(room.clientError){detail.append(element('p',t('rooms.actionFailed','Unable to finish. Try again.'),'empty-copy'),button(t('inbox.retry','Try again'),()=>refresh(true)));return;}
      const i=JSON.parse(room.transition.intent),accepted=room.acceptances?.length||0,count=JSON.parse(i.roster).length;
      if(room.transition.status!=='accepted'||!state.boards.has(room.id)){
        detail.append(element('p',t('rooms.approvals','{count} of {total} devices approved',{count:accepted,total:count}),'empty-copy'),button(t('rooms.review','Review devices'),()=>reviewRoom(room)));return;}
      const tabs=element('div','','room-view-tabs');tabs.setAttribute('role','tablist');
      for(const [value,label] of [['chat',t('inbox.chats','Chats')],['products',t('rooms.products','Products')],['polls',t('rooms.polls','Polls')],['shortlist',t('rooms.shortlist','Shortlist')],['orders',t('rooms.orders','Orders')]]){
        const b=button(label,async()=>{state.tab=value;state.shown=100;},'room-view-tab');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(state.tab===value));
        if(value==='orders'){b.disabled=true;delete b.dataset.roomBusyDisabled;}tabs.append(b);}detail.append(tabs);
      const board=state.boards.get(room.id),history=state.history.get(room.id)||[];
      if(state.tab==='products'||state.tab==='shortlist')detail.append(productView(room,board,state.tab==='shortlist'));
      else if(state.tab==='polls')detail.append(pollsView(room,board));
      else if(state.tab==='orders')detail.append(element('p',t('rooms.noOrders','No shared orders.'),'empty-copy'));
      else{const thread=element('div','','messages-thread-body room-thread');
        if(history.length>state.shown)thread.append(button(t('rooms.more','Load more'),async()=>{state.shown+=100;}));
        for(const m of history.slice(-state.shown)){const row=element('div','','chatroom-message-row'+(m.owner===owner?' is-own':'')),bubble=element('div','','message-bubble '+(m.owner===owner?'outgoing':'incoming'));
          if(m.owner!==owner){row.append(memberAvatar(m.owner));const author=element('div','','chatroom-message-author');author.append(element('strong',memberName(m.owner)));
            if(JSON.parse(i.roles).some(r=>r.owner===m.owner&&r.role==='admin'))author.append(element('span',t('chat.roomAdmin','Admin')));bubble.append(author);}
          const attachment=globalThis.WingaEncryptedMedia?.attachment(m);
          if(attachment){bubble.append(button(attachment.attachment.name||t('rooms.attachment','Attachment'),()=>openFile(room,m)));if(attachment.text)bubble.append(element('p',attachment.text));}
          else if(m.message.startsWith('WINGA-ROOM/'))bubble.append(button(t('rooms.sharedActivity','Shared activity'),async()=>{state.tab=m.message.includes('poll-')?'polls':'products';}));
          else if(m.message.startsWith('WINGA-MEDIA/'))bubble.append(element('p',t('rooms.attachmentUnavailable','Attachment unavailable')));
          else bubble.append(element('p',m.message));
          bubble.append(element('small',new Date(m.timestamp).toLocaleTimeString(document.documentElement.lang||'sw',{hour:'2-digit',minute:'2-digit'})+(m.owner===owner?' '+(m.status==='pending'?t('chat.sending','Sending'):t('rooms.'+m.status,m.status)):'')));
          row.dataset.roomMessage=m.id;bubble.dataset.messageBubbleId=m.id;row.append(bubble);thread.append(row);}
        detail.append(thread);const form=element('form','','messages-compose'),text=input(form,t('inbox.compose','Write a message'),'message',{area:true,max:16384,value:state.drafts[room.id]||''});text.rows=1;text.oninput=()=>state.drafts[room.id]=text.value;
        const footer=element('div','','chat-compose-footer');if(room.mediaEnabled)footer.append(iconButton('paperclip',t('rooms.attach','Attach file'),()=>attachFile(room)));
        footer.append(iconButton('shopping-bag',t('rooms.share','Share product'),()=>productSearch(room)),iconButton('list',t('rooms.newPoll','New poll'),()=>newPoll(room)));
        const send=iconButton('send',t('inbox.send','Send message'),async()=>{});send.type='submit';send.onclick=null;footer.append(send);form.append(footer);
        form.onsubmit=event=>{event.preventDefault();run(async()=>{const content=text.value.trim();if(!content)return;state.pending=state.pending||{roomId:room.id,message:content,id:crypto.randomUUID()};
          await call('send',state.pending.roomId,state.pending.message,state.pending.id);state.pending=null;state.drafts[room.id]='';});};detail.append(form);
        if(state.pending)detail.append(button(t('inbox.retry','Try again'),async()=>{await call('send',state.pending.roomId,state.pending.message,state.pending.id);state.drafts[state.pending.roomId]='';state.pending=null;}));
        for(const file of pendingFiles)detail.append(button(t('inbox.retry','Try again')+': '+file.name,()=>call('retryMedia',room.id,file.id)));
        if(keepPosition){const restored=[...thread.querySelectorAll('[data-room-message]')].find(row=>row.dataset.roomMessage===anchorId);
          thread.scrollTop=restored?restored.getBoundingClientRect().top-thread.getBoundingClientRect().top-anchorOffset:oldScroll;
        }else thread.scrollTop=thread.scrollHeight;
        thread.addEventListener('scroll',visibleRead,{passive:true});visibleRead();}
    }
    async function refresh(force=false){if(!current())return;
      const next=await call('sync');if(!current())return;rooms=next;
      pendingTransitions=await call('pendingTransitions');if(!current())return;
      for(const room of rooms){if(room.status==='removed'||room.clientError)continue;
        const history=await call('history',room.id);if(!current())return;state.history.set(room.id,history);
        try{const board=await call('board',room.id);if(!current())return;state.boards.set(room.id,board);
          if(room.id===state.selected&&['products','shortlist'].includes(state.tab))for(const p of board.products.slice(0,state.shown)){const cached=state.catalog.get(p.productId);if(cached&&Date.now()-cached.at<30000)continue;
            let product;try{product=await dataLayer.readConversationProduct(p.productId);}catch{product=null;}if(!current())return;state.catalog.set(p.productId,{product,at:Date.now()});}
        }catch(error){if(!['mls_group_required','mls_room_roster_rejected','mls_room_membership_pending','mls_room_acceptance_required','mls_membership_required'].includes(error.code))throw error;state.boards.delete(room.id);}}
      pendingFiles=[];if(state.selected)try{pendingFiles=await call('pendingMedia',state.selected);}catch(error){if(error.code!=='private_media_disabled')throw error;}
      const version=JSON.stringify([rooms.map(r=>[r.id,r.status,r.transition?.status,r.transition?.id,r.acceptances?.length,r.clientError]),[...state.history],[...state.boards],[...state.catalog].map(([id,v])=>[id,v.product]),state.selected,state.tab,state.shown,pendingFiles,pendingTransitions]);
      if(force||version!==signature){signature=version;const active=document.activeElement,editing=detail.contains(active)&&active?.name==='message',start=active?.selectionStart,end=active?.selectionEnd;
        listView();detailView();if(editing){const field=detail.querySelector('textarea[name="message"]');field?.focus();field?.setSelectionRange(start,end);}}visibleRead();
    }
    const create=scope.querySelector('[data-conversations-action="new"]');if(create)create.onclick=()=>run(createRoom);
    const loop=async()=>{if(stopped||!current())return;try{if(!busy&&document.visibilityState==='visible')await refresh();}catch(error){if(current()){status.textContent=error.code==='encrypted_rooms_disabled'?t('rooms.unavailable','Chatrooms are unavailable.'):t('rooms.actionFailed','Unable to finish. Try again.');
        if(!status.isConnected)detail.append(status);}}finally{if(current())timer=setTimeout(loop,5000);}};
    const wakes=[[window,'focus'],[window,'resize'],[document,'visibilitychange'],[window.visualViewport,'resize'],[window.visualViewport,'scroll']];
    for(const [target,name] of wakes)target?.addEventListener(name,visibleRead,{passive:true});
    const observer=new MutationObserver(()=>{if(!current()){stopped=true;clearTimeout(timer);for(const [target,name] of wakes)target?.removeEventListener(name,visibleRead);for(const d of dialogs)d.close();for(const url of urls)URL.revokeObjectURL(url);urls.clear();
      if(getSession?.()?.username!==owner||getSession?.()?.sessionId!==session.sessionId||getSession?.()?.token!==session.token)states.delete(owner);observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
    listView();detailView();loop();
  }
  globalThis.WingaShoppingRoomsUi={bind,select(owner,id){if(typeof owner!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))return;
    const state=states.get(owner)||{selected:'',tab:'chat',query:'',drafts:{},shown:100,boards:new Map(),history:new Map(),catalog:new Map()};state.selected=id;state.tab='chat';states.set(owner,state);}};
})();
