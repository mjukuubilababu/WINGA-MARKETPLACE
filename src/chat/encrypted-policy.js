(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WingaEncryptedPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const failure = code => Object.assign(new Error(code), { code });
  let opening;
  function names(owner, peer) {
    if (![owner, peer].every(value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value)) || owner === peer) {
      throw failure('mls_policy_identity_invalid');
    }
  }
  function database() {
    if (!globalThis.indexedDB) return Promise.reject(failure('mls_policy_unavailable'));
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open('winga-encrypted-policy-v1', 1); let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('modes', { keyPath: ['owner', 'peer'] });
      request.onerror = () => { opening = null; reject(failure('mls_policy_storage_failed')); };
      request.onblocked = () => { blocked = true; opening = null; reject(failure('mls_policy_storage_blocked')); };
      request.onsuccess = () => {
        if (blocked) return request.result.close();
        request.result.onversionchange = () => { request.result.close(); opening = null; };
        resolve(request.result);
      };
    });
    return opening;
  }
  async function access(owner, peer, mark) {
    names(owner, peer); const db = await database();
    return new Promise((resolve, reject) => {
      let result = false, tx;
      try { tx = db.transaction('modes', mark ? 'readwrite' : 'readonly', mark ? { durability: 'strict' } : undefined); }
      catch { reject(failure('mls_policy_storage_failed')); return; }
      tx.onabort = () => reject(failure('mls_policy_storage_failed'));
      tx.onerror = () => {};
      tx.oncomplete = () => resolve(result);
      const store = tx.objectStore('modes'), read = store.get([owner, peer]);
      read.onsuccess = () => {
        if (read.result && (read.result.owner !== owner || read.result.peer !== peer || read.result.mode !== 'encrypted')) { tx.abort(); return; }
        result = Boolean(read.result || mark);
        if (mark && !read.result) store.add({ owner, peer, mode: 'encrypted' });
      };
    });
  }
  // Metadata only. There is deliberately no downgrade/delete API. The encrypted
  // vault remains authoritative for keys, ratchets, messages and exact outbox.
  return { isEncrypted: (owner, peer) => access(owner, peer, false), markEncrypted: (owner, peer) => access(owner, peer, true) };
});
