const { createHash, createHmac, randomUUID, ECDH } = require("node:crypto");
const webPush = require("web-push");

const reject = (status = 400) => Object.assign(new Error("Push request rejected."), { status });
const validId = value => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);

function validateSubscription(value) {
  if (!value || typeof value.endpoint !== "string" || value.endpoint.length > 4096) throw reject();
  let endpoint;
  try { endpoint = new URL(value.endpoint); } catch { throw reject(); }
  const host = endpoint.hostname;
  const trusted = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(host)
    || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if (!trusted || endpoint.protocol !== "https:" || endpoint.port || endpoint.username || endpoint.password || endpoint.hash) throw reject();
  const keys = {};
  for (const [name, size] of [["p256dh", 65], ["auth", 16]]) {
    const key = value.keys?.[name];
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]+$/.test(key) || Buffer.from(key, "base64url").length !== size) throw reject();
    keys[name] = key;
  }
  try { ECDH.convertKey(Buffer.from(keys.p256dh, "base64url"), "prime256v1"); } catch { throw reject(); }
  return { endpoint: endpoint.href, keys };
}

async function enqueueMessagePush(client, message) {
  const subscriptions = await client.query(`SELECT p.id,p.session_id FROM web_push_subscriptions p
    JOIN sessions s ON s.session_id=p.session_id AND s.username=p.owner_id
    WHERE p.owner_id=$1 AND s.expires_at>$2
      AND NOT EXISTS(SELECT 1 FROM ${message.roomId?'encrypted_room_preferences':'conversation_notification_preferences'} n
        WHERE n.owner_id=p.owner_id AND n.${message.roomId?'conversation_id':'peer_id'}=$3 AND n.muted)
    ORDER BY p.id FOR SHARE OF p`, [message.receiverId, Date.now(), message.roomId || message.senderId || null]);
  for (const row of subscriptions.rows) {
    await client.query(`INSERT INTO web_push_jobs(id,subscription_id,owner_id,session_id,message_id)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(subscription_id,message_id) DO NOTHING`,
    [randomUUID(), row.id, message.receiverId, row.session_id, message.id]);
  }
}

function createMessageWebPushStore({ query, withTransaction, provider = webPush, encrypted = false, roomsEnabled=false }) {
  const encryptedRows=`
    SELECT m.id,d.owner_id AS sender_id,CASE WHEN d.owner_id=g.creator THEN g.recipient ELSE g.creator END AS receiver_id,
      EXISTS(SELECT 1 FROM encrypted_conversation_receipts r WHERE r.message_id=m.id AND r.kind='read') AS is_read,NULL::text AS room_id
    FROM encrypted_conversation_messages m JOIN encrypted_conversations g ON g.id=m.conversation_id
    JOIN conversation_crypto_devices d ON d.id=m.sender_device AND d.status='active'
    JOIN conversation_crypto_devices a ON a.id=g.creator_device AND a.status='active'
    JOIN conversation_crypto_devices b ON b.id=g.recipient_device AND b.status='active'
    JOIN users ca ON ca.username=g.creator AND ca.status='active'
    JOIN users cb ON cb.username=g.recipient AND cb.status='active' WHERE g.status='active'
    ${roomsEnabled?`UNION ALL SELECT DISTINCT m.id,s.owner_id,old.owner_id,
      EXISTS(SELECT 1 FROM encrypted_conversation_receipts r JOIN conversation_crypto_devices d ON d.id=r.device_id
        WHERE r.message_id=m.id AND r.kind='read' AND d.owner_id=old.owner_id),g.id
      FROM encrypted_conversation_messages m JOIN encrypted_conversations g ON g.id=m.conversation_id AND g.kind='shopping-room' AND g.status='active'
      JOIN conversation_crypto_devices s ON s.id=m.sender_device AND s.status='active'
      JOIN encrypted_conversation_epoch_devices old ON old.conversation_id=g.id AND old.epoch=m.epoch AND old.owner_id<>s.owner_id
      JOIN encrypted_conversation_epoch_devices live ON live.conversation_id=g.id AND live.epoch=g.epoch AND live.owner_id=old.owner_id
      JOIN conversation_crypto_devices d ON d.id=live.device_id AND d.status='active'
      JOIN users u ON u.username=old.owner_id AND u.status='active'
      WHERE NOT EXISTS(SELECT 1 FROM encrypted_room_transitions t WHERE t.conversation_id=g.id AND t.status<>'accepted')
      AND EXISTS(SELECT 1 FROM conversation_event_members member WHERE member.conversation_id=g.canonical_id AND member.owner_id=old.owner_id)
      AND NOT EXISTS(SELECT 1 FROM user_blocks b JOIN conversation_event_members x ON x.owner_id=b.blocker_username AND x.conversation_id=g.canonical_id
        JOIN conversation_event_members y ON y.owner_id=b.blocked_username AND y.conversation_id=g.canonical_id)`:''}
  `;
  const legacyRows='SELECT id,sender_id,receiver_id,is_read,NULL::text AS room_id FROM messages';
  const sources=`WITH push_messages AS (${legacyRows}${encrypted?` UNION ALL ${encryptedRows}`:''})`;
  const encryptedSources=`WITH push_messages AS (${encryptedRows})`;
  let identityPromise;
  function identity() {
    if (!identityPromise) identityPromise = (async () => {
      let result = await query("SELECT public_key,private_key FROM web_push_identity WHERE singleton=TRUE");
      if (!result.rows.length) {
        const keys = provider.generateVAPIDKeys();
        await query(`INSERT INTO web_push_identity(singleton,public_key,private_key) VALUES(TRUE,$1,$2)
          ON CONFLICT(singleton) DO NOTHING`, [keys.publicKey, keys.privateKey]);
        result = await query("SELECT public_key,private_key FROM web_push_identity WHERE singleton=TRUE");
      }
      return result.rows[0];
    })().catch(error => { identityPromise = null; throw error; });
    return identityPromise;
  }

  async function liveSession(client, owner, token, sessionId) {
    const result = await client.query(`SELECT s.session_id FROM sessions s JOIN users u ON u.username=s.username
      WHERE s.token=$1 AND s.username=$2 AND s.session_id=$3 AND s.expires_at>$4 AND u.status='active'
      FOR SHARE OF s,u`, [token, owner, sessionId, Date.now()]);
    if (!result.rows.length) throw reject(401);
  }

  async function saveWebPush({ owner, token, sessionId, payload }) {
    const subscription = validateSubscription(payload?.subscription);
    const id = createHash("sha256").update(subscription.endpoint).digest("hex");
    const locale = ["sw", "en", "fr", "ar"].includes(payload.locale) ? payload.locale : "sw";
    return withTransaction(async client => {
      await liveSession(client, owner, token, sessionId);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`winga-push-owner:${owner}`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`winga-push:${id}`]);
      const previous = await client.query(`SELECT p.owner_id FROM web_push_subscriptions p
        JOIN sessions s ON s.session_id=p.session_id AND s.username=p.owner_id
        WHERE p.id=$1 AND s.expires_at>$2`, [id, Date.now()]);
      if (previous.rows.some(row => row.owner_id !== owner)) throw reject(409);
      const count = await client.query("SELECT COUNT(*)::int AS total FROM web_push_subscriptions WHERE owner_id=$1 AND id<>$2", [owner, id]);
      if (count.rows[0].total >= 20) throw reject(409);
      // Rebinding never replays a previous session's pending notification.
      await client.query("DELETE FROM web_push_jobs WHERE subscription_id=$1 AND session_id<>$2", [id, sessionId]);
      await client.query(`INSERT INTO web_push_subscriptions(id,owner_id,session_id,subscription,locale)
        VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(id) DO UPDATE SET owner_id=EXCLUDED.owner_id,
        session_id=EXCLUDED.session_id,subscription=EXCLUDED.subscription,locale=EXCLUDED.locale,updated_at=NOW()`,
      [id, owner, sessionId, JSON.stringify(subscription), locale]);
      return { ok: true };
    });
  }

  async function removeWebPush({ owner, token, sessionId }) {
    return withTransaction(async client => {
      await liveSession(client, owner, token, sessionId);
      await client.query("DELETE FROM web_push_subscriptions WHERE owner_id=$1 AND session_id=$2", [owner, sessionId]);
      return { ok: true };
    });
  }

  function mutePeer(payload,owner,sessionId) {
    if(!payload || payload.owner!==owner || payload.sessionId!==sessionId || typeof payload.peer!=='string'
      || !payload.peer || payload.peer.length>40 || payload.peer.trim()!==payload.peer || /[\u0000-\u001f\u007f]/.test(payload.peer)
      || payload.peer===owner)throw reject();
    return payload.peer;
  }
  async function readMute(client,owner,peer) {
    const result=await client.query(`SELECT row_version::text AS revision, muted
      FROM conversation_notification_preferences WHERE owner_id=$1 AND peer_id=$2`,[owner,peer]);
    const row=result.rows[0];
    return row?{revision:row.revision,muted:row.muted}:{revision:'0',muted:false};
  }
  async function readConversationMute({owner,token,sessionId,payload}) {
    const peer=mutePeer(payload,owner,sessionId);
    return withTransaction(async client=>{await liveSession(client,owner,token,sessionId);return readMute(client,owner,peer);});
  }
  async function saveConversationMute({owner,token,sessionId,payload}) {
    const peer=mutePeer(payload,owner,sessionId);
    if(Object.keys(payload).sort().join(',')!=='muted,owner,peer,revision,sessionId' || typeof payload.muted!=='boolean' || typeof payload.revision!=='string'
      || !/^(0|[1-9][0-9]{0,15})$/.test(payload.revision))throw reject();
    return withTransaction(async client=>{
      await liveSession(client,owner,token,sessionId);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`winga-conversation-preferences:${owner}`]);
      const before=await readMute(client,owner,peer);if(before.revision!==payload.revision)throw reject(409);
      const user=await client.query('SELECT username FROM users WHERE username=$1',[peer]);if(!user.rows.length)throw reject(404);
      if(before.revision==='0') {
        const count=await client.query('SELECT COUNT(*)::int AS total FROM conversation_notification_preferences WHERE owner_id=$1',[owner]);
        if(count.rows[0].total>=5000)throw reject(409);
      }
      await client.query(`INSERT INTO conversation_notification_preferences(owner_id,peer_id,muted)
        VALUES($1,$2,$3)
        ON CONFLICT(owner_id,peer_id) DO UPDATE SET muted=EXCLUDED.muted,
          row_version=conversation_notification_preferences.row_version+1,updated_at=NOW()`,
        [owner,peer,payload.muted]);
      if(payload.muted)await client.query(`${sources} UPDATE web_push_jobs j SET completed_at=NOW(),lease_token=NULL,lease_until=NULL
        FROM push_messages m WHERE j.owner_id=$1 AND j.message_id=m.id AND m.sender_id=$2 AND m.receiver_id=$1 AND m.room_id IS NULL AND j.completed_at IS NULL`,[owner,peer]);
      return readMute(client,owner,peer);
    });
  }

  async function resolveWebPush({ owner, token, sessionId, id }) {
    if (!validId(id)) throw reject(404);
    return withTransaction(async client => {
      await liveSession(client, owner, token, sessionId);
      const result = await client.query(`${sources} SELECT m.sender_id AS "withUser",m.room_id AS "roomId" FROM web_push_jobs j
        JOIN web_push_subscriptions p ON p.id=j.subscription_id AND p.session_id=j.session_id
        JOIN push_messages m ON m.id=j.message_id AND m.receiver_id=j.owner_id
        WHERE j.id=$1 AND j.owner_id=$2 AND j.session_id=$3 AND j.expires_at>NOW()
        AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE
          (b.blocker_username=m.sender_id AND b.blocked_username=$2) OR
          (b.blocker_username=$2 AND b.blocked_username=m.sender_id))`, [id, owner, sessionId]);
      if (!result.rows.length) throw reject(404);
      const target=result.rows[0];return target.roomId?target:{withUser:target.withUser};
    });
  }

  async function readArchive(client,owner,peer) {
    const result=await client.query(`SELECT row_version::text AS revision, archived
      FROM conversation_notification_preferences WHERE owner_id=$1 AND peer_id=$2`,[owner,peer]);
    const row=result.rows[0];
    return row?{revision:row.revision,archived:row.archived}:{revision:'0',archived:false};
  }
  async function readConversationArchives({owner,token,sessionId,payload}) {
    if(!payload || Object.keys(payload).sort().join(',')!=='owner,sessionId'
      || payload.owner!==owner || payload.sessionId!==sessionId)throw reject();
    return withTransaction(async client=>{
      await liveSession(client,owner,token,sessionId);
      const result=await client.query(`SELECT peer_id AS peer FROM conversation_notification_preferences
        WHERE owner_id=$1 AND archived ORDER BY peer_id LIMIT 5001`,[owner]);
      if(result.rows.length>5000)throw reject(409);
      return {peers:result.rows.map(row=>row.peer)};
    });
  }
  async function readConversationArchive({owner,token,sessionId,payload}) {
    const peer=mutePeer(payload,owner,sessionId);
    return withTransaction(async client=>{await liveSession(client,owner,token,sessionId);return readArchive(client,owner,peer);});
  }
  async function saveConversationArchive({owner,token,sessionId,payload}) {
    const peer=mutePeer(payload,owner,sessionId);
    if(Object.keys(payload).sort().join(',')!=='archived,owner,peer,revision,sessionId'
      || typeof payload.archived!=='boolean' || typeof payload.revision!=='string'
      || !/^(0|[1-9][0-9]{0,15})$/.test(payload.revision))throw reject();
    return withTransaction(async client=>{
      await liveSession(client,owner,token,sessionId);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`winga-conversation-preferences:${owner}`]);
      const before=await readArchive(client,owner,peer);if(before.revision!==payload.revision)throw reject(409);
      const user=await client.query('SELECT username FROM users WHERE username=$1',[peer]);if(!user.rows.length)throw reject(404);
      if(before.revision==='0') {
        const count=await client.query('SELECT COUNT(*)::int AS total FROM conversation_notification_preferences WHERE owner_id=$1',[owner]);
        if(count.rows[0].total>=5000)throw reject(409);
      }
      await client.query(`INSERT INTO conversation_notification_preferences(owner_id,peer_id,archived)
        VALUES($1,$2,$3) ON CONFLICT(owner_id,peer_id) DO UPDATE SET archived=EXCLUDED.archived,
          row_version=conversation_notification_preferences.row_version+1,updated_at=NOW()`,[owner,peer,payload.archived]);
      return readArchive(client,owner,peer);
    });
  }

  async function reconcileEncryptedPush() {
    if(!encrypted)return {queued:0};
    return withTransaction(async client=>{
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '1s'");
      await client.query('DELETE FROM encrypted_message_push_outbox WHERE expires_at<NOW()');
      const batch=(await client.query(`SELECT message_id FROM encrypted_message_push_outbox
        WHERE next_attempt_at<=NOW() ORDER BY next_attempt_at,created_at,message_id LIMIT 25 FOR UPDATE SKIP LOCKED`)).rows;
      let queued=0;
      for(const item of batch){
        // A freeze is temporary, not permission to drop an accepted message's work.
        const frozen=(await client.query(`SELECT 1 FROM encrypted_conversation_messages m JOIN encrypted_conversations g ON g.id=m.conversation_id
          WHERE m.id=$1 AND (EXISTS(SELECT 1 FROM encrypted_conversation_replacements r WHERE r.conversation_id=g.id AND r.status<>'accepted')
            OR EXISTS(SELECT 1 FROM encrypted_conversation_device_admissions a WHERE a.conversation_id=g.id AND a.status<>'accepted')
            ${roomsEnabled?`OR EXISTS(SELECT 1 FROM encrypted_room_transitions t WHERE t.conversation_id=g.id AND t.status<>'accepted')`:''})`,[item.message_id])).rows.length;
        if(frozen){
          await client.query("UPDATE encrypted_message_push_outbox SET next_attempt_at=NOW()+INTERVAL '30 seconds' WHERE message_id=$1",[item.message_id]);
          continue;
        }
        const targets=(await client.query(`${encryptedSources} SELECT DISTINCT id,sender_id,receiver_id,room_id FROM push_messages
          WHERE id=$1 AND NOT is_read`,[item.message_id])).rows;
        for(const target of targets)await enqueueMessagePush(client,{id:target.id,senderId:target.sender_id,
          receiverId:target.receiver_id,...(target.room_id?{roomId:target.room_id}:{})});
        await client.query('DELETE FROM encrypted_message_push_outbox WHERE message_id=$1',[item.message_id]);queued++;
      }
      return {queued};
    });
  }

  async function dispatchWebPushBatch() {
    const outcome = { accepted: 0, retrying: 0, rejected: 0, skipped: 0, lastProviderStatus: 0 };
    await reconcileEncryptedPush();
    await query("DELETE FROM web_push_jobs WHERE expires_at<NOW()");
    await query(`DELETE FROM web_push_subscriptions p WHERE NOT EXISTS
      (SELECT 1 FROM sessions s WHERE s.session_id=p.session_id AND s.username=p.owner_id AND s.expires_at>$1)`, [Date.now()]);
    for (let index = 0; index < 5; index += 1) {
      const lease = randomUUID();
      const job = await withTransaction(async client => {
        const result = await client.query(`SELECT id FROM web_push_jobs WHERE completed_at IS NULL
          AND next_attempt_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW()) AND expires_at>NOW()
          ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1`);
        if (!result.rows.length) return null;
        const id = result.rows[0].id;
        await client.query(`UPDATE web_push_jobs SET lease_token=$2,lease_until=NOW()+INTERVAL '60 seconds',
          attempts=attempts+1 WHERE id=$1`, [id, lease]);
        return id;
      });
      if (!job) break;
      const result = await query(`${sources} SELECT j.id,j.attempts,j.owner_id,m.sender_id,m.room_id,p.id AS subscription_id,p.subscription,p.locale
        FROM web_push_jobs j JOIN web_push_subscriptions p ON p.id=j.subscription_id
          AND p.session_id=j.session_id AND p.owner_id=j.owner_id
        JOIN sessions s ON s.session_id=j.session_id AND s.username=j.owner_id
        JOIN users u ON u.username=j.owner_id
        JOIN push_messages m ON m.id=j.message_id AND m.receiver_id=j.owner_id
        WHERE j.id=$1 AND j.lease_token=$2 AND s.expires_at>$3 AND u.status='active' AND NOT m.is_read
        AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE
          (b.blocker_username=m.sender_id AND b.blocked_username=j.owner_id) OR
          (b.blocker_username=j.owner_id AND b.blocked_username=m.sender_id))
        AND NOT EXISTS(SELECT 1 FROM conversation_notification_preferences n WHERE n.owner_id=j.owner_id
          AND m.room_id IS NULL AND n.peer_id=m.sender_id AND n.muted)
        ${roomsEnabled?`AND NOT EXISTS(SELECT 1 FROM encrypted_room_preferences n WHERE n.owner_id=j.owner_id
          AND n.conversation_id=m.room_id AND n.muted)`:''}`, [job, lease, Date.now()]);
      const row = result.rows[0];
      let retry = false;
      if (row) {
        try {
          const keys = await identity();
          // Opaque grouping; owner/peer identifiers never enter provider payloads.
          const topic=createHmac('sha256',keys.private_key).update(JSON.stringify(['winga-alert-v1',row.owner_id,row.room_id?'room:'+row.room_id:row.sender_id])).digest('base64url').slice(0,32);
          await provider.sendNotification(validateSubscription(row.subscription), JSON.stringify({ version: 1, id: job, locale: row.locale, group:topic }), {
            vapidDetails: { subject: "https://wingamarket.com", publicKey: keys.public_key, privateKey: keys.private_key },
            TTL: 86400, timeout: 10000, urgency: "high", topic
          });
          outcome.accepted += 1;
        } catch (error) {
          const status = Number(error.statusCode || error.status || 0);
          outcome.lastProviderStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
          if ([404, 410].includes(status)) {
            await query("DELETE FROM web_push_subscriptions WHERE id=$1 AND subscription=$2::jsonb", [row.subscription_id, JSON.stringify(row.subscription)]);
          } else {
            retry = row.attempts < 8 && ![400, 413].includes(status);
          }
          outcome[retry ? "retrying" : "rejected"] += 1;
        }
      } else outcome.skipped += 1;
      await query(`UPDATE web_push_jobs SET completed_at=CASE WHEN $3 THEN NULL ELSE NOW() END,
        next_attempt_at=NOW()+($4 * INTERVAL '1 second'),lease_token=NULL,lease_until=NULL
        WHERE id=$1 AND lease_token=$2`, [job, lease, retry, Math.min(3600, 30 * 2 ** Math.min(Number(row?.attempts || 1), 7))]);
    }
    return { ok: true, ...outcome };
  }
  return {
    async readWebPushConfig() { const keys = await identity(); return { supported: true, publicKey: keys.public_key }; },
    saveWebPush, removeWebPush, resolveWebPush, dispatchWebPushBatch,reconcileEncryptedPush,readConversationMute,saveConversationMute,
    readConversationArchive,saveConversationArchive,readConversationArchives
  };
}

module.exports = { createMessageWebPushStore, enqueueMessagePush, validateSubscription };
