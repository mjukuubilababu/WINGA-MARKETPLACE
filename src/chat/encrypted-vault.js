(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WingaEncryptedVault = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
  const failure = code => Object.assign(new Error(code), { code });
  const fail = code => { throw failure(code); };
  const id = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(value);
  const journalId = value => /^(history:|mls:received:|mls:consumed:|mls:package:)/.test(value);
  const journalKind = value => value.startsWith('history:')?'history:':value.slice(0,value.indexOf(':',4)+1);
  const b64 = bytes => {
    let value = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) value += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  function pack(value) {
    const text = JSON.stringify(value, (_, item) => {
      if (item instanceof Uint8Array) return { $bytes: b64(item) };
      if (typeof item === 'bigint') return { $integer: String(item) };
      if (item && typeof item === 'object' && (Object.hasOwn(item, '$bytes') || Object.hasOwn(item, '$integer'))) fail('crypto_vault_value_invalid');
      return item;
    });
    if (typeof text !== 'string') fail('crypto_vault_value_invalid');
    const bytes = encoder.encode(text);
    if (bytes.length > 4 * 1024 * 1024) fail('crypto_vault_value_too_large');
    return bytes;
  }
  function unpack(bytes) {
    return JSON.parse(decoder.decode(bytes), (_, item) => {
      if (!item || typeof item !== 'object' || Object.keys(item).length !== 1) return item;
      if (typeof item.$integer === 'string' && /^(0|-?[1-9][0-9]*)$/.test(item.$integer)) return BigInt(item.$integer);
      if (typeof item.$bytes === 'string' && /^[A-Za-z0-9_-]*$/.test(item.$bytes)) {
        const raw = Uint8Array.from(atob(item.$bytes.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
        if (b64(raw) !== item.$bytes) fail('crypto_vault_value_invalid');
        return raw;
      }
      return item;
    });
  }
  async function createEncryptedVault({ owner, getSession, indexedDB = globalThis.indexedDB,
    crypto = globalThis.crypto, locks = globalThis.navigator?.locks, secureContext = globalThis.isSecureContext } = {}) {
    if (!id(owner) || !secureContext || !indexedDB || !crypto?.subtle || !locks?.request
      || typeof getSession !== 'function') fail('crypto_vault_unavailable');
    const current = () => {
      const session = getSession();
      // HttpOnly sessions expose their ID, never the bearer cookie. Server I/O authenticates separately.
      if (session?.username !== owner || !session.sessionId) fail('crypto_vault_session_required');
      return { ...session };
    };
    const assertCurrent = before => {
      const after = current();
      if (after.token !== before.token || after.sessionId !== before.sessionId) fail('crypto_vault_session_changed');
    };
    current();
    const name = `winga-encrypted-vault-v1:${owner}`;
    const db = await new Promise((resolve, reject) => {
      let blocked = false; const request = indexedDB.open(name, 2);
      request.onupgradeneeded = () => {
        for (const store of ['keys', 'records', 'metadata']) if(!request.result.objectStoreNames.contains(store))request.result.createObjectStore(store);
        const journal=request.result.createObjectStore('journal');journal.createIndex('order',['kind','order']);
        // Move sealed records, never plaintext, in the same schema-upgrade transaction.
        const read=request.transaction.objectStore('records').openCursor();
        read.onsuccess=()=>{const cursor=read.result;if(!cursor)return;
          if(journalId(cursor.key)){journal.put({...cursor.value,kind:journalKind(cursor.key),order:'0000000000000000:'+cursor.key},cursor.key);cursor.delete();}cursor.continue();};
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(failure('crypto_vault_storage_blocked')); };
      request.onsuccess = () => {
        if (blocked) return request.result.close();
        request.result.onversionchange = () => request.result.close(); resolve(request.result);
      };
    });
    async function transaction(names, mode, work) {
      return new Promise((resolve, reject) => {
        let tx, result, error;
        try { tx = db.transaction(names, mode, { durability: 'strict' }); }
        catch { tx = db.transaction(names, mode); }
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(error || tx.error || failure('crypto_vault_write_aborted'));
        tx.onerror = () => {};
        try { work(tx, value => { result = value; }, failure => { error = failure; tx.abort(); }); }
        catch (failure) { error = failure; tx.abort(); }
      });
    }
    let key;
    try {
      await locks.request(name, async () => {
        const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        key = await transaction(['keys', 'records', 'journal', 'metadata'], 'readwrite', (tx, done, abort) => {
          const read = tx.objectStore('keys').get('local');
          read.onsuccess = () => {
            const count = tx.objectStore('records').count();
            count.onsuccess = () => {
              const archived=tx.objectStore('journal').count();
              archived.onsuccess=()=>{
              if (!read.result && (count.result || archived.result)) return abort(failure('crypto_vault_key_missing'));
              const chosen = read.result || candidate;
              if (chosen.type !== 'secret' || chosen.extractable || chosen.algorithm?.name !== 'AES-GCM' || chosen.algorithm.length !== 256
                || chosen.usages.length !== 2 || !chosen.usages.includes('encrypt') || !chosen.usages.includes('decrypt')) return abort(failure('crypto_vault_key_invalid'));
              if (!read.result) { tx.objectStore('keys').add(chosen, 'local'); tx.objectStore('metadata').put('0', 'revision'); }
              done(chosen);
              };
            };
          };
        });
      });
    } catch (error) { db.close(); throw error; }
    const parameters = (recordId, nonce) => ({ name: 'AES-GCM', iv: nonce,
      additionalData: encoder.encode(JSON.stringify(['winga-encrypted-vault', 1, owner, recordId])), tagLength: 128 });
    async function reveal(recordId, sealed) {
      if (sealed?.v !== 1 || !(sealed.nonce instanceof Uint8Array) || sealed.nonce.length !== 12
        || !(sealed.ciphertext instanceof Uint8Array) || sealed.ciphertext.length > 4 * 1024 * 1024 + 16) fail('crypto_vault_record_invalid');
      const bytes = new Uint8Array(await crypto.subtle.decrypt(parameters(recordId, sealed.nonce), key, sealed.ciphertext));
      try { return unpack(bytes); } finally { bytes.fill(0); }
    }
    async function lookup(recordId) {
      if(!id(recordId))fail('crypto_vault_write_invalid');const context=current();
      const sealed=await transaction(['records','journal'],'readonly',(tx,done)=>{
        const read=tx.objectStore(journalId(recordId)?'journal':'records').get(recordId);read.onsuccess=()=>done(read.result);
      });
      const value=sealed===undefined?undefined:await reveal(recordId,sealed);assertCurrent(context);return value;
    }
    async function historyPage({after,limit=100,expectedRevision,prefix='history:'}={}) {
      if((after!==undefined && (typeof after!=='string' || after.length>192)) || !Number.isInteger(limit) || limit<1 || limit>100
        || !['history:','mls:package:'].includes(prefix))fail('crypto_vault_write_invalid');
      const context=current();
      const saved=await transaction(['journal','metadata'],'readonly',(tx,done,abort)=>{
        const revision=tx.objectStore('metadata').get('revision'),rows=[];let bytes=0,next;
        const range=IDBKeyRange.bound([prefix,''],[prefix,after || '\uffff'],false,Boolean(after));
        const read=tx.objectStore('journal').index('order').openCursor(range,'prev');
        read.onsuccess=()=>{
          const cursor=read.result;
          if(cursor && String(cursor.primaryKey).startsWith(prefix)) {
            const size=cursor.value.ciphertext.byteLength;
            if(rows.length && (rows.length>=limit || bytes+size>4*1024*1024)){next=rows.at(-1)[2];}
            else {rows.push([cursor.primaryKey,cursor.value,cursor.key[1]]);bytes+=size;cursor.continue();return;}
          }else if(cursor){cursor.continue();return;}
          if(expectedRevision!==undefined && revision.result!==expectedRevision)return abort(failure('crypto_vault_revision_conflict'));
          done({revision:revision.result,rows,next});
        };
      });
      const values=Object.fromEntries(await Promise.all(saved.rows.map(async([key,sealed])=>[key,await reveal(key,sealed)])));
      assertCurrent(context);return {revision:saved.revision,values,next:saved.next};
    }
    async function historySnapshot() {
      let after,revision;const values={};
      do {const page=await historyPage({after,expectedRevision:revision});revision=page.revision;Object.assign(values,page.values);after=page.next;}while(after);
      return {revision,values};
    }
    async function pruneExpiredAdmissions(now) {
      if(!Number.isSafeInteger(now) || now<0)fail('crypto_vault_write_invalid');
      let after;
      do {
        const page=await historyPage({after,prefix:'mls:package:'});after=page.next;
        const deleted=Object.entries(page.values).filter(([,value])=>{
          const expiry=value?.package?.publicPackage?.leafNode?.lifetime?.notAfter;
          return typeof expiry==='bigint' && expiry<BigInt(Math.floor(now/1000));
        }).map(([key])=>key);
        // Expired admissions cannot join MLS. Consumption/replay tombstones remain untouched.
        if(deleted.length)await write({expectedRevision:page.revision,deleted});
      }while(after);
    }
    async function snapshot() {
      const context = current();
      const saved = await transaction(['records', 'metadata'], 'readonly', (tx, done, abort) => {
        const revision = tx.objectStore('metadata').get('revision'), values = [], read = tx.objectStore('records').openCursor();
        let bytes = 0;
        read.onsuccess = () => {
          const cursor = read.result;
          if (cursor) {
            bytes += cursor.value?.ciphertext?.byteLength || 0;
            if (values.length >= 2000 || bytes > 32 * 1024 * 1024) return abort(failure('crypto_vault_snapshot_too_large'));
            values.push([cursor.key, cursor.value]); cursor.continue();
          }
          else if (!/^(0|[1-9][0-9]{0,15})$/.test(revision.result || '') || !Number.isSafeInteger(Number(revision.result))) abort(failure('crypto_vault_revision_invalid'));
          else done({ revision: revision.result, values });
        };
      });
      const values = Object.fromEntries(await Promise.all(saved.values.map(async ([recordId, sealed]) => [recordId, await reveal(recordId, sealed)])));
      const recent=await historyPage({expectedRevision:saved.revision});Object.assign(values,recent.values);
      assertCurrent(context); return { revision: saved.revision, values };
    }
    async function write({ expectedRevision, values = {}, deleted = [] } = {}) {
      if (!/^(0|[1-9][0-9]{0,15})$/.test(expectedRevision || '') || !Number.isSafeInteger(Number(expectedRevision))
        || Number(expectedRevision) >= Number.MAX_SAFE_INTEGER || !Array.isArray(deleted)
        || !values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length + deleted.length > 2000
        || [...Object.keys(values), ...deleted].some(recordId => !id(recordId))) fail('crypto_vault_write_invalid');
      // Capture the complete logical write before waiting for another tab's lock.
      try { values = structuredClone(values); deleted = [...deleted]; }
      catch { fail('crypto_vault_value_invalid'); }
      const context = current();
      return locks.request(name, async () => {
        assertCurrent(context);
        const records = []; let changedBytes = 0,journalBytes=0;
        for (const [recordId, value] of Object.entries(values)) {
          const bytes = pack(value), nonce = crypto.getRandomValues(new Uint8Array(12));
          try {
            if(journalId(recordId))journalBytes+=bytes.length+16;else changedBytes+=bytes.length+16;
            if (changedBytes > 32 * 1024 * 1024 || journalBytes > 32 * 1024 * 1024) fail('crypto_vault_snapshot_too_large');
            records.push([recordId, { v: 1, nonce, ciphertext: new Uint8Array(await crypto.subtle.encrypt(parameters(recordId, nonce), key, bytes)) }]);
          }
          finally { bytes.fill(0); }
        }
        assertCurrent(context);
        const next = await transaction(['records', 'journal', 'metadata'], 'readwrite', (tx, done, abort) => {
          const read = tx.objectStore('metadata').get('revision');
          read.onsuccess = () => {
            if (read.result !== expectedRevision) return abort(failure('crypto_vault_revision_conflict'));
            try { assertCurrent(context); } catch (error) { return abort(error); }
            for (const recordId of deleted) tx.objectStore(journalId(recordId)?'journal':'records').delete(recordId);
            for (const [recordId, sealed] of records) {
              if(journalId(recordId))tx.objectStore('journal').put({...sealed,kind:journalKind(recordId),order:String(Number(expectedRevision)+1).padStart(16,'0')+':'+recordId},recordId);
              else tx.objectStore('records').put(sealed, recordId);
            }
            // Count the resulting state before committing; rejection rolls back every put/delete.
            let count = 0, size = 0; const cursor = tx.objectStore('records').openCursor();
            cursor.onsuccess = () => {
              if (cursor.result) {
                count++; size += cursor.result.value?.ciphertext?.byteLength || 0;
                if (count > 2000 || size > 32 * 1024 * 1024) return abort(failure('crypto_vault_snapshot_too_large'));
                cursor.result.continue();
              } else {
                try { assertCurrent(context); } catch (error) { return abort(error); }
                const revision = String(Number(expectedRevision) + 1); tx.objectStore('metadata').put(revision, 'revision'); done(revision);
              }
            };
          };
        });
        assertCurrent(context); return next;
      });
    }
    return { snapshot, write, lookup, historyPage, historySnapshot, pruneExpiredAdmissions, close: () => db.close() };
  }
  return { createEncryptedVault };
});
