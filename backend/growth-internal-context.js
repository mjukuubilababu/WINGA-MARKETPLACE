const {fail}=require('./growth-infrastructure');
const roomAccess=require('./encrypted-shopping-rooms').createShoppingRooms({}).access;
// Authorize metadata through existing native membership. Never select ciphertext,
// decrypt messages or use attribution as an admission/permission grant.
async function authorizeInternalShare(client,messageId,username,{source=false,deviceId=null,authorizeDirect,allowRooms=true}={}){
  if(!username)fail(403,'growth_auth_required');
  const message=(await client.query(`SELECT m.id,m.conversation_id,m.epoch,m.sender_device,m.created_at::text AS created_at,
    d.owner_id AS sender FROM encrypted_conversation_messages m JOIN encrypted_conversation_epoch_devices d
      ON d.conversation_id=m.conversation_id AND d.epoch=m.epoch AND d.device_id=m.sender_device WHERE m.id=$1`,[messageId])).rows[0];
  if(!message||source&&message.sender!==username)fail(404,'growth_internal_share_unavailable');
  const group=(await client.query(`SELECT id,kind,status,epoch FROM encrypted_conversations WHERE id=$1${deviceId?' FOR SHARE':''}`,[message.conversation_id])).rows[0];
  if(!group||group.status!=='active')fail(404,'growth_internal_share_unavailable');
  const device=(await client.query(`SELECT d.device_id FROM encrypted_conversation_epoch_devices d
    JOIN conversation_crypto_devices native ON native.id=d.device_id AND native.status='active'
    WHERE d.conversation_id=$1 AND d.epoch=$2 AND d.owner_id=$3 AND ($5::text IS NULL OR d.device_id=$5)
      AND EXISTS(SELECT 1 FROM encrypted_conversation_epoch_devices historical WHERE historical.conversation_id=$1 AND historical.epoch=$4 AND historical.owner_id=$3 AND ($5::text IS NULL OR historical.device_id=$5))
    LIMIT 1`,[group.id,group.epoch,username,message.epoch,deviceId])).rows[0];
  if(!device)fail(404,'growth_internal_share_unavailable');
  if(group.kind==='shopping-room'){
    if(!allowRooms)fail(503,'encrypted_rooms_disabled');
    try{await roomAccess(client,{owner:username},device.device_id,group,{pending:false});}catch{fail(404,'growth_internal_share_unavailable');}
  }else if(authorizeDirect){await authorizeDirect(client,group,device.device_id,username);
  }else{
    const owners=(await client.query(`SELECT DISTINCT owner_id FROM encrypted_conversation_epoch_devices WHERE conversation_id=$1 AND epoch=$2`,[group.id,group.epoch])).rows.map(row=>row.owner_id);
    if((await client.query("SELECT username FROM users WHERE username=ANY($1::text[]) AND status='active'",[owners])).rows.length!==owners.length
      ||(await client.query('SELECT 1 FROM user_blocks WHERE blocker_username=ANY($1::text[]) AND blocked_username=ANY($1::text[]) LIMIT 1',[owners])).rows.length)fail(404,'growth_internal_share_unavailable');
  }
  return {message,surface:group.kind==='shopping-room'?'room':'conversation'};
}
module.exports={authorizeInternalShare};
