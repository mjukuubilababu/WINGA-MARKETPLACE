(() => {
  const PREFIX='WINGA-MEDIA/1\n',MAX_FILE_BYTES=2*1024*1024;
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  function attachment(item) {
    if(!item?.message?.startsWith(PREFIX))return null;
    try {
      const value=JSON.parse(item.message.slice(PREFIX.length)),a=value.attachment,d=a?.descriptor,o=a?.object;
      if(Object.keys(value).sort().join(',')!=='attachment,text' || typeof value.text!=='string' || value.text.length>4096
        || !['descriptor,name,object','descriptor,kind,name,object'].includes(Object.keys(a||{}).sort().join(','))
        || (a.kind!==undefined&&!['file','image','voice','video'].includes(a.kind)) || typeof a.name!=='string' || a.name.length>255
        || Object.keys(o||{}).sort().join(',')!=='bytes,id,sha256' || !uuid(o.id) || !Number.isSafeInteger(o.bytes)
        || o.bytes<40 || o.bytes>MAX_FILE_BYTES+4136 || !/^[a-f0-9]{64}$/.test(o.sha256)
        || Object.keys(d||{}).sort().join(',')!=='algorithm,attachmentId,conversationId,key,version' || d.version!==2
        || d.algorithm!=='webcrypto-aes256gcm-v1' || d.conversationId!==item.conversationId || d.attachmentId!==o.id
        || !/^[A-Za-z0-9_-]{43}$/.test(d.key))return null;
      return value;
    }catch{return null;}
  }
  async function createMediaClient({owner,getSession,vault,runtime,identity,operation,request,historyRecoveryEnabled=false,onChange=()=>{}}) {
    const codec=await WingaSecureContent.loadSecureContent(),initial={...getSession()};
    const current=()=>{const s=getSession();if(s?.username!==owner || s.token!==initial.token || s.sessionId!==initial.sessionId)fail('mls_session_changed');};
    async function list() {current();return Object.entries((await vault.snapshot()).values).filter(([k])=>k.startsWith('media:pending:')).map(([,v])=>v);}
    const pendingView=job=>({id:job.id,conversationId:job.conversationId,owner,peer:job.peer,message:job.message,timestamp:job.timestamp,status:'pending'});
    async function resume(id) {
      current();let s=await vault.snapshot(),job=s.values[`media:pending:${id}`];if(!job)return null;
      let existing=(await runtime.history(job.peer)).find(v=>v.id===id);
      try {
        if(existing) {
          const retried=await runtime.retryMessage(id);return retried || existing;
        }
        const object=job.attachment.object;
        const grant=await operation('media-reserve',{...object,conversationId:job.conversationId,messageId:id},id);
        if(JSON.stringify(grant,Object.keys(grant||{}).sort())!==JSON.stringify(object,Object.keys(object).sort()))fail('private_media_integrity_rejected');
        const proof=await identity.signCryptoOperation('media-upload',object,id);
        const uploaded=await request('PUT',object,proof,new Blob([job.ciphertext],{type:'application/octet-stream'}));current();
        if(JSON.stringify(uploaded,Object.keys(uploaded||{}).sort())!==JSON.stringify(object,Object.keys(object).sort()))fail('private_media_integrity_rejected');
        return await runtime.sendMessage({clientMessageId:id,receiverId:job.peer,message:job.message,messageType:'text',mediaId:object.id});
      }finally {
        existing=(await runtime.history(job.peer)).find(v=>v.id===id);
        if(existing) {s=await vault.snapshot();await vault.write({expectedRevision:s.revision,values:{},deleted:[`media:pending:${id}`]});}
        queueMicrotask(onChange);
      }
    }
    async function stageDraft(peer,file,text='',kind='file') {
      current();if(!(file instanceof Blob)||file.size>MAX_FILE_BYTES || typeof text!=='string'||text.length>4096)fail('private_media_invalid');
      if(!['file','image','voice','video'].includes(kind))fail('private_media_invalid');
      if((await vault.snapshot()).values['media:draft:'+peer])fail('private_media_draft_exists');
      const pending=await list();if(pending.length>=10 || pending.some(v=>v.peer===peer))fail('mls_pending_send_requires_retry');
      const conversationId=await runtime.conversationId(peer),id=crypto.randomUUID(),attachmentId=crypto.randomUUID();
      const name=String(file.name||'attachment').slice(0,255),mime=(file.type||'application/octet-stream').split(';')[0].trim();
      const sealed=await codec.encryptMedia(file,{conversationId,attachmentId},{name,mime});current();
      const ciphertext=new Uint8Array(await sealed.ciphertext.arrayBuffer()),object={id:attachmentId,bytes:ciphertext.length,sha256:await hash(ciphertext)};
      const a={object,descriptor:sealed.descriptor,name,kind},message=PREFIX+JSON.stringify({text,attachment:a});
      const job={id,peer,conversationId,message,attachment:a,ciphertext,timestamp:new Date().toISOString()},s=await vault.snapshot();
      await vault.write({expectedRevision:s.revision,values:{['media:draft:'+peer]:job}});ciphertext.fill(0);
      return {id,peer,kind,name};
    }
    async function draft(peer) {
      current();const job=(await vault.snapshot()).values['media:draft:'+peer];if(!job)return null;
      const result=await codec.decryptMedia(new Blob([job.ciphertext]),job.attachment.descriptor,
        {conversationId:job.conversationId,attachmentId:job.attachment.object.id});current();
      return {...result,id:job.id,kind:job.attachment.kind||'file',checkSession:current};
    }
    async function discardDraft(peer) {
      current();const s=await vault.snapshot();await vault.write({expectedRevision:s.revision,deleted:['media:draft:'+peer]});
    }
    async function sendDraft(peer,text) {
      current();const s=await vault.snapshot(),job=s.values['media:draft:'+peer];if(!job)fail('private_media_draft_required');
      if(text!==undefined){if(typeof text!=='string'||text.length>4096)fail('private_media_invalid');job.message=PREFIX+JSON.stringify({text,attachment:job.attachment});}
      await vault.write({expectedRevision:s.revision,values:{['media:pending:'+job.id]:job},deleted:['media:draft:'+peer]});
      const id=job.id;
      try {return await resume(id);}catch(error) {
        if(!(error instanceof TypeError)&&error.status!==503)throw error;
        const item=(await runtime.history(peer)).find(v=>v.id===id);return item || pendingView(job);
      }
    }
    async function send(peer,file,text='',kind='file') {
      await stageDraft(peer,file,text,kind);return sendDraft(peer);
    }
    async function download(id) {
      current();const item=(await runtime.history()).find(v=>v.id===id),value=attachment(item);
      if(!value)fail('private_media_invalid');const {object,descriptor}=value.attachment;
      let blob;
      try {blob=await request('GET',object,await identity.signCryptoOperation('media-download',object));}
      catch(error) {
        current();if(!historyRecoveryEnabled || error.code!=='private_media_access_rejected')throw error;
        const grant=await operation('media-history-grant',{...object,conversationId:item.conversationId,messageId:id});current();
        if(JSON.stringify(grant,Object.keys(grant||{}).sort())!==JSON.stringify(object,Object.keys(object).sort()))fail('private_media_integrity_rejected');
        blob=await request('GET',object,await identity.signCryptoOperation('media-download',object));
      }
      current();
      if(!(blob instanceof Blob)||blob.size!==object.bytes||await hash(await blob.arrayBuffer())!==object.sha256)fail('private_media_integrity_rejected');
      const result=await codec.decryptMedia(blob,descriptor,{conversationId:item.conversationId,attachmentId:object.id});current();
      return {...result,checkSession:current};
    }
    return {send,resume,list,download,stageDraft,draft,discardDraft,sendDraft,pendingHistory:async()=> (await list()).map(pendingView)};
  }
  globalThis.WingaEncryptedMedia={createMediaClient,attachment,MAX_FILE_BYTES};
})();
