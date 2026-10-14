const {X509Certificate}=require('node:crypto');
const {checkServerIdentity}=require('node:tls');
const SSL_KEYS=['ssl','sslmode','sslrootcert','sslcert','sslkey'];
const failure=code=>{throw Object.assign(new Error(code),{code});};
function databaseConnectionOptions(connectionString,{ssl=false,ca=process.env.DATABASE_SSL_CA||'',caBase64=process.env.DATABASE_SSL_CA_BASE64||''}={}){
  let url;try{url=new URL(connectionString);}catch{failure('DATABASE_CONFIGURATION_INVALID');}
  if(!['postgres:','postgresql:'].includes(url.protocol))failure('DATABASE_CONFIGURATION_INVALID');
  const mode=url.searchParams.get('sslmode');
  if(mode&&!['disable','require','verify-ca','verify-full'].includes(mode))failure('DATABASE_TLS_MODE_UNSAFE');
  if(SSL_KEYS.filter(k=>k!=='sslmode').some(k=>url.searchParams.has(k)))failure('DATABASE_TLS_URL_OVERRIDE_REJECTED');
  if(ssl&&mode==='disable')failure('DATABASE_TLS_MODE_CONFLICT');
  const enabled=ssl||Boolean(mode&&mode!=='disable');
  for(const key of SSL_KEYS)url.searchParams.delete(key);
  if(!enabled)return {connectionString:url.toString(),ssl:false};
  if(ca&&caBase64)failure('DATABASE_TLS_CA_CONFLICT');
  if(caBase64){if(!/^[A-Za-z0-9+/]*={0,2}$/.test(caBase64)||caBase64.length>87384)failure('DATABASE_TLS_CA_INVALID');ca=Buffer.from(caBase64,'base64').toString('utf8');}
  if(ca){
    if(typeof ca!=='string'||Buffer.byteLength(ca)>65536)failure('DATABASE_TLS_CA_INVALID');
    const blocks=ca.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    if(!blocks?.length||ca.replace(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,'').trim())failure('DATABASE_TLS_CA_INVALID');
    try{blocks.forEach(cert=>new X509Certificate(cert));}catch{failure('DATABASE_TLS_CA_INVALID');}
  }
  // pg URL SSL parameters can replace the explicit object; consume them above.
  // All encrypted connections require both certificate and hostname verification.
  const host=url.hostname.replace(/^\[|\]$/g,'');
  return {connectionString:url.toString(),ssl:{rejectUnauthorized:true,
    checkServerIdentity:(_hostname,cert)=>checkServerIdentity(host,cert),...(ca?{ca}:{})}};
}
module.exports={databaseConnectionOptions};
