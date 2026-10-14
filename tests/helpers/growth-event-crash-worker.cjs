// Owned disposable fixture only: hold one canonical transaction after insertion.
const {Client}=require('pg');
const {insertEvent}=require('../../backend/growth-infrastructure');
const {createGrowthEventJobs}=require('../../backend/growth-event-jobs');
const connectionString=process.env.WINGA_TEST_POSTGRES_URL,schema=process.env.WINGA_TEST_GROWTH_SCHEMA;
const local=value=>{try{const u=new URL(value);return ['postgres:','postgresql:'].includes(u.protocol)
  &&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&!u.search&&!u.hash;}catch{return false;}};
if(process.env.WINGA_TEST_SHOPPING_ROOMS_POSTGRES!=='true'||!local(connectionString)
  ||!/^winga_room_test_[a-f0-9]{20}$/.test(schema||'')||typeof process.send!=='function')
  throw new Error('Owned disposable PostgreSQL and IPC fixture are required.');
const client=new Client({connectionString,options:`-c search_path=${schema},public -c statement_timeout=10000 -c lock_timeout=7000`});
(async()=>{
  await client.connect();
  const jobs=createGrowthEventJobs({enabled:true,query:(...args)=>client.query(...args),
    withTransaction:async work=>{
      await client.query('BEGIN');try{const result=await work(client);await client.query('COMMIT');return result;}
      catch(error){await client.query('ROLLBACK');throw error;}
    },eventWriter:async(...args)=>{
      const inserted=await insertEvent(...args);
      process.send({stage:'uncommitted_insert',pid:(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid});
      await new Promise(()=>{});return inserted;
    }});
  await jobs.processGrowthEventJobs({batchSize:1});
})().catch(async error=>{
  process.send({stage:'failed',code:/^[A-Za-z0-9_]{1,80}$/.test(error.code||'')?error.code:'fixture_error'});
  await client.end().catch(()=>{});process.exitCode=1;
});
