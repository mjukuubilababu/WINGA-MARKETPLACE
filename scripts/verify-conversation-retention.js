const {Client}=require(require.resolve('pg',{paths:[require('node:path').join(__dirname,'..','backend')]}));
const {databaseConnectionOptions}=require('../backend/database-tls');
const {inspectConversationRetention}=require('../backend/conversation-retention-audit');
async function main(){
  let client;
  try{
    client=new Client({...databaseConnectionOptions(process.env.DATABASE_URL,{ssl:String(process.env.DATABASE_SSL||'').toLowerCase()==='true'}),
      connectionTimeoutMillis:5000,statement_timeout:5000});
    await client.connect();await client.query('BEGIN READ ONLY');
    const result=await inspectConversationRetention(client,{ackRetentionDays:Number(process.env.CONVERSATION_ACK_RETENTION_DAYS||30)});
    await client.query('ROLLBACK');console.log(JSON.stringify(result));
  }catch(error){console.log(JSON.stringify({mode:'conversation-retention-dry-run',deletionExecuted:false,
    errorCode:/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'RETENTION_AUDIT_FAILED'}));process.exitCode=1;}
  finally{if(client)await client.end().catch(()=>{});}
}
if(require.main===module)void main();
