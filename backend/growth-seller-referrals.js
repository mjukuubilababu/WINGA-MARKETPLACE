const contract=require('../src/growth/contract');
const {fail,key,fields,quota,insertEvent,publicProduct}=require('./growth-infrastructure');
const {readSellerCommerceOpportunities}=require('./commerce-opportunity-reader');
const {enqueueGrowthEvent}=require('./growth-event-jobs');
const actor=username=>key('user:'+username);
function createSellerReferrals({query,withTransaction,measurementEnabled=false,cohort=require('./growth-policy').createGrowthPolicy(process.env)}){
  const policy=context=>context.growthCohort||cohort;
  // Only canonical active, nonself and unblocked buyer signals qualify. These
  // fragments use fixed column names, never identifiers supplied by a client.
  const audience=(buyer,seller)=>`${buyer}<>${seller}
    AND EXISTS(SELECT 1 FROM users value_buyer WHERE value_buyer.username=${buyer} AND value_buyer.status='active')
    AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_username=${buyer} AND b.blocked_username=${seller})
      OR (b.blocked_username=${buyer} AND b.blocker_username=${seller}))`;
  const saveValue=`${audience('l.user_id','p.uploaded_by')} AND l.created_at>=p.first_approved_at`;
  const orderValue=`ord.seller_username=p.uploaded_by AND ${audience('ord.buyer_username','p.uploaded_by')}
    AND ord.status NOT IN ('cancelled','refunded') AND ord.payment_status<>'refunded' AND ord.created_at>=p.first_approved_at`;
  async function load(client,id,context={}){
    if(!contract.uuid(id))fail(404,'growth_referral_unavailable');
    const row=(await client.query(`SELECT s.* FROM growth_shares s JOIN users u ON u.username=s.owner_username
      WHERE s.id=$1 AND s.content_type='SELLER_REFERRAL' AND s.revoked_at IS NULL AND s.expires_at>NOW()
        AND u.status='active' AND u.role IN ('buyer','seller')`,[id])).rows[0];
    if(!row)fail(404,'growth_referral_unavailable');
    if(context.username&&(await client.query(`SELECT 1 FROM user_blocks WHERE (blocker_username=$1 AND blocked_username=$2) OR (blocker_username=$2 AND blocked_username=$1)`,[context.username,row.owner_username])).rows.length)fail(404,'growth_referral_unavailable');
    const [opportunity]=await readSellerCommerceOpportunities(client,row.owner_username,1,row.content_id);
    if(!opportunity)fail(404,'growth_referral_unavailable');
    return {row,opportunity};
  }
  async function safeJob(client,...args){
    await client.query('SAVEPOINT growth_referral_measurement');
    try{await enqueueGrowthEvent(client,...args);await client.query('RELEASE SAVEPOINT growth_referral_measurement');}
    catch{await client.query('ROLLBACK TO SAVEPOINT growth_referral_measurement');await client.query('RELEASE SAVEPOINT growth_referral_measurement');}
  }
  async function createSellerReferral(payload,context){
    if(!fields(payload,['shareId','sessionId','contentType','contentId','sourceSurface','parentShareId','schemaVersion'])
      ||payload.schemaVersion!==1||payload.contentType!=='SELLER_REFERRAL'||!contract.uuid(payload.shareId)||!contract.uuid(payload.sessionId)
      ||!contract.id(payload.contentId)||payload.contentId.length>100||payload.sourceSurface!=='opportunity'||payload.parentShareId!==undefined&&payload.parentShareId!=='')fail(400,'growth_share_invalid');
    if(!context.username||!policy(context).allowsCreation(context.username))fail(403,'growth_cohort_excluded');
    if(context.bot)fail(400,'growth_crawler_rejected');
    return withTransaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['growth-share:'+payload.shareId]);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['growth-referral:'+context.username+':'+payload.contentId]);
      const user=(await client.query("SELECT 1 FROM users WHERE username=$1 AND status='active' AND role IN ('buyer','seller')",[context.username])).rows[0];
      if(!user)fail(403,'growth_referral_access_required');
      const old=(await client.query('SELECT * FROM growth_shares WHERE id=$1',[payload.shareId])).rows[0];
      if(old){if(old.owner_username!==context.username||old.content_type!=='SELLER_REFERRAL'||old.content_id!==payload.contentId)fail(409,'growth_share_conflict');
        await load(client,payload.shareId,context);return {shareId:payload.shareId,duplicate:true};}
      const [opportunity]=await readSellerCommerceOpportunities(client,context.username,1,payload.contentId);
      if(!opportunity)fail(404,'growth_referral_unavailable');
      if(!opportunity.category)fail(409,'growth_referral_context_unavailable');
      const reusable=(await client.query(`SELECT id FROM growth_shares WHERE owner_username=$1 AND content_type='SELLER_REFERRAL' AND content_id=$2
        AND revoked_at IS NULL AND expires_at>NOW() AND created_at>=NOW()-INTERVAL '5 minutes' ORDER BY created_at LIMIT 1`,[context.username,payload.contentId])).rows[0];
      if(reusable)return {shareId:reusable.id,duplicate:true};
      await quota(client,'referral:user:'+actor(context.username),6);await quota(client,'referral:ip:'+key(context.ip||'unknown'),12);
      await quota(client,'referral:daily:'+actor(context.username),20,86400);
      await client.query(`INSERT INTO growth_shares(id,content_type,content_id,source_surface,campaign_type,owner_username,actor_key,expires_at,measurement_enabled)
        VALUES($1,'SELLER_REFERRAL',$2,'opportunity','organic_referral',$3,$4,LEAST(NOW()+INTERVAL '7 days',$5::timestamptz),$6)`,
        [payload.shareId,payload.contentId,context.username,actor(context.username),opportunity.expiresAt,measurementEnabled]);
      await load(client,payload.shareId,context);
      if(measurementEnabled)await safeJob(client,'referral-created:'+payload.shareId,payload.shareId,actor(context.username),'seller_referral_created','server');
      return {shareId:payload.shareId,duplicate:false};
    });
  }
  async function resolveSellerReferral(id,context={}){
    return withTransaction(async client=>{
      const {row,opportunity}=await load(client,id,context);
      let authorized=false;
      if(context.username){const user=(await client.query("SELECT 1 FROM users WHERE username=$1 AND status='active' AND role IN ('buyer','seller')",[context.username])).rows[0];
        authorized=!!user&&(await readSellerCommerceOpportunities(client,context.username,1,row.content_id)).length>0;}
      return {schemaVersion:1,referralId:row.id,purpose:'supply_for_real_demand',category:opportunity.category,
        attributionContext:{attributionId:row.id,sourceType:'seller_referral',sourceSurface:'opportunity',destinationType:'SELLER_REFERRAL',destinationId:row.id,
          createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),campaignType:'organic_referral',metadataVersion:1},
        evidenceLevel:opportunity.metadata?.evidenceLevel==='corroborated'?'corroborated':'single_signal',
        expiresAt:new Date(row.expires_at).toISOString(),measurementEnabled:measurementEnabled&&row.measurement_enabled,
        opportunityDestination:authorized?contract.destination('OPPORTUNITY',row.content_id).path:null};
    });
  }
  async function recordSellerReferralEvent(payload,context){
    if(!fields(payload,['eventId','shareId','sessionId','eventType','schemaVersion'])||payload.schemaVersion!==1||!contract.uuid(payload.eventId)
      ||!contract.uuid(payload.sessionId)||!contract.uuid(payload.shareId)||payload.eventType!=='seller_referral_opened')fail(400,'growth_event_invalid');
    if(context.bot)return {accepted:false,reason:'crawler'};
    if(!measurementEnabled)return {accepted:false,reason:'measurement_disabled'};
    return withTransaction(async client=>{
      const {row}=await load(client,payload.shareId,context);
      if(!row.measurement_enabled||!policy(context).allowsMeasurement(row.owner_username,context.username||''))return {accepted:false,reason:'cohort'};
      if(row.owner_username===context.username)return {accepted:false,reason:'self_touch'};
      const accountKey=context.username?actor(context.username):null,actorKey=accountKey||key('session:'+payload.sessionId);
      await quota(client,'referral:event:'+actorKey,30);await quota(client,'referral:event-ip:'+key(context.ip||'unknown'),60);
      if(accountKey){
        const valid=(await client.query("SELECT created_at,created_at::text AS source_created_at FROM users WHERE username=$1 AND status='active' AND role IN ('buyer','seller')",[context.username])).rows[0];
        if(!valid)fail(403,'growth_referral_access_required');
        await client.query(`INSERT INTO growth_referral_receipts(share_id,recipient_username,session_actor_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[row.id,context.username,key('session:'+payload.sessionId)]);
        // Signup attribution requires an observed pre-signup guest open in the same tab.
        if(valid.created_at>=row.created_at&&(await client.query(`SELECT 1 FROM growth_events WHERE share_id=$1 AND actor_key=$2 AND event_type='seller_referral_opened' AND created_at<$3::timestamptz`,[row.id,key('session:'+payload.sessionId),valid.created_at])).rows.length)
          await safeJob(client,'referral-signup:'+row.id+':'+accountKey,row.id,accountKey,'seller_signup','server',null,valid.source_created_at);
      }
      const inserted=await insertEvent(client,payload.eventId,row.id,actorKey,payload.eventType,'client_observed',null,accountKey);
      return {accepted:true,duplicate:!inserted};
    });
  }
  async function reconcileSellerReferralEvents({batchSize=50}={}){
    if(!measurementEnabled)return {queued:0,disabled:true};
    const limit=Math.max(1,Math.min(50,Math.trunc(Number(batchSize)||50)));
    return withTransaction(async client=>{
      let queued=0;
      const created=(await client.query(`SELECT *,created_at::text AS source_created_at FROM growth_shares WHERE content_type='SELLER_REFERRAL' AND measurement_enabled AND created_at>=NOW()-INTERVAL '24 hours'
        AND NOT EXISTS(SELECT 1 FROM growth_event_jobs j WHERE j.event_id='referral-created:'||growth_shares.id) ORDER BY created_at LIMIT $1`,[limit])).rows;
      for(const source of created)if(source.owner_username&&cohort.allowsCreation(source.owner_username)){
        if(await enqueueGrowthEvent(client,'referral-created:'+source.id,source.id,actor(source.owner_username),'seller_referral_created','server',null,source.source_created_at))queued++;
      }else await client.query('UPDATE growth_shares SET measurement_enabled=FALSE WHERE id=$1',[source.id]);
      const signups=(await client.query(`SELECT r.share_id,r.recipient_username,s.owner_username,u.created_at::text AS registered_at
        FROM growth_referral_receipts r JOIN growth_shares s ON s.id=r.share_id JOIN users u ON u.username=r.recipient_username
        WHERE r.measurement_enabled AND u.created_at>=s.created_at AND u.created_at>=NOW()-INTERVAL '24 hours'
          AND EXISTS(SELECT 1 FROM growth_events e WHERE e.share_id=r.share_id AND e.actor_key=r.session_actor_key AND e.event_type='seller_referral_opened' AND e.created_at<u.created_at)
          AND NOT EXISTS(SELECT 1 FROM growth_event_jobs j WHERE j.event_id='referral-signup:'||r.share_id||':'||encode(sha256(convert_to('user:'||r.recipient_username,'UTF8')),'hex'))
        ORDER BY u.created_at LIMIT $1`,[limit])).rows;
      for(const signup of signups)if(signup.owner_username&&cohort.allowsMeasurement(signup.owner_username,signup.recipient_username)){
        const accountKey=actor(signup.recipient_username);
        if(await enqueueGrowthEvent(client,'referral-signup:'+signup.share_id+':'+accountKey,signup.share_id,accountKey,'seller_signup','server',null,signup.registered_at))queued++;
      }else await client.query('UPDATE growth_referral_receipts SET measurement_enabled=FALSE WHERE share_id=$1 AND recipient_username=$2',[signup.share_id,signup.recipient_username]);
      const rows=(await client.query(`SELECT r.*,r.created_at::text AS received_at,s.owner_username,s.content_id,s.created_at AS shared_at FROM growth_referral_receipts r
        JOIN growth_shares s ON s.id=r.share_id JOIN commerce_opportunities o ON o.opportunity_id=s.content_id
        WHERE r.measurement_enabled AND s.revoked_at IS NULL AND s.expires_at>NOW()
        AND NOT EXISTS(SELECT 1 FROM products older WHERE older.uploaded_by=r.recipient_username AND older.status='approved' AND (older.first_approved_at IS NULL OR older.first_approved_at<r.created_at))
        AND EXISTS(SELECT 1 FROM products p JOIN users seller ON seller.username=p.uploaded_by AND seller.status='active'
          WHERE p.uploaded_by=r.recipient_username AND p.first_approved_at>=r.created_at AND p.status='approved' AND p.price>0
            AND (o.category='' OR p.category=o.category OR p.category LIKE o.category||'-%')
            AND COALESCE((SELECT visibility FROM public_content_visibility WHERE content_type='product' AND content_id=p.id),'public')='public'
            AND (NOT EXISTS(SELECT 1 FROM growth_event_jobs j WHERE j.event_id='referral-product:'||r.share_id||':'||encode(sha256(convert_to('user:'||r.recipient_username,'UTF8')),'hex'))
              OR (NOT EXISTS(SELECT 1 FROM growth_event_jobs j WHERE j.event_id='referral-value:'||r.share_id||':'||encode(sha256(convert_to('user:'||r.recipient_username,'UTF8')),'hex'))
                AND (EXISTS(SELECT 1 FROM product_likes l WHERE l.product_id=p.id AND ${saveValue})
                  OR EXISTS(SELECT 1 FROM orders ord WHERE ord.product_id=p.id AND ${orderValue})))))
        ORDER BY r.created_at LIMIT $1`,[limit])).rows;
      for(const receipt of rows){
        if(!cohort.allowsMeasurement(receipt.owner_username,receipt.recipient_username)){
          await client.query('UPDATE growth_referral_receipts SET measurement_enabled=FALSE WHERE share_id=$1 AND recipient_username=$2',[receipt.share_id,receipt.recipient_username]);continue;}
        let info;try{info=await load(client,receipt.share_id,{username:receipt.recipient_username});}catch(error){if(error.code==='growth_referral_unavailable'){
          await client.query('UPDATE growth_referral_receipts SET measurement_enabled=FALSE WHERE share_id=$1 AND recipient_username=$2',[receipt.share_id,receipt.recipient_username]);continue;}throw error;}
        const products=(await client.query(`SELECT id,first_approved_at::text AS first_approved_at FROM products WHERE uploaded_by=$1 AND status='approved' AND price>0
          AND first_approved_at>=$2::timestamptz AND ($3='' OR category=$3 OR category LIKE $3||'-%')
          AND NOT EXISTS(SELECT 1 FROM products older WHERE older.uploaded_by=$1 AND older.status='approved' AND (older.first_approved_at IS NULL OR older.first_approved_at<$2::timestamptz))
          ORDER BY products.first_approved_at,id LIMIT 20`,[receipt.recipient_username,receipt.received_at,info.opportunity.category])).rows;
        const visible=[];for(const candidate of products)if(await publicProduct(client,candidate.id,receipt.recipient_username))visible.push(candidate);
        const product=visible[0];
        if(!product)continue;
        const accountKey=actor(receipt.recipient_username);
        if(await enqueueGrowthEvent(client,'referral-product:'+receipt.share_id+':'+accountKey,receipt.share_id,accountKey,'seller_first_product','server',null,product.first_approved_at))queued++;
        const value=(await client.query(`SELECT MIN(at)::text AS at FROM (
          SELECT l.created_at AS at FROM product_likes l JOIN products p ON p.id=l.product_id WHERE p.id=ANY($1::text[]) AND p.uploaded_by=$2 AND ${saveValue}
          UNION ALL SELECT ord.created_at FROM orders ord JOIN products p ON p.id=ord.product_id WHERE p.id=ANY($1::text[]) AND ord.seller_username=$2 AND ord.buyer_username<>$2
            AND ${orderValue}) actions`,[visible.map(row=>row.id),receipt.recipient_username])).rows[0]?.at;
        if(value&&await enqueueGrowthEvent(client,'referral-value:'+receipt.share_id+':'+accountKey,receipt.share_id,accountKey,'seller_first_value_event','server',null,value))queued++;
      }
      return {queued,hasMore:rows.length===limit||created.length===limit||signups.length===limit};
    });
  }
  async function readSellerReferralHealth(){
    const counts=Object.fromEntries((await query(`SELECT e.event_type,COUNT(*)::int AS count FROM growth_events e JOIN growth_shares s ON s.id=e.share_id
      WHERE s.content_type='SELLER_REFERRAL' AND s.created_at>=NOW()-INTERVAL '30 days' GROUP BY e.event_type`)).rows.map(r=>[r.event_type,Number(r.count)]));
    const entries=Number((await query(`SELECT COUNT(*)::int AS count FROM growth_shares WHERE content_type='SELLER_REFERRAL' AND measurement_enabled AND created_at>=NOW()-INTERVAL '30 days'`)).rows[0]?.count||0);
    const gaps=(await query(`SELECT COUNT(*)::int AS missing,COUNT(*) FILTER(WHERE s.created_at<NOW()-INTERVAL '24 hours')::int AS expired
      FROM growth_shares s WHERE s.content_type='SELLER_REFERRAL' AND s.measurement_enabled AND s.created_at>=NOW()-INTERVAL '30 days'
        AND NOT EXISTS(SELECT 1 FROM growth_event_jobs j WHERE j.event_id='referral-created:'||s.id)
        AND NOT EXISTS(SELECT 1 FROM growth_events e WHERE e.share_id=s.id AND e.event_type='seller_referral_created')`)).rows[0]||{};
    const summary=(await query(`WITH journeys AS (
      SELECT r.share_id,r.recipient_username,r.created_at AS opened_at,
        MIN(e.created_at) FILTER(WHERE e.event_type='seller_first_product') AS activated_at,
        MIN(e.created_at) FILTER(WHERE e.event_type='seller_first_value_event') AS value_at
      FROM growth_referral_receipts r JOIN growth_shares s ON s.id=r.share_id
      LEFT JOIN growth_events e ON e.share_id=r.share_id AND e.actor_key=encode(sha256(convert_to('user:'||r.recipient_username,'UTF8')),'hex')
      WHERE r.measurement_enabled AND s.created_at>=NOW()-INTERVAL '30 days' GROUP BY r.share_id,r.recipient_username,r.created_at
    ) SELECT COUNT(*)::int AS recipients,COUNT(*) FILTER(WHERE activated_at>=opened_at)::int AS activations,
      COUNT(*) FILTER(WHERE value_at>=activated_at AND activated_at>=opened_at)::int AS values,
      COUNT(*) FILTER(WHERE activated_at>=opened_at AND value_at>=activated_at AND EXISTS(SELECT 1 FROM growth_shares continued WHERE continued.content_type='SELLER_REFERRAL' AND continued.owner_username=journeys.recipient_username AND continued.created_at>=journeys.value_at))::int AS continuations,
      AVG(EXTRACT(EPOCH FROM value_at-opened_at)) FILTER(WHERE value_at>=activated_at AND activated_at>=opened_at)::float8 AS seconds FROM journeys`)).rows[0]||{};
    const ratio=(a,b)=>Number(b)?Number(a)/Number(b):null;
    return {schemaVersion:1,loop:'seller_referral',windowDays:30,entryCount:entries,counts,
      creationGaps:{missing:Number(gaps.missing||0),expired:Number(gaps.expired||0)},
      cohort:{basis:'measurement_eligible_authenticated_referral_receipts',recipientJourneys:Number(summary.recipients||0),activationCount:Number(summary.activations||0),valueCount:Number(summary.values||0),continuationCount:Number(summary.continuations||0),
        activationRate:ratio(summary.activations,summary.recipients),valueRate:ratio(summary.values,summary.activations),continuationRate:ratio(summary.continuations,summary.values),timeToValueSeconds:summary.seconds===null?null:Number(summary.seconds),viralCoefficient:null},
      limitations:['Signup is recorded only after an observed same-tab pre-signup guest open; signup alone is not seller activation.',
        'Activation requires a first currently public approved product with a positive price in the referred category after authenticated intake; legacy approvals remain unknown and are not backfilled.',
        'Value is a canonical active/unblocked nonself save or noncancelled, nonrefunded owned order start, not revenue or independently verified fulfillment.',
        'Anonymous opens are client observed and are not joined to account cohorts without authenticated evidence.',
        'Funnel units are referral/account pairs; multi-touch associations are not additive unique acquisitions or causal revenue.',
        'Delivered invitations and cross-device anonymous acquisition are unknown; no rewards, contact uploads or platform reminders are sent.']};
  }
  return {createSellerReferral,resolveSellerReferral,recordSellerReferralEvent,reconcileSellerReferralEvents,readSellerReferralHealth};
}
module.exports={createSellerReferrals};
