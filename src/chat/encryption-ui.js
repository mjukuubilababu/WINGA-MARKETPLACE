(() => {
  function bind(scope,{dataLayer,translate=(key,fallback)=>fallback,refresh=()=>{},onEncrypted=()=>{}}) {
    const t=translate;
    globalThis.WingaDeviceManagementUi?.bind(scope,{dataLayer,translate,refresh});
    globalThis.WingaRecoveryUi?.bind(scope,{dataLayer,translate,refresh});
    globalThis.WingaEncryptedMediaUi?.bindDownloads(scope,{dataLayer,translate});
    for(const button of scope.querySelectorAll('[data-chat-security]')) {
      if(button.dataset.securityBound)continue;button.dataset.securityBound='true';
      const peer=button.dataset.chatSecurity;
      const update=async()=>{
        try {
          const info=await dataLayer.inspectEncryptedConversation(peer);
          button.hidden=info.status==='disabled';button.dataset.securityStatus=info.status;
          button.title=info.status==='active'?t('chat.encrypted','End-to-end encrypted'):t('chat.security','Chat security');
          button.setAttribute('aria-label',button.title);
          if(info.status==='active' && info.mediaEnabled)globalThis.WingaEncryptedMediaUi?.bind(scope,{peer,dataLayer,translate,refresh});
          if(['active','reserved','pending','blocked','recovery-required','rejoin-required','replacement-reserved','replacement-pending','replacement-recovery-required'].includes(info.status)) {
            onEncrypted();scope.querySelectorAll('[data-chat-select-product],[data-message-reply]').forEach(control=>{control.disabled=true;control.title=t('chat.encryptionTextOnly','Product cards and quoted replies are not available in encrypted chat yet.');control.classList.remove('selected');});
            scope.querySelectorAll('.context-chat-reply-bar').forEach(el=>el.remove());
          }
        }catch{button.hidden=false;button.dataset.securityStatus='unavailable';}
      };
      update();
      button.addEventListener('click',async()=>{
        if(button.disabled)return;button.disabled=true;
        let dialog;
        try {
          const info=await dataLayer.inspectEncryptedConversation(peer);
          dialog=document.createElement('dialog');dialog.className='chat-security-dialog';
          const title=document.createElement('h3');title.textContent=t('chat.security','Chat security');dialog.append(title);
          const state=document.createElement('p');state.setAttribute('role','status');
          const label=info.status==='active'?t('chat.encrypted','End-to-end encrypted'):
            info.status==='replacement-recovery-required'?t('chat.encryptionReplacementRecovery','Replacement cannot resume on this device. Use the original device with its saved chat keys. Recovering history alone does not restore chat keys.'):
            info.status==='rejoin-required'?t('chat.encryptionRejoinRequired','Ask your contact to replace your previous chat device, then verify their fingerprint here.'):
            info.status==='replacement-reserved'?t('chat.encryptionReplacementReserved','Device replacement reserved. Resume with the same verified device.'):
            info.status==='replacement-pending'?t('chat.encryptionReplacementPending','Waiting for the new device to verify and accept.'):
            info.status==='blocked'?t('chat.encryptionBlocked','Encrypted chat is blocked'):
            info.status==='recovery-required'?t('chat.encryptionRecovery','This device needs its encrypted conversation keys'):
            t('chat.encryptionVerify','Compare device fingerprints through a separate trusted channel before accepting.');
          state.textContent=label;dialog.append(state);
          const historyNote=document.createElement('p');historyNote.textContent=t('chat.encryptionNewMessages','Encryption applies to new messages. Earlier messages are unchanged.');dialog.append(historyNote);
          if(info.ownFingerprint) {
            const own=document.createElement('label');own.textContent=t('chat.ownFingerprint','Your device fingerprint');
            const value=document.createElement('code');value.className='chat-fingerprint';value.textContent=info.ownFingerprint;own.append(value);dialog.append(own);
          }
          const options=info.packages || [];
          if(info.canReplace || info.status==='rejoin-required' || info.status.startsWith('replacement-')) {
            const note=document.createElement('p');note.textContent=t('chat.encryptionReplacementNotice','The new device receives new messages only. Earlier history needs your recovery key.');dialog.append(note);
          }
          if(info.canResume) {
            const resume=document.createElement('button');resume.type='button';resume.className='action-btn';resume.textContent=t('chat.encryptionReplacementResume','Resume device replacement');
            resume.onclick=async()=>{resume.disabled=true;try {
              const result=await dataLayer.resumeEncryptedConversationReplacement(peer);state.textContent=result.status==='active'?t('chat.encrypted','End-to-end encrypted'):t('chat.encryptionReplacementPending','Waiting for the new device to verify and accept.');
              resume.remove();await refresh();await update();
            }catch{state.textContent=t('chat.encryptionFailed','Verification failed. No plaintext message was sent.');resume.disabled=false;}};
            dialog.append(resume);
          }
          if(options.length && (info.canReplace || !['active','blocked','recovery-required','rejoin-required','replacement-recovery-required'].includes(info.status))) {
            const form=document.createElement('form');
            const deviceLabel=document.createElement('label');deviceLabel.textContent=t('chat.peerDevice','Recipient device');
            const select=document.createElement('select');select.name='device';
            for(const p of options){const option=document.createElement('option');option.value=p.deviceId;option.textContent=p.fingerprint.slice(0,16);select.append(option);}
            deviceLabel.append(select);form.append(deviceLabel);
            const label=document.createElement('label');label.textContent=t('chat.expectedFingerprint','Fingerprint received from your contact');
            const input=document.createElement('input');input.name='fingerprint';input.required=true;input.pattern='[a-fA-F0-9 ]{64,95}';input.autocomplete='off';input.spellcheck=false;label.append(input);form.append(label);
            const submit=document.createElement('button');submit.type='submit';submit.className='action-btn';submit.textContent=info.canReplace?t('chat.encryptionReplaceDevice','Replace contact device'):t('chat.verifyAndAccept','Verify and accept');form.append(submit);
            form.addEventListener('submit',async event=>{
              event.preventDefault();submit.disabled=true;
              try {
                const command=info.canReplace?dataLayer.replaceEncryptedConversationDevice.bind(dataLayer):dataLayer.enableEncryptedConversation.bind(dataLayer);
                const result=await command(peer,select.value,input.value.replace(/\s/g,'').toLowerCase());
                state.textContent=result.status==='active'?t('chat.encrypted','End-to-end encrypted'):t('chat.encryptionPending','Waiting for your contact to verify and accept');
                form.remove();await refresh();await update();
              }catch(error){
                state.textContent=error.code==='encrypted_new_conversation_limit'
                  ?t('chat.newConversationLimit','New chat limit reached. Try again later.')
                  :t('chat.encryptionFailed','Verification failed. No plaintext message was sent.');submit.disabled=false;
              }
            });dialog.append(form);
          } else if(!options.length && !['active','blocked','recovery-required','rejoin-required','replacement-reserved','replacement-pending','replacement-recovery-required'].includes(info.status)) {
            state.textContent=t('chat.encryptionNoDevice','Your contact has no available encryption device yet.');
          }
          const close=document.createElement('button');close.type='button';close.className='action-btn action-btn-secondary';close.textContent=t('common.close','Close');close.onclick=()=>dialog.close();dialog.append(close);
          dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();inputFocus(dialog);
        }catch{dialog?.remove();button.title=t('chat.encryptionUnavailable','Chat encryption is unavailable');}
        finally{button.disabled=false;}
      });
    }
  }
  function inputFocus(dialog){dialog.querySelector('input')?.focus();}
  globalThis.WingaEncryptedChatUi={bind};
})();
