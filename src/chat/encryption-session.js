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
      script.onerror=()=>reject(new Error('mls_runtime_unavailable'));document.head.append(script); // i18n-gate: allow -- internal diagnostic, UI displays translated failure
    });
    return bundle;
  }
  async function createEncryptionSession({getSession,deviceRequest,packageRequest,operationRequest,mediaEnabled=false,mediaRequest,onChange=()=>{}}) {
    await loadRuntime();
    const initial={...getSession()},owner=initial.username;
    let closed=false,runtime,media,groups=[],tail=Promise.resolve(),lastSnapshot='';
    const current=()=>{const s=getSession();if(closed || s?.username!==owner || s?.token!==initial.token || s?.sessionId!==initial.sessionId)fail('mls_session_changed');};
    const identity=await WingaCryptoDevices.createCryptoDeviceClient({getSession,request:deviceRequest});
    const vault=await WingaEncryptedVault.createEncryptedVault({owner,getSession});
    const pins=async()=>Object.entries((await vault.snapshot()).values).filter(([k])=>k.startsWith('mls:pin:')).map(([,v])=>v);
    async function operation(action,payload,id) {current();const signed=await identity.signCryptoOperation(action,payload,id);const r=await operationRequest(signed);current();return r;}
    const serialize=work=>{const result=tail.then(()=>navigator.locks.request(`winga-encryption-session:${owner}`,async()=>{current();return work();}));tail=result.catch(()=>{});return result;};
    function messageView(item) {
      const a=globalThis.WingaEncryptedMedia?.attachment(item);
      return {...item,message:a?a.text:item.message,...(a?{attachmentId:a.attachment.object.id,attachmentName:a.attachment.name}:{}),senderId:item.owner,receiverId:item.peer,messageType:a?'file':'text',productId:'',productName:'',productItems:[],replyToMessageId:'',encrypted:true,
        isDelivered:['delivered','read'].includes(item.status),isRead:item.status==='read',deviceDeliveredAt:['delivered','read'].includes(item.status)?item.timestamp:null,
        sendState:item.status==='pending'?'failed':item.status,isQueued:item.status==='pending'};
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
    async function verifyProof(proof,action) {
      const pin=(await pins()).find(v=>v.id===proof.actorId && v.owner===proof.owner && v.status==='active');
      if(!pin || proof.action!==action)fail('mls_receipt_rejected');
      const key=await crypto.subtle.importKey('raw',decode(pin.publicKey),'Ed25519',false,['verify']);
      const h=await digest(new TextEncoder().encode(JSON.stringify(proof.payload,Object.keys(proof.payload).sort())));
      const bytes=new TextEncoder().encode(JSON.stringify(['winga-crypto-transport',1,proof.owner,proof.sessionId,proof.action,proof.actorId,proof.requestId,proof.issuedAt,h]));
      if(!await crypto.subtle.verify('Ed25519',key,decode(proof.signature),bytes))fail('mls_receipt_rejected');
      return pin;
    }
    async function verifyReceipt(proof) {
      const pin=await verifyProof(proof,'receipt');
      await runtime.applyReceipt(proof.payload,pin);
      await operation('receipt-ack',proof.payload);
    }
    async function acknowledge(item,kind) {
      await operation('receipt',{id:item.id,conversationId:item.conversationId,epoch:item.epoch,hash:item.hash,kind});
    }
    try {
      runtime=await WingaMlsCandidate.createMlsRuntime({getSession,vault,identityClient:identity,
        publishPackage:packageRequest,trustedPins:pins,transport:{send:job=>operation('send',{...job,ciphertext:encode(job.ciphertext)},job.id)}});
      await runtime.initialize();const own=await runtime.prepareKeyPackage();
      if(mediaEnabled && globalThis.WingaEncryptedMedia && typeof mediaRequest==='function')media=await WingaEncryptedMedia.createMediaClient({owner,getSession,vault,runtime,identity,operation,request:mediaRequest,onChange});
      async function syncInternal() {
        const result=await operation('poll',{});if(result?.version!==1 || !Array.isArray(result.groups))fail('mls_transport_invalid');
        groups=result.groups;
        const saved=await vault.snapshot();
        for(const g of groups) {
          if(g.status==='blocked')continue;
          const peer=g.creator===owner?g.recipient:g.creator;
          const pending=saved.values[`mls:membership:${g.id}`];
          if(g.creator===owner && pending) {
            if(g.status==='active') {
              const proof=g.acceptance;
              if(proof?.actorId!==g.recipient_device || proof.payload?.conversationId!==g.id || proof.payload?.transferId!==pending.id)fail('mls_membership_confirmation_rejected');
              await verifyProof(proof,'accept');await runtime.confirmMembership(g.id,pending.id);
            }
            else if(g.status==='reserved')await operation('transfer',{...pending,commit:encode(pending.commit),welcome:encode(pending.welcome),tree:encode(pending.tree)},pending.id);
          }
          const accepted=saved.values[`mls:group:${g.id}`]?.acceptedTransfer;
          if(g.recipient===owner && g.status==='pending' && accepted===g.transfer?.id)await operation('accept',{conversationId:g.id,transferId:accepted},accepted);
          if(g.status!=='active' || !saved.values[`mls:route:${peer}`])continue;
          for(const m of g.messages) {
            let item;
            try {
              const proof=m.proof,p=proof?.payload;
              if(proof?.owner!==peer || proof.actorId!==m.sender_device || p?.id!==m.id || p.conversationId!==g.id || p.epoch!==m.epoch || p.hash!==m.hash || p.ciphertext!==m.ciphertext)fail('mls_envelope_binding_rejected');
              await verifyProof(proof,'send');
              item=await runtime.receive(peer,{...m,conversationId:g.id,ciphertext:decode(m.ciphertext)});
            }catch(error) {
              const invalid=['mls_wire_rejected','mls_envelope_binding_rejected','mls_application_required','mls_content_binding_rejected','mls_sender_rejected','mls_message_id_conflict','mls_replay_conflict','mls_ciphertext_rejected','mls_receipt_rejected'];
              if(!invalid.includes(error.code))throw error;
              await operation('reject',{id:m.id,conversationId:g.id,epoch:m.epoch,hash:m.hash,reason:'invalid-ciphertext'});continue;
            }
            await acknowledge(item,'delivered');
          }
          for(const proof of g.receipts)await verifyReceipt(proof);
        }
        if(media)for(const job of await media.list())if(groups.some(g=>g.id===job.conversationId&&g.status==='active'))await media.resume(job.id);
        for(const item of await runtime.history())if(item.owner===owner && item.status==='pending'
          && groups.some(g=>g.id===item.conversationId && g.status==='active')) {
          await runtime.retryMessage(item.id);queueMicrotask(onChange);
        }
        current();const snapshot=JSON.stringify(groups);
        if(snapshot!==lastSnapshot){lastSnapshot=snapshot;queueMicrotask(onChange);}return groups;
      }
      async function inspect(peer) {
        return serialize(async()=>{
          await syncInternal();const g=groups.find(g=>g.creator===peer || g.recipient===peer);
          if(g?.status==='active' && await runtime.isEncrypted(peer))return {status:'active',ownFingerprint:own.fingerprint,mediaEnabled:Boolean(media)};
          if(g?.status==='active')return {status:'recovery-required',ownFingerprint:own.fingerprint};
          if(g?.status==='blocked')return {status:'blocked',ownFingerprint:own.fingerprint};
          const candidates=g?.packages?.filter(p=>p.owner===peer) || (await operation('directory',{peer})).packages;
          return {status:g?.status || 'available',ownFingerprint:own.fingerprint,packages:candidates,group:g};
        });
      }
      async function enable(peer,deviceId,expectedFingerprint) {
        return serialize(async()=>{
          await syncInternal();const group=groups.find(g=>g.creator===peer || g.recipient===peer);
          if(group?.status==='blocked')fail('encrypted_access_denied');
          const candidates=group?.packages?.filter(p=>p.owner===peer) || (await operation('directory',{peer})).packages;
          const p=candidates.find(p=>p.deviceId===deviceId);if(!p)fail('encrypted_package_unavailable');
          await verifyPackage(p,expectedFingerprint);
          if(group && group.recipient===owner) {
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
      const service={
        inspect,enable,sync:()=>serialize(syncInternal),
        isEncrypted:async peer=>Boolean(groups.find(g=>g.creator===peer || g.recipient===peer)) || runtime.isEncrypted(peer),
        history:async peer=>[...(await runtime.history(peer)),...(media?(await media.pendingHistory()).filter(v=>!peer||v.peer===peer):[])].map(messageView),
        sendEncryptedMedia:(peer,file,text)=>serialize(async()=>{if(!media)fail('private_media_disabled');return messageView(await media.send(peer,file,text));}),
        downloadEncryptedMedia:id=>serialize(async()=>{if(!media)fail('private_media_disabled');return media.download(id);}),
        sendMessage:payload=>serialize(async()=>{
          try {const result=messageView(await runtime.sendMessage(payload));queueMicrotask(onChange);return result;}
          catch(error) {
            const item=(await runtime.history(payload.receiverId)).find(item=>item.id===payload.clientMessageId && item.status==='pending');
            if(!item || (!(error instanceof TypeError) && error.status!==503))throw error;
            queueMicrotask(onChange);return messageView(item);
          }
        }),
        retryMessage:id=>serialize(async()=>{const item=(media?await media.resume(id):null)||await runtime.retryMessage(id);queueMicrotask(onChange);return item?messageView(item):null;}),
        markRead:(peer,messageIds=[])=>serialize(async()=>{
          if(document.visibilityState!=='visible' || !document.hasFocus())return;
          const visible=[...document.querySelectorAll('[data-chat-read-user]')].some(el=>el.dataset.chatReadUser===peer && el.getClientRects().length);
          if(!visible)return;
          for(const item of await runtime.history(peer))if(item.owner===peer && item.status!=='read' && messageIds.includes(item.id)) {
            await acknowledge(item,'read');
            const s=await vault.snapshot();await vault.write({expectedRevision:s.revision,values:{[`history:${item.id}`]:{...item,status:'read'}}});
          }
        }),
        close(){closed=true;runtime.close();vault.close();identity.close();}
      };
      await service.sync();return service;
    }catch(error){runtime?.close();vault.close();identity.close();throw error;}
  }
  globalThis.WingaEncryptionSession={createEncryptionSession};
})();
