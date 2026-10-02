import { runProtocolSpike } from '../spike.mjs';
import { runIdentitySpike } from '../identity-spike.mjs';

window.runWingaMlsIdentitySpike = runIdentitySpike;

window.runWingaMlsProtocolSpike = () => runProtocolSpike(async (bytes, device) => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('winga-mls-protocol-spike-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('states');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('states', 'readwrite');
      transaction.objectStore('states').put(bytes, device);
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
    });
    return await new Promise((resolve, reject) => {
      const request = db.transaction('states', 'readonly').objectStore('states').get(device);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
});
