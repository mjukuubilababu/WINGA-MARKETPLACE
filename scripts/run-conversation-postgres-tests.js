const path=require('node:path');
const {spawnSync}=require('node:child_process');

function localTestDatabase(value) {
  try {
    const url=new URL(value);
    return ['postgres:','postgresql:'].includes(url.protocol)&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)
      && !url.search&&!url.hash&&url.pathname==='/postgres';
  }catch{return false;}
}
function main() {
  if(process.env.NODE_OPTIONS?.trim()) {
    console.error(JSON.stringify({ok:false,errorCode:'TEST_RUNTIME_OPTIONS_NOT_ALLOWED'}));process.exitCode=1;return;
  }
  if(!localTestDatabase(process.env.WINGA_TEST_POSTGRES_URL)) {
    console.error(JSON.stringify({ok:false,errorCode:'DISPOSABLE_LOCAL_POSTGRES_REQUIRED'}));process.exitCode=1;return;
  }
  const tests=['conversation-event-concurrency.test.js','encrypted-conversation-concurrency.test.js',
    'conversation-operations.test.js','conversation-invariants.test.js','legacy-conversation-compatibility.test.js',
    'conversation-experience-store.test.js','shopping-rooms-service.test.mjs',
    'growth-loops.test.mjs','growth-postgres.test.mjs'].map(file=>'tests/'+file);
  const env={...process.env,WINGA_TEST_SHOPPING_ROOMS_POSTGRES:'true'};delete env.NODE_TEST_CONTEXT;
  const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests],{
    cwd:path.resolve(__dirname,'..'),stdio:'inherit',windowsHide:true,timeout:30*60*1000,
    env});
  if(result.error||result.status!==0)process.exitCode=1;
}
if(require.main===module)main();
module.exports={localTestDatabase};
