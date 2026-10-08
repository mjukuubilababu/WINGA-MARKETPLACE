const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { PGlite } = require('@electric-sql/pglite');
const { buildMlsBrowser } = require('../../scripts/build-mls-browser');
const { createConversationCryptoDeviceStore } = require('../../backend/conversation-crypto-devices');
const { createCryptoKeyPackageStore } = require('../../backend/conversation-crypto-key-packages');
const { operationBytes } = require('../../backend/encrypted-conversations');
const { verifyDeviceSignature } = require('../../backend/conversation-crypto-auth');
let server, origin, output, db, devices, packages;

test.beforeAll(async () => {
  output = fs.mkdtempSync(path.join(os.tmpdir(), 'winga-mls-candidate-')); buildMlsBrowser(output);
  server = http.createServer((request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; object-src 'none'");
    const assets = {
      '/devices.js': path.resolve(__dirname, '../../src/chat/crypto-devices.js'),
      '/vault.js': path.resolve(__dirname, '../../src/chat/encrypted-vault.js'),
      '/api.js': path.resolve(__dirname, '../../src/api/communications-client.js'),
      '/policy.js': path.resolve(__dirname, '../../src/chat/encrypted-policy.js'),
      '/mls.js': path.join(output, 'winga-mls-candidate.js'),
      '/room-content.mjs': path.resolve(__dirname, '../../src/chat/shopping-room-content.mjs'),
    };
    if (assets[request.url]) { response.setHeader('Content-Type', 'text/javascript'); response.end(fs.readFileSync(assets[request.url])); }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>MLS candidate integration</title><script src="/devices.js"></script><script src="/vault.js"></script><script src="/policy.js"></script><script src="/mls.js"></script><script src="/api.js"></script>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(output, { recursive: true, force: true });
});
test.beforeEach(async () => {
  db = new PGlite(); await db.exec(require('../helpers/conversation-event-fixture'));
  for (const name of ['conversation-crypto-devices', 'conversation-crypto-session-bindings', 'conversation-event-ledger', 'conversation-crypto-key-packages']) {
    await db.transaction(async tx => { for (const sql of require(`../../backend/migrations/${name}`).statements) await tx.exec(sql); });
  }
  devices = createConversationCryptoDeviceStore({ withTransaction: work => db.transaction(work) });
  packages = createCryptoKeyPackageStore({ withTransaction: work => db.transaction(work) });
});
test.afterEach(async () => db.close());

async function boot(page, username, { sessionId = username === 'alice' ? 'a' : 'b1', multiDevice = false, rooms = false } = {}) {
  return page.evaluate(async ({ username, sessionId, multiDevice, rooms }) => {
    window.session = { username, sessionId, token: sessionId };
    window.pins = []; window.failTransport = false;
    window.client = WingaModules.api.communications.createCommunicationsApiClient({ baseUrl: '/api',
      getSession: () => session, createAuthHeaders: () => ({}), fetchJson: window.cryptoGateway });
    window.runtime = await client.createEncryptedCandidate({ trustedPins: () => pins, multiDevice, rooms,
      ...(rooms ? {roomAuthorization:{
        verifyIntent:value=>window.roomGateway('verify',value),
        confirm:(value,proofs)=>window.roomGateway('confirm',{...value,commit:Array.from(value.commit),welcome:Array.from(value.welcome),tree:Array.from(value.tree),
          proofs:proofs.map(p=>({...p,signature:Array.from(p.signature)}))}),
        check:(id,epoch,revision)=>window.roomGateway('check',{id,epoch,revision}),
      }} : {}),
      transport: { async send(packet) {
        await window.capturePacket({ ...packet, ciphertext: Array.from(packet.ciphertext) });
        if (window.failTransport) throw new TypeError('lost_reply');
        if (rooms) return window.roomGateway('send',{...packet,ciphertext:Array.from(packet.ciphertext)});
        return { id: packet.id, hash: packet.hash, status: 'sent' };
      } } });
    const identity = await runtime.initialize();
    return { ...identity, keyPackage: Array.from(identity.keyPackage), signaturePublicKey: Array.from(identity.signaturePublicKey) };
  }, { username, sessionId, multiDevice, rooms });
}
async function prepare(page, username, captured, options = {}) {
  const sessionId = options.sessionId || (username === 'alice' ? 'a' : 'b1');
  const context = { owner: username, deviceId: sessionId, token: sessionId };
  await page.exposeFunction('cryptoGateway', async (url, options) => {
    const payload = options.body ? JSON.parse(options.body) : undefined;
    if (url.endsWith('/crypto/devices')) return options.method === 'POST'
      ? devices.mutateConversationCryptoDevice(context, payload) : devices.readConversationCryptoDevices(context);
    if (url.endsWith('/crypto/key-packages')) return packages.publishCryptoKeyPackage(context, payload);
    throw new Error('legacy_transport_must_not_be_used');
  });
  await page.exposeFunction('capturePacket', packet => { captured.push(packet); });
  await page.goto(origin); return boot(page, username, options);
}
const pin = (page, value) => page.evaluate(value => { pins.push({ ...value,
  signaturePublicKey: new Uint8Array(value.signaturePublicKey), status: 'active' }); }, value);

test('candidate Shopping Room uses three actual native browser identities, encrypted IndexedDB, durable replay and unchanged CSP',async({browser})=>{
  const crypto=require('node:crypto'),keys=crypto.generateKeyPairSync('ed25519'),reservations=new Map(),active=new Map(),stored=new Map();let sequence=0;
  const contexts=await Promise.all([browser.newContext({viewport:{width:390,height:844}}),browser.newContext(),browser.newContext()]);
  const captured=[[],[],[]],violations=[],owners=['alice','bob','eve'],sessions=['a','b1','e'];
  const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  const signedIntent=value=>reservations.set(value.id,crypto.sign(null,Buffer.from(JSON.stringify(value)),keys.privateKey));
  // Native device enrollment/key-package signatures use the existing real service.
  // Only room canonical authorization/durable storage is synthetic until its backend is implemented.
  const gateway=async(action,value)=>{
    if(action==='verify')return !!reservations.get(value.id)&&crypto.verify(null,Buffer.from(JSON.stringify(value)),keys.publicKey,reservations.get(value.id));
    if(action==='confirm') {
      const intent=JSON.parse(value.intent),transferHash=hash(Buffer.from(JSON.stringify(['winga-mls-room-transfer',1,value.intent,value.epoch,
        hash(Buffer.from(value.commit)),hash(Buffer.from(value.welcome)),hash(Buffer.from(value.tree))])));
      active.set(value.conversationId,{active:true,conversationId:value.conversationId,epoch:value.epoch,revision:intent.revision});
      return {status:'active',conversationId:value.conversationId,epoch:value.epoch,transferHash};
    }
    if(action==='check')return active.get(value.id)||{active:false,conversationId:value.id,epoch:'0',revision:'0'};
    if(action==='send') {
      const prior=stored.get(value.id);if(prior){expect(prior.hash).toBe(value.hash);return prior;}
      const receipt={id:value.id,hash:value.hash,status:'sent',sequence:String(++sequence),createdAt:new Date().toISOString()};stored.set(value.id,receipt);return receipt;
    }
    throw new Error('unexpected_room_fixture_operation');
  };
  try {
    const pages=await Promise.all(contexts.map(c=>c.newPage())),identities=[];
    for(let i=0;i<pages.length;i++){
      pages[i].on('console',entry=>{if(entry.text().includes('Content Security Policy'))violations.push(entry.text());});
      await pages[i].exposeFunction('roomGateway',gateway);
      identities.push(await prepare(pages[i],owners[i],captured[i],{sessionId:sessions[i],rooms:true}));
    }
    for(let i=0;i<pages.length;i++)for(let j=0;j<identities.length;j++)if(i!==j)await pin(pages[i],identities[j]);
    await pages[0].evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const open=indexedDB.open('winga-encrypted-policy-v1',1);
        open.onupgradeneeded=()=>open.result.createObjectStore('modes',{keyPath:['owner','peer']});
        open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
      try{await new Promise((resolve,reject)=>{const tx=db.transaction('modes','readwrite');
        tx.objectStore('modes').add({owner:'alice',peer:'existing-peer',mode:'encrypted'});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}
    });
    const id=crypto.randomUUID(),roster=identities.map(d=>({owner:d.owner,id:d.id,fingerprint:d.fingerprint,key:d.signaturePublicKey}))
      .sort((a,b)=>a.owner+'/'+a.id<b.owner+'/'+b.id?-1:1);
    const intent={version:1,kind:'shopping-room',id:crypto.randomUUID(),conversationId:id,previousEpoch:'0',revision:'1',actorOwner:'alice',actorDeviceId:identities[0].id,
      roster:JSON.stringify(roster),roles:JSON.stringify(owners.map(owner=>({owner,role:owner==='alice'?'admin':'member'}))),
      changes:JSON.stringify(identities.slice(1).map(d=>({type:'add',owner:d.owner,id:d.id,packageHash:d.hash})).sort((a,b)=>a.id<b.id?-1:1))};
    signedIntent(intent);
    const initial=await pages[0].evaluate(async({intent,identities})=>{
      const t=await runtime.room.create(intent,new Map(identities.slice(1).map(d=>[d.id,new Uint8Array(d.keyPackage)])));
      return {...t,commit:Array.from(t.commit),welcome:Array.from(t.welcome),tree:Array.from(t.tree)};
    },{intent,identities});
    for(const page of pages.slice(1))await page.evaluate(t=>runtime.room.acceptWelcome({...t,commit:new Uint8Array(t.commit),welcome:new Uint8Array(t.welcome),tree:new Uint8Array(t.tree)}),initial);
    const proofs=[];for(const page of pages)proofs.push(await page.evaluate(async id=>{const p=await runtime.room.acceptance(id);return {...p,signature:Array.from(p.signature)};},id));
    for(const page of pages)await page.evaluate(({id,proofs})=>runtime.room.confirm(id,proofs.map(p=>({...p,signature:new Uint8Array(p.signature)}))),{id,proofs});
    const bodies=['room product secret','room poll secret','room vote secret'];
    for(let i=0;i<pages.length;i++){
      const sender=pages[i];await sender.evaluate(({id,message})=>runtime.room.send({conversationId:id,clientMessageId:crypto.randomUUID(),message}),{id,message:bodies[i]});
      const packet=captured[i].at(-1),receipt=stored.get(packet.id),wire={...packet,sequence:receipt.sequence,created_at:receipt.createdAt};
      for(let j=0;j<pages.length;j++)if(i!==j)await pages[j].evaluate(p=>runtime.room.receive({...p,ciphertext:new Uint8Array(p.ciphertext)}),wire);
    }
    const before=[];
    for(let i=0;i<pages.length;i++){
      before.push(await pages[i].evaluate(async id=>(await runtime.room.history(id)).map(v=>[v.id,v.owner,v.message,v.sequence]),id));
      expect(await pages[i].evaluate(async({id,peer})=>({room:await WingaEncryptedPolicy.isRoomEncrypted(session.username,id),pair:await WingaEncryptedPolicy.isEncrypted(session.username,peer)}),
        {id,peer:owners[(i+1)%3]})).toEqual({room:true,pair:false});
      expect(await pages[i].evaluate(async()=>{
        const db=await new Promise((resolve,reject)=>{const open=indexedDB.open('winga-encrypted-vault-v1:'+session.username);open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
        try{const tx=db.transaction(['records','journal']),read=store=>new Promise((resolve,reject)=>{const req=tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
          const rows=(await Promise.all([read('records'),read('journal')])).flat();return {sealed:rows.every(v=>v.v===1&&v.ciphertext instanceof Uint8Array&&!JSON.stringify(v).includes('room product secret')),
            transition:rows.some(v=>v.kind==='mls:room-transition:'),localStorageEmpty:localStorage.length===0};}finally{db.close();}
      })).toEqual({sealed:true,transition:true,localStorageEmpty:true});
      expect(await pages[i].evaluate(()=>runtime.history())).toEqual([]);
    }
    expect(before[0]).toEqual(before[1]);expect(before[1]).toEqual(before[2]);expect(before[0]).toHaveLength(3);
    expect(await pages[0].evaluate(()=>WingaEncryptedPolicy.isEncrypted('alice','existing-peer'))).toBe(true);
    for(let i=0;i<pages.length;i++){
      await pages[i].evaluate(()=>runtime.close());await pages[i].reload();await boot(pages[i],owners[i],{sessionId:sessions[i],rooms:true});
      for(let j=0;j<identities.length;j++)if(i!==j)await pin(pages[i],identities[j]);
      expect(await pages[i].evaluate(async id=>(await runtime.room.history(id)).map(v=>[v.id,v.owner,v.message,v.sequence]),id)).toEqual(before[i]);
    }
    await pages[0].evaluate(id=>runtime.room.send({conversationId:id,clientMessageId:crypto.randomUUID(),message:'after profile reload'}),id);
    const packet=captured[0].at(-1),receipt=stored.get(packet.id);
    for(const page of pages.slice(1))expect((await page.evaluate(p=>runtime.room.receive({...p,ciphertext:new Uint8Array(p.ciphertext)}),
      {...packet,sequence:receipt.sequence,created_at:receipt.createdAt})).message).toBe('after profile reload');
    const remaining=roster.filter(m=>m.owner!=='eve'),removeIntent={...intent,id:crypto.randomUUID(),previousEpoch:'1',revision:'2',roster:JSON.stringify(remaining),
      roles:JSON.stringify(owners.slice(0,2).map(owner=>({owner,role:owner==='alice'?'admin':'member'}))),
      changes:JSON.stringify([{type:'remove',owner:'eve',id:identities[2].id}])};signedIntent(removeIntent);
    const removed=await pages[0].evaluate(async v=>{const t=await runtime.room.change(v);return {...t,commit:Array.from(t.commit),welcome:Array.from(t.welcome),tree:Array.from(t.tree)};},removeIntent);
    await pages[1].evaluate(t=>runtime.room.applyCommit({...t,commit:new Uint8Array(t.commit),welcome:new Uint8Array(t.welcome),tree:new Uint8Array(t.tree)}),removed);
    const accepted=[];for(const page of pages.slice(0,2))accepted.push(await page.evaluate(async id=>{const p=await runtime.room.acceptance(id);return {...p,signature:Array.from(p.signature)};},id));
    for(const page of pages.slice(0,2))await page.evaluate(({id,proofs})=>runtime.room.confirm(id,proofs.map(p=>({...p,signature:new Uint8Array(p.signature)}))),{id,proofs:accepted});
    await pages[0].evaluate(id=>runtime.room.send({conversationId:id,clientMessageId:crypto.randomUUID(),message:'retained room secret'}),id);
    const future=captured[0].at(-1),futureReceipt=stored.get(future.id),futureWire={...future,sequence:futureReceipt.sequence,created_at:futureReceipt.createdAt};
    expect((await pages[1].evaluate(p=>runtime.room.receive({...p,ciphertext:new Uint8Array(p.ciphertext)}),futureWire)).message).toBe('retained room secret');
    await expect(pages[2].evaluate(p=>runtime.room.receive({...p,ciphertext:new Uint8Array(p.ciphertext)}),futureWire)).rejects.toThrow('mls_room_access_denied');
    expect(violations).toEqual([]);expect(stored.size).toBe(5);
  }finally{for(const context of contexts)await context.close();}
});

test('candidate native-approved third browser device converges future history with encrypted IndexedDB and strict CSP', async ({ browser }) => {
  await db.query("INSERT INTO sessions VALUES ('a2','alice','a2',9999999999999)");
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const violations = [], captured = [[], [], []];
  try {
    const pages = await Promise.all(contexts.map(context => context.newPage())), [alice, bob, sibling] = pages;
    for (const page of pages) page.on('console', entry => { if (entry.text().includes('Content Security Policy')) violations.push(entry.text()); });
    const a = await prepare(alice, 'alice', captured[0], { multiDevice: true });
    const b = await prepare(bob, 'bob', captured[1], { multiDevice: true });
    // A second login is insufficient: admission starts only after an existing
    // native device explicitly signs approval of the pending fingerprint.
    await expect(prepare(sibling, 'alice', captured[2], { sessionId: 'a2', multiDevice: true })).rejects.toThrow('mls_device_not_active');
    const pending = (await db.query("SELECT id,fingerprint,status FROM conversation_crypto_devices WHERE owner_id='alice' AND id<>$1", [a.id])).rows[0];
    expect(pending.status).toBe('pending');
    await alice.evaluate(async pending => {
      const identity = await WingaCryptoDevices.createCryptoDeviceClient({ getSession: () => session, request: client.cryptoDeviceRequest });
      try { await identity.manage('approve', pending.id, pending.fingerprint); } finally { identity.close(); }
    }, pending);
    const c = await boot(sibling, 'alice', { sessionId: 'a2', multiDevice: true });
    expect(c.id).toBe(pending.id);
    for (const [page, identity] of [[alice,b],[alice,c],[bob,a],[bob,c],[sibling,a],[sibling,b]]) await pin(page, identity);
    const initial = await alice.evaluate(async b => {
      const id = await runtime.createConversation('bob'), transfer = await runtime.addPeer(id, new Uint8Array(b.keyPackage));
      return { ...transfer, commit: Array.from(transfer.commit), welcome: Array.from(transfer.welcome), tree: Array.from(transfer.tree) };
    }, b);
    await bob.evaluate(transfer => runtime.acceptWelcome('alice', { ...transfer,
      commit: new Uint8Array(transfer.commit), welcome: new Uint8Array(transfer.welcome), tree: new Uint8Array(transfer.tree) }), initial);
    await alice.evaluate(transfer => runtime.confirmMembership(transfer.conversationId, transfer.id), initial);
    await alice.evaluate(() => runtime.sendMessage({ clientMessageId: crypto.randomUUID(), receiverId: 'bob', message: 'not automatically historical' }));
    await bob.evaluate(packet => runtime.receive('alice', { ...packet, ciphertext: new Uint8Array(packet.ciphertext) }), captured[0][0]);
    const proof = await alice.evaluate(async ({ id, c }) => {
      const result = await runtime.addDevice(id, '1', new Uint8Array(c.keyPackage), { owner: 'alice', id: c.id });
      const identity = await WingaCryptoDevices.createCryptoDeviceClient({ getSession: () => session, request: client.cryptoDeviceRequest });
      try { return await identity.signCryptoOperation('device-transfer', WingaMlsCandidate.encodeDeviceAdmissionPayload(result), result.id); }
      finally { identity.close(); }
    }, { id: initial.conversationId, c });
    const signer = (await db.query('SELECT public_key FROM conversation_crypto_devices WHERE id=$1', [a.id])).rows[0];
    expect(proof.actorId).toBe(a.id);
    expect(verifyDeviceSignature(signer.public_key, operationBytes({ owner: 'alice', deviceId: 'a' }, proof), proof.signature)).toBe(true);
    const transfer = proof.payload;
    const intent = Object.fromEntries(['id','previousEpoch','actorOwner','actorDeviceId','addedOwner','addedDeviceId','packageHash'].map(key => [key,transfer[key]]));
    await bob.evaluate(({ transfer, intent }) => runtime.applyDeviceCommit('alice', WingaMlsCandidate.decodeDeviceAdmissionPayload(transfer), intent), { transfer, intent });
    await sibling.evaluate(({ transfer, intent }) => runtime.acceptDeviceWelcome('bob', WingaMlsCandidate.decodeDeviceAdmissionPayload(transfer), intent), { transfer, intent });
    await alice.evaluate(transfer => runtime.confirmMembership(transfer.conversationId, transfer.id), transfer);
    for (const [index, body] of [[0,'first endpoint secret'],[2,'sibling endpoint secret'],[1,'recipient endpoint secret']]) {
      await pages[index].evaluate(({ peer, body }) => runtime.sendMessage({ clientMessageId: crypto.randomUUID(), receiverId: peer, message: body }),
        { peer: index === 1 ? 'alice' : 'bob', body });
      const packet = captured[index].at(-1);
      for (let recipient = 0; recipient < pages.length; recipient++) if (recipient !== index)
        await pages[recipient].evaluate(({ packet, peer }) => runtime.receive(peer, { ...packet, ciphertext: new Uint8Array(packet.ciphertext) }),
          { packet, peer: recipient === 1 ? 'alice' : 'bob' });
    }
    const future = [];
    for (let index = 0; index < pages.length; index++) {
      await pages[index].reload();
      await boot(pages[index], index === 1 ? 'bob' : 'alice', { sessionId: index === 1 ? 'b1' : index === 2 ? 'a2' : 'a', multiDevice: true });
      for (const identity of [a,b,c]) if (identity.id !== [a,b,c][index].id) await pin(pages[index], identity);
      future.push(await pages[index].evaluate(async () => (await runtime.history()).filter(row => row.epoch === '2').map(row => [row.id,row.owner,row.peer,row.message]).sort()));
      const sealed = await pages[index].evaluate(async () => {
        const db = await new Promise((resolve, reject) => { const open = indexedDB.open('winga-encrypted-vault-v1:' + session.username);
          open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
        try {
          const tx = db.transaction(['records','journal']), read = name => new Promise((resolve, reject) => {
            const request = tx.objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
          });
          const rows = (await Promise.all([read('records'),read('journal')])).flat();
          return { sealed: rows.length > 0 && rows.every(row => row.v === 1 && row.ciphertext instanceof Uint8Array
            && !JSON.stringify(row).includes('endpoint secret')), localStorageEmpty: localStorage.length === 0,
            transitionJournal: rows.some(row => row.kind === 'mls:device-transition:') };
        } finally { db.close(); }
      });
      expect(sealed.sealed).toBe(true); expect(sealed.localStorageEmpty).toBe(true);
      if (index === 1) expect(sealed.transitionJournal).toBe(true);
    }
    expect(future[0]).toEqual(future[1]); expect(future[1]).toEqual(future[2]); expect(future[2]).toHaveLength(3);
    expect(await sibling.evaluate(async () => (await runtime.history()).some(row => row.epoch === '1'))).toBe(false);
    expect(violations).toEqual([]);
  } finally { for (const context of contexts) await context.close(); }
});

test('browser MLS replacement rotates keys under strict CSP without transferring old epoch history', async ({ page }) => {
  const violations = []; page.on('console', entry => { if (entry.text().includes('Content Security Policy')) violations.push(entry.text()); });
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const records = [];
    async function participant(owner) {
      const session = { username: owner, sessionId: crypto.randomUUID(), token: crypto.randomUUID() };
      const native = { owner, id: crypto.randomUUID(), fingerprint: 'a'.repeat(64), status: 'active' };
      let revision = 0, values = {}; const pins = [], packets = [];
      const vault = { async snapshot() { return { revision: String(revision), values: structuredClone(values) }; },
        async write(change) {
          if (change.expectedRevision !== String(revision)) throw new Error('vault_conflict');
          for (const key of change.deleted || []) delete values[key];
          Object.assign(values, structuredClone(change.values)); return String(++revision);
        } };
      const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
      const runtime = await WingaMlsCandidate.createMlsRuntime({ getSession: () => session, vault, trustedPins: () => pins,
        policy: { async markEncrypted() {} }, identityClient: { async enroll() { return native; },
          async attestKeyPackage(bytes) { return { hash: await digest(bytes), deviceId: native.id }; } },
        async publishPackage(payload) { return { version: 1, package: payload }; },
        transport: { async send(packet) { packets.push(packet); return { id: packet.id, hash: packet.hash, status: 'sent' }; } },
      });
      const device = await runtime.initialize(); const participant = { runtime, device, pins, packets }; records.push(participant); return participant;
    }
    try {
      const alice = await participant('alice'), old = await participant('bob'), next = await participant('bob');
      alice.pins.push({ ...old.device, status: 'active' }, { ...next.device, status: 'active' });
      old.pins.push({ ...alice.device, status: 'active' }); next.pins.push({ ...alice.device, status: 'active' });
      const id = await alice.runtime.createConversation('bob'), initial = await alice.runtime.addPeer(id, old.device.keyPackage);
      await old.runtime.acceptWelcome('alice', initial); await alice.runtime.confirmMembership(id, initial.id);
      await alice.runtime.sendMessage({ clientMessageId: crypto.randomUUID(), receiverId: 'bob', message: 'old epoch' });
      await old.runtime.receive('alice', alice.packets[0]); alice.pins[0].status = 'revoked';
      const transfer = await alice.runtime.replacePeer(id, old.device.id, '1', next.device.keyPackage);
      let pendingBlocked = false;
      try { await alice.runtime.sendMessage({ clientMessageId: crypto.randomUUID(), receiverId: 'bob', message: 'not confirmed' }); }
      catch (error) { pendingBlocked = error.code === 'mls_membership_pending'; }
      await next.runtime.acceptWelcome('alice', transfer); await alice.runtime.confirmMembership(id, transfer.id);
      await alice.runtime.sendMessage({ clientMessageId: crypto.randomUUID(), receiverId: 'bob', message: 'replacement secret' });
      const received = await next.runtime.receive('alice', alice.packets[1]); let oldExcluded = false, historyExcluded = false;
      try { await old.runtime.receive('alice', alice.packets[1]); } catch { oldExcluded = true; }
      try { await next.runtime.receive('alice', alice.packets[0]); } catch { historyExcluded = true; }
      return { epoch: transfer.epoch, pendingBlocked, oldExcluded, historyExcluded, message: received.message,
        history: (await next.runtime.history()).length };
    } finally { for (const record of records) record.runtime.close(); }
  });
  expect(result).toEqual({ epoch: '2', pendingBlocked: true, oldExcluded: true, historyExcluded: true, message: 'replacement secret', history: 1 });
  expect(violations).toEqual([]);
});

test('real browser native enrollment, MLS publication, encrypted text and durable retry under unchanged CSP', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  try {
    const alice = await a.newPage(), bob = await b.newPage(), captured = [], bobCaptured = [];
    const aliceDevice = await prepare(alice, 'alice', captured), bobDevice = await prepare(bob, 'bob', bobCaptured);
    await pin(alice, bobDevice); await pin(bob, aliceDevice);
    const transfer = await alice.evaluate(async bob => {
      const id = await runtime.createConversation('bob'), result = await runtime.addPeer(id, new Uint8Array(bob.keyPackage));
      return { ...result, commit: Array.from(result.commit), welcome: Array.from(result.welcome), tree: Array.from(result.tree) };
    }, bobDevice);
    await bob.evaluate(async transfer => runtime.acceptWelcome('alice', { ...transfer,
      commit: new Uint8Array(transfer.commit), welcome: new Uint8Array(transfer.welcome), tree: new Uint8Array(transfer.tree) }), transfer);
    await alice.evaluate(transfer => runtime.confirmMembership(transfer.conversationId, transfer.id), transfer);
    const payload = await alice.evaluate(async () => {
      window.payload = await client.prepareMessage({ receiverId: 'bob', message: 'Encrypted Winga browser text', messageType: 'text' });
      window.failTransport = true;
      let error; try { await client.sendMessage(payload); } catch (failure) { error = failure.message; }
      return { id: payload.clientMessageId, error };
    });
    expect(payload.error).toBe('lost_reply'); expect(captured).toHaveLength(1);
    expect(Object.hasOwn(captured[0], 'message')).toBe(false);
    const received = await bob.evaluate(packet => runtime.receive('alice', { ...packet, ciphertext: new Uint8Array(packet.ciphertext) }), captured[0]);
    expect(received.message).toBe('Encrypted Winga browser text'); expect(received.status).toBe('delivered');
    const atRest = await alice.evaluate(async () => {
      const db = await new Promise(resolve => { const open = indexedDB.open('winga-encrypted-vault-v1:alice'); open.onsuccess = () => resolve(open.result); });
      try {
        if (!db.objectStoreNames.contains('records')) return { found: false };
        const records = await new Promise(resolve => { const read = db.transaction('records').objectStore('records').getAll(); read.onsuccess = () => resolve(read.result); });
        return { found: true, protected: records.length > 0 && records.every(row => row.v === 1 && row.ciphertext instanceof Uint8Array
          && !JSON.stringify(row).includes('Encrypted Winga browser text')), localStorage: localStorage.length };
      } finally { db.close(); }
    });
    expect(atRest).toEqual({ found: true, protected: true, localStorage: 0 });
    await alice.reload();
    const downgraded = await alice.evaluate(async () => {
      const client = WingaModules.api.communications.createCommunicationsApiClient({
        getSession: () => ({ username: 'alice', sessionId: 'a', token: 'a' }),
        fetchJson: () => { throw new Error('plaintext_leak'); },
      });
      try { await client.sendMessage({ receiverId: 'bob', message: 'must not leak' }); }
      catch (error) { return error.code; }
    });
    expect(downgraded).toBe('mls_runtime_required');
    const restored = await boot(alice, 'alice'); await pin(alice, bobDevice);
    expect(restored.id).toBe(aliceDevice.id); expect(restored.signaturePublicKey).toEqual(aliceDevice.signaturePublicKey);
    const retry = await alice.evaluate(id => runtime.retryMessage(id), payload.id);
    expect(retry.status).toBe('sent'); expect(captured).toHaveLength(2); expect(captured[1]).toEqual(captured[0]);
    const replay = await bob.evaluate(packet => runtime.receive('alice', { ...packet, ciphertext: new Uint8Array(packet.ciphertext) }), captured[1]);
    expect(replay).toEqual(received);
    const rows = await db.query('SELECT hash,device_id,identity_proof FROM conversation_crypto_key_packages ORDER BY device_id');
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every(row => row.identity_proof.signature && row.identity_proof.owner)).toBe(true);
  } finally { await a.close(); await b.close(); }
});
