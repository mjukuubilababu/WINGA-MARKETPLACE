const {fail,key,insertEvent}=require('./growth-infrastructure');
const contract=require('../src/growth/contract');
const allowed=new Set([...contract.events,...contract.contentEvents,...contract.referralEvents,...contract.roomEvents,'content_share_created','shared_content_reshared','product_share_created','shared_product_reshared','room_invite_created','room_invite_requested','room_invite_reported','room_inviter_blocked']);
async function enqueueGrowthEvent(client,eventId,shareId,actorKey,eventType,verification,durationMs=null,occurredAt=null){
  if(typeof eventId!=='string'||!/^[A-Za-z0-9:_-]{1,160}$/.test(eventId)||!contract.uuid(shareId)||!/^[a-f0-9]{64}$/.test(actorKey)
    ||!allowed.has(eventType)||!['server','client_observed'].includes(verification)
    ||durationMs!==null&&(!Number.isInteger(durationMs)||durationMs<0||durationMs>300000))fail(400,'growth_event_invalid');
  const result=await client.query(`INSERT INTO growth_event_jobs(event_id,share_id,actor_key,event_type,verification,client_duration_ms,occurred_at,created_at,deadline_at)
    SELECT $1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,clock_timestamp()),COALESCE($7::timestamptz,clock_timestamp()),COALESCE($7::timestamptz,clock_timestamp())+INTERVAL '24 hours'
    WHERE COALESCE($7::timestamptz,clock_timestamp())+INTERVAL '24 hours'>clock_timestamp()
    ON CONFLICT DO NOTHING RETURNING event_id`,
    [eventId,shareId,actorKey,eventType,verification,durationMs,occurredAt]);
  if(!result.rows.length){const old=(await client.query('SELECT share_id,actor_key,event_type FROM growth_event_jobs WHERE event_id=$1',[eventId])).rows[0];
    if(old&&(old.share_id!==shareId||old.actor_key!==actorKey||old.event_type!==eventType))fail(409,'growth_event_conflict');}
  return result.rows.length>0;
}
function createGrowthEventJobs({query,withTransaction,enabled=false,eventWriter=insertEvent,cohort=require('./growth-policy').createGrowthPolicy(process.env)}){
  async function processGrowthEventJobs({batchSize=50}={}){
    if(!enabled)return {processed:0,disabled:true};
    const limit=Math.max(1,Math.min(50,Math.trunc(Number(batchSize)||50)));
    return withTransaction(async client=>{
      await client.query(`WITH expired AS (SELECT event_id FROM growth_event_jobs WHERE status='pending' AND deadline_at<=clock_timestamp() ORDER BY deadline_at LIMIT $1 FOR UPDATE SKIP LOCKED)
        UPDATE growth_event_jobs j SET status='dead',last_error='expired',updated_at=clock_timestamp() FROM expired e WHERE j.event_id=e.event_id`,[limit]);
      const jobs=(await client.query(`SELECT *,occurred_at::text AS occurred_at_text FROM growth_event_jobs WHERE status='pending' AND available_at<=clock_timestamp()
        AND deadline_at>clock_timestamp() ORDER BY available_at,created_at,event_id LIMIT $1 FOR UPDATE SKIP LOCKED`,[limit])).rows;
      let processed=0,failed=0;
      for(const job of jobs){
        await client.query('SAVEPOINT growth_event_delivery');
        try{
          const inserted=await eventWriter(client,job.event_id,job.share_id,job.actor_key,job.event_type,job.verification,job.client_duration_ms);
          if(inserted)await client.query('UPDATE growth_events SET created_at=$2 WHERE event_id=$1',[job.event_id,job.occurred_at_text]);
          await client.query("UPDATE growth_event_jobs SET status='completed',last_error='',updated_at=clock_timestamp() WHERE event_id=$1",[job.event_id]);
          await client.query('RELEASE SAVEPOINT growth_event_delivery');processed++;
        }catch(error){
          await client.query('ROLLBACK TO SAVEPOINT growth_event_delivery');await client.query('RELEASE SAVEPOINT growth_event_delivery');
          const attempts=Math.min(6,Number(job.attempts)+1),code=/^[A-Za-z0-9_]{1,80}$/.test(error.code||'')?error.code:'processing_error';
          const permanent=['growth_event_invalid','growth_event_conflict','23514','23503'].includes(code);
          await client.query(`UPDATE growth_event_jobs SET attempts=$2,status=$3,last_error=$4,
            available_at=clock_timestamp()+$5::integer*INTERVAL '1 second',updated_at=clock_timestamp() WHERE event_id=$1`,
            [job.event_id,attempts,permanent||attempts>=6?'dead':'pending',code,Math.min(300,5*2**attempts)]);failed++;
        }
      }
      return {processed,failed,hasMore:jobs.length===limit};
    });
  }
  async function reconcileRoomGrowthEvents({batchSize=50}={}){
    if(!enabled)return {queued:0,disabled:true};
    const limit=Math.max(1,Math.min(50,Math.trunc(Number(batchSize)||50)));
    return withTransaction(async client=>{
      const invitations=(await client.query(`SELECT s.id,s.owner_username,s.created_at::text AS source_created_at FROM growth_shares s
        JOIN growth_loop_invites i ON i.share_id=s.id AND i.measurement_enabled
        WHERE s.created_at>=NOW()-INTERVAL '24 hours' AND s.owner_username IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM growth_event_jobs j WHERE j.event_id='invite-created:'||s.id)
        ORDER BY s.created_at LIMIT $1`,[limit])).rows;
      let queued=0;
      for(const invite of invitations)if(cohort.allowsCreation(invite.owner_username)){
        if(await enqueueGrowthEvent(client,'invite-created:'+invite.id,invite.id,key('user:'+invite.owner_username),'room_invite_created','server',null,invite.source_created_at))queued++;
      }else await client.query('UPDATE growth_loop_invites SET measurement_enabled=FALSE WHERE share_id=$1',[invite.id]);
      const requests=(await client.query(`SELECT r.*,r.created_at::text AS source_created_at,r.accepted_at::text AS source_accepted_at,s.owner_username FROM growth_invite_requests r JOIN growth_shares s ON s.id=r.invite_id
        WHERE r.measurement_enabled AND NOT r.existing_member AND r.created_at>=NOW()-INTERVAL '24 hours'
          AND (NOT EXISTS(SELECT 1 FROM growth_event_jobs j WHERE j.event_id='invite-requested:'||r.invite_id||':'||r.actor_key)
            OR (r.status='accepted' AND r.accepted_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM growth_event_jobs j WHERE j.event_id='invite-accepted:'||r.invite_id||':'||r.actor_key)))
        ORDER BY r.created_at LIMIT $1`,[limit])).rows;
      for(const r of requests)if(cohort.allowsMeasurement(r.owner_username||'',r.recipient_username)){
        if(await enqueueGrowthEvent(client,'invite-requested:'+r.invite_id+':'+r.actor_key,r.invite_id,r.actor_key,'room_invite_requested','server',null,r.source_created_at))queued++;
        if(r.status==='accepted'&&r.accepted_at&&await enqueueGrowthEvent(client,'invite-accepted:'+r.invite_id+':'+r.actor_key,r.invite_id,r.actor_key,'room_invite_accepted','server',null,r.source_accepted_at))queued++;
      }else await client.query('UPDATE growth_invite_requests SET measurement_enabled=FALSE WHERE invite_id=$1 AND recipient_username=$2',[r.invite_id,r.recipient_username]);
      return {queued,hasMore:invitations.length===limit||requests.length===limit};
    });
  }
  async function readGrowthEventJobHealth(){
    const rows=(await query(`SELECT status,COUNT(*)::int AS count,MAX(attempts)::int AS "maxAttempts",
      EXTRACT(EPOCH FROM clock_timestamp()-MIN(created_at))::float8 AS "oldestAgeSeconds" FROM growth_event_jobs GROUP BY status ORDER BY status`)).rows;
    const gaps=(await query(`SELECT COUNT(*)::int AS missing,
      COUNT(*) FILTER(WHERE s.created_at<NOW()-INTERVAL '24 hours')::int AS expired
      FROM growth_shares s JOIN growth_loop_invites i ON i.share_id=s.id AND i.measurement_enabled
      WHERE s.created_at>=NOW()-INTERVAL '30 days'
        AND NOT EXISTS(SELECT 1 FROM growth_event_jobs j WHERE j.event_id='invite-created:'||s.id)
        AND NOT EXISTS(SELECT 1 FROM growth_events e WHERE e.share_id=s.id AND e.event_type='room_invite_created')`)).rows[0];
    return {schemaVersion:1,enabled,delivery:'at_least_once_with_canonical_event_dedupe',maxAttempts:6,lifetimeHours:24,states:rows,
      reconciliationGaps:{basis:'measurement_eligible_invitation_creation_last_30_days',missing:Number(gaps?.missing||0),expired:Number(gaps?.expired||0)}};
  }
  async function replayGrowthEventJobs(ids){
    if(!Array.isArray(ids)||ids.length>50||ids.some(id=>typeof id!=='string'||!/^[A-Za-z0-9:_-]{1,160}$/.test(id)))fail(400,'growth_replay_invalid');
    const result=await query(`UPDATE growth_event_jobs SET status='pending',attempts=0,available_at=clock_timestamp(),last_error='',updated_at=clock_timestamp()
      WHERE event_id=ANY($1::text[]) AND status='dead' AND deadline_at>clock_timestamp() RETURNING event_id`,[ids]);
    return {replayed:result.rows.length};
  }
  return {processGrowthEventJobs,reconcileRoomGrowthEvents,readGrowthEventJobHealth,replayGrowthEventJobs};
}
module.exports={enqueueGrowthEvent,createGrowthEventJobs};
