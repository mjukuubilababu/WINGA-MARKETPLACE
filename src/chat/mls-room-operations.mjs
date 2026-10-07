import {createGroup,createCommit,joinGroup,createApplicationMessage,processPrivateMessage,emptyPskIndex,
  encodeGroupState,encodeMlsMessage,decodeMlsMessage} from 'ts-mls';
import {encodeRatchetTree,decodeRatchetTree} from 'ts-mls/ratchetTree.js';
import {decryptSenderData} from 'ts-mls/privateMessage.js';

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8',{fatal:true});
const need = (ok,code='mls_room_intent_rejected') => {if(!ok)throw Object.assign(new Error(code),{code});};
const uuid = v => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const ownerId = v => typeof v==='string' && /^[A-Za-z0-9._:-]{1,128}$/.test(v);
const exact = (v,keys) => v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const equal = (a,b) => a instanceof Uint8Array && b instanceof Uint8Array && a.length===b.length && a.every((v,i)=>v===b[i]);
const canonical = v => JSON.stringify(v);
const decimal = v => typeof v==='string' && /^(0|[1-9][0-9]{0,18})$/.test(v);
const decode = (method,bytes) => {
  need(bytes instanceof Uint8Array && bytes.length>0 && bytes.length<=65536,'mls_wire_rejected');
  const result=method(bytes,0);need(result && result[1]===bytes.length,'mls_wire_rejected');return result[0];
};
const contentBytes = c => encoder.encode(canonical(['winga-mls-room-content',1,c.id,c.conversationId,c.epoch,c.owner,c.deviceId,c.message]));
const acceptanceBytes = (t,h,owner,id) => encoder.encode(canonical(['winga-mls-room-acceptance',1,t.conversationId,t.epoch,h,owner,id]));
const transferFields=['version','conversationId','intent','epoch','commit','welcome','tree'];
const base64 = bytes => {
  let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
export function encodeRoomTransferPayload(value) {
  need(exact(value,transferFields) && value.version===4 && uuid(value.conversationId) && decimal(value.epoch)
    && typeof value.intent==='string' && value.intent.length<=65536,'mls_room_transfer_rejected');
  const result=structuredClone(value);
  // Nested reservation/roster data stays in one flat, natively signed string.
  for(const key of ['commit','welcome','tree']) {
    need(value[key] instanceof Uint8Array && value[key].length<=65536 && (value[key].length>0||key==='welcome'),'mls_wire_rejected');
    result[key]=base64(value[key]);
  }
  need(encoder.encode(canonical(result)).length<=262144,'mls_wire_rejected');return result;
}
export function decodeRoomTransferPayload(value) {
  need(exact(value,transferFields) && value.version===4 && uuid(value.conversationId) && decimal(value.epoch)
    && typeof value.intent==='string' && value.intent.length<=65536 && encoder.encode(canonical(value)).length<=262144,'mls_room_transfer_rejected');
  const result=structuredClone(value);
  for(const key of ['commit','welcome','tree']) {
    need(typeof value[key]==='string' && value[key].length<=87382 && (/^[A-Za-z0-9_-]+$/.test(value[key])||value[key]===''&&key==='welcome'),'mls_wire_rejected');
    try{result[key]=Uint8Array.from(atob(value[key].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}catch{need(false,'mls_wire_rejected');}
    need(result[key].length<=65536 && base64(result[key])===value[key],'mls_wire_rejected');
  }
  return result;
}

// Reuses the native runtime's vault CAS, owner lock, pins, journal and MLS suite.
// The authorization adapter must verify canonical server reservations and durable activation.
// The server-backed adapter is installed only behind the explicit Rooms gate.
export function createMlsRoomOperations({owner,vault,locked,put,record,state,config,roster,current,suite,hash,crypto,now,
  policy,transport,authorization,inspectPackage,retirePackage,wipePackage,wipe,noPendingSend,maxOwners=12,maxDevices=24}) {
  need(Number.isInteger(maxOwners) && maxOwners>=3 && maxOwners<=32 && Number.isInteger(maxDevices)
    && maxDevices>=maxOwners && maxDevices<=64,'mls_room_limits_invalid');
  need(typeof authorization?.verifyIntent==='function' && typeof authorization?.confirm==='function'
    && typeof authorization?.check==='function' && typeof policy?.markRoomEncrypted==='function','mls_room_service_required');
  const fields=['version','kind','id','conversationId','previousEpoch','revision','actorOwner','actorDeviceId','roster','roles','changes'];
  function parseIntent(value) {
    need(exact(value,fields) && value.version===1 && value.kind==='shopping-room' && uuid(value.id) && uuid(value.conversationId)
      && decimal(value.previousEpoch) && decimal(value.revision) && value.revision!=='0' && ownerId(value.actorOwner)
      && uuid(value.actorDeviceId) && typeof value.roster==='string' && value.roster.length<=32768
      && typeof value.roles==='string' && value.roles.length<=8192
      && typeof value.changes==='string' && value.changes.length<=32768);
    let members,changes;try{members=JSON.parse(value.roster);changes=JSON.parse(value.changes);}catch{need(false);}
    need(Array.isArray(members) && canonical(members)===value.roster && members.length>=1 && members.length<=maxDevices);
    const ids=new Set(),keys=new Set(),owners=new Map();let previous='';
    for(const m of members) {
      need(exact(m,['owner','id','fingerprint','key']) && ownerId(m.owner) && uuid(m.id) && /^[a-f0-9]{64}$/.test(m.fingerprint)
        && Array.isArray(m.key) && m.key.length===32 && m.key.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'mls_room_roster_rejected');
      const key=canonical(m.key),order=m.owner+'/'+m.id;
      need(!ids.has(m.id) && !keys.has(key) && order>previous,'mls_room_roster_rejected');
      previous=order;ids.add(m.id);keys.add(key);owners.set(m.owner,(owners.get(m.owner)||0)+1);
    }
    need(owners.size>=1 && owners.size<=maxOwners && [...owners.values()].every(n=>n<=4),'mls_room_roster_rejected');
    let roles;try{roles=JSON.parse(value.roles);}catch{need(false,'mls_room_roles_rejected');}
    need(Array.isArray(roles) && canonical(roles)===value.roles && roles.length===owners.size,'mls_room_roles_rejected');
    previous='';
    for(const r of roles){need(exact(r,['owner','role']) && owners.has(r.owner) && r.owner>previous && ['admin','member'].includes(r.role),'mls_room_roles_rejected');previous=r.owner;}
    need(roles.some(r=>r.role==='admin'),'mls_room_roles_rejected');
    need(Array.isArray(changes) && changes.length>=1 && changes.length<=maxDevices && canonical(changes)===value.changes);
    const changed=new Set();previous='';
    for(const change of changes) {
      need(exact(change,change.type==='add'?['type','owner','id','packageHash']:change.type==='role'?['type','owner','id','role']:['type','owner','id'])
        && ['add','remove','role'].includes(change.type) && ownerId(change.owner) && uuid(change.id)
        && (change.type==='role'||change.id!==value.actorDeviceId) && !changed.has(change.id) && change.id>previous
        && (change.type!=='add'||/^[a-f0-9]{64}$/.test(change.packageHash))&& (change.type!=='role'||['admin','member'].includes(change.role)));
      changed.add(change.id);previous=change.id;
    }
    need(members.some(m=>m.owner===value.actorOwner && m.id===value.actorDeviceId),'mls_room_roster_rejected');
    return {members,roles,changes};
  }
  async function intent(value) {
    const parsed=parseIntent(value);
    need(await authorization.verifyIntent(structuredClone(value))===true,'mls_room_authorization_rejected');current();return parsed;
  }
  async function boundMembers(members,configuration) {
    for(const m of members)need(await configuration.authService.validateCredential({credentialType:'basic',
      identity:encoder.encode(canonical(['winga-mls-device',1,m.owner,m.id,m.fingerprint]))},new Uint8Array(m.key)),'mls_untrusted_member');
  }
  async function packageProposals(changes,packages,configuration) {
    need(packages instanceof Map && packages.size===changes.filter(c=>c.type==='add').length,'mls_room_packages_rejected');
    const proposals=[];
    for(const c of changes.filter(c=>c.type==='add')) {
      const bytes=packages.get(c.id);need(bytes instanceof Uint8Array && bytes.length<=8192 && await hash(bytes)===c.packageHash,'mls_room_packages_rejected');
      const kp=decode(decodeMlsMessage,bytes);need(kp.wireformat==='mls_key_package','mls_room_packages_rejected');
      const tuple=JSON.parse(decoder.decode(kp.keyPackage.leafNode.credential.identity));
      need(tuple[2]===c.owner && tuple[3]===c.id,'mls_room_packages_rejected');
      await inspectPackage(bytes,{owner:c.owner,id:c.id,fingerprint:tuple[4]},now());
      need(await configuration.authService.validateCredential(kp.keyPackage.leafNode.credential,kp.keyPackage.leafNode.signaturePublicKey),'mls_untrusted_package');
      proposals.push({proposalType:'add',add:{keyPackage:kp.keyPackage}});
    }
    return proposals;
  }
  async function transferHash(t) {
    return hash(encoder.encode(canonical(['winga-mls-room-transfer',1,t.intent,t.epoch,await hash(t.commit),await hash(t.welcome),await hash(t.tree)])));
  }
  async function transfer(value) {
    need(exact(value,['version','conversationId','intent','epoch','commit','welcome','tree']) && value.version===4
      && uuid(value.conversationId) && typeof value.intent==='string' && value.intent.length<=65536 && decimal(value.epoch),'mls_room_transfer_rejected');
    let reservation;try{reservation=JSON.parse(value.intent);}catch{need(false,'mls_room_transfer_rejected');}
    parseIntent(reservation);
    need(canonical(reservation)===value.intent && reservation.conversationId===value.conversationId
      && BigInt(value.epoch)===BigInt(reservation.previousEpoch)+1n,'mls_room_transfer_rejected');
    const parsed=await intent(reservation);
    for(const key of ['commit','tree','welcome'])need(value[key] instanceof Uint8Array && value[key].length<=65536
      && (value[key].length>0 || key==='welcome' && !parsed.changes.some(c=>c.type==='add')),'mls_wire_rejected');
    return {...parsed,reservation,digest:await transferHash(value)};
  }
  async function saveTransition(saved,group,changed,reservation) {
    const t={version:4,conversationId:reservation.conversationId,intent:canonical(reservation),epoch:String(changed.newState.groupContext.epoch),
      commit:encodeMlsMessage(changed.commit),tree:encodeRatchetTree(changed.newState.ratchetTree),
      welcome:changed.welcome?encodeMlsMessage({version:'mls10',wireformat:'mls_welcome',welcome:changed.welcome}):new Uint8Array()};
    const h=await transferHash(t),id=reservation.conversationId;
    await put(saved,{[`mls:group:${id}`]:{...group,kind:'shopping-room',peer:'room:'+id,roomRoster:reservation.roster,
      roomRoles:reservation.roles,roomRevision:reservation.revision,bytes:encodeGroupState(changed.newState),confirmed:false},
      [`mls:membership:${id}`]:t,[`mls:room-transition:${reservation.id}`]:h,
      [`mls:room-epoch:${id}:${t.epoch}`]:{roster:reservation.roster,roles:reservation.roles,confirmed:false}});return structuredClone(t);
  }
  function unchangedRoles(group,reservation) {
    const before=JSON.parse(group.roomRoles),after=JSON.parse(reservation.roles);
    need(before.some(r=>r.owner===reservation.actorOwner&&r.role==='admin'),'mls_room_admin_required');
    const changes=JSON.parse(reservation.changes),roles=changes.filter(c=>c.type==='role');
    if(roles.length){const own=roles.find(c=>c.owner===reservation.actorOwner&&c.role==='member'),target=roles.find(c=>c.owner!==reservation.actorOwner&&c.role==='admin'),members=JSON.parse(group.roomRoster);
      need(roles.length===2&&changes.length===2&&own&&target&&group.roomRoster===reservation.roster
        &&before.some(r=>r.owner===target.owner&&r.role==='member')&&roles.every(c=>members.some(m=>m.owner===c.owner&&m.id===c.id))
        &&after.every(r=>r.role===(r.owner===reservation.actorOwner?'member':r.owner===target.owner?'admin':before.find(b=>b.owner===r.owner)?.role)),
        'mls_room_roles_rejected');
    }else need(after.every(r=>!before.some(b=>b.owner===r.owner) || before.find(b=>b.owner===r.owner).role===r.role),'mls_room_roles_rejected');
  }
  async function create(reservation,packages) {
    reservation=structuredClone(reservation);packages=structuredClone(packages);
    return locked(async()=>{
      const {members,roles,changes}=await intent(reservation),saved=await vault.snapshot(),own=saved.values['mls:identity'],id=reservation.conversationId;
      need(reservation.actorOwner===owner && reservation.actorDeviceId===own?.id,'mls_room_membership_required');
      const pending=saved.values[`mls:membership:${id}`];
      if(pending){need(pending.intent===canonical(reservation),'mls_replay_conflict');return structuredClone(pending);}
      need(reservation.previousEpoch==='0' && reservation.revision==='1' && reservation.actorOwner===owner && reservation.actorDeviceId===own?.id
        && !saved.values[`mls:group:${id}`] && members.length>=3 && new Set(members.map(m=>m.owner)).size>=3,'mls_room_initial_membership_required');
      need(roles.some(r=>r.owner===owner&&r.role==='admin'),'mls_room_admin_required');
      need(own && saved.values['mls:published']===own.hash && !(await record(saved,`mls:consumed:${own.hash}`)),'mls_package_consumed');
      const {configuration}=await config(saved);await boundMembers(members,configuration);
      await inspectPackage(own.bytes,own,now());
      need(changes.length===members.length-1 && changes.every(c=>c.type==='add' && members.some(m=>m.owner===c.owner && m.id===c.id)),'mls_room_roster_rejected');
      const proposals=await packageProposals(changes,packages,configuration);
      const group=await createGroup(encoder.encode(id),own.package.publicPackage,own.package.privatePackage,[],suite,configuration);
      let changed;
      try {
        changed=await createCommit({state:group,cipherSuite:suite},{extraProposals:proposals});
        need(canonical(roster(changed.newState))===reservation.roster,'mls_room_roster_rejected');
        await policy.markRoomEncrypted(owner,id);current();
        // Admission secrets and the complete group transition commit atomically.
        const t={version:4,conversationId:id,intent:canonical(reservation),epoch:String(changed.newState.groupContext.epoch),
          commit:encodeMlsMessage(changed.commit),tree:encodeRatchetTree(changed.newState.ratchetTree),
          welcome:encodeMlsMessage({version:'mls10',wireformat:'mls_welcome',welcome:changed.welcome})};
        await put(saved,{[`mls:group:${id}`]:{kind:'shopping-room',peer:'room:'+id,roomRoster:reservation.roster,roomRoles:reservation.roles,roomRevision:'1',bytes:encodeGroupState(changed.newState),confirmed:false},
          [`mls:membership:${id}`]:t,[`mls:room-transition:${reservation.id}`]:await transferHash(t),
          [`mls:room-epoch:${id}:${t.epoch}`]:{roster:reservation.roster,roles:reservation.roles,confirmed:false},
          [`mls:consumed:${own.hash}`]:true,'mls:package-consumed':own.hash,'mls:identity':retirePackage(own)});
        wipePackage(own);return structuredClone(t);
      } finally {wipe(changed);}
    });
  }
  async function change(reservation,packages=new Map()) {
    reservation=structuredClone(reservation);packages=structuredClone(packages);
    return locked(async()=>{
      const {members,changes}=await intent(reservation),saved=await vault.snapshot(),id=reservation.conversationId,own=saved.values['mls:identity'];
      need(reservation.actorOwner===owner && reservation.actorDeviceId===own?.id,'mls_room_membership_required');
      const pending=saved.values[`mls:membership:${id}`];
      if(pending){need(pending.intent===canonical(reservation),'mls_replay_conflict');return structuredClone(pending);}
      const removed=changes.filter(c=>c.type==='remove');
      const g=await state(saved,id,removed.map(c=>c.id),true);
      need(g.row.confirmed && reservation.actorOwner===owner && reservation.actorDeviceId===own.id
        && String(g.value.groupContext.epoch)===reservation.previousEpoch
        && BigInt(reservation.revision)===BigInt(g.row.roomRevision)+1n,'mls_room_epoch_conflict');noPendingSend(saved,id);
      unchangedRoles(g.row,reservation);
      const before=roster(g.value),expected=before.filter(m=>!removed.some(c=>c.id===m.id && c.owner===m.owner));
      need(before.length-expected.length===removed.length,'mls_room_roster_rejected');
      const additions=members.filter(m=>changes.some(c=>c.type==='add'&&c.id===m.id&&c.owner===m.owner));
      need(additions.length===changes.filter(c=>c.type==='add').length && additions.every(m=>!before.some(b=>b.id===m.id)),'mls_room_roster_rejected');
      expected.push(...additions);expected.sort((a,b)=>a.owner+'/'+a.id<b.owner+'/'+b.id?-1:1);
      need(canonical(expected)===reservation.roster,'mls_room_roster_rejected');await boundMembers(members,g.value.clientConfig);
      const proposals=await packageProposals(changes,packages,g.value.clientConfig);
      for(const c of removed){const index=g.value.ratchetTree.findIndex(n=>n?.nodeType==='leaf' && JSON.parse(decoder.decode(n.leaf.credential.identity))[3]===c.id);
        need(index>=0,'mls_room_roster_rejected');proposals.unshift({proposalType:'remove',remove:{removed:index/2}});}
      let changed;try{changed=await createCommit({state:g.value,cipherSuite:suite},{extraProposals:proposals});
        need(canonical(roster(changed.newState))===reservation.roster,'mls_room_roster_rejected');return await saveTransition(saved,g.row,changed,reservation);
      }finally{wipe(changed);}
    });
  }
  async function acceptWelcome(value) {
    value=structuredClone(value);
    return locked(async()=>{
      const t=await transfer(value),saved=await vault.snapshot(),id=value.conversationId,own=saved.values['mls:identity'];
      const prior=await record(saved,`mls:room-transition:${t.reservation.id}`);
      if(prior){need(prior===t.digest,'mls_replay_conflict');return id;}
      const addition=t.changes.find(c=>c.type==='add' && c.owner===owner && c.id===own?.id);
      need(addition,'mls_room_membership_required');const admission=await record(saved,`mls:package:${addition.packageHash}`)||own;
      need(admission?.id===own.id && admission.hash===addition.packageHash && !(await record(saved,`mls:consumed:${admission.hash}`)),'mls_package_consumed');
      const previous=saved.values[`mls:group:${id}`];
      if(previous){
        // Only a fresh own-native Add may replace a removed endpoint's stale state.
        need(previous.kind==='shopping-room'&&previous.peer==='room:'+id&&previous.confirmed
          &&decimal(previous.roomRevision)&&BigInt(t.reservation.previousEpoch)>BigInt(previous.roomRevision)
          &&!saved.values[`mls:membership:${id}`],'mls_group_exists');
        noPendingSend(saved,id);
        need(!['room:leave:','room:change:','room:create:'].some(prefix=>saved.values[prefix+id]),'mls_room_membership_pending');
      }
      const {configuration}=await config(saved);await boundMembers(t.members,configuration);
      const welcome=decode(decodeMlsMessage,value.welcome);need(welcome.wireformat==='mls_welcome','mls_welcome_invalid');
      const joined=await joinGroup(welcome.welcome,admission.package.publicPackage,admission.package.privatePackage,emptyPskIndex,suite,
        decode(decodeRatchetTree,value.tree),undefined,configuration);
      need(decoder.decode(joined.groupContext.groupId)===id && String(joined.groupContext.epoch)===value.epoch
        && canonical(roster(joined))===t.reservation.roster,'mls_room_roster_rejected');
      await policy.markRoomEncrypted(owner,id);current();
      await put(saved,{[`mls:group:${id}`]:{kind:'shopping-room',peer:'room:'+id,roomRoster:t.reservation.roster,roomRoles:t.reservation.roles,roomRevision:t.reservation.revision,bytes:encodeGroupState(joined),confirmed:false},
        [`mls:membership:${id}`]:value,[`mls:room-transition:${t.reservation.id}`]:t.digest,
        [`mls:room-epoch:${id}:${value.epoch}`]:{roster:t.reservation.roster,roles:t.reservation.roles,confirmed:false},
        [`mls:consumed:${admission.hash}`]:true,[`mls:package:${admission.hash}`]:retirePackage(admission),
        'mls:identity':admission.hash===own.hash?retirePackage(admission):own});wipePackage(admission);return id;
    });
  }
  async function applyCommit(value) {
    value=structuredClone(value);
    return locked(async()=>{
      const t=await transfer(value),saved=await vault.snapshot(),id=value.conversationId,own=saved.values['mls:identity'];
      const prior=await record(saved,`mls:room-transition:${t.reservation.id}`);
      if(prior){need(prior===t.digest,'mls_replay_conflict');return id;}
      need(t.members.some(m=>m.owner===owner&&m.id===own.id),'mls_room_membership_required');
      const removed=t.changes.filter(c=>c.type==='remove');
      const g=await state(saved,id,removed.map(c=>c.id),true);noPendingSend(saved,id);
      need(g.row.confirmed && !saved.values[`mls:membership:${id}`] && String(g.value.groupContext.epoch)===t.reservation.previousEpoch
        && BigInt(t.reservation.revision)===BigInt(g.row.roomRevision)+1n,'mls_room_epoch_conflict');
      unchangedRoles(g.row,t.reservation);
      const packet=decode(decodeMlsMessage,value.commit);need(packet.wireformat==='mls_private_message' && packet.privateMessage.contentType==='commit'
        && decoder.decode(packet.privateMessage.groupId)===id && String(packet.privateMessage.epoch)===t.reservation.previousEpoch,'mls_room_transfer_rejected');
      let changed, additions=[];
      try {
        changed=await processPrivateMessage(g.value,packet.privateMessage,emptyPskIndex,suite,event=>{
          if(event.kind!=='commit' || event.proposals.length!==t.changes.filter(c=>c.type!=='role').length)return 'reject';
          const leaf=g.value.ratchetTree[event.senderLeafIndex*2],who=leaf?.nodeType==='leaf'&&JSON.parse(decoder.decode(leaf.leaf.credential.identity));
          if(who?.[2]!==t.reservation.actorOwner || who[3]!==t.reservation.actorDeviceId)return 'reject';
          const seen=new Set();additions=[];
          for(const entry of event.proposals){const p=entry.proposal;let c;
            if(p.proposalType==='remove') {const n=g.value.ratchetTree[p.remove.removed*2],tuple=n?.nodeType==='leaf'&&JSON.parse(decoder.decode(n.leaf.credential.identity));
              c=t.changes.find(c=>c.type==='remove'&&c.owner===tuple?.[2]&&c.id===tuple?.[3]);}
            else if(p.proposalType==='add'){const tuple=JSON.parse(decoder.decode(p.add.keyPackage.leafNode.credential.identity));
              c=t.changes.find(c=>c.type==='add'&&c.owner===tuple[2]&&c.id===tuple[3]);if(c)additions.push({change:c,keyPackage:p.add.keyPackage});}
            if(!c || seen.has(c.id))return 'reject';seen.add(c.id);
          }
          return 'accept';
        });
        need(changed.kind==='newState' && changed.actionTaken==='accept' && String(changed.newState.groupContext.epoch)===value.epoch
          && canonical(roster(changed.newState))===t.reservation.roster && equal(encodeRatchetTree(changed.newState.ratchetTree),value.tree),'mls_room_transfer_rejected');
        // Bind public key-package bytes too, not just an owner's copied credential.
        for(const {change,keyPackage} of additions)need(await hash(encodeMlsMessage({version:'mls10',wireformat:'mls_key_package',keyPackage}))===change.packageHash,'mls_room_packages_rejected');
        await put(saved,{[`mls:group:${id}`]:{...g.row,roomRoster:t.reservation.roster,roomRoles:t.reservation.roles,roomRevision:t.reservation.revision,
          bytes:encodeGroupState(changed.newState),confirmed:false},[`mls:membership:${id}`]:value,[`mls:room-transition:${t.reservation.id}`]:t.digest,
          [`mls:room-epoch:${id}:${value.epoch}`]:{roster:t.reservation.roster,roles:t.reservation.roles,confirmed:false}});return id;
      }finally{wipe(changed);}
    });
  }
  async function acceptance(id) {
    return locked(async()=>{
      const saved=await vault.snapshot(),t=saved.values[`mls:membership:${id}`],own=saved.values['mls:identity'];
      need(t && uuid(id),'mls_room_membership_pending');const info=await transfer(t);
      const g=await state(saved,id,null,true);
      need(String(g.value.groupContext.epoch)===t.epoch && g.row.roomRoster===info.reservation.roster,'mls_room_roster_rejected');
      need(info.members.some(m=>m.owner===owner&&m.id===own.id),'mls_room_membership_required');
      const signature=await suite.signature.sign(own.package.privatePackage.signaturePrivateKey,acceptanceBytes(t,info.digest,owner,own.id));
      return {owner,deviceId:own.id,signature};
    });
  }
  async function confirm(id,proofs) {
    proofs=structuredClone(proofs);
    return locked(async()=>{
      const saved=await vault.snapshot(),g=await state(saved,id,null,true),t=saved.values[`mls:membership:${id}`];
      need(Array.isArray(proofs) && proofs.length>=1 && proofs.length<=maxDevices,'mls_room_acceptance_required');
      need(proofs.every(p=>exact(p,['owner','deviceId','signature']) && ownerId(p.owner) && uuid(p.deviceId)
        && p.signature instanceof Uint8Array && p.signature.length===64),'mls_room_acceptance_rejected');
      const proofDigest=await hash(encoder.encode(canonical(proofs.map(p=>[p.owner,p.deviceId,Array.from(p.signature)])
        .sort((a,b)=>a[0]+'/'+a[1]<b[0]+'/'+b[1]?-1:1))));
      if(!t){need(g.row.confirmed && g.row.roomConfirmationDigest===proofDigest,'mls_room_acceptance_rejected');await allowed(g,id);return id;}
      const info=await transfer(t);
      need(Array.isArray(proofs)&&proofs.length===info.members.length,'mls_room_acceptance_required');const seen=new Set();
      for(const proof of proofs){const member=info.members.find(m=>m.owner===proof?.owner&&m.id===proof.deviceId);
        need(member && exact(proof,['owner','deviceId','signature']) && !seen.has(proof.deviceId) && proof.signature instanceof Uint8Array
          && proof.signature.length===64 && await suite.signature.verify(new Uint8Array(member.key),acceptanceBytes(t,info.digest,proof.owner,proof.deviceId),proof.signature),'mls_room_acceptance_rejected');
        seen.add(proof.deviceId);
      }
      const response=await authorization.confirm(structuredClone(t),structuredClone(proofs));current();
      need(exact(response,['status','conversationId','epoch','transferHash']) && response.status==='active'
        && response.conversationId===id && response.epoch===t.epoch && response.transferHash===info.digest,'mls_room_activation_rejected');
      await put(saved,{[`mls:group:${id}`]:{...g.row,confirmed:true,roomConfirmationDigest:proofDigest},
        [`mls:room-epoch:${id}:${t.epoch}`]:{roster:info.reservation.roster,roles:info.reservation.roles,confirmed:true,transferHash:info.digest}},[`mls:membership:${id}`]);return id;
    });
  }
  async function allowed(g,id) {
    need(g.row.confirmed,'mls_room_membership_pending');
    const reply=await authorization.check(id,String(g.value.groupContext.epoch),g.row.roomRevision);current();
    need(exact(reply,['active','conversationId','epoch','revision']) && reply.active===true && reply.conversationId===id
      && reply.epoch===String(g.value.groupContext.epoch) && reply.revision===g.row.roomRevision,'mls_room_access_denied');
  }
  async function send(payload) {
    payload=structuredClone(payload);
    need(exact(payload,Object.hasOwn(payload,'mediaId')?['conversationId','clientMessageId','message','mediaId']:['conversationId','clientMessageId','message'])
      &&(!Object.hasOwn(payload,'mediaId')||uuid(payload.mediaId)) && uuid(payload.conversationId) && uuid(payload.clientMessageId)
      && typeof payload.message==='string' && payload.message.trim() && encoder.encode(payload.message).length<=16384,'mls_content_unsupported');
    return locked(async()=>{
      let saved=await vault.snapshot();const id=payload.conversationId,g=await state(saved,id,null,true),own=saved.values['mls:identity'];await allowed(g,id);
      need(!saved.values[`mls:membership:${id}`],'mls_room_membership_pending');
      need(!Object.entries(saved.values).some(([k,j])=>k.startsWith('mls:outbox:')&&j.conversationId===id&&j.id!==payload.clientMessageId),'mls_pending_send_requires_retry');
      let job=saved.values[`mls:outbox:${payload.clientMessageId}`],item=await record(saved,`history:${payload.clientMessageId}`);
      if(item)need(item.kind==='shopping-room'&&item.conversationId===id&&item.owner===owner&&item.message===payload.message&&(item.mediaId||null)===(payload.mediaId||null),'mls_send_retry_conflict');
      if(item&&!job)return structuredClone(item);
      if(job)need(item && item.status==='pending' && job.id===payload.clientMessageId && job.conversationId===id
        && job.epoch===String(g.value.groupContext.epoch) && job.deviceId===own.id && job.hash===item.hash
        && job.ciphertext instanceof Uint8Array && await hash(job.ciphertext)===job.hash,'mls_send_retry_conflict');
      if(!job){const content={id:payload.clientMessageId,conversationId:id,epoch:String(g.value.groupContext.epoch),owner,deviceId:own.id,message:payload.message};
        const signature=await suite.signature.sign(own.package.privatePackage.signaturePrivateKey,contentBytes(content));
        const bytes=encoder.encode(canonical({...content,signature:Array.from(signature)}));let changed;
        try{changed=await createApplicationMessage(g.value,bytes,suite);}finally{bytes.fill(0);}
        try{const ciphertext=encodeMlsMessage({version:'mls10',wireformat:'mls_private_message',privateMessage:changed.privateMessage});
          job={id:content.id,conversationId:id,epoch:content.epoch,deviceId:own.id,ciphertext,hash:await hash(ciphertext),...(payload.mediaId?{mediaId:payload.mediaId}:{})};
          item={...content,kind:'shopping-room',peer:'room:'+id,hash:job.hash,timestamp:new Date(now()).toISOString(),status:'pending',encrypted:true,...(payload.mediaId?{mediaId:payload.mediaId}:{})};
          await put(saved,{[`mls:group:${id}`]:{...g.row,bytes:encodeGroupState(changed.newState)},[`mls:outbox:${content.id}`]:job,[`history:${content.id}`]:item});
        }finally{wipe(changed);}
      }
      need(typeof transport?.send==='function','mls_transport_unavailable');const response=await transport.send(structuredClone(job));current();
      need(response?.id===job.id&&response.hash===job.hash&&response.status==='sent'&&typeof response.sequence==='string'
        && /^[1-9][0-9]{0,18}$/.test(response.sequence)&&typeof response.createdAt==='string'
        && Number.isFinite(Date.parse(response.createdAt))&&new Date(response.createdAt).toISOString()===response.createdAt,'mls_send_confirmation_rejected');
      saved=await vault.snapshot();need(saved.values[`mls:outbox:${job.id}`]?.hash===job.hash,'mls_send_retry_conflict');
      const result={...item,sequence:response.sequence,timestamp:response.createdAt,status:'sent'};
      await put(saved,{[`history:${job.id}`]:result},[`mls:outbox:${job.id}`]);return result;
    });
  }
  async function receive(envelope) {
    envelope=structuredClone(envelope);
    return locked(async()=>{
      need(uuid(envelope?.id)&&uuid(envelope.conversationId)&&envelope.ciphertext instanceof Uint8Array
        && envelope.ciphertext.length<=65536 && typeof envelope.sequence==='string'&&/^[1-9][0-9]{0,18}$/.test(envelope.sequence)
        && typeof envelope.created_at==='string'&&Number.isFinite(Date.parse(envelope.created_at))&&new Date(envelope.created_at).toISOString()===envelope.created_at,'mls_wire_rejected');
      const saved=await vault.snapshot(),id=envelope.conversationId,g=await state(saved,id,null,true);await allowed(g,id);
      need(!saved.values[`mls:membership:${id}`],'mls_room_membership_pending');
      const digest=await hash(envelope.ciphertext);need(envelope.hash===digest,'mls_envelope_binding_rejected');
      const prior=await record(saved,`mls:received:${envelope.id}`),item=await record(saved,`history:${envelope.id}`);
      if(prior){need(prior===digest&&item?.epoch===envelope.epoch&&item.deviceId===envelope.deviceId
        && item.sequence===envelope.sequence&&item.timestamp===envelope.created_at,'mls_replay_conflict');return item;}
      need(!item,'mls_message_id_conflict');const packet=decode(decodeMlsMessage,envelope.ciphertext);
      need(packet.wireformat==='mls_private_message'&&packet.privateMessage.contentType==='application'
        && decoder.decode(packet.privateMessage.groupId)===id&&String(packet.privateMessage.epoch)===envelope.epoch
        && packet.privateMessage.epoch===g.value.groupContext.epoch,'mls_envelope_binding_rejected');
      let result,sender;
      try {
        sender=await decryptSenderData(packet.privateMessage,g.value.keySchedule.senderDataSecret,suite);
        result=await processPrivateMessage(g.value,packet.privateMessage,emptyPskIndex,suite,()=> 'reject');need(result.kind==='applicationMessage','mls_application_required');
        let content;try{content=JSON.parse(decoder.decode(result.message));}catch{need(false,'mls_content_binding_rejected');}
        need(exact(content,['id','conversationId','epoch','owner','deviceId','message','signature']) && content.id===envelope.id
          && content.conversationId===id&&content.epoch===envelope.epoch&&content.deviceId===envelope.deviceId&&typeof content.message==='string'
          && content.message.trim()&&encoder.encode(content.message).length<=16384&&Array.isArray(content.signature)&&content.signature.length===64
          && content.signature.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'mls_content_binding_rejected');
        const leaf=g.value.ratchetTree[sender.leafIndex*2],tuple=leaf?.nodeType==='leaf'&&JSON.parse(decoder.decode(leaf.leaf.credential.identity));
        need(tuple?.[2]===content.owner&&tuple[3]===content.deviceId&&await suite.signature.verify(leaf.leaf.signaturePublicKey,contentBytes(content),new Uint8Array(content.signature)),'mls_sender_rejected');
        const history={...content,kind:'shopping-room',peer:'room:'+id,hash:digest,sequence:envelope.sequence,timestamp:envelope.created_at,
          status:content.owner===owner?'sent':'delivered',encrypted:true};delete history.signature;
        await put(saved,{[`mls:group:${id}`]:{...g.row,bytes:encodeGroupState(result.newState)},[`history:${envelope.id}`]:history,[`mls:received:${envelope.id}`]:digest});return history;
      } finally {result?.message?.fill(0);sender?.reuseGuard?.fill(0);wipe(result);}
    });
  }
  async function history(id) {
    return locked(async()=>{
      need(uuid(id),'mls_room_membership_required');
      const belongs=(v,k)=>k.startsWith('history:')&&v.kind==='shopping-room'&&v.conversationId===id;
      const saved=await (vault.historySnapshot?vault.historySnapshot({filter:belongs}):vault.snapshot());current();
      return Object.entries(saved.values).filter(([k,v])=>belongs(v,k)).map(([,v])=>structuredClone(v))
        .sort((a,b)=>a.sequence&&b.sequence?(BigInt(a.sequence)<BigInt(b.sequence)?-1:1):a.timestamp.localeCompare(b.timestamp));
    });
  }
  async function epochs(id) {
    return locked(async()=>{
      need(uuid(id),'mls_room_membership_required');
      const belongs=(v,k)=>k.startsWith('history:')&&v.kind==='shopping-room'&&v.conversationId===id;
      const saved=await vault.snapshot();current();
      if(vault.historySnapshot){const history=await vault.historySnapshot({filter:belongs});current();
        need(history.revision===saved.revision,'mls_room_history_revision_conflict');Object.assign(saved.values,history.values);}
      const g=await state(saved,id,null,true),wanted=new Set([String(g.value.groupContext.epoch)]);
      for(const [key,value] of Object.entries(saved.values))if(belongs(value,key))wanted.add(value.epoch);
      need(wanted.size<=1024,'mls_room_history_epoch_limit');const result=new Map();
      for(const epoch of wanted){need(decimal(epoch)&&epoch!=='0','mls_room_roster_rejected');
        let binding=await record(saved,`mls:room-epoch:${id}:${epoch}`);current();
        if(!binding&&authorization.historyEpoch){
          const archived=await authorization.historyEpoch(id,epoch);current();
          need(exact(archived,['version','conversationId','epoch','intent','transferHash','acceptances'])&&archived.version===1
            &&archived.conversationId===id&&archived.epoch===epoch&&typeof archived.intent==='string'&&archived.intent.length<=65536
            &&typeof archived.transferHash==='string'&&/^[a-f0-9]{64}$/.test(archived.transferHash),'mls_room_archive_rejected');
          let intent;try{intent=JSON.parse(archived.intent);}catch{need(false,'mls_room_archive_rejected');}
          const parsed=parseIntent(intent);
          need(canonical(intent)===archived.intent&&intent.conversationId===id&&String(BigInt(intent.previousEpoch)+1n)===epoch
            &&parsed.members.some(m=>m.owner===owner)&&Array.isArray(archived.acceptances)&&archived.acceptances.length===parsed.members.length,'mls_room_archive_rejected');
          const seen=new Set();
          for(const a of archived.acceptances){const member=parsed.members.find(m=>m.id===a.deviceId&&m.owner===a.owner);
            need(exact(a,['owner','deviceId','signature'])&&member&&!seen.has(a.deviceId)&&typeof a.signature==='string'&&/^[A-Za-z0-9_-]{86}$/.test(a.signature),'mls_room_archive_rejected');
            const sig=Uint8Array.from(atob(a.signature.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
            need(base64(sig)===a.signature&&await suite.signature.verify(new Uint8Array(member.key),acceptanceBytes({conversationId:id,epoch},archived.transferHash,a.owner,a.deviceId),sig),'mls_room_archive_rejected');seen.add(a.deviceId);
          }
          // Public, owner-scoped disclosure metadata only; never restore MLS state or old secrets.
          binding={roster:intent.roster,roles:intent.roles,confirmed:true};
        }
        need(binding,'mls_room_roster_rejected');if(!binding.confirmed)continue;
        const roles=JSON.parse(binding.roles),members=JSON.parse(binding.roster);
        result.set(epoch,members.map(m=>({owner:m.owner,id:m.id,role:roles.find(r=>r.owner===m.owner)?.role})));
      }
      return result;
    });
  }
  return {create,change,acceptWelcome,applyCommit,acceptance,confirm,send,receive,history,epochs};
}
