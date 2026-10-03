(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WingaCryptoDevices = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const fields = ['action', 'deviceId', 'actorId', 'publicKey', 'fingerprint', 'requestId', 'issuedAt'];
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
  const failure = code => Object.assign(new Error(code), { code });
  const fail = code => { throw failure(code); };
  function encode(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function operationBytes(context, payload) {
    return new TextEncoder().encode(JSON.stringify(['winga-crypto-device-operation', 1,
      context.owner, context.deviceId, ...fields.map(key => payload[key])]));
  }
  async function createCryptoDeviceClient({ getSession, request, indexedDB = globalThis.indexedDB,
    crypto = globalThis.crypto, secureContext = globalThis.isSecureContext } = {}) {
    if (!secureContext || !indexedDB || !crypto?.subtle || !crypto.randomUUID
      || typeof getSession !== 'function' || typeof request !== 'function') fail('crypto_device_unavailable');
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open('winga-crypto-identity-v1', 1);
      let blocked = false;
      open.onupgradeneeded = () => open.result.createObjectStore('identities', { keyPath: 'owner' });
      open.onerror = () => reject(open.error);
      open.onblocked = () => { blocked = true; reject(failure('crypto_device_storage_blocked')); };
      open.onsuccess = () => {
        if (blocked) return open.result.close();
        open.result.onversionchange = () => open.result.close();
        resolve(open.result);
      };
    });
    const session = () => {
      const value = getSession();
      if (!value?.username || !value.sessionId) fail('crypto_device_session_required');
      return { owner: value.username, deviceId: value.sessionId, token: value.token };
    };
    function current(context) {
      const value = session();
      if (value.owner !== context.owner || value.deviceId !== context.deviceId || value.token !== context.token) fail('crypto_device_session_changed');
    }
    function transact(owner, update) {
      return new Promise((resolve, reject) => {
        let tx;
        try { tx = db.transaction('identities', 'readwrite', { durability: 'strict' }); }
        catch { tx = db.transaction('identities', 'readwrite'); }
        let result, error;
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(error || tx.error || failure('crypto_device_storage_failed'));
        tx.onerror = () => {};
        const rows = tx.objectStore('identities'), read = rows.get(owner);
        read.onsuccess = () => {
          try {
            result = update(read.result);
            if (result) rows.put(result);
          } catch (failure) { error = failure; tx.abort(); }
        };
      });
    }
    async function identity(context) {
      let row = await transact(context.owner, value => value);
      if (!row) {
        let keys;
        try { keys = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']); }
        catch { fail('crypto_device_algorithm_unavailable'); }
        const raw = await crypto.subtle.exportKey('raw', keys.publicKey);
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
        const candidate = { owner: context.owner, id: crypto.randomUUID(), privateKey: keys.privateKey,
          publicKey: encode(raw), fingerprint: Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join(''), pending: null };
        current(context);
        // Compare-and-create in one IDB transaction prevents two tabs choosing different identities.
        row = await transact(context.owner, value => value || candidate);
      }
      if (!uuid(row.id) || row.owner !== context.owner || row.privateKey?.extractable !== false
        || row.privateKey?.algorithm?.name !== 'Ed25519' || row.privateKey?.type !== 'private') fail('crypto_device_identity_invalid');
      current(context);
      return row;
    }
    function verifyView(value, row, owner) {
      if (!value || value.id !== row.id || value.owner !== owner || value.publicKey !== row.publicKey
        || value.fingerprint !== row.fingerprint || !['active', 'pending', 'revoked'].includes(value.status)) fail('crypto_device_server_identity_mismatch');
      return value;
    }
    async function enroll() {
      const context = session(), row = await identity(context);
      let operation = row.pending;
      if (!operation || operation.sessionId !== context.deviceId) {
        const payload = { action: 'register', deviceId: row.id, actorId: row.id, publicKey: row.publicKey,
          fingerprint: row.fingerprint, requestId: crypto.randomUUID(), issuedAt: Date.now() };
        payload.signature = encode(await crypto.subtle.sign('Ed25519', row.privateKey, operationBytes(context, payload)));
        current(context);
        const saved = await transact(context.owner, value => {
          if (!value || value.id !== row.id) fail('crypto_device_identity_invalid');
          return { ...value, pending: value.pending?.sessionId === context.deviceId
            ? value.pending : { sessionId: context.deviceId, payload } };
        });
        operation = saved.pending;
      }
      current(context);
      let result;
      try { result = await request('POST', operation.payload, context); }
      catch (error) {
        if (error.code === 'crypto_device_proof_expired') {
          current(context);
          await transact(context.owner, value => {
            if (!value || value.id !== row.id) fail('crypto_device_identity_invalid');
            return value.pending?.payload.requestId === operation.payload.requestId ? { ...value, pending: null } : value;
          });
        }
        throw error;
      }
      current(context);
      if (result?.version !== 1) fail('crypto_device_server_identity_mismatch');
      verifyView(result?.device, row, context.owner);
      const fresh = await request('GET', undefined, context);
      current(context);
      if (fresh?.version !== 1 || !Array.isArray(fresh.devices)) fail('crypto_device_server_identity_mismatch');
      const actual = verifyView(fresh.devices.find(item => item.id === row.id), row, context.owner);
      await transact(context.owner, value => {
        if (!value || value.id !== row.id) fail('crypto_device_identity_invalid');
        return value.pending?.payload.requestId === operation.payload.requestId ? { ...value, pending: null } : value;
      });
      current(context);
      return actual;
    }
    async function attestKeyPackage(raw) {
      if (!(raw instanceof Uint8Array) || !raw.length || raw.length > 8192) fail('crypto_package_invalid');
      const context = session(), row = await identity(context);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), byte => byte.toString(16).padStart(2, '0')).join('');
      const payload = { deviceId: row.id, requestId: crypto.randomUUID(), issuedAt: Date.now(), keyPackage: encode(raw), hash };
      const bytes = new TextEncoder().encode(JSON.stringify(['winga-crypto-key-package', 1, context.owner, context.deviceId,
        row.id, payload.requestId, payload.issuedAt, payload.hash]));
      payload.signature = encode(await crypto.subtle.sign('Ed25519', row.privateKey, bytes));
      current(context); return payload;
    }
    async function signCryptoOperation(action, payload, requestId = crypto.randomUUID()) {
      const context = session(), row = await identity(context);
      const operation = { action, actorId: row.id, requestId, issuedAt: Date.now(), payload: structuredClone(payload) };
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(operation.payload,Object.keys(operation.payload).sort())))), b => b.toString(16).padStart(2, '0')).join('');
      const bytes = new TextEncoder().encode(JSON.stringify(['winga-crypto-transport', 1, context.owner, context.deviceId,
        action, row.id, requestId, operation.issuedAt, digest]));
      operation.signature = encode(await crypto.subtle.sign('Ed25519', row.privateKey, bytes));
      current(context); return operation;
    }
    async function list() {
      const context=session(),row=await identity(context),result=await request('GET',undefined,context);current(context);
      if(result?.version!==1 || !Array.isArray(result.devices) || result.devices.length>32)fail('crypto_device_server_identity_mismatch');
      const ids=new Set();
      for(const device of result.devices) {
        if(!device || Object.keys(device).sort().join(',')!=='fingerprint,id,owner,publicKey,status' || !uuid(device.id) || ids.has(device.id)
          || device.owner!==context.owner || !['active','pending','revoked'].includes(device.status) || typeof device.publicKey!=='string'
          || !/^[A-Za-z0-9_-]{43}$/.test(device.publicKey))fail('crypto_device_server_identity_mismatch');
        const bytes=Uint8Array.from(atob(device.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
        if(bytes.length!==32 || encode(bytes)!==device.publicKey)fail('crypto_device_server_identity_mismatch');
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==device.fingerprint)fail('crypto_device_server_identity_mismatch');ids.add(device.id);
      }
      const own=result.devices.find(d=>d.id===row.id);if(own)verifyView(own,row,context.owner);
      const pending=row.managementPending;
      current(context);return {...result,ownDevice:own||null,pendingOperation:pending?{action:pending.payload.action,deviceId:pending.payload.deviceId,fingerprint:pending.payload.fingerprint}:null};
    }
    async function manage(action,deviceId,expectedFingerprint) {
      if(!['approve','revoke'].includes(action) || !uuid(deviceId) || typeof expectedFingerprint!=='string'
        || !/^[a-f0-9]{64}$/.test(expectedFingerprint))fail('crypto_device_confirmation_required');
      const context=session(),row=await identity(context),view=await list();current(context);
      const target=view.devices.find(d=>d.id===deviceId);
      let pending=row.managementPending;
      if(pending && (pending.sessionId!==context.deviceId || pending.payload.action!==action || pending.payload.deviceId!==deviceId
        || pending.payload.fingerprint!==expectedFingerprint))fail('crypto_device_pending_operation');
      if((view.ownDevice?.status!=='active' && !pending) || !target || target.fingerprint!==expectedFingerprint)fail('crypto_device_confirmation_required');
      if(!pending) {
        if((action==='approve' && target.status!=='pending') || (action==='revoke' && target.status==='revoked'))fail('crypto_device_transition_rejected');
        const payload={action,deviceId,actorId:row.id,publicKey:target.publicKey,fingerprint:expectedFingerprint,requestId:crypto.randomUUID(),issuedAt:Date.now()};
        payload.signature=encode(await crypto.subtle.sign('Ed25519',row.privateKey,operationBytes(context,payload)));current(context);
        const saved=await transact(context.owner,value=>{
          if(!value || value.id!==row.id)fail('crypto_device_identity_invalid');
          const prior=value.managementPending;
          if(prior && (prior.sessionId!==context.deviceId || prior.payload.action!==action || prior.payload.deviceId!==deviceId
            || prior.payload.fingerprint!==expectedFingerprint))fail('crypto_device_pending_operation');
          return {...value,managementPending:prior||{sessionId:context.deviceId,payload}};
        });pending=saved.managementPending;
      }
      let result;
      try{result=await request('POST',pending.payload,context);}catch(error){
        if(error.code==='crypto_device_proof_expired') {
          current(context);await transact(context.owner,value=>value?.managementPending?.payload.requestId===pending.payload.requestId?{...value,managementPending:null}:value);
        }throw error;
      }
      current(context);verifyView(result?.device,{...target,id:deviceId},context.owner);
      if(result.version!==1 || result.device.status!==(action==='approve'?'active':'revoked'))fail('crypto_device_server_identity_mismatch');
      const fresh=await list();current(context);
      const actual=fresh.devices.find(d=>d.id===deviceId);
      if(!actual || actual.status!==result.device.status || actual.fingerprint!==expectedFingerprint)fail('crypto_device_transition_rejected');
      await transact(context.owner,value=>value?.managementPending?.payload.requestId===pending.payload.requestId?{...value,managementPending:null}:value);
      current(context);return list();
    }
    async function clearPending() {
      const context=session(),row=await identity(context);await list();current(context);
      await transact(context.owner,value=>{
        if(!value || value.id!==row.id)fail('crypto_device_identity_invalid');
        return value.managementPending?.payload.requestId===row.managementPending?.payload.requestId?{...value,managementPending:null}:value;
      });
      current(context);return list();
    }
    return { enroll, list, manage, clearPending, attestKeyPackage, signCryptoOperation, close: () => db.close() };
  }
  return { createCryptoDeviceClient, operationBytes };
});
