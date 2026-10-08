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

test("conversation sequence orders large values and late SSE without comparing different inbox streams", async () => {
  const early = { ...message('early','2026-09-28T12:00:00Z'), conversationSequence: '9007199254740992' };
  const late = { ...message('late','2000-01-01T00:00:00Z'), conversationSequence: '9007199254740993' };
  const { pager } = setup({
    loadInboxPage: async () => page([{ ...summary('another','unrelated','2026-09-28T13:00:00Z'), conversationSequence: '1' }]),
    loadConversationPage: async (_user, options) => { assert.equal(options.order, 'sequence'); return page([late,early]); }
  });
  await pager.refreshInbox();
  await pager.refreshHistory('other');
  assert.deepEqual(Array.from(pager.history('other').items, item => item.id), ['early','late']);
  pager.ingest({ ...message('newest','1999-01-01T00:00:00Z'), conversationSequence: '9007199254740995' });
  pager.ingest({ ...message('delayed','2026-09-28T14:00:00Z'), conversationSequence: '9007199254740994' });
  assert.deepEqual(Array.from(pager.history('other').items, item => item.id), ['early','late','delayed','newest']);
  assert.equal(pager.snapshot().inbox.items.find(row=>row.withUser==='other').lastMessageId, 'newest');
  assert.equal(pager.snapshot().inbox.items[0].withUser, 'another');
});

test("switching history order discards the old extended cursor before sequence paging", async () => {
  let count = 0;
  const { pager } = setup({ loadInboxPage: async () => page([]), loadConversationPage: async () => {
    count++;
    if (count === 1) return page([message('legacy-head')], 'time-older');
    if (count === 2) return page([message('legacy-tail')], 'time-oldest');
    return { ...page([{ ...message('new-head'), conversationSequence:'30' }], 'sequence-older'), order:'sequence' };
  } });
  await pager.refreshInbox();
  await pager.refreshHistory('other');
  await pager.loadOlder('other');
  assert.equal(pager.history('other').nextCursor, 'time-oldest');
  await pager.refreshHistory('other');
  assert.equal(pager.history('other').nextCursor, 'sequence-older');
  assert.deepEqual(Array.from(pager.history('other').items, item=>item.id), ['new-head']);
});

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

test("encrypted-only refresh failure retains saved encrypted conversations without retaining removed legacy rows",async()=>{
  let count=0;
  const encrypted={...summary('encrypted-peer','saved',message('saved').timestamp),encrypted:true};
  const {pager}=setup({loadInboxPage:async()=>++count===1?page([encrypted,summary('removed-legacy','old',message('old').timestamp)]):
    { ...page([]),encryptedSyncError:count===2 }});
  await pager.refreshInbox();
  pager.requestResync();
  await pager.refreshInbox();
  assert.equal(pager.snapshot().inbox.error,false);
  assert.equal(pager.snapshot().inbox.encryptedSyncError,true);
  assert.deepEqual(Array.from(pager.snapshot().inbox.items,item=>item.withUser),['encrypted-peer']);
  await pager.refreshInbox();
  assert.equal(pager.snapshot().inbox.encryptedSyncError,false);
  assert.equal(pager.snapshot().inbox.items.length,0);
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

test("complete canonical pages remove deleted older messages and conversations", async () => {
  let remaining = false;
  const { pager } = setup({
    loadInboxPage: async () => page(remaining ? [summary("other", "z", message("z").timestamp)] : [summary("gone", "a", message("a").timestamp), summary("other", "z", message("z").timestamp)]),
    loadConversationPage: async () => page(remaining ? [message("z")] : [message("a"), message("z")])
  });
  await pager.refreshInbox(); await pager.refreshHistory("other");
  remaining = true;
  await pager.refreshInbox(); await pager.refreshHistory("other");
  assert.deepEqual(Array.from(pager.snapshot().inbox.items, item => item.withUser), ["other"]);
  assert.deepEqual(Array.from(pager.history("other").items, item => item.id), ["z"]);
});

test("resync replaces extended pages only after success and restores canonical older cursor", async () => {
  let fail = false;
  const { pager } = setup({
    loadInboxPage: async options => {
      if (fail) throw new Error("offline");
      return options.cursor ? page([summary("old", "a", message("a").timestamp)]) : page([summary("other", "z", message("z").timestamp)], "people-next");
    },
    loadConversationPage: async (_user, options) => {
      if (fail) throw new Error("offline");
      return options.cursor ? page([message("a")]) : page([message("z")], "history-next");
    }
  });
  await pager.refreshInbox(); await pager.loadMore();
  await pager.refreshHistory("other"); await pager.loadOlder("other");
  pager.requestResync(); fail = true;
  await assert.rejects(pager.refreshInbox(), /offline/);
  await assert.rejects(pager.refreshHistory("other"), /offline/);
  assert.equal(pager.snapshot().inbox.items.length, 2);
  assert.equal(pager.history("other").items.length, 2);
  fail = false;
  await pager.refreshInbox(); await pager.refreshHistory("other");
  assert.deepEqual(Array.from(pager.snapshot().inbox.items, item => item.withUser), ["other"]);
  assert.deepEqual(Array.from(pager.history("other").items, item => item.id), ["z"]);
  assert.equal(pager.snapshot().inbox.nextCursor, "people-next");
  assert.equal(pager.history("other").nextCursor, "history-next");
  await pager.loadOlder("other");
  assert.equal(pager.history("other").items.length, 2);
});

test("resync waits out stale in-flight pages and performs a fresh canonical read", async () => {
  const wait = deferred(); let count = 0;
  const { pager } = setup({
    loadInboxPage: async () => page([]),
    loadConversationPage: async () => ++count === 1 ? wait.promise : page([message("fresh")])
  });
  await pager.refreshInbox();
  const old = pager.refreshHistory("other");
  pager.requestResync();
  const fresh = pager.refreshHistory("other");
  wait.resolve(page([message("deleted")]));
  await Promise.all([old, fresh]);
  assert.equal(count, 2);
  assert.deepEqual(Array.from(pager.history("other").items, item => item.id), ["fresh"]);
});

test("SSE racing authoritative resync preserves instant message and refuses stale success", async () => {
  const wait = deferred();
  const { pager } = setup({ loadInboxPage: async () => page([]), loadConversationPage: () => wait.promise });
  await pager.refreshInbox();
  pager.history("other"); pager.requestResync();
  const pending = pager.refreshHistory("other");
  pager.ingest(message("instant"));
  wait.resolve(page([]));
  await assert.rejects(pending, /MESSAGE_RESYNC_CHANGED/);
  assert.equal(pager.history("other").items[0].id, "instant");
  assert.equal(pager.history("other").needsResync, true);
});
test('trusted local pending updates reconcile immediately without refresh or unread growth',async()=>{
  const {pager}=setup({loadInboxPage:async()=>page([])});
  await pager.refreshInbox();pager.history('other');
  const pending={id:'local',senderId:'me',receiverId:'other',conversationId:'c',message:'immutable',encrypted:true,status:'pending',waiting:true,timestamp:'2026-10-08T12:00:00Z'};
  pager.upsertLocal(pending);
  pager.upsertLocal({...pending,waiting:false});
  assert.equal(pager.history('other').items[0].waiting,false);
  pager.upsertLocal({...pending,status:'sent',waiting:false,hash:'a'.repeat(64),conversationSequence:'2'});
  assert.equal(pager.history('other').items[0].status,'sent');
  pager.upsertLocal({...pending,message:'changed'});
  pager.upsertLocal(pending);
  assert.equal(pager.history('other').items[0].status,'sent');
  assert.equal(pager.history('other').items[0].message,'immutable');
  assert.equal(pager.snapshot().totalUnread,0);assert.equal(pager.history('other').items.length,1);
});
