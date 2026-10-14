const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const backend=path.resolve(__dirname,'../backend');
const commands=['verify-conversation-events.js','verify-encrypted-conversation-backups.js',
  'verify-message-device-receipts.js','verify-encrypted-chat-readiness.js',
  'verify-shopping-rooms.js','verify-room-seller-requests.js'];
const databaseUrl='postgres://synthetic-secret:synthetic-secret@db.fixture.invalid/postgres';

async function runCommand(command,env){
  const filename=path.join(backend,command),realRequire=createRequire(filename);
  const module={exports:{}},processFixture={env,argv:['node',filename],exitCode:0};
  const observed={options:[],connects:0,queries:0,closes:0,output:[]};
  class Client{
    constructor(options){observed.options.push(options);}
    async connect(){observed.connects++;throw new Error('synthetic-secret provider rejection');}
    async query(){observed.queries++;throw new Error('SQL must not run after trust rejection');}
    async end(){observed.closes++;}
  }
  const requireFixture=name=>name==='pg'?{Client}:realRequire(name);
  requireFixture.main=module;
  // Execute trusted CLI source with only the pg transport stubbed. No network,
  // production credentials, storage probe or database writes are involved.
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:requireFixture,module,
    process:processFixture,console:{log:value=>observed.output.push(String(value))}},
    {filename,timeout:1000});
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(processFixture.exitCode,1);
  assert.equal(observed.output.length,1);
  const result=JSON.parse(observed.output[0]);
  assert.equal(result.ok,false);assert.equal(result.databaseChanged,false);
  assert.equal(typeof result.errorCode,'string');
  assert.equal(observed.output[0].includes('synthetic-secret'),false);
  assert.equal(observed.queries,0);
  return observed;
}

for(const command of commands){
  for(const mode of ['flag','url'])test(`${command}: rejected provider connection retains strict certificate and hostname options (${mode})`,async()=>{
    const observed=await runCommand(command,{DATABASE_URL:databaseUrl+(mode==='url'?'?sslmode=verify-full':''),
      DATABASE_SSL:mode==='flag'?'true':'false'});
    assert.equal(observed.connects,1);assert.equal(observed.closes,1);
    assert.equal(observed.options.length,1);
    const ssl=observed.options[0].ssl;
    assert.equal(ssl.rejectUnauthorized,true);
    const wrongCertificate={subject:{CN:'other.fixture.invalid'},subjectaltname:'DNS:other.fixture.invalid'};
    assert.equal(ssl.checkServerIdentity('other.fixture.invalid',wrongCertificate).code,'ERR_TLS_CERT_ALTNAME_INVALID');
  });
  test(`${command}: URL certificate overrides fail before connecting and remain aggregate-only`,async()=>{
    const observed=await runCommand(command,{DATABASE_URL:databaseUrl+'?sslmode=require&sslrootcert=/tmp/untrusted.pem',DATABASE_SSL:'true'});
    assert.equal(observed.options.length,0);assert.equal(observed.connects,0);assert.equal(observed.closes,0);
  });
  test(`${command}: missing database configuration produces safe JSON without opening a client`,async()=>{
    const observed=await runCommand(command,{});
    assert.equal(observed.options.length,0);assert.equal(observed.connects,0);assert.equal(observed.closes,0);
  });
}

test('backend operational JavaScript contains no explicit certificate-validation bypass',()=>{
  const bypasses=fs.readdirSync(backend).filter(name=>name.endsWith('.js'))
    .filter(name=>/rejectUnauthorized\s*:\s*false/.test(fs.readFileSync(path.join(backend,name),'utf8')));
  assert.deepEqual(bypasses,[]);
});

test('TLS preflight reports missing pg dependency as safe JSON instead of an uncaught loader error',async()=>{
  const filename=path.resolve(backend,'../scripts/verify-database-tls.js'),module={exports:{}},output=[];
  const realRequire=createRequire(filename),requireFixture=name=>realRequire(name);
  requireFixture.main=module;
  requireFixture.resolve=()=>{throw Object.assign(new Error('synthetic-secret loader detail'),{code:'MODULE_NOT_FOUND'});};
  const processFixture={env:{DATABASE_URL:databaseUrl},exitCode:0};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:requireFixture,module,__dirname:path.dirname(filename),
    process:processFixture,console:{log:value=>output.push(String(value))}},{filename,timeout:1000});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(JSON.parse(output[0]),{mode:'winga-readonly-tls-preflight',verified:false,code:'MODULE_NOT_FOUND'});
  assert.equal(output.length,1);assert.equal(processFixture.exitCode,1);
  assert.equal(output[0].includes('synthetic-secret'),false);
});
