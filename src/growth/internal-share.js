(() => {
  function createInternalShare(deps) {
    const win=deps.window||window,t=(key,fallback)=>deps.translate?.(key,fallback)||fallback;
    let active=null;
    const el=(tag,text='')=>{const n=win.document.createElement(tag);n.textContent=text;return n;};
    async function open(productId,contentType='PRODUCT') {
      const contract=win.WingaModules.growth.contract;
      if(!contract.id(productId)||!['PRODUCT','REEL','SHORT','COLLECTION'].includes(contentType))return;
      if(contentType!=='PRODUCT'&&win.WINGA_CONFIG?.growthInternalContentSharing!==true)return;
      active?.close();
      const owner=deps.getAccount();
      if(!owner){deps.requireAuth(contentType==='PRODUCT'?{type:'share-to-winga',productId}:{type:'share-to-winga',contentId:productId,contentType});return;}
      const dialog=el('dialog');dialog.className='chat-security-dialog';
      const heading=el('h2',t('growth.shareToWinga','Share to Winga')),status=el('p',t('inbox.loading','Loading...')),list=el('div');
      status.setAttribute('role','status');dialog.append(heading,status,list);
      const close=el('button',t('common.close','Close'));close.type='button';close.onclick=()=>dialog.close();dialog.append(close);
      dialog.addEventListener('close',()=>{dialog.remove();if(active===dialog)active=null;},{once:true});
      win.document.body.append(dialog);dialog.showModal();active=dialog;
      const current=()=>dialog.isConnected&&active===dialog&&deps.getAccount()===owner;
      const timer=win.setInterval(()=>{if(!current())dialog.close();},250);
      dialog.addEventListener('close',()=>win.clearInterval(timer),{once:true});
      let busy=false;
      function choice(label,send) {
        const button=el('button',label);button.type='button';button.className='action-btn action-btn-secondary';
        const actionId=win.crypto.randomUUID();
        button.onclick=async()=>{
          if(!current()||busy)return;busy=true;
          for(const b of list.querySelectorAll('button'))b.disabled=true;
          status.textContent=t('chat.secureWorking','Working...');
          try {
            const product=contentType==='COLLECTION'?await deps.dataLayer.loadSharedCollection(productId):
              contentType==='PRODUCT'?await deps.dataLayer.loadSharedProduct(productId):await deps.dataLayer.readConversationReference(contentType.toLowerCase(),productId);
            if(!product||!current())throw new Error('growth_share_unavailable');
            if(contentType==='COLLECTION'&&(product.status!=='published'||product.visibility!=='public'||!product.items?.length))throw new Error('growth_share_unavailable');
            const result=await send(actionId);
            if(current()){status.textContent=result?.status==='pending'||result?.sendState==='queued'?t('growth.internalShareQueued','Queued for sending; delivery is not confirmed.'):t('growth.internalShareSent','Shared.');button.remove();}
          }catch{if(current())status.textContent=t('growth.internalShareFailed','Unable to share. Try again to retry the same message.');}
          finally{busy=false;if(current())for(const b of list.querySelectorAll('button'))b.disabled=false;}
        };
        list.append(button);
      }
      // Reuse canonical inbox and MLS rooms. No address book, message bodies or private IDs enter analytics.
      const results=await Promise.allSettled([
        deps.dataLayer.loadInboxPage({limit:20}),deps.dataLayer.shoppingRoom('list',[])
      ]);
      if(!current())return;
      const peers=new Set();
      if(results[0].status==='fulfilled')for(const row of results[0].value?.items||[]) {
        if(!row.encrypted||!win.WingaModules.growth.contract.id(row.withUser)||row.withUser===owner||peers.has(row.withUser))continue;
        peers.add(row.withUser);
        choice(row.withUser,id=>deps.dataLayer.sendRichMessage(row.withUser,win.WingaRichContent.create(contentType.toLowerCase(),'',{ids:[productId]}),{clientMessageId:id}));
      }
      if(results[1].status==='fulfilled')for(const room of results[1].value||[]) {
        if(room.status!=='active'||room.transition?.status!=='accepted'||room.departures?.length||room.preferences?.archived)continue;
        choice(room.name||t('rooms.title','Shopping Room'),id=>contentType==='PRODUCT'?
          deps.dataLayer.shoppingRoom('command',[room.id,'product-share',{productId,note:'',snapshot:null},id]):
          deps.dataLayer.shoppingRoom('send',[room.id,win.WingaRichContent.encode(win.WingaRichContent.create(contentType.toLowerCase(),'',{ids:[productId]})),id]));
      }
      status.textContent=list.children.length?t('growth.chooseShareDestination','Choose a conversation or room.'):
        t('growth.noShareDestinations','No ready conversations or rooms. Open chat to start one.');
      if(results.some(r=>r.status==='rejected')&&list.children.length)status.textContent=t('growth.someShareDestinationsUnavailable','Some conversations or rooms could not be loaded.');
    }
    return {open};
  }
  window.WingaModules.growth.createInternalShare=createInternalShare;
})();
