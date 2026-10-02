import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify, webcrypto } from 'node:crypto';
import { receiptBytes } from '../receipt-proof.mjs';
import { recoveryCheckpoint, verifyRecoveryCheckpoint } from '../recovery-checkpoint.mjs';

const receipt = { v: 1, id: '11111111-1111-4111-8111-111111111111', roomId: '22222222-2222-4222-8222-222222222222',
  epoch: 3, cipherHash: 'a'.repeat(64), owner: 'bob', device: '33333333-3333-4333-8333-333333333333', kind: 'stored', signature: '' };
test('receipt proof binds each message, group, epoch, owner, device, hash and status', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const proof = sign(null, receiptBytes(receipt), privateKey);
  assert.equal(verify(null, receiptBytes(receipt), publicKey, proof), true);
  for (const changed of [{id:receipt.roomId}, {roomId:receipt.id}, {epoch:4}, {cipherHash:'b'.repeat(64)},
    {owner:'eve'}, {device:receipt.id}, {kind:'read'}]) {
    assert.equal(verify(null, receiptBytes({...receipt,...changed}), publicKey, proof), false);
  }
  assert.equal(verify(null, receiptBytes(receipt), generateKeyPairSync('ed25519').publicKey, proof), false);
});
test('receipt proof rejects legacy, additional fields and invalid binding data', () => {
  for (const value of [{id:receipt.id,kind:'read'}, {...receipt,extra:true}, {...receipt,epoch:-1},
    {...receipt,owner:''}, {...receipt,kind:'sent'}, {...receipt,cipherHash:'a'}, {...receipt,device:'untrusted'}]) {
    assert.throws(() => receiptBytes(value), /receipt_proof_rejected/);
  }
});
const capsule = {version:1,algorithm:'webcrypto-aes256gcm-v1',purpose:'history-recovery',owner:'alice',
  id:'capsule-one',generation:2,nonce:'nonce',ciphertext:'encrypted'};
test('independent checkpoint matches canonical capsule across field order', async () => {
  const checkpoint = await recoveryCheckpoint(capsule, '2', webcrypto);
  const reordered = Object.fromEntries(Object.entries(capsule).reverse());
  assert.deepEqual(await verifyRecoveryCheckpoint({capsule:reordered,revision:'2'}, checkpoint,'alice',webcrypto),checkpoint);
});
test('fresh device fails closed without checkpoint; earlier authentic capsule and substitution rejected', async () => {
  const checkpoint = await recoveryCheckpoint(capsule, '2', webcrypto);
  await assert.rejects(verifyRecoveryCheckpoint({capsule,revision:'2'},null,'alice',webcrypto),/recovery_checkpoint_required/);
  await assert.rejects(verifyRecoveryCheckpoint({capsule:{...capsule,generation:1},revision:'1'},checkpoint,'alice',webcrypto),/recovery_freshness_rejected/);
  await assert.rejects(verifyRecoveryCheckpoint({capsule:{...capsule,ciphertext:'substitute'},revision:'2'},checkpoint,'alice',webcrypto),/recovery_freshness_rejected/);
  await assert.rejects(verifyRecoveryCheckpoint({capsule,revision:'2'},checkpoint,'bob',webcrypto),/recovery_checkpoint_rejected/);
  await assert.rejects(verifyRecoveryCheckpoint({capsule,revision:'2'},{...checkpoint,extra:true},'alice',webcrypto),/recovery_checkpoint_rejected/);
});
