const crypto = require("crypto");
const { normalizeAction, normalizeAmount } = require("./conversation-offers-domain");

function clean(value,max=120){return String(value||"").trim().slice(0,max);}
function makeId(prefix){return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;}
function idempotency(req,payload){
  const key=clean(req.headers["idempotency-key"]||payload.idempotencyKey,120);
  return /^[A-Za-z0-9._:-]{8,120}$/.test(key)?key:"";
}

function createConversationOffersApi(deps={}){
  const { collectBody,sendJson,findSession,readAuthToken,ensureMarketplaceUser,getPostgresStore }=deps;
  function unavailable(res){sendJson(res,503,{error:"Offers service is temporarily unavailable.",code:"offers_unavailable"});}
  function errorMessage(code){return ({invalid_amount:"Enter a valid offer amount.",product_not_found:"Product was not found.",
    product_unavailable:"This product is not currently available.",seller_unavailable:"This seller is not currently available.",offer_blocked:"This negotiation is blocked.",self_offer:"You cannot make an offer on your own product.",seller_mismatch:"Product does not belong to this conversation seller.",
    offer_not_found:"Offer was not found.",offer_expired:"This offer has expired.",forbidden_transition:"You cannot perform that offer action."})[code]||"Offer request failed.";}
  function userFor(req,res){const session=findSession(readAuthToken(req));return {session,user:ensureMarketplaceUser(session,res)};}

  async function handle(req,res,url){
    const path=url.pathname;
    if(!(path.startsWith("/api/conversations/")||path.startsWith("/api/conversation-offers/"))) return false;
    const store=getPostgresStore();
    const threadMatch=path.match(/^\/api\/conversations\/([^/]+)\/offers$/);
    if(threadMatch && req.method==="GET"){
      const {user}=userFor(req,res); if(!user)return true;
      if(!store?.readConversationOffers)return unavailable(res),true;
      const withUser=clean(decodeURIComponent(threadMatch[1]),40);
      sendJson(res,200,await store.readConversationOffers(user.username,withUser),{"Cache-Control":"private, no-store"});
      return true;
    }
    if(threadMatch && req.method==="POST"){
      const {user}=userFor(req,res); if(!user)return true;
      if(!store?.createConversationOffer)return unavailable(res),true;
      const withUser=clean(decodeURIComponent(threadMatch[1]),40);
      const payload=await collectBody(req); const amount=normalizeAmount(payload.amount);
      if(!amount){sendJson(res,400,{error:errorMessage("invalid_amount"),code:"invalid_amount"});return true;}
      const key=idempotency(req,payload);
      if(!key){sendJson(res,400,{error:"A valid Idempotency-Key is required.",code:"idempotency_key_required"});return true;}
      const result=await store.createConversationOffer({id:makeId("offer"),eventId:makeId("offer-event"),notificationId:makeId("notification"),
        buyerUsername:user.username,expectedSellerUsername:withUser,productId:clean(payload.productId,80),amount,
        currency:clean(payload.currency||"TZS",3).toUpperCase(),expiresAt:new Date(Date.now()+7*86400000).toISOString(),idempotencyKey:key});
      sendJson(res,result.created?201:(["product_not_found"].includes(result.code)?404:409),result.created?result.offer:{error:errorMessage(result.code),code:result.code});
      return true;
    }
    const offerMatch=path.match(/^\/api\/conversation-offers\/([^/]+)$/);
    if(offerMatch && req.method==="PATCH"){
      const {user}=userFor(req,res); if(!user)return true;
      if(!store?.transitionConversationOffer)return unavailable(res),true;
      const payload=await collectBody(req); const action=normalizeAction(payload.action);
      if(!action){sendJson(res,400,{error:"Offer action is invalid.",code:"invalid_action"});return true;}
      const key=idempotency(req,payload);
      if(!key){sendJson(res,400,{error:"A valid Idempotency-Key is required.",code:"idempotency_key_required"});return true;}
      const result=await store.transitionConversationOffer({offerId:clean(decodeURIComponent(offerMatch[1]),100),actorUsername:user.username,
        action,amount:payload.amount,eventId:makeId("offer-event"),notificationId:makeId("notification"),idempotencyKey:key});
      sendJson(res,result.updated?200:(["offer_not_found"].includes(result.code)?404:409),result.updated?result.offer:{error:errorMessage(result.code),code:result.code});
      return true;
    }
    return false;
  }
  return {handle};
}
module.exports={createConversationOffersApi};
