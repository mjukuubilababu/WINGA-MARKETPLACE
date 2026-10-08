const PREFIX = 'WINGA-ROOM/1\n';
const MAX_BYTES = 12000, MAX_EVENTS = 100000;
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const identifier = v => typeof v === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(v);
const decimal = v => typeof v === 'string' && /^[1-9][0-9]{0,18}$/.test(v);
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
const text = (v, max) => typeof v === 'string' && v.length <= max && !/[\u0000]/.test(v);
const instant = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const need = (ok, code = 'room_content_invalid') => { if (!ok) throw Object.assign(new Error(code), {code}); };
const bytes = v => new TextEncoder().encode(v).length;

export function validateRoomContent(value) {
  need(exact(value, ['version','type','data']) && value.version === 1);
  const d = value.data;
  switch (value.type) {
    case 'order-reference': need(exact(d, ['orderId']) && identifier(d.orderId)); break;
    case 'product-share':
      need(exact(d, ['productId','note','snapshot']) && identifier(d.productId) && text(d.note, 2048));
      need(d.snapshot === null || exact(d.snapshot, ['name','currency','unitPriceMinor'])
        && text(d.snapshot.name, 256) && /^[A-Z]{3}$/.test(d.snapshot.currency)
        && Number.isSafeInteger(d.snapshot.unitPriceMinor) && d.snapshot.unitPriceMinor >= 0);
      break;
    case 'product-remove': need(exact(d, ['shareId']) && uuid(d.shareId)); break;
    case 'shortlist': need(exact(d, ['shareId','selected']) && uuid(d.shareId) && typeof d.selected === 'boolean'); break;
    case 'poll-create':
      need(exact(d, ['question','options','closesAt']) && text(d.question, 512) && d.question.trim()
        && (d.closesAt === null || instant(d.closesAt)) && Array.isArray(d.options)
        && d.options.length >= 2 && d.options.length <= 8);
      need(d.options.every(o => exact(o, ['id','label']) && uuid(o.id) && text(o.label, 160) && o.label.trim())
        && new Set(d.options.map(o => o.id)).size === d.options.length);
      break;
    case 'poll-vote': need(exact(d, ['pollId','optionId']) && uuid(d.pollId) && (d.optionId === null || uuid(d.optionId))); break;
    case 'poll-close': need(exact(d, ['pollId']) && uuid(d.pollId)); break;
    case 'seller-question': need(exact(d,['questionId','shareId','productId','sellerId','question'])&&uuid(d.questionId)&&uuid(d.shareId)
      &&identifier(d.productId)&&identifier(d.sellerId)&&text(d.question,2048)&&d.question.trim());break;
    case 'seller-response': need(exact(d,['questionId','answerId','answer'])&&uuid(d.questionId)&&uuid(d.answerId)&&text(d.answer,2048)&&d.answer.trim());break;
    default: need(false);
  }
  need(bytes(JSON.stringify(value)) <= MAX_BYTES);
  return structuredClone(value);
}
export function encodeRoomContent(type, data) {
  return PREFIX + JSON.stringify(validateRoomContent({version:1, type, data}));
}
export function parseRoomContent(message) {
  if (typeof message !== 'string' || !message.startsWith(PREFIX) || bytes(message) > MAX_BYTES + PREFIX.length) return null;
  try { return validateRoomContent(JSON.parse(message.slice(PREFIX.length))); } catch { return null; }
}

// Only decrypted, sender-verified native history belongs here. Server packets,
// optimistic outbox entries and a current roster are not historical membership evidence.
export function projectRoomContent(history, {conversationId, epochs, now = Date.now(), maxEvents = MAX_EVENTS, sellerEvidence = new Map()} = {}) {
  need(uuid(conversationId) && epochs instanceof Map && Number.isSafeInteger(now)
    && Number.isInteger(maxEvents) && maxEvents >= 1 && maxEvents <= MAX_EVENTS, 'room_projection_invalid');
  need(Array.isArray(history) && history.length <= maxEvents, 'room_history_limit');
  const unique = new Map(), sequences = new Map(), checkedEpochs = new Set();
  for (const item of history) {
    need(item?.kind === 'shopping-room' && item.conversationId === conversationId && uuid(item.id)
      && decimal(item.epoch) && identifier(item.owner) && uuid(item.deviceId), 'room_history_binding_rejected');
    if (item.status === 'pending') continue;
    need(['sent','delivered','read'].includes(item.status) && decimal(item.sequence) && instant(item.timestamp)
      && typeof item.message === 'string' && bytes(item.message) <= 16384, 'room_history_binding_rejected');
    const roster = epochs.get(item.epoch);
    if (!checkedEpochs.has(item.epoch)) {
      need(Array.isArray(roster) && roster.length >= 2 && roster.length <= 64, 'room_history_membership_required');
      const ids = new Set(), roles = new Map(), counts = new Map();
      for (const m of roster) {
        need(exact(m,['owner','id','role']) && identifier(m.owner) && uuid(m.id) && ['admin','member'].includes(m.role)
          && !ids.has(m.id) && (!roles.has(m.owner) || roles.get(m.owner) === m.role), 'room_history_membership_required');
        ids.add(m.id);roles.set(m.owner,m.role);counts.set(m.owner,(counts.get(m.owner)||0)+1);
      }
      need(roles.size >= 2 && roles.size <= 32 && [...roles.values()].includes('admin') && [...counts.values()].every(n=>n<=4), 'room_history_membership_required');
      checkedEpochs.add(item.epoch);
    }
    need(Array.isArray(roster) && roster.some(m => m.owner === item.owner && m.id === item.deviceId
      && ['admin','member'].includes(m.role)), 'room_history_membership_required');
    // Receipt status may advance independently. It cannot change the authored content.
    const binding = JSON.stringify([item.conversationId,item.epoch,item.owner,item.deviceId,item.sequence,item.timestamp,item.message]);
    const prior = unique.get(item.id);
    need(!prior || prior.binding === binding, 'room_history_replay_conflict');
    need(!sequences.has(item.sequence) || sequences.get(item.sequence) === item.id, 'room_history_sequence_conflict');
    unique.set(item.id, {item, binding}); sequences.set(item.sequence, item.id);
  }
  const sorted = [...unique.values()].map(v => v.item).sort((a,b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1);
  const products = new Map(), polls = new Map(), questions = new Map(), orders = new Map(), rejected = [];
  const role = item => epochs.get(item.epoch).find(m => m.owner === item.owner && m.id === item.deviceId)?.role;
  const before = (target, item) => target && BigInt(target.sequence) < BigInt(item.sequence);
  for (const item of sorted) {
    const c = parseRoomContent(item.message);
    if (!c) {
      if (item.message.startsWith(PREFIX)) rejected.push({id:item.id, code:'room_content_invalid'});
      continue;
    }
    const d = c.data;
    if (c.type === 'order-reference') {
      const reference = orders.get(d.orderId) || {orderId:d.orderId,referenceId:item.id,sharedBy:new Set()};
      reference.sharedBy.add(item.owner);orders.set(d.orderId,reference);
    } else if (c.type === 'product-share') {
      products.set(item.id, {shareId:item.id,productId:d.productId,note:d.note,historicalSnapshot:d.snapshot,
        owner:item.owner,sequence:item.sequence,removed:false,selections:new Map()});
    } else if (c.type === 'product-remove' || c.type === 'shortlist') {
      const target = products.get(d.shareId);
      if (!before(target,item) || target.removed || c.type === 'product-remove' && target.owner !== item.owner && role(item) !== 'admin') {
        rejected.push({id:item.id,code:'room_product_operation_rejected'}); continue;
      }
      if (c.type === 'product-remove') target.removed = true;
      else target.selections.set(item.owner, d.selected);
    } else if (c.type === 'poll-create') {
      if (d.closesAt !== null && Date.parse(d.closesAt) <= Date.parse(item.timestamp)) {
        rejected.push({id:item.id,code:'room_poll_deadline_rejected'}); continue;
      }
      polls.set(item.id, {id:item.id,owner:item.owner,sequence:item.sequence,question:d.question,
        options:d.options,closesAt:d.closesAt,closedAt:null,ballots:new Map()});
    } else if(c.type==='seller-question'||c.type==='seller-response') {
      const evidence=sellerEvidence.get(d.questionId),q=evidence?.question;
      if(c.type==='seller-question'){
        const share=products.get(d.shareId);
        if(!q||!before(share,item)||q.buyerId!==item.owner||q.productId!==d.productId||share.productId!==d.productId
          ||q.shareId!==d.shareId||q.sellerId!==d.sellerId||evidence.questionText!==d.question||questions.has(d.questionId)){
          rejected.push({id:item.id,code:'room_seller_evidence_required'});continue;}
        questions.set(d.questionId,{...d,messageId:item.id,owner:item.owner,sequence:item.sequence,answer:null});
      }else{
        const target=questions.get(d.questionId);
        if(!before(target,item)||target.owner!==item.owner||target.answer||evidence?.answer?.messageId!==d.answerId||evidence.answerText!==d.answer){
          rejected.push({id:item.id,code:'room_seller_evidence_required'});continue;}
        target.answer={id:d.answerId,sharedMessageId:item.id,text:d.answer,sellerId:q.sellerId,sharedBy:item.owner};
      }
    } else {
      const poll = polls.get(d.pollId);
      if (!before(poll,item) || poll.closedAt !== null || poll.closesAt !== null && Date.parse(item.timestamp) >= Date.parse(poll.closesAt)
        || c.type === 'poll-close' && poll.owner !== item.owner && role(item) !== 'admin'
        || c.type === 'poll-vote' && d.optionId !== null && !poll.options.some(o => o.id === d.optionId)) {
        rejected.push({id:item.id,code:'room_poll_operation_rejected'}); continue;
      }
      if (c.type === 'poll-close') poll.closedAt = item.timestamp;
      else if (d.optionId === null) poll.ballots.delete(item.owner);
      else poll.ballots.set(item.owner, d.optionId);
    }
  }
  return {
    conversationId,
    orders:[...orders.values()].map(o=>({orderId:o.orderId,referenceId:o.referenceId,sharedBy:[...o.sharedBy].sort()})),
    sellerQuestions:[...questions.values()].map(q=>structuredClone(q)),
    products:[...products.values()].filter(p => !p.removed).map(p => ({shareId:p.shareId,productId:p.productId,note:p.note,
      owner:p.owner,historicalSnapshot:structuredClone(p.historicalSnapshot),
      shortlistedBy:[...p.selections].filter(([,selected]) => selected).map(([owner]) => owner).sort()})),
    polls:[...polls.values()].map(p => ({id:p.id,owner:p.owner,question:p.question,closesAt:p.closesAt,closedAt:p.closedAt,
      open:p.closedAt === null && (p.closesAt === null || now < Date.parse(p.closesAt)),
      options:p.options.map(o => ({...o,votes:[...p.ballots.values()].filter(id => id === o.id).length})),
      ballots:Object.fromEntries([...p.ballots].sort(([a],[b]) => a < b ? -1 : 1))})),
    rejected,
  };
}

export function resolveRoomProducts(projection, catalog) {
  need(projection && Array.isArray(projection.products) && catalog instanceof Map, 'room_catalog_invalid');
  return projection.products.map(share => {
    const item = catalog.get(share.productId);
    const valid = item && item.id === share.productId && text(item.name,256) && identifier(item.sellerId);
    // A historical share is never the authority for price, availability or stock.
    return {...structuredClone(share), current:valid ? {
      name:item.name,sellerId:item.sellerId,
      currency:/^[A-Z]{3}$/.test(item.currency) ? item.currency : null,
      unitPriceMinor:Number.isSafeInteger(item.unitPriceMinor) && item.unitPriceMinor >= 0 ? item.unitPriceMinor : null,
      availability:['available','reserved','sold_out'].includes(item.availability) ? item.availability : 'unknown',
      stock:Number.isSafeInteger(item.stock) && item.stock >= 0 ? item.stock : null,
    } : null};
  });
}

export function createSellerQuestion(projection, {shareId,question,correlationId,confirmed} = {}) {
  need(confirmed === true && uuid(shareId) && uuid(correlationId) && text(question,2048) && question.trim(), 'room_seller_consent_required');
  const share = projection?.products?.find(p => p.shareId === shareId);
  need(share && identifier(share.productId), 'room_product_required');
  // Explicit disclosure is limited to the chosen product and question, never a room invite or history export.
  return {version:1,productId:share.productId,question,correlationId};
}

export function compareRoomProducts(projection, ids, catalog) {
  need(projection&&Array.isArray(projection.products)&&catalog instanceof Map&&Array.isArray(ids)&&ids.length>=2&&ids.length<=4
    &&ids.every(identifier)&&new Set(ids).size===ids.length&&ids.every(id=>projection.products.some(p=>p.productId===id)), 'room_comparison_selection_required');
  const scalar=v=>typeof v==='string'&&v.trim()&&v.length<=160&&!/[\u0000]/.test(v)?v:null;
  const list=v=>Array.isArray(v)&&v.length>0&&v.length<=32&&v.every(x=>scalar(x))?[...new Set(v)]:null;
  return ids.map(id=>{const p=catalog.get(id),valid=p?.id===id&&p.status==='approved';
    // No historical snapshot, poll-label matching, or demand inference supplies missing catalog attributes.
    return {id,available:valid,name:valid?scalar(p.name):null,
      price:valid&&typeof p.price==='number'&&Number.isFinite(p.price)&&p.price>=0?p.price:null,
      currency:valid&&/^[A-Z]{3}$/.test(p.currency)?p.currency:null,
      availability:valid&&['available','reserved','sold_out'].includes(p.availability)?p.availability:null,
      stock:valid&&Number.isSafeInteger(p.stockQuantity)&&p.stockQuantity>=0?p.stockQuantity:null,
      sizes:valid?list(p.sizes):null,colors:valid?list(p.colors):null,brand:valid?scalar(p.brand):null,
      category:valid?scalar(p.category):null,sellerId:valid&&identifier(p.uploadedBy)?p.uploadedBy:null,
      shortlistedBy:[...new Set(projection.products.filter(s=>s.productId===id).flatMap(s=>s.shortlistedBy))].sort()};});
}

export {PREFIX as ROOM_CONTENT_PREFIX};
