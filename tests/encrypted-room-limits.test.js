const test=require('node:test'),assert=require('node:assert/strict');
const {readRoomLimits,roomLimits}=require('../backend/encrypted-room-limits');
const {createEncryptedConversationsApi}=require('../backend/encrypted-conversations-api');
test('Room configuration defaults to the existing small-group protocol ceiling',()=>{
  assert.deepEqual(readRoomLimits({}),{maxOwners:12,maxDevices:24});
  assert.deepEqual(readRoomLimits({WINGA_ENCRYPTED_ROOM_MAX_OWNERS:'3',WINGA_ENCRYPTED_ROOM_MAX_DEVICES:'3'}),{maxOwners:3,maxDevices:3});
  assert.equal(Object.isFrozen(roomLimits()),true);
});
test('unsafe, malformed, fractional and contradictory configuration never silently widens a Room',()=>{
  for(const value of ['', '0','2','13',' 3','3 ','3.0','3.5','NaN','3e0','03',3])
    assert.throws(()=>readRoomLimits({WINGA_ENCRYPTED_ROOM_MAX_OWNERS:value}),TypeError);
  for(const value of ['2','25','NaN','',24])assert.throws(()=>readRoomLimits({WINGA_ENCRYPTED_ROOM_MAX_DEVICES:value}),TypeError);
  assert.throws(()=>readRoomLimits({WINGA_ENCRYPTED_ROOM_MAX_OWNERS:'8',WINGA_ENCRYPTED_ROOM_MAX_DEVICES:'7'}),TypeError);
});
test('authenticated capabilities publish only configured bounds while the Rooms gate remains explicit',async()=>{
  for(const roomsEnabled of [false,true]){let reply,authenticated=false;
    const api=createEncryptedConversationsApi({enabled:true,roomsEnabled,roomLimits:{maxOwners:5,maxDevices:7},
      readAuthToken:()=>'',findSession:()=>({}),ensureMarketplaceUser:()=>authenticated?{username:'alice'}:null,
      sendJson:(res,status,body,headers)=>{reply={status,body,headers};}});
    const url=new URL('https://localhost/api/conversations/encrypted/capabilities');
    await api.handle({method:'GET'},{},url);assert.equal(reply,undefined);
    authenticated=true;await api.handle({method:'GET'},{},url);assert.equal(reply.status,200);assert.equal(reply.headers['Cache-Control'],'private, no-store');
    if(roomsEnabled)assert.deepEqual(reply.body.roomLimits,{maxOwners:5,maxDevices:7});else assert.equal(reply.body.roomLimits,undefined);
    assert.equal(JSON.stringify(reply.body).includes('public'),false);
  }
});
