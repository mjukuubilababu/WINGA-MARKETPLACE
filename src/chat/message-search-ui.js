(() => {
  const key=s=>JSON.stringify([s?.username,s?.sessionId,s?.token]);
  const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
  function open(scope,options) {
    const initial=options.getSession(),identity=key(initial),peer=options.getPeer();
    if(!initial?.username||!initial.sessionId||!peer||!scope.isConnected||document.visibilityState!=='visible'
      ||document.querySelector('.chat-message-search-dialog'))return;
    const t=options.translate||((k,f)=>f),dialog=node('dialog');
    dialog.className='chat-security-dialog chat-message-search-dialog';
    const current=()=>dialog.isConnected&&scope.isConnected&&options.getPeer()===peer
      &&key(options.getSession())===identity&&document.visibilityState==='visible';
    dialog.append(node('h3',t('chat.messageSearch','Search messages')));
    const form=node('form');form.className='chat-message-search-form';dialog.append(form);
    const field=(label,type,name)=>{
      const row=node('label',label),input=node('input');input.type=type;input.name=name;
      row.append(input);form.append(row);return input;
    };
    const query=field(t('chat.messageSearch','Search messages'),'search','query');
    query.maxLength=200;query.autocomplete='off';
    const senderLabel=node('label',t('chat.searchSender','Sender')),sender=node('select');
    for(const [value,label]of [['',t('chat.searchAnyone','Anyone')],[initial.username,t('chat.searchMe','Me')],[peer,peer]]) {
      const option=node('option',label);option.value=value;sender.append(option);
    }
    senderLabel.append(sender);form.append(senderLabel);
    const from=field(t('chat.searchFrom','From date (UTC)'),'date','from'),to=field(t('chat.searchTo','To date (UTC)'),'date','to');
    const status=node('p');status.setAttribute('role','status');dialog.append(status);
    const results=node('div');results.className='chat-message-search-results';dialog.append(results);
    const controls=node('div');controls.className='chat-security-actions';form.append(controls);
    const submit=node('button',t('chat.search','Search'));submit.type='submit';submit.className='action-btn';controls.append(submit);
    const close=node('button',t('common.close','Close'));close.type='button';close.className='action-btn';controls.append(close);
    let generation=0;
    const render=async()=>{
      if(!current())return;
      const request=++generation,filters={owner:initial.username,peer,query:query.value,
        sender:sender.value,from:from.value,to:to.value};
      submit.disabled=true;
      results.replaceChildren();
      try {
        const local=await options.getLocalMessages?.(peer);
        if(!current()||request!==generation)return;
        // The vault projection is authoritative, including messages hidden since the view loaded.
        const messages=new Map((options.getMessages()||[]).filter(item=>!Array.isArray(local)||!item.encrypted).map(item=>[item.id,item]));
        for(const item of local||[])messages.set(item.id,item);
        const ordered=[...messages.values()].sort((a,b)=>(Date.parse(a.timestamp)||0)-(Date.parse(b.timestamp)||0));
        const found=WingaMessageSearch.search(ordered,filters);
        status.textContent=found.truncated?t('chat.searchLimited','More results are outside this loaded view.')
          :found.items.length?'':t('chat.searchEmpty','No matching messages on this device.');
        for(const item of found.items) {
          const article=node('article');article.className='chat-message-search-result';
          const date=node('time');date.dateTime=item.timestamp;
          date.textContent=new Date(item.timestamp).toLocaleString(document.documentElement.lang||'sw');
          article.append(node('strong',item.sender),date,node('p',item.text||item.productName));results.append(article);
        }
      }catch{if(current()&&request===generation)status.textContent=t('chat.searchInvalid','Check the search filters.');}
      finally{if(current()&&request===generation)submit.disabled=false;}
    };
    form.onsubmit=e=>{e.preventDefault();render();};
    close.onclick=()=>dialog.close();
    const hidden=()=>{if(!current())dialog.close();};
    const timer=setInterval(hidden,250);document.addEventListener('visibilitychange',hidden);
    dialog.addEventListener('close',()=>{
      clearInterval(timer);document.removeEventListener('visibilitychange',hidden);
      query.value='';from.value='';to.value='';results.replaceChildren();dialog.replaceChildren();dialog.remove();
    },{once:true});
    document.body.append(dialog);dialog.showModal();query.focus();
  }
  function bind(scope,options) {
    for(const button of scope.querySelectorAll('[data-chat-message-search]')) {
      if(button.dataset.messageSearchBound)continue;
      button.dataset.messageSearchBound='true';button.hidden=false;button.onclick=()=>open(scope,options);
    }
  }
  globalThis.WingaMessageSearchUi={bind,open};
})();
