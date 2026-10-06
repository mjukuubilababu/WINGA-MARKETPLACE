(() => {
  const CONSENT='share-selected-message-evidence-v1';
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
    dialog.append(node('p',t('chat.reportDisclosure','Only selected message text, message IDs, participants, timestamps and your report details will be shared with Winga moderation. Files, encryption keys, recovery keys and other messages are not shared.')));
    const selection=node('div');selection.className='chat-report-selection';dialog.append(selection);
    const choices=candidates.map(item=>{
      const label=node('label'),input=node('input');input.type='checkbox';input.checked=item.id===selectedId;input.dataset.reportMessage=item.id;
      label.append(input,node('span',item.text));selection.append(label);return {input,item};
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
    let busy=false,sent=false,requestId=crypto.randomUUID(),previous='';
    const update=()=>{
      const count=choices.filter(choice=>choice.input.checked).length;
      submit.disabled=busy||sent||!consent.checked||count<1||count>10
        ||!choices.some(choice=>choice.input.checked&&incoming.has(choice.item.id));
      for(const choice of choices)choice.input.disabled=busy||sent||count>=10&&!choice.input.checked;
      consent.disabled=busy||sent;reason.disabled=busy||sent;details.disabled=busy||sent;
    };
    for(const choice of choices)choice.input.onchange=update;consent.onchange=update;update();
    close.onclick=()=>dialog.close();
    submit.onclick=async()=>{
      if(submit.disabled||!active())return;
      const selection=choices.filter(choice=>choice.input.checked).map(choice=>({...choice.item}));
      const intent=JSON.stringify([reason.value,details.value,selection]);
      if(previous&&previous!==intent)requestId=crypto.randomUUID();previous=intent;
      const payload={owner:initial.username,sessionId:initial.sessionId,peer,requestId,consent:CONSENT,
        reason:reason.value,description:details.value,selection};
      busy=true;update();
      try {
        if(new TextEncoder().encode(JSON.stringify(payload)).length>65536)throw Error('report_too_large');
        const result=await options.dataLayer.createConversationReport(payload);
        if(!active())return;
        if(result?.ok!==true||typeof result.id!=='string')throw Error('report_unavailable');
        sent=true;status.textContent=t('chat.reportSent','Report received. Only the selected evidence was shared.');
      }catch{if(active())status.textContent=t('chat.reportFailed','Unable to submit the report. Your selection is unchanged; try again.');}
      finally{busy=false;if(active())update();}
    };
    dialog.addEventListener('close',()=>{candidates.splice(0);choices.splice(0);incoming.clear();previous='';},{once:true});
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
    dialog.append(node('p',t('chat.reportClaimNotice','This is user-disclosed evidence. Message membership is checked, but disclosed plaintext is not cryptographically verified. Files are not shared.')));
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
        if(result?.id!==reportId||result.plaintextVerified!==false||result.filesShared!==false
          ||!Array.isArray(result.selection)||result.selection.length>10)throw Error('report_unavailable');
        content.replaceChildren();
        for(const item of result.selection){
          if(typeof item.text!=='string'||item.text.length>4096||typeof item.sender!=='string')throw Error('report_unavailable');
          const article=node('article');article.append(node('strong',item.sender),node('p',item.text));content.append(article);
        }
      }catch{if(active()){content.replaceChildren();status.textContent=t('chat.reportEvidenceFailed','Shared evidence is unavailable. Try again.');}}
      finally{if(active()){reason.disabled=false;load.disabled=reason.value.trim().length<3;}}
    };
  }
  globalThis.WingaConversationReports={selectedCandidates,bind,open,review};
})();
