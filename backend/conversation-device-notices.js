const {createHash}=require('node:crypto');
async function recordDeviceSecurityNotice(client,{owner,requestId,action,device}) {
  if(!['register','approve','revoke'].includes(action)||device.owner_id!==owner)throw new Error('Invalid device security notice');
  const id='crypto-notice-'+createHash('sha256').update(JSON.stringify([owner,requestId])).digest('hex');
  // Existing owner-authorized notifications are the durable security event.
  // No message body, key material, IP, user agent or contact is disclosed.
  const inserted=await client.query(`INSERT INTO notifications(id,user_id,actor_username,type,message_id,conversation_id,title,body,is_read,created_at)
    VALUES($1,$2,$2,$3,'',$4,'Encryption device security update','Review your encryption devices.',FALSE,NOW())
    ON CONFLICT(id) DO NOTHING RETURNING id`,[id,owner,'crypto-device-'+action,device.id]);
  if(inserted.rows.length)await client.query("SELECT pg_notify('winga_messages',$1)",[
    JSON.stringify({version:1,type:'crypto_device_security_changed',owner,notificationId:id})]);
}
module.exports={recordDeviceSecurityNotice};
