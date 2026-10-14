(() => {
  const identities=s=>JSON.stringify([s?.username,s?.sessionId,s?.token]);
  function bind(scope,{dataLayer,getSession,getPeer,translate=(k,f)=>f}) {
    const label=scope.querySelector('.thread-presence, .context-chat-presence');
    const input=scope.querySelector('#message-compose-input, #context-chat-compose-input');
    if(!label||label.dataset.activityBound||typeof dataLayer.conversationActivity!=='function')return;
    const initial=getSession(),identity=identities(initial),peer=getPeer();
    if(!initial?.username||!initial.sessionId||!peer)return;
    label.dataset.activityBound='true';
    const fallback=label.textContent,t=translate;
    const current=()=>scope.isConnected&&getPeer()===peer&&identities(getSession())===identity;
    const visible=()=>current()&&document.visibilityState==='visible'&&document.hasFocus();
    let closed=false,busy=false,state=null,expires=0,typingUntil=0,remoteTypingExpires=0,lastSend=0,conversationId=null,wasOnline=false;
    const button=document.createElement('button');button.type='button';button.className='action-btn chat-activity-control';
    button.dataset.chatActivitySettings='';button.textContent=t('chat.activitySettings','Activity privacy');(scope.querySelector('.messages-thread-actions')||label.parentNode).append(button);
    const reset=()=>{expires=0;label.textContent=fallback;};
    const update=value=>{
      if(!visible()||!state?.shareActivity||!conversationId||value?.version!==1||value.conversationId!==conversationId)return;
      if(value.enabled!==true||!Array.isArray(value.states)||value.states.length>12){reset();return;}
      const other=value.states.find(v=>v.owner===peer&&v.online===true&&typeof v.typing==='boolean'
        &&Number.isInteger(v.ttlMs)&&v.ttlMs>0&&v.ttlMs<=12000);
      if(!other){reset();return;}
      expires=Date.now()+other.ttlMs;remoteTypingExpires=other.typing&&Number.isInteger(other.typingTtlMs)&&other.typingTtlMs>0&&other.typingTtlMs<=6000?Date.now()+other.typingTtlMs:0;
      label.textContent=remoteTypingExpires>Date.now()?t('chat.typing','Typing…'):t('chat.online','Online');
    };
    const unsubscribe=dataLayer.subscribeConversationActivity?.(update)||(()=>{});
    async function pulse(force=false){
      if(closed||busy||!current()||!state?.shareActivity)return;
      const now=Date.now(),online=visible(),typing=online&&typingUntil>now;
      if(!force&&now-lastSend<(typing?2200:8000)&&online===wasOnline)return;
      busy=true;lastSend=now;wasOnline=online;
      try{
        const value=await dataLayer.conversationActivity(peer,online,typing);
        if(!current())return;
        if(value?.version===1&&typeof value.conversationId==='string')conversationId=value.conversationId;
        if(online)update(value);else reset();
      }catch{if(current())reset();}finally{busy=false;}
    }
    const validate=value=>{
      if(value?.version!==1||typeof value.shareActivity!=='boolean'||typeof value.revision!=='string'
        ||!/^(0|[1-9][0-9]{0,18})$/.test(value.revision))throw Error('activity_unavailable');
      return value;
    };
    button.onclick=async()=>{
      if(!visible()||button.disabled)return;button.disabled=true;let dialog,timer;
      try{
        state=validate(await dataLayer.conversationActivityPreferences());if(!visible())return;
        const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
        dialog=node('dialog');dialog.className='chat-security-dialog';dialog.append(node('h3',t('chat.activitySettings','Activity privacy')));
        dialog.append(node('p',t('chat.activityExplanation','Share online and typing activity with authorized participants who also enable sharing. No last seen is stored.')));
        const option=node('label',t('chat.shareActivity','Share online and typing activity'));
        const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=state.shareActivity;checkbox.dataset.chatActivityChoice='';option.prepend(checkbox);dialog.append(option);
        const status=node('p');status.setAttribute('role','status');dialog.append(status);
        const save=node('button',t('common.save','Save')),close=node('button',t('common.close','Close'));
        for(const control of [save,close]){control.type='button';control.className='action-btn';dialog.append(control);}
        save.onclick=async()=>{
          if(save.disabled||!visible())return;save.disabled=true;
          try{
            const value=validate(await dataLayer.setConversationActivitySharing(checkbox.checked,state.revision,crypto.randomUUID()));
            if(!visible()||!dialog.isConnected)return;state=value;
            if(!state.shareActivity){reset();await dataLayer.conversationActivity(peer,false,false).catch(()=>{});}
            else await pulse(true);
            if(visible()&&dialog.isConnected)dialog.close();
          }catch{
            // A lost response is reconciled, never displayed as a successful Save.
            try{const value=validate(await dataLayer.conversationActivityPreferences());if(current())state=value;}catch{}
            if(visible()&&dialog.isConnected)status.textContent=t('chat.activityFailed','Unable to update activity sharing. Review your encryption device and try again.');
          }finally{save.disabled=false;}
        };
        close.onclick=()=>dialog.close();timer=setInterval(()=>{if(!visible())dialog.close();},500);
        dialog.addEventListener('close',()=>{clearInterval(timer);dialog.remove();},{once:true});document.body.append(dialog);dialog.showModal();
      }catch{button.title=t('chat.activityFailed','Unable to update activity sharing. Review your encryption device and try again.');dialog?.remove();}
      finally{button.disabled=false;}
    };
    const typing=()=>{typingUntil=Date.now()+5000;void pulse();};
    input?.addEventListener('input',typing);
    const visibility=()=>{if(!visible())reset();void pulse(true);};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',visibility);window.addEventListener('focus',visibility);
    const timer=setInterval(()=>{
      if(!current()){
        closed=true;clearInterval(timer);unsubscribe();input?.removeEventListener('input',typing);
        document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',visibility);window.removeEventListener('focus',visibility);
        return;
      }
      if(expires&&expires<=Date.now())reset();
      else if(expires&&remoteTypingExpires&&remoteTypingExpires<=Date.now()){remoteTypingExpires=0;label.textContent=t('chat.online','Online');}
      void pulse();
    },1000);
    Promise.resolve().then(()=>dataLayer.conversationActivityPreferences()).then(value=>{if(current()){state=validate(value);void pulse(true);}}).catch(()=>{});
  }
  globalThis.WingaConversationActivityUi={bind};
})();
