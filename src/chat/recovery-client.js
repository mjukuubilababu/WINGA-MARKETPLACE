(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WingaRecoveryClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const fields = ['version', 'algorithm', 'purpose', 'owner', 'id', 'generation', 'nonce', 'ciphertext'];
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
  const fail = code => { throw Object.assign(new Error(code), { code }); };
  async function checkpointFor(capsule, revision, crypto = globalThis.crypto) {
    if (!capsule || Object.keys(capsule).length !== fields.length || fields.some(key => !Object.hasOwn(capsule, key))
      || typeof revision !== 'string' || !/^[1-9][0-9]{0,15}$/.test(revision) || !Number.isSafeInteger(Number(revision))
      || capsule.generation !== Number(revision)) fail('recovery_checkpoint_rejected');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(fields.map(key => capsule[key])))));
    return { v: 1, owner: capsule.owner, revision, hash: Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('') };
  }
  async function verifyCheckpoint(remote, checkpoint, owner, crypto = globalThis.crypto) {
    if (!checkpoint) fail('recovery_checkpoint_required');
    if (Object.keys(checkpoint).length !== 4 || !['v', 'owner', 'revision', 'hash'].every(key => Object.hasOwn(checkpoint, key))
      || checkpoint.v !== 1 || checkpoint.owner !== owner || typeof checkpoint.revision !== 'string'
      || !/^[1-9][0-9]{0,15}$/.test(checkpoint.revision)
      || typeof checkpoint.hash !== 'string' || !/^[a-f0-9]{64}$/.test(checkpoint.hash)) fail('recovery_checkpoint_rejected');
    const actual = await checkpointFor(remote?.capsule, remote?.revision, crypto);
    if (actual.owner !== owner || actual.revision !== checkpoint.revision || actual.hash !== checkpoint.hash) fail('recovery_freshness_rejected');
    return actual;
  }
  function createRecoveryClient({ owner, getSession, vault, codec, request,
    locks = globalThis.navigator?.locks, crypto = globalThis.crypto } = {}) {
    if (!owner || typeof getSession !== 'function' || !vault?.snapshot || !vault?.write
      || !codec?.sealRecovery || !codec?.openRecovery || !locks?.request || typeof request !== 'function') fail('recovery_unavailable');
    const context = () => {
      const value = getSession();
      if (value?.username !== owner || !value.sessionId || !value.token) fail('recovery_session_required');
      return { owner, deviceId: value.sessionId, token: value.token };
    };
    const current = before => {
      const after = context();
      if (before.token !== after.token || before.deviceId !== after.deviceId) fail('recovery_session_changed');
    };
    const historyOnly = values => Object.fromEntries(Object.entries(values).filter(([key]) => /^history:[A-Za-z0-9._:-]{1,128}$/.test(key)));
    const readArchive = bytes => {
      const archive = JSON.parse(decoder.decode(bytes));
      if (!archive || Object.keys(archive).length !== 3 || archive.v !== 1 || archive.owner !== owner
        || !archive.items || Array.isArray(archive.items) || typeof archive.items !== 'object'
        || Object.keys(archive.items).length > 1999 || Object.keys(archive.items).some(key => !/^history:[A-Za-z0-9._:-]{1,128}$/.test(key))) fail('recovery_archive_invalid');
      return archive;
    };
    async function backup(key, { checkpoint } = {}) {
      const session = context();
      return locks.request(`winga-recovery-operation:${owner}`, async () => {
        current(session); let local = await vault.snapshot(), pending = local.values['backup:pending'];
        if (!pending) {
          let items = historyOnly(local.values);
          const remote = await request('GET', undefined, session); current(session);
          if (typeof remote?.revision !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(remote.revision) || !Number.isSafeInteger(Number(remote.revision))
            || Number(remote.revision) >= Number.MAX_SAFE_INTEGER) fail('recovery_revision_invalid');
          const retained = local.values['recovery:checkpoint'];
          if (retained && Number(remote.revision) < Number(retained.revision)) fail('recovery_freshness_rejected');
          if (retained && !remote.capsule) fail('recovery_freshness_rejected');
          if (remote.capsule) {
            await verifyCheckpoint(remote, checkpoint || retained, owner, crypto);
            const bytes = await codec.openRecovery(remote.capsule, key, {
              owner, id: remote.capsule.id, generation: remote.capsule.generation });
            try {
              const prior = readArchive(bytes).items;
              if (!Object.keys(items).length) fail('recovery_restore_required');
              if (Object.keys(prior).some(key => items[key] !== undefined && JSON.stringify(items[key]) !== JSON.stringify(prior[key]))) fail('recovery_local_history_conflict');
              items = { ...prior, ...items };
            } finally { bytes.fill(0); }
          }
          if (Object.keys(items).length > 1999) fail('recovery_archive_invalid');
          const archive = encoder.encode(JSON.stringify({ v: 1, owner, items }));
          try {
            const capsule = await codec.sealRecovery(archive, key, { owner, id: crypto.randomUUID(), generation: Number(remote.revision) + 1 });
            pending = { expectedRevision: remote.revision, capsule };
            await vault.write({ expectedRevision: local.revision, values: { 'backup:pending': pending } });
          } finally { archive.fill(0); }
        } else {
          // A retry must prove the supplied recovery key opens the retained exact capsule.
          const bytes = await codec.openRecovery(pending.capsule, key, {
            owner, id: pending.capsule.id, generation: pending.capsule.generation }); bytes.fill(0);
        }
        current(session);
        const result = await request('PUT', pending, session); current(session);
        const acceptedCheckpoint = await checkpointFor(pending.capsule, String(Number(pending.expectedRevision) + 1), crypto);
        await verifyCheckpoint(result, acceptedCheckpoint, owner, crypto);
        local = await vault.snapshot();
        const retained = local.values['backup:pending'];
        if (!retained || JSON.stringify(retained) !== JSON.stringify(pending)) fail('recovery_pending_conflict');
        await vault.write({ expectedRevision: local.revision, values: { 'recovery:checkpoint': acceptedCheckpoint }, deleted: ['backup:pending'] });
        current(session); return { revision: result.revision, checkpoint: acceptedCheckpoint };
      });
    }
    async function restore(key, { checkpoint } = {}) {
      const session = context();
      return locks.request(`winga-recovery-operation:${owner}`, async () => {
        current(session); const local = await vault.snapshot(), retained = local.values['recovery:checkpoint'];
        checkpoint ||= retained;
        if (!checkpoint) fail('recovery_checkpoint_required');
        if (retained && Number(checkpoint.revision) < Number(retained.revision)) fail('recovery_freshness_rejected');
        const remote = await request('GET', undefined, session); current(session);
        await verifyCheckpoint(remote, checkpoint, owner, crypto);
        const plaintext = await codec.openRecovery(remote.capsule, key, {
          owner, id: remote.capsule.id, generation: remote.capsule.generation });
        let archive;
        try { archive = readArchive(plaintext); } finally { plaintext.fill(0); }
        const conflicting = Object.keys(archive.items).some(key => local.values[key] !== undefined
          && JSON.stringify(local.values[key]) !== JSON.stringify(archive.items[key]));
        if (conflicting || local.values['backup:pending']) fail('recovery_local_history_conflict');
        current(session);
        await vault.write({ expectedRevision: local.revision, values: { ...archive.items, 'recovery:checkpoint': checkpoint } });
        current(session); return { restored: Object.keys(archive.items).length, revision: remote.revision };
      });
    }
    async function exportCheckpoint() { context(); return (await vault.snapshot()).values['recovery:checkpoint'] || null; }
    return { backup, restore, exportCheckpoint };
  }
  return { createRecoveryClient, checkpointFor, verifyCheckpoint };
});
