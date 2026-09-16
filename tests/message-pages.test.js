const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { PGlite } = require("@electric-sql/pglite");
const { createMessagePagesStore, pageOptions } = require("../backend/message-pages");
let db, pages;
before(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY,full_name TEXT DEFAULT '',profile_image TEXT DEFAULT '');
    CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT);
    CREATE TABLE messages(id TEXT PRIMARY KEY,sender_id TEXT,receiver_id TEXT,conversation_id TEXT DEFAULT '',
      message TEXT DEFAULT '',message_type TEXT DEFAULT 'text',product_id TEXT DEFAULT '',product_name TEXT DEFAULT '',
      product_items JSONB DEFAULT '[]',reply_to_message_id TEXT DEFAULT '',timestamp TIMESTAMPTZ,
      is_read BOOLEAN DEFAULT FALSE,is_delivered BOOLEAN DEFAULT TRUE,read_at TIMESTAMPTZ,delivered_at TIMESTAMPTZ);
    INSERT INTO users(username,full_name) VALUES ('me','My name'),('a','Person A'),('b','Person B'),('outsider','Private');`);
  pages = createMessagePagesStore({ query: (sql, params) => db.query(sql, params) });
});
after(async () => db?.close());
beforeEach(async () => {
  await db.exec(`TRUNCATE messages,user_blocks;
    INSERT INTO messages(id,sender_id,receiver_id,message,product_id,timestamp,is_read) VALUES
    ('a1','a','me','First','p1','2026-09-16T10:00:00.000001Z',FALSE),
    ('a2','me','a','Reply','p2','2026-09-16T10:00:00.000002Z',FALSE),
    ('a3','a','me','Newest','p3','2026-09-16T10:00:00.000003Z',FALSE),
    ('b1','b','me','Other','p4','2026-09-16T10:00:00.000003Z',TRUE),
    ('secret','outsider','b','Must not leak','','2026-09-16T12:00:00Z',FALSE);`);
});

test('Inbox groups people across product contexts and preserves global unread totals on every page', async () => {
  const first = await pages.readInboxPage('me', { limit: 1 });
  assert.equal(first.items.length, 1);
  assert.equal(first.totalConversations, 2);
  assert.equal(first.totalUnread, 2);
  assert.equal(first.items[0].withUser, 'b');
  const second = await pages.readInboxPage('me', { limit: 1, cursor: first.nextCursor });
  assert.equal(second.items[0].withUser, 'a');
  assert.equal(second.items[0].latestMessage, 'Newest');
  assert.equal(second.items[0].unreadCount, 2);
  assert.equal(second.totalUnread, 2);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, '');
  assert(!JSON.stringify([first, second]).includes('Must not leak'));
});
test('History keeps microsecond precision and oldest-to-newest display within each bounded page', async () => {
  const first = await pages.readConversationPage('me', 'a', { limit: 2 });
  assert.deepEqual(first.items.map(m => m.id), ['a2','a3']);
  const second = await pages.readConversationPage('me', 'a', { limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map(m => m.id), ['a1']);
  assert.equal(second.hasMore, false);
});
test('Equal timestamps use stable message IDs without duplicates or skips', async () => {
  await db.exec(`UPDATE messages SET timestamp='2026-09-16T10:00:00Z' WHERE id LIKE 'a%';`);
  const ids = []; let cursor = '';
  do {
    const page = await pages.readConversationPage('me','a',{limit:1,cursor});
    ids.push(...page.items.map(m => m.id)); cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(ids,['a3','a2','a1']);
});
test('Both block directions hide history, summaries and unread totals', async () => {
  for (const pair of [['me','a'],['a','me']]) {
    await db.exec('TRUNCATE user_blocks');
    await db.query('INSERT INTO user_blocks VALUES($1,$2)',pair);
    const inbox = await pages.readInboxPage('me');
    assert.equal(inbox.totalUnread,0);
    assert.deepEqual(inbox.items.map(i=>i.withUser),['b']);
    assert.deepEqual((await pages.readConversationPage('me','a')).items,[]);
  }
});
test('Cursor is scoped to its owner and conversation, never an authorization substitute', async () => {
  const page = await pages.readConversationPage('me','a',{limit:1});
  await assert.rejects(pages.readConversationPage('outsider','a',{cursor:page.nextCursor}),{status:400});
  await assert.rejects(pages.readConversationPage('me','b',{cursor:page.nextCursor}),{status:400});
  await assert.rejects(pages.readInboxPage('me',{cursor:page.nextCursor}),{status:400});
  assert.deepEqual((await pages.readConversationPage('me','outsider')).items,[]);
});
test('Invalid limits, malformed cursors and invalid partners fail closed', async () => {
  for (const limit of [0,-1,51,1.5,'x','']) assert.throws(()=>pageOptions('me','inbox',{limit}),{status:400});
  for (const cursor of ['!', 'x'.repeat(1025),Buffer.from('{}').toString('base64url')]) {
    assert.throws(()=>pageOptions('me','inbox',{cursor}),{status:400});
  }
  for (const time of ['1','2026-02-30T10:00:00Z','2026-09-16T25:00:00Z']) {
    const cursor = Buffer.from(JSON.stringify({v:1,owner:'me',kind:'inbox',id:'a',time})).toString('base64url');
    assert.throws(()=>pageOptions('me','inbox',{cursor}),{status:400});
  }
  for (const partner of ['',null,'me','x'.repeat(41)]) await assert.rejects(pages.readConversationPage('me',partner),{status:400});
});
test('New messages between requests do not shift older history cursor boundaries', async () => {
  const first = await pages.readConversationPage('me','a',{limit:1});
  await db.exec(`INSERT INTO messages(id,sender_id,receiver_id,timestamp) VALUES('a4','a','me',NOW()); DELETE FROM messages WHERE id='a3';`);
  const next = await pages.readConversationPage('me','a',{limit:2,cursor:first.nextCursor});
  assert.deepEqual(next.items.map(m=>m.id),['a1','a2']);
});
test('Paging does not mark anything read or leak another pair history', async () => {
  await pages.readInboxPage('me'); await pages.readConversationPage('me','a');
  const rows = await db.query(`SELECT COUNT(*)::int AS n FROM messages WHERE receiver_id='me' AND NOT is_read`);
  assert.equal(rows.rows[0].n,2);
  const other = await pages.readConversationPage('outsider','a');
  assert.deepEqual(other.items,[]);
});
