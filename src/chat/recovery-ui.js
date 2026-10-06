(() => {
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  function validateKit(value,owner,allowKeyOnly=false) {
    if(!value || Object.keys(value).sort().join(',')!=='checkpoint,key,owner,purpose,version' || value.version!==1
      || value.purpose!=='winga-history-recovery' || value.owner!==owner || typeof value.key!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(value.key)
      || (!(allowKeyOnly && value.checkpoint===null) && (!value.checkpoint || Object.keys(value.checkpoint).sort().join(',')!=='hash,owner,revision,v'
      || value.checkpoint.v!==1 || value.checkpoint.owner!==owner || typeof value.checkpoint.revision!=='string' || !/^[1-9][0-9]{0,15}$/.test(value.checkpoint.revision)
      || !Number.isSafeInteger(Number(value.checkpoint.revision)) || typeof value.checkpoint.hash!=='string' || !/^[a-f0-9]{64}$/.test(value.checkpoint.hash))))fail('recovery_checkpoint_rejected');return value;
  }
  async function createRecoverySession({getSession,request}) {
    const initial={...getSession()},owner=initial.username;
    const current=()=>{const s=getSession();if(!owner || s?.username!==owner || s.token!==initial.token || s.sessionId!==initial.sessionId)fail('recovery_session_changed');};
    current();const vault=await WingaEncryptedVault.createEncryptedVault({owner,getSession});let codec;
    try{codec=await WingaSecureContent.loadSecureContent();current();}catch(error){vault.close();throw error;}
    const guarded=async(...args)=>{current();const result=await request(...args);current();return result;};
    const client=WingaRecoveryClient.createRecoveryClient({owner,getSession,vault,codec,request:guarded});
    let closed=false;const active=()=>{current();if(closed)fail('recovery_session_changed');};
    return {owner,
      check:active,
      generateKey(){active();return codec.generateRecoveryKey();},
      async state(){active();const s=getSession();return guarded('GET',undefined,{owner,deviceId:s.sessionId,token:s.token});},
      async backup(key,checkpoint,previousKey){active();const result=await client.backup(key,{checkpoint,previousKey});return {version:1,purpose:'winga-history-recovery',owner,key,checkpoint:result.checkpoint};},
      async restore(kit){active();validateKit(kit,owner);return client.restore(kit.key,{checkpoint:kit.checkpoint});},
      async archive(){active();return Object.values((await vault.historySnapshot()).values);},
      close(){closed=true;vault.close();}
    };
  }
  function saveKit(kit) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(kit,null,2)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='winga-history-recovery.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function projectArchive(history,owner) {
    const rows=history.filter(item=>item && typeof item.id==='string' && typeof item.message==='string');
    const rich=globalThis.WingaRichContent;
    if(!rich?.project && rows.some(item=>item.message.startsWith('WINGA-CONTENT/')))fail('recovery_projection_unavailable');
    return (rich?.project?rich.project(rows,owner):rows).filter(item=>!item.eventRecord);
  }
  async function open({dataLayer,translate=(k,f)=>f,refresh=()=>{}}) {
    const t=translate,session=await dataLayer.createEncryptedRecovery();let dialog,kit,key='',previousKey='',priorCheckpoint,busy=false;
    try {
      const remote=await session.state();session.check();if(document.visibilityState!=='visible')fail('recovery_session_changed');
      dialog=document.createElement('dialog');dialog.className='chat-security-dialog chat-recovery-dialog';
      const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
      const richLabels={product:t('chat.richProduct','Product'),reel:t('chat.richReel','Reel'),short:t('chat.richShort','Short'),
        collection:t('chat.richCollection','Collection'),order:t('chat.richOrder','Order'),payment:t('chat.richPayment','Payment reference'),
        delivery:t('chat.richDelivery','Delivery'),location:t('chat.richLocation','Location'),contact:t('chat.richContact','Contact')};
      dialog.append(node('h3',t('chat.recovery','Encrypted history recovery')));
      dialog.append(node('p',t('chat.recoveryNotice','Keep the recovery file outside Winga. Anyone with the file can read the backup. History is never silently truncated; an archive exceeding 100,000 records or 64 encrypted pages is rejected. Recovery does not restore live chat membership.')));
      const status=node('p','');status.setAttribute('role','status');dialog.append(status);
      const importLabel=node('label',t('chat.recoveryImport','Recovery file')),file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.dataset.recoveryFile='';importLabel.append(file);dialog.append(importLabel);
      const newKey=node('button',t('chat.recoveryCreate','Create recovery key'));newKey.type='button';newKey.className='action-btn action-btn-secondary';newKey.disabled=remote.revision!=='0';dialog.append(newKey);
      const rotate=node('button',t('chat.recoveryRotate','Replace recovery key'));rotate.type='button';rotate.className='action-btn action-btn-secondary';rotate.disabled=true;dialog.append(rotate);
      const keyLabel=node('label',t('chat.recoveryKey','Recovery key')),keyOutput=document.createElement('code');keyOutput.className='chat-fingerprint';keyLabel.append(keyOutput);keyLabel.hidden=true;dialog.append(keyLabel);
      const confirmLabel=node('label',t('chat.recoveryConfirm','Type the key again to confirm')),confirmation=document.createElement('input');confirmation.type='password';confirmation.autocomplete='off';confirmation.spellcheck=false;confirmation.dataset.recoveryConfirm='';confirmLabel.append(confirmation);confirmLabel.hidden=true;dialog.append(confirmLabel);
      const actions=document.createElement('div');actions.className='chat-security-actions';
      const backup=node('button',t('chat.recoveryBackup','Back up and export')),restore=node('button',t('chat.recoveryRestore','Restore history')),download=node('button',t('chat.recoveryDownload','Download recovery file'));
      for(const b of [backup,restore,download]){b.type='button';b.className='action-btn';actions.append(b);}backup.disabled=restore.disabled=true;download.hidden=true;dialog.append(actions);
      const savedLabel=node('label',t('chat.recoverySaved','I saved the latest recovery file outside Winga')),saved=document.createElement('input');saved.type='checkbox';saved.dataset.recoverySaved='';savedLabel.prepend(saved);savedLabel.hidden=true;dialog.append(savedLabel);
      const archive=document.createElement('div');archive.className='chat-recovery-archive';dialog.append(archive);
      const close=node('button',t('common.close','Close'));close.type='button';close.className='action-btn action-btn-secondary';dialog.append(close);
      let exported=false;
      const enabled=()=>{backup.disabled=busy || !key || confirmation.value!==key || !saved.checked;restore.disabled=busy || !kit?.checkpoint;rotate.disabled=busy || !kit?.checkpoint || confirmation.value!==key || !saved.checked || Boolean(previousKey);file.disabled=busy;newKey.disabled=busy || remote.revision!=='0' || Boolean(key);close.disabled=busy || (exported&&!saved.checked);};
      async function run(work) {
        if(busy)return;busy=true;enabled();status.textContent=t('chat.secureWorking','Working...');
        try {await work();}catch {status.textContent=t('chat.recoveryFailed','Recovery failed. Check the key and latest recovery file; no history was overwritten.');}
        finally {busy=false;file.disabled=false;newKey.disabled=remote.revision!=='0'||Boolean(kit);enabled();}
      }
      newKey.onclick=()=>{key=session.generateKey();kit={version:1,purpose:'winga-history-recovery',owner:session.owner,key,checkpoint:null};keyOutput.textContent=key;keyLabel.hidden=confirmLabel.hidden=false;confirmation.value='';download.hidden=false;savedLabel.hidden=false;saved.checked=false;exported=true;saveKit(kit);status.textContent=t('chat.recoveryExported','Save this latest recovery file before closing.');enabled();};
      rotate.onclick=()=>{if(rotate.disabled)return;session.check();previousKey=key;priorCheckpoint=kit.checkpoint;key=session.generateKey();kit={version:1,purpose:'winga-history-recovery',owner:session.owner,key,checkpoint:null};keyOutput.textContent=key;keyLabel.hidden=confirmLabel.hidden=false;confirmation.value='';download.hidden=false;savedLabel.hidden=false;saved.checked=false;exported=true;saveKit(kit);status.textContent=t('chat.recoveryExported','Save this latest recovery file before closing.');enabled();};
      confirmation.oninput=enabled;
      file.onchange=()=>run(async()=>{
        kit=null;key='';previousKey='';priorCheckpoint=undefined;confirmation.value='';keyOutput.textContent='';keyLabel.hidden=true;
        const selected=file.files[0];if(!selected || selected.size>16384)fail('recovery_checkpoint_rejected');
        const contents=await selected.text();session.check();if(!dialog.isConnected)fail('recovery_session_changed');
        kit=validateKit(JSON.parse(contents),session.owner,true);key=kit.key;keyOutput.textContent='';keyLabel.hidden=true;confirmLabel.hidden=false;confirmation.value='';saved.checked=true;exported=false;
        download.hidden=true;savedLabel.hidden=true;status.textContent=t('chat.recoveryLoaded','Recovery file loaded');
      });
      backup.onclick=()=>run(async()=>{
        if(!key || confirmation.value!==key)fail('recovery_checkpoint_rejected');
        const result=await session.backup(key,priorCheckpoint || kit?.checkpoint,previousKey || undefined);session.check();if(!dialog.isConnected)return;
        kit=result;previousKey='';priorCheckpoint=undefined;download.hidden=false;saved.checked=false;savedLabel.hidden=false;newKey.disabled=true;
        exported=true;saveKit(kit);status.textContent=t('chat.recoveryExported','Backup encrypted. Save this latest recovery file before closing.');
      });
      download.onclick=()=>{if(kit)saveKit(kit);};
      saved.onchange=()=>{if(saved.checked)status.textContent=t('chat.recoveryRetained','Latest recovery file retained');enabled();};
      restore.onclick=()=>run(async()=>{
        const result=await session.restore(kit);session.check();if(!dialog.isConnected)return;
        status.textContent=t('chat.recoveryRestored','History restored')+': '+result.restored;
        archive.replaceChildren();
        let projected;
        try{const history=await session.archive();session.check();if(!dialog.isConnected)return;projected=projectArchive(history,session.owner);}
        catch{session.check();if(!dialog.isConnected)return;archive.append(node('p',t('chat.recoveryPreviewUnavailable','History restored. Preview is unavailable; saved history is unchanged.')));return;}
        for(const item of projected.slice(-20)) {
          const a=globalThis.WingaEncryptedMedia?.attachment(item),rich=item.richContent;
          const unknown=!a&&!rich&&/^(WINGA-CONTENT|WINGA-MEDIA)\//.test(item.message);
          const label=rich?(rich.text||richLabels[rich.type]||t('chat.richUnavailable','This item is unavailable.'))
            :a?(a.text||a.attachment.name):unknown?t('chat.richUnavailable','This item is unavailable.'):item.message;
          const row=node('p',label);archive.append(row);
          if(item.edited)row.append(node('small',t('chat.richEdited','Edited')));
          if(a && item.id) {
            const controls=document.createElement('span');controls.className='chat-encrypted-attachment';row.append(controls);
            for(const [attribute,icon,label] of [['encryptedMediaPreview','eye',t('chat.mediaPreview','View encrypted attachment')],['encryptedMediaDownload','download',t('chat.mediaDownload','Download encrypted file')]]) {
              const control=node('button','');control.type='button';control.className='chat-encrypted-file chat-encrypted-download';control.dataset[attribute]=item.id;control.title=label;control.setAttribute('aria-label',label);
              const image=document.createElement('img');image.src=`/icons/navigation/${icon}.svg`;image.width=image.height=16;image.alt='';control.append(image);controls.append(control);
            }
          }
        }
        globalThis.WingaEncryptedMediaUi?.bindDownloads(archive,{dataLayer,translate});
        // A pending device can restore its archive without gaining live MLS membership.
        try{await refresh();}catch{}
      });
      const hidden=()=>{if(document.visibilityState!=='visible')dialog.close();};
      const sessionTimer=setInterval(()=>{try{session.check();}catch{dialog.close();}},500);
      document.addEventListener('visibilitychange',hidden);
      close.onclick=()=>dialog.close();dialog.addEventListener('cancel',event=>{if(busy || (exported&&!saved.checked))event.preventDefault();});
      dialog.addEventListener('close',()=>{clearInterval(sessionTimer);document.removeEventListener('visibilitychange',hidden);key='';previousKey='';priorCheckpoint=undefined;kit=null;keyOutput.textContent='';confirmation.value='';file.value='';session.close();dialog.remove();},{once:true});
      document.body.append(dialog);dialog.showModal();
    }catch(error){session.close();dialog?.remove();throw error;}
  }
  function bind(scope,options) {
    if(!options.dataLayer.encryptedRecoveryAvailable)return;
    for(const security of scope.querySelectorAll('[data-chat-security]')) {
      if(security.dataset.recoveryBound)continue;security.dataset.recoveryBound='true';
      const button=document.createElement('button');button.type='button';button.className='chat-security-control';button.dataset.chatRecovery='';button.hidden=true;
      const title=(options.translate||((k,f)=>f))('chat.recovery','Encrypted history recovery');button.title=title;button.setAttribute('aria-label',title);
      const icon=document.createElement('img');icon.src='/icons/navigation/key-round.svg';icon.width=icon.height=16;icon.alt='';button.append(icon);security.after(button);
      options.dataLayer.encryptedRecoveryAvailable().then(v=>button.hidden=!v).catch(()=>{});
      button.onclick=async()=>{button.disabled=true;try{await open(options);}catch{button.title=(options.translate||((k,f)=>f))('chat.recoveryFailed','Recovery unavailable');}finally{button.disabled=false;}};
    }
  }
  globalThis.WingaRecoveryUi={createRecoverySession,validateKit,projectArchive,bind,open};
})();
