const test = require('node:test');
const assert = require('node:assert/strict');
const { createGrowthPolicy } = require('../backend/growth-policy');
const { createGrowthApi } = require('../backend/growth-api');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function frontendConfig(hostname, protocol = 'https:', override = {}) {
  const window = { location: { hostname, protocol }, __WINGA_CONFIG_OVERRIDE__: override };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../winga-config.js'), 'utf8'), { window });
  return window.WINGA_CONFIG;
}

test('production frontend enables Growth while local and file defaults remain disabled', () => {
  const production = frontendConfig('wingamarket.com');
  assert.equal(production.growthProductSharing, true);
  assert.equal(production.growthMeasurement, true);
  for (const [host, protocol] of [['localhost','http:'],['127.0.0.1','http:'],['','file:']]) {
    const config = frontendConfig(host, protocol);
    assert.equal(config.growthProductSharing, false);
    assert.equal(config.growthMeasurement, false);
  }
});

test('frontend Growth kill switches remain independent and explicit overrides win', () => {
  const sharingOff = frontendConfig('wingamarket.com', 'https:', { growthProductSharing: false });
  assert.equal(sharingOff.growthProductSharing, false);
  assert.equal(sharingOff.growthMeasurement, true);
  const measurementOff = frontendConfig('wingamarket.com', 'https:', { growthMeasurement: false });
  assert.equal(measurementOff.growthProductSharing, true);
  assert.equal(measurementOff.growthMeasurement, false);
  const localOptIn = frontendConfig('localhost', 'http:', { growthProductSharing: true, growthMeasurement: true });
  assert.equal(localOptIn.growthProductSharing, true);
  assert.equal(localOptIn.growthMeasurement, true);
});

test('cohort modes preserve existing rollout and fail closed for invalid/empty allowlists', () => {
  assert.equal(createGrowthPolicy().allowsCreation(''),true);
  for (const env of [{WINGA_GROWTH_COHORT_MODE:'off'}, {WINGA_GROWTH_COHORT_MODE:'typo'},
    {WINGA_GROWTH_COHORT_MODE:'allowlist'},
    {WINGA_GROWTH_COHORT_MODE:'allowlist',WINGA_GROWTH_COHORT_USERS:'rey,../invalid'}]) {
    assert.equal(createGrowthPolicy(env).allowsCreation('rey'),false);
  }
});

test('allowlist requires both enrolled source and recipient; guest measurement is explicit', () => {
  const env={WINGA_GROWTH_COHORT_MODE:'allowlist',WINGA_GROWTH_COHORT_USERS:'rey, wizad,rey'};
  const p=createGrowthPolicy(env);
  assert.equal(p.allowsCreation('rey'),true);
  assert.equal(p.allowsCreation(''),false);
  assert.equal(p.allowsCreation('other'),false);
  assert.equal(p.allowsMeasurement('rey','wizad'),true);
  assert.equal(p.allowsMeasurement('other','rey'),false);
  assert.equal(p.allowsMeasurement('rey','other'),false);
  assert.equal(p.allowsMeasurement('rey',''),false);
  assert.equal(p.summary.enrolledAccounts,2);
  const g=createGrowthPolicy({...env,WINGA_GROWTH_COHORT_GUEST_MEASUREMENT:'true'});
  assert.equal(g.allowsMeasurement('rey',''),true);
  assert.equal(g.allowsMeasurement('other',''),false);
  assert.equal(g.allowsMeasurement('rey','other'),false);
  assert.equal(JSON.stringify(g.summary).includes('rey'),false);
});

test('server rejects nonenrolled creation before body/store calls, preserving old share reads', async () => {
  let result, calls=0, bodies=0;
  const deps={cohort:createGrowthPolicy({WINGA_GROWTH_COHORT_MODE:'allowlist',WINGA_GROWTH_COHORT_USERS:'rey'}),
    productSharingEnabled:true,measurementEnabled:true,findSession:()=>({username:'other'}),
    readAuthToken:()=>'',clientIp:()=> '127.0.0.1',ensureUser:()=>true,isAdminSession:()=>false,
    collectBody:async()=>{bodies++;return {};},sendJson:(_res,status,body)=>{result={status,body};},
    getStore:()=>({createGrowthShare:async()=>{calls++;},resolveGrowthShare:async()=>({destinationId:'p1'})})};
  const api=createGrowthApi(deps),req={method:'POST',headers:{'user-agent':'Mozilla/5.0'}};
  await api.handle(req,{},new URL('https://winga.test/api/growth/shares'));
  assert.equal(result.status,403);assert.equal(result.body.code,'growth_cohort_excluded');
  assert.equal(calls,0);assert.equal(bodies,0);
  await api.handle({...req,method:'GET'},{},new URL('https://winga.test/api/growth/shares/11111111-1111-4111-8111-111111111111'));
  assert.equal(result.status,200);assert.equal(result.body.destinationId,'p1');
});
