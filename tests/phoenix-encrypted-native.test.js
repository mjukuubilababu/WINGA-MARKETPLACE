const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const {randomBytes} = require('node:crypto');
const {Client, Pool} = require('pg');
const {createPostgresStore} = require('../backend/db');
const {createConversationTransport} = require('../backend/conversation-transport');

const target = new URL(process.env.WINGA_TEST_POSTGRES_URL || 'http://invalid');
if (!['postgres:', 'postgresql:'].includes(target.protocol)
  || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.search || target.hash)
  throw new Error('WINGA_TEST_POSTGRES_URL must point to a disposable localhost PostgreSQL cluster.');

// This independently verifies the native fixture locally; actual BEAM loss is
// mandatory in the subtest registered by phoenix-transport.test.js in BEAM CI.
test('native HTTP fixture uses real signed MLS acceptance, decryption and durable replay (no BEAM simulation)', {timeout: 120000}, async t => {
  const root = path.resolve(__dirname, '..');
  const database = 'winga_encrypted_beam_test_' + randomBytes(8).toString('hex');
  const admin = new Client({connectionString: target.toString()});
  await admin.connect();
  let pool, fixture, created = false;
  t.after(async () => {
    if (fixture) await fixture.close();
    if (pool) await pool.end();
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
  });
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const local = new URL(target); local.pathname = '/' + database;
  pool = new Pool({connectionString: local.toString(), max: 8});
  const store = createPostgresStore({queryClient: pool}); await store.init();
  await pool.query(`INSERT INTO users(username,password,phone_number,primary_category,role,created_at)
    VALUES('alice','no-login','synthetic-native-a','general','seller',NOW()),
    ('bob','no-login','synthetic-native-b','general','buyer',NOW())`);
  const sessions = {};
  for (const username of ['alice', 'bob']) {
    const token = randomBytes(24).toString('hex');
    sessions[username] = {username, sessionId: username, token};
    await pool.query('INSERT INTO sessions(token,session_id,username,expires_at) VALUES($1,$2,$2,$3)',
      [token, username, Date.now() + 3600000]);
  }
  const output = fs.mkdtempSync(path.join(root, '.tmp-encrypted-beam-fixture-'));
  fixture = await require('./helpers/phoenix-encrypted-native-fixture')({root, output, store, sessions});
  const evidence = await require('./helpers/phoenix-encrypted-native-exercise')({
    fixture, pool, accounts: {alice: 'alice', bob: 'bob'},
    onSecurity: operations => require('./helpers/phoenix-native-security')({
      pool, sessions, operations,
      request: async (session, operation, {revoke = false} = {}) => {
        await store.registerConversationDevice({owner:session.username,token:session.token,deviceId:session.sessionId});
        const transport = createConversationTransport({env: {
          WINGA_PHOENIX_TRANSPORT_ENABLED: 'true', WINGA_PHOENIX_ALL_USERS: 'true',
          WINGA_ENCRYPTED_CONVERSATIONS_ENABLED: 'true', WINGA_CRYPTO_DEVICES_ENABLED: 'true', WINGA_MLS_CANDIDATE_ENABLED: 'true',
          CONVERSATION_TICKET_SECRET: 't'.repeat(48), CONVERSATION_SERVICE_TOKEN: 's'.repeat(48)
        }});
        const ticket = transport.issue({...session, expiresAt: Date.now() + 600000}).ticket;
        if (revoke) await pool.query('DELETE FROM sessions WHERE session_id=$1', [session.sessionId]);
        try {
          const input = transport.validateCommand({version: 1, ticket, command: 'native', payload: operation});
          const context = await transport.authorize(ticket, store);
          return {status: 200, value: await transport.execute(context, input, store)};
        } catch (error) {return {status: error.status, value: {code: error.code}};}
      }
    }),
    onProgress: phase => console.log('Native fixture phase: ' + phase)
  });
  require('node:assert/strict').equal(evidence.beamLossPhases, 0);
  t.diagnostic(JSON.stringify(evidence));
});
