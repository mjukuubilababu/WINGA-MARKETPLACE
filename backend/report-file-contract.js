const MAX_FILE_BYTES=2*1024*1024+4136;
const FILE_CONSENT='share-selected-file-copies-v1';
const fail=()=>{throw Object.assign(new Error('conversation_report_rejected'),{status:400});};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
function validateReportFiles(payload) {
  if(payload.fileConsent!==FILE_CONSENT||!Array.isArray(payload.files)||!payload.files.length||payload.files.length>3
    ||new Set(payload.files.map(f=>f?.id)).size!==payload.files.length
    ||new Set(payload.files.map(f=>f?.messageId)).size!==payload.files.length)fail();
  return payload.files.map(f=>{
    const d=f?.descriptor;
    if(!exact(f,['id','messageId','bytes','sha256','descriptor'])||!uuid(f.id)
      ||!payload.selection.some(s=>s.id===f.messageId&&s.kind==='media')
      ||!Number.isSafeInteger(f.bytes)||f.bytes<40||f.bytes>MAX_FILE_BYTES
      ||typeof f.sha256!=='string'||!/^[a-f0-9]{64}$/.test(f.sha256)
      ||!exact(d,['version','algorithm','conversationId','attachmentId','key'])||d.version!==2
      ||d.algorithm!=='webcrypto-aes256gcm-v1'||d.conversationId!=='report-evidence-v1:'+payload.requestId
      ||d.attachmentId!==f.id||typeof d.key!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(d.key)
      ||Buffer.from(d.key,'base64url').toString('base64url')!==d.key)fail();
    return {id:f.id,messageId:f.messageId,bytes:f.bytes,sha256:f.sha256,descriptor:{...d}};
  });
}
module.exports={MAX_FILE_BYTES,FILE_CONSENT,validateReportFiles};
