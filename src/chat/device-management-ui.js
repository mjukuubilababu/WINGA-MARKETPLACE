(() => {
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  async function createManagementSession({getSession,request}) {
    const initial={...getSession()};let closed=false;
    const check=()=>{const s=getSession();if(closed || !initial.username || s?.username!==initial.username || s.sessionId!==initial.sessionId || s.token!==initial.token)fail('crypto_device_session_changed');};
    check();const client=await WingaCryptoDevices.createCryptoDeviceClient({getSession,request});
    try {let view=await client.list();check();if(!view.ownDevice){await client.enroll();check();}}
    catch(error){client.close();throw error;}
    return {check,
      async list(){check();const result=await client.list();check();return result;},
      async manage(action,id,fingerprint){check();const result=await client.manage(action,id,fingerprint);check();return result;},
      async clearPending(){check();const result=await client.clearPending();check();return result;},
      close(){closed=true;client.close();}
    };
  }
  async function open({dataLayer,translate=(k,f)=>f,refresh=()=>{}}) {
    const t=translate,session=await dataLayer.createCryptoDeviceManagement();let dialog,timer,refreshTimer;
    try {
      let view=await session.list(),busy=false,refreshing=false,closed=false,mutationVersion=0;
      const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
      dialog=document.createElement('dialog');dialog.className='chat-security-dialog chat-devices-dialog';
      dialog.append(node('h3',t('chat.devices','Encryption devices')));
      dialog.append(node('p',t('chat.deviceAdmissionNotice','Approving a device does not restore existing encrypted conversation keys.')));
      const status=node('p','');status.setAttribute('role','status');dialog.append(status);
      const own=node('label',t('chat.ownFingerprint','Your device fingerprint')),ownKey=node('code','');ownKey.className='chat-fingerprint';own.append(ownKey);dialog.append(own);
      const targetLabel=node('label',t('chat.deviceTarget','Device')),target=document.createElement('select');target.dataset.cryptoDeviceTarget='';targetLabel.append(target);dialog.append(targetLabel);
      const fingerprint=node('code','');fingerprint.className='chat-fingerprint';dialog.append(fingerprint);
      const actionLabel=node('label',t('chat.deviceAction','Action')),action=document.createElement('select');action.dataset.cryptoDeviceAction='';actionLabel.append(action);dialog.append(actionLabel);
      const warning=node('p',t('chat.deviceRevokeOwnWarning','Revoking this device blocks its live encrypted chats.'));warning.hidden=true;dialog.append(warning);
      const confirmLabel=node('label',t('chat.deviceConfirm','Full fingerprint from the device')),confirm=document.createElement('input');confirm.autocomplete='off';confirm.spellcheck=false;confirm.dataset.cryptoDeviceConfirm='';confirmLabel.append(confirm);dialog.append(confirmLabel);
      const apply=node('button',t('chat.deviceApply','Confirm device action'));apply.type='button';apply.className='action-btn';apply.dataset.cryptoDeviceApply='';dialog.append(apply);
      const stop=node('button',t('chat.deviceStopRetry','Stop retrying this action'));stop.type='button';stop.className='action-btn action-btn-secondary';dialog.append(stop);
      const stopNote=node('p',t('chat.deviceStopRetryNotice','Stopping retries does not undo an action already accepted by the server.'));stopNote.hidden=true;dialog.append(stopNote);
      const close=node('button',t('common.close','Close'));close.type='button';close.className='action-btn action-btn-secondary';dialog.append(close);
      const stateText=value=>value==='active'?t('chat.deviceActive','Active'):value==='pending'?t('chat.devicePending','Pending approval'):t('chat.deviceRevoked','Revoked');
      function selected(){return view.devices.find(d=>d.id===target.value);}
      function enabled(){const d=selected();apply.disabled=busy || !d || !action.value || confirm.value.replace(/\s/g,'').toLowerCase()!==d.fingerprint || (view.ownDevice?.status!=='active'&&!view.pendingOperation);target.disabled=action.disabled=confirm.disabled=busy;close.disabled=busy;stop.hidden=stopNote.hidden=!view.pendingOperation;stop.disabled=busy;warning.hidden=d?.id!==view.ownDevice?.id || action.value!=='revoke';apply.textContent=action.value==='approve'?t('chat.deviceApprove','Approve'):action.value==='revoke'?t('chat.deviceRevoke','Revoke'):t('chat.deviceApply','Confirm device action');}
      function choose(){const d=selected(),pending=view.pendingOperation;fingerprint.textContent=d?.fingerprint||'';confirm.value='';action.replaceChildren();
        const actions=pending?[pending.action]:d?.status==='pending'?['approve','revoke']:d?.status==='active'?['revoke']:[];
        for(const value of actions){const option=node('option',value==='approve'?t('chat.deviceApprove','Approve'):t('chat.deviceRevoke','Revoke'));option.value=value;action.append(option);}enabled();}
      function render(previous){ownKey.textContent=view.ownDevice?.fingerprint||'';status.textContent=stateText(view.ownDevice?.status);target.replaceChildren();
        const pending=view.pendingOperation;
        for(const d of view.devices.filter(d=>pending?d.id===pending.deviceId:d.status!=='revoked')){const option=node('option',`${stateText(d.status)}: ${d.fingerprint.slice(0,16)}${d.id===view.ownDevice?.id?' ('+t('chat.deviceThis','This device')+')':''}`);option.value=d.id;target.append(option);}
        const preferred=view.devices.find(d=>pending?d.id===pending.deviceId:d.status==='pending');if(preferred)target.value=preferred.id;
        if(previous&&Array.from(target.options).some(o=>o.value===previous.id))target.value=previous.id;
        choose();
        if(previous&&target.value===previous.id&&selected()?.fingerprint===previous.fingerprint
          &&Array.from(action.options).some(o=>o.value===previous.action)){
          action.value=previous.action;confirm.value=previous.confirmation;enabled();
        }
      }
      const viewKey=value=>JSON.stringify([value.ownDevice?.id,value.ownDevice?.status,
        value.devices.map(d=>[d.id,d.status,d.fingerprint]),value.pendingOperation]);
      async function refreshDevices(){
        if(closed||busy||refreshing||!dialog.open)return;
        refreshing=true;const version=mutationVersion;
        try{
          const next=await session.list();
          if(closed||busy||version!==mutationVersion||!dialog.open||viewKey(next)===viewKey(view))return;
          // Retain typed confirmation only for the same verified target and available action.
          const previous={id:target.value,fingerprint:selected()?.fingerprint,action:action.value,confirmation:confirm.value};
          view=next;render(previous);
        }catch{try{session.check();}catch{if(!closed)dialog.close();}}
        finally{refreshing=false;}
      }
      target.onchange=choose;action.onchange=enabled;confirm.oninput=enabled;
      apply.onclick=async()=>{if(apply.disabled)return;busy=true;mutationVersion++;enabled();status.textContent=t('chat.secureWorking','Working...');
        const id=target.value;
        try {view=await session.manage(action.value,id,confirm.value.replace(/\s/g,'').toLowerCase());render({id});try{await refresh();}catch{}}
        catch{try{view=await session.list();render({id});}catch{}status.textContent=t('chat.deviceActionFailed','Device action failed. Retry the same action or check the current device status.');}
        finally{busy=false;enabled();}
      };
      stop.onclick=async()=>{if(busy)return;busy=true;mutationVersion++;enabled();try{view=await session.clearPending();render();}catch{status.textContent=t('chat.deviceActionFailed','Device action failed. Retry the same action or check the current device status.');}finally{busy=false;enabled();}};
      close.onclick=()=>dialog.close();dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
      dialog.addEventListener('close',()=>{closed=true;clearInterval(timer);clearInterval(refreshTimer);confirm.value='';session.close();dialog.remove();},{once:true});
      render();document.body.append(dialog);dialog.showModal();
      timer=setInterval(()=>{try{session.check();}catch{dialog.close();}},500);
      refreshTimer=setInterval(refreshDevices,5000);
    }catch(error){clearInterval(timer);clearInterval(refreshTimer);session.close();dialog?.remove();throw error;}
  }
  function bind(scope,options) {
    if(!options.dataLayer.cryptoDeviceManagementAvailable)return;
    for(const security of scope.querySelectorAll('[data-chat-security]')) {
      if(security.dataset.devicesBound)continue;security.dataset.devicesBound='true';
      const button=document.createElement('button');button.type='button';button.className='chat-security-control';button.dataset.chatDevices='';button.hidden=true;
      const title=(options.translate||((k,f)=>f))('chat.devices','Encryption devices');button.title=title;button.setAttribute('aria-label',title);
      const icon=document.createElement('img');icon.src='/icons/navigation/monitor-smartphone.svg';icon.width=icon.height=16;icon.alt='';button.append(icon);security.after(button);
      options.dataLayer.cryptoDeviceManagementAvailable().then(v=>button.hidden=!v).catch(()=>{});
      button.onclick=async()=>{button.disabled=true;try{await open(options);}catch{button.title=(options.translate||((k,f)=>f))('chat.deviceActionFailed','Device action failed');}finally{button.disabled=false;}};
    }
  }
  globalThis.WingaDeviceManagementUi={createManagementSession,bind,open};
})();
