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
        let productBusy=false;
        for(const item of collection.items||[]){const button=el('button',item.name||item.productId);button.type='button';button.className='action-btn action-btn-secondary';button.onclick=async()=>{
          if(!current()||productBusy)return;productBusy=true;button.disabled=true;
          try{const opened=await deps.openProduct(item.productId,{isCurrent:current});if(!current())return;
            if(opened===true){if(collection.visibility==='public'&&collection.status==='published')try{deps.getGrowth?.().collectionProductOpened(id,item.productId);}catch{}close();}
            else status.textContent=t('growth.productUnavailable','Product no longer available');
          }catch{if(current())status.textContent=t('growth.productUnavailable','Product no longer available');}
          finally{if(current()){productBusy=false;button.disabled=false;}}
        };items.append(button);}
        if(collection.visibility==='public'&&collection.status==='published'&&items.children.length)try{deps.getGrowth?.().contentVisible('COLLECTION',id,collection.ownerUsername,()=>current()&&dialog.open);}catch{}
        if(!items.children.length)items.append(el('p',t('growth.collectionEmpty','This collection has no available products.')));
        const profile=el('button',t('growth.viewCurator','View curator'));profile.type='button';profile.onclick=()=>{if(!current())return;close();deps.openProfile(collection.ownerUsername);};dialog.append(profile);
        const follow=el('button',deps.isFollowing(collection.ownerUsername)?t('personProfile.following','Following'):t('personProfile.follow','Follow'));follow.type='button';follow.dataset.followCollectionOwner=collection.ownerUsername;
        follow.onclick=()=>{if(!current())return;const following=deps.follow(collection.ownerUsername);if(typeof following==='boolean')follow.textContent=following?t('personProfile.following','Following'):t('personProfile.follow','Follow');};dialog.append(follow);
        if(collection.visibility==='public'&&collection.status==='published'){
          const share=el('button',t('common.share','Share'));share.type='button';share.onclick=()=>{if(current())return deps.shareCollection(collection);};dialog.append(share);
          if(win.WINGA_CONFIG?.growthInternalContentSharing===true){const internal=el('button',t('growth.shareToWinga','Share to Winga'));internal.type='button';internal.onclick=()=>{if(current())return deps.shareInternally('COLLECTION',id);};dialog.append(internal);}
        }
      }catch{if(!current())return;status.textContent=t('growth.collectionUnavailable','This collection is no longer available.');
        const explore=el('button',t('growth.exploreProducts','Explore products'));explore.type='button';explore.onclick=()=>{close();deps.explore();};dialog.append(explore);
      }
    }
    async function openOpportunity(id){
      if(active?.dataset.opportunityId===id&&active.owner===deps.getAccount())return;
      close();const account=deps.getAccount(),revision=epoch,dialog=el('dialog');
      dialog.className='chat-security-dialog';dialog.dataset.opportunityId=id;dialog.owner=account;
      const status=el('p',t('inbox.loading','Loading...'));status.setAttribute('role','status');
      const dismiss=el('button',t('common.close','Close'));dismiss.type='button';dismiss.onclick=close;
      dialog.append(dismiss,el('h2',t('commerceOpportunity.defaultTitle','Buyer demand opportunity')),status);
      win.document.body.append(dialog);dialog.showModal();active=dialog;
      const current=()=>active===dialog&&epoch===revision&&deps.getAccount()===account;
      const timer=win.setInterval(()=>{if(!current())dialog.close();},250);
      dialog.addEventListener('close',()=>{win.clearInterval(timer);dialog.remove();if(active===dialog)active=null;},{once:true});
      const unavailable=()=>{status.textContent=t('growth.opportunityUnavailable','This opportunity is unavailable for this account or has expired.');
        const explore=el('button',t('growth.exploreProducts','Explore products'));explore.type='button';explore.onclick=()=>{close();deps.explore();};dialog.append(explore);};
      if(!account){status.textContent=t('growth.opportunitySignin','Sign in to view the supply opportunity.');const login=el('button',t('auth.signIn','Sign in'));login.type='button';login.onclick=()=>{if(current())deps.requireOpportunityAuth(id);};dialog.append(login);return;}
      if(!deps.canUseSellerFeatures()){unavailable();return;}
      try{const opportunity=await deps.dataLayer.loadSellerOpportunity(id);if(!current())return;
        if(opportunity?.opportunityId!==id)throw new Error('opportunity_unavailable');
        status.textContent='';dialog.append(deps.renderOpportunity(opportunity));
      }catch{if(current())unavailable();}
    }
    async function openSellerReferral(id,safetyAfterAuth){
      if(active?.dataset.sellerReferralId===id&&active.owner===deps.getAccount()&&!safetyAfterAuth)return;
      close();const account=deps.getAccount(),revision=epoch,dialog=el('dialog');
      dialog.className='chat-security-dialog';dialog.dataset.sellerReferralId=id;dialog.owner=account;
      const status=el('p',t('inbox.loading','Loading...'));status.setAttribute('role','status');
      const dismiss=el('button',t('common.close','Close'));dismiss.type='button';dismiss.onclick=close;
      dialog.append(dismiss,el('h2',t('growth.referralTitle','A useful supply opportunity')),status);
      win.document.body.append(dialog);dialog.showModal();active=dialog;
      const current=()=>active===dialog&&epoch===revision&&deps.getAccount()===account;
      const timer=win.setInterval(()=>{if(!current())dialog.close();},250);
      dialog.addEventListener('close',()=>{win.clearInterval(timer);dialog.remove();if(active===dialog)active=null;},{once:true});
      let busy=false;
      const safety=async action=>{
        if(!current()||busy)return;
        if(!account){deps.requireReferralAuth(id,action);return;}
        busy=true;
        try{const result=await deps.dataLayer.growthShareSafety(id,action);if(!current())return;
          if(action==='block'&&result?.blocked!==true||action==='report'&&result?.reported!==true)throw new Error('growth_unavailable');
          status.textContent=action==='block'?t('growth.referralBlocked','Sender blocked.'):t('growth.referralReported','Report received.');
        }catch{if(current())status.textContent=t('growth.referralSafetyFailed','Unable to complete the action. Please try again.');}finally{busy=false;}
      };
      try{const referral=await deps.dataLayer.resolveSellerReferral(id);if(!current())return;
        if(referral?.referralId!==id||referral.purpose!=='supply_for_real_demand')throw new Error('growth_referral_unavailable');
        status.textContent=t('growth.referralReason','Someone shared a real supply opportunity in this category.');
        dialog.append(el('strong',deps.getCategoryLabel(referral.category)||referral.category||t('growth.referralTitle','A useful supply opportunity')),
          el('p',referral.evidenceLevel==='single_signal'?t('growth.referralSingleSignal','This is a single demand signal, not a proven trend.'):t('growth.referralEvidence','Demand evidence is a signal, not a guaranteed sale.')));
        if(referral.measurementEnabled!==false)try{deps.getGrowth?.().referralVisible(id);}catch{}
        if(!account){const login=el('button',t('auth.signIn','Sign in'));login.type='button';login.onclick=()=>{if(current())deps.requireReferralAuth(id);};dialog.append(login);}
        else if(referral.opportunityDestination){const open=el('button',t('commerceOpportunity.sectionTitle','Supply opportunities'));open.type='button';open.onclick=()=>{if(current())deps.openOpportunityDestination(referral.opportunityDestination);};dialog.append(open);}
        if(account&&deps.canUseSellerFeatures()){const publish=el('button',t('commerceOpportunity.createSupply','Create supply'));publish.type='button';publish.onclick=()=>{if(current())deps.startSellerSupply();};dialog.append(publish);}
      }catch{if(!current())return;status.textContent=t('growth.referralUnavailable','This referral is expired or no longer available.');}
      if(!current())return;
      const explore=el('button',t('growth.exploreProducts','Explore products'));explore.type='button';explore.onclick=()=>{close();deps.explore();};dialog.append(explore);
      for(const [action,label]of [['block',t('growth.blockInviter','Block sender')],['report',t('growth.reportInvite','Report invitation')]]){
        const button=el('button',label);button.type='button';button.onclick=()=>safety(action);dialog.append(button);
      }
      if(safetyAfterAuth)await safety(safetyAfterAuth);
    }
    return {openCollection,openOpportunity,openSellerReferral,close};
  }
  window.WingaModules.growth.createContentUi=createContentUi;
})();
