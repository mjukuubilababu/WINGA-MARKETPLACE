const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSecureContent}=require('../src/chat/secure-content');
const rich=require('../src/chat/rich-content');

const binding={conversationId:'fuzz-thread',attachmentId:'fuzz-file'};
const recovery={owner:'synthetic-owner',id:'fuzz-archive',generation:1};

test('bounded deterministic attachment corpus rejects every single-byte mutation and truncation',async()=>{
  const codec=await createSecureContent();
  const sealed=await codec.encryptMedia(new Blob(['synthetic private test content']),binding,{name:'private.txt',mime:'text/plain'});
  const bytes=new Uint8Array(await sealed.ciphertext.arrayBuffer());
  for(let offset=0;offset<bytes.length;offset++) {
    const changed=bytes.slice();changed[offset]^=1<<(offset%8);
    await assert.rejects(codec.decryptMedia(new Blob([changed]),sealed.descriptor,binding));
    await assert.rejects(codec.decryptMedia(new Blob([bytes.subarray(0,offset)]),sealed.descriptor,binding));
  }
  assert.equal(await (await codec.decryptMedia(sealed.ciphertext,sealed.descriptor,binding)).blob.text(),'synthetic private test content');
});

test('malformed descriptor and account binding corpus never returns attachment plaintext',async()=>{
  const codec=await createSecureContent(),sealed=await codec.encryptMedia(new Blob(['synthetic']),binding);
  const malformed=[null,[],{},true,0,'descriptor'];
  for(const key of Object.keys(sealed.descriptor)) {
    const missing={...sealed.descriptor};delete missing[key];malformed.push(missing);
    for(const value of [null,[],{},true,0,'',-1,Number.MAX_SAFE_INTEGER])malformed.push({...sealed.descriptor,[key]:value});
  }
  malformed.push({...sealed.descriptor,extra:true},{...sealed.descriptor,key:sealed.descriptor.key+'='});
  for(const descriptor of malformed)await assert.rejects(codec.decryptMedia(sealed.ciphertext,descriptor,binding));
  for(const value of ['other-thread','../private','https://example.invalid/file']) {
    await assert.rejects(codec.decryptMedia(sealed.ciphertext,sealed.descriptor,{...binding,conversationId:value}));
  }
});

test('recovery fuzz corpus rejects byte tampering and schema drift without exposing history',async()=>{
  const codec=await createSecureContent(),key=codec.generateRecoveryKey(),source=new TextEncoder().encode('synthetic private history');
  const capsule=await codec.sealRecovery(source,key,recovery),bytes=Buffer.from(capsule.ciphertext,'base64url');
  for(let offset=0;offset<bytes.length;offset++) {
    const changed=Buffer.from(bytes);changed[offset]^=1<<(offset%8);
    await assert.rejects(codec.openRecovery({...capsule,ciphertext:changed.toString('base64url')},key,recovery));
  }
  for(const field of Object.keys(capsule)) {
    const missing={...capsule};delete missing[field];await assert.rejects(codec.openRecovery(missing,key,recovery));
    for(const value of [null,{},[],true,-1,''])await assert.rejects(codec.openRecovery({...capsule,[field]:value},key,recovery));
  }
  assert.deepEqual(await codec.openRecovery(capsule,key,recovery),source);
});

test('rich payload mutation corpus cannot introduce financial authority or unknown protocol versions',()=>{
  for(const type of ['text','product','order','payment','delivery']) {
    const content=rich.create(type,type==='text'?'synthetic':'',type==='product'?{ids:['product-1']}:type==='text'?{}:{id:'canonical-reference'});
    const encoded=rich.encode(content);assert.deepEqual(rich.parse(encoded),content);
    for(const version of [null,0,2,-1,'1',{},[]])assert.equal(rich.parse(rich.PREFIX+JSON.stringify({...content,version})),null);
    for(const field of ['amount','paid','approved','deliveryComplete','balance']) {
      assert.throws(()=>rich.encode({...content,data:{...content.data,[field]:10000}}),/rich_content_invalid/);
    }
    for(let cut=rich.PREFIX.length;cut<encoded.length;cut++)assert.equal(rich.parse(encoded.slice(0,cut)),null);
  }
  for(let n=0;n<128;n++)assert.equal(rich.parse(rich.PREFIX+String.fromCharCode(n)+'{malformed'),null);
});
