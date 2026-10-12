const { id } = require('../src/growth/contract');

function selection(input, now=Date.now()) {
  const {accounts,productIds,since}=input||{};
  const valid=(values,check)=>Array.isArray(values)&&values.length>=1&&values.length<=5&&new Set(values).size===values.length&&values.every(check);
  const at=typeof since==='string'?Date.parse(since):NaN;
  if(!valid(accounts,v=>typeof v==='string'&&/^[A-Za-z0-9._-]{1,40}$/.test(v))||!valid(productIds,id)
    ||!Number.isFinite(at)||at>now||now-at>30*86400000)throw Object.assign(new Error('growth_canary_selection_invalid'),{code:'GROWTH_CANARY_SELECTION_INVALID'});
  return {accounts,productIds,since:new Date(at).toISOString()};
}

// The caller owns a read-only snapshot. No message/order bodies, username list,
// private IDs or per-person activity appear in the report.
async function readProductCanary(query,input){
  const {accounts,productIds,since}=selection(input),params=[accounts,productIds,since];
  const scoped=`WITH selected AS (SELECT id,actor_key FROM growth_shares
    WHERE content_type='PRODUCT' AND owner_username=ANY($1::text[]) AND content_id=ANY($2::text[]) AND created_at>=$3::timestamptz)`;
  const shares=await query(scoped+' SELECT COUNT(*)::int AS n FROM selected',params);
  const events=await query(scoped+` SELECT e.event_type,e.verification,COUNT(*)::int AS n FROM growth_events e JOIN selected s ON s.id=e.share_id
    WHERE e.created_at>=$3::timestamptz AND (e.event_type='product_share_created' AND e.actor_key=s.actor_key OR
      e.authenticated_actor_key=ANY(ARRAY(SELECT encode(sha256(convert_to('user:'||username,'UTF8')),'hex') FROM unnest($1::text[]) AS username)))
    GROUP BY e.event_type,e.verification ORDER BY e.event_type,e.verification`,params);
  const recipients=await query(scoped+` SELECT COUNT(DISTINCT e.authenticated_actor_key)::int AS n FROM growth_events e JOIN selected s ON s.id=e.share_id
    WHERE e.event_type IN ('product_share_opened','shared_product_viewed','shared_product_saved') AND e.created_at>=$3::timestamptz
      AND e.authenticated_actor_key=ANY(ARRAY(SELECT encode(sha256(convert_to('user:'||username,'UTF8')),'hex') FROM unnest($1::text[]) AS username))`,params);
  return {schemaVersion:1,scope:'explicit_account_product_canary',since,selection:{accounts:accounts.length,products:productIds.length},
    sharesCreated:Number(shares.rows[0]?.n||0),recipientAccountsObserved:Number(recipients.rows[0]?.n||0),
    events:events.rows.map(r=>({eventType:r.event_type,verification:r.verification,count:Number(r.n)})),
    writesPerformed:false,privateContentAccessed:false,assessment:'observations_only_not_certification',
    limitations:['Only new shares within the selected account/product/time scope and authenticated recipient observations are counted.',
      'Known crawlers are excluded at intake; unknown bots and causal lift are not certified.',
      'A view is client observed; server-confirmed saving is value, not a completed purchase.']};
}

async function main(){
  let pool,client;
  try{
    if(process.env.WINGA_CANARY_READ_ONLY!=='true'||!process.env.DATABASE_URL)throw Object.assign(new Error('growth_canary_read_required'),{code:'GROWTH_CANARY_READ_REQUIRED'});
    const input=selection({accounts:String(process.env.WINGA_CANARY_ACCOUNTS||'').split(','),productIds:String(process.env.WINGA_CANARY_PRODUCT_IDS||'').split(','),since:process.env.WINGA_CANARY_SINCE});
    const cohort=require('./growth-policy').createGrowthPolicy(process.env);
    if(!input.accounts.every(cohort.allowsCreation))throw Object.assign(new Error('growth_canary_cohort_excluded'),{code:'GROWTH_CANARY_COHORT_EXCLUDED'});
    pool=new(require('pg').Pool)({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,application_name:'winga-growth-canary-reader'});
    client=await pool.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='5s'");
    const report=await readProductCanary((...a)=>client.query(...a),input);await client.query('COMMIT');console.log(JSON.stringify(report));
  }catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});console.error(JSON.stringify({ok:false,errorCode:/^[A-Z0-9_]{1,50}$/.test(error?.code||'')?error.code:'GROWTH_CANARY_READ_FAILED'}));process.exitCode=1;}
  finally{client?.release();await pool?.end();}
}
if(require.main===module)void main();
module.exports={readProductCanary,selection};
