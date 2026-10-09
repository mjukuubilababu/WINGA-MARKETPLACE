const {test}=require('node:test');
const assert=require('node:assert/strict');
const {options,frontendDefaults,run}=require('../scripts/verify-growth-production');
const config={backendCommit:'a'.repeat(40),frontendBuild:'20261009150025',flagsEnabled:true};
const source=enabled=>`const WINGA_DEFAULT_CONFIG = {\n  growthProductSharing: ${enabled},\n  growthMeasurement: ${enabled},\n};\n`;
function harness(change=()=>{}) {
  const requests=[];
  return {requests,fetchImpl:async(url,init)=>{
    requests.push({url,init});const override=change(url);if(override)return override;
    return url.includes('winga-config.js')?new Response(source(true)):
      new Response(JSON.stringify(url.includes('build-version')?{version:config.frontendBuild}:{ok:true,readiness:'ready'}),
        {headers:{'x-winga-commit':config.backendCommit}});
  }};
}
test('verifier requires confirmation, expected releases, and explicit flag intent',()=>{
  assert.throws(()=>options([]),/CONFIRMATION_REQUIRED/);
  assert.throws(()=>options(['--confirm=read-only-growth-verification']),/EXPECTED_RELEASE_REQUIRED/);
  const args=['--confirm=read-only-growth-verification',`--expect-backend-commit=${config.backendCommit}`,
    `--expect-frontend-build=${config.frontendBuild}`,'--expect-flags=enabled'];
  assert.deepEqual(options(args),{timeoutMs:10000,...config});
  for(const arg of ['--url=https://example.com','--expect-flags=true','--expect-backend-commit=abc'])assert.throws(()=>options([...args,arg]),/INVALID_VERIFIER_OPTIONS/);
});
test('matching public release readback never claims backend cohort or messaging acceptance',async()=>{
  const h=harness(),r=await run(config,h);
  assert.equal(r.ok,true);assert.equal(r.checks.length,4);assert.equal(r.backendCohortVerified,false);
  assert.equal(r.authenticatedGrowthCanaryVerified,false);assert.equal(r.productionAcceptancePassed,false);
  assert.equal(r.applicationWrites,false);
  for(const {url,init} of h.requests){assert.match(url,/^https:\/\/(winga-pflp\.onrender\.com|(?:www\.)?wingamarket\.com)\//);
    assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');assert.equal(init.headers.Authorization,undefined);}
});
test('stale www deployment fails despite matching apex and backend',async()=>{
  const h=harness(url=>url.includes('www.')?new Response(JSON.stringify({version:'20261009050946'})):undefined),r=await run(config,h);
  assert.equal(r.ok,false);assert.equal(r.checks.find(c=>c.name==='www').errorCode,'FRONTEND_BUILD_MISMATCH');
});
test('different backend commit fails and missing commit fails closed',async()=>{
  for(const identity of ['b'.repeat(40),'']) {
    const h=harness(url=>url.includes('pflp')?new Response('{"ok":true,"readiness":"ready"}',{headers:{'x-winga-commit':identity}}):undefined);
    const r=await run(config,h);assert.equal(r.ok,false);
    assert.equal(r.checks[0].errorCode,identity?'BACKEND_COMMIT_MISMATCH':'RELEASE_ID_UNAVAILABLE');
  }
});
test('changed frontend flags fail even when release manifests match',async()=>{
  const h=harness(url=>url.includes('winga-config')?new Response(source(false)):undefined),r=await run(config,h);
  assert.equal(r.ok,false);assert.equal(r.checks.at(-1).errorCode,'FRONTEND_FLAGS_MISMATCH');
});
test('literal config parsing rejects duplicates and expressions without executing remote source',()=>{
  assert.deepEqual(frontendDefaults(source(false)),{growthProductSharing:false,growthMeasurement:false});
  for(const text of [source(true).replace('growthProductSharing: true','growthProductSharing: (()=>{throw new Error("executed")})()'),
    source(true).replace('};','  growthProductSharing: false,\n};'),source(true)+source(false)]) {
    assert.throws(()=>frontendDefaults(text),/FRONTEND_CONFIG_UNRECOGNIZED/);
  }
});
test('untrusted config bytes and error messages are bounded and never echoed',async()=>{
  const h=harness(url=>url.includes('winga-config')?new Response('private-secret'.repeat(6000)):undefined),r=await run(config,h);
  assert.equal(r.ok,false);assert.equal(r.checks.at(-1).errorCode,'RESPONSE_TOO_LARGE');
  assert.equal(JSON.stringify(r).includes('private-secret'),false);
  const e=await run(config,{fetchImpl:async()=>{throw new Error('private-secret');}});
  assert.equal(e.ok,false);assert.equal(JSON.stringify(e).includes('private-secret'),false);
});
test('rate limiting stops readback without retries or remaining requests',async()=>{
  const h=harness(()=>new Response('{}',{status:429})),r=await run(config,h);
  assert.equal(r.ok,false);assert.equal(h.requests.length,1);
});
