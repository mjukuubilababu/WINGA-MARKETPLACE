(() => {
  function createInviteUi(deps) {
    const win=deps.window || window,contract=win.WingaModules.growth.contract;
    const t=(key,fallback)=>deps.translate?.(key,fallback)||fallback;
    const element=(tag,text='',className='')=>{const node=win.document.createElement(tag);node.textContent=text;node.className=className;return node;};
    let active=null,epoch=0;
    function close(){epoch++;active?.dialog.close();active?.dialog.remove();active=null;}
    function button(text,action){const node=element('button',text,'action-btn action-btn-secondary');node.type='button';node.onclick=action;return node;}
    async function open(token,{requestAfterAuth=false,safetyAction=''}={}) {
      const account=deps.getAccount?.() || '';
      if(active?.token===token&&active.account===account&&!requestAfterAuth&&!safetyAction)return;
      close();const currentEpoch=epoch;
      const dialog=element('dialog','','chat-security-dialog room-invitation-preview'),heading=element('h2',t('growth.roomInviteTitle','Help me choose between these products'));
      heading.id='room-invite-heading';dialog.setAttribute('aria-labelledby',heading.id);
      const dismiss=button(t('common.close','Close'),close),content=element('div','','room-invite-products'),status=element('p',t('growth.inviteLoading','Loading invitation…'),'empty-copy');status.setAttribute('role','status');
      dialog.append(dismiss,heading,content,status);win.document.body.append(dialog);dialog.showModal();active={token,account,dialog};
      dialog.addEventListener('close',()=>{dialog.remove();if(active?.dialog===dialog)active=null;},{once:true});
      const current=()=>active?.dialog===dialog&&epoch===currentEpoch&&account===(deps.getAccount?.() || '');
      const unavailable=()=>{if(!current())return;content.replaceChildren();status.textContent=t('growth.inviteUnavailable','This invitation is no longer available.');
        dialog.append(button(t('growth.exploreProducts','Explore products'),()=>{close();deps.explore?.();}));};
      if(!contract.inviteToken(token)){unavailable();return;}
      let busy=false;
      const safety=element('div','','room-invite-safety');
      async function safetyRequest(action){
        if(!current()||busy)return;
        if(!account){close();deps.requireAuth?.({type:action==='block'?'block-room-inviter':'report-room-invite',token});return;}
        busy=true;
        try{const result=await deps.dataLayer.roomInviteSafety(token,action,action==='report'?'spam':undefined);if(!current())return;
          if(action==='block'&&result.blocked===true){content.replaceChildren();safety.replaceChildren();status.textContent=t('growth.inviterBlocked','Inviter blocked.');dialog.querySelector('[data-room-join]')?.remove();}
          else if(action==='report'&&result.reported===true)status.textContent=t('growth.invitationReported','Invitation reported.');
          else throw new Error('growth_invite_safety_invalid');
          return true;
        }catch{if(current())status.textContent=t('growth.inviteSafetyFailed','Unable to finish. Please try again.');}finally{busy=false;}
      }
      safety.append(button(t('growth.blockInviter','Block inviter'),()=>safetyRequest('block')),button(t('growth.reportInvitation','Report invitation'),()=>safetyRequest('report')));dialog.append(safety);
      let safetyCompleted=false;
      if(safetyAction&&account){safetyCompleted=await safetyRequest(safetyAction);if(safetyAction==='block'&&safetyCompleted)return;}
      let invite;
      try{invite=await deps.dataLayer.resolveRoomInvite(token);}catch{unavailable();return;}
      if(!current())return;
      if(invite?.version!==1||!contract.uuid(invite.inviteId)||invite.purpose!=='choose_products'||!Array.isArray(invite.productIds)
        ||invite.productIds.length>4||!invite.productIds.every(contract.id)||!Number.isFinite(Date.parse(invite.expiresAt))){unavailable();return;}
      if(!safetyCompleted)status.textContent='';
      try{deps.getGrowth?.().roomInviteTouch(invite.inviteId);}catch{}
      let hash=invite.joinContext?.tokenHash || '';
      if(!hash&&win.WINGA_CONFIG?.growthMeasurement===true)try{
        hash=Array.from(new Uint8Array(await win.crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
      }catch{}
      if(!current())return;
      try{deps.getGrowth?.().roomEvent('room_invite_opened',{inviteId:invite.inviteId,tokenHash:hash});}catch{}
      const products=await Promise.allSettled(invite.productIds.map(id=>deps.dataLayer.loadSharedProduct(id)));
      if(!current())return;
      for(const result of products){const product=result.status==='fulfilled'?result.value:null;
        if(!product)continue;const card=element('article','','room-invite-product');
        const image=deps.image?.(product);if(image){const img=element('img');img.src=image;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';card.append(img);}
        card.append(element('h3',String(product.name||product.id)),element('p',deps.price?.(product.price)||String(product.price||'')));
        card.append(button(t('growth.viewProduct','View product'),async()=>{if(!current())return;close();await deps.openProduct?.(product.id);}));content.append(card);}
      if(!content.children.length)content.append(element('p',t('growth.inviteProductsUnavailable','These products are no longer available.'),'empty-copy'));
      dialog.append(element('p',t('growth.invitePreviewScope','This preview includes these products. Joining the room needs approval.'),'empty-copy'));
      if(!invite.joiningEnabled){status.textContent=t('growth.roomInvitesPaused','Room invitations are temporarily paused.');return;}
      const join=button(t('growth.requestRoomJoin','Ask to join'),async()=>{
        if(!current()||busy)return;
        if(!account){close();deps.requireAuth?.({type:'join-room-invite',token});return;}
        if(!contract.uuid(invite.joinContext?.conversationId)||!/^[a-f0-9]{64}$/.test(invite.joinContext?.tokenHash)){unavailable();return;}
        busy=true;join.disabled=true;status.textContent=t('growth.roomJoinRequesting','Sending your request…');
        try{
          const result=await deps.dataLayer.shoppingRoom('requestInvite',[invite.joinContext,invite.inviteId]);if(!current())return;
          if(!['requested','accepted'].includes(result?.status)){throw new Error('growth_invite_invalid');}
          status.textContent=result.status==='accepted'?t('growth.roomMembershipReady','Room membership is ready.'):
            t('growth.roomJoinPending','Request sent. The room admin needs to approve.');
          join.remove();dialog.append(button(t('growth.openRooms','Open chatrooms'),()=>{close();deps.openRoom?.(result.conversationId);}));
        }catch(error){if(!current())return;
          if(error.status===404){unavailable();join.remove();return;}
          status.textContent=error.code==='growth_invitations_disabled'?t('growth.invitationsDisabled','Invitations are disabled in your preferences.'):
            t('growth.roomRequestFailed','Unable to send the request. Please try again.');join.disabled=false;
        }finally{busy=false;}
      });
      join.dataset.roomJoin='true';
      dialog.append(join);if(requestAfterAuth&&account)await join.onclick();
    }
    return {open,close};
  }
  window.WingaModules.growth.createInviteUi=createInviteUi;
})();
