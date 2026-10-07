const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {operationScopes,withTransportLocks}=require('../backend/encrypted-transport-locks');
test('opposite direct initiators share one canonical pair resource',()=>{
  const a=operationScopes({owner:'alice'},{action:'reserve',payload:{conversationId:randomUUID(),peer:'bob'}});
  const b=operationScopes({owner:'bob'},{action:'reserve',payload:{conversationId:randomUUID(),peer:'alice'}});
  assert.equal(a.find(k=>k.startsWith('pair:')),b.find(k=>k.startsWith('pair:')));
});
test('Room scope comes from the reserved intent and multi-group seller scopes are sorted',()=>{
  const room=randomUUID(),direct=randomUUID(),id=randomUUID();
  assert.deepEqual(operationScopes({owner:'a'},{action:'room-reserve',payload:{intent:JSON.stringify({conversationId:room})}}),['group:'+room]);
  const scopes=operationScopes({owner:'a'},{action:'seller-question-reserve',payload:{conversationId:room,directId:direct,id}});
  assert.deepEqual(scopes,[...scopes].sort());assert.ok(scopes.includes('group:'+room)&&scopes.includes('group:'+direct));
  assert.throws(()=>operationScopes({}, {action:'room-reserve',payload:{intent:'invalid'}}),{code:'encrypted_operation_invalid'});
});
test('shared legacy gate precedes sorted unique group locks and work, without disabling expiry checks',async()=>{
  const seen=[];const c={async query(sql,args){seen.push([sql,args]);}};
  const result=await withTransportLocks(c,['group:b','group:a','group:b'],async()=>{seen.push(['work']);return 7;});
  assert.equal(result,7);assert.match(seen[0][0],/lock_timeout='3s'/);assert.match(seen[1][0],/pg_advisory_xact_lock_shared/);
  assert.deepEqual(seen.slice(2,4).map(v=>v[1]),[['group:a'],['group:b']]);assert.equal(seen.at(-1)[0],'work');
});
test('lock timeout has a stable retryable error and does not run protected work',async()=>{
  for(const code of ['55P03','40P01']){
    let called=false;await assert.rejects(withTransportLocks({async query(){throw {code};}},[],async()=>{called=true;}),{status:503,code:'encrypted_operation_busy'});
    assert.equal(called,false);
  }
});
