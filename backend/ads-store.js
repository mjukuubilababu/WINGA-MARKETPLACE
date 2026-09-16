function createAdsStore({ query, withTransaction, parseJson, stringifyJson, toISOString }) {
  const selectCampaign = `
    SELECT c.id,c.ad_account_id AS "adAccountId",a.owner_username AS "ownerUsername",
      a.business_name AS "businessName",c.creative_id AS "creativeId",cr.product_id AS "productId",
      cr.media_type AS "mediaType",cr.media_url AS "mediaUrl",cr.headline,cr.description,
      cr.cta_type AS "ctaType",cr.destination_type AS "destinationType",cr.destination_value AS "destinationValue",
      c.placement_code AS "placementCode",c.starts_at AS "startsAt",c.ends_at AS "endsAt",
      c.duration_days AS "durationDays",c.quoted_price AS "quotedPrice",c.currency,
      c.payment_status AS "paymentStatus",c.review_status AS "reviewStatus",
      c.campaign_status AS "campaignStatus",c.targeting,c.created_at AS "createdAt",
      c.approved_at AS "approvedAt",c.activated_at AS "activatedAt",c.expired_at AS "expiredAt",
      COALESCE(m.impressions,0) AS impressions,COALESCE(m.clicks,0) AS clicks,
      COALESCE(p.transaction_reference,'') AS "transactionReference"
    FROM ad_campaigns c JOIN ad_accounts a ON a.id=c.ad_account_id
    JOIN ad_creatives cr ON cr.id=c.creative_id
    LEFT JOIN ad_campaign_metrics m ON m.campaign_id=c.id
    LEFT JOIN LATERAL (SELECT transaction_reference FROM ad_payment_references
      WHERE campaign_id=c.id ORDER BY created_at DESC LIMIT 1) p ON TRUE`;

  function campaign(row = {}) {
    const impressions = Number(row.impressions || 0);
    const clicks = Number(row.clicks || 0);
    return {
      ...row,
      durationDays: Number(row.durationDays || 0),
      quotedPrice: Number(row.quotedPrice || 0),
      targeting: parseJson(row.targeting, {}),
      startsAt: toISOString(row.startsAt), endsAt: toISOString(row.endsAt),
      createdAt: toISOString(row.createdAt), approvedAt: toISOString(row.approvedAt),
      activatedAt: toISOString(row.activatedAt), expiredAt: toISOString(row.expiredAt),
      impressions, clicks, ctr: impressions ? Number(((clicks / impressions) * 100).toFixed(2)) : 0
    };
  }

  async function getAdAccount(ownerUsername = "") {
    const result = await query(`SELECT id,owner_username AS "ownerUsername",business_name AS "businessName",
      status,created_at AS "createdAt",updated_at AS "updatedAt" FROM ad_accounts WHERE owner_username=$1`,
    [String(ownerUsername).slice(0,40)]);
    const row = result.rows?.[0];
    return row ? { ...row, createdAt: toISOString(row.createdAt), updatedAt: toISOString(row.updatedAt) } : null;
  }

  async function createAdAccount(input = {}) {
    const result = await query(`INSERT INTO ad_accounts(id,owner_username,business_name)
      SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM users WHERE username=$2 AND status='active')
      ON CONFLICT(owner_username) DO UPDATE SET business_name=CASE WHEN EXCLUDED.business_name<>''
        THEN EXCLUDED.business_name ELSE ad_accounts.business_name END,updated_at=NOW(),row_version=ad_accounts.row_version+1
      RETURNING id,owner_username AS "ownerUsername",business_name AS "businessName",status`,
    [input.id,input.ownerUsername,String(input.businessName || "").slice(0,120)]);
    return result.rowCount ? { created: true, account: result.rows[0] } : { created: false, code: "owner_not_found" };
  }

  async function readAdPlacements() {
    const result = await query(`SELECT code,name,status,currency,pricing,max_active_ads AS "maxActiveAds",rules
      FROM ad_placements WHERE status='ACTIVE' ORDER BY code`);
    return (result.rows || []).map(row => ({ ...row, pricing: parseJson(row.pricing, {}),
      rules: parseJson(row.rules, {}), maxActiveAds: Number(row.maxActiveAds || 0) }));
  }

  async function createAdCampaign(input = {}) {
    return withTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`winga-ad:${input.placementCode}`]);
      const account = await client.query("SELECT status FROM ad_accounts WHERE id=$1 AND owner_username=$2 FOR UPDATE",
        [input.adAccountId,input.ownerUsername]);
      if (!account.rowCount) return { created: false, code: "account_not_found" };
      if (account.rows[0].status !== "ACTIVE") return { created: false, code: "account_inactive" };
      const products = await client.query(`SELECT id,name,image,images,media_items AS "mediaItems",
        uploaded_by AS "uploadedBy",status FROM products WHERE id=$1`,[input.productId]);
      const product = products.rows?.[0];
      if (!product) return { created: false, code: "product_not_found" };
      if (product.uploadedBy !== input.ownerUsername) return { created: false, code: "not_owner" };
      if (product.status !== "approved") return { created: false, code: "product_not_approved" };
      const placements = await client.query(`SELECT code,currency,pricing,max_active_ads AS "maxActiveAds"
        FROM ad_placements WHERE code=$1 AND status='ACTIVE' FOR UPDATE`,[input.placementCode]);
      const placement = placements.rows?.[0];
      if (!placement) return { created: false, code: "invalid_placement" };
      const price = Number(parseJson(placement.pricing,{})[String(input.durationDays)] ?? -1);
      if (price < 0) return { created: false, code: "invalid_duration" };
      if (price !== Number(input.quotedPrice) || placement.currency !== input.currency) {
        return { created: false, code: "quote_changed", quotedPrice: price, currency: placement.currency };
      }
      const capacity = await client.query(`SELECT COUNT(*)::int AS count FROM ad_bookings
        WHERE placement_code=$1 AND status IN ('RESERVED','ACTIVE') AND starts_at<$3 AND ends_at>$2`,
        [input.placementCode,input.startsAt,input.endsAt]);
      if (Number(capacity.rows?.[0]?.count || 0) >= Number(placement.maxActiveAds || 1)) {
        return { created: false, code: "inventory_full" };
      }
      const media = parseJson(product.mediaItems,[]);
      const video = media.find(item => item?.type === "video");
      const mediaUrl = String(video?.playbackUrl || video?.url || product.image || parseJson(product.images,[])[0] || "");
      if (!mediaUrl) return { created: false, code: "creative_media_missing" };
      await client.query(`INSERT INTO ad_creatives(id,ad_account_id,product_id,media_type,media_url,headline,
        description,cta_type,destination_type,destination_value) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PRODUCT',$3)`,
        [input.creativeId,input.adAccountId,input.productId,video?"VIDEO":"IMAGE",mediaUrl,input.headline,input.description,input.ctaType]);
      await client.query(`INSERT INTO ad_campaigns(id,ad_account_id,creative_id,placement_code,starts_at,ends_at,
        duration_days,quoted_price,currency,payment_status,review_status,campaign_status,targeting,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'UNPAID','PENDING','PENDING_PAYMENT',$10::jsonb,$11)`,
        [input.id,input.adAccountId,input.creativeId,input.placementCode,input.startsAt,input.endsAt,
          Number(input.durationDays),price,placement.currency,stringifyJson(input.targeting,{}),input.ownerUsername]);
      await client.query(`INSERT INTO ad_bookings(id,campaign_id,placement_code,starts_at,ends_at)
        VALUES($1,$2,$3,$4,$5)`,[input.bookingId,input.id,input.placementCode,input.startsAt,input.endsAt]);
      await client.query("INSERT INTO ad_campaign_metrics(campaign_id) VALUES($1)",[input.id]);
      return { created: true, campaignId: input.id, quotedPrice: price, currency: placement.currency };
    });
  }

  async function recordAdPayment(input = {}) {
    return withTransaction(async client => {
      const result = await client.query(`SELECT c.quoted_price AS "quotedPrice",c.currency,c.campaign_status AS "campaignStatus"
        FROM ad_campaigns c JOIN ad_accounts a ON a.id=c.ad_account_id
        WHERE c.id=$1 AND a.owner_username=$2 FOR UPDATE`,[input.campaignId,input.ownerUsername]);
      const current = result.rows?.[0];
      if (!current) return { recorded: false, code: "campaign_not_found" };
      if (current.campaignStatus !== "PENDING_PAYMENT") return { recorded: false, code: "invalid_campaign_state" };
      const payment = await client.query(`INSERT INTO ad_payment_references(id,campaign_id,provider,
        transaction_reference,amount,currency,status,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,'PENDING',$7)
        ON CONFLICT DO NOTHING RETURNING id`,[input.id,input.campaignId,input.provider,input.transactionReference,
          Number(current.quotedPrice),current.currency,input.idempotencyKey]);
      if (!payment.rowCount) return { recorded: false, code: "duplicate_payment_reference" };
      await client.query(`UPDATE ad_campaigns SET payment_status='PENDING',campaign_status='PENDING_REVIEW',
        updated_at=NOW(),row_version=row_version+1 WHERE id=$1`,[input.campaignId]);
      return { recorded: true, paymentStatus: "PENDING", campaignStatus: "PENDING_REVIEW" };
    });
  }

  async function readAdCampaigns(ownerUsername = "", options = {}) {
    const params=[]; const where=[];
    if(ownerUsername){params.push(String(ownerUsername).slice(0,40));where.push(`a.owner_username=$${params.length}`);}
    if(options.status){params.push(String(options.status).toUpperCase());where.push(`c.campaign_status=$${params.length}`);}
    const result=await query(`${selectCampaign} ${where.length?`WHERE ${where.join(" AND ")}`:""}
      ORDER BY c.created_at DESC LIMIT 200`,params);
    return (result.rows || []).map(campaign);
  }

  async function readEligibleAds(placementCode = "", limit = 8) {
    const result = await query(`SELECT c.id AS "campaignId",c.creative_id AS "creativeId",
      c.placement_code AS "placementCode",cr.product_id AS "productId",cr.headline,cr.cta_type AS "ctaType"
      FROM ad_campaigns c JOIN ad_creatives cr ON cr.id=c.creative_id
      WHERE c.placement_code=$1 AND c.campaign_status='ACTIVE' AND c.payment_status='PAID'
        AND c.review_status='APPROVED' AND cr.moderation_status='APPROVED'
        AND c.starts_at<=NOW() AND c.ends_at>NOW()
      ORDER BY c.activated_at DESC NULLS LAST,c.id ASC LIMIT $2`,
    [String(placementCode).slice(0,40),Math.max(1,Math.min(20,Number(limit)||8))]);
    return (result.rows || []).map(row => ({
      campaignId: row.campaignId,
      creativeId: row.creativeId,
      placementCode: row.placementCode,
      productId: row.productId,
      headline: row.headline,
      ctaType: row.ctaType
    }));
  }

  async function reviewAdCampaign(input = {}) {
    return withTransaction(async client => {
      const found=await client.query(`SELECT c.*,p.max_active_ads AS "maxActiveAds" FROM ad_campaigns c
        JOIN ad_placements p ON p.code=c.placement_code WHERE c.id=$1 FOR UPDATE`,[input.campaignId]);
      const current=found.rows?.[0];
      if(!current)return {updated:false,code:"campaign_not_found"};
      if(current.campaign_status!=="PENDING_REVIEW")return {updated:false,code:"invalid_campaign_state"};
      if(input.decision==="REJECTED"){
        await client.query(`UPDATE ad_campaigns SET review_status='REJECTED',campaign_status='REJECTED',
          payment_status='FAILED',reviewed_by=$2,updated_at=NOW(),row_version=row_version+1 WHERE id=$1`,
          [input.campaignId,input.reviewerUsername]);
        await client.query("UPDATE ad_bookings SET status='RELEASED' WHERE campaign_id=$1",[input.campaignId]);
      }else{
        const status=new Date(current.starts_at).getTime()<=Date.now()?"ACTIVE":"SCHEDULED";
        await client.query(`UPDATE ad_campaigns SET review_status='APPROVED',campaign_status=$2,payment_status='PAID',
          reviewed_by=$3,approved_at=NOW(),activated_at=CASE WHEN $2='ACTIVE' THEN NOW() ELSE activated_at END,
          updated_at=NOW(),row_version=row_version+1 WHERE id=$1`,[input.campaignId,status,input.reviewerUsername]);
        await client.query("UPDATE ad_payment_references SET status='PAID',confirmed_at=NOW() WHERE campaign_id=$1 AND status='PENDING'",[input.campaignId]);
        await client.query("UPDATE ad_creatives SET moderation_status='APPROVED',updated_at=NOW() WHERE id=$1",[current.creative_id]);
        await client.query("UPDATE ad_bookings SET status=$2 WHERE campaign_id=$1",[input.campaignId,status==="ACTIVE"?"ACTIVE":"RESERVED"]);
      }
      await client.query(`INSERT INTO ad_reviews(id,campaign_id,reviewer_username,decision,reason_code,explanation)
        VALUES($1,$2,$3,$4,$5,$6)`,[input.reviewId,input.campaignId,input.reviewerUsername,input.decision,
          input.reasonCode || "",input.explanation || ""]);
      return {updated:true,campaignStatus:input.decision==="REJECTED"?"REJECTED":
        (new Date(current.starts_at).getTime()<=Date.now()?"ACTIVE":"SCHEDULED")};
    });
  }

  async function setAdCampaignStatus(input = {}) {
    const allowed={PAUSED:["ACTIVE","SCHEDULED"],CANCELLED:["PENDING_PAYMENT","PENDING_REVIEW","APPROVED","SCHEDULED","ACTIVE","PAUSED"]};
    const next=String(input.status || "").toUpperCase();
    if(!allowed[next])return {updated:false,code:"invalid_status"};
    const result=await query(`UPDATE ad_campaigns c SET campaign_status=$3,updated_at=NOW(),row_version=row_version+1
      FROM ad_accounts a WHERE c.id=$1 AND a.id=c.ad_account_id AND ($2='' OR a.owner_username=$2)
      AND c.campaign_status=ANY($4::text[]) RETURNING c.id`,
      [input.campaignId,input.ownerUsername || "",next,allowed[next]]);
    if(result.rowCount)await query("UPDATE ad_bookings SET status='RELEASED' WHERE campaign_id=$1",[input.campaignId]);
    return result.rowCount?{updated:true,campaignStatus:next}:{updated:false,code:"campaign_not_found_or_state"};
  }

  async function transitionAdCampaignLifecycle() {
    return withTransaction(async client => {
      const active=await client.query(`UPDATE ad_campaigns SET campaign_status='ACTIVE',
        activated_at=COALESCE(activated_at,NOW()),updated_at=NOW(),row_version=row_version+1
        WHERE campaign_status='SCHEDULED' AND payment_status='PAID' AND review_status='APPROVED'
          AND starts_at<=NOW() AND ends_at>NOW() RETURNING id`);
      const expired=await client.query(`UPDATE ad_campaigns SET campaign_status='EXPIRED',
        expired_at=COALESCE(expired_at,NOW()),updated_at=NOW(),row_version=row_version+1
        WHERE campaign_status IN ('APPROVED','SCHEDULED','ACTIVE','PAUSED') AND ends_at<=NOW() RETURNING id`);
      if(active.rowCount)await client.query("UPDATE ad_bookings SET status='ACTIVE' WHERE campaign_id=ANY($1::text[])",[active.rows.map(r=>r.id)]);
      if(expired.rowCount)await client.query("UPDATE ad_bookings SET status='EXPIRED' WHERE campaign_id=ANY($1::text[])",[expired.rows.map(r=>r.id)]);
      return {activated:Number(active.rowCount||0),expired:Number(expired.rowCount||0)};
    });
  }

  async function recordAdEvent(input = {}) {
    return withTransaction(async client => {
      const eligible=await client.query(`SELECT creative_id AS "creativeId",placement_code AS "placementCode"
        FROM ad_campaigns WHERE id=$1 AND campaign_status='ACTIVE' AND payment_status='PAID'
        AND review_status='APPROVED' AND starts_at<=NOW() AND ends_at>NOW()`,[input.campaignId]);
      const current=eligible.rows?.[0];
      if(!current)return {recorded:false,code:"campaign_inactive"};
      const result=await client.query(`INSERT INTO ad_events(id,campaign_id,creative_id,placement_code,event_type,
        viewer_key_hash,dedupe_key,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
        ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`,[input.id,input.campaignId,current.creativeId,
          current.placementCode,input.eventType,input.viewerKeyHash,input.dedupeKey,stringifyJson(input.metadata,{})]);
      if(!result.rowCount)return {recorded:true,duplicate:true};
      await client.query(`UPDATE ad_campaign_metrics SET
        impressions=impressions+CASE WHEN $2='IMPRESSION' THEN 1 ELSE 0 END,
        clicks=clicks+CASE WHEN $2='CLICK' THEN 1 ELSE 0 END,updated_at=NOW() WHERE campaign_id=$1`,
        [input.campaignId,input.eventType]);
      return {recorded:true,duplicate:false};
    });
  }

  return { getAdAccount,createAdAccount,readAdPlacements,createAdCampaign,recordAdPayment,
    readAdCampaigns,readEligibleAds,reviewAdCampaign,setAdCampaignStatus,transitionAdCampaignLifecycle,recordAdEvent };
}
module.exports={createAdsStore};
