const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../src/chat/pagination.js"), "utf8");
const message = (id, timestamp = "2026-09-16T10:00:00.000Z") => ({ id, timestamp, senderId: "other", receiverId: "me", message: id });
const summary = (withUser, id, timestamp) => ({ withUser, lastMessageId: id, latestMessage: id, timestamp, unreadCount: 1 });
const page = (items, nextCursor = "", totalUnread = 0) => ({ items, nextCursor, hasMore: Boolean(nextCursor), totalUnread, totalConversations: items.length });
function setup(api = {}) {
  const context = { window: {} };
  vm.runInNewContext(source, context);
  let user = "me";
  const pager = context.window.WingaModules.chat.createMessagePagination({ getUser: () => user, dataLayer: api });
  return { pager, setUser: value => { user = value; } };
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test("summary load is bounded and does not request conversation history", async () => {
  let histories = 0;
  const { pager } = setup({ loadInboxPage: async options => {
    assert.equal(options.limit, 25);
    return page([summary("other", "1", message("1").timestamp)], "next", 42);
  }, loadConversationPage: async () => { histories++; return page([]); } });
  await pager.refreshInbox();
  assert.equal(histories, 0);
  assert.equal(pager.snapshot().totalUnread, 42);
  assert.equal(pager.snapshot().inbox.hasMore, true);
});

test("unsupported backend falls back but transient failure retains retry state", async () => {
  const { pager } = setup({ loadInboxPage: async () => { throw Object.assign(new Error(), { code: "message_pagination_unavailable" }); } });
  assert.equal(await pager.refreshInbox(), false);
  assert.equal(pager.snapshot().mode, "legacy");
  const failed = setup({ loadInboxPage: async () => { throw Object.assign(new Error("offline"), { status: 503 }); } }).pager;
  await assert.rejects(failed.refreshInbox(), /offline/);
  assert.equal(failed.snapshot().mode, "unknown");
  assert.equal(failed.snapshot().inbox.error, true);
});

test("history merges IDs, preserves microsecond ordering and older cursor on refresh", async () => {
  let count = 0;
  const newer = message("a", "2026-09-16T10:00:00.000002Z");
  const older = message("z", "2026-09-16T10:00:00.000001Z");
  const { pager } = setup({ loadInboxPage: async () => page([]), loadConversationPage: async (_user, options) => {
    count++;
    if (count === 2) { assert.equal(options.cursor, "older"); return page([older, newer], "oldest"); }
    return page([newer], "older");
  } });
  await pager.refreshInbox();
  await pager.refreshHistory("other");
  await pager.loadOlder("other");
  await pager.refreshHistory("other");
  assert.deepEqual(Array.from(pager.history("other").items, item => item.id), ["z", "a"]);
  assert.equal(pager.history("other").nextCursor, "oldest");
});

test("late summaries cannot erase SSE message and duplicate event increments unread once", async () => {
  const wait = deferred(); let count = 0;
  const { pager } = setup({ loadInboxPage: async () => ++count === 1 ? page([]) : wait.promise });
  await pager.refreshInbox();
  const pending = pager.refreshInbox();
  pager.ingest(message("new"));
  pager.ingest(message("new"));
  wait.resolve(page([]));
  await pending;
  assert.equal(pager.snapshot().totalUnread, 1);
  assert.equal(pager.snapshot().inbox.items[0].lastMessageId, "new");
});

test("late history cannot erase an instant message", async () => {
  const wait = deferred();
  const { pager } = setup({ loadInboxPage: async () => page([]), loadConversationPage: () => wait.promise });
  await pager.refreshInbox();
  const pending = pager.refreshHistory("other");
  pager.ingest(message("new"));
  wait.resolve(page([]));
  await pending;
  assert.equal(pager.history("other").items[0].id, "new");
});

test("logout reset rejects stale result even when same user signs in again", async () => {
  const wait = deferred();
  const { pager } = setup({ loadInboxPage: () => wait.promise });
  const pending = pager.refreshInbox();
  pager.reset();
  wait.resolve(page([summary("secret", "1", message("1").timestamp)], "", 8));
  await pending;
  assert.equal(pager.snapshot().inbox.items.length, 0);
  assert.equal(pager.snapshot().totalUnread, 0);
});

test("account switch isolates paged state", async () => {
  const wait = deferred();
  const { pager, setUser } = setup({ loadInboxPage: () => wait.promise });
  const pending = pager.refreshInbox();
  setUser("different");
  wait.resolve(page([summary("secret", "1", message("1").timestamp)]));
  await pending;
  assert.equal(pager.snapshot().inbox.items.length, 0);
});

test("load-more deduplicates people and repeated cursor terminates pagination", async () => {
  let calls = 0;
  const entry = summary("other", "1", message("1").timestamp);
  const { pager } = setup({ loadInboxPage: async () => { calls++; return page([entry], "same"); } });
  await pager.refreshInbox();
  await pager.loadMore();
  await pager.loadMore();
  assert.equal(pager.snapshot().inbox.items.length, 1);
  assert.equal(pager.snapshot().inbox.hasMore, false);
  assert.equal(calls, 2);
});

test("concurrent history requests coalesce and retained histories stay bounded", async () => {
  const wait = deferred(); let calls = 0;
  const { pager } = setup({ loadInboxPage: async () => page([]), loadConversationPage: () => { calls++; return wait.promise; } });
  await pager.refreshInbox();
  const one = pager.refreshHistory("other"), two = pager.refreshHistory("other");
  wait.resolve(page([message("one")]));
  await Promise.all([one, two]);
  assert.equal(calls, 1);
  for (let i = 0; i < 20; i++) pager.history("person-" + i);
  assert.equal(pager.snapshot().histories.size, 8);
});

test("same-time older SSE must not replace newer preview", async () => {
  const { pager } = setup({ loadInboxPage: async () => page([summary("other", "z", message("z").timestamp)]) });
  await pager.refreshInbox();
  pager.ingest(message("a"));
  assert.equal(pager.snapshot().inbox.items[0].lastMessageId, "z");
});

