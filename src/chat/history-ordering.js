(() => {
  const sequence = item => {
    const values = [item.sequence, item.conversationSequence].filter(value => value !== undefined);
    return values.length && values.every(value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value))
      && values.every(value => value === values[0]) ? values[0] : '';
  };
  const scope = item => JSON.stringify([
    item.encrypted === true || item.kind === 'shopping-room' || (typeof item.epoch === 'string' && item.deviceId) ? 'encrypted' : 'legacy',
    item.conversationId || [item.senderId || item.owner || '', item.receiverId || item.peer || ''].sort().join('/')
  ]);
  const time = value => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const fraction = String(value).match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1] || '';
    return date.toISOString().slice(0, 19) + '.' + fraction.padEnd(6, '0').slice(0, 6);
  };
  const compareTime = (a, b) => time(a.timestamp).localeCompare(time(b.timestamp))
    || String(a.id || a.lastMessageId || '').localeCompare(String(b.id || b.lastMessageId || ''));
  const compare = (a, b) => {
    // This pair comparison is for scoped cursors/latest records. Across streams,
    // use time only; do not use it as a general Array.sort comparator.
    if (scope(a) !== scope(b)) return compareTime(a, b);
    const x = sequence(a), y = sequence(b);
    const rank = (item, seq) => item.status === 'pending' ? 2 : seq ? 1 : 0;
    const category = rank(a, x) - rank(b, y);
    if (category) return category;
    if (a.status === 'pending') return compareTime(a, b);
    if (x && y) return x.length - y.length || x.localeCompare(y) || compareTime(a, b);
    return compareTime(a, b);
  };
  function order(items) {
    // Start from a deterministic chronological merge. Each stream retains its
    // slots, but its own rows use canonical sequence (and pending rows last).
    // This avoids a non-transitive pair comparator mixing sequence with time.
    const result = items.slice().sort(compareTime), streams = new Map();
    result.forEach((item, index) => {
      const key = scope(item);
      if (!streams.has(key)) streams.set(key, {indices: [], items: []});
      const stream = streams.get(key); stream.indices.push(index); stream.items.push(item);
    });
    for (const stream of streams.values()) {
      stream.items.sort(compare);
      stream.indices.forEach((index, offset) => { result[index] = stream.items[offset]; });
    }
    return result;
  }
  const api = {messageSequence: sequence, messageOrderScope: scope,
    compareConversationMessages: compare, orderConversationMessages: order};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.WingaModules = window.WingaModules || {};
    window.WingaModules.chat = window.WingaModules.chat || {};
    Object.assign(window.WingaModules.chat, api);
  }
})();
