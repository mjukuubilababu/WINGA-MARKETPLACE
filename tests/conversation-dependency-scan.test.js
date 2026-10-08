const {test}=require('node:test'),assert=require('node:assert/strict');
const {assess}=require('../scripts/check-conversation-dependencies');
const counts={info:0,low:0,moderate:0,high:0,critical:0,total:0};
const scan=(vulnerabilities,status=0)=>({status,stdout:JSON.stringify({metadata:{vulnerabilities}})});

test('dependency scans fail closed on transport errors, invalid reports and missing counts',()=>{
  for(const result of [{status:1,stdout:'invalid'},{status:null,stdout:'',error:Error('private failure')},
    {status:0,stdout:'{}'},{status:0,stdout:JSON.stringify({error:{summary:'private registry failure'}})},
    scan({...counts,high:-1}),scan({...counts,critical:'0'}),scan({...counts,high:1}),scan(counts,1),scan(counts,2)]) {
    assert.deepEqual(assess(result),{ok:false,errorCode:'DEPENDENCY_SCAN_UNAVAILABLE'});
  }
});
test('high and critical dependency findings block the gate; lesser findings remain visible',()=>{
  assert.deepEqual(assess(scan(counts)),{ok:true,vulnerabilities:counts});
  for(const key of ['high','critical'])assert.equal(assess(scan({...counts,[key]:1,total:1},1)).ok,false);
  assert.deepEqual(assess(scan({...counts,moderate:1,total:1},1)),{ok:true,vulnerabilities:{...counts,moderate:1,total:1}});
});
