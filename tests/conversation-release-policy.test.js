const test=require('node:test'),assert=require('node:assert/strict');
const {readConversationReleasePolicy:read,assertCompatibleProtocol:compatible,assertNewConversationAdmission:admit}=require('../backend/conversation-release-policy');
test('default release permits the signed v1 protocol and full enrollment',()=>{
  compatible(read({}));for(const user of ['rey','wizad'])admit(read({}),user);
});
test('invalid controls fail closed and blocked/obsolete signed versions require upgrade',()=>{
  for(const env of [{WINGA_CONVERSATION_MIN_PROTOCOL:'2'},{WINGA_CONVERSATION_BLOCKED_PROTOCOLS:'1'}])
    assert.throws(()=>compatible(read(env)),{status:426,code:'conversation_upgrade_required'});
  for(const env of [{WINGA_CONVERSATION_ROLLOUT_PERCENT:'NaN'},{WINGA_CONVERSATION_BLOCKED_PROTOCOLS:'garbage'},
    {WINGA_CONVERSATION_ROLLOUT_USERS:'bad name'}])assert.throws(()=>compatible(read(env)),{status:503,code:'conversation_release_policy_invalid'});
});
test('new enrollment is deterministic with explicit internal users and no automatic downgrade',()=>{
  const policy=read({WINGA_CONVERSATION_ROLLOUT_PERCENT:'0',WINGA_CONVERSATION_ROLLOUT_USERS:'rey'});
  admit(policy,'rey');assert.throws(()=>admit(policy,'wizad'),{code:'encrypted_rollout_not_admitted'});
  const cohort=read({WINGA_CONVERSATION_ROLLOUT_PERCENT:'35'});
  const included=user=>{try{admit(cohort,user);return true;}catch{return false;}};
  const a=Array.from({length:1000},(_,i)=>included('user'+i));
  assert.deepEqual(a,Array.from({length:1000},(_,i)=>included('user'+i)));
  assert.ok(a.filter(Boolean).length>250&&a.filter(Boolean).length<450);
  compatible(policy); // Cohort closure does not disable already secure streams.
});
test('protocol kill switch blocks reserved and attached media authorization and completion before I/O',async()=>{
  let calls=0;
  const store=require('../backend/encrypted-conversations').createEncryptedConversationStore({
    withTransaction:async()=>{calls++;throw Error('unexpected database I/O');},mediaEnabled:true});
  for(const key of ['WINGA_CONVERSATION_MIN_PROTOCOL','WINGA_CONVERSATION_BLOCKED_PROTOCOLS']){
    const prior=process.env[key];process.env[key]=key.endsWith('MIN_PROTOCOL')?'2':'1';
    try {
      for(const state of ['reserved','attached'])for(const action of ['upload','download']){
        assert.throws(()=>store.authorizeEncryptedMedia({}, {state}, action),{status:426,code:'conversation_upgrade_required'});
      }
      assert.throws(()=>store.completeEncryptedMediaUpload({},{}),{status:426,code:'conversation_upgrade_required'});
    }finally{if(prior===undefined)delete process.env[key];else process.env[key]=prior;}
  }
  assert.equal(calls,0);
});
