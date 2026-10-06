(() => {
  const CONSENT='share-selected-message-evidence-v1';
  const FILE_CONSENT='share-selected-file-copies-v1',MAX_FILE_BYTES=2*1024*1024;
  const encode=bytes=>{
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  };
  const decode=value=>{
    if(typeof value!=='string'||value.length>Math.ceil((MAX_FILE_BYTES+4136)/3)*4||!/^[-A-Za-z0-9_]+$/.test(value))throw Error('report_file_invalid');
    const bytes=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    if(encode(bytes)!==value)throw Error('report_file_invalid');return bytes;
  };
  const key=session=>JSON.stringify([session?.username,session?.sessionId,session?.token,session?.role]);
  const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
  function selectedCandidates(messages,owner,peer,t) {
    return messages.filter(item=>item&&item.status!=='pending'&&!item.eventRecord
      &&((item.senderId===owner&&item.receiverId===peer)||(item.senderId===peer&&item.receiverId===owner)))
      .map(item=>{
        const rich=item.richContent||globalThis.WingaRichContent?.parse(item.message);
        if(globalThis.WingaRichContent?.event(rich))return null;
        let kind='text',text=rich?.text||item.message||'';
        if(item.attachmentId){kind='media';text=t('chat.reportMediaLabel','Encrypted attachment (file not shared)');}
        else if(rich&&rich.type!=='text'){kind='card';text=t('chat.reportCardLabel','Shared card')+(rich.text?': '+rich.text:'');}
        if(typeof text!=='string'||!text.trim()||text.length>4096||text.startsWith('WINGA-MEDIA/')||text.startsWith('WINGA-CONTENT/'))return null;
        return {id:item.id,kind,text};
      }).filter(Boolean).slice(-50);
  }
  function shell(scope,options,title,peer) {
    const initial=options.getSession(),identity=key(initial);
    if(!initial?.username||!initial.sessionId||!scope.isConnected||document.visibilityState!=='visible')return null;
    const dialog=node('dialog');dialog.className='chat-security-dialog chat-report-dialog';
    const active=()=>dialog.isConnected&&scope.isConnected&&document.visibilityState==='visible'
      &&key(options.getSession())===identity&&(!peer||options.getPeer()===peer);
    dialog.append(node('h3',title));
    const timer=setInterval(()=>{if(!active())dialog.close();},250);
    const hidden=()=>{if(!active())dialog.close();};document.addEventListener('visibilitychange',hidden);
    dialog.addEventListener('close',()=>{clearInterval(timer);document.removeEventListener('visibilitychange',hidden);dialog.replaceChildren();dialog.remove();},{once:true});
    document.body.append(dialog);dialog.showModal();
    return {dialog,active,initial};
  }
  function open(scope,options,selectedId='') {
    const t=options.translate||((k,f)=>f),peer=options.getPeer(),session=options.getSession();
    const loaded=options.getMessages(),candidates=selectedCandidates(loaded,session?.username,peer,t);
    const incoming=new Set(loaded.filter(item=>item?.senderId===peer&&item.receiverId===session?.username).map(item=>item.id));
    const view=shell(scope,options,t('chat.reportMessages','Report messages'),peer);if(!view)return;
    const {dialog,active,initial}=view;
    const canShareFiles=typeof options.dataLayer.downloadEncryptedMedia==='function'&&typeof options.dataLayer.uploadReportFile==='function'
      &&typeof globalThis.WingaSecureContent?.loadSecureContent==='function';
    dialog.append(node('p',canShareFiles?t('chat.reportFilesDisclosure','Only selected evidence is shared with Winga moderation. Select Share file separately to disclose a new encrypted copy and its copy key. Original chat keys, recovery keys and other messages are not shared. Copies are retained while the case is open; deletion after closure is not yet defined.')
      :t('chat.reportDisclosure','Only selected message text, message IDs, participants, timestamps and your report details will be shared with Winga moderation. Files, encryption keys, recovery keys and other messages are not shared.')));
    const subjectLabel=node('label',t('chat.reportSubject','Report about')),subjectType=node('select');
    for(const value of ['conversation','user','message','media']) {
      const option=node('option',t('chat.reportSubject.'+value,value));option.value=value;subjectType.append(option);
    }
    subjectLabel.append(subjectType);dialog.append(subjectLabel);
    const subjectId=node('select');subjectId.setAttribute('aria-label',t('chat.reportSubjectMessage','Selected message'));subjectId.hidden=true;dialog.append(subjectId);
    const selection=node('div');selection.className='chat-report-selection';dialog.append(selection);
    const choices=candidates.map(item=>{
      const label=node('label'),input=node('input');input.type='checkbox';input.checked=item.id===selectedId;input.dataset.reportMessage=item.id;
      const preview=node('span',item.text);label.append(input,preview);selection.append(label);
      let fileInput=null;
      if(canShareFiles&&item.kind==='media'&&incoming.has(item.id)) {
        const fileLabel=node('label');fileInput=node('input');fileInput.type='checkbox';fileInput.dataset.reportFile=item.id;
        fileLabel.append(fileInput,node('span',t('chat.reportShareFile','Share file copy (up to 2 MB)')));selection.append(fileLabel);
      }
      return {input,item,fileInput,preview};
    });
    if(!choices.length)selection.append(node('p',t('chat.reportNoMessages','No reportable messages in this loaded history.')));
    const reasonLabel=node('label',t('chat.reportReason','Reason')),reason=node('select');
    for(const value of ['spam','fraud','harassment','unsafe','other']){const option=node('option',t('chat.reportReason.'+value,value));option.value=value;reason.append(option);}
    reasonLabel.append(reason);dialog.append(reasonLabel);
    const detailsLabel=node('label',t('chat.reportDetails','Details (optional)')),details=node('textarea');details.maxLength=500;details.rows=3;detailsLabel.append(details);dialog.append(detailsLabel);
    const consentLabel=node('label'),consent=node('input');consent.type='checkbox';consent.dataset.reportConsent='';
    consentLabel.append(consent,node('span',t('chat.reportConsent','I agree to share only this selected evidence.')));dialog.append(consentLabel);
    const status=node('p');status.setAttribute('role','status');dialog.append(status);
    const actions=node('div');actions.className='chat-security-actions';
    const submit=node('button',t('chat.reportSubmit','Submit report')),close=node('button',t('common.close','Close'));
    for(const control of [submit,close]){control.type='button';control.className='action-btn';actions.append(control);}dialog.append(actions);
    let busy=false,sent=false,requestId=crypto.randomUUID(),previous='',submittedId='';
    const copies=new Map();
    const update=()=>{
      const count=choices.filter(choice=>choice.input.checked).length;
      const prior=subjectId.value;subjectId.replaceChildren();
      const targeted=['message','media'].includes(subjectType.value);subjectId.hidden=!targeted;
      if(targeted)for(const choice of choices)if(choice.input.checked&&incoming.has(choice.item.id)
        &&(subjectType.value!=='media'||choice.item.kind==='media')) {
        const option=node('option',choice.item.text.slice(0,80));option.value=choice.item.id;subjectId.append(option);
      }
      if([...subjectId.options].some(option=>option.value===prior))subjectId.value=prior;
      submit.disabled=busy||sent||!consent.checked||count<1||count>10
        ||targeted&&!subjectId.value
        ||!choices.some(choice=>choice.input.checked&&incoming.has(choice.item.id));
      const locked=busy||sent||Boolean(submittedId);
      const fileCount=choices.filter(choice=>choice.fileInput?.checked).length;
      for(const choice of choices) {
        choice.input.disabled=locked||count>=10&&!choice.input.checked;
        if(choice.fileInput) {
          if(!choice.input.checked)choice.fileInput.checked=false;
          choice.fileInput.disabled=locked||!choice.input.checked||fileCount>=3&&!choice.fileInput.checked;
          choice.preview.textContent=choice.fileInput.checked?t('chat.reportSelectedFile','File copy selected for sharing'):choice.item.text;
        }
      }
      consent.disabled=locked;reason.disabled=locked;details.disabled=locked;
      subjectType.disabled=locked;subjectId.disabled=locked;
    };
    for(const choice of choices){choice.input.onchange=update;if(choice.fileInput)choice.fileInput.onchange=update;}
    consent.onchange=update;subjectType.onchange=update;update();
    close.onclick=()=>dialog.close();
    submit.onclick=async()=>{
      if(submit.disabled||!active())return;
      const selection=choices.filter(choice=>choice.input.checked).map(choice=>({...choice.item,
        ...(choice.fileInput?.checked?{text:t('chat.reportSelectedFile','File copy selected for sharing')}:{})}));
      const fileChoices=choices.filter(choice=>choice.input.checked&&choice.fileInput?.checked);
      const subject={type:subjectType.value,id:['user','conversation'].includes(subjectType.value)?peer:subjectId.value};
      const intent=JSON.stringify([reason.value,details.value,selection,subject,fileChoices.map(c=>c.item.id)]);
      if(previous&&previous!==intent){requestId=crypto.randomUUID();copies.clear();}previous=intent;
      const payload={owner:initial.username,sessionId:initial.sessionId,peer,requestId,consent:CONSENT,
        reason:reason.value,description:details.value,selection,subject};
      busy=true;update();
      try {
        for(const choice of fileChoices)if(!copies.has(choice.item.id)) {
          const attachment=loaded.find(item=>item.id===choice.item.id)?.attachmentId;
          if(!attachment||!active())throw Error('report_file_unavailable');
          const source=await options.dataLayer.downloadEncryptedMedia(attachment);
          if(!active())return;source.checkSession?.();
          if(!(source.blob instanceof Blob)||source.blob.size>MAX_FILE_BYTES)throw Error('report_file_unavailable');
          const codec=await globalThis.WingaSecureContent.loadSecureContent();if(!active())return;
          const fileId=crypto.randomUUID(),binding={conversationId:'report-evidence-v1:'+requestId,attachmentId:fileId};
          const copy=await codec.encryptMedia(source.blob,binding,{name:String(source.name||'file').slice(0,255),mime:source.blob.type||'application/octet-stream'});
          if(!active())return;source.checkSession?.();
          const bytes=new Uint8Array(await copy.ciphertext.arrayBuffer());
          try {
            const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
            if(!active())return;
            copies.set(choice.item.id,{metadata:{id:fileId,messageId:choice.item.id,bytes:bytes.length,
              sha256:Array.from(digest,b=>b.toString(16).padStart(2,'0')).join(''),descriptor:copy.descriptor},ciphertext:encode(bytes)});
          }finally{bytes.fill(0);}
        }
        if(fileChoices.length){payload.fileConsent=FILE_CONSENT;payload.files=fileChoices.map(c=>copies.get(c.item.id).metadata);}
        if(new TextEncoder().encode(JSON.stringify(payload)).length>65536)throw Error('report_too_large');
        const result=submittedId?{ok:true,id:submittedId}:await options.dataLayer.createConversationReport(payload);
        if(!active())return;
        if(result?.ok!==true||typeof result.id!=='string')throw Error('report_unavailable');
        submittedId=result.id;
        for(const choice of fileChoices) {
          const copy=copies.get(choice.item.id);
          if(!active())return;
          const uploaded=await options.dataLayer.uploadReportFile({owner:initial.username,sessionId:initial.sessionId,
            reportId:submittedId,fileId:copy.metadata.id,ciphertext:copy.ciphertext});
          if(!active())return;
          if(uploaded?.ok!==true||uploaded.id!==copy.metadata.id)throw Error('report_file_unavailable');
        }
        copies.clear();
        sent=true;status.textContent=t('chat.reportSent','Report received. Only the selected evidence was shared.');
      }catch{if(active())status.textContent=submittedId?t('chat.reportFilesPending','Report received, but some file copies are not uploaded. Retry to finish this same report.')
        :t('chat.reportFailed','Unable to submit the report. Your selection is unchanged; try again.');}
      finally{busy=false;if(active())update();}
    };
    dialog.addEventListener('close',()=>{candidates.splice(0);choices.splice(0);incoming.clear();copies.clear();previous='';submittedId='';},{once:true});
  }
  function bind(scope,options) {
    if(typeof options.dataLayer?.createConversationReport!=='function')return;
    for(const button of scope.querySelectorAll('[data-chat-report],[data-message-report]')){
      if(button.dataset.reportBound)continue;button.dataset.reportBound='true';button.hidden=false;
      button.onclick=()=>open(scope,options,button.dataset.messageReport||'');
    }
  }
  function review(scope,options,reportId) {
    const t=options.translate||((k,f)=>f);
    const view=shell(scope,options,t('chat.reportReviewTitle','Shared report evidence'));if(!view)return;
    const {dialog,active,initial}=view;
    dialog.append(node('p',t('chat.reportFilesReviewNotice','This is user-disclosed evidence, not cryptographic proof of the original message. File copies open only when you request them; original chat keys are not disclosed.')));
    const label=node('label',t('chat.reportReviewReason','Reason for opening this evidence')),reason=node('textarea');reason.maxLength=300;reason.rows=2;label.append(reason);dialog.append(label);
    const status=node('p');status.setAttribute('role','status');dialog.append(status);
    const content=node('div');content.className='chat-report-selection';dialog.append(content);
    const actions=node('div');actions.className='chat-security-actions';
    const load=node('button',t('chat.reportViewEvidence','View shared evidence')),close=node('button',t('common.close','Close'));
    for(const button of [load,close]){button.type='button';button.className='action-btn';actions.append(button);}dialog.append(actions);
    load.disabled=true;reason.oninput=()=>load.disabled=reason.value.trim().length<3;close.onclick=()=>dialog.close();
    load.onclick=async()=>{
      if(load.disabled||!active())return;load.disabled=true;reason.disabled=true;content.replaceChildren();status.textContent='';
      try {
        const result=await options.dataLayer.readSharedReportEvidence({owner:initial.username,sessionId:initial.sessionId,reportId,reason:reason.value.trim()});
        if(!active())return;
        if(result?.id!==reportId||result.plaintextVerified!==false||typeof result.filesShared!=='boolean'
          ||result.filesShared&&(!Array.isArray(result.files)||result.files.length>3)
          ||!result.filesShared&&result.files!==undefined
          ||!Array.isArray(result.selection)||result.selection.length>10)throw Error('report_unavailable');
        content.replaceChildren();
        if(result.subject&&['user','conversation','message','media'].includes(result.subject.type))
          content.append(node('strong',t('chat.reportSubject.'+result.subject.type,result.subject.type)));
        for(const item of result.selection){
          if(typeof item.text!=='string'||item.text.length>4096||typeof item.sender!=='string')throw Error('report_unavailable');
          const article=node('article');article.append(node('strong',item.sender),node('p',item.text));content.append(article);
        }
        for(const file of result.files||[]) {
          if(typeof file.id!=='string'||!Number.isSafeInteger(file.bytes)||file.bytes>MAX_FILE_BYTES+4136)throw Error('report_unavailable');
          const button=node('button',t('chat.reportDownloadFile','Download shared file copy'));button.type='button';button.className='action-btn';
          button.disabled=!file.available||typeof options.dataLayer.readSharedReportFile!=='function';content.append(button);
          button.onclick=async()=>{
            if(!active()||reason.value.trim().length<3)return;button.disabled=true;
            let bytes,url;
            try {
              const response=await options.dataLayer.readSharedReportFile({owner:initial.username,sessionId:initial.sessionId,reportId,fileId:file.id,reason:reason.value.trim()});
              if(!active())return;if(response?.ok!==true||response.id!==file.id)throw Error('report_file_unavailable');
              bytes=decode(response.ciphertext);if(bytes.length!==file.bytes)throw Error('report_file_unavailable');
              const codec=await globalThis.WingaSecureContent.loadSecureContent();if(!active())return;
              if(!/^report-evidence-v1:[0-9a-f-]{36}$/.test(response.descriptor?.conversationId))throw Error('report_file_unavailable');
              const value=await codec.decryptMedia(new Blob([bytes]),response.descriptor,
                {conversationId:response.descriptor.conversationId,attachmentId:file.id});
              if(!active())return;if(value.blob.size>MAX_FILE_BYTES)throw Error('report_file_unavailable');
              url=URL.createObjectURL(new Blob([value.blob],{type:'application/octet-stream'}));
              const link=node('a');link.href=url;link.download='winga-report-evidence.bin';link.click();
            }catch{if(active())status.textContent=t('chat.reportEvidenceFailed','Shared evidence is unavailable. Try again.');}
            finally{bytes?.fill(0);if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);if(active())button.disabled=false;}
          };
        }
      }catch{if(active()){content.replaceChildren();status.textContent=t('chat.reportEvidenceFailed','Shared evidence is unavailable. Try again.');}}
      finally{if(active()){reason.disabled=false;load.disabled=reason.value.trim().length<3;}}
    };
  }
  globalThis.WingaConversationReports={selectedCandidates,bind,open,review};
})();
