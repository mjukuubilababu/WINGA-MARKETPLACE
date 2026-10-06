(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WingaNativeHistory=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
  const need=(value,code='history_sync_invalid')=>{if(!value)throw Object.assign(new Error(code),{code});};
  const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
  const canonical=v=>JSON.stringify(v,Object.keys(v).sort());
  const bytes=v=>Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const encoded=v=>{let s='';for(let i=0;i<v.length;i+=8192)s+=String.fromCharCode(...v.subarray(i,i+8192));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
  const rank={pending:0,sent:1,delivered:2,read:3};
  async function createNativeHistoryClient({owner,deviceId,getSession,vault,codec,operation,verifyProof,crypto=globalThis.crypto,locks=globalThis.navigator?.locks,now=Date.now,onChange=()=>{},validateMembership=async()=>{}}){
    need(owner&&uuid(deviceId)&&vault?.historySnapshot&&vault?.lookup&&vault?.write&&codec?.sealRecovery&&codec?.openRecovery&&typeof verifyProof==='function'&&locks?.request);
    const initial={...getSession()};let closed=false,states={};
    const current=()=>{const s=getSession();need(!closed&&s?.username===owner&&s.sessionId===initial.sessionId&&s.token===initial.token,'history_sync_session_changed');};
    const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value)),b=>b.toString(16).padStart(2,'0')).join('');
    const capsuleHash=c=>digest(canonical(c));
    const requestKey=id=>'mls:history-request:'+id,donorKey=id=>'mls:history-donor:'+id,markerKey=id=>'mls:history-synced:'+id;
    const serialized=work=>locks.request(`winga-encryption-session:${owner}`,()=>locks.request(`winga-mls-operation:${owner}`,async()=>{current();return work();}));
    async function write(values={},deleted=[],historyRestore=false){return serialized(async()=>{const s=await vault.snapshot();const next=await vault.write({expectedRevision:s.revision,values,deleted,historyRestore});current();return next;});}
    const call=async(action,payload,id)=>{current();const r=await operation(action,payload,id);current();return r;};
    const pageKey=(id,index)=>'sync:page:'+id+':'+index;
    function normalized(item,g){
      need(item&&uuid(item.id)&&item.conversationId===g.id&&uuid(item.deviceId)&&typeof item.epoch==='string'&&/^[1-9][0-9]{0,19}$/.test(item.epoch)
        &&BigInt(item.epoch)<=BigInt(g.epoch)&&typeof item.message==='string'&&encoder.encode(item.message).length<=65536
        &&typeof item.hash==='string'&&/^[a-f0-9]{64}$/.test(item.hash)&&typeof item.timestamp==='string'&&Number.isFinite(Date.parse(item.timestamp))
        &&Object.hasOwn(rank,item.status)&&((item.owner===g.creator&&item.peer===g.recipient)||(item.owner===g.recipient&&item.peer===g.creator)));
      return Object.fromEntries(['id','conversationId','epoch','owner','deviceId','peer','message','hash','timestamp','status'].map(k=>[k,item[k]]));
    }
    async function history(g){
      current();const s=await vault.historySnapshot({filter:item=>item?.conversationId===g.id});current();
      const items={};for(const [key,value] of Object.entries(s.values)){
        need(key==='history:'+value.id);
        if(value.status!=='pending'){
          const item=normalized(value,g);
          // Live-epoch messages must pass their original MLS ratchet, never an archive shortcut.
          if(BigInt(item.epoch)<BigInt(g.epoch))items[key]=item;
        }
      }
      need(Object.keys(items).length<=100000,'history_sync_limit');return items;
    }
    const historyHash=items=>digest(JSON.stringify(Object.keys(items).sort().map(k=>[k,items[k]])));
    function packPages(items){
      const result=[];let page={},size=256,count=0;
      for(const id of Object.keys(items).sort()){
        const n=encoder.encode(JSON.stringify({[id]:items[id]})).length+1;need(n+256<=131072,'history_sync_limit');
        if(count&&(count>=512||size+n>131072)){result.push(page);page={};size=256;count=0;}
        page[id]=items[id];size+=n;count++;
      }
      if(count)result.push(page);need(result.length<=1024,'history_sync_limit');return result;
    }
    async function ephemeral(retain){
      const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},retain,['deriveBits']);
      return {publicKey:encoded(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey))),
        privateKey:retain?await crypto.subtle.exportKey('jwk',pair.privateKey):pair.privateKey};
    }
    async function derive(request,donorPublic,privateKey,isRecipient){
      const pub=isRecipient?donorPublic:request.publicKey;
      need(typeof pub==='string'&&/^[A-Za-z0-9_-]{87}$/.test(pub)&&encoded(bytes(pub))===pub);
      const raw=bytes(pub);need(raw.length===65&&raw[0]===4);
      const publicKey=await crypto.subtle.importKey('raw',raw,{name:'ECDH',namedCurve:'P-256'},false,[]);
      const key=isRecipient?await crypto.subtle.importKey('jwk',privateKey,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']):privateKey;
      const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:publicKey},key,256));
      const info=encoder.encode(JSON.stringify(['winga-native-history',1,owner,request.id,request.conversationId,request.epoch,request.recipientDeviceId,request.donorDeviceId,request.publicKey,donorPublic]));
      try{
        const material=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveBits']);
        const derived=new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:await crypto.subtle.digest('SHA-256',info),info},material,256));
        try{return encoded(derived);}finally{derived.fill(0);}
      }finally{shared.fill(0);info.fill(0);}
    }
    function eligible(task,g){
      const members=g?.roster||[],r=task?.request;
      need(g?.status==='active'&&task.owner===owner&&task.conversationId===g.id&&task.epoch===g.epoch&&uuid(task.id)
        &&[task.recipientDeviceId,task.donorDeviceId].every(id=>members.some(m=>m.id===id&&m.owner===owner&&m.status==='active'))
        &&task.recipientDeviceId!==task.donorDeviceId&&r?.id===task.id&&r.conversationId===g.id&&r.epoch===g.epoch&&r.donorDeviceId===task.donorDeviceId
        &&Object.keys(r).sort().join(',')==='conversationId,donorDeviceId,epoch,historyHash,id,publicKey');
      need(task.requestProof?.owner===owner&&task.requestProof.actorId===task.recipientDeviceId&&canonical(task.requestProof.payload)===canonical(r));
      return {...r,recipientDeviceId:task.recipientDeviceId};
    }
    async function removePages(id,count){
      for(let i=0;i<count;i+=100){current();await write({},Array.from({length:Math.min(100,count-i)},(_,n)=>pageKey(id,i+n)));}
    }
    async function prepareDonation(task,g,request){
      const items=await history(g),sourceHash=await historyHash(items),unchanged=sourceHash===request.historyHash;
      const pages=unchanged?[]:packPages(items),pair=await ephemeral(false),key=await derive(request,pair.publicKey,pair.privateKey,false),descriptors=[];
      // Publish only after every immutable local capsule is journalled. A retry reuses it exactly.
      for(let i=0;i<pages.length;i++){
        current();const plain=encoder.encode(JSON.stringify({v:1,owner,conversationId:g.id,epoch:g.epoch,requestId:task.id,index:i,items:pages[i]}));
        try{
          need(plain.length<=131072,'history_sync_limit');const capsule=await codec.sealRecovery(plain,key,{owner,id:task.id+':'+i,generation:1});
          descriptors.push({index:i,hash:await capsuleHash(capsule),count:Object.keys(pages[i]).length});
          await write({[pageKey(task.id,i)]:capsule});
        }finally{plain.fill(0);}
      }
      const manifest={v:1,owner,conversationId:g.id,epoch:g.epoch,requestId:task.id,recipientDeviceId:task.recipientDeviceId,
        donorDeviceId:deviceId,requestHash:await digest(canonical(task.request)),sourceHash,mode:unchanged?'unchanged':'snapshot',
        count:unchanged?0:Object.keys(items).length,pages:descriptors};
      const plain=encoder.encode(JSON.stringify(manifest));let capsule;
      try{need(plain.length<=184320,'history_sync_limit');capsule=await codec.sealRecovery(plain,key,{owner,id:task.id,generation:1});}finally{plain.fill(0);}
      const job={id:task.id,conversationId:g.id,epoch:g.epoch,uploaded:0,count:pages.length,hashes:descriptors.map(d=>d.hash),
        publication:{id:task.id,conversationId:g.id,epoch:g.epoch,publicKey:pair.publicKey,capsule,hash:await capsuleHash(capsule),pageCount:pages.length}};
      await write({[donorKey(task.id)]:job});return job;
    }
    async function donate(task,g,request){
      let job=await vault.lookup(donorKey(task.id));current();
      if(task.status==='ready'){
        if(job){need(canonical(job.publication)===canonical(task.publication));await removePages(job.id,job.count);await write({},[donorKey(job.id)]);}
        return;
      }
      job ||= await prepareDonation(task,g,request);
      need(job.conversationId===g.id&&job.epoch===g.epoch);
      for(let n=0;n<4&&job.uploaded<job.count;n++){
        const index=job.uploaded,capsule=await vault.lookup(pageKey(job.id,index));current();need(capsule&&await capsuleHash(capsule)===job.hashes[index]);
        const reply=await call('history-page-put',{id:job.id,conversationId:g.id,epoch:g.epoch,index,capsule,hash:job.hashes[index]},job.id);
        need(reply?.version===1&&reply.id===job.id&&reply.index===index&&reply.hash===job.hashes[index]);
        job={...job,uploaded:index+1};await write({[donorKey(job.id)]:job});
      }
      if(job.uploaded===job.count){
        const reply=await call('history-publish',job.publication,job.id);need(reply?.id===job.id&&['ready','accepted'].includes(reply.status)&&reply.hash===job.publication.hash);
        await removePages(job.id,job.count);await write({},[donorKey(job.id)]);
      }
    }
    async function manifestFor(task,g,request,job){
      const p=task.publication;
      need(p&&Object.keys(p).sort().join(',')==='capsule,conversationId,epoch,hash,id,pageCount,publicKey'&&p.id===task.id&&p.conversationId===g.id&&p.epoch===g.epoch
        &&task.publicationProof?.owner===owner&&task.publicationProof.actorId===task.donorDeviceId&&canonical(task.publicationProof.payload)===canonical(p)
        &&p.capsule?.id===task.id&&p.capsule.owner===owner&&p.capsule.generation===1&&await capsuleHash(p.capsule)===p.hash);
      await verifyProof(task.publicationProof,'history-publish');current();
      const key=await derive(request,p.publicKey,job.privateKey,true),plain=await codec.openRecovery(p.capsule,key,{owner,id:task.id,generation:1});let m;
      try{m=JSON.parse(decoder.decode(plain));}finally{plain.fill(0);}
      need(m&&Object.keys(m).sort().join(',')==='conversationId,count,donorDeviceId,epoch,mode,owner,pages,recipientDeviceId,requestHash,requestId,sourceHash,v'
        &&m.v===1&&m.owner===owner&&m.conversationId===g.id&&m.epoch===g.epoch&&m.requestId===task.id&&m.recipientDeviceId===deviceId&&m.donorDeviceId===task.donorDeviceId
        &&m.requestHash===await digest(canonical(task.request))&&['snapshot','unchanged'].includes(m.mode)&&typeof m.sourceHash==='string'&&/^[a-f0-9]{64}$/.test(m.sourceHash)
        &&Number.isInteger(m.count)&&m.count>=0&&m.count<=100000&&Array.isArray(m.pages)&&m.pages.length<=1024&&p.pageCount===m.pages.length
        &&m.pages.every((d,i)=>d&&Object.keys(d).sort().join(',')==='count,hash,index'&&d.index===i&&typeof d.hash==='string'&&/^[a-f0-9]{64}$/.test(d.hash)&&Number.isInteger(d.count)&&d.count>0&&d.count<=512)
        &&m.pages.reduce((n,d)=>n+d.count,0)===m.count&&(m.mode!=='unchanged'||(!m.count&&!m.pages.length&&m.sourceHash===task.request.historyHash)));
      return {manifest:m,key};
    }
    async function receive(task,g,request){
      let job=await vault.lookup(requestKey(g.id));current();need(job&&canonical(job.request)===canonical(task.request)&&job.request.id===task.id);
      if(task.status!=='ready'){
        if(now()-job.at>=120000){
          const r=await call('history-cancel',{id:task.id,conversationId:g.id,epoch:g.epoch},task.id);need(r.status==='cancelled');
          await write({['mls:history-choice:'+g.id]:{previous:task.donorDeviceId}},[requestKey(g.id)]);
        }
        return;
      }
      const {manifest,key}=await manifestFor(task,g,request,job),marker=await vault.lookup(markerKey(g.id));current();
      if(marker?.requestId!==task.id){
        if(job.publication)need(canonical(job.publication)===canonical(task.publication));
        if(!job.publication){job={...job,publication:task.publication};await write({[requestKey(g.id)]:job});}
        if(job.downloaded<manifest.pages.length){
          const reply=await call('history-pages',{id:task.id,conversationId:g.id,epoch:g.epoch,after:job.downloaded-1},task.id);
          need(reply?.version===1&&reply.id===task.id&&canonical(reply.publication)===canonical(task.publication)&&Array.isArray(reply.pages)&&reply.pages.length>0&&reply.pages.length<=4);
          for(const page of reply.pages){
            const d=manifest.pages[job.downloaded];need(d&&page.index===d.index&&page.hash===d.hash&&page.capsule?.id===task.id+':'+d.index
              &&page.capsule.owner===owner&&page.capsule.generation===1&&await capsuleHash(page.capsule)===d.hash);
            job={...job,downloaded:job.downloaded+1};await write({[pageKey(task.id,d.index)]:page.capsule,[requestKey(g.id)]:job});
          }
        }
        if(job.downloaded<manifest.pages.length)return;
        const items={};let size=0;
        for(const d of manifest.pages){
          current();const capsule=await vault.lookup(pageKey(task.id,d.index));need(capsule&&await capsuleHash(capsule)===d.hash);
          const plain=await codec.openRecovery(capsule,key,{owner,id:task.id+':'+d.index,generation:1});
          try{
            size+=plain.length;need(plain.length<=131072&&size<=128*1024*1024,'history_sync_limit');const p=JSON.parse(decoder.decode(plain));
            need(p&&Object.keys(p).sort().join(',')==='conversationId,epoch,index,items,owner,requestId,v'&&p.v===1&&p.owner===owner&&p.conversationId===g.id&&p.epoch===g.epoch&&p.requestId===task.id&&p.index===d.index
              &&p.items&&typeof p.items==='object'&&!Array.isArray(p.items)&&Object.keys(p.items).length===d.count);
            for(const [id,item] of Object.entries(p.items)){need(id==='history:'+item.id&&!Object.hasOwn(items,id)&&item.status!=='pending');
              items[id]=normalized(item,g);need(BigInt(items[id].epoch)<BigInt(g.epoch));}
          }finally{plain.fill(0);}
        }
        need(Object.keys(items).length===manifest.count);
        if(manifest.mode==='snapshot')need(await historyHash(items)===manifest.sourceHash);
        await serialized(async()=>{
        await validateMembership(g);current();
        const local=await vault.historySnapshot({filter:item=>item?.conversationId===g.id});current();
        for(const [id,item] of Object.entries(items)){
          const old=local.values[id];if(old){
            need(old.status!=='pending','history_sync_pending_send');const a=normalized(old,g),b={...item};delete a.status;delete b.status;
            need(JSON.stringify(a)===JSON.stringify(b),'history_sync_conflict');items[id]={...item,status:rank[old.status]>rank[item.status]?old.status:item.status};
          }
          items[id].encrypted=true;
        }
        await vault.write({expectedRevision:local.revision,values:{...items,[markerKey(g.id)]:{requestId:task.id,epoch:g.epoch,at:now(),sourceHash:manifest.sourceHash}},historyRestore:true});current();queueMicrotask(onChange);
        });
      }
      const reply=await call('history-accept',{id:task.id,conversationId:g.id,epoch:g.epoch,hash:task.publication.hash},task.id);
      need(reply?.id===task.id&&reply.status==='accepted'&&reply.hash===task.publication.hash);
      await removePages(task.id,manifest.pages.length);await write({},[requestKey(g.id)]);states[g.id]='ready';
    }
    async function sync(groups){
      current();const all=[],failures=new Map();let after,seen=new Set();
      do{
        const r=await call('history-tasks',after?{after}:{});need(r?.version===1&&Array.isArray(r.tasks)&&r.tasks.length<=25);
        for(const task of r.tasks){need(!seen.has(task.id));seen.add(task.id);all.push(task);}
        need(!r.next||uuid(r.next)&&(!after||r.next>after));after=r.next;
      }while(after);
      for(const task of all){
        const g=groups.find(g=>g.id===task.conversationId);if(!g||g.status!=='active')continue;
        try{const request=eligible(task,g);await verifyProof(task.requestProof,'history-reserve');current();
          states[g.id]='syncing';if(task.donorDeviceId===deviceId)await donate(task,g,request);else if(task.recipientDeviceId===deviceId)await receive(task,g,request);
        }catch(error){current();states[g.id]='retry';if(!['crypto_vault_revision_conflict','history_sync_pending_send'].includes(error.code)&&error.status!==503&&!(error instanceof TypeError))states[g.id]='failed';
          if(failures.get(g.id)!=='failed')failures.set(g.id,states[g.id]);}
      }
      const local=await vault.snapshot();current();
      for(const [key,job] of Object.entries(local.values))if(key.startsWith('mls:history-request:')&&!seen.has(job.request.id)){
        const g=groups.find(g=>g.id===job.request.conversationId),marker=local.values[markerKey(job.request.conversationId)];
        if(g?.status==='active'&&g.epoch===job.request.epoch&&marker?.requestId===job.request.id&&job.publication){
          const r=await call('history-accept',{id:job.request.id,conversationId:g.id,epoch:g.epoch,hash:job.publication.hash},job.request.id);
          need(r.status==='accepted');await removePages(job.request.id,job.downloaded);await write({},[key]);states[g.id]='ready';
        }else if(!g||g.status!=='active'||g.epoch!==job.request.epoch){await removePages(job.request.id,job.downloaded);await write({},[key]);}
        else {
          // The reserve may have committed before its HTTP reply was lost.
          try{
            const r=await call('history-reserve',job.request,job.request.id);
            if(['cancelled','accepted'].includes(r.status)){await removePages(job.request.id,job.downloaded);await write({['mls:history-choice:'+g.id]:{previous:job.request.donorDeviceId}},[key]);states[g.id]=r.status==='accepted'?'ready':'retry';}
            else need(['pending','ready'].includes(r.status));
          }catch(e){
            if(e.code==='encrypted_history_access_denied'){await removePages(job.request.id,job.downloaded);await write({},[key]);}
            else throw e;
          }
        }
      }
      for(const [key,job] of Object.entries(local.values))if(key.startsWith('mls:history-donor:')&&!seen.has(job.id)){
        await removePages(job.id,job.count);await write({},[key]);
      }
      const candidates=groups.filter(g=>g.status==='active'&&g.roster?.some(m=>m.id!==deviceId&&m.owner===owner&&m.status==='active'));
      for(const g of candidates.sort((a,b)=>(local.values[markerKey(a.id)]?.at||0)-(local.values[markerKey(b.id)]?.at||0))){
        const job=await vault.lookup(requestKey(g.id));current();if(job)continue;
        const marker=await vault.lookup(markerKey(g.id));current();if(marker?.epoch===g.epoch&&now()-marker.at<120000)continue;
        const donors=g.roster.filter(m=>m.id!==deviceId&&m.owner===owner&&m.status==='active').sort((a,b)=>a.id.localeCompare(b.id));
        const choice=await vault.lookup('mls:history-choice:'+g.id);current();
        const previous=donors.findIndex(m=>m.id===choice?.previous),selected=donors[(previous+1)%donors.length];
        const pair=await ephemeral(true),items=await history(g),request={id:crypto.randomUUID(),conversationId:g.id,epoch:g.epoch,donorDeviceId:selected.id,publicKey:pair.publicKey,historyHash:await historyHash(items)};
        await write({[requestKey(g.id)]:{request,privateKey:pair.privateKey,downloaded:0,at:now()}});
        const r=await call('history-reserve',request,request.id);need(r.id===request.id&&['pending','ready'].includes(r.status));states[g.id]='syncing';break;
      }
      for(const [id,state] of failures)states[id]=state;
    }
    return {sync,state:id=>states[id]||'waiting',close(){closed=true;states={};}};
  }
  return {createNativeHistoryClient};
});
