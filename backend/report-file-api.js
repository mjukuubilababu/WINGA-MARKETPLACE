const {MAX_FILE_BYTES}=require('./report-file-contract');
const rejected=(status=400)=>Object.assign(new Error('conversation_report_rejected'),{status});
function createReportFileApi({store,storage}) {
  async function upload(context,payload) {
    if(!payload||Object.keys(payload).sort().join(',')!=='ciphertext,fileId,owner,reportId,sessionId'
      ||typeof payload.ciphertext!=='string'||payload.ciphertext.length>Math.ceil(MAX_FILE_BYTES/3)*4
      ||!/^[-A-Za-z0-9_]+$/.test(payload.ciphertext))throw rejected();
    const {ciphertext,...proof}=payload;
    const prepared=await store.prepareReportFile(context,proof);
    const bytes=Buffer.from(ciphertext,'base64url');
    try {
      if(bytes.length!==prepared.object.bytes||bytes.toString('base64url')!==ciphertext)throw rejected();
      await storage.put({...context,reportId:proof.reportId,fileId:proof.fileId},prepared.object,bytes);
      return await store.completeReportFile(context,proof);
    }finally{bytes.fill(0);}
  }
  async function download(context,payload) {
    const prepared=await store.prepareReportFile(context,payload,true);
    const bytes=await storage.get({...context,reportId:payload.reportId,fileId:payload.fileId},prepared.object);
    try{return {ok:true,id:prepared.object.id,descriptor:prepared.descriptor,ciphertext:bytes.toString('base64url')};}
    finally{bytes.fill(0);}
  }
  return {upload,download};
}
module.exports={createReportFileApi};
