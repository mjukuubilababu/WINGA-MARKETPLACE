(() => {
  const fail = code => { throw Object.assign(new Error(code), {code}); };
  const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const decode = text => Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  let bundle;
  function loadRuntime() {
    if(globalThis.WingaMlsCandidate) return Promise.resolve();
    if(!bundle) bundle=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='/vendor/winga-mls-candidate.js';script.async=true;
      script.onload=()=>globalThis.WingaMlsCandidate?resolve():reject(new Error('mls_runtime_unavailable')); // i18n-gate: allow -- internal diagnostic, UI displays translated failure
      script.onerror=()=>{script.remove();reject(new Error('mls_runtime_unavailable'));};document.head.append(script); // i18n-gate: allow -- internal diagnostic, UI displays translated failure
    }).catch(error=>{bundle=null;throw error;});
    return bundle;
  }
  async function createEncryptionSession({getSession,deviceRequest,packageRequest,operationRequest,initialSync=true,mediaEnabled=false,multiDeviceEnabled=false,roomsEnabled=false,roomLimits,mediaRequest,onChange=()=>{}}) {
    await loadRuntime();
    const initial={...getSession()},owner=initial.username;
    let closed=false,runtime,media,nativeHistory,roomSession,historyTask,groups=[],tail=Promise.resolve(),lastSnapshot='';
    const localSends=new Set();
    const current=()=>{const s=getSession();if(closed || s?.username!==owner || s?.token!==initial.token || s?.sessionId!==initial.sessionId)fail('mls_session_changed');};
    const identity=await WingaCryptoDevices.createCryptoDeviceClient({getSession,request:deviceRequest});
    const vault=await WingaEncryptedVault.createEncryptedVault({owner,getSession});
    const pins=async()=>Object.entries((await vault.snapshot()).values).filter(([k])=>k.startsWith('mls:pin:')).map(([,v])=>v);
    async function operation(action,payload,id) {current();const signed=await identity.signCryptoOperation(action,payload,id);const r=await operationRequest(signed);current();return r;}
    const serialize=work=>{const result=tail.then(()=>navigator.locks.request(`winga-encryption-session:${owner}`,async()=>{current();return work();}));tail=result.catch(()=>{});return result;};
    function messageView(item) {
      const a=globalThis.WingaEncryptedMedia?.attachment(item);
      const c=item.richContent||globalThis.WingaRichContent?.parse(item.message);
      const unknown=!c&&item.message?.startsWith('WINGA-CONTENT/');
      const body=item.eventRecord?'':c?c.text:a?a.text:unknown?'':item.message;
      return {...item,message:body,richContent:c,richUnavailable:unknown,
        ...(a?{attachmentId:a.attachment.object.id,attachmentName:a.attachment.name,attachmentKind:a.attachment.kind||'file'}:{}),
          senderId:item.owner,receiverId:item.peer,messageType:a?(a.attachment.kind||'file'):c?.type||'text',productId:'',productName:'',productItems:[],
        replyToMessageId:c?.reply?.id||'',replyQuote:c?.reply?.quote||'',encrypted:true,
        isDelivered:['delivered','read'].includes(item.status),isRead:item.status==='read',deviceDeliveredAt:['delivered','read'].includes(item.status)?item.timestamp:null,
        sendState:item.status==='pending'?(item.waiting?'pending':'failed'):item.status,isQueued:item.status==='pending'};
    }
    async function verifyPackage(p,expected) {
      if(p.fingerprint!==expected || await digest(decode(p.publicKey))!==expected || await digest(decode(p.keyPackage))!==p.hash)fail('mls_identity_verification_failed');
      const proof=p.identityProof;
      if(proof?.owner!==p.owner || proof.deviceId!==p.deviceId || proof.hash!==p.hash || proof.keyPackage!==p.keyPackage)fail('mls_identity_verification_failed');
      const key=await crypto.subtle.importKey('raw',decode(p.publicKey),'Ed25519',false,['verify']);
      const bytes=new TextEncoder().encode(JSON.stringify(['winga-crypto-key-package',1,p.owner,proof.sessionId,p.deviceId,proof.requestId,proof.issuedAt,p.hash]));
      if(!await crypto.subtle.verify('Ed25519',key,decode(proof.signature),bytes))fail('mls_identity_verification_failed');
      const signaturePublicKey=await WingaMlsCandidate.inspectBoundKeyPackage(decode(p.keyPackage),{owner:p.owner,id:p.deviceId,fingerprint:p.fingerprint});
      if(encode(signaturePublicKey)!==p.mlsPublicKey)fail('mls_identity_verification_failed');
      const pin={owner:p.owner,id:p.deviceId,fingerprint:p.fingerprint,publicKey:p.publicKey,signaturePublicKey,status:'active'};
      const saved=await vault.snapshot(),prior=saved.values[`mls:pin:${p.deviceId}`];
      if(prior && (prior.fingerprint!==pin.fingerprint || encode(prior.signaturePublicKey)!==p.mlsPublicKey || prior.publicKey!==p.publicKey))fail('mls_identity_changed');
      await vault.write({expectedRevision:saved.revision,values:{[`mls:pin:${p.deviceId}`]:pin}});
      return pin;
    }
    async function verifyProof(proof,action,expectedPin) {
      const pin=expectedPin || (await pins()).find(v=>v.id===proof.actorId && v.owner===proof.owner && v.status==='active');
      if(pin && (pin.id!==proof.actorId || pin.owner!==proof.owner || pin.status!=='active'))fail('mls_receipt_rejected');
      if(!pin || proof.action!==action)fail('mls_receipt_rejected');
      const key=await crypto.subtle.importKey('raw',decode(pin.publicKey),'Ed25519',false,['verify']);
      const h=await digest(new TextEncoder().encode(JSON.stringify(proof.payload,Object.keys(proof.payload).sort())));
      const bytes=new TextEncoder().encode(JSON.stringify(['winga-crypto-transport',1,proof.owner,proof.sessionId,proof.action,proof.actorId,proof.requestId,proof.issuedAt,h]));
      if(!await crypto.subtle.verify('Ed25519',key,decode(proof.signature),bytes))fail('mls_receipt_rejected');
      return pin;
    }
    async function verifyReceipt(proof,g) {
      // An added native endpoint cannot authenticate a historical signer it never pinned.
      const p=proof.payload;
      if(multiDeviceEnabled&&p?.conversationId===g.id&&typeof p.epoch==='string'&&/^[1-9][0-9]{0,19}$/.test(p.epoch)&&BigInt(p.epoch)<BigInt(g.epoch)
        && !(await pins()).some(pin=>pin.id===proof.actorId&&pin.owner===proof.owner&&pin.status==='active'))return;
      const archive=proof.action==='archive-read',pin=await verifyProof(proof,archive?'archive-read':'receipt');
      if(!await vault.lookup(`history:${p.id}`))return;
      if(multiDeviceEnabled&&pin.owner===owner&&p.kind==='read')await runtime.applyOwnReadReceipt(p,pin);
      else await runtime.applyReceipt(p,pin);
      await operation(archive?'archive-read-ack':'receipt-ack',{...p,receiptDeviceId:proof.actorId});
    }
    async function acknowledge(item,kind) {
      const archive=multiDeviceEnabled&&kind==='read'&&item.epoch!==await runtime.conversationEpoch(item.owner);
      await operation(archive?'archive-read':'receipt',{id:item.id,conversationId:item.conversationId,epoch:item.epoch,hash:item.hash,kind});
    }
    try {
      if(roomsEnabled){if(!globalThis.WingaRoomSession)fail('encrypted_rooms_disabled');
        roomSession=WingaRoomSession.createRoomSession({owner,runtime:()=>runtime,vault,operation,verifyPackage,verifyProof,onChange,roomLimits,historyRecoveryEnabled:multiDeviceEnabled,
          verifyArchiveProof:async(p,action)=>{const pin=(await pins()).find(v=>v.id===p.actorId&&v.owner===p.owner&&v.status==='active');return pin?verifyProof(p,action,pin):null;},
          mediaFactory:mediaEnabled&&globalThis.WingaEncryptedMedia&&typeof mediaRequest==='function'?async id=>{
            const peer='room:'+id,requirePeer=p=>{if(p&&p!==peer)fail('encrypted_group_scope_rejected');};
            return WingaEncryptedMedia.createMediaClient({owner,getSession,vault,identity,request:mediaRequest,onChange,historyRecoveryEnabled:multiDeviceEnabled,
              operation:(action,payload,requestId)=>{if(payload.conversationId!==id)fail('encrypted_group_scope_rejected');return operation(action==='media-reserve'?'room-media-reserve':action==='media-history-grant'?'room-media-history-grant':action,payload,requestId);},
              runtime:{history:async p=>{requirePeer(p);return runtime.room.history(id);},conversationId:async p=>{requirePeer(p);return id;},
                retryMessage:messageId=>runtime.retryMessage(messageId),sendMessage:async p=>{requirePeer(p.receiverId);return runtime.room.send({conversationId:id,clientMessageId:p.clientMessageId,message:p.message,mediaId:p.mediaId});}}});
          }:undefined});}
      runtime=await WingaMlsCandidate.createMlsRuntime({getSession,vault,identityClient:identity,
        publishPackage:packageRequest,trustedPins:pins,multiDevice:multiDeviceEnabled,rooms:roomsEnabled,roomAuthorization:roomSession?.authorization,
        transport:{send:async job=>{const saved=await vault.snapshot();const room=saved.values[`mls:group:${job.conversationId}`]?.kind==='shopping-room';
          return operation(room?'room-send':'send',{...job,ciphertext:encode(job.ciphertext)},job.id);}}});
      await runtime.initialize();const own=await runtime.prepareKeyPackage(),native=await identity.enroll();
      if(multiDeviceEnabled&&globalThis.WingaNativeHistory&&globalThis.WingaSecureContent){
        const codec=await WingaSecureContent.loadSecureContent();current();
        nativeHistory=await WingaNativeHistory.createNativeHistoryClient({owner,deviceId:own.id,getSession,vault,codec,operation,
          verifyProof:(p,action)=>verifyProof(p,action,p.actorId===own.id?native:undefined),onChange,
          validateRoomHistory:(g,items)=>roomSession.validateHistory(g,items),
          validateMembership:async g=>{if(g.kind==='shopping-room')return roomSession.validateHistoryMembership(g);
            const latest=groups.find(x=>x.id===g.id),peer=g.creator===owner?g.recipient:g.creator;
            if(latest?.status!=='active'||latest.epoch!==g.epoch||await runtime.conversationEpoch(peer)!==g.epoch)fail('history_sync_membership_changed');}});
      }
      function startHistorySync(){
        if(!nativeHistory||historyTask)return;
        const roster=structuredClone([...groups,...(roomSession?.historyGroups()||[])]);
        historyTask=navigator.locks.request(`winga-native-history:${owner}:${own.id}`,()=>{
          current();return nativeHistory.sync(roster);
        }).catch(()=>{}).finally(()=>{historyTask=null;});
      }
      const canonical=value=>JSON.stringify(value,Object.keys(value).sort());
      async function processAdmission(g) {
        const r=g.admission;if(!multiDeviceEnabled || !r)return;
        const change=r.kind && r.kind!=='add',prefix=change?'device-change':'device';
        const intent=r.intent,peer=g.creator===owner?g.recipient:g.creator,expectedFields=['id','previousEpoch','actorOwner','actorDeviceId','addedOwner','addedDeviceId','packageHash',...(change?['removedOwner','removedDeviceId']:[])];
        const encodeTransfer=change?WingaMlsCandidate.encodeDeviceChangePayload:WingaMlsCandidate.encodeDeviceAdmissionPayload;
        if(!intent || intent.conversationId!==g.id || intent.id!==r.id || intent.previousEpoch!==r.previous_epoch
          || intent.actorDeviceId!==r.actor_device || intent.addedDeviceId!==(r.added_device||'') || intent.addedOwner!==(r.added_owner||'')
          || intent.packageHash!==(r.package_hash||'') || (change&&(intent.removedDeviceId!==r.removed_device || intent.removedOwner!==r.removed_owner))
          || r.reservation_proof?.owner!==intent.actorOwner
          || r.reservation_proof.actorId!==intent.actorDeviceId || canonical(r.reservation_proof.payload)!==canonical(intent))fail('mls_device_intent_rejected');
        let saved=await vault.snapshot();
        for(const p of g.packages||[])if(p.deviceId===own.id)await verifyPackage(p,own.fingerprint);
        saved=await vault.snapshot();
        // An unverified new fingerprint pauses this one chat, never silently trusts a login.
        if((g.packages||[]).some(p=>!saved.values[`mls:pin:${p.deviceId}`]))return;
        await verifyProof(r.reservation_proof,prefix+'-reserve',intent.actorDeviceId===own.id?native:undefined);
        if(change && r.removed_status==='revoked' && saved.values[`mls:pin:${r.removed_device}`]?.status==='active') {
          await vault.write({expectedRevision:saved.revision,values:{[`mls:pin:${r.removed_device}`]:{...saved.values[`mls:pin:${r.removed_device}`],status:'revoked'}}});
          saved=await vault.snapshot();
        }
        const expected=Object.fromEntries(expectedFields.map(k=>[k,intent[k]]));
        if(r.status==='reserved') {
          if(r.actor_device!==own.id)return;
          const local=saved.values[`mls:device-admission:${peer}`];
          if(!local || canonical(local)!==canonical(intent))fail('mls_device_intent_rejected');
          const pkg=g.packages.find(p=>p.hash===r.package_hash && p.deviceId===r.added_device);
          if(r.added_device && !pkg)fail('encrypted_package_unavailable');
          const target=r.added_device?{owner:r.added_owner,id:r.added_device}:null;
          const transfer=saved.values[`mls:membership:${g.id}`] || (change?await runtime.changeDevice(g.id,r.previous_epoch,r.removed_device,
            pkg?decode(pkg.keyPackage):null,target,r.id):await runtime.addDevice(g.id,r.previous_epoch,decode(pkg.keyPackage),target,r.id));
          await operation(prefix+'-transfer',encodeTransfer(transfer),r.id);return;
        }
        if(!r.transfer || r.transfer_hash!==await digest(new TextEncoder().encode(canonical(r.transfer)))
          || r.transfer_proof?.actorId!==r.actor_device || r.transfer_proof.owner!==intent.actorOwner
          || canonical(r.transfer_proof.payload)!==canonical(r.transfer))fail('mls_device_transfer_rejected');
        await verifyProof(r.transfer_proof,prefix+'-transfer',r.actor_device===own.id?native:undefined);
        const transfer=change?WingaMlsCandidate.decodeDeviceChangePayload(r.transfer):WingaMlsCandidate.decodeDeviceAdmissionPayload(r.transfer);
        if(r.actor_device===own.id) {
          const local=saved.values[`mls:membership:${g.id}`];
          if(local && canonical(encodeTransfer(local))!==canonical(r.transfer))fail('mls_device_transfer_rejected');
          if(!local && await runtime.conversationEpoch(peer)!==r.epoch)fail('mls_device_epoch_conflict');
        } else if(r.added_device===own.id)await (change?runtime.acceptDeviceChangeWelcome:runtime.acceptDeviceWelcome)(peer,transfer,expected);
        else await (change?runtime.applyDeviceChange:runtime.applyDeviceCommit)(peer,transfer,expected);
        const payload={conversationId:g.id,transferId:r.id,epoch:r.epoch,transferHash:r.transfer_hash};
        if(r.status!=='accepted') {await operation(prefix+'-accept',payload,r.id);return;}
        const required=transfer.roster.map(m=>m.id),seen=new Set();
        for(const proof of r.acceptances||[]) {
          const member=transfer.roster.find(m=>m.id===proof.actorId);
          if(!member || member.owner!==proof.owner || seen.has(proof.actorId) || canonical(proof.payload)!==canonical(payload))fail('mls_membership_confirmation_rejected');
          await verifyProof(proof,prefix+'-accept',proof.actorId===own.id?native:undefined);seen.add(proof.actorId);
        }
        if(required.some(id=>!seen.has(id)))fail('mls_membership_confirmation_rejected');
        if(r.actor_device===own.id)await runtime.confirmMembership(g.id,r.id);
        const fresh=await vault.snapshot(),local=fresh.values[`mls:device-admission:${peer}`];
        if(local?.id===r.id)await vault.write({expectedRevision:fresh.revision,deleted:[`mls:device-admission:${peer}`]});
      }
      async function replacementRecovery(g,saved) {
        const r=g.replacement,peer=g.creator===owner?g.recipient:g.creator;
        if(r?.initiator_device!==own.id)return null;
        const intent=r.intent,proof=r.reservation_proof;
        if(!intent || intent.id!==r.id || intent.conversationId!==g.id || intent.previousEpoch!==r.previous_epoch
          || intent.removedDeviceId!==r.removed_device || intent.replacementDeviceId!==r.replacement_device || intent.packageHash!==r.package_hash
          || proof?.owner!==owner || proof.actorId!==own.id || !proof.payload || canonical(proof.payload)!==canonical(intent))fail('mls_replacement_recovery_rejected');
        await verifyProof(proof,'replace-reserve',native);
        const row=saved.values[`mls:group:${g.id}`],local=saved.values[`mls:replacement:${peer}`],transfer=saved.values[`mls:membership:${g.id}`];
        if(!row || saved.values[`mls:route:${peer}`]?.conversationId!==g.id)return {reason:'keys-missing'};
        if(local && canonical(local)!==canonical(intent))return {reason:'intent-conflict'};
        if(transfer) {
          if(row.confirmed)return {reason:'journal-conflict'};
          if(transfer.id!==r.id || transfer.conversationId!==g.id || transfer.previousEpoch!==r.previous_epoch || transfer.epoch!==r.epoch
            || transfer.removedDeviceId!==r.removed_device || transfer.replacementDeviceId!==r.replacement_device || transfer.packageHash!==r.package_hash)
            return {reason:'journal-conflict'};
          if(r.transfer && canonical({...transfer,commit:encode(transfer.commit),welcome:encode(transfer.welcome),tree:encode(transfer.tree)})!==canonical(r.transfer))return {reason:'journal-conflict'};
          return {intent,transfer};
        }
        if(!row.confirmed)return {reason:'journal-missing'};
        if(r.status!=='reserved' || !local)return {reason:'journal-missing'};
        const p=g.packages.find(p=>p.hash===intent.packageHash && p.deviceId===intent.replacementDeviceId && p.owner===peer);
        const pin=saved.values[`mls:pin:${intent.replacementDeviceId}`];
        if(!p || !pin || pin.status!=='active' || pin.fingerprint!==p.fingerprint)return {reason:'verification-missing'};
        try {await WingaMlsCandidate.inspectBoundKeyPackage(decode(p.keyPackage),{owner:p.owner,id:p.deviceId,fingerprint:pin.fingerprint});}
        catch{return {reason:'admission-unavailable'};}
        return {intent,p,pin};
      }
      if(mediaEnabled && globalThis.WingaEncryptedMedia && typeof mediaRequest==='function')media=await WingaEncryptedMedia.createMediaClient({owner,getSession,vault,runtime,identity,operation,request:mediaRequest,historyRecoveryEnabled:multiDeviceEnabled,onChange});
      async function retireAbsentIntent(peer,g) {
        let saved=await vault.snapshot();const intent=saved.values[`mls:replacement:${peer}`];
        if(!intent || g?.status!=='active' || g.replacement?.status && g.replacement.status!=='accepted')return;
        const row=saved.values[`mls:group:${g.id}`];
        if(intent.conversationId!==g.id || intent.previousEpoch!==g.epoch || !row?.confirmed
          || saved.values[`mls:membership:${g.id}`] || await runtime.conversationId(peer)!==g.id
          || await runtime.conversationEpoch(peer)!==intent.previousEpoch)return;
        const reply=await operation('replace-retire',intent,intent.id);
        if(reply?.version!==1 || reply.id!==intent.id || reply.status!=='retired' || reply.conversationId!==g.id || reply.epoch!==intent.previousEpoch)fail('mls_replacement_recovery_rejected');
        saved=await vault.snapshot();
        if(canonical(saved.values[`mls:replacement:${peer}`] || {})!==canonical(intent)
          || !saved.values[`mls:group:${g.id}`]?.confirmed || saved.values[`mls:membership:${g.id}`]
          || await runtime.conversationEpoch(peer)!==intent.previousEpoch)fail('mls_replacement_recovery_rejected');
        await vault.write({expectedRevision:saved.revision,deleted:[`mls:replacement:${peer}`]});
      }
      async function syncInternal() {
        // Replay only durable sync work; never retry a new send or disable vault CAS.
        for(let attempt=0;attempt<3;attempt++){
          try{return await syncAttempt();}catch(error){
            if(error.code!=='crypto_vault_revision_conflict'||attempt===2)throw error;
            current();await new Promise(resolve=>setTimeout(resolve,25));current();
          }
        }
      }
      async function syncAttempt() {
        // Rooms have their own typed sync facade; a room failure must not block direct chats.
        const collected=[],seen=new Set();let after;
        do {
          const result=await operation('poll',after?{after}:{});
          if(result?.version!==1 || !Array.isArray(result.groups) || result.groups.length>100
            || result.groups.some(g=>seen.has(g.id)))fail('mls_transport_invalid');
          for(const g of result.groups){seen.add(g.id);collected.push(g);}
          if(result.next && (result.next!==result.groups.at(-1)?.id || (after && result.next<=after)))fail('mls_transport_invalid');
          after=result.next;
        }while(after);
        groups=collected;
        for(const g of groups) {
          if(g.status==='blocked')continue;
          if(g.admission){await processAdmission(g);if(g.status!=='active')continue;}
          const peer=g.creator===owner?g.recipient:g.creator;
          let saved=await vault.snapshot();
          const intent=saved.values[`mls:device-admission:${peer}`];
          if(multiDeviceEnabled && g.status==='active' && intent && g.admission?.id!==intent.id
            && intent.previousEpoch===g.epoch && saved.values[`mls:group:${g.id}`]?.confirmed
            && !saved.values[`mls:membership:${g.id}`] && await runtime.conversationEpoch(peer)===g.epoch) {
            const retired=await operation(intent.removedDeviceId?'device-change-retire':'device-retire',intent,intent.id);
            if(retired?.id!==intent.id || retired.status!=='retired' || retired.epoch!==intent.previousEpoch)fail('mls_device_intent_rejected');
            saved=await vault.snapshot();await vault.write({expectedRevision:saved.revision,deleted:[`mls:device-admission:${peer}`]});
            saved=await vault.snapshot();
          }
          const pending=saved.values[`mls:membership:${g.id}`];
          const replacement=g.replacement;
          if(replacement?.initiator_device===own.id && pending?.previousEpoch) {
            if(replacement.status==='accepted') {
              const proof=replacement.acceptance,p=proof?.payload;
              if(proof?.actorId!==replacement.replacement_device || proof.owner!==peer || p?.conversationId!==g.id
                || p.transferId!==pending.id || p.epoch!==pending.epoch)fail('mls_membership_confirmation_rejected');
              await verifyProof(proof,'replace-accept');await runtime.confirmMembership(g.id,pending.id);
              const fresh=await vault.snapshot();await vault.write({expectedRevision:fresh.revision,values:{},deleted:[`mls:replacement:${peer}`]});
            }else if(replacement.status==='reserved') {
              const recovery=await replacementRecovery(g,saved);
              if(!recovery.reason)try {await operation('replace-transfer',{...pending,commit:encode(pending.commit),welcome:encode(pending.welcome),tree:encode(pending.tree)},pending.id);}
              catch(error){if(!(error instanceof TypeError) && error.status!==503)throw error;}
            }
          } else if(g.creator===owner && pending) {
            if(g.status==='active') {
              const proof=g.acceptance;
              if(proof?.actorId!==g.recipient_device || proof.payload?.conversationId!==g.id || proof.payload?.transferId!==pending.id)fail('mls_membership_confirmation_rejected');
              await verifyProof(proof,'accept');await runtime.confirmMembership(g.id,pending.id);
            }
            else if(g.status==='reserved')await operation('transfer',{...pending,commit:encode(pending.commit),welcome:encode(pending.welcome),tree:encode(pending.tree)},pending.id);
          }
          const accepted=saved.values[`mls:group:${g.id}`]?.acceptedTransfer;
          if(replacement?.replacement_device===own.id && replacement.status==='pending' && accepted===replacement.transfer?.id)
            await operation('replace-accept',{conversationId:g.id,transferId:accepted,epoch:replacement.epoch},accepted);
          if(g.recipient===owner && g.status==='pending' && accepted===g.transfer?.id)await operation('accept',{conversationId:g.id,transferId:accepted},accepted);
          if(g.status!=='active' || !saved.values[`mls:route:${peer}`])continue;
          await retireAbsentIntent(peer,g);
          for(const m of g.messages) {
            let item;
            try {
              const proof=m.proof,p=proof?.payload;
              if(!(proof?.owner===peer || (multiDeviceEnabled && proof?.owner===owner && proof.actorId!==own.id)) || proof.actorId!==m.sender_device || p?.id!==m.id || p.conversationId!==g.id || p.epoch!==m.epoch || p.hash!==m.hash || p.ciphertext!==m.ciphertext)fail('mls_envelope_binding_rejected');
              await verifyProof(proof,'send');
              item=await runtime.receive(peer,{...m,conversationId:g.id,ciphertext:decode(m.ciphertext)});
            }catch(error) {
              const invalid=['mls_wire_rejected','mls_envelope_binding_rejected','mls_application_required','mls_content_binding_rejected','mls_sender_rejected','mls_message_id_conflict','mls_replay_conflict','mls_ciphertext_rejected','mls_receipt_rejected'];
              if(!invalid.includes(error.code))throw error;
              await operation('reject',{id:m.id,conversationId:g.id,epoch:m.epoch,hash:m.hash,reason:'invalid-ciphertext'});continue;
            }
            if(item.owner===owner)await operation('sync-ack',{id:item.id,conversationId:item.conversationId,epoch:item.epoch,hash:item.hash});
            else await acknowledge(item,'delivered');
          }
          for(const proof of g.receipts)await verifyReceipt(proof,g);
          for(const proof of g.archiveReceipts||[])await verifyReceipt(proof,g);
        }
        if(media)for(const job of await media.list())if(groups.some(g=>g.id===job.conversationId&&g.status==='active'))await media.resume(job.id);
        for(const [key,job] of Object.entries((await vault.snapshot()).values))if(key.startsWith('mls:outbox:')
          && groups.some(g=>g.id===job.conversationId && g.status==='active')) {
          await runtime.retryMessage(job.id);queueMicrotask(onChange);
        }
        // Archive I/O is not on the message-send critical path; vault CAS protects concurrent writes.
        startHistorySync();
        current();const snapshot=JSON.stringify(groups);
        if(snapshot!==lastSnapshot){lastSnapshot=snapshot;queueMicrotask(onChange);}return groups;
      }
      async function inspect(peer) {
        return serialize(async()=>{
          await syncInternal();const localRoute=(await vault.snapshot()).values[`mls:route:${peer}`]?.conversationId;
          let g=groups.find(g=>g.id===localRoute) || groups.find(g=>g.creator===peer || g.recipient===peer);
          if(g?.status.startsWith('device-')) {
            const saved=await vault.snapshot();
            return {status:g.status,ownFingerprint:own.fingerprint,group:g,multiDeviceEnabled:true,
              verificationPackages:(g.packages||[]).filter(p=>p.deviceId!==own.id && !saved.values[`mls:pin:${p.deviceId}`])};
          }
          if(g?.replacement && g.status.startsWith('replacement-')) {
            const recovery=await replacementRecovery(g,await vault.snapshot());
            if(recovery?.reason)return {status:'replacement-recovery-required',ownFingerprint:own.fingerprint,recoveryReason:recovery.reason};
            return {status:g.status,ownFingerprint:own.fingerprint,group:g,canResume:Boolean(recovery && g.replacement.status==='reserved'),
            packages:((g.replacement.replacement_device===own.id && g.replacement.status==='pending')
              )?g.packages.filter(p=>p.owner===peer):[],canReplace:false};
          }
          let directory;
          try {directory=await operation('directory',{peer});}catch(error){if(error.code==='encrypted_access_denied')return {status:'blocked',ownFingerprint:own.fingerprint};throw error;}
          const changeInfo=()=>({canChange:Boolean(multiDeviceEnabled&&directory.canChange),
            changeMembers:(directory.roster||[]).filter(m=>m.id!==own.id&&(m.owner===owner||m.status==='revoked')).map(m=>({...m,
              canRemove:(directory.roster||[]).filter(d=>d.owner===m.owner).length>1,
              replacements:directory.packages.filter(p=>p.owner===m.owner&&!directory.roster.some(d=>d.id===p.deviceId))}))});
          if(g?.status==='blocked') {
            if(multiDeviceEnabled && directory.canChange && await runtime.isEncrypted(peer))return {status:'blocked',ownFingerprint:own.fingerprint,
              group:directory.group,...changeInfo()};
            // Only the surviving selected device can start a fresh replacement of a revoked old peer.
            const stored=directory.group,selected=stored && (stored.creator===owner?stored.creator_device:stored.recipient_device);
            if(!directory.canReplace || stored?.status!=='active' || selected!==own.id || !(await runtime.isEncrypted(peer)))return {status:'blocked',ownFingerprint:own.fingerprint};
            const old=stored.creator===peer?stored.creator_device:stored.recipient_device;
            return {status:'blocked',ownFingerprint:own.fingerprint,canReplace:true,packages:directory.packages.filter(p=>p.deviceId!==old),group:stored};
          }
          if(!g && directory.group)g=directory.group;
          const selected=g && (g.creator===owner?g.creator_device:g.recipient_device),oldPeer=g && (g.creator===peer?g.creator_device:g.recipient_device);
          const candidates=directory.packages.filter(p=>p.owner===peer && p.deviceId!==oldPeer);
          const local=await vault.snapshot(),intent=local.values[`mls:replacement:${peer}`];
          const canReplace=g?.status==='active' && selected===own.id && await runtime.isEncrypted(peer);
          if(multiDeviceEnabled && directory.canAdmit && await runtime.isEncrypted(peer))return {status:'active',ownFingerprint:own.fingerprint,mediaEnabled:Boolean(media),
            canAdmit:true,canReplace:directory.canReplace,packages:candidates,group:g,...changeInfo(),
            admissionPackages:directory.packages.filter(p=>!directory.roster.some(m=>m.id===p.deviceId))};
          if(canReplace)return {status:'active',ownFingerprint:own.fingerprint,mediaEnabled:Boolean(media),canReplace:directory.canReplace,packages:candidates,group:g};
          if(directory.group?.status==='active' && selected!==own.id)return {status:'rejoin-required',ownFingerprint:own.fingerprint};
          if(intent && directory.group)return {status:'replacement-reserved',ownFingerprint:own.fingerprint,canReplace:true,packages:candidates,group:directory.group};
          if(g?.status==='active')return {status:'recovery-required',ownFingerprint:own.fingerprint};
          if(g?.status==='blocked')return {status:'blocked',ownFingerprint:own.fingerprint};
          const available=g?.packages?.filter(p=>p.owner===peer) || directory.packages;
          return {status:g?.status || 'available',ownFingerprint:own.fingerprint,packages:available,group:g};
        });
      }
      async function enable(peer,deviceId,expectedFingerprint) {
        return serialize(async()=>{
          await syncInternal();const group=groups.find(g=>g.creator===peer || g.recipient===peer);
          if(group?.status==='blocked')fail('encrypted_access_denied');
          const candidates=group?.packages?.filter(p=>p.owner===peer) || (await operation('directory',{peer})).packages.filter(p=>p.owner===peer);
          const p=candidates.find(p=>p.deviceId===deviceId);if(!p)fail('encrypted_package_unavailable');
          await verifyPackage(p,expectedFingerprint);
          if(group?.replacement?.replacement_device===own.id && group.replacement.status==='pending') {
            const r=group.replacement,proof=r.transfer_proof;
            if(proof?.actorId!==r.initiator_device || proof.owner!==peer
              || JSON.stringify(proof.payload,Object.keys(proof.payload).sort())!==JSON.stringify(r.transfer,Object.keys(r.transfer).sort()))fail('mls_membership_confirmation_rejected');
            await verifyProof(proof,'replace-transfer');
            await runtime.acceptWelcome(peer,{...r.transfer,commit:decode(r.transfer.commit),welcome:decode(r.transfer.welcome),tree:decode(r.transfer.tree)},r.initiator_device);
            await operation('replace-accept',{conversationId:group.id,transferId:r.id,epoch:r.epoch},r.id);
          } else if(group && group.recipient===owner) {
            if(!group.transfer)fail('mls_membership_pending');
            const proof=group.transfer_proof;
            if(proof?.actorId!==group.creator_device || proof.owner!==peer || JSON.stringify(proof.payload,Object.keys(proof.payload).sort())!==JSON.stringify(group.transfer,Object.keys(group.transfer).sort()))fail('mls_membership_confirmation_rejected');
            await verifyProof(proof,'transfer');
            const transfer={...group.transfer,commit:decode(group.transfer.commit),welcome:decode(group.transfer.welcome),tree:decode(group.transfer.tree)};
            await runtime.acceptWelcome(peer,transfer);
            await operation('accept',{conversationId:group.id,transferId:transfer.id},transfer.id);
          } else {
            let saved=await vault.snapshot(),intent=saved.values[`mls:reservation:${peer}`];
            if(!intent) {
              const pkg=await runtime.prepareKeyPackage();
              intent={conversationId:crypto.randomUUID(),peer,sourceHash:pkg.hash,targetHash:p.hash};
              saved=await vault.snapshot();await vault.write({expectedRevision:saved.revision,values:{[`mls:reservation:${peer}`]:intent}});
            }
            await operation('reserve',intent,intent.conversationId);
            saved=await vault.snapshot();
            if(!saved.values[`mls:group:${intent.conversationId}`])await runtime.createConversation(peer,intent.conversationId);
            saved=await vault.snapshot();
            const transfer=saved.values[`mls:membership:${intent.conversationId}`] || await runtime.addPeer(intent.conversationId,decode(p.keyPackage));
            await operation('transfer',{...transfer,commit:encode(transfer.commit),welcome:encode(transfer.welcome),tree:encode(transfer.tree)},transfer.id);
          }
          await syncInternal();await runtime.prepareKeyPackage();const g=groups.find(g=>g.creator===peer || g.recipient===peer);return {status:g?.status || 'pending'};
        });
      }
      async function replace(peer,deviceId,expectedFingerprint) {
        return serialize(async()=>{
          await syncInternal();const directory=await operation('directory',{peer}),g=directory.group;
          if(!g || g.status!=='active' || (g.creator===owner?g.creator_device:g.recipient_device)!==own.id)fail('encrypted_membership_required');
          let saved=await vault.snapshot(),intent=saved.values[`mls:replacement:${peer}`];
          const record=groups.find(group=>group.id===g.id)?.replacement;
          const candidates=record?.initiator_device===own.id && record.status!=='accepted' ? (groups.find(group=>group.id===g.id)?.packages || []) : directory.packages;
          const p=candidates.find(p=>p.deviceId===deviceId && p.owner===peer);if(!p)fail('encrypted_package_unavailable');
          await verifyPackage(p,expectedFingerprint);
          if(!intent) {
            saved=await vault.snapshot();
            if(!saved.values[`mls:group:${g.id}`]?.confirmed || Object.entries(saved.values).some(([key,job])=>
              (key.startsWith('mls:outbox:') || key.startsWith('media:pending:')) && job.conversationId===g.id))fail('mls_pending_send_requires_retry');
            intent={id:crypto.randomUUID(),conversationId:g.id,previousEpoch:g.epoch,removedDeviceId:g.creator===peer?g.creator_device:g.recipient_device,
              replacementDeviceId:p.deviceId,packageHash:p.hash};
            await vault.write({expectedRevision:saved.revision,values:{[`mls:replacement:${peer}`]:intent}});
          }
          if(intent.replacementDeviceId!==p.deviceId || intent.packageHash!==p.hash)fail('encrypted_replacement_conflict');
          await operation('replace-reserve',intent,intent.id);
          saved=await vault.snapshot();
          const transfer=saved.values[`mls:membership:${g.id}`] || await runtime.replacePeer(g.id,intent.removedDeviceId,intent.previousEpoch,decode(p.keyPackage),intent.id);
          await operation('replace-transfer',{...transfer,commit:encode(transfer.commit),welcome:encode(transfer.welcome),tree:encode(transfer.tree)},transfer.id);
          await syncInternal();return {status:'replacement-pending'};
        });
      }
      async function admitDevice(peer,deviceId,expectedFingerprint) {
        return serialize(async()=>{
          if(!multiDeviceEnabled)fail('encrypted_multidevice_disabled');
          await syncInternal();const directory=await operation('directory',{peer}),g=directory.group;
          if(!g || !directory.canAdmit || !await runtime.isEncrypted(peer))fail('encrypted_membership_required');
          const p=directory.packages.find(p=>p.deviceId===deviceId);if(!p)fail('encrypted_package_unavailable');
          await verifyPackage(p,expectedFingerprint);
          let saved=await vault.snapshot(),intent=saved.values[`mls:device-admission:${peer}`];
          if(!intent) {
            if(!saved.values[`mls:group:${g.id}`]?.confirmed || Object.entries(saved.values).some(([key,job])=>
              (key.startsWith('mls:outbox:')||key.startsWith('media:pending:'))&&job.conversationId===g.id))fail('mls_pending_send_requires_retry');
            intent={id:crypto.randomUUID(),conversationId:g.id,previousEpoch:g.epoch,actorOwner:owner,actorDeviceId:own.id,
              addedOwner:p.owner,addedDeviceId:p.deviceId,packageHash:p.hash};
            await vault.write({expectedRevision:saved.revision,values:{[`mls:device-admission:${peer}`]:intent}});
          }
          if(intent.addedDeviceId!==p.deviceId || intent.packageHash!==p.hash)fail('mls_device_intent_rejected');
          await operation('device-reserve',intent,intent.id);
          try {await syncInternal();}catch(error){if(!(error instanceof TypeError)&&error.status!==503)throw error;}
          return {status:'device-pending'};
        });
      }
      async function verifyAdmission(peer,fingerprints) {
        return serialize(async()=>{
          if(!multiDeviceEnabled || !fingerprints || Array.isArray(fingerprints))fail('mls_device_intent_rejected');
          await syncInternal();const g=groups.find(g=>g.creator===peer||g.recipient===peer);
          if(!g?.admission)fail('encrypted_membership_required');
          for(const p of g.packages||[]) {
            const saved=await vault.snapshot(),prior=saved.values[`mls:pin:${p.deviceId}`];
            await verifyPackage(p,p.deviceId===own.id?own.fingerprint:prior?.fingerprint||fingerprints[p.deviceId]);
          }
          await processAdmission(g);await syncInternal();return {status:groups.find(v=>v.id===g.id)?.status||'device-pending'};
        });
      }
      async function changeDevice(peer,removedDeviceId,replacementDeviceId=null,expectedFingerprint=null) {
        return serialize(async()=>{
          if(!multiDeviceEnabled)fail('encrypted_multidevice_disabled');
          await syncInternal();const directory=await operation('directory',{peer}),g=directory.group;
          if(!g || !directory.canChange || !await runtime.isEncrypted(peer))fail('encrypted_membership_required');
          const removed=directory.roster.find(m=>m.id===removedDeviceId);
          if(!removed || removed.id===own.id || !(removed.owner===owner||removed.status==='revoked'))fail('encrypted_membership_required');
          const p=replacementDeviceId?directory.packages.find(p=>p.deviceId===replacementDeviceId&&p.owner===removed.owner):null;
          if(replacementDeviceId && !p)fail('encrypted_package_unavailable');
          if(p)await verifyPackage(p,expectedFingerprint);
          let saved=await vault.snapshot(),intent=saved.values[`mls:device-admission:${peer}`];
          if(!saved.values[`mls:pin:${removed.id}`])fail('mls_identity_verification_failed');
          if(!intent) {
            if(!saved.values[`mls:group:${g.id}`]?.confirmed || Object.entries(saved.values).some(([key,job])=>
              (key.startsWith('mls:outbox:')||key.startsWith('media:pending:'))&&job.conversationId===g.id))fail('mls_pending_send_requires_retry');
            intent={id:crypto.randomUUID(),conversationId:g.id,previousEpoch:g.epoch,actorOwner:owner,actorDeviceId:own.id,
              removedOwner:removed.owner,removedDeviceId:removed.id,addedOwner:p?.owner||'',addedDeviceId:p?.deviceId||'',packageHash:p?.hash||''};
            await vault.write({expectedRevision:saved.revision,values:{[`mls:device-admission:${peer}`]:intent}});
          }
          if(intent.removedDeviceId!==removed.id || intent.addedDeviceId!==(p?.deviceId||'') || intent.packageHash!==(p?.hash||''))fail('mls_device_intent_rejected');
          await operation('device-change-reserve',intent,intent.id);
          try{await syncInternal();}catch(error){if(!(error instanceof TypeError)&&error.status!==503)throw error;}
          return {status:'device-pending'};
        });
      }
      async function resumeReplacement(peer) {
        return serialize(async()=>{
          await syncInternal();const g=groups.find(g=>g.creator===peer || g.recipient===peer);
          if(g?.status==='active') {
            if(await runtime.conversationId(peer)!==g.id)fail('mls_replacement_recovery_required');
            return {status:'active'};
          }
          if(!g?.replacement || g.replacement.initiator_device!==own.id)fail('encrypted_membership_required');
          const recovery=await replacementRecovery(g,await vault.snapshot());
          if(recovery.reason)fail('mls_replacement_recovery_required');
          if(g.replacement.status==='pending')return {status:'replacement-pending'};
          const {intent,p,pin}=recovery;
          if(p)await verifyPackage(p,pin.fingerprint);
          const transfer=recovery.transfer || await runtime.replacePeer(g.id,intent.removedDeviceId,intent.previousEpoch,decode(p.keyPackage),intent.id);
          await operation('replace-transfer',{...transfer,commit:encode(transfer.commit),welcome:encode(transfer.welcome),tree:encode(transfer.tree)},transfer.id);
          await syncInternal();return {status:'replacement-pending'};
        });
      }
      async function requireActiveMembership(peer) {
        try {await syncInternal();}catch(error){if(!(error instanceof TypeError) && error.status!==503)throw error;}
        const saved=await intentSnapshot(),id=saved.values[`mls:route:${peer}`]?.conversationId,g=groups.find(g=>g.id===id);
        if(!g)fail('encrypted_membership_required');
        if(g.status==='blocked')fail('encrypted_access_denied');
        if(g.status!=='active' || saved.values[`mls:replacement:${peer}`] || saved.values[`mls:device-admission:${peer}`])fail('encrypted_membership_pending');
        if(await runtime.conversationId(peer)!==id)fail('encrypted_membership_required');
      }
      async function wirePayload(payload) {
        const rich=globalThis.WingaRichContent;
        if(!rich)return payload;
        let value=payload.richContent;
        if(value&&rich.event(value))fail('rich_event_requires_action');
        const products=(payload.productItems||[]).map(item=>item.productId).filter(Boolean);
        if(!value&&products.length)value=rich.create('product',payload.message||'',{ids:[...new Set(products)]});
        if(!value&&payload.productId)value=rich.create('product',payload.message||'',{ids:[payload.productId]});
        const reply=payload.replyToMessageId?{id:payload.replyToMessageId,quote:''}:null;
        if(!value&&(reply||payload.message?.startsWith('WINGA-CONTENT/')))value=rich.create('text',payload.message,{},reply);
        if(value&&reply)value={...value,reply};
        return {clientMessageId:payload.clientMessageId,receiverId:payload.receiverId,messageType:'text',
          message:value?rich.encode(value):payload.message};
      }
      async function intentWrite(id,change) {
        for(let attempt=0;attempt<5;attempt++) {
          try {
          current();const saved=await vault.snapshot(),key='send:intent:'+id;
          const value=await change(saved,saved.values[key]);if(!value)return;
          await vault.write({expectedRevision:saved.revision,values:{[key]:value}});current();return value;}
          catch(error){if(error.code!=='crypto_vault_revision_conflict'||attempt===4)throw error;}
        }
      }
      async function intentSnapshot() {
        for(let attempt=0;attempt<5;attempt++)try{current();return await vault.snapshot();}
        catch(error){if(error.code!=='crypto_vault_revision_conflict'||attempt===4)throw error;}
      }
      async function stageMessage(payload) {
        current();const wire=await wirePayload(structuredClone(payload));
        const initial=await intentSnapshot(),route=initial.values['mls:route:'+wire.receiverId]?.conversationId;
        if(!route)fail('encrypted_membership_required');
        if(!initial.values['mls:group:'+route]?.confirmed)fail('encrypted_membership_pending');
        if(initial.values['mls:replacement:'+wire.receiverId]||initial.values['mls:device-admission:'+wire.receiverId]
          ||initial.values['mls:membership:'+route]||groups.some(g=>g.id===route&&g.status!=='active'))fail('encrypted_membership_pending');
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(wire.clientMessageId||'')
          ||!/^[A-Za-z0-9._:-]{1,128}$/.test(wire.receiverId||'')||wire.receiverId===owner
          ||wire.messageType&&wire.messageType!=='text'||wire.productId||wire.productName||wire.productItems?.length||wire.replyToMessageId||wire.mediaId
          ||typeof wire.message!=='string'||!wire.message.trim()
          ||new TextEncoder().encode(wire.message).length>16384)fail('mls_content_unsupported');
        const item=await intentWrite(wire.clientMessageId,async(saved,prior)=>{
          const id=saved.values['mls:route:'+wire.receiverId]?.conversationId,g=saved.values['mls:group:'+id];
          if(!id||!g?.confirmed||g.kind==='shopping-room')fail('mls_group_required');
          if(saved.values['mls:replacement:'+wire.receiverId]||saved.values['mls:device-admission:'+wire.receiverId]
            ||saved.values['mls:membership:'+id])fail('encrypted_membership_pending');
          if(prior&&(prior.peer!==wire.receiverId||prior.message!==wire.message||prior.conversationId!==id||prior.deviceId!==own.id))fail('mls_send_retry_conflict');
          if(saved.values['history:'+wire.clientMessageId]||saved.values['mls:outbox:'+wire.clientMessageId]
            ||vault.lookup&&await vault.lookup('history:'+wire.clientMessageId))return;
          return prior?{...prior,waiting:true}:{id:wire.clientMessageId,owner,peer:wire.receiverId,conversationId:id,deviceId:own.id,
            message:wire.message,timestamp:new Date().toISOString(),status:'pending',waiting:true,localIntent:true};
        });
        if(item){localSends.add(item.id);onChange({localMessage:messageView(item)});}return wire;
      }
      async function transmitMessage(wire) {
        try {
          await requireActiveMembership(wire.receiverId);
          const saved=await intentSnapshot(),intent=saved.values['send:intent:'+wire.clientMessageId];
          if(intent&&(intent.conversationId!==await runtime.conversationId(wire.receiverId)||intent.deviceId!==own.id))fail('mls_send_retry_conflict');
          const result=messageView(await runtime.sendMessage(wire));onChange({localMessage:result});return result;
        }catch(error) {
          const failed=await intentWrite(wire.clientMessageId,(_saved,prior)=>prior?{...prior,waiting:false}:null);
          const item=(await runtime.history(wire.receiverId)).find(item=>item.id===wire.clientMessageId&&item.status==='pending')||failed;
          if(item)onChange({localMessage:messageView(item)});
          if(!item||(!(error instanceof TypeError)&&error.status!==503&&error.code!=='crypto_vault_revision_conflict'))throw error;
          return messageView(item);
        }
      }
      async function mutation(peer,type,targetId,value='') {
        await requireActiveMembership(peer);
        const rich=globalThis.WingaRichContent;if(!rich)fail('rich_content_unavailable');
        const history=await runtime.history(peer),target=history.find(item=>item.id===targetId);
        if(!target||target.conversationId!==await runtime.conversationId(peer)||target.status==='pending')fail('rich_target_unavailable');
        if(type==='edit'&&!rich.canEdit(target,owner))fail('rich_edit_window_closed');
        const data=type==='reaction'?{targetId,emoji:value}:{targetId};
        const content=rich.create(type,type==='edit'?value:'',data);
        const id=crypto.randomUUID();let result;
        try {result=await runtime.sendMessage({clientMessageId:id,receiverId:peer,messageType:'text',message:rich.encode(content)});}
        catch(error) {
          if(!(error instanceof TypeError)&&error.status!==503)throw error;
          result=(await runtime.history(peer)).find(item=>item.id===id);if(!result)throw error;
        }
        queueMicrotask(onChange);return messageView(result);
      }
      async function seller(action,args){
        if(!roomSession)fail('encrypted_rooms_disabled');const rich=globalThis.WingaRichContent;
        const sha=wire=>digest(new TextEncoder().encode(wire));
        const save=async(key,value)=>{const s=await vault.snapshot();await vault.write({expectedRevision:s.revision,values:{[key]:value}});};
        const accepted=async(peer,id,wire)=>{await requireActiveMembership(peer);const item=await runtime.sendMessage({clientMessageId:id,receiverId:peer,messageType:'text',message:wire});
          if(!item||item.status==='pending')fail('encrypted_seller_question_pending');return item;};
        if(action==='pending'){const s=await vault.snapshot();return Object.entries(s.values).filter(([k,v])=>k.startsWith('room:seller-question:')&&!v.completed&&(!args[0]||v.roomId===args[0])).map(([,v])=>({id:v.id,roomId:v.roomId,sellerId:v.sellerId,question:v.question}));}
        if(!rich)fail('rich_content_unavailable');
        if(action==='ask'){
          const [roomId,shareId,question,productId,sellerId,confirmed]=args;
          if(confirmed!==true)fail('room_seller_consent_required');
          const board=await roomSession.board(roomId),share=board.products.find(p=>p.shareId===shareId&&p.productId===productId);
          if(!share||sellerId===owner)fail('room_product_required');
          const codec=await import('/src/chat/shopping-room-content.mjs'),s=await vault.snapshot();
          const existing=Object.values(s.values).find(v=>v?.roomId===roomId&&v?.shareId===shareId&&v?.kind==='seller-question'&&!v.completed);
          if(existing){if(existing.question!==question||existing.sellerId!==sellerId)fail('encrypted_seller_request_conflict');return seller('resume',[existing.id]);}
          const id=crypto.randomUUID();codec.createSellerQuestion(board,{shareId,question,correlationId:id,confirmed});
          const draft={kind:'seller-question',id,roomId,shareId,question,productId,sellerId,roomMessageId:crypto.randomUUID(),completed:false};
          await save('room:seller-question:'+id,draft);return seller('resume',[id]);
        }
        if(action==='resume'){
          const s=await vault.snapshot(),d=s.values['room:seller-question:'+args[0]];if(!d)fail('room_product_required');
          await requireActiveMembership(d.sellerId);const directId=await runtime.conversationId(d.sellerId),wire=rich.encode(rich.create('seller-question',d.question,{questionId:d.id,productId:d.productId}));
          await operation('seller-question-reserve',{id:d.id,conversationId:d.roomId,shareId:d.shareId,productId:d.productId,sellerId:d.sellerId,directId,questionHash:await sha(wire)},d.id);
          await accepted(d.sellerId,d.id,wire);
          await roomSession.command(d.roomId,'seller-question',{questionId:d.id,shareId:d.shareId,productId:d.productId,sellerId:d.sellerId,question:d.question},d.roomMessageId);
          await save('room:seller-question:'+d.id,{...d,completed:true});onChange();return {id:d.id};
        }
        if(action==='read'){
          const [peer,messageId]=args;await requireActiveMembership(peer);const m=(await runtime.history(peer)).find(m=>m.id===messageId&&m.owner===peer&&m.status!=='pending'),c=rich.parse(m?.message);
          if(c?.type!=='seller-question'||c.data.questionId!==m.id)fail('encrypted_seller_request_rejected');
          const r=await operation('seller-question-read',{id:c.data.questionId,conversationId:m.conversationId});
          if(r.question?.sellerId!==owner||r.question.buyerId!==peer||r.question.productId!==c.data.productId||r.question.questionHash!==await sha(m.message))fail('encrypted_seller_request_rejected');
          const s=await vault.snapshot();return {question:c.text,productId:c.data.productId,answered:r.answered,draft:s.values['room:seller-answer:'+m.id]?.answer||''};
        }
        if(action==='answer'){
          const [peer,messageId,answer,confirmed]=args;if(confirmed!==true)fail('room_seller_consent_required');
          const q=await seller('read',[peer,messageId]),key='room:seller-answer:'+messageId,s=await vault.snapshot();
          const wire=rich.encode(rich.create('seller-response',answer,{questionId:messageId,productId:q.productId}));
          let d=s.values[key];if(d&&d.wire!==wire)fail('encrypted_seller_answer_conflict');
          if(!d){d={id:crypto.randomUUID(),wire,answer};await save(key,d);}
          const item=await accepted(peer,d.id,wire);
          await operation('seller-answer-register',{id:messageId,conversationId:item.conversationId,messageId:d.id,answerHash:await sha(wire)},d.id);
          onChange();return {id:d.id};
        }
        if(action==='share'){
          const [peer,messageId,confirmed]=args;if(confirmed!==true)fail('room_seller_consent_required');await requireActiveMembership(peer);
          const m=(await runtime.history(peer)).find(m=>m.id===messageId&&m.owner===peer&&m.status!=='pending'),c=rich.parse(m?.message);
          if(c?.type!=='seller-response')fail('encrypted_seller_answer_rejected');
          const key='room:seller-question:'+c.data.questionId,s=await vault.snapshot(),d=s.values[key];
          if(!d?.completed||d.sellerId!==peer||d.productId!==c.data.productId)fail('encrypted_seller_request_rejected');
          const r=await operation('seller-evidence',{id:d.id,conversationId:d.roomId}),a=r?.answer,p=a?.proof?.payload;
          const pinned=(await pins()).find(pin=>pin.id===m.deviceId&&pin.owner===peer&&pin.status==='active');
          if(r.question?.buyerId!==owner||r.question.sellerId!==peer||a?.messageId!==m.id||a.answerHash!==await sha(m.message)
            ||p?.id!==d.id||p.messageId!==m.id||p.conversationId!==m.conversationId||p.answerHash!==a.answerHash||a.anchor?.owner!==peer
            ||a.proof.actorId!==m.deviceId||!pinned||pinned.publicKey!==a.anchor.publicKey||pinned.fingerprint!==a.anchor.fingerprint
            ||await digest(decode(a.anchor.publicKey))!==a.anchor.fingerprint)fail('encrypted_seller_answer_rejected');
          await verifyProof(a.proof,'seller-answer-register',pinned);
          const relay=d.relay||{id:crypto.randomUUID(),answerId:m.id,answer:c.text};
          if(relay.answerId!==m.id||relay.answer!==c.text)fail('encrypted_seller_answer_conflict');
          await save(key,{...d,relay});await roomSession.command(d.roomId,'seller-response',{questionId:d.id,answerId:m.id,answer:c.text},relay.id);
          onChange();return {roomId:d.roomId};
        }
        fail('encrypted_seller_request_invalid');
      }
      const service={
        seller:(action,args=[])=>serialize(()=>seller(action,args)),
        shoppingRoom:(action,args=[])=>serialize(async()=>{if(!roomSession||!['limits','preferences','setPreference','list','sync','pendingTransitions','inspectOwners','create','resumeCreate','join','inspectChange','change','resumeChange','transferAdmin','leave','resumeLeave','history','board','send','command','markRead','sendMedia','retryMedia','downloadMedia','pendingMedia'].includes(action))fail('encrypted_rooms_disabled');const result=await roomSession[action](...args);if(action==='sync')startHistorySync();return result;}),
        inspect,enable,replace,resumeReplacement,admitDevice,verifyAdmission,changeDevice,sync:()=>serialize(syncInternal),
        isEncrypted:async peer=>{
          if(await runtime.isEncrypted(peer))return true;
          await serialize(syncInternal);
          return Boolean(groups.find(g=>g.creator===peer || g.recipient===peer));
        },
        history:async peer=>{
          const history=[...(await runtime.history(peer)),...(media?(await media.pendingHistory()).filter(v=>!peer||v.peer===peer):[])];
          const saved=await vault.snapshot(),ids=new Set(history.map(v=>v.id));
          for(const [key,item] of Object.entries(saved.values))if(key.startsWith('send:intent:')&&(!peer||item.peer===peer)&&!ids.has(item.id))history.push({...item,waiting:localSends.has(item.id)});
          return (globalThis.WingaRichContent?WingaRichContent.project(history,owner):history).map(messageView);
        },
        mutateMessage:(peer,type,id,value)=>serialize(()=>mutation(peer,type,id,value)),
        sendEncryptedMedia:(peer,file,text,kind)=>serialize(async()=>{if(!media)fail('private_media_disabled');await requireActiveMembership(peer);return messageView(await media.send(peer,file,text,kind));}),
        stageMediaDraft:(peer,file,kind)=>serialize(async()=>{if(!media)fail('private_media_disabled');await requireActiveMembership(peer);return media.stageDraft(peer,file,'',kind);}),
        readMediaDraft:peer=>serialize(async()=>{if(!media)fail('private_media_disabled');return media.draft(peer);}),
        discardMediaDraft:peer=>serialize(async()=>{if(!media)fail('private_media_disabled');return media.discardDraft(peer);}),
        sendMediaDraft:(peer,text)=>serialize(async()=>{if(!media)fail('private_media_disabled');await requireActiveMembership(peer);return messageView(await media.sendDraft(peer,text));}),
        downloadEncryptedMedia:id=>serialize(async()=>{if(!media)fail('private_media_disabled');return media.download(id);}),
        sendMessage:async payload=>{const wire=await stageMessage(payload);try{return await serialize(()=>transmitMessage(wire));}finally{localSends.delete(wire.clientMessageId);}},
        retryMessage:id=>serialize(async()=>{
          const saved=await vault.snapshot(),intent=saved.values['send:intent:'+id];
          if(intent)return transmitMessage({clientMessageId:id,receiverId:intent.peer,message:intent.message,messageType:'text'});
          const item=(media?await media.resume(id):null)||await runtime.retryMessage(id);queueMicrotask(onChange);return item?messageView(item):null;
        }),
        markRead:(peer,messageIds=[])=>serialize(async()=>{
          if(document.visibilityState!=='visible' || !document.hasFocus())return;
          const visible=[...document.querySelectorAll('[data-chat-read-user]')].some(el=>el.dataset.chatReadUser===peer && el.getClientRects().length);
          if(!visible)return;
          for(const item of await runtime.history(peer))if(item.owner===peer && item.status!=='read' && messageIds.includes(item.id)) {
            await acknowledge(item,'read');
            const s=await vault.snapshot();await vault.write({expectedRevision:s.revision,values:{[`history:${item.id}`]:{...item,status:'read'}}});
          }
        }),
        historySyncState:id=>nativeHistory?.state(id)||'disabled',
        close(){closed=true;nativeHistory?.close();runtime.close();vault.close();identity.close();}
      };
      if(initialSync!==false)await service.sync();return service;
    }catch(error){nativeHistory?.close();runtime?.close();vault.close();identity.close();throw error;}
  }
  globalThis.WingaEncryptionSession={createEncryptionSession};
})();
