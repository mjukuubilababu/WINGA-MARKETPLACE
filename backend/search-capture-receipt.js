"use strict";
const crypto = require("crypto");
const {validateSearchObservation} = require("./search-outcome-observer");
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RECEIPT_LENGTH = 8192;
const sign = (body,secret) => crypto.createHmac("sha256",secret)
  .update(`winga:search-capture-receipt:v1:${body}`).digest("base64url");
const rejected = () => Object.assign(new Error("invalid_search_capture_receipt"),
  {code:"invalid_search_capture_receipt", retryable:false});

function issueSearchCaptureReceipt(event, secret, now=Date.now()) {
  validateSearchObservation(event);
  if (!secret) throw rejected();
  const expiresAt = now + TTL_MS;
  const body = Buffer.from(JSON.stringify({version:1,expiresAt,event})).toString("base64url");
  const receipt = `${body}.${sign(body,secret)}`;
  if (receipt.length > MAX_RECEIPT_LENGTH) throw rejected();
  return {receipt,eventId:event.eventId,expiresAt};
}

function verifySearchCaptureReceipt(receipt, secret, now=Date.now()) {
  try {
    if (!secret || typeof receipt !== "string" || receipt.length > MAX_RECEIPT_LENGTH) throw rejected();
    const parts=receipt.split(".");
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) throw rejected();
    const expected=Buffer.from(sign(parts[0],secret)), actual=Buffer.from(parts[1]);
    if (!crypto.timingSafeEqual(expected,actual)) throw rejected();
    const payload=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    if (payload.version !== 1 || !Number.isSafeInteger(payload.expiresAt)
        || payload.expiresAt <= now || payload.expiresAt > now + TTL_MS
        || Date.parse(payload.event?.timestamp) > now + 300000) throw rejected();
    return validateSearchObservation(payload.event);
  } catch {throw rejected();}
}

async function acceptSearchCaptureReceipt(store, receipt, secret, now=Date.now()) {
  const event=verifySearchCaptureReceipt(receipt,secret,now);
  await store.enqueueIntelligenceEvent(event);
  return {ok:true,eventId:event.eventId,durablyRecorded:true};
}

module.exports = {TTL_MS, MAX_RECEIPT_LENGTH, issueSearchCaptureReceipt, verifySearchCaptureReceipt, acceptSearchCaptureReceipt};
