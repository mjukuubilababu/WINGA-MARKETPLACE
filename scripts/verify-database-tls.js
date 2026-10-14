const {Client}=require(require.resolve('pg',{paths:[require('node:path').join(__dirname,'..','backend')]}));
const {databaseConnectionOptions}=require('../backend/database-tls');
async function verify({url,ca,caBase64,ClientClass=Client}){
  const client=new ClientClass({...databaseConnectionOptions(url,{ssl:true,ca,caBase64}),connectionTimeoutMillis:5000,statement_timeout:3000});
  try{
    await client.connect();await client.query('BEGIN READ ONLY');
    const rows=(await client.query('SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows;
    await client.query('ROLLBACK');
    const stream=client.connection?.stream;
    return {mode:'winga-readonly-tls-preflight',verified:stream?.authorized===true&&rows[0]?.ssl===true,
      tls:rows[0]?.ssl===true,protocol:rows[0]?.version||null};
  }finally{await client.end().catch(()=>{});}
}
async function main(){
  try{
    const result=await verify({url:process.env.DATABASE_URL,ca:process.env.DATABASE_SSL_CA||'',caBase64:process.env.DATABASE_SSL_CA_BASE64||''});
    console.log(JSON.stringify(result));if(!result.verified)process.exitCode=1;
  }catch(error){
    const code=/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'TLS_PREFLIGHT_FAILED';
    console.log(JSON.stringify({mode:'winga-readonly-tls-preflight',verified:false,code}));process.exitCode=1;
  }
}
if(require.main===module)void main();
module.exports={verify};
