(() => {
  function bindDownloads(scope,{dataLayer,translate=(k,f)=>f}) {
    for(const button of scope.querySelectorAll('[data-encrypted-media-download]')) {
      if(button.dataset.downloadBound)continue;button.dataset.downloadBound='true';
      button.onclick=async()=>{
        button.disabled=true;let url;
        try {
          const result=await dataLayer.downloadEncryptedMedia(button.dataset.encryptedMediaDownload);
          // Download only: never execute recovered HTML/SVG or open an untrusted URL.
          url=URL.createObjectURL(new Blob([result.blob],{type:'application/octet-stream'}));
          const link=document.createElement('a');link.href=url;link.download=result.name.replace(/[\\/<>:"|?*\x00-\x1f]/g,'_').slice(0,255)||'attachment';
          document.body.append(link);link.click();link.remove();
        }catch{button.title=translate('chat.mediaFailed','Encrypted file operation failed');}
        finally {button.disabled=false;if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);}
      };
    }
  }
  function bind(scope,{peer,dataLayer,translate=(k,f)=>f,refresh=()=>{}}) {
    bindDownloads(scope,{dataLayer,translate});
    const toolbar=scope.querySelector('.chat-compose-footer');if(!toolbar || toolbar.querySelector('[data-encrypted-media-upload]'))return;
    const t=translate,button=document.createElement('button'),input=document.createElement('input');button.type='button';button.className='chat-security-control';button.dataset.encryptedMediaUpload='';
    button.title=t('chat.mediaAttach','Attach encrypted file');button.setAttribute('aria-label',button.title);
    const icon=document.createElement('img');icon.src='/icons/navigation/paperclip.svg';icon.width=icon.height=18;icon.alt='';button.append(icon);
    input.type='file';input.hidden=true;toolbar.prepend(button,input);button.onclick=()=>input.click();
    input.onchange=()=>{
      const file=input.files[0];input.value='';if(!file)return;
      const dialog=document.createElement('dialog');dialog.className='chat-security-dialog';
      const heading=document.createElement('h3');heading.textContent=t('chat.mediaAttach','Attach encrypted file');dialog.append(heading);
      const name=document.createElement('p');name.className='chat-fingerprint';name.textContent=file.name;dialog.append(name);
      const label=document.createElement('label');label.textContent=t('chat.mediaCaption','Caption');const text=document.createElement('textarea');text.maxLength=4096;text.rows=3;label.append(text);dialog.append(label);
      const status=document.createElement('p');status.setAttribute('role','status');dialog.append(status);
      const send=document.createElement('button');send.type='button';send.className='action-btn';send.textContent=t('chat.mediaSend','Send encrypted file');dialog.append(send);
      const close=document.createElement('button');close.type='button';close.className='action-btn action-btn-secondary';close.textContent=t('common.cancel','Cancel');dialog.append(close);
      let busy=false;
      if(file.size>globalThis.WingaEncryptedMedia.MAX_FILE_BYTES){send.disabled=true;status.textContent=t('chat.mediaLimit','The encrypted file limit is 2 MiB.');}
      close.onclick=()=>dialog.close();dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('close',()=>{text.value='';dialog.remove();},{once:true});
      send.onclick=async()=>{
        if(busy)return;busy=true;send.disabled=close.disabled=true;status.textContent=t('chat.secureWorking','Working...');
        try {await dataLayer.sendEncryptedMedia(peer,file,text.value);await refresh();dialog.close();}
        catch {status.textContent=t('chat.mediaFailed','Encrypted file operation failed');}
        finally {busy=false;send.disabled=close.disabled=false;}
      };
      document.body.append(dialog);dialog.showModal();text.focus();
    };
  }
  globalThis.WingaEncryptedMediaUi={bind,bindDownloads};
})();
