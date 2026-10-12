module.exports=Object.freeze({id:'202610121830_growth_account_cohorts_v1',statements:Object.freeze([
  `ALTER TABLE growth_events ADD COLUMN authenticated_actor_key TEXT CHECK(authenticated_actor_key IS NULL OR authenticated_actor_key ~ '^[a-f0-9]{64}$');`,
  `CREATE INDEX growth_events_account_time ON growth_events(authenticated_actor_key,created_at) WHERE authenticated_actor_key IS NOT NULL;`
])});
