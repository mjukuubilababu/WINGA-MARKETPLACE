const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function fixture(packages=[],roomLimits){
  const context=vm.createContext({structuredClone});
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/chat/room-session.js'),'utf8'),context);
  const calls=[];
  const room=context.WingaRoomSession.createRoomSession({owner:'alice',roomLimits,runtime:()=>({prepareKeyPackage:async()=>{calls.push('package');return {id:'own',hash:'own-hash'};}}),
    operation:async action=>{calls.push(action);return {version:1,packages};}});
  return {room,calls};
}

test('visible old Room Read preserves original receipts when archive composition is disabled',async()=>{
  for(const enabled of [false,true]){
    const id='11111111-1111-4111-8111-111111111111',message={id:'22222222-2222-4222-8222-222222222222',conversationId:id,epoch:'1',owner:'bob',status:'delivered',hash:'a'.repeat(64)},thread={};
    const context=vm.createContext({structuredClone,document:{visibilityState:'visible',hasFocus:()=>true,querySelectorAll:()=>[{dataset:{roomId:id},getClientRects:()=>[{}],querySelector:()=>thread}]},visibleIncomingMessageIds:()=>new Set([message.id])});
    vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/chat/room-session.js'),'utf8'),context);
    const calls=[],writes=[];
    const room=context.WingaRoomSession.createRoomSession({owner:'alice',historyRecoveryEnabled:enabled,runtime:()=>({room:{history:async()=>[message]}}),vault:{snapshot:async()=>({revision:'0'}),write:async p=>writes.push(p)},
      operation:async(action,payload)=>{calls.push({action,payload});return action==='room-poll'?{version:1,rooms:[{id,epoch:'2'}]}:{ok:true};}});
    await room.list();await room.markRead(id,[message.id]);
    assert.equal(calls[1].action,enabled?'room-archive-read':'room-receipt');assert.equal(calls[1].payload.kind,'read');assert.equal(writes[0].values['history:'+message.id].status,'read');
  }
});

test('room review requires two distinct other accounts before any device or directory work',async()=>{
  for(const names of [[],['alice'],['bob'],['alice','bob','bob']]){
    const f=fixture();await assert.rejects(f.room.inspectOwners(names),{code:'encrypted_room_members_required'});
    assert.deepEqual(f.calls,[]);
  }
});
test('room review rejects malformed usernames and account bounds before network work',async()=>{
  for(const names of [null,['bob','eve!'],['bob','a'.repeat(41)],['bob',{}]]){
    const f=fixture();await assert.rejects(f.room.inspectOwners(names),{code:'encrypted_room_usernames_invalid'});assert.deepEqual(f.calls,[]);
  }
  const f=fixture();await assert.rejects(f.room.inspectOwners(Array.from({length:12},(_,n)=>'member'+n)),{code:'encrypted_room_member_limit'});
  assert.deepEqual(f.calls,[]);
});
test('an existing account without a current encrypted device is distinguished from member count',async()=>{
  const f=fixture([{owner:'alice',deviceId:'own',hash:'own-hash'},{owner:'bob'}]);
  await assert.rejects(f.room.inspectOwners(['bob','eve']),{code:'encrypted_room_member_unavailable'});
  assert.deepEqual(f.calls,['package','room-directory']);
});
test('valid review keeps the creator exact native package and ignores duplicate accounts',async()=>{
  const packages=[{owner:'alice',deviceId:'other',hash:'stale'},{owner:'alice',deviceId:'own',hash:'own-hash'},{owner:'bob'},{owner:'eve'}];
  const f=fixture(packages),selected=await f.room.inspectOwners(['bob','eve','bob']);
  assert.deepEqual(Array.from(selected,p=>p.owner),['alice','bob','eve']);assert.equal(selected[0].hash,'own-hash');
});
test('configured member review rejects excess owners before device or network work',async()=>{
  const f=fixture([],{maxOwners:3,maxDevices:3});
  await assert.rejects(f.room.inspectOwners(['bob','eve','dave']),{code:'encrypted_room_member_limit'});assert.deepEqual(f.calls,[]);
  const returned=f.room.limits();returned.maxOwners=12;assert.equal(f.room.limits().maxOwners,3);
});
test('Room capabilities fail closed on invalid configuration and creation checks device bounds',async()=>{
  for(const limits of [null,{maxOwners:2,maxDevices:3},{maxOwners:13,maxDevices:24},{maxOwners:3,maxDevices:2},
    {maxOwners:3,maxDevices:25},{maxOwners:'3',maxDevices:3},{maxOwners:3,maxDevices:3,public:true}])
    assert.throws(()=>fixture([],limits),{code:'encrypted_room_limits_invalid'});
  const f=fixture([],{maxOwners:3,maxDevices:3});
  await assert.rejects(f.room.create('Room',[{owner:'alice'},{owner:'bob'},{owner:'eve'},{owner:'bob'}]),{code:'encrypted_room_device_limit'});
  assert.deepEqual(f.calls,[]);
});
