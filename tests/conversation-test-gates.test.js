const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {localTestDatabase}=require('../scripts/run-conversation-postgres-tests');
const root=path.resolve(__dirname,'..');

test('PostgreSQL acceptance gate refuses missing, remote or ambiguous targets instead of silently skipping',()=>{
  for(const value of [undefined,'','not a URL','https://localhost/postgres','postgres://db.example.invalid/postgres',
    'postgres://127.0.0.1/production','postgres://localhost/postgres?sslmode=disable','postgres://localhost/postgres#fragment']) {
    assert.equal(localTestDatabase(value),false);
  }
  for(const host of ['127.0.0.1','localhost','[::1]'])assert.equal(localTestDatabase('postgres://synthetic@'+host+':55440/postgres'),true);
});

test('spec release profiles retain direct, E2EE, Room, security and genuine PostgreSQL gates',()=>{
  const scripts=require('../package.json').scripts;
  for(const key of ['test:conversation-direct','test:conversation-e2ee','test:conversation-rooms',
    'test:conversation-security','test:conversation-postgres','verify:conversation-dependencies'])assert.ok(scripts[key],key);
  for(const key of ['test:conversation-direct','test:conversation-security']) {
    for(const file of scripts[key].split(' ').filter(value=>value.startsWith('tests/')))assert.ok(fs.existsSync(path.join(root,file)),file);
  }
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/conversation-tests.yml'),'utf8');
  for(const command of ['test:conversation-direct','test:conversation-e2ee','test:conversation-rooms',
    'test:conversation-security','test:conversation-postgres','test:secure-content-browser',
    'test:phoenix-transport','verify:conversation-dependencies'])assert.ok(workflow.includes(command),command);
  assert.ok(workflow.includes('mix test'));
  assert.ok(workflow.includes('github/codeql-action/analyze@v4'));
  assert.equal(/secrets\.|https:\/\/winga(?:market|[-.])/.test(workflow),false);
});
test('acceptance runner refuses inherited test filtering before attempting any database work',()=>{
  const result=spawnSync(process.execPath,[path.join(root,'scripts/run-conversation-postgres-tests.js')],{encoding:'utf8',
    env:{...process.env,WINGA_TEST_POSTGRES_URL:'postgres://synthetic@127.0.0.1:55446/postgres',NODE_OPTIONS:'--test-name-pattern=never-match-a-gate'}});
  assert.equal(result.status,1);
  assert.deepEqual(JSON.parse(result.stderr.trim()),{ok:false,errorCode:'TEST_RUNTIME_OPTIONS_NOT_ALLOWED'});
});

test('real transport browser fixture forwards peer and encoded cursor queries with its original authentication',async()=>{
  let routeHandler,closed=0;
  const stop=new Error('Stop before opening a real page');
  const context={grantPermissions:async()=>{},route:async(_pattern,handler)=>{routeHandler=handler;},
    newPage:async()=>{throw stop;},unrouteAll:async()=>{},close:async()=>{closed++;}};
  const browser={newContext:async()=>context,close:async()=>{closed++;}};
  const fixture={exports:{}};
  require('node:vm').runInNewContext(fs.readFileSync(path.join(root,'tests/helpers/phoenix-browser-exercise.js'),'utf8'),{
    module:fixture,process:{env:{WINGA_TEST_BROWSER_CHANNEL:'chromium'}},URL,
    require:name=>name==='@playwright/test'?{chromium:{launch:async()=>browser}}:require(name)
  });
  await assert.rejects(fixture.exports({root,backend:'http://127.0.0.1:45000',port:45001,
    tokens:{bob2:'synthetic-session'},csrf:'synthetic-csrf',pool:{}}),error=>error===stop);
  assert.equal(closed,2);
  let forwarded,fulfilled;
  const response={fixtureResponse:true};
  await routeHandler({request:()=>({url:()=> 'http://localhost:4173/api/conversations/encrypted/mode?peer=bob&cursor=a%2Fb'}),
    fetch:async options=>{forwarded=options;return response;},fulfill:async options=>{fulfilled=options;}});
  assert.equal(forwarded.url,'http://127.0.0.1:45000/api/conversations/encrypted/mode?peer=bob&cursor=a%2Fb');
  assert.equal(forwarded.headers.Cookie,'winga_auth=synthetic-session; winga_csrf=synthetic-csrf');
  assert.equal(forwarded.headers['X-CSRF-Token'],'synthetic-csrf');
  assert.equal(forwarded.headers.Origin,'http://localhost:4173');
  assert.equal(fulfilled.response,response);
});
