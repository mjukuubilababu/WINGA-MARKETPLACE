const {test}=require('node:test'),assert=require('node:assert/strict');
const {databaseConnectionOptions:options}=require('../backend/database-tls');
const url='postgres://synthetic:synthetic@localhost:5432/postgres';
test('all requested TLS modes require certificate and hostname validation and consume URL overrides',()=>{
  for(const sslmode of ['require','verify-ca','verify-full']){
    const result=options(url+'?sslmode='+sslmode+'&application_name=fixture');
    assert.equal(result.ssl.rejectUnauthorized,true);assert.equal(typeof result.ssl.checkServerIdentity,'function');
    assert.equal(new URL(result.connectionString).searchParams.has('sslmode'),false);
  }
  assert.equal(options(url,{ssl:true}).ssl.rejectUnauthorized,true);
  assert.equal(options(url).ssl,false);
});
test('hostname verification binds to the configured database host including IP connections',()=>{
  const cert={subject:{CN:'other.example'},subjectaltname:'DNS:other.example'};
  assert.equal(options(url,{ssl:true}).ssl.checkServerIdentity('other.example',cert).code,'ERR_TLS_CERT_ALTNAME_INVALID');
  assert.equal(options(url.replace('localhost','127.0.0.1'),{ssl:true}).ssl.checkServerIdentity('other.example',cert).code,'ERR_TLS_CERT_ALTNAME_INVALID');
  assert.equal(options(url.replace('localhost','other.example'),{ssl:true}).ssl.checkServerIdentity('untrusted-argument',cert),undefined);
});
test('unsafe modes, conflicts, URL SSL objects and malformed public CA fail closed without credentials in errors',()=>{
  for(const suffix of ['?sslmode=prefer','?sslmode=allow','?ssl=true','?sslrootcert=/tmp/cert','?sslcert=x','?sslkey=x']){
    assert.throws(()=>options(url+suffix),e=>e.code.startsWith('DATABASE_TLS_')&&!e.message.includes('synthetic'));
  }
  assert.throws(()=>options(url+'?sslmode=disable',{ssl:true}),{code:'DATABASE_TLS_MODE_CONFLICT'});
  assert.throws(()=>options(url,{ssl:true,ca:'bad cert'}),{code:'DATABASE_TLS_CA_INVALID'});
  assert.throws(()=>options(url,{ssl:true,ca:'a',caBase64:'b'}),{code:'DATABASE_TLS_CA_CONFLICT'});
});
test('preflight proves both TLS and authorized certificate using only read-only SQL',async()=>{
  const calls=[];class Client{constructor(o){assert.equal(o.ssl.rejectUnauthorized,true);this.connection={stream:{authorized:true}};}async connect(){}async query(sql){calls.push(sql);return {rows:[{ssl:true,version:'TLSv1.3'}]};}async end(){calls.push('end');}}
  assert.deepEqual(await require('../scripts/verify-database-tls').verify({url,ClientClass:Client}),{mode:'winga-readonly-tls-preflight',verified:true,tls:true,protocol:'TLSv1.3'});
  assert.deepEqual(calls,['BEGIN READ ONLY','SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()','ROLLBACK','end']);
});
