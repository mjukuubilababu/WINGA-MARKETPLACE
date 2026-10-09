const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const start=source.indexOf('async function handleShareProduct(');
const end=source.indexOf('\nfunction getGrowthRuntime()',start);
assert.ok(start>=0&&end>start);
function fixture(navigator={}) {
  let commits=0,alerts=0;
  const context={navigator,window:{location:{origin:'https://winga.test'},open:()=>({})},
    formatProductPrice:()=> '10',getProductDetailPath:()=> '/product/p1',
    document:{body:{classList:{contains:()=>true}}},
    getGrowthRuntime:()=>({prepareShare:()=>({url:'https://winga.test/product/p1?share=opaque',commit:()=>commits++})}),
    showInAppNotification:()=>{},translateUi:(_key,_args,fallback)=>fallback,alert:()=>alerts++};
  vm.runInNewContext(source.slice(start,end)+'\nglobalThis.share=handleShareProduct;',context);
  return {share:channel=>context.share({id:'p1',name:'Product',price:10,shop:'Shop'},{channel}),
    counts:()=>({commits,alerts})};
}
test('successful native handoff and copy record creation exactly once',async()=>{
  for(const navigator of [{share:async()=>{}},{clipboard:{writeText:async()=>{}}}]) {
    const f=fixture(navigator);await f.share();assert.equal(f.counts().commits,1);
  }
});
test('canceled native share and denied clipboard fallback are not successful shares',async()=>{
  const canceled=fixture({share:async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'});}});
  await canceled.share();assert.deepEqual(canceled.counts(),{commits:0,alerts:0});
  const denied=fixture({share:async()=>{throw Error('unsupported');},clipboard:{writeText:async()=>{throw Error('denied');}}});
  await denied.share();assert.deepEqual(denied.counts(),{commits:0,alerts:1});
  const plain=fixture();await plain.share();assert.deepEqual(plain.counts(),{commits:0,alerts:1});
});
test('explicit WhatsApp handoff records an intent, not a recipient delivery',async()=>{
  const f=fixture();await f.share('whatsapp');assert.deepEqual(f.counts(),{commits:1,alerts:0});
});
