(function (root, factory) {
  const contract = factory();
  if (typeof module === 'object' && module.exports) module.exports = contract;
  else {
    root.WingaModules = root.WingaModules || {};
    root.WingaModules.growth = { ...(root.WingaModules.growth || {}), contract };
  }
})(typeof window === 'undefined' ? globalThis : window, function () {
  const version = 1;
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
  const id = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value) && !['.', '..'].includes(value);
  const surfaces = ['product_detail', 'feed', 'conversation', 'room', 'catalog'];
  const events = ['product_share_opened', 'shared_product_viewed', 'shared_product_saved',
    'shared_product_message_started', 'shared_product_order_started'];
  const inviteToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
  const roomEvents = ['room_invite_opened','room_invite_accepted','room_participation_started','first_vote','first_comment','first_product_added','first_product_viewed','room_shortlist_created','room_poll_closed'];
  // Extend only when the corresponding canonical public/authorized UI handler exists.
  function destination(type, contentId) {
    if (type === 'SHOPPING_ROOM' && inviteToken(contentId)) return {type,id:contentId,path:'/invite/' + contentId};
    if (type !== 'PRODUCT' || !id(contentId)) return null;
    return { type, id: contentId, path: '/product/' + encodeURIComponent(contentId) };
  }
  function parseDestination(input, origin) {
    try {
      const url = new URL(input, origin);
      if (url.origin !== origin || url.username || url.password || url.hash) return null;
      const match = /^\/product\/([^/]+)\/?$/i.exec(url.pathname);
      if (match) return destination('PRODUCT', decodeURIComponent(match[1]));
      const invitation = /^\/invite\/([A-Za-z0-9_-]{43})\/?$/.exec(url.pathname);
      return invitation && !url.search ? destination('SHOPPING_ROOM', invitation[1]) : null;
    } catch { return null; }
  }
  function shareUrl(origin, contentId, shareId = '') {
    const target = destination('PRODUCT', contentId);
    if (!target) return null;
    try {
      const url = new URL(target.path, origin);
      if (!['https:', 'http:'].includes(url.protocol)) return null;
      if (uuid(shareId)) url.searchParams.set('share', shareId);
      return url.href;
    } catch { return null; }
  }
  const intentTypes = ['open-chat', 'open-whatsapp', 'add-request', 'focus-product', 'save-product',
    'notify-search', 'notify-restock', 'share-to-winga', 'follow-person', 'go-upload', 'go-profile','open-room-invite','join-room-invite','block-room-inviter','report-room-invite'];
  function authIntent(value, now = Date.now()) {
    if (!value || typeof value !== 'object' || !intentTypes.includes(value.type)) return null;
    if (!Number.isFinite(value.createdAt) || value.createdAt > now + 60000 || now - value.createdAt > 30 * 60 * 1000) return null;
    const result = { type: value.type, createdAt: value.createdAt };
    if(value.type==='notify-search'){if(typeof value.query!=='string'||value.query.trim().length<2||value.query.length>160||/[\u0000-\u001f]/.test(value.query))return null;return {...result,query:value.query.trim()};}
    if (['open-room-invite','join-room-invite','block-room-inviter','report-room-invite'].includes(value.type)) {
      if (!inviteToken(value.token)) return null;
      return {...result,token:value.token};
    }
    if (Number.isInteger(value.initialImageIndex) && value.initialImageIndex >= 0 && value.initialImageIndex <= 50)
      result.initialImageIndex = value.initialImageIndex;
    if (value.type === 'follow-person') {
      if (!id(value.username) || value.username.length > 40) return null;
      result.username = value.username;
      if (id(value.productId)) result.productId = value.productId;
    } else if (!['go-upload', 'go-profile'].includes(value.type)) {
      if (!id(value.productId)) return null;
      result.productId = value.productId;
    }
    return result;
  }
  const crawler = ua => !ua || /bot\b|crawler|spider|preview|facebookexternalhit|facebot|whatsapp|slackbot|telegrambot|discordbot|headless/i.test(ua);
  const telemetryPath = value => String(value || '').replace(/(\/(?:api\/growth\/invites|invite)\/)[^/?#]+/gi,'$1[redacted]');
  return Object.freeze({ version, uuid, id, surfaces, events, roomEvents, inviteToken, destination, parseDestination, shareUrl, authIntent, crawler, telemetryPath });
});
