const capsuleFields = ['version', 'algorithm', 'purpose', 'owner', 'id', 'generation', 'nonce', 'ciphertext'];
const need = (value, code) => { if (!value) throw new Error(code); };
export async function recoveryCheckpoint(capsule, revision, cryptoImpl = globalThis.crypto) {
  need(capsule && capsuleFields.every(key => Object.hasOwn(capsule, key))
    && Object.keys(capsule).length === capsuleFields.length && typeof revision === 'string'
    && /^[1-9][0-9]{0,15}$/.test(revision) && Number.isSafeInteger(Number(revision))
    && capsule.generation === Number(revision), 'recovery_checkpoint_rejected');
  const bytes = new TextEncoder().encode(JSON.stringify(capsuleFields.map(key => capsule[key])));
  const hash = Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  return { v: 1, owner: capsule.owner, revision, hash };
}
export async function verifyRecoveryCheckpoint(remote, checkpoint, owner, cryptoImpl = globalThis.crypto) {
  need(checkpoint, 'recovery_checkpoint_required');
  need(Object.keys(checkpoint).length === 4 && ['v', 'owner', 'revision', 'hash'].every(key => Object.hasOwn(checkpoint, key))
    && checkpoint.v === 1 && checkpoint.owner === owner && typeof checkpoint.hash === 'string'
    && /^[a-f0-9]{64}$/.test(checkpoint.hash), 'recovery_checkpoint_rejected');
  const actual = await recoveryCheckpoint(remote.capsule, remote.revision, cryptoImpl);
  need(actual.owner === owner && actual.revision === checkpoint.revision && actual.hash === checkpoint.hash,
    'recovery_freshness_rejected');
  return actual;
}
