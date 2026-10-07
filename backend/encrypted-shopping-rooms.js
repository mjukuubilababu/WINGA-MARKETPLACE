const crypto=require('node:crypto');
const {failure}=require('./encrypted-content-contract');
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const owner=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v);
const decimal=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v);
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const need=(ok,code='encrypted_room_invalid',status=400)=>{if(!ok)throw failure(status,code);};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const proof=(c,op)=>({owner:c.owner,sessionId:c.deviceId,...op});
const fields=Object.freeze({
  'room-directory':['owners'],'room-reserve':['intent','name','sourceHash'],'room-intent':['conversationId','transitionId'],
  'room-transfer':['version','conversationId','intent','epoch','commit','welcome','tree'],
  'room-accept':['conversationId','transitionId','transferHash','signature'],
  'room-check':['conversationId','epoch','revision'],'room-poll':['after'],
  'room-preferences':['conversationId'],
  'room-preference-save':['conversationId','revision','field','value'],
  'room-leave':['conversationId','epoch','revision'],
  'room-history-epoch':['conversationId','epoch'],
  'room-archive-read':['id','conversationId','epoch','hash','kind'],
  'room-archive-read-ack':['id','conversationId','epoch','hash','kind','receiptDeviceId'],
  'room-media-history-grant':['id','conversationId','messageId','bytes','sha256'],
  'room-send':['id','conversationId','epoch','deviceId','ciphertext','hash'],
  'room-receipt':['id','conversationId','epoch','hash','kind'],
  'room-receipt-ack':['id','conversationId','epoch','hash','kind','receiptDeviceId'],
  'room-media-reserve':['id','conversationId','messageId','bytes','sha256'],
  'room-reject':['id','conversationId','epoch','hash','reason']
});
function parseIntent(text) {
  need(typeof text==='string'&&Buffer.byteLength(text)<=65536);let i;
  try{i=JSON.parse(text);}catch{need(false);}
  need(JSON.stringify(i)===text&&exact(i,['version','kind','id','conversationId','previousEpoch','revision','actorOwner','actorDeviceId','roster','roles','changes'])
    &&i.version===1&&i.kind==='shopping-room'&&uuid(i.id)&&uuid(i.conversationId)&&decimal(i.previousEpoch)&&decimal(i.revision)&&i.revision!=='0'
    &&owner(i.actorOwner)&&uuid(i.actorDeviceId));
  const arrays={};
  for(const key of ['roster','roles','changes']){need(typeof i[key]==='string'&&Buffer.byteLength(i[key])<=32768);
    try{arrays[key]=JSON.parse(i[key]);}catch{need(false);}need(Array.isArray(arrays[key])&&JSON.stringify(arrays[key])===i[key]);}
  const {roster,roles,changes}=arrays,owners=new Map(),ids=new Set(),keys=new Set();let prev='';
  need(roster.length>=1&&roster.length<=24);
  for(const m of roster){const order=m.owner+'/'+m.id;
    need(exact(m,['owner','id','fingerprint','key'])&&owner(m.owner)&&uuid(m.id)&&/^[a-f0-9]{64}$/.test(m.fingerprint)
      &&Array.isArray(m.key)&&m.key.length===32&&m.key.every(n=>Number.isInteger(n)&&n>=0&&n<=255)
      &&order>prev&&!ids.has(m.id)&&!keys.has(JSON.stringify(m.key)));
    prev=order;ids.add(m.id);keys.add(JSON.stringify(m.key));owners.set(m.owner,(owners.get(m.owner)||0)+1);}
  need(owners.size>=1&&owners.size<=12&&[...owners.values()].every(n=>n<=4)&&roles.length===owners.size);prev='';
  for(const r of roles){need(exact(r,['owner','role'])&&owners.has(r.owner)&&r.owner>prev&&['admin','member'].includes(r.role));prev=r.owner;}
  need(roles.some(r=>r.role==='admin')&&roster.some(m=>m.owner===i.actorOwner&&m.id===i.actorDeviceId));
  need(changes.length>=1&&changes.length<=24);prev='';
  for(const c of changes){need(exact(c,c.type==='add'?['type','owner','id','packageHash']:c.type==='role'?['type','owner','id','role']:['type','owner','id'])&&['add','remove','role'].includes(c.type)
    &&owner(c.owner)&&uuid(c.id)&&(c.type==='role'||c.id!==i.actorDeviceId)&&c.id>prev&&(c.type!=='add'||/^[a-f0-9]{64}$/.test(c.packageHash))
    &&(c.type!=='role'||['admin','member'].includes(c.role)));prev=c.id;}
  return {i,roster,roles,changes,owners:[...owners.keys()]};
}
const transferHash=p=>hash(JSON.stringify(['winga-mls-room-transfer',1,p.intent,p.epoch,...['commit','welcome','tree'].map(k=>hash(Buffer.from(p[k],'base64url')))]));
function createShoppingRooms({packages,consumeQuota,enqueuePush,media,mediaEnabled=false,multiDeviceEnabled=false,roomLimits}) {
  const policy=require('./encrypted-room-limits'),limits=policy.roomLimits(roomLimits);
  const size=parsed=>({maxOwners:parsed.owners.length,maxDevices:parsed.roster.length});
  // Admission bounds do not reinterpret immutable rosters or exact accepted retries.
  function admission(parsed,before){const next=size(parsed),old=before&&size(before);
    need(next.maxOwners<=limits.maxOwners||(old&&next.maxOwners<=old.maxOwners),'encrypted_room_member_limit',409);
    need(next.maxDevices<=limits.maxDevices||(old&&next.maxDevices<=old.maxDevices),'encrypted_room_device_limit',409);}
  async function latest(client,id){return (await client.query(`SELECT * FROM encrypted_room_transitions WHERE conversation_id=$1 ORDER BY revision DESC LIMIT 1`,[id])).rows[0];}
  async function departures(client,id){return (await client.query(`SELECT * FROM encrypted_room_departures WHERE conversation_id=$1 AND status='pending' ORDER BY owner_id`,[id])).rows;}
  const preference=row=>({revision:row?.row_version?String(row.row_version):'0',muted:row?.muted===true,archived:row?.archived===true});
  async function readPreference(client,owner,id){return (await client.query(`SELECT row_version::text,muted,archived,last_request_id,last_request_hash
    FROM encrypted_room_preferences WHERE owner_id=$1 AND conversation_id=$2`,[owner,id])).rows[0];}
  async function activeOwners(client,members){
    const owners=[...new Set(members.map(m=>m.owner))];
    need((await client.query(`SELECT username FROM users WHERE username=ANY($1::text[]) AND status='active'`,[owners])).rows.length===owners.length,'encrypted_room_access_denied',403);
    need(!(await client.query(`SELECT 1 FROM user_blocks WHERE blocker_username=ANY($1::text[]) AND blocked_username=ANY($1::text[]) LIMIT 1`,[owners])).rows.length,'encrypted_room_access_denied',403);
    const ds=(await client.query(`SELECT id,owner_id,fingerprint FROM conversation_crypto_devices WHERE id=ANY($1::text[]) AND status='active' FOR SHARE`,[members.map(m=>m.id)])).rows;
    need(ds.length===members.length&&members.every(m=>ds.some(d=>d.id===m.id&&d.owner_id===m.owner&&d.fingerprint===m.fingerprint)),'encrypted_room_device_revoked',403);
  }
  async function member(client,c,actor,g,{pending=true,retiring=[],allowDeparture=false,selfLeave=false}={}) {
    need(g?.kind==='shopping-room','encrypted_room_membership_required',403);
    const t=await latest(client,g.id);need(t,'encrypted_room_membership_required',403);
    const parsed=parseIntent(t.intent);
    need(parsed.roster.some(m=>m.owner===c.owner&&m.id===actor),'encrypted_room_membership_required',403);
    need(!(await client.query(`SELECT 1 FROM encrypted_room_departures WHERE conversation_id=$1 AND owner_id=$2
      AND (status='pending' OR (transition_id IS NULL AND status='completed' AND epoch=$3))`,[g.id,c.owner,g.epoch])).rows.length,'encrypted_room_membership_required',403);
    const leaving=await departures(client,g.id);
    await activeOwners(client,parsed.roster.filter(m=>!retiring.includes(m.id)&&!leaving.some(d=>d.owner_id===m.owner)&&(!selfLeave||m.owner===c.owner&&m.id===actor)));
    if(!pending)need(t.status==='accepted'&&g.status==='active'&&g.epoch===t.epoch,'encrypted_room_membership_pending',409);
    if(!pending&&!allowDeparture)need(!(await departures(client,g.id)).length,'encrypted_room_membership_pending',409);
    return {t,...parsed};
  }
  async function snapshot(client,g,t){
    const {roster,changes}=parseIntent(t.intent),hashes=changes.filter(c=>c.type==='add').map(c=>c.packageHash);
    if(t.source_hash)hashes.push(t.source_hash);
    const current=(await client.query(`SELECT DISTINCT ON(device_id) hash FROM conversation_crypto_key_packages WHERE device_id=ANY($1::text[]) ORDER BY device_id,published_at DESC,hash`,[roster.map(m=>m.id)])).rows;
    hashes.push(...current.map(p=>p.hash));
    const acceptances=(await client.query(`SELECT owner_id AS owner,device_id AS "deviceId",signature FROM encrypted_room_acceptances WHERE transition_id=$1 ORDER BY owner_id,device_id`,[t.id])).rows;
    return {...g,transition:t,packages:await packages(client,[...new Set(hashes)]),acceptances,mediaEnabled,departures:await departures(client,g.id)};
  }
  async function handle(client,c,op){
    const p=op.payload;need(exact(p,op.action==='room-send'&&Object.hasOwn(p,'mediaId')?[...fields['room-send'],'mediaId']:fields[op.action]));
    if(['room-history-epoch','room-archive-read','room-archive-read-ack','room-media-history-grant'].includes(op.action))need(multiDeviceEnabled,'encrypted_multidevice_disabled',503);
    if(op.action==='room-directory'){
      let owners;try{owners=JSON.parse(p.owners);}catch{need(false);}
      need(Array.isArray(owners)&&JSON.stringify(owners)===p.owners&&owners.length>=2&&owners.length<=12&&owners.every(owner)
        &&owners.includes(c.owner)&&owners.every((v,j)=>j===0||v>owners[j-1]));
      need(owners.length<=limits.maxOwners,'encrypted_room_member_limit',409);
      need((await client.query(`SELECT username FROM users WHERE username=ANY($1::text[]) AND status='active'`,[owners])).rows.length===owners.length,'encrypted_room_access_denied',403);
      need(!(await client.query(`SELECT 1 FROM user_blocks WHERE blocker_username=ANY($1::text[]) AND blocked_username=ANY($1::text[]) LIMIT 1`,[owners])).rows.length,'encrypted_room_access_denied',403);
      const rows=(await client.query(`SELECT DISTINCT ON(p.device_id) p.hash FROM conversation_crypto_key_packages p JOIN conversation_crypto_devices d ON d.id=p.device_id
        WHERE d.owner_id=ANY($1::text[]) AND d.status='active' AND p.consumed_at IS NULL AND p.expires_at>NOW() ORDER BY p.device_id,p.published_at DESC,p.hash LIMIT 49`,[owners])).rows;
      need(rows.length<=48,'encrypted_room_device_limit',409);return {version:1,packages:await packages(client,rows.map(r=>r.hash))};
    }
    if(op.action==='room-reserve'){
      const parsed=parseIntent(p.intent),{i,roster,roles,changes}=parsed;
      need(i.actorOwner===c.owner&&i.actorDeviceId===op.actorId&&typeof p.name==='string'&&p.name.trim()===p.name&&p.name.length>=1&&p.name.length<=80);
      const prior=(await client.query(`SELECT * FROM encrypted_room_transitions WHERE id=$1`,[i.id])).rows[0];
      if(prior){need(prior.intent===p.intent&&prior.source_hash===(p.sourceHash||null),'encrypted_room_conflict',409);
        const g=(await client.query(`SELECT g.*,r.name,r.revision::text FROM encrypted_conversations g JOIN encrypted_shopping_rooms r ON r.conversation_id=g.id WHERE g.id=$1`,[i.conversationId])).rows[0];
        await member(client,c,op.actorId,g);need(g.name===p.name,'encrypted_room_conflict',409);return {version:1,room:await snapshot(client,g,prior)};}
      let g=(await client.query('SELECT * FROM encrypted_conversations WHERE id=$1 FOR UPDATE',[i.conversationId])).rows[0];
      if(i.previousEpoch==='0'){
        admission(parsed);
        need(!g&&i.revision==='1'&&parsed.owners.length>=3&&roles.some(r=>r.owner===c.owner&&r.role==='admin')&&/^[a-f0-9]{64}$/.test(p.sourceHash));
        need(changes.length===roster.length-1&&changes.every(ch=>ch.type==='add'&&roster.some(m=>m.id===ch.id&&m.owner===ch.owner)));
      }else{
        const before=await member(client,c,op.actorId,g,{pending:false,allowDeparture:true,retiring:changes.filter(ch=>ch.type==='remove').map(ch=>ch.id)});
        need(g.epoch===i.previousEpoch&&BigInt(i.revision)===BigInt(before.i.revision)+1n&&p.sourceHash===''&&before.roles.some(r=>r.owner===c.owner&&r.role==='admin'),'encrypted_room_admin_required',403);
        admission(parsed,before);
        const room=(await client.query(`SELECT name FROM encrypted_shopping_rooms WHERE conversation_id=$1`,[g.id])).rows[0];need(room.name===p.name);
        const removed=changes.filter(ch=>ch.type==='remove');
        const remaining=before.roster.filter(m=>!removed.some(ch=>ch.id===m.id&&ch.owner===m.owner));
        need(before.roster.length-remaining.length===removed.length);
        for(const ch of changes.filter(ch=>ch.type==='add')){need(!before.roster.some(m=>m.id===ch.id));const m=roster.find(m=>m.id===ch.id&&m.owner===ch.owner);need(m);remaining.push(m);}
        remaining.sort((a,b)=>a.owner+'/'+a.id<b.owner+'/'+b.id?-1:1);
        need(JSON.stringify(remaining)===i.roster);
        const roleChanges=changes.filter(ch=>ch.type==='role');
        if(roleChanges.length){
          const own=roleChanges.find(ch=>ch.owner===c.owner&&ch.role==='member'),target=roleChanges.find(ch=>ch.owner!==c.owner&&ch.role==='admin');
          need(roleChanges.length===2&&changes.length===2&&own&&target&&i.roster===before.i.roster
            &&before.roles.some(r=>r.owner===target.owner&&r.role==='member')
            &&roleChanges.every(ch=>before.roster.some(m=>m.owner===ch.owner&&m.id===ch.id))
            &&roles.every(r=>r.role===(r.owner===c.owner?'member':r.owner===target.owner?'admin':before.roles.find(b=>b.owner===r.owner)?.role)),
            'encrypted_room_role_transfer_rejected',403);
        }else need(roles.every(r=>!before.roles.some(b=>b.owner===r.owner)||before.roles.find(b=>b.owner===r.owner).role===r.role));
        need((await departures(client,g.id)).every(d=>!roster.some(m=>m.owner===d.owner_id)),'encrypted_room_departure_pending',409);
        const waiting=(await client.query(`SELECT 1 FROM encrypted_conversation_messages m JOIN encrypted_conversation_epoch_devices e ON e.conversation_id=m.conversation_id AND e.epoch=m.epoch
          WHERE m.conversation_id=$1 AND m.epoch=$2 AND e.device_id<>m.sender_device AND NOT(e.device_id=ANY($3::text[]))
          AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_receipts r WHERE r.message_id=m.id AND r.device_id=e.device_id AND r.kind='delivered')
          AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_rejections x WHERE x.message_id=m.id AND x.device_id=e.device_id) LIMIT 1`,[g.id,g.epoch,removed.map(m=>m.id)])).rows.length;
        need(!waiting,'encrypted_room_inbox_pending',409);
      }
      await activeOwners(client,roster);
      const packageHashes=changes.filter(ch=>ch.type==='add').map(ch=>ch.packageHash);if(p.sourceHash)packageHashes.push(p.sourceHash);
      const pkgs=(await client.query(`SELECT p.*,d.owner_id,d.fingerprint FROM conversation_crypto_key_packages p JOIN conversation_crypto_devices d ON d.id=p.device_id
        WHERE p.hash=ANY($1::text[]) AND p.consumed_at IS NULL AND p.expires_at>NOW() AND d.status='active' ORDER BY p.hash FOR UPDATE OF p`,[packageHashes])).rows;
      need(pkgs.length===packageHashes.length,'encrypted_package_unavailable',409);
      for(const m of roster){const ch=changes.find(ch=>ch.type==='add'&&ch.id===m.id),pkg=ch?pkgs.find(pkg=>pkg.hash===ch.packageHash):p.sourceHash&&m.id===op.actorId?pkgs.find(pkg=>pkg.hash===p.sourceHash):null;
        if(ch||i.previousEpoch==='0'){need(pkg&&pkg.device_id===m.id&&pkg.owner_id===m.owner&&pkg.fingerprint===m.fingerprint&&pkg.mls_public_key===Buffer.from(m.key).toString('base64url'),'encrypted_room_roster_rejected',409);}}
      if(!g){await consumeQuota(client,c.owner);const cid=hash(JSON.stringify(['winga-shopping-room',1,i.conversationId])).slice(0,32);
        await client.query(`INSERT INTO conversation_event_streams(id,kind,security_mode) VALUES($1,'shopping-room','encrypted')`,[cid]);
        await client.query(`INSERT INTO encrypted_conversations(id,canonical_id,creator,creator_device,kind,status) VALUES($1,$2,$3,$4,'shopping-room','reserved')`,[i.conversationId,cid,c.owner,op.actorId]);
        await client.query(`INSERT INTO encrypted_shopping_rooms(conversation_id,name) VALUES($1,$2)`,[i.conversationId,p.name]);
        g=(await client.query('SELECT * FROM encrypted_conversations WHERE id=$1',[i.conversationId])).rows[0];}
      await client.query(`INSERT INTO encrypted_room_transitions(id,conversation_id,previous_epoch,epoch,revision,actor_device,intent,source_hash,reservation_proof,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reserved')`,[i.id,g.id,i.previousEpoch,String(BigInt(i.previousEpoch)+1n),i.revision,op.actorId,p.intent,p.sourceHash||null,JSON.stringify(proof(c,op))]);
      await client.query(`UPDATE conversation_crypto_key_packages SET consumed_by=$1,consumed_at=NOW() WHERE hash=ANY($2::text[])`,[g.canonical_id,packageHashes]);
      g.name=p.name;g.revision=i.previousEpoch==='0'?'0':String(BigInt(i.revision)-1n);
      return {version:1,room:await snapshot(client,g,await latest(client,g.id))};
    }
    if(op.action==='room-poll'){
      need(p.after===null||uuid(p.after));
      const page=(await client.query(`SELECT g.*,r.name,r.revision::text FROM encrypted_conversations g JOIN encrypted_shopping_rooms r ON r.conversation_id=g.id
        WHERE ($1::text IS NULL OR g.id>$1) AND EXISTS(SELECT 1 FROM encrypted_room_transitions t,jsonb_array_elements((t.intent::jsonb->>'roster')::jsonb) m
          WHERE t.conversation_id=g.id AND m->>'id'=$2 AND m->>'owner'=$3) ORDER BY g.id LIMIT 101 FOR SHARE OF g`,[p.after,op.actorId,c.owner])).rows;
      const rooms=[];
      for(const g of page.slice(0,100)){
        let info;try{info=await member(client,c,op.actorId,g);}catch(e){if(e.status!==403)throw e;
          let leaveScope;try{await member(client,c,op.actorId,g,{pending:false,allowDeparture:true,selfLeave:true});leaveScope={epoch:g.epoch,revision:g.revision};}
          catch(error){if(![403,409].includes(error.status))throw error;}
          rooms.push({id:g.id,name:g.name,status:'removed',kind:'shopping-room',rotationPending:(await departures(client,g.id)).some(d=>d.owner_id===c.owner),
            ...(leaveScope?{leaveScope}:{}),preferences:preference(await readPreference(client,c.owner,g.id))});continue;}
        const r=await snapshot(client,g,info.t);r.preferences=preference(await readPreference(client,c.owner,g.id));r.messages=[];r.receipts=[];
        if(info.t.status==='accepted')r.messages=(await client.query(`SELECT m.*,m.sequence::text FROM encrypted_conversation_messages m
          JOIN encrypted_conversation_epoch_devices e ON e.conversation_id=m.conversation_id AND e.epoch=m.epoch AND e.device_id=$2
          WHERE m.conversation_id=$1 AND m.epoch=$3 AND m.sender_device<>$2
          AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_receipts r WHERE r.message_id=m.id AND r.device_id=$2 AND r.kind='delivered')
          AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_rejections x WHERE x.message_id=m.id AND x.device_id=$2)
          ORDER BY m.sequence LIMIT 100`,[g.id,op.actorId,g.epoch])).rows.map(m=>({...m,created_at:new Date(m.created_at).toISOString()}));
        if(info.t.status==='accepted')r.receipts=(await client.query(`SELECT r.proof FROM encrypted_conversation_receipts r JOIN encrypted_conversation_messages m ON m.id=r.message_id
          WHERE m.conversation_id=$1 AND m.sender_device=$2 AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_receipt_acks a
            WHERE a.message_id=r.message_id AND a.receipt_device=r.device_id AND a.kind=r.kind AND a.observer_device=$2)
          ORDER BY m.sequence,r.device_id,r.kind LIMIT 100`,[g.id,op.actorId])).rows.map(r=>r.proof);
        r.archiveReceipts=multiDeviceEnabled&&info.t.status==='accepted'?(await client.query(`SELECT a.proof FROM encrypted_conversation_archive_reads a
          JOIN encrypted_conversation_messages m ON m.id=a.message_id WHERE m.conversation_id=$1 AND m.epoch::numeric<$3::numeric
          AND EXISTS(SELECT 1 FROM encrypted_conversation_epoch_devices e WHERE e.conversation_id=m.conversation_id AND e.epoch=m.epoch AND e.owner_id=$4)
          AND a.device_id<>$2 AND NOT EXISTS(SELECT 1 FROM encrypted_conversation_archive_read_acks x
            WHERE x.message_id=a.message_id AND x.receipt_device=a.device_id AND x.observer_device=$2)
          ORDER BY m.sequence,a.device_id LIMIT 100`,[g.id,op.actorId,g.epoch,c.owner])).rows.map(a=>a.proof):[];
        rooms.push(r);
      }
      return {version:1,rooms,next:page.length>100?page[99].id:null};
    }
    need(uuid(p.conversationId));
    const g=(await client.query(`SELECT g.*,r.name,r.revision::text FROM encrypted_conversations g JOIN encrypted_shopping_rooms r ON r.conversation_id=g.id WHERE g.id=$1 FOR UPDATE OF g`,[p.conversationId])).rows[0];
    if(op.action==='room-leave'){
      const prior=(await client.query(`SELECT * FROM encrypted_room_departures WHERE conversation_id=$1 AND owner_id=$2 AND
        (id=$3 OR status='pending') ORDER BY created_at DESC LIMIT 1`,[g?.id,c.owner,op.requestId])).rows[0];
      if(prior){need(prior.epoch===p.epoch&&String(prior.revision)===p.revision,'encrypted_room_conflict',409);
        const current=parseIntent((await latest(client,g.id)).intent);
        need(prior.status==='pending'||!current.roster.some(m=>m.owner===c.owner)||g.epoch===prior.epoch,'encrypted_room_conflict',409);
        return {version:1,left:true,rotationPending:prior.status==='pending'};}
    }
    const info=await member(client,c,op.actorId,g,{selfLeave:op.action==='room-leave'}),{t}=info;
    if(op.action==='room-leave'){
      need(decimal(p.epoch)&&decimal(p.revision)&&p.epoch===g.epoch&&p.revision===g.revision&&t.status==='accepted','encrypted_room_conflict',409);
      const leaving=await departures(client,g.id);
      need(info.owners.length===1||info.roles.some(r=>r.owner!==c.owner&&r.role==='admin'&&!leaving.some(d=>d.owner_id===r.owner)),'encrypted_room_last_admin',409);
      const alone=info.owners.length===1;
      await client.query(`INSERT INTO encrypted_room_departures(id,conversation_id,owner_id,actor_device,epoch,revision,proof,status,completed_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $9 THEN NOW() ELSE NULL END)`,[op.requestId,g.id,c.owner,op.actorId,g.epoch,g.revision,JSON.stringify(proof(c,op)),alone?'completed':'pending',alone]);
      await client.query(`UPDATE web_push_jobs j SET completed_at=NOW(),lease_token=NULL,lease_until=NULL FROM encrypted_conversation_messages m
        WHERE j.owner_id=$1 AND j.message_id=m.id AND m.conversation_id=$2 AND j.completed_at IS NULL`,[c.owner,g.id]);
      await client.query(`DELETE FROM conversation_event_members WHERE conversation_id=$1 AND owner_id=$2`,[g.canonical_id,c.owner]);
      await client.query(`UPDATE conversation_device_deliveries SET cancelled_at=COALESCE(cancelled_at,NOW()) WHERE owner_id=$1 AND acknowledged_at IS NULL
        AND event_id IN(SELECT id FROM conversation_events WHERE conversation_id=$2)`,[c.owner,g.canonical_id]);
      await client.query(`UPDATE conversation_event_streams SET membership_version=membership_version+1 WHERE id=$1`,[g.canonical_id]);
      await client.query(`SELECT winga_append_conversation_event($1,'access_changed',NULL,$2,0)`,[g.canonical_id,c.owner]);
      return {version:1,left:true,rotationPending:!alone};
    }
    if(op.action==='room-history-epoch'){
      await member(client,c,op.actorId,g,{pending:false});
      need(decimal(p.epoch)&&p.epoch!=='0'&&BigInt(p.epoch)<=BigInt(g.epoch),'encrypted_room_history_access_denied',403);
      const epoch=(await client.query(`SELECT e.*,t.id,t.intent FROM encrypted_room_epochs e JOIN encrypted_room_transitions t
        ON t.conversation_id=e.conversation_id AND t.epoch=e.epoch AND t.status='accepted'
        WHERE e.conversation_id=$1 AND e.epoch=$2 AND EXISTS(SELECT 1 FROM encrypted_conversation_epoch_devices d
          WHERE d.conversation_id=e.conversation_id AND d.epoch=e.epoch AND d.owner_id=$3)`,[g.id,p.epoch,c.owner])).rows[0];
      need(epoch,'encrypted_room_history_access_denied',403);
      const acceptances=(await client.query(`SELECT owner_id AS owner,device_id AS "deviceId",signature FROM encrypted_room_acceptances WHERE transition_id=$1 ORDER BY owner_id,device_id`,[epoch.id])).rows;
      return {version:1,conversationId:g.id,epoch:p.epoch,intent:epoch.intent,transferHash:epoch.transfer_hash,acceptances};
    }
    if(op.action==='room-media-history-grant'){
      need(mediaEnabled,'private_media_disabled',503);await member(client,c,op.actorId,g,{pending:false});return media.grantHistory(client,c,op,g);
    }
    if(op.action.startsWith('room-archive-read')){
      await member(client,c,op.actorId,g,{pending:false});
      const m=(await client.query(`SELECT m.*,e.owner_id AS sender_owner FROM encrypted_conversation_messages m
        JOIN encrypted_conversation_epoch_devices e ON e.conversation_id=m.conversation_id AND e.epoch=m.epoch AND e.device_id=m.sender_device
        WHERE m.id=$1 AND m.conversation_id=$2 AND EXISTS(SELECT 1 FROM encrypted_conversation_epoch_devices old
          WHERE old.conversation_id=m.conversation_id AND old.epoch=m.epoch AND old.owner_id=$3)`,[p.id,g.id,c.owner])).rows[0];
      need(m&&p.kind==='read'&&m.epoch===p.epoch&&m.hash===p.hash&&BigInt(m.epoch)<BigInt(g.epoch),'encrypted_room_receipt_rejected',403);
      if(op.action==='room-archive-read'){
        need(m.sender_owner!==c.owner,'encrypted_room_receipt_rejected',403);
        const r=await client.query(`INSERT INTO encrypted_conversation_archive_reads(message_id,device_id,owner_id,proof)
          VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[m.id,op.actorId,c.owner,JSON.stringify(proof(c,op))]);
        if(r.rowCount)await client.query(`SELECT winga_append_conversation_event($1,'message_state_changed',$2,$3,0)`,[g.canonical_id,m.id,c.owner]);
      }else{
        need(uuid(p.receiptDeviceId)&&p.receiptDeviceId!==op.actorId&&(await client.query(`SELECT 1 FROM encrypted_conversation_archive_reads a
          WHERE a.message_id=$1 AND a.device_id=$2 AND EXISTS(SELECT 1 FROM encrypted_conversation_epoch_devices d
            WHERE d.conversation_id=$3 AND d.epoch=$4 AND d.owner_id=a.owner_id)`,[m.id,p.receiptDeviceId,g.id,m.epoch])).rows.length,'encrypted_room_receipt_rejected',403);
        await client.query(`INSERT INTO encrypted_conversation_archive_read_acks(message_id,receipt_device,observer_device,proof)
          VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[m.id,p.receiptDeviceId,op.actorId,JSON.stringify(proof(c,op))]);
      }
      return {version:1,ok:true};
    }
    if(op.action==='room-preferences')return preference(await readPreference(client,c.owner,g.id));
    if(op.action==='room-preference-save'){
      need(decimal(p.revision)&&['muted','archived'].includes(p.field)&&typeof p.value==='boolean');
      const before=await readPreference(client,c.owner,g.id),requestHash=hash(JSON.stringify(p));
      if(before?.last_request_id===op.requestId){need(before.last_request_hash===requestHash,'encrypted_room_preference_conflict',409);return preference(before);}
      need(preference(before).revision===p.revision,'encrypted_room_preference_conflict',409);
      const next={...preference(before),[p.field]:p.value};
      await client.query(`INSERT INTO encrypted_room_preferences(owner_id,conversation_id,muted,archived,last_request_id,last_request_hash)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id,conversation_id) DO UPDATE SET muted=EXCLUDED.muted,archived=EXCLUDED.archived,
        row_version=encrypted_room_preferences.row_version+1,last_request_id=EXCLUDED.last_request_id,last_request_hash=EXCLUDED.last_request_hash,updated_at=NOW()`,
        [c.owner,g.id,next.muted,next.archived,op.requestId,requestHash]);
      if(p.field==='muted'&&p.value)await client.query(`UPDATE web_push_jobs j SET completed_at=NOW(),lease_token=NULL,lease_until=NULL
        FROM encrypted_conversation_messages m WHERE j.owner_id=$1 AND j.message_id=m.id AND m.conversation_id=$2 AND j.completed_at IS NULL`,[c.owner,g.id]);
      return preference(await readPreference(client,c.owner,g.id));
    }
    if(op.action==='room-intent'){need(uuid(p.transitionId));
      const chosen=(await client.query(`SELECT * FROM encrypted_room_transitions WHERE conversation_id=$1 AND id=$2`,[g.id,p.transitionId])).rows[0];
      need(chosen&&chosen.id===t.id,'encrypted_room_conflict',409);return {version:1,room:await snapshot(client,g,chosen)};}
    if(op.action==='room-check')return {active:t.status==='accepted'&&g.status==='active'&&p.epoch===g.epoch&&p.revision===g.revision,conversationId:g.id,epoch:g.epoch,revision:g.revision};
    if(op.action==='room-transfer'){
      need(t.actor_device===op.actorId&&t.intent===p.intent&&p.version===4&&p.epoch===t.epoch,'encrypted_room_conflict',409);
      for(const k of ['commit','welcome','tree']){need(typeof p[k]==='string'&&Buffer.from(p[k],'base64url').length<=65536&&Buffer.from(p[k],'base64url').toString('base64url')===p[k]&&(p[k]!==''||k==='welcome'&&!info.changes.some(ch=>ch.type==='add')));}
      const mls=await import('ts-mls'),bytes=Buffer.from(p.commit,'base64url'),packet=mls.decodeMlsMessage(bytes,0);
      need(packet&&packet[1]===bytes.length&&['mls_public_message','mls_private_message'].includes(packet[0].wireformat));
      const wire=packet[0].privateMessage||packet[0].publicMessage?.content;
      need(wire&&Buffer.from(wire.groupId).toString('utf8')===g.id&&String(wire.epoch)===t.previous_epoch&&wire.contentType==='commit');
      const h=transferHash(p);if(t.transfer_hash)need(t.transfer_hash===h,'encrypted_room_conflict',409);
      else await client.query(`UPDATE encrypted_room_transitions SET transfer=$2,transfer_hash=$3,transfer_proof=$4,status='pending' WHERE id=$1`,[t.id,JSON.stringify(p),h,JSON.stringify(proof(c,op))]);
      return {version:1,status:t.status==='accepted'?'active':'pending',conversationId:g.id,epoch:t.epoch,transferHash:h};
    }
    if(op.action==='room-accept'){
      need(p.transitionId===t.id&&t.transfer_hash&&p.transferHash===t.transfer_hash&&typeof p.signature==='string','encrypted_room_acceptance_rejected',403);
      const sig=Buffer.from(p.signature,'base64url'),m=info.roster.find(m=>m.id===op.actorId);
      const key=crypto.createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(m.key)]),type:'spki',format:'der'});
      need(sig.length===64&&sig.toString('base64url')===p.signature&&crypto.verify(null,Buffer.from(JSON.stringify(['winga-mls-room-acceptance',1,g.id,t.epoch,t.transfer_hash,c.owner,op.actorId])),key,sig),'encrypted_room_acceptance_rejected',403);
      const prior=(await client.query(`SELECT signature FROM encrypted_room_acceptances WHERE transition_id=$1 AND device_id=$2`,[t.id,op.actorId])).rows[0];need(!prior||prior.signature===p.signature,'encrypted_room_conflict',409);
      await client.query(`INSERT INTO encrypted_room_acceptances(transition_id,device_id,owner_id,signature,proof) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[t.id,op.actorId,c.owner,p.signature,JSON.stringify(proof(c,op))]);
      const count=(await client.query(`SELECT COUNT(*)::int AS count FROM encrypted_room_acceptances WHERE transition_id=$1`,[t.id])).rows[0].count;
      if(count===info.roster.length&&t.status!=='accepted'){
        await client.query(`INSERT INTO encrypted_room_epochs(conversation_id,epoch,roster,roles,transfer_hash,revision) VALUES($1,$2,$3,$4,$5,$6)`,[g.id,t.epoch,info.i.roster,info.i.roles,t.transfer_hash,info.i.revision]);
        await client.query(`INSERT INTO encrypted_conversation_epochs(conversation_id,epoch) VALUES($1,$2)`,[g.id,t.epoch]);
        for(const m of info.roster)await client.query(`INSERT INTO encrypted_conversation_epoch_devices(conversation_id,epoch,device_id,owner_id) VALUES($1,$2,$3,$4)`,[g.id,t.epoch,m.id,m.owner]);
        const owners=info.owners;
        await client.query(`DELETE FROM conversation_event_members WHERE conversation_id=$1 AND NOT(owner_id=ANY($2::text[]))`,[g.canonical_id,owners]);
        await client.query(`UPDATE conversation_device_deliveries SET cancelled_at=COALESCE(cancelled_at,NOW()) WHERE acknowledged_at IS NULL
          AND event_id IN(SELECT id FROM conversation_events WHERE conversation_id=$1) AND NOT(owner_id=ANY($2::text[]))`,[g.canonical_id,owners]);
        for(const o of owners)await client.query(`INSERT INTO conversation_event_members(conversation_id,owner_id,joined_position)
          SELECT id,$2,position+1 FROM conversation_event_streams WHERE id=$1 ON CONFLICT DO NOTHING`,[g.canonical_id,o]);
        await client.query(`UPDATE encrypted_room_transitions SET status='accepted' WHERE id=$1`,[t.id]);
        await client.query(`UPDATE encrypted_conversations SET epoch=$2,status='active' WHERE id=$1`,[g.id,t.epoch]);
        await client.query(`UPDATE encrypted_shopping_rooms SET revision=$2 WHERE conversation_id=$1`,[g.id,info.i.revision]);
        await client.query(`UPDATE encrypted_room_departures SET status='completed',transition_id=$3,completed_at=NOW()
          WHERE conversation_id=$1 AND status='pending' AND NOT(owner_id=ANY($2::text[]))`,[g.id,owners,t.id]);
        await client.query(`UPDATE conversation_event_streams SET membership_version=membership_version+1 WHERE id=$1`,[g.canonical_id]);
        await client.query(`SELECT winga_append_conversation_event($1,'access_changed',NULL,$2,0)`,[g.canonical_id,c.owner]);
      }
      return {version:1,status:count===info.roster.length?'active':'pending',conversationId:g.id,epoch:t.epoch,transferHash:t.transfer_hash};
    }
    await member(client,c,op.actorId,g,{pending:false,allowDeparture:['room-receipt','room-receipt-ack','room-reject'].includes(op.action)});
    if(op.action==='room-media-reserve'){need(mediaEnabled,'private_media_disabled',503);need(uuid(p.id)&&uuid(p.messageId));return media.reserve(client,c,op,g);}
    if(op.action==='room-send'){
      if(Object.hasOwn(p,'mediaId'))need(mediaEnabled&&uuid(p.mediaId),'private_media_disabled',503);
      need(uuid(p.id)&&p.deviceId===op.actorId&&p.epoch===g.epoch&&typeof p.ciphertext==='string');
      const bytes=Buffer.from(p.ciphertext,'base64url');need(bytes.length<=65536&&bytes.toString('base64url')===p.ciphertext&&hash(bytes)===p.hash);
      const mls=await import('ts-mls'),parsed=mls.decodeMlsMessage(bytes,0);
      need(parsed&&parsed[1]===bytes.length&&parsed[0].wireformat==='mls_private_message'&&parsed[0].privateMessage.contentType==='application'
        &&Buffer.from(parsed[0].privateMessage.groupId).toString('utf8')===g.id&&String(parsed[0].privateMessage.epoch)===g.epoch);
      let m=(await client.query(`SELECT * FROM encrypted_conversation_messages WHERE id=$1`,[p.id])).rows[0];
      if(m)need(m.conversation_id===g.id&&m.sender_device===op.actorId&&m.epoch===p.epoch&&m.hash===p.hash&&m.ciphertext===p.ciphertext&&(m.media_id||null)===(p.mediaId||null),'encrypted_room_send_conflict',409);
      else{const seq=(await client.query(`UPDATE encrypted_conversations SET next_sequence=next_sequence+1 WHERE id=$1 RETURNING next_sequence::text`,[g.id])).rows[0].next_sequence;
        m=(await client.query(`INSERT INTO encrypted_conversation_messages(id,conversation_id,sender_device,epoch,sequence,ciphertext,hash,proof)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[p.id,g.id,op.actorId,p.epoch,seq,p.ciphertext,p.hash,JSON.stringify(proof(c,op))])).rows[0];
        await media.attach(client,g,op,p);
        for(const o of info.owners.filter(o=>o!==c.owner))await enqueuePush(client,{id:p.id,senderId:c.owner,receiverId:o,roomId:g.id});
        await client.query(`SELECT winga_append_conversation_event($1,'message_created',$2,$3,0)`,[g.canonical_id,p.id,c.owner]);}
      return {id:m.id,hash:m.hash,status:'sent',sequence:String(m.sequence),createdAt:new Date(m.created_at).toISOString()};
    }
    need(['room-receipt','room-receipt-ack','room-reject'].includes(op.action)&&uuid(p.id));
    const m=(await client.query(`SELECT * FROM encrypted_conversation_messages WHERE id=$1 AND conversation_id=$2`,[p.id,g.id])).rows[0];
    if(op.action==='room-receipt-ack'){
      need(m&&m.sender_device===op.actorId&&m.epoch===p.epoch&&m.hash===p.hash&&uuid(p.receiptDeviceId)&&['delivered','read'].includes(p.kind),'encrypted_room_receipt_rejected',403);
      need((await client.query(`SELECT 1 FROM encrypted_conversation_receipts WHERE message_id=$1 AND device_id=$2 AND kind=$3`,[m.id,p.receiptDeviceId,p.kind])).rows.length,'encrypted_room_receipt_rejected',403);
      await client.query(`INSERT INTO encrypted_conversation_receipt_acks(message_id,receipt_device,kind,observer_device,proof) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[m.id,p.receiptDeviceId,p.kind,op.actorId,JSON.stringify(proof(c,op))]);return {version:1,ok:true};
    }
    need(m&&m.sender_device!==op.actorId&&m.epoch===p.epoch&&m.hash===p.hash&&(await client.query(`SELECT 1 FROM encrypted_conversation_epoch_devices
      WHERE conversation_id=$1 AND epoch=$2 AND device_id=$3 AND owner_id=$4`,[g.id,m.epoch,op.actorId,c.owner])).rows.length,'encrypted_room_receipt_rejected',403);
    if(op.action==='room-reject'){need(p.reason==='invalid-ciphertext');await client.query(`INSERT INTO encrypted_conversation_rejections(message_id,device_id,proof) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[m.id,op.actorId,JSON.stringify(proof(c,op))]);}
    else{need(['delivered','read'].includes(p.kind));await client.query(`INSERT INTO encrypted_conversation_receipts(message_id,device_id,kind,proof) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[m.id,op.actorId,p.kind,JSON.stringify(proof(c,op))]);}
    return {version:1,ok:true};
  }
  return {handle,access:member,frozen:async(client,id)=>{const t=await latest(client,id);return Boolean(t&&t.status!=='accepted')||(await departures(client,id)).length>0;}};
}
module.exports={createShoppingRooms,fields,parseIntent,transferHash};
