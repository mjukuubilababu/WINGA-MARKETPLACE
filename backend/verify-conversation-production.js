const {FLAGS,readConversationProductionPolicy}=require('./conversation-production-policy');
async function main() {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--print-settings') {
    console.log([...Object.values(FLAGS).map(key=>key+'=true'),'NODE_VERSION=24'].join('\n'));return;
  }
  if(args.length){console.log(JSON.stringify({ok:false,errorCode:'UNSUPPORTED_ARGUMENT'}));process.exitCode=1;return;}
  const policy=readConversationProductionPolicy();
  const port=Number(process.env.PORT||3000);
  if(!Number.isInteger(port)||port<1||port>65535){process.exitCode=1;return;}
  const health=await require('../scripts/check-conversation-health').checkConversationHealth({
    url:`http://127.0.0.1:${port}/api/ops/conversations/health`,token:process.env.OPS_HEALTH_TOKEN,allowLocal:true});
  console.log(JSON.stringify({mode:'verify-conversation-production',databaseChanged:false,remoteWrites:false,flagsChanged:false,
    ...health,policy},null,2));if(!health.ok)process.exitCode=1;
}
if(require.main===module)main();
