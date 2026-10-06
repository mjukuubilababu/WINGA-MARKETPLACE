(() => {
  let state={key:'',peers:new Set(),ready:false,error:false},request=0;
  const sessionKey=session=>JSON.stringify([session?.username,session?.sessionId,session?.token]);
  function snapshot(session) {
    const key=sessionKey(session);
    if(state.key!==key){state={key,peers:new Set(),ready:false,error:false};request++;}
    return {...state,peers:new Set(state.peers)};
  }
  function filter(items,mode,session) {
    const saved=snapshot(session);
    return items.filter(item=>mode==='archived'?saved.peers.has(item.withUser):
      !saved.peers.has(item.withUser)&&(mode!=='unread'||item.unreadCount>0));
  }
  async function refresh({dataLayer,getSession}) {
    const session=getSession();snapshot(session);
    if(!session?.username||!session.sessionId||typeof dataLayer.pushRequest!=='function')return;
    const key=sessionKey(session),version=++request;
    try {
      const result=await dataLayer.pushRequest('archive/list',{owner:session.username,sessionId:session.sessionId},'POST');
      if(!Array.isArray(result?.peers)||result.peers.length>5000||result.peers.some(peer=>
        typeof peer!=='string'||!peer||peer.length>40||peer.trim()!==peer||/[\u0000-\u001f\u007f]/.test(peer)||peer===session.username)
        ||new Set(result.peers).size!==result.peers.length)throw Error('archive_unavailable');
      if(key!==sessionKey(getSession())||version!==request)return;
      const changed=!state.ready||state.error||state.peers.size!==result.peers.length
        ||result.peers.some(peer=>!state.peers.has(peer));
      state={key,peers:new Set(result.peers),ready:true,error:false};
      return changed;
    }catch{if(key===sessionKey(getSession())&&version===request){
      const changed=!state.error;state={...state,error:true};return changed;
    }}
  }
  function bind(scope,{dataLayer,getSession,getPeer,translate=(k,f)=>f,refresh:rerender=()=>{},onArchived=()=>{}}) {
    const initial=getSession();snapshot(initial);
    if(!initial?.username||!initial.sessionId||typeof dataLayer.pushRequest!=='function')return;
    const key=sessionKey(initial),t=translate;
    const current=peer=>scope.isConnected&&document.visibilityState==='visible'
      &&sessionKey(getSession())===key&&getPeer()===peer;
    const validate=value=>{
      if(typeof value?.revision!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(value.revision)
        ||typeof value.archived!=='boolean')throw Error('archive_unavailable');
      return value;
    };
    for(const button of scope.querySelectorAll('[data-chat-archive]')) {
      if(button.dataset.archiveBound)continue;button.dataset.archiveBound='true';button.hidden=false;
      const peer=button.dataset.chatArchive;
      const label=button.querySelector('span')||button;
      label.textContent=state.peers.has(peer)?t('chat.unarchive','Move to Inbox'):t('chat.archive','Archive');
      button.onclick=async()=>{
        if(button.disabled||!current(peer))return;button.disabled=true;
        const archived=!state.peers.has(peer);
        const payload={owner:initial.username,sessionId:initial.sessionId,peer};
        const status=scope.querySelector('[data-chat-archive-status]');
        if(status){status.textContent='';status.hidden=true;}
        try {
          const before=validate(await dataLayer.pushRequest('archive/state',payload,'POST'));if(!current(peer))return;
          const next=validate(await dataLayer.pushRequest('archive',{...payload,revision:before.revision,archived},'POST'));
          if(!current(peer))return;
          request++;if(next.archived)state.peers.add(peer);else state.peers.delete(peer);
          label.textContent=next.archived?t('chat.unarchive','Move to Inbox'):t('chat.archive','Archive');
          if(next.archived)onArchived();
          await rerender();
        }catch{if(current(peer)&&status){status.hidden=false;status.textContent=t('chat.archiveFailed','Unable to update archived chats. Try again.');}}
        finally{button.disabled=false;}
      };
    }
  }
  globalThis.WingaConversationArchive={snapshot,filter,refresh,bind};
})();
