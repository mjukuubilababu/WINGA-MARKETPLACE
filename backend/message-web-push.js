const { createHash, randomUUID, ECDH } = require("node:crypto");
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
    WHERE p.owner_id=$1 AND s.expires_at>$2`, [message.receiverId, Date.now()]);
  for (const row of subscriptions.rows) {
    await client.query(`INSERT INTO web_push_jobs(id,subscription_id,owner_id,session_id,message_id)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(subscription_id,message_id) DO NOTHING`,
    [randomUUID(), row.id, message.receiverId, row.session_id, message.id]);
  }
}

function createMessageWebPushStore({ query, withTransaction, provider = webPush }) {
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

  async function resolveWebPush({ owner, token, sessionId, id }) {
    if (!validId(id)) throw reject(404);
    return withTransaction(async client => {
      await liveSession(client, owner, token, sessionId);
      const result = await client.query(`SELECT m.sender_id AS "withUser" FROM web_push_jobs j
        JOIN web_push_subscriptions p ON p.id=j.subscription_id AND p.session_id=j.session_id
        JOIN messages m ON m.id=j.message_id AND m.receiver_id=j.owner_id
        WHERE j.id=$1 AND j.owner_id=$2 AND j.session_id=$3 AND j.expires_at>NOW()
        AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE
          (b.blocker_username=m.sender_id AND b.blocked_username=$2) OR
          (b.blocker_username=$2 AND b.blocked_username=m.sender_id))`, [id, owner, sessionId]);
      if (!result.rows.length) throw reject(404);
      return result.rows[0];
    });
  }

  async function dispatchWebPushBatch() {
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
      const result = await query(`SELECT j.id,j.attempts,p.id AS subscription_id,p.subscription,p.locale
        FROM web_push_jobs j JOIN web_push_subscriptions p ON p.id=j.subscription_id
          AND p.session_id=j.session_id AND p.owner_id=j.owner_id
        JOIN sessions s ON s.session_id=j.session_id AND s.username=j.owner_id
        JOIN users u ON u.username=j.owner_id
        JOIN messages m ON m.id=j.message_id AND m.receiver_id=j.owner_id
        WHERE j.id=$1 AND j.lease_token=$2 AND s.expires_at>$3 AND u.status='active' AND NOT m.is_read
        AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE
          (b.blocker_username=m.sender_id AND b.blocked_username=j.owner_id) OR
          (b.blocker_username=j.owner_id AND b.blocked_username=m.sender_id))`, [job, lease, Date.now()]);
      const row = result.rows[0];
      let retry = false;
      if (row) {
        try {
          const keys = await identity();
          await provider.sendNotification(validateSubscription(row.subscription), JSON.stringify({ version: 1, id: job, locale: row.locale }), {
            vapidDetails: { subject: "https://wingamarket.com", publicKey: keys.public_key, privateKey: keys.private_key },
            TTL: 86400, timeout: 10000, urgency: "normal", topic: job.replace(/-/g, "")
          });
        } catch (error) {
          if ([404, 410].includes(error.statusCode)) {
            await query("DELETE FROM web_push_subscriptions WHERE id=$1 AND subscription=$2::jsonb", [row.subscription_id, JSON.stringify(row.subscription)]);
          } else {
            retry = row.attempts < 8 && error.status !== 400;
          }
        }
      }
      await query(`UPDATE web_push_jobs SET completed_at=CASE WHEN $3 THEN NULL ELSE NOW() END,
        next_attempt_at=NOW()+($4 * INTERVAL '1 second'),lease_token=NULL,lease_until=NULL
        WHERE id=$1 AND lease_token=$2`, [job, lease, retry, Math.min(3600, 30 * 2 ** Math.min(Number(row?.attempts || 1), 7))]);
    }
    return { ok: true };
  }
  return {
    async readWebPushConfig() { const keys = await identity(); return { supported: true, publicKey: keys.public_key }; },
    saveWebPush, removeWebPush, resolveWebPush, dispatchWebPushBatch
  };
}

module.exports = { createMessageWebPushStore, enqueueMessagePush, validateSubscription };
