import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
export const realPostgres=process.env.WINGA_TEST_SHOPPING_ROOMS_POSTGRES==='true';

export async function roomDatabase(t){
  if(!realPostgres){const db=new PGlite();t.after(()=>db.close());return db;}
  const connectionString=process.env.WINGA_TEST_POSTGRES_URL;
  if(!connectionString||!['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname))
    throw new Error('Explicit disposable localhost WINGA_TEST_POSTGRES_URL is required.');
  const {Pool,Client}=require('pg'),schema='winga_room_test_'+randomBytes(10).toString('hex');
  const admin=new Client({connectionString});await admin.connect();
  let pool;
  t.after(async()=>{try{if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.end();}});
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool=new Pool({connectionString,max:6,options:`-c search_path=${schema},public -c statement_timeout=10000 -c lock_timeout=7000`});
  const adapt=c=>({query:(...args)=>c.query(...args),exec:sql=>c.query(sql)});
  async function transactionOn(c,work){
    await c.query('BEGIN');try{const result=await work(adapt(c));await c.query('COMMIT');return result;}
    catch(error){await c.query('ROLLBACK');throw error;}
  }
  return {...adapt(pool),pool,admin,transactionOn,
    transaction:async work=>{const c=await pool.connect();try{return await transactionOn(c,work);}finally{c.release();}}};
}
