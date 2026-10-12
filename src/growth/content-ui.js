(() => {
  function createContentUi(deps){
    const win=deps.window||window,t=(key,fallback)=>deps.translate?.(key,fallback)||fallback;
    let active=null,epoch=0;
    const el=(tag,text='')=>{const node=win.document.createElement(tag);node.textContent=text;return node;};
    function close(){epoch++;active?.close();active?.remove();active=null;}
    async function openCollection(id){
      if(active?.dataset.collectionId===id&&active.owner===deps.getAccount())return;
      close();const account=deps.getAccount(),revision=epoch;
      const dialog=el('dialog');dialog.className='chat-security-dialog room-invitation-preview';dialog.dataset.collectionId=id;dialog.owner=account;
      const title=el('h2',t('collections.eyebrow','Collection')),status=el('p',t('inbox.loading','Loading...')),items=el('div');items.className='room-invite-products';status.setAttribute('role','status');
      const dismiss=el('button',t('common.close','Close'));dismiss.type='button';dismiss.onclick=close;
      dialog.append(dismiss,title,status,items);win.document.body.append(dialog);dialog.showModal();active=dialog;
      const timer=win.setInterval(()=>{if(deps.getAccount()!==account)dialog.close();},250);
      dialog.addEventListener('close',()=>{win.clearInterval(timer);dialog.remove();if(active===dialog)active=null;},{once:true});
      const current=()=>active===dialog&&epoch===revision&&deps.getAccount()===account;
      try{
        const collection=await deps.dataLayer.loadSharedCollection(id);if(!current())return;
        title.textContent=collection.title;status.textContent=collection.description||'';
        for(const item of collection.items||[]){const button=el('button',item.name||item.productId);button.type='button';button.className='action-btn action-btn-secondary';button.onclick=async()=>{if(!current())return;close();await deps.openProduct(item.productId);};items.append(button);}
        if(collection.visibility==='public'&&collection.status==='published'&&items.children.length)try{deps.getGrowth?.().contentVisible('COLLECTION',id,collection.ownerUsername,()=>current()&&dialog.open);}catch{}
        if(!items.children.length)items.append(el('p',t('growth.collectionEmpty','This collection has no available products.')));
        const profile=el('button',t('growth.viewCurator','View curator'));profile.type='button';profile.onclick=()=>{if(!current())return;close();deps.openProfile(collection.ownerUsername);};dialog.append(profile);
        const follow=el('button',deps.isFollowing(collection.ownerUsername)?t('personProfile.following','Following'):t('personProfile.follow','Follow'));follow.type='button';follow.dataset.followCollectionOwner=collection.ownerUsername;
        follow.onclick=()=>{if(!current())return;const following=deps.follow(collection.ownerUsername);if(typeof following==='boolean')follow.textContent=following?t('personProfile.following','Following'):t('personProfile.follow','Follow');};dialog.append(follow);
        if(collection.visibility==='public'&&collection.status==='published'){
          const share=el('button',t('common.share','Share'));share.type='button';share.onclick=()=>deps.shareCollection(collection);dialog.append(share);
        }
      }catch{if(!current())return;status.textContent=t('growth.collectionUnavailable','This collection is no longer available.');
        const explore=el('button',t('growth.exploreProducts','Explore products'));explore.type='button';explore.onclick=()=>{close();deps.explore();};dialog.append(explore);
      }
    }
    return {openCollection,close};
  }
  window.WingaModules.growth.createContentUi=createContentUi;
})();
