const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {chromium} = require('@playwright/test');
const {operationBytes} = require('../../backend/encrypted-conversations');

module.exports = async function exerciseNative({fixture, pool, accounts, onLoss, onSecurity, onProgress = () => {}}) {
  const browser = await chromium.launch({channel: process.env.WINGA_TEST_BROWSER_CHANNEL === 'chromium' ? undefined : 'msedge', headless: true});
  const contexts = [];
  async function pageFor(context, account) {
    onProgress('enroll ' + account);
    const page = await context.newPage();
    await page.context().grantPermissions(['local-network-access'], {origin: fixture.origin});
    const handshake = [];
    const record = value => {if (handshake.length < 80) handshake.push(value);};
    const observedPaths = new Set(['/test-session', '/phoenix.js', '/communications.js', '/receipts.js',
      '/vendor/phoenix.min.js', '/api/messages/device', '/api/messages/transport-ticket']);
    page.on('response', response => {
      const pathname = new URL(response.url()).pathname;
      if (observedPaths.has(pathname)) record({stage: 'http', path: pathname, status: response.status()});
    });
    page.on('requestfailed', request => {
      const pathname = new URL(request.url()).pathname;
      if (observedPaths.has(pathname)) record({stage: 'http.failed', path: pathname});
    });
    page.on('pageerror', () => record({stage: 'page.error'}));
    const trace = [];
    const replies = [];
    const port = fixture.phoenixPorts?.[account] || fixture.phoenixPort;
    page.on('websocket', socket => {
      const operations = new Map();
      record({stage: 'socket.created', port: Number(new URL(socket.url()).port)});
      socket.on('socketerror', () => record({stage: 'socket.error'}));
      socket.on('close', () => record({stage: 'socket.closed'}));
      socket.on('framesent', frame => {
        const value = JSON.parse(frame.payload);
        if (value[3] === 'phx_join') record({stage: 'join.sent'});
        if (value[3] === 'encrypted.operation') {trace.push(value[4]); operations.set(value[1], value[4]);}
      });
      socket.on('framereceived', frame => {
        const value = JSON.parse(frame.payload), operation = operations.get(value[1]);
        if (value[3] === 'phx_reply' && !operation) {
          const reply = value[4], principal = reply?.response;
          record({stage: 'channel.reply', ok: reply?.status === 'ok',
            nativeOperations: principal?.nativeOperations === true,
            legacyMode: principal?.securityMode === 'legacy-plaintext'});
        }
        if (operation && value[3] === 'phx_reply' && value[4]?.status === 'ok')
          replies.push({operation, reply: value[4].response, port: Number(new URL(socket.url()).port)});
      });
    });
    page.nativeFrames = trace;
    page.nativeReplies = replies;
    page.nativePort = port;
    await page.goto(fixture.origin);
    await page.evaluate(async ({account, port}) => {
      window.session = await (await fetch('/test-session?account=' + encodeURIComponent(account))).json();
      window.handshakeStages = [];
      const stage = value => {if (handshakeStages.length < 40) handshakeStages.push(value);};
      document.querySelector('[data-chat-read-user]').dataset.chatReadUser = session.username === 'alice' ? 'bob' : 'alice';
      const request = async (url, options = {}) => {
        const response = await fetch(url, {...options, signal: AbortSignal.timeout(15000)}), value = await response.json();
        if (url === '/api/messages/device') stage({stage: 'device', status: response.status,
          supported: value.supported === true, eventDelivery: value.eventDelivery === true,
          ownerMatches: value.username === session.username, hasDeviceId: !!value.deviceId});
        if (url === '/api/messages/transport-ticket') stage({stage: 'ticket', status: response.status,
          version: value.version === 1, hasTicket: typeof value.ticket === 'string'});
        if (!response.ok) throw Object.assign(new Error(value.code), {code: value.code, status: response.status});
        return value;
      };
      const options = {
        getSession: () => session, initialSync: false,
        deviceRequest: (method, payload) => request('/api/conversations/crypto/devices', {
          method, headers: {'Content-Type': 'application/json'}, ...(payload ? {body: JSON.stringify(payload)} : {})}),
        packageRequest: payload => request('/api/conversations/crypto/key-packages', {
          method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)}),
        operationRequest: payload => request('/api/conversations/encrypted/operations', {
          method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)})
      };
      if (port) {
        window.client = WingaModules.api.communications.createCommunicationsApiClient({
          baseUrl: '/api', getSession: () => session, fetchJson: request,
          getTransportConfig: () => ({phoenixTransportEnabled: true, phoenixAllUsers: true,
            phoenixTransportUrl: `ws://127.0.0.1:${port}/socket`}),
          getEventSource: () => class {addEventListener() {} close() {}}
        });
        const receipts = WingaModules.chat.createDeviceReceipts({owner: session.username, dataLayer: client, isCurrent: () => true});
        window.stream = client.openRealtimeChannel({isCurrent: () => true,
          onTransportState: value => stage({stage: 'transport', state: value.state, phase: value.phase}),
          onDeviceEvents: (batch, ack) => receipts.acceptEvents(batch, ack)});
        window.native = {
          inspect: peer => client.inspectEncryptedConversation(peer),
          enable: (peer, id, fingerprint) => client.enableEncryptedConversation(peer, id, fingerprint),
          sendMessage: payload => client.sendMessage(payload),
          retryMessage: id => client.retryEncryptedMessage(id),
          sync: () => client.inspectEncryptedConversation(session.username === 'alice' ? 'bob' : 'alice'),
          history: async peer => (await client.loadConversationPage(peer)).items,
          markRead: (peer, ids) => client.markConversationRead({withUser: peer, messageIds: ids})
        };
      } else window.native = await WingaEncryptionSession.createEncryptionSession(options);
      window.vault = await WingaEncryptedVault.createEncryptedVault({owner: session.username, getSession: () => session});
    }, {account, port});
    if (port) {
      try {await page.waitForFunction(() => client.hasDeviceEventStream(), {}, {timeout: 15000});}
      catch (error) {
        const browserState = await page.evaluate(() => ({
          sessionPresent: !!window.session?.username, hasSessionId: !!window.session?.sessionId,
          hasTransportModule: !!window.WingaModules?.api?.phoenix,
          hasSocketLibrary: !!window.Phoenix?.Socket, hasStream: !!window.stream,
          stages: window.handshakeStages || []
        })).catch(() => ({stage: 'page.unavailable'}));
        error.message += '\nNative fixture handshake: ' + JSON.stringify({
          account, origin: fixture.origin, port, handshake, browserState
        });
        throw error;
      }
    }
    return page;
  }
  const rows = async (table, id) => (await pool.query(`SELECT * FROM ${table} WHERE ${table === 'encrypted_conversation_messages' ? 'id' : 'message_id'}=$1`, [id])).rows;
  async function verify(proof, action, owner) {
    assert.equal(proof.action, action); assert.equal(proof.owner, owner);
    const device = (await pool.query('SELECT public_key,owner_id,status FROM conversation_crypto_devices WHERE id=$1', [proof.actorId])).rows[0];
    assert.equal(device.owner_id, owner); assert.equal(device.status, 'active');
    const key = crypto.createPublicKey({key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(device.public_key, 'base64url')
    ]), format: 'der', type: 'spki'});
    assert.equal(crypto.verify(null, operationBytes({owner, deviceId: proof.sessionId}, proof), key, Buffer.from(proof.signature, 'base64url')), true);
  }
  function socketCiphertext(page, id, original) {
    const messages = page.nativeReplies.filter(r => r.port === page.nativePort && r.operation.action === 'poll'
      && r.reply.version === 1 && r.reply.requestId === r.operation.requestId)
      .flatMap(r => r.reply.result?.groups || []).flatMap(g => g.messages).filter(m => m.id === id);
    assert.ok(messages.length, 'the assigned real socket must deliver the target ciphertext in phx_reply');
    for (const message of messages) {
      assert.equal(message.ciphertext, original.ciphertext);
      assert.equal(message.hash, original.hash);
      assert.deepEqual(message.proof, original.proof);
    }
  }
  try {
    const legacyCounts = async () => (await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM messages) AS messages,
      (SELECT COUNT(*)::int FROM message_device_receipts) AS receipts`)).rows[0];
    const legacyBefore = await legacyCounts();
    for (let n = 0; n < 2; n++) contexts.push(await browser.newContext());
    let sender = await pageFor(contexts[0], accounts.alice), receiver = await pageFor(contexts[1], accounts.bob);
    onProgress('verify native identities');
    const bobInfo = await receiver.evaluate(() => native.inspect('alice'));
    const aliceInfo = await sender.evaluate(() => native.inspect('bob'));
    const bobPackage = aliceInfo.packages.find(p => p.owner === 'bob');
    assert.equal(bobPackage.fingerprint, bobInfo.ownFingerprint);
    onProgress('invite native recipient');
    await sender.evaluate(p => native.enable('bob', p.deviceId, p.fingerprint), bobPackage);
    const invitation = await receiver.evaluate(() => native.inspect('alice'));
    const alicePackage = invitation.packages.find(p => p.owner === 'alice');
    assert.equal(alicePackage.fingerprint, aliceInfo.ownFingerprint);
    onProgress('accept native membership');
    await receiver.evaluate(p => native.enable('alice', p.deviceId, p.fingerprint), alicePackage);
    assert.equal((await sender.evaluate(() => native.inspect('bob'))).status, 'active');

    let liveText = '';
    if (onLoss) {
      assert.notEqual(sender.nativePort, receiver.nativePort, 'live native peers must use different BEAM nodes');
      const liveId = crypto.randomUUID();
      liveText = 'NATIVE LIVE CROSS NODE ' + crypto.randomUUID();
      onProgress('live ciphertext from node A to node B');
      const sent = await sender.evaluate(({id, text}) => native.sendMessage({
        clientMessageId: id, receiverId: 'bob', messageType: 'text', message: text
      }), {id: liveId, text: liveText});
      assert.equal(sent.id, liveId); assert.equal(sent.status, 'sent');
      const live = (await rows('encrypted_conversation_messages', liveId))[0];
      assert.ok(live);
      await verify(live.proof, 'send', 'alice');
      assert.ok(sender.nativeFrames.some(op => op.action === 'send' && op.payload.id === liveId),
        'the live cross-node send must originate on the actual Alice socket');
      assert.ok(sender.nativeReplies.some(r => r.port === sender.nativePort && r.operation.action === 'send'
        && r.operation.payload.id === liveId && r.reply.version === 1
        && r.reply.requestId === r.operation.requestId && r.reply.result?.id === liveId
        && r.reply.result.status === 'sent'), 'node A must confirm the canonical native send in phx_reply');
      assert.equal(fixture.requests.some(r => r.transport === 'HTTP' && r.operation.action === 'send'
        && r.operation.payload.id === liveId), false, 'the live send must not be accepted through HTTP recovery');
      await receiver.evaluate(() => native.sync());
      socketCiphertext(receiver, liveId, live);
      const decrypted = await receiver.evaluate(id => vault.lookup('history:' + id), liveId);
      assert.equal(decrypted.message, liveText); assert.equal(decrypted.hash, live.hash);
      assert.equal((await rows('encrypted_message_acceptances', liveId)).length, 1);
      const liveReceipts = await rows('encrypted_conversation_receipts', liveId);
      assert.equal(liveReceipts.length, 1); assert.equal(liveReceipts[0].kind, 'delivered');
      await verify(liveReceipts[0].proof, 'receipt', 'bob');
      const carriesLive = r => r.value.groups?.some(g => g.messages.some(m => m.id === liveId));
      assert.ok(fixture.responses.some(r => r.transport === 'Phoenix' && carriesLive(r)));
      assert.equal(fixture.responses.some(r => r.transport === 'HTTP' && carriesLive(r)), false,
        'live target ciphertext must not be delivered by HTTP fallback');
      await sender.evaluate(() => native.sync());
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM messages WHERE id=$1', [liveId])).rows[0].n, 0);
    }

    const text = 'NATIVE PRIVATE BEAM LOSS ' + crypto.randomUUID(), id = crypto.randomUUID();
    fixture.faults.loseSendReply = true;
    if (onLoss) fixture.faults.withholdDelivered = true;
    onProgress('send with lost accepted reply');
    const pending = await sender.evaluate(({id, text}) => native.sendMessage({clientMessageId: id, receiverId: 'bob', messageType: 'text', message: text}), {id, text});
    assert.equal(pending.id, id); assert.equal(pending.status, onLoss ? 'sent' : 'pending');
    const original = (await rows('encrypted_conversation_messages', id))[0];
    assert.ok(original, 'lost reply must follow a real committed native send');
    const send = fixture.requests.find(r => r.operation.action === 'send' && r.operation.payload.id === id).operation;
    if (onLoss) assert.ok(sender.nativeFrames.some(op => op.action === 'send' && op.requestId === send.requestId),
      'the actual browser client must send native ciphertext through Phoenix');
    assert.equal(original.ciphertext, send.payload.ciphertext);
    assert.equal(original.hash, crypto.createHash('sha256').update(Buffer.from(original.ciphertext, 'base64url')).digest('hex'));
    await verify(original.proof, 'send', 'alice');
    const accepted = await rows('encrypted_message_acceptances', id);
    assert.equal(accepted.length, 1); assert.equal(accepted[0].evidence_source, 'transaction');
    assert.equal(accepted[0].sequence, original.sequence);
    assert.equal(accepted[0].hash, original.hash);
    assert.equal(accepted[0].ciphertext_digest, crypto.createHash('sha256').update(original.ciphertext).digest('hex'));
    const lost = fixture.responses.find(r => r.lost);
    assert.equal(lost.value.status, 'sent'); assert.equal(lost.value.id, id);
    assert.equal((await rows('encrypted_conversation_receipts', id)).length, 0);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM message_device_receipts WHERE message_id=$1', [id])).rows[0].n, 0);
    const forbiddenReceipt = await sender.evaluate(async payload => {
      const identity = await WingaCryptoDevices.createCryptoDeviceClient({
        getSession: () => session, request: () => {throw new Error('Unexpected enrollment');}
      });
      try {
        const operation = await identity.signCryptoOperation('receipt', payload);
        const response = await fetch('/api/conversations/encrypted/operations', {
          method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(operation)
        });
        return {status: response.status, body: await response.json()};
      } finally {identity.close();}
    }, {id, conversationId: original.conversation_id, epoch: original.epoch, hash: original.hash, kind: 'delivered'});
    assert.equal(forbiddenReceipt.status, 403);
    assert.equal(forbiddenReceipt.body.code, 'encrypted_receipt_rejected');
    assert.equal((await rows('encrypted_conversation_receipts', id)).length, 0);

    if (onLoss) await onLoss('accepted-reply-lost', send);
    onProgress('retry after sender reload');
    await sender.close(); sender = await pageFor(contexts[0], accounts.alice);
    await sender.evaluate(id => native.retryMessage(id), id);
    assert.deepEqual(await rows('encrypted_conversation_messages', id), [original]);
    assert.deepEqual(await rows('encrypted_message_acceptances', id), accepted);
    assert.equal((await rows('encrypted_conversation_receipts', id)).length, 0);
    assert.ok(fixture.requests.filter(r => r.operation.action === 'send' && r.operation.payload.id === id).length >= 2);
    for (const retry of fixture.requests.filter(r => r.operation.action === 'send' && r.operation.payload.id === id))
      assert.deepEqual(retry.operation.payload, send.payload);

    fixture.faults.withholdDelivered = true;
    onProgress('decrypt with receipt withheld');
    await assert.rejects(receiver.evaluate(() => native.sync()), /fixture_receipt_withheld/);
    const persisted = await receiver.evaluate(id => vault.lookup('history:' + id), id);
    assert.equal(persisted.message, text); assert.equal(persisted.id, id);
    assert.equal(persisted.hash, original.hash);
    assert.equal((await rows('encrypted_conversation_receipts', id)).length, 0);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM encrypted_conversation_rejections WHERE message_id=$1', [id])).rows[0].n, 0);
    if (onLoss) await onLoss('persisted-receipt-withheld', send);

    await receiver.close(); receiver = await pageFor(contexts[1], accounts.bob);
    onProgress('replay after recipient reload');
    const replayBatches = () => fixture.responses.filter(r => r.value.groups?.some(g => g.messages.some(m => m.id === id)));
    const replayBefore = replayBatches().length;
    fixture.faults.withholdDelivered = false;
    await receiver.evaluate(() => native.sync());
    assert.ok(replayBatches().length > replayBefore, 'server must actually replay the unreceipted ciphertext');
    if (onLoss) {
      socketCiphertext(receiver, id, original);
      assert.ok(replayBatches().some(r => r.transport === 'Phoenix'),
        'the backend must return the target ciphertext through the native Phoenix adapter');
    }
    for (const batch of replayBatches()) for (const group of batch.value.groups)
      for (const message of group.messages.filter(m => m.id === id)) {
        assert.equal(message.ciphertext, original.ciphertext);
        assert.equal(message.hash, original.hash);
        assert.deepEqual(message.proof, original.proof);
      }
    const history = await receiver.evaluate(() => native.history('alice'));
    assert.equal(history.filter(m => m.id === id).length, 1); assert.equal(history.find(m => m.id === id).message, text);
    const delivered = await rows('encrypted_conversation_receipts', id);
    assert.equal(delivered.length, 1); assert.equal(delivered[0].kind, 'delivered');
    await verify(delivered[0].proof, 'receipt', 'bob');
    assert.equal(delivered[0].proof.payload.hash, original.hash);
    await sender.evaluate(() => native.sync());
    assert.equal((await sender.evaluate(() => native.history('bob'))).find(m => m.id === id).status, 'delivered');
    await receiver.bringToFront();
    onProgress('explicit visible Read');
    assert.equal(await receiver.evaluate(() => document.hasFocus() && document.visibilityState === 'visible'), true);
    await receiver.evaluate(id => native.markRead('alice', [id]), id);
    await sender.evaluate(() => native.sync());
    assert.equal((await sender.evaluate(() => native.history('bob'))).find(m => m.id === id).status, 'read');
    const receipts = await rows('encrypted_conversation_receipts', id);
    assert.deepEqual(receipts.map(r => r.kind).sort(), ['delivered', 'read']);
    for (const receipt of receipts) {
      await verify(receipt.proof, 'receipt', 'bob');
      assert.deepEqual(receipt.proof.payload, {id, conversationId: original.conversation_id,
        epoch: original.epoch, hash: original.hash, kind: receipt.kind});
    }
    const acknowledgments = await rows('encrypted_conversation_receipt_acks', id);
    assert.equal(acknowledgments.length, 2);
    for (const acknowledgment of acknowledgments) await verify(acknowledgment.proof, 'receipt-ack', 'alice');
    await receiver.evaluate(() => native.sync());
    assert.equal((await rows('encrypted_conversation_receipts', id)).length, 2);
    assert.deepEqual(await rows('encrypted_conversation_messages', id), [original]);
    assert.deepEqual(await rows('encrypted_message_acceptances', id), accepted);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM messages WHERE id=$1', [id])).rows[0].n, 0);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM message_device_receipts WHERE message_id=$1', [id])).rows[0].n, 0);
    assert.deepEqual(await legacyCounts(), legacyBefore, 'native operations must never create legacy messages or receipts');
    assert.equal(JSON.stringify({requests: fixture.requests, responses: fixture.responses, original, accepted, receipts}).includes(text), false);
    if (liveText) assert.equal(JSON.stringify({requests: fixture.requests, responses: fixture.responses}).includes(liveText), false);
    if (onLoss) {
      assert.ok(fixture.requests.some(r => r.transport === 'Phoenix' && r.operation.action === 'poll'));
      const recovery=fixture.requests.find(r => r.transport === 'HTTP' && r.operation.action === 'send'
        && r.operation.requestId===send.requestId);
      assert.ok(recovery, 'HTTP recovery must preserve the exact signed operation');
      assert.deepEqual(recovery.operation,send);
    }
    if (onSecurity) {
      const freshProof = page => page.evaluate(async () => {
        const identity = await WingaCryptoDevices.createCryptoDeviceClient({
          getSession: () => session, request: () => {throw new Error('Unexpected enrollment');}
        });
        try {return await identity.signCryptoOperation('poll', {});} finally {identity.close();}
      });
      await sender.evaluate(() => window.stream?.close());
      await receiver.evaluate(() => window.stream?.close());
      await onSecurity({alice: await freshProof(sender), bob: await freshProof(receiver)});
    }
    return {nativeTransport: onLoss ? 'Phoenix+HTTP-recovery' : 'HTTP', signedMls: true, canonicalCiphertext: true, decryptedBeforeReceipt: true,
      replayedAfterReload: true, explicitRead: true, beamLossPhases: onLoss ? 2 : 0, nativePhoenixSupported: !!onLoss,
      liveCrossNode: !!onLoss, nativeMessages: onLoss ? 2 : 1};
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
  }
};
