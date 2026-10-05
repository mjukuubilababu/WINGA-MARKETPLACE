(() => {
  async function playable(blob) {
    const mime=blob.type.split(';')[0],head=new Uint8Array(await blob.slice(0,16).arrayBuffer());
    const matches=(offset,bytes)=>bytes.every((v,i)=>head[offset+i]===v);
    const webm=matches(0,[26,69,223,163]),mp4=matches(4,[102,116,121,112]),ogg=matches(0,[79,103,103,83]);
    if((mime==='video/webm'&&webm)||(mime==='video/mp4'&&mp4))return 'video';
    if((mime==='audio/webm'&&webm)||(mime==='audio/mp4'&&mp4)||(mime==='audio/ogg'&&ogg)
      ||(mime==='audio/wav'&&matches(0,[82,73,70,70])&&matches(8,[87,65,86,69]))
      ||(mime==='audio/mpeg'&&(matches(0,[73,68,51])||(head[0]===255&&(head[1]&224)===224))))return 'audio';
    return null;
  }
  async function open({kind,peer,dataLayer,translate=(k,f)=>f,refresh=()=>{},current=()=>true,sessionCurrent=current,capture=false}) {
    if(!current())return;
    const t=translate,d=document.createElement('dialog');d.className='chat-security-dialog chat-rich-dialog chat-recording-dialog';
    const heading=document.createElement('h3');heading.textContent=kind==='voice'?t('chat.richVoice','Voice'):kind==='video'?t('chat.richVideo','Video'):kind==='image'?t('chat.richPhoto','Photo'):t('chat.mediaAttach','Attach encrypted file');
    const preview=document.createElement('div');preview.className='chat-recording-preview';
    const status=document.createElement('p');status.setAttribute('role','status');
    const progress=document.createElement('progress');progress.hidden=true;progress.setAttribute('aria-label',t('chat.richUploading','Uploading encrypted attachment'));
    const caption=document.createElement('textarea');caption.rows=2;caption.maxLength=4096;caption.placeholder=t('chat.mediaCaption','Caption');caption.setAttribute('aria-label',caption.placeholder);
    const input=document.createElement('input');input.type='file';input.hidden=true;
    if(kind==='image'){input.accept='image/png,image/jpeg,image/webp,image/gif';if(capture)input.setAttribute('capture','environment');}
    if(kind==='video')input.accept='video/mp4,video/webm';
    const actions=document.createElement('div');actions.className='chat-rich-actions';
    const make=(key,label,iconName,handler)=>{const b=document.createElement('button');b.type='button';b.className='chat-rich-action';
      b.title=t(key,label);b.setAttribute('aria-label',b.title);const icon=document.createElement('img');icon.src='/icons/navigation/'+iconName+'.svg';icon.width=icon.height=20;icon.alt='';
      const text=document.createElement('span');text.textContent=b.title;b.append(icon,text);b.onclick=handler;actions.append(b);return b;};
    d.append(heading,preview,caption,status,progress,input,actions);
    let recorder,stream,url,source,busy=false,staged=false,discarded=false,started=0,clock,limit,timer,draftId,sendStarted=false;
    function stopTracks(){stream?.getTracks().forEach(track=>track.stop());stream=null;clearInterval(clock);clearTimeout(limit);}
    async function show(blob,name) {
      if(url)URL.revokeObjectURL(url);url=null;preview.replaceChildren();
      const label=document.createElement('p');label.textContent=name;preview.append(label);
      const playerType=await playable(blob);let imageSafe=false,bitmap;
      if(['image/png','image/jpeg','image/webp','image/gif'].includes(blob.type)) {
        try{bitmap=await createImageBitmap(blob);imageSafe=bitmap.width*bitmap.height<=16*1024*1024;}catch{}
        finally{bitmap?.close();}
      }
      if(!current()||!d.isConnected)return;
      if(playerType) {
        url=URL.createObjectURL(blob);
        const player=document.createElement(playerType);
        player.controls=true;player.preload='metadata';player.src=url;player.className='chat-decrypted-player';preview.append(player);
      }else if(imageSafe) {
        url=URL.createObjectURL(blob);
        const image=document.createElement('img');image.src=url;image.alt=name;image.className='chat-decrypted-preview';preview.append(image);
      }
    }
    async function stage(file) {
      source=file;send.disabled=true;busy=true;progress.hidden=false;status.textContent=t('chat.richSaving','Saving encrypted draft...');
      try {
        const draft=await dataLayer.stageEncryptedMediaDraft(peer,file,kind);draftId=draft.id;staged=true;
        if(current()&&d.isConnected){await show(file,file.name);if(current()&&d.isConnected){send.disabled=false;status.textContent=t('chat.richDraftSaved','Encrypted draft saved on this device.');}}
      }catch{if(d.isConnected){status.textContent=t('chat.mediaFailed','Encrypted file operation failed');send.disabled=false;}}
      finally{busy=false;progress.hidden=true;}
    }
    const choose=make('chat.richChoose','Choose file','paperclip',()=>input.click());
    let record;
    if(kind==='voice') {
      choose.hidden=true;
      record=make('chat.richRecord','Record','mic',async()=>{
        if(busy||!current())return;
        if(recorder?.state==='recording'){recorder.stop();stopTracks();return;}
        if(staged){status.textContent=t('chat.richDraftSaved','Encrypted draft saved on this device.');return;}
        record.disabled=true;
        try {
          const acquired=await navigator.mediaDevices.getUserMedia({audio:true});
          if(!current()||!d.isConnected){acquired.getTracks().forEach(track=>track.stop());return;}
          stream=acquired;
          const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(value=>MediaRecorder.isTypeSupported(value));
          if(!mime)throw new Error('voice_recording_unsupported'); // i18n-gate: allow -- translated microphone failure below
          recorder=new MediaRecorder(stream,{mimeType:mime});const chunks=[];let bytes=0;
          recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);bytes+=event.data.size;if(bytes>WingaEncryptedMedia.MAX_FILE_BYTES&&recorder.state==='recording')recorder.stop();}};
          recorder.onstop=async()=>{
            stopTracks();record.disabled=false;record.title=t('chat.richRecord','Record');record.setAttribute('aria-label',record.title);record.querySelector('span').textContent=record.title;
            if(discarded||!sessionCurrent())return;
            const blob=new Blob(chunks,{type:mime.split(';')[0]});
            if(!blob.size||blob.size>WingaEncryptedMedia.MAX_FILE_BYTES){status.textContent=t('chat.mediaLimit','The encrypted file limit is 2 MiB.');return;}
            const file=new File([blob],'voice-'+Date.now()+'.'+(mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm'),{type:blob.type});
            await stage(file);
          };
          recorder.onerror=()=>{stopTracks();record.disabled=false;status.textContent=t('chat.mediaFailed','Encrypted file operation failed');};
          recorder.start(1000);started=Date.now();
          clock=setInterval(()=>{if(d.isConnected)status.textContent=t('chat.richRecording','Recording')+' '+Math.floor((Date.now()-started)/1000)+'s';},250);
          limit=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();stopTracks();},120000);
          record.title=t('chat.richStop','Stop recording');record.setAttribute('aria-label',record.title);record.querySelector('span').textContent=record.title;
          send.disabled=true;
        }catch{stopTracks();status.textContent=t('chat.richMicrophoneFailed','Microphone unavailable. Check permission and try again.');}
        finally{record.disabled=false;}
      });
    }
    const send=make('chat.mediaSend','Send encrypted file','send',async()=>{
      if(busy||!current()||recorder?.state==='recording')return;
      busy=true;send.disabled=true;progress.hidden=false;status.textContent=t('chat.richUploading','Uploading encrypted attachment');
      let accepted=false;
      try {
        if(!staged&&source){const draft=await dataLayer.stageEncryptedMediaDraft(peer,source,kind);draftId=draft.id;staged=true;}
        if(sendStarted) {
          const result=await dataLayer.retryPendingMessage(draftId);if(!result)throw new Error('private_media_retry_required'); // i18n-gate: allow -- translated operation failure below
        }else {
          sendStarted=true;caption.disabled=true;await dataLayer.sendEncryptedMediaDraft(peer,caption.value);
        }
        accepted=true;
        await refresh();
      }catch{if(d.isConnected)status.textContent=t('chat.mediaFailed','Encrypted file operation failed');}
      finally{busy=false;progress.hidden=true;send.disabled=false;if(accepted)d.close();}
    });send.disabled=true;
    make('common.cancel','Cancel','x',async()=>{
      if(busy)return;discarded=true;
      if(recorder?.state==='recording')recorder.stop();stopTracks();
      try {if(staged&&!sendStarted)await dataLayer.discardEncryptedMediaDraft(peer);d.close();}
      catch{status.textContent=t('chat.mediaFailed','Encrypted file operation failed');}
    });
    input.onchange=async()=>{
      const file=input.files[0];input.value='';if(!file||busy||!current())return;
      if(file.size>WingaEncryptedMedia.MAX_FILE_BYTES){status.textContent=t('chat.mediaLimit','The encrypted file limit is 2 MiB.');return;}
      if(kind==='video'&&await playable(file)!=='video'){status.textContent=t('chat.richInvalid','Check the selected item and try again.');return;}
      if(kind==='image') {
        if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){status.textContent=t('chat.richInvalid','Check the selected item and try again.');return;}
        let bitmap;
        try {bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>16*1024*1024)throw new Error('media_preview_too_large');} // i18n-gate: allow -- translated validation failure below
        catch{status.textContent=t('chat.richInvalid','Check the selected item and try again.');return;}
        finally{bitmap?.close();}
      }
      if(!current()||!d.isConnected)return;
      choose.disabled=true;await stage(file);
    };
    d.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    d.addEventListener('close',()=>{
      clearInterval(timer);if(recorder?.state==='recording')recorder.stop();stopTracks();
      preview.querySelectorAll('audio,video').forEach(player=>{player.pause();player.removeAttribute('src');player.load();});
      if(url)URL.revokeObjectURL(url);d.remove();
    },{once:true});
    document.body.append(d);d.showModal();
    timer=setInterval(()=>{if(!current()||document.visibilityState!=='visible')d.close();},250);
    try {
      const saved=await dataLayer.readEncryptedMediaDraft(peer);
      if(!current()||!d.isConnected)return;
      if(saved){saved.checkSession();draftId=saved.id;staged=true;await show(saved.blob,saved.name);saved.checkSession();if(!current()||!d.isConnected)return;send.disabled=false;choose.disabled=true;status.textContent=t('chat.richDraftSaved','Encrypted draft saved on this device.');}
      else if(kind!=='voice')input.click();
    }catch{if(d.isConnected)status.textContent=t('chat.mediaFailed','Encrypted file operation failed');}
  }
  globalThis.WingaVoiceUi={open,playable};
})();
