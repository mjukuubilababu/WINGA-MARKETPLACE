import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import people from '../backend/people-search.js';

test('authenticated Person search finds buyers without prior chats and excludes self, staff, suspended and either block direction',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE users(username TEXT PRIMARY KEY,full_name TEXT,profile_image TEXT,role TEXT,status TEXT,phone TEXT);
      CREATE TABLE user_blocks(blocker_username TEXT,blocked_username TEXT);
      INSERT INTO users VALUES ('alice','Alice','avatar','buyer','active','PRIVATE'),('rey','Rey','','seller','active','PRIVATE'),
      ('ray_buyer','Ray New Buyer','','buyer','active','PRIVATE'),('rey_blocked','Rey Blocked','','buyer','active','PRIVATE'),
      ('rey_reverse','Rey Reverse','','buyer','active','PRIVATE'),('rey_staff','Rey Staff','','admin','active','PRIVATE'),
      ('rey_suspended','Rey Suspended','','seller','suspended','PRIVATE');
      INSERT INTO user_blocks VALUES ('alice','rey_blocked'),('rey_reverse','alice');`);
    const read=(viewer,query,limit)=>people.readPeopleSearch((sql,args)=>db.query(sql,args),viewer,{query,limit});
    assert.deepEqual((await read('alice','@rey')).items.map(x=>x.username),['rey']);
    assert.deepEqual((await read('alice','new buyer')).items.map(x=>x.username),['ray_buyer']);
    assert.equal((await read('alice','alice')).items.length,0);
    assert.equal((await read('ghost','rey')).items.length,0);
    assert.equal((await read('rey_staff','rey')).items.length,0);
    const result=await read('alice','ray');
    assert.deepEqual(Object.keys(result.items[0]).sort(),['fullName','profileImage','username']);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
    assert.equal((await read('alice','%_')).items.length,0);
  }finally{await db.close();}
});

test('search limits are bounded, SQL-like input is literal and invalid queries cannot read the directory',async()=>{
  const calls=[];
  const result=await people.readPeopleSearch(async(sql,args)=>{calls.push({sql,args});return {rows:Array.from({length:31},(_,i)=>({username:'person'+i,fullName:'Person',phone:'PRIVATE'}))};},'alice',{query:"x' OR 1=1 --",limit:999});
  assert.equal(result.items.length,30);assert.equal(result.hasMore,true);
  assert.deepEqual(calls[0].args,['alice',"x' or 1=1 --",31]);
  assert.ok(!calls[0].sql.includes("OR 1=1 --"));
  for(const query of ['', 'a','x'.repeat(81),'bad\nname'])await assert.rejects(people.readPeopleSearch(()=>assert.fail('No query'),'alice',{query}),{code:'people_search_invalid'});
});
