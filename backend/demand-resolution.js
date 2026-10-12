const {fail,key,quota,publicProduct}=require('./growth-infrastructure');
const {normalizeKey}=require('./commerce-opportunity');
function createDemandResolution({withTransaction,transitionGoal,insertNotification,enabled=false}) {
  async function subscribeSearchDemand({userId,audienceKey,query}) {
    if(!enabled)fail(503,'demand_resolution_disabled');
    const queryKey=normalizeKey(query,120);
    if(!userId||!audienceKey||queryKey.length<2)fail(400,'demand_subscription_invalid');
    return withTransaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['demand-subscription:'+userId+':'+queryKey]);
      const existing=(await client.query(`SELECT goal_id AS "goalId",status FROM commerce_goals WHERE user_id=$1
        AND product_id IS NULL AND query_key=$2 AND metadata->>'source'='search_subscription'
        AND status IN ('looking','matched','contacted','ordered') ORDER BY created_at LIMIT 1`,[userId,queryKey])).rows[0];
      if(existing)return {...existing,duplicate:true};
      const evidence=(await client.query(`SELECT event_id,query_key,detected_category,detected_color,region FROM search_demand_events
        WHERE audience_type='user' AND audience_key=$1 AND query_key=$2 AND happened_at>=NOW()-INTERVAL '30 days'
          AND (zero_result IS TRUE OR result_count BETWEEN 1 AND 3) ORDER BY happened_at DESC,event_id LIMIT 1`,[audienceKey,queryKey])).rows[0];
      if(!evidence)fail(404,'demand_subscription_evidence_required');
      await quota(client,'demand-subscribe:'+key(userId),5);
      const goalId='goal_search_'+key(userId+':'+evidence.event_id).slice(0,32);
      const metadata={source:'search_subscription',sourceEventId:evidence.event_id,notificationConsent:true,notificationMode:'in_app'};
      const row=(await client.query(`INSERT INTO commerce_goals(goal_id,user_id,query_key,category,color,region,metadata)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(goal_id) DO NOTHING RETURNING goal_id AS "goalId",status`,
        [goalId,userId,evidence.query_key,evidence.detected_category||'',evidence.detected_color||'',evidence.region||'',JSON.stringify(metadata)])).rows[0];
      if(!row)fail(409,'demand_subscription_closed');
      await client.query(`INSERT INTO commerce_goal_transitions(transition_id,goal_id,user_id,from_status,to_status,source,source_entity_type,source_entity_key,metadata)
        VALUES($1,$2,$3,'','looking','search_subscription','search_event',$4,'{"privacy":"self-scoped"}') ON CONFLICT DO NOTHING`,
        ['goal_subscription:'+goalId,goalId,userId,evidence.event_id]);
      return {...row,duplicate:false};
    });
  }
  async function processDemandResolutions({batchSize=50}={}) {
    if(!enabled)return {processed:0,disabled:true};
    return withTransaction(async client=>{
      // One bounded global processor lock keeps recipient caps correct across workers.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('winga-demand-resolutions'))");
      const candidates=(await client.query(`SELECT g.goal_id,g.user_id,g.product_id,g.metadata FROM commerce_goals g
        JOIN users u ON u.username=g.user_id AND u.status='active'
        WHERE g.status='looking' AND g.metadata->>'notificationConsent'='true'
          AND g.metadata->>'notificationMode'='in_app' AND g.created_at>=NOW()-INTERVAL '90 days'
          AND EXISTS(SELECT 1 FROM products p JOIN users seller ON seller.username=p.uploaded_by AND seller.status='active'
            WHERE p.status='approved' AND p.availability='available' AND p.uploaded_by<>g.user_id
              AND NOT EXISTS(SELECT 1 FROM public_content_visibility v WHERE v.content_type='product' AND v.content_id=p.id AND v.visibility<>'public')
              AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_username=g.user_id AND b.blocked_username=p.uploaded_by) OR (b.blocker_username=p.uploaded_by AND b.blocked_username=g.user_id))
              AND (p.id=g.product_id OR EXISTS(SELECT 1 FROM rediscovery_eligibility r JOIN supply_responses s ON s.response_id=r.supply_response_id AND s.status='active'
                WHERE r.product_id=p.id AND r.metadata->>'sourceEventId'=g.metadata->>'sourceEventId' AND r.expires_at>NOW())))
          AND (SELECT COUNT(*) FROM notifications n WHERE n.user_id=g.user_id AND n.type='demand'
            AND n.created_at>=NOW()-INTERVAL '1 day')<2
        ORDER BY g.created_at,g.goal_id LIMIT $1 FOR UPDATE OF g SKIP LOCKED`,[Math.min(50,Math.max(1,Number(batchSize)||50))])).rows;
      let processed=0;
      for(const goal of candidates){
        const capped=(await client.query("SELECT COUNT(*)::int AS count FROM notifications WHERE user_id=$1 AND type='demand' AND created_at>=NOW()-INTERVAL '1 day'",[goal.user_id])).rows[0];
        if(Number(capped.count)>=2)continue;
        const match=(await client.query(`SELECT p.id,p.uploaded_by FROM products p
          WHERE p.availability='available' AND p.uploaded_by<>$1 AND (p.id=$2 OR EXISTS(
            SELECT 1 FROM rediscovery_eligibility r JOIN supply_responses s ON s.response_id=r.supply_response_id AND s.status='active'
            WHERE r.product_id=p.id AND r.metadata->>'sourceEventId'=$3 AND r.expires_at>NOW()))
          ORDER BY (p.id=$2) DESC,p.created_at DESC,p.id LIMIT 5`,[goal.user_id,goal.product_id||'',goal.metadata.sourceEventId||''])).rows;
        let product;
        for(const p of match)if(await publicProduct(client,p.id,goal.user_id)){product=p;break;}
        if(!product)continue;
        const changed=await transitionGoal(client,{userId:goal.user_id,goalId:goal.goal_id,toStatus:'matched',source:'demand_supply_match',
          sourceEntityType:'product',sourceEntityKey:product.id,metadata:{privacy:'self-scoped',notificationMode:'in_app'}});
        if(!changed.length)continue;
        await insertNotification(client,{id:'demand-resolution:'+goal.goal_id,userId:goal.user_id,actorUsername:product.uploaded_by,
          type:'demand',messageId:product.id,conversationId:goal.goal_id,title:'Bidhaa inayoweza kuendana na ombi lako inapatikana',
          body:'Fungua bidhaa uhakiki size, rangi na upatikanaji. Unaweza kusitisha ombi lako.',createdAt:new Date().toISOString()});
        processed++;
      }
      return {processed,hasMore:candidates.length===Math.min(50,Math.max(1,Number(batchSize)||50))};
    });
  }
  return {subscribeSearchDemand,processDemandResolutions};
}
module.exports={createDemandResolution};
