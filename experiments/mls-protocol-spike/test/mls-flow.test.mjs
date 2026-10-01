import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runProtocolSpike } from '../spike.mjs';

test('two synthetic members exchange MLS messages across serialized state', async () => {
  const result = await runProtocolSpike();
  assert.deepEqual(result, {
    joined: true,
    encryptedDelivery: true,
    stateRestored: true,
    outOfOrderDelivered: true,
    replayRejected: true,
    removedDeviceRejected: true,
  });
});
