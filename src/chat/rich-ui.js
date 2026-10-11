(() => {
  const element=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  const icon=name=>{const el=element('img');el.src='/icons/navigation/'+name+'.svg';el.width=el.height=20;el.alt='';return el;};
  function bind(scope,{peer,dataLayer,translate=(k,f)=>f,refresh=()=>{},getSession=()=>null,getPeer=()=>peer,actions={},getMessages=()=>[]}) {
    const key=()=>{const s=getSession();return JSON.stringify([s?.username,s?.sessionId,s?.token]);};
    const t=translate,initial=key(),owner=getSession()?.username;
    const sessionCurrent=()=>key()===initial;
    const current=()=>scope.isConnected&&getPeer()===peer&&sessionCurrent();
    const references=new Map(),referenceReads=new Map();
    const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){references.get(entry.target)?.();observer.unobserve(entry.target);}
    },{rootMargin:'200px'}):null;
    const button=(label,symbol,run)=>{
      const b=element('button','chat-rich-action');b.type='button';b.title=label;b.setAttribute('aria-label',label);
      if(symbol)b.append(icon(symbol));b.append(element('span','',label));
      b.onclick=async()=>{
        const host=b.closest('dialog');if(b.disabled||!current()||host?.dataset.busy)return;
        b.disabled=true;if(host)host.dataset.busy='true';
        try{await run(b);}catch(error){
          actions.onError?.(/^[a-z0-9_]{1,80}$/.test(error?.code||'')?error.code:'rich_action_failed');
          b.title=t('chat.richFailed','The action failed. Your saved messages are unchanged.');
          const status=host?.querySelector('[role="status"]');if(status)status.textContent=b.title;
        }finally{b.disabled=false;if(host)delete host.dataset.busy;}
      };return b;
    };
    function dialog(title) {
      const d=element('dialog','chat-security-dialog chat-rich-dialog');d.append(element('h3','',title));
      const body=element('div','chat-rich-fields'),status=element('p','chat-rich-status'),footer=element('div','chat-rich-actions');
      status.setAttribute('role','status');d.append(body,status,footer);
      const close=button(t('common.close','Close'),'x',()=>d.close());footer.append(close);
      let timer=setInterval(()=>{if(!current()||document.visibilityState!=='visible')d.close();},250);
      d.addEventListener('close',()=>{clearInterval(timer);d.remove();},{once:true});
      document.body.append(d);d.showModal();
      return {d,body,status,footer};
    }
    async function send(content,view) {
      if(!current())return;let accepted=false;
      view.status.textContent=t('chat.secureWorking','Working...');
      const reply=actions.getReplyId?.();if(reply)content={...content,reply:{id:reply,quote:''}};
      try {
        await dataLayer.sendRichMessage(peer,content);accepted=true;
        actions.clearReply?.();await refresh();
      } catch {if(view.d.isConnected)view.status.textContent=t('chat.richFailed','The action failed. Your saved messages are unchanged.');}
      finally {if(accepted)view.d.close();}
    }
    for(const trigger of scope.querySelectorAll('[data-seller-message]')){
      if(trigger.dataset.sellerBound)continue;trigger.dataset.sellerBound='true';
      trigger.onclick=async()=>{if(!current()||trigger.disabled)return;trigger.disabled=true;
        const messageId=trigger.dataset.sellerMessage,reply=trigger.dataset.sellerAction==='answer',view=dialog(t(reply?'rooms.respond':'rooms.shareResponse',reply?'Respond':'Share response to room'));
        try{
          let answer;
          if(reply){const q=await dataLayer.seller('read',[peer,messageId]);if(!current()||!view.d.isConnected)return;
            view.body.append(element('p','',q.question));const label=element('label','',t('rooms.sellerResponse','Seller response'));
            answer=element('textarea');answer.maxLength=2048;answer.required=true;answer.value=q.draft;label.append(answer);view.body.append(label);}
          else {const m=getMessages().find(m=>m.id===messageId);view.body.append(element('p','',m?.richContent?.text||m?.message||''));}
          const label=element('label','room-consent'),consent=element('input');consent.type='checkbox';
          label.append(consent,element('span','',t(reply?'rooms.answerConsent':'rooms.responseConsent',reply?'Share this response with the requesting room.':'Share only this seller response with the room.')));view.body.append(label);
          const submit=button(t(reply?'rooms.respond':'rooms.shareResponse',reply?'Respond':'Share response to room'),'send',async()=>{
            if(!consent.checked||reply&&!answer.value.trim())return;
            await dataLayer.seller(reply?'answer':'share',reply?[peer,messageId,answer.value.trim(),true]:[peer,messageId,true]);
            if(current()){view.d.close();await refresh();}});submit.disabled=true;
          const ready=()=>submit.disabled=!consent.checked||reply&&!answer.value.trim();consent.onchange=ready;if(answer)answer.oninput=ready;view.footer.prepend(submit);
        }catch{if(view.d.isConnected)view.status.textContent=t('chat.richFailed','The action failed. Your saved messages are unchanged.');}
        finally{trigger.disabled=false;}
      };
    }
    const kinds={
      product:[t('chat.richProduct','Product'),'tag'],reel:[t('chat.richReel','Reel'),'clapperboard'],
      short:[t('chat.richShort','Short'),'video'],collection:[t('chat.richCollection','Collection'),'layout-grid'],
      order:[t('chat.richOrder','Order'),'shopping-bag'],payment:[t('chat.richPayment','Payment reference'),'credit-card'],
      delivery:[t('chat.richDelivery','Delivery'),'truck'],location:[t('chat.richLocation','Location'),'map-pin'],
      contact:[t('chat.richContact','Contact'),'user-round']
    };
    function addInput(view,label,{type='text',maxLength=128,value='',step,min,max}={}) {
      const wrap=element('label','',label),input=element('input');input.type=type;input.maxLength=maxLength;input.value=value;
      if(step)input.step=step;if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;
      wrap.append(input);view.body.append(wrap);return input;
    }
    function pickReference(kind) {
      const view=dialog(kinds[kind][0]),list=element('div','chat-rich-picker'),input=addInput(view,t('chat.richSearch','Search items'),{maxLength:120});
      view.body.append(list);let request=0,debounce;
      const load=async()=>{
        const revision=++request;view.status.textContent=t('inbox.loading','Loading...');
        try {
          const items=await dataLayer.readRichCatalog(kind,input.value);
          if(!current()||!view.d.isConnected||request!==revision)return;
          list.replaceChildren();view.status.textContent='';
          const allowed=items.filter(item=>!['order','payment','delivery'].includes(kind)
            ||[item.buyerUsername,item.sellerUsername].includes(peer));
          for(const item of allowed) {
            const name=item.name||item.title||item.productName||item.id;
            const b=button(name,kinds[kind][1],()=>send(WingaRichContent.create(kind,'',
              ['order','payment','delivery'].includes(kind)?{id:item.id}:{ids:[item.id]}),view));
            b.dataset.richPick=item.id;list.append(b);
          }
          if(!allowed.length)view.status.textContent=t('chat.richNoItems','No items available.');
        }catch{if(view.d.isConnected&&revision===request)view.status.textContent=t('chat.richUnavailable','This item is unavailable.');}
      };
      input.oninput=()=>{clearTimeout(debounce);debounce=setTimeout(load,250);};
      view.d.addEventListener('close',()=>{request++;clearTimeout(debounce);},{once:true});load();input.focus();
    }
    function pickLocation() {
      const view=dialog(kinds.location[0]);
      const latitude=addInput(view,t('chat.richLatitude','Latitude'),{type:'number',step:'any',min:-90,max:90});
      const longitude=addInput(view,t('chat.richLongitude','Longitude'),{type:'number',step:'any',min:-180,max:180});
      const label=addInput(view,t('chat.richLabel','Name'),{maxLength:160});
      view.body.append(button(t('chat.richCurrentLocation','Use current location'),'map-pin',()=>new Promise(resolve=>{
        if(!navigator.geolocation){view.status.textContent=t('chat.richUnavailable','This item is unavailable.');resolve();return;}
        navigator.geolocation.getCurrentPosition(p=>{
          if(current()&&view.d.isConnected){latitude.value=String(p.coords.latitude);longitude.value=String(p.coords.longitude);}resolve();
        },()=>{if(view.d.isConnected)view.status.textContent=t('chat.richUnavailable','This item is unavailable.');resolve();},{timeout:10000,maximumAge:0});
      })));
      view.footer.prepend(button(t('inbox.send','Send message'),'send',()=>{
        if(!latitude.value||!longitude.value||!latitude.checkValidity()||!longitude.checkValidity()) {
          view.status.textContent=t('chat.richInvalid','Check the selected item and try again.');return;
        }
        return send(WingaRichContent.create('location','',{latitude:Number(latitude.value),longitude:Number(longitude.value),label:label.value}),view);
      }));
    }
    function pickContact() {
      const view=dialog(kinds.contact[0]),name=addInput(view,t('chat.richUsername','Winga username'));
      view.footer.prepend(button(t('inbox.send','Send message'),'send',async()=>{
        try {
          const contact=await dataLayer.readRichContact(name.value.trim());
          if(!current()||!view.d.isConnected)return;
          await send(WingaRichContent.create('contact','',{username:contact.username,name:contact.fullName||contact.username}),view);
        }catch{view.status.textContent=t('chat.richUnavailable','This item is unavailable.');}
      }));
    }
    function edit(id) {
      const message=getMessages().find(m=>m.id===id);if(!message)return;
      const view=dialog(t('chat.richEdit','Edit message')),text=element('textarea');text.maxLength=4096;text.rows=4;text.value=message.message||'';view.body.append(text);
      view.footer.prepend(button(t('common.save','Save'),'check',async()=>{
        if(!text.value.trim())return;
        await dataLayer.mutateEncryptedMessage(peer,'edit',id,text.value);view.d.close();await refresh();
      }));text.focus();
    }
    function remove(id) {
      const view=dialog(t('chat.richDelete','Delete for me'));view.body.append(element('p','',t('chat.richDeleteNotice','This removes the message from your history. Other participants keep their copy.')));
      view.footer.prepend(button(t('chat.richDelete','Delete for me'),'trash-2',async()=>{
        await dataLayer.mutateEncryptedMessage(peer,'hide',id);view.d.close();await refresh();
      }));
    }
    function react(id) {
      const view=dialog(t('chat.richReact','React'));
      for(const emoji of WingaRichContent.REACTIONS) {
        const b=button(emoji,null,async()=>{
          const mine=getMessages().find(m=>m.id===id)?.reactions?.some(r=>r.emoji===emoji&&r.owners.includes(owner));
          await dataLayer.mutateEncryptedMessage(peer,'reaction',id,mine?'':emoji);view.d.close();await refresh();
        });b.classList.add('chat-reaction-choice');view.body.append(b);
      }
    }
    for(const [selector,run] of [
      ['[data-rich-edit]',b=>edit(b.dataset.richEdit)],['[data-rich-delete]',b=>remove(b.dataset.richDelete)],
      ['[data-rich-react]',b=>react(b.dataset.richReact)],['[data-rich-contact]',b=>actions.openContact?.(b.dataset.richContact)]
    ])for(const control of scope.querySelectorAll(selector)) {
      if(control.dataset.richBound)continue;control.dataset.richBound='true';
      control.onclick=async()=>{
        if(!current()||control.disabled)return;control.disabled=true;
        try{await run(control);}catch{control.title=t('chat.richFailed','The action failed. Your saved messages are unchanged.');}
        finally{control.disabled=false;}
      };
    }
    for(const card of scope.querySelectorAll('[data-rich-reference-id]')) {
      if(card.dataset.richBound)continue;card.dataset.richBound='true';
      const kind=card.dataset.richReferenceKind,id=card.dataset.richReferenceId;
      const load=async()=>{
        if(!current()||!card.isConnected)return;
        const state=element('p','',t('inbox.loading','Loading...'));card.replaceChildren(state);
        try {
          const cacheKey=JSON.stringify([kind,id]);
          if(!referenceReads.has(cacheKey))referenceReads.set(cacheKey,dataLayer.readConversationReference(kind,id).catch(error=>{referenceReads.delete(cacheKey);throw error;}));
          const item=await referenceReads.get(cacheKey);
          if(!current()||!card.isConnected)return;
          card.replaceChildren();
          card.append(element('small','chat-rich-kind',kinds[kind]?.[0]||''));
          const media=actions.sanitizeImage?.(item.image)||'';
          if(media){const img=element('img','chat-rich-product-image');img.src=media;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';card.append(img);}
          card.append(element('strong','',item.name||item.title||item.productName||item.id));
          if(item.price!==undefined||item.amount!==undefined)card.append(element('p','chat-rich-price',
            actions.formatPrice?.(item.price??item.amount)||new Intl.NumberFormat(document.documentElement.lang||'sw',{style:'currency',currency:item.currency||'TZS'}).format(item.price??item.amount)));
          if(item.availability)card.append(element('small','',t('chat.richState.'+item.availability,item.availability)));
          if(item.status)card.append(element('small','',t('order.status.'+item.status,item.status)));
          if(item.paymentIntentStatus)card.append(element('small','',t('chat.richPaymentState.'+item.paymentIntentStatus,item.paymentIntentStatus)));
          for(const p of item.items||[])if(kind!=='collection')card.append(element('small','',[
            p.name,p.size,p.color,p.quantity===undefined?'':t('chat.richQuantity','Quantity')+' '+p.quantity
          ].filter(Boolean).join(' / ')));
          const row=element('div','chat-rich-card-actions');card.append(row);
          if(['product','reel','short'].includes(kind)) {
            row.append(button(t('inbox.viewProduct','View product'),'eye',()=>actions.openProduct?.(id)));
            if(kind==='product') {
              row.append(button(t('common.save','Save'),'bookmark',()=>actions.saveProduct?.(id)));
              if(item.availability!=='sold_out'&&item.availability!=='reserved')row.append(button(t('chat.richAddOrder','Add to order'),'shopping-bag',()=>actions.buyProduct?.(id)));
            }
          }else if(kind==='collection') {
            for(const p of item.items||[])row.append(button(p.name||p.id,'tag',()=>actions.openProduct?.(p.id)));
          }else {
            row.append(button(t('chat.richViewOrder','View order'),'shopping-bag',()=>actions.openOrder?.(id)));
            if(item.canSubmitReference)row.append(button(t('order.submitReferenceAction','Submit reference'),'credit-card',()=>actions.payOrder?.(id)));
          }
          row.append(button(t('inbox.refresh','Refresh conversations'),'refresh-cw',()=>{referenceReads.delete(cacheKey);return load();}));
        }catch {
          if(current()&&card.isConnected)card.replaceChildren(element('p','',t('chat.richUnavailable','This item is unavailable.')),
            button(t('inbox.retry','Try again'),'refresh-cw',load));
        }
      };
      // Reference reads are separate from message acceptance and never carry message text.
      references.set(card,load);if(observer)observer.observe(card);else load();
    }
    if(references.size) {
      const timer=setInterval(()=>{
        if(!current()||![...references.keys()].some(card=>card.isConnected)){clearInterval(timer);observer?.disconnect();referenceReads.clear();return;}
        if(document.visibilityState!=='visible')return;
        referenceReads.clear();
        for(const [card,load] of [...references].filter(([card])=>{const r=card.getBoundingClientRect();return card.isConnected&&r.bottom>0&&r.top<innerHeight;}).slice(0,12))load();
      },30000);
    }else observer?.disconnect();
    const footer=scope.querySelector('.chat-compose-footer');if(!footer||footer.querySelector('[data-rich-composer]'))return;
    const menu=button(t('chat.richAttach','Attach'),'plus',()=>{
      const view=dialog(t('chat.richAttach','Attach'));
      const mediaTypes=[['image',t('chat.richPhoto','Photo'),'image'],['voice',t('chat.richVoice','Voice'),'mic'],['video',t('chat.richVideo','Video'),'video'],['file',t('chat.mediaFile','Encrypted file'),'paperclip']];
      for(const [kind,label,symbol] of mediaTypes)if(actions.mediaEnabled)view.body.append(button(label,symbol,()=>{
        view.d.close();globalThis.WingaVoiceUi?.open({kind,peer,dataLayer,translate,refresh,current,sessionCurrent});
      }));
      for(const [kind,[label,symbol]] of Object.entries(kinds))view.body.append(button(label,symbol,()=>{
        view.d.close();if(kind==='location')pickLocation();else if(kind==='contact')pickContact();else pickReference(kind);
      }));
    });
    menu.dataset.richComposer='true';menu.classList.add('conversation-icon-button');footer.prepend(menu);
    if(actions.mediaEnabled) {
      const camera=button(t('chat.richCamera','Camera'),'camera',()=>globalThis.WingaVoiceUi?.open({kind:'image',capture:true,peer,dataLayer,translate,refresh,current,sessionCurrent}));
      camera.classList.add('conversation-icon-button');footer.insertBefore(camera,menu.nextSibling);
    }
  }
  function openProductShare({productId,dataLayer,getSession=()=>null,translate=(k,f)=>f}) {
    // Reuse canonical encrypted writers. Nothing is sent while choosing a destination.
    const t=translate,key=()=>{const s=getSession();return JSON.stringify([s?.username,s?.sessionId,s?.token]);};
    const initial=key(),owner=getSession()?.username;
    if(!owner||!getSession()?.sessionId||!getSession()?.token)return null;
    const content=WingaRichContent.create('product','',{ids:[productId]});
    const d=element('dialog','chat-security-dialog chat-rich-dialog');
    d.append(element('h3','',t('growth.shareToWinga','Share to Winga')));
    const list=element('div','chat-rich-picker'),status=element('p','chat-rich-status'),footer=element('div','chat-rich-actions');
    status.setAttribute('role','status');status.textContent=t('inbox.loading','Loading...');d.append(list,status,footer);
    const send=element('button','chat-rich-action',t('inbox.send','Send message')),close=element('button','chat-rich-action',t('common.close','Close'));
    send.type=close.type='button';send.disabled=true;close.onclick=()=>d.close();footer.append(send,close);
    let selected=null,actionId=null,busy=false,attempted=false,timer;
    const current=()=>d.isConnected&&d.open&&key()===initial&&document.visibilityState==='visible';
    const choices=[];
    function add(kind,id,label) {
      if(typeof id!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(id)||choices.some(b=>b.dataset.shareKind===kind&&b.dataset.shareTarget===id))return;
      const b=element('button','chat-rich-action',label||id);b.type='button';b.dataset.shareKind=kind;b.dataset.shareTarget=id;
      b.setAttribute('aria-pressed','false');
      b.onclick=()=>{
        if(!current()||busy||attempted)return;
        selected={kind,id};actionId=crypto.randomUUID();
        for(const choice of choices)choice.setAttribute('aria-pressed',String(choice===b));
        send.disabled=false;
      };
      choices.push(b);list.append(b);
    }
    send.onclick=async()=>{
      if(!current()||!selected||busy)return;
      busy=true;attempted=true;send.disabled=true;for(const b of choices)b.disabled=true;
      status.textContent=t('chat.secureWorking','Working...');
      try {
        if(selected.kind==='conversation')await dataLayer.sendRichMessage(selected.id,content,actionId);
        else await dataLayer.shoppingRoom('command',[selected.id,'product-share',{productId,note:'',snapshot:null},actionId]);
        if(current())d.close();
      } catch {
        // A response can be lost after acceptance. Retry this exact action ID.
        if(current()){status.textContent=t('rooms.actionFailed','Unable to finish. Try again.');send.textContent=t('inbox.retry','Try again');}
      } finally {busy=false;if(current())send.disabled=false;}
    };
    document.body.append(d);d.showModal();
    timer=setInterval(()=>{if(!current())d.close();},250);
    d.addEventListener('close',()=>{clearInterval(timer);d.remove();},{once:true});
    const load=async(kind,read)=>{
      try {
        const result=await read();if(!current()||attempted)return;
        const rows=kind==='conversation'?result?.items:result;
        if(!Array.isArray(rows))throw new Error();
        list.append(element('h4','',kind==='conversation'?t('inbox.chats','Chats'):t('inbox.rooms','Chatrooms')));
        for(const row of rows.slice(0,20)) {
          if(!row||typeof row!=='object')continue;
          if(kind==='conversation'){if(row.withUser!==owner&&row.blocked!==true)add(kind,row.withUser,row.withUser);}
          else if(row.status==='active'&&row.transition?.status==='accepted'&&!row.clientError&&!row.departures?.length&&!row.preferences?.archived)add(kind,row.id,row.name);
        }
      } catch {if(current()&&!attempted)status.textContent=t('growth.destinationsUnavailable','Some destinations could not be loaded.');}
    };
    void Promise.all([
      load('conversation',()=>dataLayer.loadInboxPage({limit:20})),
      load('room',()=>dataLayer.shoppingRoom('list'))
    ]).then(()=>{if(current()&&status.textContent===t('inbox.loading','Loading...'))status.textContent=choices.length?'':t('chat.richNoItems','No items available.');});
    return {close:()=>d.close()};
  }
  globalThis.WingaRichUi={bind,openProductShare};
})();
