const {failure}=require('./encrypted-content-contract');
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
function operationScopes(context,op){
  const p=op.payload,keys=[];
  const group=id=>{if(!uuid(id))throw failure(400,'encrypted_operation_invalid');keys.push('group:'+id);};
  if(op.action==='room-reserve'){
    let intent;try{intent=JSON.parse(p.intent);}catch{throw failure(400,'encrypted_operation_invalid');}
    group(intent?.conversationId);
  }else if(p.conversationId!==undefined)group(p.conversationId);
  if(['reserve','directory'].includes(op.action)){
    if(![context?.owner,p.peer].every(v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v))||context.owner===p.peer)
      throw failure(400,'encrypted_operation_invalid');
    keys.push('pair:'+JSON.stringify([context.owner,p.peer].sort()));
  }
  if(op.action==='seller-question-reserve')group(p.directId);
  if(op.action.startsWith('seller-'))keys.push('seller-question:'+p.id);
  if(['send','room-send'].includes(op.action))keys.push('message:'+p.id);
  if(['media-reserve','room-media-reserve'].includes(op.action))keys.push('media:'+p.id);
  return [...new Set(keys)].sort();
}
async function withTransportLocks(client,scopes,work){
  try{
    await client.query("SET LOCAL lock_timeout='3s'");
    // Old writers/pruners still take this key exclusively; new writers share it.
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtext('winga-encrypted-transport'))");
    for(const key of [...new Set(scopes)].sort())
      await client.query("SELECT pg_advisory_xact_lock(hashtext('winga-encrypted-scope'),hashtext($1))",[key]);
    return await work();
  }catch(error){if(['55P03','40P01'].includes(error.code))throw failure(503,'encrypted_operation_busy');throw error;}
}
module.exports={operationScopes,withTransportLocks};
