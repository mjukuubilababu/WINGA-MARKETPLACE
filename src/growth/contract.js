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
  const surfaces = ['product_detail', 'feed', 'conversation', 'room', 'catalog','profile','collection','creator','opportunity'];
  const events = ['product_share_opened', 'shared_product_viewed', 'shared_product_saved',
    'shared_product_message_started', 'shared_product_order_started'];
  const publicTypes=['PRODUCT','PROFILE','COLLECTION','REEL','SHORT'];
  const shareTypes=[...publicTypes,'SELLER_REFERRAL'];
  const referralEvents=['seller_referral_opened','seller_referral_created','seller_signup','seller_first_product','seller_first_value_event'];
  const contentEvents=['content_share_opened','shared_content_viewed','shared_content_saved','shared_content_followed'];
  const inviteToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
  const roomEvents = ['room_invite_opened','room_invite_accepted','room_participation_started','first_vote','first_comment','first_product_added','first_product_viewed','first_order_started','new_room_created_from_invited_user','room_shortlist_created','room_poll_closed'];
  // Extend only when the corresponding canonical public/authorized UI handler exists.
  function destination(type, contentId) {
    if (type === 'SHOPPING_ROOM' && inviteToken(contentId)) return {type,id:contentId,path:'/invite/' + contentId};
    if(type==='SELLER_REFERRAL'&&uuid(contentId))return {type,id:contentId,path:'/seller-referral/'+contentId};
    const paths={PRODUCT:'product',PROFILE:'profile',COLLECTION:'collection',REEL:'reel',SHORT:'short',OPPORTUNITY:'opportunity'};
    if (!Object.hasOwn(paths,type) || !id(contentId) || type==='PROFILE'&&contentId.length>40 || type==='OPPORTUNITY'&&contentId.length>100) return null;
    return { type, id: contentId, path: '/'+paths[type]+'/' + encodeURIComponent(contentId) };
  }
  function parseDestination(input, origin) {
    try {
      const url = new URL(input, origin);
      if (url.origin !== origin || url.username || url.password || url.hash) return null;
      const match = /^\/(product|profile|collection|reel|short|opportunity)\/([^/]+)\/?$/i.exec(url.pathname);
      if(match?.[1].toLowerCase()==='opportunity')return !url.search?destination('OPPORTUNITY',decodeURIComponent(match[2])):null;
      if (match && (!url.search || match[1].toLowerCase()==='product' || [...url.searchParams.keys()].every(k=>k==='share')&&uuid(url.searchParams.get('share')))) return destination(match[1].toUpperCase(), decodeURIComponent(match[2]));
      const invitation = /^\/invite\/([A-Za-z0-9_-]{43})\/?$/.exec(url.pathname);
      const referral=/^\/seller-referral\/([0-9a-f-]+)\/?$/.exec(url.pathname);
      if(referral&&!url.search)return destination('SELLER_REFERRAL',referral[1]);
      return invitation && !url.search ? destination('SHOPPING_ROOM', invitation[1]) : null;
    } catch { return null; }
  }
  function shareUrl(origin, contentId, shareId = '', type='PRODUCT') {
    if(!shareTypes.includes(type))return null;
    const target = destination(type, type==='SELLER_REFERRAL'?shareId:contentId);
    if (!target) return null;
    try {
      const url = new URL(target.path, origin);
      if (!['https:', 'http:'].includes(url.protocol)) return null;
      if (type!=='SELLER_REFERRAL'&&uuid(shareId)) url.searchParams.set('share', shareId);
      return url.href;
    } catch { return null; }
  }
  const intentTypes = ['open-chat', 'open-whatsapp', 'add-request', 'focus-product', 'save-product',
    'notify-search', 'notify-restock', 'share-to-winga', 'follow-person', 'go-upload', 'go-profile','open-opportunity','open-seller-referral','open-room-invite','join-room-invite','block-room-inviter','report-room-invite'];
  function authIntent(value, now = Date.now()) {
    if (!value || typeof value !== 'object' || !intentTypes.includes(value.type)) return null;
    if (!Number.isFinite(value.createdAt) || value.createdAt > now + 60000 || now - value.createdAt > 30 * 60 * 1000) return null;
    const result = { type: value.type, createdAt: value.createdAt };
    if(value.type==='open-opportunity'){if(!destination('OPPORTUNITY',value.opportunityId))return null;return {...result,opportunityId:value.opportunityId};}
    if(value.type==='open-seller-referral'){if(!uuid(value.referralId)||value.safetyAction!==undefined&&!['block','report'].includes(value.safetyAction))return null;return {...result,referralId:value.referralId,...(value.safetyAction?{safetyAction:value.safetyAction}:{})};}
    if(value.type==='notify-search'){if(typeof value.query!=='string'||value.query.trim().length<2||value.query.length>160||/[\u0000-\u001f]/.test(value.query))return null;return {...result,query:value.query.trim()};}
    if(value.type==='share-to-winga'&&value.contentId!==undefined){
      if(!['PRODUCT','REEL','SHORT','COLLECTION'].includes(value.contentType)||!id(value.contentId))return null;
      return {...result,contentType:value.contentType,contentId:value.contentId};
    }
    if (['open-room-invite','join-room-invite','block-room-inviter','report-room-invite'].includes(value.type)) {
      if (!inviteToken(value.token)) return null;
      return {...result,token:value.token};
    }
    if (Number.isInteger(value.initialImageIndex) && value.initialImageIndex >= 0 && value.initialImageIndex <= 50)
      result.initialImageIndex = value.initialImageIndex;
    if (value.type === 'follow-person') {
      if (!id(value.username) || value.username.length > 40) return null;
      result.username = value.username;
      const returnTo=parseDestination(value.returnTo,'https://winga.invalid');
      if(['PROFILE','COLLECTION'].includes(returnTo?.type))result.returnTo=returnTo.path;
      if (id(value.productId)) result.productId = value.productId;
    } else if (!['go-upload', 'go-profile'].includes(value.type)) {
      if (!id(value.productId)) return null;
      result.productId = value.productId;
    }
    return result;
  }
  const crawler = ua => !ua || /bot\b|crawler|spider|preview|facebookexternalhit|facebot|whatsapp|slackbot|telegrambot|discordbot|headless/i.test(ua);
  const telemetryPath = value => String(value || '').replace(/(\/(?:api\/growth\/invites|api\/growth\/internal|invite)\/)[^/?#]+/gi,'$1[redacted]');
  return Object.freeze({ version, uuid, id, surfaces, events, contentEvents, publicTypes, shareTypes, referralEvents, roomEvents, inviteToken, destination, parseDestination, shareUrl, authIntent, crawler, telemetryPath });
});
