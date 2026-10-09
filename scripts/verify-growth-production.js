// Fixed-host, unauthenticated readback. Never execute a downloaded config or
// treat static frontend defaults as evidence of backend cohort authorization.
const {boundedJson,boundedText,requestErrorCode}=require('./production-conversation-soak');
const urls=Object.freeze({backend:'https://winga-pflp.onrender.com/api/health',
  frontend:'https://wingamarket.com/build-version.json',
  www:'https://www.wingamarket.com/build-version.json',
  config:'https://wingamarket.com/winga-config.js'});
function options(args) {
  const result={timeoutMs:10000};let confirmed=false;
  for(const arg of args) {
    if(arg==='--confirm=read-only-growth-verification'){confirmed=true;continue;}
    const match=/^--(expect-backend-commit|expect-frontend-build|expect-flags)=(.+)$/.exec(arg);
    if(!match)throw new Error('INVALID_VERIFIER_OPTIONS');
    if(match[1]==='expect-backend-commit'&&/^[a-f0-9]{40}$/.test(match[2]))result.backendCommit=match[2];
    else if(match[1]==='expect-frontend-build'&&/^\d{14}$/.test(match[2]))result.frontendBuild=match[2];
    else if(match[1]==='expect-flags'&&['enabled','disabled'].includes(match[2]))result.flagsEnabled=match[2]==='enabled';
    else throw new Error('INVALID_VERIFIER_OPTIONS');
  }
  if(!confirmed)throw new Error('VERIFIER_CONFIRMATION_REQUIRED');
  if(!result.backendCommit||!result.frontendBuild||typeof result.flagsEnabled!=='boolean')throw new Error('EXPECTED_RELEASE_REQUIRED');
  return result;
}
function frontendDefaults(source) {
  const sections=[...source.matchAll(/^const WINGA_DEFAULT_CONFIG = \{([\s\S]*?)^\};/gm)];
  if(sections.length!==1)throw new Error('FRONTEND_CONFIG_UNRECOGNIZED');
  return Object.fromEntries(['growthProductSharing','growthMeasurement'].map(name=>{
    const values=[...sections[0][1].matchAll(new RegExp(`^[ \\t]*${name}:[ \\t]*(true|false),[ \\t]*(?://[^\\r\\n]*)?$`,'gm'))];
    if(values.length!==1)throw new Error('FRONTEND_CONFIG_UNRECOGNIZED');
    return [name,values[0][1]==='true'];
  }));
}
async function run(config,{fetchImpl=fetch}={}) {
  // Validate injected options too: a caller cannot silently omit release gates.
  config=options(['--confirm=read-only-growth-verification',
    `--expect-backend-commit=${config.backendCommit}`,`--expect-frontend-build=${config.frontendBuild}`,
    `--expect-flags=${config.flagsEnabled===true?'enabled':config.flagsEnabled===false?'disabled':'invalid'}`]);
  const checks=[];let backendCommit=null,frontendBuild=null,wwwBuild=null,flags=null;
  for(const [name,url] of Object.entries(urls)) {
    let status=0,errorCode=null;
    try {
      const response=await fetchImpl(url,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
        headers:{Accept:name==='config'?'text/javascript':'application/json'},signal:AbortSignal.timeout(config.timeoutMs)});
      status=response.status;
      if(status!==200){await response.body?.cancel();throw new Error('HTTP_NOT_READY');}
      if(name==='config') {
        flags=frontendDefaults(await boundedText(response,65536));
        if(Object.values(flags).some(value=>value!==config.flagsEnabled))throw new Error('FRONTEND_FLAGS_MISMATCH');
      } else {
        const body=await boundedJson(response);
        if(name==='backend') {
          if(body?.ok!==true||body.readiness!=='ready')throw new Error('HEALTH_CONTRACT_FAILED');
          const identity=response.headers.get('x-winga-commit');
          if(!/^[a-f0-9]{40}$/.test(identity||''))throw new Error('RELEASE_ID_UNAVAILABLE');
          backendCommit=identity;
          if(identity!==config.backendCommit)throw new Error('BACKEND_COMMIT_MISMATCH');
        } else {
          if(!/^\d{14}$/.test(body?.version||''))throw new Error('HEALTH_CONTRACT_FAILED');
          if(name==='frontend')frontendBuild=body.version;else wwwBuild=body.version;
          if(body.version!==config.frontendBuild)throw new Error('FRONTEND_BUILD_MISMATCH');
        }
      }
    } catch(error) {
      const safe=['FRONTEND_CONFIG_UNRECOGNIZED','FRONTEND_FLAGS_MISMATCH','BACKEND_COMMIT_MISMATCH','FRONTEND_BUILD_MISMATCH'];
      errorCode=safe.includes(error?.message)?error.message:requestErrorCode(error);
    }
    checks.push({name,httpStatus:status,ok:errorCode===null,errorCode});
    if(status===429)break; // No retries, no continued probing after rate limiting.
  }
  const ok=checks.length===4&&checks.every(check=>check.ok);
  return {ok,publicChecksPassed:ok,mode:'production-growth-public-read-only-verification',
    applicationWrites:false,backendCommit,frontendBuild,wwwBuild,frontendDefaultFlags:flags,checks,
    backendGrowthFlagsVerified:false,backendCohortVerified:false,authenticatedGrowthCanaryVerified:false,
    authenticatedMessagingVerified:false,productionAcceptancePassed:false,
    remainingGates:['authenticated-backend-flags-and-cohort-readback','authenticated-growth-canary','approved-device-messaging-acceptance']};
}
if(require.main===module)(async()=>{
  const result=await run(options(process.argv.slice(2)));
  console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
})().catch(error=>{
  const safe=['INVALID_VERIFIER_OPTIONS','VERIFIER_CONFIRMATION_REQUIRED','EXPECTED_RELEASE_REQUIRED'];
  console.error(JSON.stringify({ok:false,errorCode:safe.includes(error?.message)?error.message:'VERIFICATION_FAILED'}));process.exitCode=1;
});
module.exports={options,frontendDefaults,run};
