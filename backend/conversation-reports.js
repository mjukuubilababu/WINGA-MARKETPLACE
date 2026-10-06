const {createHash}=require('node:crypto');
const {authenticateCryptoSession}=require('./conversation-crypto-auth');
const CONSENT='share-selected-message-evidence-v1';
const rejected=(status=400)=>Object.assign(new Error('conversation_report_rejected'),{status});
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
function validateDisclosure(context,payload) {
  if(!exact(payload,['owner','sessionId','peer','requestId','consent','reason','description','selection'])
    ||payload.owner!==context.owner||payload.sessionId!==context.deviceId
    ||!text(payload.peer,40)||!payload.peer||/[\u0000-\u001f\u007f]/.test(payload.peer)||payload.peer.trim()!==payload.peer||payload.peer===context.owner
    ||!uuid(payload.requestId)||payload.consent!==CONSENT
    ||!['spam','fraud','harassment','unsafe','other'].includes(payload.reason)
    ||!text(payload.description,500)||!Array.isArray(payload.selection)||!payload.selection.length
    ||payload.selection.length>10||new Set(payload.selection.map(row=>row?.id)).size!==payload.selection.length
    ||payload.selection.some(row=>!exact(row,['id','kind','text'])||!id(row.id)
      ||!['text','media','card'].includes(row.kind)||!text(row.text,4096)||!row.text.trim()
      ||row.text.startsWith('WINGA-MEDIA/')||row.text.startsWith('WINGA-CONTENT/'))
    ||Buffer.byteLength(JSON.stringify(payload))>65536)throw rejected();
  return {peer:payload.peer,requestId:payload.requestId,consent:CONSENT,reason:payload.reason,
    description:payload.description,selection:payload.selection.map(row=>({id:row.id,kind:row.kind,text:row.text}))};
}
function createConversationReportStore({withTransaction,now=Date.now}) {
  async function moderator(client,context) {
    await authenticateCryptoSession(client,context,now());
    const row=(await client.query('SELECT role FROM users WHERE username=$1',[context.owner])).rows[0];
    if(!['admin','moderator'].includes(row?.role))throw rejected(403);
    return row.role;
  }
  async function submitConversationReport(context,payload) {
    const disclosure=validateDisclosure(context,payload);
    const hash=createHash('sha256').update(JSON.stringify(disclosure)).digest('hex');
    return withTransaction(async client=>{
      await authenticateCryptoSession(client,context,now());
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`winga-conversation-report:${context.owner}`]);
      const prior=(await client.query(`SELECT report_id,request_hash FROM conversation_report_evidence
        WHERE reporter_id=$1 AND request_id=$2`,[context.owner,disclosure.requestId])).rows[0];
      if(prior){if(prior.request_hash!==hash)throw rejected(409);return {ok:true,id:prior.report_id,replayed:true};}
      const ids=disclosure.selection.map(row=>row.id);
      // Bind only the selected IDs to their canonical parties, including past/blocked chats.
      const legacy=(await client.query(`SELECT id,sender_id,receiver_id,timestamp FROM messages WHERE id=ANY($1::text[])
        AND ((sender_id=$2 AND receiver_id=$3) OR (sender_id=$3 AND receiver_id=$2)) FOR SHARE`,[ids,context.owner,disclosure.peer])).rows;
      const encrypted=(await client.query(`SELECT m.id,d.owner_id AS sender_id,
        CASE WHEN d.owner_id=g.creator THEN g.recipient ELSE g.creator END AS receiver_id,
        m.created_at AS timestamp,m.hash,m.media_id FROM encrypted_conversation_messages m
        JOIN encrypted_conversations g ON g.id=m.conversation_id JOIN conversation_crypto_devices d ON d.id=m.sender_device
        WHERE m.id=ANY($1::text[]) AND ((g.creator=$2 AND g.recipient=$3) OR (g.creator=$3 AND g.recipient=$2))
          AND d.owner_id IN(g.creator,g.recipient) FOR SHARE OF m,g,d`,[ids,context.owner,disclosure.peer])).rows;
      const found=new Map();
      for(const [source,rows] of [['legacy',legacy],['encrypted',encrypted]])for(const row of rows){
        if(found.has(row.id))throw rejected(409);
        found.set(row.id,{...row,source});
      }
      if(ids.some(value=>!found.has(value))||!ids.some(value=>found.get(value).sender_id===disclosure.peer))throw rejected(403);
      const selection=disclosure.selection.map(item=>{
        const row=found.get(item.id);
        if(item.kind==='media'&&!row.media_id)throw rejected();
        return {...item,source:row.source,sender:row.sender_id,receiver:row.receiver_id,timestamp:row.timestamp,
          ciphertextHash:row.source==='encrypted'?row.hash:null,mediaPresent:Boolean(row.media_id),
          plaintextVerified:false};
      });
      const reportId='report-'+createHash('sha256').update(JSON.stringify([context.owner,disclosure.requestId])).digest('hex');
      const created=new Date(now()).toISOString();
      const claim=await client.query(`INSERT INTO open_report_claims(reporter_user_id,target_type,target_user_id,target_product_id,report_id)
        VALUES($1,'user',$2,'',$3) ON CONFLICT DO NOTHING RETURNING report_id`,[context.owner,disclosure.peer,reportId]);
      if(!claim.rows.length)throw rejected(409);
      await client.query(`INSERT INTO reports(id,target_type,target_user_id,target_product_id,reporter_user_id,reason,description,
        status,review_note,reviewed_by,created_at,updated_at,row_version)
        VALUES($1,'user',$2,'',$3,$4,$5,'open','','',$6,$6,1)`,
        [reportId,disclosure.peer,context.owner,disclosure.reason,disclosure.description,created]);
      await client.query(`INSERT INTO conversation_report_evidence(report_id,reporter_id,request_id,request_hash,consent,selection)
        VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[reportId,context.owner,disclosure.requestId,hash,CONSENT,JSON.stringify(selection)]);
      return {ok:true,id:reportId,replayed:false};
    });
  }
  async function readConversationReportFlags(context) {
    return withTransaction(async client=>{
      await moderator(client,context);
      return (await client.query(`SELECT e.report_id FROM conversation_report_evidence e JOIN reports r ON r.id=e.report_id
        ORDER BY r.created_at DESC,e.report_id LIMIT 1000`)).rows.map(row=>row.report_id);
    });
  }
  async function readConversationReportEvidence(context,payload) {
    if(!exact(payload,['owner','sessionId','reportId','reason'])||payload.owner!==context.owner||payload.sessionId!==context.deviceId
      ||!id(payload.reportId)||!text(payload.reason,300)||payload.reason.trim().length<3)throw rejected();
    return withTransaction(async client=>{
      const role=await moderator(client,context);
      const result=(await client.query(`SELECT e.report_id,e.reporter_id,e.consent,e.selection,e.created_at,
        r.target_user_id,r.reason FROM conversation_report_evidence e JOIN reports r ON r.id=e.report_id
        WHERE e.report_id=$1 FOR SHARE OF e,r`,[payload.reportId])).rows[0];
      if(!result)throw rejected(404);
      await client.query(`INSERT INTO conversation_report_evidence_reads(report_id,reviewer_id,reviewer_role,reason)
        VALUES($1,$2,$3,$4)`,[payload.reportId,context.owner,role,payload.reason.trim()]);
      return {version:1,id:result.report_id,consent:result.consent,reporter:result.reporter_id,peer:result.target_user_id,
        reason:result.reason,selection:result.selection,plaintextVerified:false,filesShared:false};
    });
  }
  return {submitConversationReport,readConversationReportFlags,readConversationReportEvidence};
}
module.exports={CONSENT,validateDisclosure,createConversationReportStore};
