const ceilings=Object.freeze({maxOwners:12,maxDevices:24});
function roomLimits(value=ceilings){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='maxDevices,maxOwners'
    ||!Number.isInteger(value.maxOwners)||value.maxOwners<3||value.maxOwners>ceilings.maxOwners
    ||!Number.isInteger(value.maxDevices)||value.maxDevices<value.maxOwners||value.maxDevices>ceilings.maxDevices)
    throw new TypeError('Invalid encrypted Room limits');
  return Object.freeze({maxOwners:value.maxOwners,maxDevices:value.maxDevices});
}
function readRoomLimits(env=process.env){
  const read=(name,fallback)=>{const v=env[name];if(v===undefined)return fallback;
    if(typeof v!=='string'||!/^[1-9][0-9]*$/.test(v))throw new TypeError('Invalid encrypted Room limits');return Number(v);};
  return roomLimits({maxOwners:read('WINGA_ENCRYPTED_ROOM_MAX_OWNERS',12),maxDevices:read('WINGA_ENCRYPTED_ROOM_MAX_DEVICES',24)});
}
module.exports={ceilings,roomLimits,readRoomLimits};
