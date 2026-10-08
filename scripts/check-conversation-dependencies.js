const path=require('node:path');
const {spawnSync}=require('node:child_process');

function assess(result) {
  let report;
  try{report=JSON.parse(result.stdout);}catch{return {ok:false,errorCode:'DEPENDENCY_SCAN_UNAVAILABLE'};}
  const counts=report?.metadata?.vulnerabilities;
  if(result.error||report.error||![0,1].includes(result.status)||!counts
    ||['info','low','moderate','high','critical','total'].some(key=>!Number.isSafeInteger(counts[key])||counts[key]<0)
    ||counts.total!==counts.info+counts.low+counts.moderate+counts.high+counts.critical
    ||(result.status===1&&counts.total===0)) {
    return {ok:false,errorCode:'DEPENDENCY_SCAN_UNAVAILABLE'};
  }
  return {ok:counts.high===0&&counts.critical===0,vulnerabilities:counts};
}

function main() {
  const root=path.resolve(__dirname,'..'),results=[];
  for(const scope of ['frontend','backend']) {
    const cwd=scope==='backend'?path.join(root,'backend'):root;
    const command=process.platform==='win32'?process.env.ComSpec||'cmd.exe':'npm';
    const args=process.platform==='win32'?['/d','/s','/c','npm audit --json --ignore-scripts']:['audit','--json','--ignore-scripts'];
    const result=spawnSync(command,args,{cwd,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024});
    results.push({scope,...assess(result)});
  }
  const ok=results.every(result=>result.ok);
  console.log(JSON.stringify({ok,mode:'conversation-dependency-scan',privacy:'aggregate-only',
    threshold:'high',sourceCodeSent:false,dependencyMetadataSent:true,results},null,2));
  if(!ok)process.exitCode=1;
}
if(require.main===module)main();
module.exports={assess};
