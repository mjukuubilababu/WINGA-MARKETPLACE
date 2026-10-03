const {MAX_BYTES,validateObject}=require('./conversation-private-media');
const {failure}=require('./encrypted-content-contract');
function collectCiphertext(req,expected) {
  return new Promise((resolve,reject)=>{
    let size=0,done=false;const chunks=[];
    const cleanup=()=>{clearTimeout(timer);req.off('data',data);req.off('end',end);req.off('error',error);req.off('aborted',aborted);};
    const finish=(err,value)=>{if(done)return;done=true;cleanup();if(err){req.resume();reject(err);}else resolve(value);};
    const data=chunk=>{size+=chunk.length;if(size>expected || size>MAX_BYTES)finish(failure(413,'private_media_invalid'));else chunks.push(chunk);};
    const end=()=>finish(size===expected?null:failure(400,'private_media_invalid'),Buffer.concat(chunks));
    const error=()=>finish(failure(503,'private_media_unavailable'));
    const aborted=()=>finish(failure(400,'private_media_invalid'));
    const timer=setTimeout(error,30000);req.on('data',data);req.on('end',end);req.on('error',error);req.on('aborted',aborted);
  });
}
function createEncryptedMediaApi({sendJson,findSession,readAuthToken,ensureMarketplaceUser,getPostgresStore,getStorage,enabled=false}) {
  async function handle(req,res,url) {
    if(!url.pathname.startsWith('/api/conversations/encrypted/media/'))return false;
    const headers={'Cache-Control':'private, no-store',Pragma:'no-cache','X-Content-Type-Options':'nosniff'};
    if(!enabled){sendJson(res,404,{code:'private_media_disabled'},headers);return true;}
    const session=findSession(readAuthToken(req)),user=ensureMarketplaceUser(session,res);if(!user)return true;
    try {
      if(!['GET','PUT'].includes(req.method))throw failure(405,'method_not_allowed');
      const encoded=req.headers['x-winga-crypto-proof'];
      if(typeof encoded!=='string' || !/^[A-Za-z0-9_-]{1,4096}$/.test(encoded))throw failure(401,'private_media_proof_required');
      const proof=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')),object=proof.payload;validateObject(object);
      if(url.pathname!==`/api/conversations/encrypted/media/${object.id}`)throw failure(400,'private_media_invalid');
      const context={owner:user.username,token:session.token,deviceId:session.sessionId,proof};
      const store=getPostgresStore();if(!store?.authorizeEncryptedMedia)throw failure(503,'private_media_unavailable');
      await store.authorizeEncryptedMedia(context,object,req.method==='PUT'?'upload':'download');
      const storage=getStorage();
      if(req.method==='PUT') {
        if(req.headers['content-type']!=='application/octet-stream')throw failure(400,'private_media_invalid');
        const bytes=await collectCiphertext(req,object.bytes);
        try {await storage.put(context,object,bytes);}finally{bytes.fill(0);}
        sendJson(res,200,await store.completeEncryptedMediaUpload(context,object),headers);
      } else {
        const bytes=await storage.get(context,object);
        res.writeHead(200,{...headers,'Content-Type':'application/octet-stream','Content-Length':bytes.length,'Content-Disposition':'attachment; filename="encrypted.bin"'});
        res.end(bytes,()=>bytes.fill(0));
      }
    }catch(error){sendJson(res,error.status||503,{code:error.status?error.code:'private_media_unavailable'},headers);}
    return true;
  }
  return {handle};
}
function createEncryptedMediaCleanup({getPostgresStore,getStorage,onResult=()=>{}}) {
  let timer,running;
  async function sweep() {
    if(running)return running;
    running=(async()=>{
      const store=getPostgresStore();if(!store?.claimEncryptedMediaCleanup)return;
      const jobs=await store.claimEncryptedMediaCleanup();let removed=0;
      for(const job of jobs)try {
        await getStorage().remove({lease:job.lease},job.object);await store.finishEncryptedMediaCleanup(job);removed++;
      }catch{/* The durable lease expires; another node can retry the same orphan. */}
      if(jobs.length)onResult({claimed:jobs.length,removed});
    })().catch(()=>onResult({unavailable:true})).finally(()=>{running=null;});return running;
  }
  return {sweep,start(){if(timer)return;sweep();timer=setInterval(sweep,60000);timer.unref?.();},async stop(){clearInterval(timer);timer=null;await running;}};
}
module.exports={createEncryptedMediaApi,createEncryptedMediaCleanup,collectCiphertext};
