const {createHash}=require('node:crypto');
const {failure}=require('./encrypted-content-contract');
const validRevision=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v);
const view=row=>({version:1,shareActivity:row?.share_activity===true,revision:row?String(row.revision):'0'});
async function read(client,owner){return view((await client.query('SELECT share_activity,revision::text FROM conversation_activity_preferences WHERE owner_id=$1',[owner])).rows[0]);}
async function save(client,owner,op){
  const p=op.payload;
  if(typeof p.shareActivity!=='boolean'||!validRevision(p.expectedRevision))throw failure(400,'activity_preference_invalid');
  const hash=createHash('sha256').update(JSON.stringify([op.actorId,p.shareActivity,p.expectedRevision])).digest('hex');
  await client.query(`INSERT INTO conversation_activity_preferences(owner_id) VALUES($1) ON CONFLICT DO NOTHING`,[owner]);
  const row=(await client.query('SELECT * FROM conversation_activity_preferences WHERE owner_id=$1 FOR UPDATE',[owner])).rows[0];
  if(row.last_request_id===op.requestId){if(row.last_request_hash!==hash)throw failure(409,'activity_preference_conflict');return view(row);}
  if(String(row.revision)!==p.expectedRevision)throw failure(409,'activity_preference_conflict');
  return view((await client.query(`UPDATE conversation_activity_preferences SET share_activity=$2,revision=revision+1,
    last_request_id=$3,last_request_hash=$4,updated_at=NOW() WHERE owner_id=$1 RETURNING *`,[owner,p.shareActivity,op.requestId,hash])).rows[0]);
}
module.exports={read,save};
