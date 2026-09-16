const MAX_LIMIT = 50;

function pageOptions(owner, kind, options = {}) {
  const limit = options.limit === undefined ? 25 : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw Object.assign(new Error("Invalid page size"), { status: 400 });
  let cursor = null;
  if (options.cursor) {
    try {
      if (typeof options.cursor !== "string" || options.cursor.length > 1024) throw new Error();
      cursor = JSON.parse(Buffer.from(options.cursor, "base64url").toString("utf8"));
      if (cursor.v !== 1 || cursor.owner !== owner || cursor.kind !== kind
        || typeof cursor.time !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(cursor.time)
        || !Number.isFinite(Date.parse(cursor.time))
        || new Date(cursor.time).toISOString().slice(0,19) !== cursor.time.slice(0,19)
        || typeof cursor.id !== "string" || !cursor.id || cursor.id.length > 160) throw new Error();
    } catch { throw Object.assign(new Error("Invalid message cursor"), { status: 400 }); }
  }
  return { limit, cursor };
}

function pageResult(owner, kind, rows, limit) {
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  const last = selected[selected.length - 1];
  const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({
    v: 1, owner, kind, time: last.cursorTime, id: last.cursorId
  })).toString("base64url") : "";
  return { items: selected.map(({ cursorTime, cursorId, ...item }) => item), hasMore, nextCursor, limit };
}

function createMessagePagesStore({ query }) {
  const visible = `WITH visible AS (
    SELECT m.*, CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END AS partner
    FROM messages m WHERE (m.sender_id = $1 OR m.receiver_id = $1)
      AND NOT EXISTS (SELECT 1 FROM user_blocks b
        WHERE (b.blocker_username = $1 AND b.blocked_username = CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END)
           OR (b.blocked_username = $1 AND b.blocker_username = CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END))
  )`;

  async function readInboxPage(owner, options = {}) {
    const { limit, cursor } = pageOptions(owner, "inbox", options);
    // One SQL snapshot supplies both the visible page and global unread totals.
    const result = await query(`${visible}, ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY partner ORDER BY timestamp DESC, id DESC) AS position,
        COUNT(*) FILTER (WHERE receiver_id = $1 AND NOT is_read) OVER (PARTITION BY partner)::int AS unread
      FROM visible
    ), summaries AS (SELECT * FROM ranked WHERE position = 1), page AS (
      SELECT s.partner AS "withUser", COALESCE(u.full_name, '') AS "displayName",
        COALESCE(u.profile_image, '') AS "profileImage", s.id AS "lastMessageId",
        s.message AS "latestMessage", s.product_id AS "productId", s.product_name AS "productName",
        s.unread AS "unreadCount", s.timestamp,
        to_char(s.timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime",
        s.partner AS "cursorId"
      FROM summaries s LEFT JOIN users u ON u.username = s.partner
      WHERE ($2::timestamptz IS NULL OR (s.timestamp, s.partner) < ($2::timestamptz, $3::text))
      ORDER BY s.timestamp DESC, s.partner DESC LIMIT $4
    ) SELECT COALESCE((SELECT jsonb_agg(p ORDER BY p.timestamp DESC, p."withUser" DESC) FROM page p), '[]'::jsonb) AS items,
      (SELECT COALESCE(SUM(unread),0)::int FROM summaries) AS "totalUnread",
      (SELECT COUNT(*)::int FROM summaries) AS "totalConversations"`, [owner, cursor?.time || null, cursor?.id || null, limit + 1]);
    const row = result.rows[0];
    return { ...pageResult(owner, "inbox", row.items, limit), totalUnread: row.totalUnread, totalConversations: row.totalConversations };
  }

  async function readConversationPage(owner, withUser, options = {}) {
    if (typeof withUser !== "string" || !withUser.trim() || withUser.length > 40 || withUser === owner) {
      throw Object.assign(new Error("Invalid conversation participant"), { status: 400 });
    }
    const kind = `history:${withUser}`;
    const { limit, cursor } = pageOptions(owner, kind, options);
    const result = await query(`${visible}
      SELECT id, sender_id AS "senderId", receiver_id AS "receiverId", conversation_id AS "conversationId",
        message, message_type AS "messageType", product_id AS "productId", product_name AS "productName",
        product_items AS "productItems", reply_to_message_id AS "replyToMessageId", timestamp,
        is_read AS "isRead", is_delivered AS "isDelivered", read_at AS "readAt", delivered_at AS "deliveredAt",
        to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTime", id AS "cursorId"
      FROM visible WHERE partner = $2
        AND ($3::timestamptz IS NULL OR (timestamp, id) < ($3::timestamptz, $4::text))
      ORDER BY timestamp DESC, id DESC LIMIT $5`, [owner, withUser, cursor?.time || null, cursor?.id || null, limit + 1]);
    const page = pageResult(owner, kind, result.rows, limit);
    return { ...page, items: page.items.reverse() };
  }
  return { readInboxPage, readConversationPage };
}

module.exports = { createMessagePagesStore, pageOptions };
