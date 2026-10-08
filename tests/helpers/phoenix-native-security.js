const assert = require('node:assert/strict');
const {randomBytes} = require('node:crypto');

// Fresh real browser signatures; request is either the real server route or the
// same transport authority in the independent localhost PostgreSQL fixture.
module.exports = async function verifyNativeSecurity({pool, sessions, operations, request}) {
  const before = (await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM encrypted_conversation_messages) AS messages,
    (SELECT COUNT(*)::int FROM encrypted_message_acceptances) AS acceptances,
    (SELECT COUNT(*)::int FROM encrypted_conversation_receipts) AS receipts`)).rows[0];
  const alice = operations.alice, bob = operations.bob;
  assert.equal((await request(sessions.alice, alice)).status, 200);
  for (const operation of [{...alice, signature: 'x'.repeat(86)}, {...alice, actorId: bob.actorId}]) {
    const denied = await request(sessions.alice, operation);
    assert.equal(denied.status, 403); assert.equal(denied.value.code, 'encrypted_proof_rejected');
  }
  assert.equal((await request(sessions.bob, alice)).status, 403);
  const shadow = {username: 'alice', sessionId: 'native-shadow', token: randomBytes(24).toString('hex')};
  await pool.query('INSERT INTO sessions(token,session_id,username,expires_at) VALUES($1,$2,$3,$4)',
    [shadow.token, shadow.sessionId, shadow.username, Date.now() + 600000]);
  const wrongBinding = await request(shadow, alice);
  assert.equal(wrongBinding.status, 403); assert.equal(wrongBinding.value.code, 'encrypted_proof_rejected');
  for (const operation of [{...alice, owner: 'forged'}, {...alice, payload: {message: 'plaintext'}},
    {...alice, payload: []}, {...alice, payload: {ciphertext: 'x'.repeat(24001)}}])
    assert.equal((await request(sessions.alice, operation)).status, 400);
  await pool.query("UPDATE conversation_crypto_devices SET status='revoked',revoked_at=NOW() WHERE id=$1", [bob.actorId]);
  const revokedDevice = await request(sessions.bob, bob);
  assert.equal(revokedDevice.status, 403); assert.equal(revokedDevice.value.code, 'encrypted_proof_rejected');
  // Issue the ticket while live, then delete the session before command authorization.
  assert.equal((await request(sessions.alice, alice, {revoke: true})).status, 401);
  const after = (await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM encrypted_conversation_messages) AS messages,
    (SELECT COUNT(*)::int FROM encrypted_message_acceptances) AS acceptances,
    (SELECT COUNT(*)::int FROM encrypted_conversation_receipts) AS receipts`)).rows[0];
  assert.deepEqual(after, before, 'denied bridge operations must not invent writes or receipts');
};
