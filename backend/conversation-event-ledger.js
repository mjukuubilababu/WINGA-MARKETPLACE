const reject = (status = 400) => Object.assign(new Error("Conversation event request rejected."), { status });
const MAX_BATCH = 50;
const fields = `m.id,m.sender_id AS "senderId",m.receiver_id AS "receiverId",
  m.conversation_id AS "conversationId",m.conversation_sequence::text AS "conversationSequence",
  m.message,m.message_type AS "messageType",m.product_id AS "productId",m.product_name AS "productName",
  m.product_items AS "productItems",m.reply_to_message_id AS "replyToMessageId",m.timestamp,
  m.is_read AS "isRead",m.is_delivered AS "isDelivered",m.read_at AS "readAt",m.delivered_at AS "deliveredAt"`;
const eventFields = `e.id,e.conversation_id AS "conversationId",e.position::text AS sequence,
  e.membership_version::text AS "membershipVersion",e.kind,e.message_id AS "messageId",
  e.revision::text AS revision,e.created_at AS "createdAt"`;
const allowed = `NOT c.blocked AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE
  (b.blocker_username=c.participant_low AND b.blocked_username=c.participant_high)
  OR (b.blocker_username=c.participant_high AND b.blocked_username=c.participant_low)
  OR (COALESCE(to_jsonb(c)->>'kind','direct')='shopping-room'
    AND EXISTS(SELECT 1 FROM conversation_event_members x WHERE x.conversation_id=c.id AND x.owner_id=b.blocker_username)
    AND EXISTS(SELECT 1 FROM conversation_event_members y WHERE y.conversation_id=c.id AND y.owner_id=b.blocked_username)))`;

function validateEventIds(payload, deviceId) {
  if (!payload || payload.deviceId !== deviceId || !Array.isArray(payload.eventIds)
    || !payload.eventIds.length || payload.eventIds.length > MAX_BATCH
    || payload.eventIds.some(id => typeof id !== "string" || !/^[a-f0-9]{32}:[1-9][0-9]{0,18}$/.test(id))) throw reject();
  return [...new Set(payload.eventIds)];
}

function createConversationEventStore({ withTransaction }) {
  async function protectedVisibility(client,sessionParameter='$1',ownerParameter='$2') {
    const schema=(await client.query(`SELECT to_regclass('conversation_crypto_session_bindings') IS NOT NULL
      AND to_regclass('conversation_crypto_devices') IS NOT NULL AND to_regclass('encrypted_conversation_epoch_devices') IS NOT NULL
      AND to_regclass('encrypted_conversations') IS NOT NULL AS ready`)).rows[0];
    const legacy=`COALESCE(to_jsonb(c)->>'security_mode','legacy-plaintext')='legacy-plaintext'`;
    if(!schema.ready)return `(${legacy})`;
    return `(${legacy} OR EXISTS(SELECT 1 FROM conversation_crypto_session_bindings binding
      JOIN conversation_crypto_devices native ON native.id=binding.crypto_device_id AND native.owner_id=binding.owner_id AND native.status='active'
      JOIN encrypted_conversations secure ON secure.canonical_id=c.id AND secure.status='active'
      JOIN encrypted_conversation_epoch_devices epoch ON epoch.conversation_id=secure.id AND epoch.epoch=secure.epoch
        AND epoch.device_id=native.id AND epoch.owner_id=binding.owner_id
      WHERE binding.session_id=${sessionParameter} AND binding.owner_id=${ownerParameter}))`;
  }
  async function authorize(client, { owner, token, deviceId }) {
    if (!owner || !token || !deviceId) throw reject(401);
    const session = await client.query(`SELECT s.session_id FROM sessions s JOIN users u ON u.username=s.username
      WHERE s.token=$1 AND s.username=$2 AND s.session_id=$3 AND s.expires_at>$4 AND u.status='active'
      FOR SHARE OF s`, [token, owner, deviceId, Date.now()]);
    if (!session.rows.length) throw reject(401);
  }
  async function enroll(client, context) {
    await authorize(client, context);
    await client.query(`INSERT INTO conversation_delivery_devices(device_id,owner_id) VALUES($1,$2)
      ON CONFLICT(device_id) DO NOTHING`, [context.deviceId, context.owner]);
    const device = await client.query(`SELECT 1 FROM conversation_delivery_devices
      WHERE device_id=$1 AND owner_id=$2 AND revoked_at IS NULL`, [context.deviceId, context.owner]);
    if (!device.rows.length) throw reject(401);
  }
  async function registerConversationDevice(context) {
    return withTransaction(async client => {
      await enroll(client, context);
      return { supported: true, version: 1, deviceId: context.deviceId };
    });
  }

  async function pollConversationDeviceEvents(context) {
    return withTransaction(async client => {
      await enroll(client, context);
      const visibility=await protectedVisibility(client);
      // Bounded catch-up also covers first login, lost fan-out and an old binary.
      // No global cursor: concurrent conversations can commit in different orders.
      const seeded = await client.query(`INSERT INTO conversation_device_deliveries(device_id,event_id,owner_id)
        SELECT $1,e.id,$2 FROM conversation_events e
        JOIN conversation_event_members p ON p.conversation_id=e.conversation_id AND p.owner_id=$2
        JOIN conversation_event_streams c ON c.id=e.conversation_id
        LEFT JOIN conversation_device_progress progress
          ON progress.device_id=$1 AND progress.conversation_id=e.conversation_id
        WHERE ${allowed} AND ${visibility} AND e.position>=p.joined_position
          AND e.position>COALESCE(progress.acknowledged_position,0) AND NOT EXISTS(
          SELECT 1 FROM conversation_device_deliveries d WHERE d.device_id=$1 AND d.event_id=e.id)
        ORDER BY e.conversation_id,e.position LIMIT 100 ON CONFLICT DO NOTHING`, [context.deviceId, context.owner]);
      const result = await client.query(`SELECT ${eventFields},s.deleted AS tombstone,
        COALESCE(s.revision,0)::text AS "currentRevision"
        FROM conversation_device_deliveries d JOIN conversation_events e ON e.id=d.event_id
        JOIN conversation_event_members p ON p.conversation_id=e.conversation_id AND p.owner_id=$2
        JOIN conversation_event_streams c ON c.id=e.conversation_id
        LEFT JOIN conversation_message_state s ON s.message_id=e.message_id
        WHERE d.device_id=$1 AND d.owner_id=$2 AND d.acknowledged_at IS NULL AND d.cancelled_at IS NULL
          AND ${allowed} AND ${visibility} AND e.position>=p.joined_position
        ORDER BY e.conversation_id,e.position LIMIT 51 FOR SHARE OF c`, [context.deviceId, context.owner]);
      const events = result.rows.slice(0, MAX_BATCH);
      if (events.length) await client.query(`UPDATE conversation_device_deliveries
        SET offered_at=NOW(),attempts=LEAST(attempts,2147483646)+1
        WHERE device_id=$1 AND event_id=ANY($2::text[]) AND acknowledged_at IS NULL AND cancelled_at IS NULL`,
      [context.deviceId, events.map(event => event.id)]);
      const ids = [...new Set(events.filter(event => event.messageId && !event.tombstone).map(event => event.messageId))];
      const messages = ids.length ? await client.query(`SELECT ${fields} FROM messages m
        JOIN conversation_message_state s ON s.message_id=m.id AND NOT s.deleted
        JOIN conversation_event_streams c ON c.id=s.conversation_id
        WHERE m.id=ANY($1::text[]) AND (m.sender_id=$2 OR m.receiver_id=$2) AND ${allowed}`, [ids, context.owner]) : { rows: [] };
      return { version: 1, deviceId: context.deviceId, events, items: messages.rows,
        hasMore: result.rows.length > MAX_BATCH || seeded.rowCount === 100 };
    });
  }

  async function acknowledgeConversationDeviceEvents(context, payload) {
    const ids = validateEventIds(payload, context.deviceId);
    return withTransaction(async client => {
      await authorize(client, context);
      const device = await client.query(`SELECT 1 FROM conversation_delivery_devices
        WHERE device_id=$1 AND owner_id=$2 AND revoked_at IS NULL`, [context.deviceId, context.owner]);
      if (!device.rows.length) throw reject(401);
      const visibility=await protectedVisibility(client);
      const result = await client.query(`SELECT e.id,e.conversation_id,c.position::text AS stream_head
        FROM conversation_events e
        JOIN conversation_event_members p ON p.conversation_id=e.conversation_id AND p.owner_id=$2
        JOIN conversation_event_streams c ON c.id=e.conversation_id
        LEFT JOIN conversation_device_deliveries d ON d.device_id=$1 AND d.event_id=e.id AND d.owner_id=$2
        LEFT JOIN conversation_device_progress progress ON progress.device_id=$1 AND progress.conversation_id=e.conversation_id
        WHERE e.id=ANY($3::text[]) AND e.position>=p.joined_position AND ${allowed} AND ${visibility}
          AND ((d.offered_at IS NOT NULL AND d.cancelled_at IS NULL)
            OR progress.acknowledged_position>=e.position)
        ORDER BY e.conversation_id,e.position FOR SHARE OF c`, [context.deviceId, context.owner, ids]);
      if (result.rows.length !== ids.length) throw reject(409);
      await client.query(`UPDATE conversation_device_deliveries SET acknowledged_at=COALESCE(acknowledged_at,NOW())
        WHERE device_id=$1 AND event_id=ANY($2::text[])`, [context.deviceId, ids]);
      const heads = new Map();
      for (const event of result.rows) {
        heads.set(event.conversation_id,event.stream_head);
      }
      for (const [conversationId,head] of [...heads].sort(([a],[b])=>a.localeCompare(b))) {
        await client.query(`INSERT INTO conversation_device_progress(device_id,conversation_id)
          VALUES($1,$2) ON CONFLICT DO NOTHING`, [context.deviceId,conversationId]);
        const cursor = (await client.query(`SELECT acknowledged_position::text AS position
          FROM conversation_device_progress WHERE device_id=$1 AND conversation_id=$2 FOR UPDATE`,
        [context.deviceId,conversationId])).rows[0].position;
        if (BigInt(head) <= BigInt(cursor)) continue;
        const gap = await client.query(`SELECT e.position::text AS position FROM conversation_events e
          LEFT JOIN conversation_device_deliveries d ON d.device_id=$1 AND d.event_id=e.id
          WHERE e.conversation_id=$2 AND e.position>$3::bigint AND e.position<=$4::bigint
            AND (d.acknowledged_at IS NULL OR d.cancelled_at IS NOT NULL)
          ORDER BY e.position LIMIT 1`, [context.deviceId,conversationId,cursor,head]);
        const position = gap.rows.length ? (BigInt(gap.rows[0].position)-1n).toString() : head;
        if (BigInt(position)>BigInt(cursor)) await client.query(`UPDATE conversation_device_progress
          SET acknowledged_position=$3::bigint WHERE device_id=$1 AND conversation_id=$2`,
        [context.deviceId,conversationId,position]);
      }
      // A queue ACK is not a Stored/Read receipt. Those still require exact messages.
      return { ok: true, acknowledged: ids.length };
    });
  }

  async function pruneAcknowledgedConversationDeliveries(options = {}) {
    const retentionDays = Number(options.retentionDays ?? 30);
    const batchSize = Number(options.batchSize ?? 200);
    if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 365
      || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw reject();
    return withTransaction(async client => {
      const result = await client.query(`WITH candidates AS (
        SELECT d.device_id,d.event_id FROM conversation_device_deliveries d
        JOIN conversation_events e ON e.id=d.event_id
        JOIN conversation_device_progress p ON p.device_id=d.device_id AND p.conversation_id=e.conversation_id
        WHERE d.acknowledged_at IS NOT NULL AND d.cancelled_at IS NULL
          AND d.acknowledged_at<NOW()-$1::int*INTERVAL '1 day'
          AND e.position<=p.acknowledged_position
        ORDER BY d.acknowledged_at LIMIT $2::int FOR UPDATE OF d SKIP LOCKED
      ) DELETE FROM conversation_device_deliveries d USING candidates c
        WHERE d.device_id=c.device_id AND d.event_id=c.event_id`, [retentionDays,batchSize]);
      return { pruned: result.rowCount, retentionDays };
    });
  }

  async function readConversationEvents(context, options = {}) {
    const partner = options.withUser;
    if (typeof partner !== "string" || !/^[a-z0-9._-]{3,40}$/i.test(partner) || partner === context.owner) throw reject();
    const limit = options.limit === undefined ? 25 : Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH) throw reject();
    return withTransaction(async client => {
      await authorize(client, context);
      const visibility=await protectedVisibility(client,'$3','$1');
      const result = await client.query(`SELECT c.id,c.position::text AS head,c.membership_version::text AS version
        FROM conversation_event_streams c JOIN conversation_event_members p ON p.conversation_id=c.id AND p.owner_id=$1
        WHERE c.participant_low=LEAST($1::text,$2::text) AND c.participant_high=GREATEST($1::text,$2::text)
          AND ${allowed} AND ${visibility} AND $3::text IS NOT NULL FOR SHARE OF c`, [context.owner, partner,context.deviceId]);
      if (!result.rows.length) throw reject(404);
      const stream = result.rows[0];
      let position = "0", oldVersion = stream.version;
      if (options.cursor) {
        try {
          if (typeof options.cursor !== "string" || options.cursor.length > 1024) throw reject();
          const c = JSON.parse(Buffer.from(options.cursor,"base64url").toString("utf8"));
          if (c.v!==1 || c.owner!==context.owner || c.conversation!==stream.id
            || typeof c.position!=="string" || !/^(0|[1-9][0-9]{0,18})$/.test(c.position)
            || BigInt(c.position)>BigInt(stream.head)) throw reject();
          position=c.position; oldVersion=c.membershipVersion;
        } catch { throw reject(); }
      }
      const page = await client.query(`SELECT ${eventFields} FROM conversation_events e
        WHERE e.conversation_id=$1 AND e.position>$2::bigint AND e.position<=$3::bigint
        ORDER BY e.position LIMIT $4`, [stream.id,position,stream.head,limit+1]);
      const events = page.rows.slice(0,limit);
      const cursor = Buffer.from(JSON.stringify({ v:1,owner:context.owner,conversation:stream.id,
        membershipVersion:stream.version,position:events.at(-1)?.sequence || position })).toString("base64url");
      return { version:1,conversationId:stream.id,head:stream.head,membershipVersion:stream.version,
        events,cursor,hasMore:page.rows.length>limit,accessChanged:oldVersion!==stream.version };
    });
  }
  return { registerConversationDevice,pollConversationDeviceEvents,acknowledgeConversationDeviceEvents,
    pruneAcknowledgedConversationDeliveries,readConversationEvents };
}
module.exports = { createConversationEventStore,validateEventIds };
