(() => {
  function bind(scope,{dataLayer,getSession,getPeer,translate=(k,f)=>f,refresh=()=>{}}) {
    if(typeof dataLayer.pushRequest!=='function')return;
    const initial=getSession(),owner=initial?.username,sessionId=initial?.sessionId;
    if(!owner||!sessionId)return;
    const key=JSON.stringify([owner,sessionId,initial.token]);
    const current=peer=>{const s=getSession();return scope.isConnected&&getPeer()===peer&&document.visibilityState==='visible'
      &&JSON.stringify([s?.username,s?.sessionId,s?.token])===key;};
    const t=translate;
    const validate=value=>{
      if(!value||typeof value.revision!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(value.revision)
        ||typeof value.muted!=='boolean')throw Error('conversation_mute_unavailable');
      return value;
    };
    for(const button of scope.querySelectorAll('[data-chat-notifications]')) {
      if(button.dataset.muteBound)continue;button.dataset.muteBound='true';button.hidden=false;
      button.onclick=async()=>{
        const peer=button.dataset.chatNotifications;if(!current(peer)||button.disabled)return;
        button.disabled=true;let dialog;
        try {
          let state=validate(await dataLayer.pushRequest('mute/state',{owner,sessionId,peer},'POST'));if(!current(peer))return;
          const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
          dialog=node('dialog');dialog.className='chat-security-dialog chat-notification-dialog';
          dialog.append(node('h3',t('chat.notificationSettings','Notifications')));
          const status=node('p');status.setAttribute('role','status');dialog.append(status);
          const label=node('label',t('chat.muteAlerts','Mute alerts'));
          const select=node('input');select.type='checkbox';select.setAttribute('role','switch');select.dataset.muteSetting='';
          label.prepend(select);dialog.append(label);
          const showState=()=>{
            status.textContent=state.muted?t('chat.muteActive','Alerts muted'):t('chat.muteOff','Alerts on');
            select.checked=state.muted;
          };showState();
          const actions=node('div');actions.className='chat-security-actions';
          const save=node('button',t('common.save','Save')),close=node('button',t('common.close','Close'));
          for(const control of [save,close]){control.type='button';control.className='action-btn';actions.append(control);}dialog.append(actions);
          save.onclick=async()=>{
            if(save.disabled||!current(peer)||!dialog.isConnected)return;save.disabled=true;select.disabled=true;
            try {
              const next=validate(await dataLayer.pushRequest('mute',{owner,sessionId,peer,muted:select.checked,revision:state.revision},'POST'));
              if(!current(peer)||!dialog.isConnected)return;state=next;showState();await refresh();
            }catch{if(current(peer)&&dialog.isConnected)status.textContent=t('chat.muteFailed','Unable to update notifications. Try again.');}
            finally{save.disabled=false;select.disabled=false;}
          };
          close.onclick=()=>dialog.close();
          const timer=setInterval(()=>{if(!current(peer))dialog.close();},250);
          const hidden=()=>{if(!current(peer))dialog.close();};document.addEventListener('visibilitychange',hidden);
          dialog.addEventListener('close',()=>{clearInterval(timer);document.removeEventListener('visibilitychange',hidden);dialog.remove();},{once:true});
          document.body.append(dialog);dialog.showModal();
        }catch{if(current(peer))button.title=t('chat.muteFailed','Unable to update notifications. Try again.');dialog?.remove();}
        finally{button.disabled=false;}
      };
    }
  }
  globalThis.WingaConversationNotifications={bind};
})();
