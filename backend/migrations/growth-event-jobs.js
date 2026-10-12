module.exports=Object.freeze({id:'202610121602_growth_event_jobs_v1',statements:Object.freeze([
  `ALTER TABLE growth_loop_invites ADD COLUMN measurement_enabled BOOLEAN NOT NULL DEFAULT FALSE;
   ALTER TABLE growth_invite_requests ADD COLUMN measurement_enabled BOOLEAN NOT NULL DEFAULT FALSE;`,
  `CREATE TABLE growth_event_jobs (
    event_id TEXT PRIMARY KEY CHECK(length(event_id) BETWEEN 1 AND 160),
    share_id TEXT NOT NULL REFERENCES growth_shares(id) ON DELETE CASCADE,
    actor_key TEXT NOT NULL CHECK(actor_key ~ '^[a-f0-9]{64}$'),
    event_type TEXT NOT NULL CHECK(length(event_type) BETWEEN 1 AND 64),
    verification TEXT NOT NULL CHECK(verification IN ('server','client_observed')),
    client_duration_ms INTEGER CHECK(client_duration_ms BETWEEN 0 AND 300000),
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','dead')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 6),
    available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deadline_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()+INTERVAL '24 hours',
    last_error TEXT NOT NULL DEFAULT '' CHECK(length(last_error)<=80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(share_id,actor_key,event_type),CHECK(deadline_at>created_at));`,
  `CREATE INDEX growth_event_jobs_ready ON growth_event_jobs(available_at,created_at,event_id) WHERE status='pending';`
])});
