const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const fields = ['v', 'id', 'roomId', 'epoch', 'cipherHash', 'owner', 'device', 'kind', 'signature'];
export function receiptBytes(value) {
  if (!value || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))
    || value.v !== 1 || !uuid(value.id) || !uuid(value.roomId) || !uuid(value.device)
    || !Number.isSafeInteger(value.epoch) || value.epoch < 0 || !/^[a-f0-9]{64}$/.test(value.cipherHash)
    || typeof value.owner !== 'string' || !value.owner.length || value.owner.length > 128
    || !['stored', 'read'].includes(value.kind) || typeof value.signature !== 'string') {
    throw new Error('receipt_proof_rejected');
  }
  return new TextEncoder().encode(JSON.stringify(['winga-device-receipt', value.v, value.id, value.roomId,
    value.epoch, value.cipherHash, value.owner, value.device, value.kind]));
}
