(() => {
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const decode=text=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  async function transferHash(t){return hash(new TextEncoder().encode(JSON.stringify(['winga-mls-room-transfer',1,t.intent,t.epoch,...await Promise.all(['commit','welcome','tree'].map(k=>hash(t[k])))])));}
  function createRoomSession({owner,runtime,vault,operation,verifyPackage,verifyProof,verifyArchiveProof=verifyProof,mediaFactory,historyRecoveryEnabled=false,roomLimits={maxOwners:12,maxDevices:24},onChange=()=>{}}){
    if(!roomLimits||typeof roomLimits!=='object'||Array.isArray(roomLimits)||Object.keys(roomLimits).sort().join(',')!=='maxDevices,maxOwners'
      ||!Number.isInteger(roomLimits.maxOwners)||roomLimits.maxOwners<3||roomLimits.maxOwners>12
      ||!Number.isInteger(roomLimits.maxDevices)||roomLimits.maxDevices<roomLimits.maxOwners||roomLimits.maxDevices>24)fail('encrypted_room_limits_invalid');
    const limits=()=>({maxOwners:roomLimits.maxOwners,maxDevices:roomLimits.maxDevices});
    roomLimits=Object.freeze(limits());
    let rooms=[],directory=[],content;const mediaClients=new Map(),sellerCache=new Map(),epochCache=new Map();
    const module=()=>content||(content=import('/src/chat/shopping-room-content.mjs'));
    const need=(ok,code='encrypted_room_transport_rejected')=>{if(!ok)fail(code);};
    function preference(value){need(value&&Object.keys(value).sort().join(',')==='archived,muted,revision'
      &&typeof value.revision==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value.revision)
      &&typeof value.muted==='boolean'&&typeof value.archived==='boolean');return structuredClone(value);}
    async function preferences(id){return preference(await operation('room-preferences',{conversationId:id}));}
    async function setPreference(id,revision,field,value){need(['muted','archived'].includes(field)&&typeof value==='boolean');
      return preference(await operation('room-preference-save',{conversationId:id,revision,field,value}));}
    async function historyEpoch(id,epoch,fresh=false){
      const key=id+':'+epoch;if(!fresh&&epochCache.has(key))return structuredClone(epochCache.get(key));
      const r=await operation('room-history-epoch',{conversationId:id,epoch});
      need(r&&Object.keys(r).sort().join(',')==='acceptances,conversationId,epoch,intent,transferHash,version'
        &&r.version===1&&r.conversationId===id&&r.epoch===epoch&&typeof r.intent==='string'&&r.intent.length<=65536
        &&typeof r.transferHash==='string'&&/^[a-f0-9]{64}$/.test(r.transferHash)&&Array.isArray(r.acceptances)&&r.acceptances.length<=24);
      epochCache.set(key,structuredClone(r));if(epochCache.size>1024)epochCache.delete(epochCache.keys().next().value);return r;
    }
    function historyGroups(){return rooms.filter(r=>r.status==='active'&&r.transition?.status==='accepted'&&!r.clientError)
      .map(r=>({...r,roster:JSON.parse(JSON.parse(r.transition.intent).roster).map(m=>({...m,status:'active'}))}));}
    async function validateHistoryMembership(g){
      const latest=historyGroups().find(r=>r.id===g.id),s=await vault.snapshot(),local=s.values[`mls:group:${g.id}`];
      need(latest?.epoch===g.epoch&&local?.kind==='shopping-room'&&local.confirmed&&local.roomRevision===latest.revision
        &&!s.values[`mls:membership:${g.id}`],'history_sync_membership_changed');
      const check=await operation('room-check',{conversationId:g.id,epoch:g.epoch,revision:latest.revision});
      need(check.active===true&&check.conversationId===g.id&&check.epoch===g.epoch,'history_sync_membership_changed');
    }
    async function validateHistory(g,items){
      const epochs=new Map();
      for(const item of Object.values(items)){
        if(!epochs.has(item.epoch)){
          need(epochs.size<1024,'history_sync_limit');const r=await historyEpoch(g.id,item.epoch,true),i=JSON.parse(r.intent),members=JSON.parse(i.roster);
          need(i.kind==='shopping-room'&&i.conversationId===g.id&&String(BigInt(i.previousEpoch)+1n)===item.epoch
            &&members.some(m=>m.owner===owner),'history_sync_room_membership_rejected');epochs.set(item.epoch,members);
        }
        need(epochs.get(item.epoch).some(m=>m.id===item.deviceId&&m.owner===item.owner),'history_sync_room_sender_rejected');
      }
    }
    async function readIntent(i){
      const r=await operation('room-intent',{conversationId:i.conversationId,transitionId:i.id});
      const t=r?.room?.transition;
      need(r?.version===1&&t?.id===i.id&&t.intent===JSON.stringify(i)&&t.reservation_proof?.payload?.intent===t.intent
        &&t.reservation_proof.actorId===i.actorDeviceId&&t.reservation_proof.owner===i.actorOwner);
      await verifyProof(t.reservation_proof,'room-reserve');return r.room;
    }
    const authorization={
      async verifyIntent(i){await readIntent(i);return true;},
      async check(id,epoch,revision){return operation('room-check',{conversationId:id,epoch,revision});},
      historyEpoch,
      async confirm(t){const room=await readIntent(JSON.parse(t.intent));need(room.transition.status==='accepted');
        const h=await transferHash(t);need(room.transition.transfer_hash===h);
        return {status:'active',conversationId:t.conversationId,epoch:t.epoch,transferHash:h};}
    };
    async function approve(room){
      const i=JSON.parse(room.transition.intent),roster=JSON.parse(i.roster);
      for(const m of roster){const pkg=room.packages.find(p=>p.deviceId===m.id&&p.owner===m.owner&&p.fingerprint===m.fingerprint
        &&encode(new Uint8Array(m.key))===p.mlsPublicKey);need(pkg,'mls_identity_verification_failed');await verifyPackage(pkg,m.fingerprint);}
      await readIntent(i);
    }
    async function accept(room){
      const rt=runtime(),t=room.transition;if(!t.transfer)return;
      await approve(room);await verifyProof(t.transfer_proof,'room-transfer');
      need(JSON.stringify(t.transfer_proof.payload)===JSON.stringify(t.transfer),'encrypted_room_transfer_rejected');
      const transfer=WingaMlsCandidate.decodeRoomTransferPayload(t.transfer),saved=await vault.snapshot();
      const existing=saved.values[`mls:group:${room.id}`],pending=saved.values[`mls:membership:${room.id}`];
      if(!existing)await rt.room.acceptWelcome(transfer);
      else if(!pending&&existing.roomRevision!==JSON.parse(t.intent).revision)await rt.room.applyCommit(transfer);
      const next=await vault.snapshot();
      if(next.values[`mls:membership:${room.id}`]){
        const a=await rt.room.acceptance(room.id),h=await transferHash(transfer);
        await operation('room-accept',{conversationId:room.id,transitionId:t.id,transferHash:h,signature:encode(a.signature)});
        const latest=await readIntent(JSON.parse(t.intent));
        if(latest.transition.status==='accepted')await rt.room.confirm(room.id,latest.acceptances.map(a=>({...a,signature:decode(a.signature)})));
      }
    }
    async function list(){
      const collected=[],seen=new Set();let after=null;
      do{const r=await operation('room-poll',{after});need(r?.version===1&&Array.isArray(r.rooms)&&r.rooms.length<=100);
        for(const room of r.rooms){need(!seen.has(room.id));if(room.preferences!==undefined)room.preferences=preference(room.preferences);seen.add(room.id);collected.push(room);}
        if(r.next)need(r.next===r.rooms.at(-1)?.id&&(!after||r.next>after));after=r.next;
      }while(after);rooms=collected;return structuredClone(rooms);
    }
    async function sync(){
      await list();
      for(const room of rooms){if(room.status==='removed')continue;
        try{
        const saved=await vault.snapshot(),trusted=saved.values[`room:approved:${room.transition.id}`];
        if(!trusted)continue;
        await accept(room);
        const current=await vault.snapshot();if(!current.values[`mls:group:${room.id}`]?.confirmed)continue;
        if(room.transition.status!=='accepted')continue;
        for(const m of room.messages){const proof=m.proof,p=proof?.payload;
          need(proof?.action==='room-send'&&p?.id===m.id&&p.conversationId===room.id&&p.deviceId===m.sender_device
            &&proof.actorId===m.sender_device&&p.hash===m.hash&&p.ciphertext===m.ciphertext&&p.epoch===m.epoch&&(p.mediaId||null)===(m.media_id||null),'mls_envelope_binding_rejected');
          await verifyProof(proof,'room-send');
          let item;try{item=await runtime().room.receive({...m,deviceId:m.sender_device,conversationId:room.id,ciphertext:decode(m.ciphertext)});}
          catch(error){if(!['mls_wire_rejected','mls_envelope_binding_rejected','mls_content_binding_rejected','mls_sender_rejected','mls_ciphertext_rejected'].includes(error.code))throw error;
            await operation('room-reject',{id:m.id,conversationId:room.id,epoch:m.epoch,hash:m.hash,reason:'invalid-ciphertext'});continue;}
          await operation('room-receipt',{id:item.id,conversationId:room.id,epoch:item.epoch,hash:item.hash,kind:'delivered'});
        }
        for(const proof of room.receipts||[]){await verifyProof(proof,'room-receipt');const p=proof.payload;
          const item=await vault.lookup?.(`history:${p.id}`)||(await runtime().room.history(room.id)).find(m=>m.id===p.id);
          need(item&&item.owner===owner&&item.conversationId===room.id&&item.hash===p.hash&&item.epoch===p.epoch&&['delivered','read'].includes(p.kind));
          const epochs=await runtime().room.epochs(room.id),members=epochs.get(item.epoch);
          need(members?.some(m=>m.owner===proof.owner&&m.id===proof.actorId));
          const saved=await vault.snapshot(),key=`room:receipts:${item.id}`,observed=await vault.lookup?.(key)||saved.values[key]||{};
          observed[proof.owner]=p.kind==='read'||observed[proof.owner]==='read'?'read':'delivered';
          const others=[...new Set(members.map(m=>m.owner))].filter(o=>o!==owner);
          const calculated=others.every(o=>observed[o]==='read')?'read':others.every(o=>['delivered','read'].includes(observed[o]))?'delivered':'sent';
          const rank={sent:0,delivered:1,read:2},status=rank[item.status]>rank[calculated]?item.status:calculated;
          await vault.write({expectedRevision:saved.revision,values:{[key]:observed,[`history:${item.id}`]:{...item,status}}});
          await operation('room-receipt-ack',{...p,receiptDeviceId:proof.actorId});
        }
        for(const proof of room.archiveReceipts||[]){
          const p=proof.payload,item=await vault.lookup?.(`history:${p?.id}`);if(!item)continue;
          if(!await verifyArchiveProof(proof,'room-archive-read'))continue;
          need(item.kind==='shopping-room'&&item.conversationId===room.id&&item.hash===p.hash&&item.epoch===p.epoch
            &&p.kind==='read'&&BigInt(item.epoch)<BigInt(room.epoch));
          const members=(await runtime().room.epochs(room.id)).get(item.epoch);
          need(members?.some(m=>m.owner===proof.owner));
          const s=await vault.snapshot(),values={};
          if(proof.owner===owner&&item.owner!==owner)values[`history:${item.id}`]={...item,status:'read'};
          else if(item.owner===owner){
            const key=`room:receipts:${item.id}`,observed=await vault.lookup?.(key)||{};observed[proof.owner]='read';
            const others=[...new Set(members.map(m=>m.owner))].filter(o=>o!==owner);
            // An archived Read cannot invent original live Delivered acknowledgements.
            values[key]=observed;if(others.every(o=>observed[o]==='read'))values[`history:${item.id}`]={...item,status:'read'};
          }
          if(Object.keys(values).length)await vault.write({expectedRevision:s.revision,values});
          await operation('room-archive-read-ack',{...p,receiptDeviceId:proof.actorId});
        }
        }catch(error){if(error.status===401||['crypto_vault_session_required','crypto_device_session_required'].includes(error.code))throw error;
          room.clientError=/^[a-z0-9_]{1,80}$/.test(error.code||'')?error.code:'room_sync_failed';}
      }
      return structuredClone(rooms);
    }
    async function inspectOwners(names){
      need(Array.isArray(names)&&names.every(name=>typeof name==='string'&&/^[A-Za-z0-9._:-]{1,40}$/.test(name)),'encrypted_room_usernames_invalid');
      const owners=[...new Set([owner,...names])].sort();
      need(owners.length>=3,'encrypted_room_members_required');need(owners.length<=roomLimits.maxOwners,'encrypted_room_member_limit');
      const own=await runtime().prepareKeyPackage();
      const result=await operation('room-directory',{owners:JSON.stringify(owners)});need(result?.version===1&&Array.isArray(result.packages));
      directory=result.packages;
      const selected=owners.map(name=>directory.find(p=>p.owner===name&&(name!==owner||p.deviceId===own.id&&p.hash===own.hash)));
      need(selected.every(Boolean),'encrypted_room_member_unavailable');return structuredClone(selected);
    }
    async function create(name,selected){
      need(Array.isArray(selected)&&selected.length>=3);
      need(new Set(selected.map(p=>p.owner)).size<=roomLimits.maxOwners,'encrypted_room_member_limit');
      need(selected.length<=roomLimits.maxDevices,'encrypted_room_device_limit');const own=await runtime().prepareKeyPackage();
      for(const p of selected){need(directory.some(v=>v.hash===p.hash&&v.fingerprint===p.fingerprint));await verifyPackage(p,p.fingerprint);}
      const roster=selected.map(p=>({owner:p.owner,id:p.deviceId,fingerprint:p.fingerprint,key:Array.from(decode(p.mlsPublicKey))}))
        .sort((a,b)=>a.owner+'/'+a.id<b.owner+'/'+b.id?-1:1);
      const i={version:1,kind:'shopping-room',id:crypto.randomUUID(),conversationId:crypto.randomUUID(),previousEpoch:'0',revision:'1',actorOwner:owner,actorDeviceId:own.id,
        roster:JSON.stringify(roster),roles:JSON.stringify([...new Set(roster.map(m=>m.owner))].sort().map(name=>({owner:name,role:name===owner?'admin':'member'}))),
        changes:JSON.stringify(selected.filter(p=>p.deviceId!==own.id).map(p=>({type:'add',owner:p.owner,id:p.deviceId,packageHash:p.hash})).sort((a,b)=>a.id<b.id?-1:1))};
      const payload={intent:JSON.stringify(i),name:name.trim(),sourceHash:own.hash};
      // Persist the exact reservation before network I/O; retries never consume another package.
      let saved=await vault.snapshot();await vault.write({expectedRevision:saved.revision,values:{[`room:create:${i.conversationId}`]:{payload,selected}}});
      return resumeCreate(i.conversationId);
    }
    async function resumeCreate(id){
      let saved=await vault.snapshot();const draft=saved.values[`room:create:${id}`];need(draft,'encrypted_room_draft_missing');
      const {payload,selected}=draft,i=JSON.parse(payload.intent),reserved=await operation('room-reserve',payload,i.id);need(reserved?.room?.transition?.intent===payload.intent);
      const transfer=await runtime().room.create(i,new Map(selected.filter(p=>p.deviceId!==i.actorDeviceId).map(p=>[p.deviceId,decode(p.keyPackage)])));
      await operation('room-transfer',WingaMlsCandidate.encodeRoomTransferPayload(transfer),i.id);
      saved=await vault.snapshot();await vault.write({expectedRevision:saved.revision,values:{[`room:approved:${i.id}`]:true},deleted:[`room:create:${id}`]});
      await sync();return id;
    }
    async function join(id){await list();const room=rooms.find(r=>r.id===id);need(room&&room.status!=='removed');
      await approve(room);const saved=await vault.snapshot();await vault.write({expectedRevision:saved.revision,values:{[`room:approved:${room.transition.id}`]:true}});await sync();}
    async function inspectChange(id,names){await list();const room=rooms.find(r=>r.id===id);need(room?.transition.status==='accepted');
      const i=JSON.parse(room.transition.intent),owners=[...new Set([...JSON.parse(i.roster).map(m=>m.owner),...names])].sort();
      need(owners.length<=roomLimits.maxOwners,'encrypted_room_member_limit');
      const r=await operation('room-directory',{owners:JSON.stringify(owners)});need(r?.version===1);directory=r.packages;
      const before=JSON.parse(i.roster),selected=names.map(name=>directory.find(p=>p.owner===name&&!before.some(m=>m.id===p.deviceId)));need(selected.every(Boolean),'encrypted_room_member_unavailable');return structuredClone(selected);}
    async function change(id,selected=[],removedOwner=''){
      await list();const room=rooms.find(r=>r.id===id);need(room?.transition.status==='accepted');const old=JSON.parse(room.transition.intent),own=await runtime().initialize();
      need(JSON.parse(old.roles).some(r=>r.owner===owner&&r.role==='admin')&&removedOwner!==owner,'encrypted_room_admin_required');
      for(const p of selected){need(directory.some(v=>v.hash===p.hash&&v.fingerprint===p.fingerprint));await verifyPackage(p,p.fingerprint);}
      const before=JSON.parse(old.roster),removed=before.filter(m=>m.owner===removedOwner),roster=[...before.filter(m=>m.owner!==removedOwner),...selected.map(p=>({owner:p.owner,id:p.deviceId,fingerprint:p.fingerprint,key:Array.from(decode(p.mlsPublicKey))}))].sort((a,b)=>a.owner+'/'+a.id<b.owner+'/'+b.id?-1:1);
      const roles=[...new Set(roster.map(m=>m.owner))].sort().map(o=>JSON.parse(old.roles).find(r=>r.owner===o)||{owner:o,role:'member'});
      need(roles.length<=roomLimits.maxOwners||roles.length<=new Set(before.map(m=>m.owner)).size,'encrypted_room_member_limit');
      need(roster.length<=roomLimits.maxDevices||roster.length<=before.length,'encrypted_room_device_limit');
      const i={...old,id:crypto.randomUUID(),previousEpoch:room.epoch,revision:String(BigInt(old.revision)+1n),actorOwner:owner,actorDeviceId:own.id,roster:JSON.stringify(roster),roles:JSON.stringify(roles),
        changes:JSON.stringify([...removed.map(m=>({type:'remove',owner:m.owner,id:m.id})),...selected.map(p=>({type:'add',owner:p.owner,id:p.deviceId,packageHash:p.hash}))].sort((a,b)=>a.id<b.id?-1:1))};
      const payload={intent:JSON.stringify(i),name:room.name,sourceHash:''};
      let saved=await vault.snapshot();await vault.write({expectedRevision:saved.revision,values:{[`room:change:${id}`]:{payload,selected}}});return resumeChange(id);
    }
    async function resumeChange(id){let saved=await vault.snapshot();const draft=saved.values[`room:change:${id}`];need(draft,'encrypted_room_draft_missing');
      const {payload,selected}=draft,i=JSON.parse(payload.intent);await operation('room-reserve',payload,i.id);
      const t=await runtime().room.change(i,new Map(selected.map(p=>[p.deviceId,decode(p.keyPackage)])));await operation('room-transfer',WingaMlsCandidate.encodeRoomTransferPayload(t),i.id);
      saved=await vault.snapshot();await vault.write({expectedRevision:saved.revision,values:{[`room:approved:${i.id}`]:true},deleted:[`room:change:${id}`]});await sync();return id;}
    async function history(id){return runtime().room.history(id);}
    async function board(id){const codec=await module(),items=await history(id),evidence=new Map();
      const commands=items.filter(m=>m.status!=='pending').map(item=>({item,c:codec.parseRoomContent(item.message)})).filter(v=>['seller-question','seller-response'].includes(v.c?.type));
      const requests=new Set(commands.filter(v=>v.c.type==='seller-question').map(v=>v.c.data.questionId));
      for(const questionId of requests){try{const key=id+':'+questionId,cached=sellerCache.get(key),hasResponse=commands.some(v=>v.c.type==='seller-response'&&v.c.data.questionId===questionId);
        // Immutable disclosure evidence is local history, not a live presence/identity claim.
        const r=cached&&(!hasResponse||cached.answerText)?structuredClone(cached):await operation('seller-evidence',{id:questionId,conversationId:id});
        need(r?.version===1&&r.question?.id===questionId);
        let q;for(const {item,c} of commands){const d=c?.data;
          if(item.status==='pending'||item.owner!==r.question.buyerId||c?.type!=='seller-question'||d.questionId!==questionId
            ||d.productId!==r.question.productId||d.shareId!==r.question.shareId||d.sellerId!==r.question.sellerId)continue;
          const wire=WingaRichContent.encode(WingaRichContent.create('seller-question',d.question,{questionId,productId:d.productId}));
          if(await hash(new TextEncoder().encode(wire))===r.question.questionHash){q=d;break;}}
        need(q);r.questionText=q.question;
        if(r.answer){const a=commands.find(v=>v.c.type==='seller-response'&&v.c.data.questionId===questionId&&v.c.data.answerId===r.answer.messageId);
          if(a){try{const proof=r.answer.proof,p=proof?.payload,anchor=r.answer.anchor;
            need(anchor?.owner===r.question.sellerId&&anchor.id===proof?.actorId&&await hash(decode(anchor.publicKey))===anchor.fingerprint
              &&proof.owner===r.question.sellerId&&p.id===questionId&&p.messageId===r.answer.messageId&&p.answerHash===r.answer.answerHash);
            await verifyProof(proof,'seller-answer-register',anchor);
            for(const {item,c} of commands){
              if(item.status==='pending'||item.owner!==r.question.buyerId||c?.type!=='seller-response'||c.data.questionId!==questionId||c.data.answerId!==r.answer.messageId)continue;
              const wire=WingaRichContent.encode(WingaRichContent.create('seller-response',c.data.answer,{questionId,productId:q.productId}));
              if(await hash(new TextEncoder().encode(wire))===r.answer.answerHash){r.answerText=c.data.answer;break;}}
          }catch{r.answer=null;}}}
        evidence.set(questionId,r);sellerCache.set(key,structuredClone(r));if(sellerCache.size>512)sellerCache.delete(sellerCache.keys().next().value);
      }catch(error){if(error.status===401||error.code==='mls_session_changed')throw error;}}
      return codec.projectRoomContent(items,{conversationId:id,epochs:await runtime().room.epochs(id),sellerEvidence:evidence});}
    async function send(id,message,clientMessageId=crypto.randomUUID()){
      const result=await runtime().room.send({conversationId:id,message,clientMessageId});onChange();return result;
    }
    async function command(id,type,data,clientMessageId){const codec=await module();return send(id,codec.encodeRoomContent(type,data),clientMessageId);}
    async function markRead(id,ids){if(document.visibilityState!=='visible'||!document.hasFocus())return;
      const detail=[...document.querySelectorAll('[data-room-id]')].find(el=>el.dataset.roomId===id&&el.getClientRects().length),thread=detail?.querySelector('.room-thread');
      if(!thread||typeof globalThis.visibleIncomingMessageIds!=='function')return;
      for(const item of await history(id))if(item.owner!==owner&&ids.includes(item.id)&&item.status!=='read'&&globalThis.visibleIncomingMessageIds(thread).has(item.id)){
        const currentRoom=rooms.find(r=>r.id===id),archive=historyRecoveryEnabled&&currentRoom&&BigInt(item.epoch)<BigInt(currentRoom.epoch);
        await operation(archive?'room-archive-read':'room-receipt',{id:item.id,conversationId:id,epoch:item.epoch,hash:item.hash,kind:'read'});
          const saved=await vault.snapshot();await vault.write({expectedRevision:saved.revision,values:{[`history:${item.id}`]:{...item,status:'read'}}});}
    }
    async function media(id){need(typeof mediaFactory==='function','private_media_disabled');if(!mediaClients.has(id))mediaClients.set(id,await mediaFactory(id));return mediaClients.get(id);}
    async function sendMedia(id,file,text='',kind='file'){const client=await media(id);return client.send('room:'+id,file,text,kind);}
    async function retryMedia(id,messageId){const client=await media(id);return client.resume(messageId);}
    async function downloadMedia(id,messageId){return (await media(id)).download(messageId);}
    async function pendingMedia(id){return (await (await media(id)).list()).filter(j=>j.conversationId===id).map(j=>({id:j.id,name:j.attachment.name,kind:j.attachment.kind}));}
    async function pendingTransitions(){const saved=await vault.snapshot();return Object.entries(saved.values)
      .filter(([key])=>key.startsWith('room:create:')||key.startsWith('room:change:'))
      .map(([key,value])=>({id:key.split(':')[2],kind:key.split(':')[1],name:value.payload.name})).sort((a,b)=>a.id.localeCompare(b.id));}
    return {authorization,historyGroups,validateHistoryMembership,validateHistory,limits,preferences,setPreference,sync,list,pendingTransitions,inspectOwners,create,resumeCreate,join,inspectChange,change,resumeChange,history,board,send,command,markRead,sendMedia,retryMedia,downloadMedia,pendingMedia};
  }
  globalThis.WingaRoomSession={createRoomSession};
})();
