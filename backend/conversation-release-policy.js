const {createHash}=require('node:crypto');
const {failure}=require('./encrypted-content-contract');
const PROTOCOL_VERSION=1;
function readConversationReleasePolicy(env=process.env) {
  const minimum=env.WINGA_CONVERSATION_MIN_PROTOCOL || '1';
  const blocked=env.WINGA_CONVERSATION_BLOCKED_PROTOCOLS || '';
  const percentage=env.WINGA_CONVERSATION_ROLLOUT_PERCENT || '100';
  const users=env.WINGA_CONVERSATION_ROLLOUT_USERS || '';
  const valid=/^[1-9]\d?$/.test(minimum) && (!blocked || /^[1-9]\d?(,[1-9]\d?)*$/.test(blocked))
    && /^(100|[1-9]?\d)$/.test(percentage) && users.length<=8192
    && (!users || users.split(',').every(user=>/^[A-Za-z0-9._:-]{1,128}$/.test(user)));
  return {valid,minimum:Number(minimum),blocked:blocked?blocked.split(',').map(Number):[],percentage:Number(percentage),
    users:new Set(users?users.split(','):[])};
}
function assertCompatibleProtocol(policy,version=PROTOCOL_VERSION) {
  if(!policy.valid)throw failure(503,'conversation_release_policy_invalid');
  if(version<policy.minimum || policy.blocked.includes(version))throw failure(426,'conversation_upgrade_required');
}
function assertNewConversationAdmission(policy,owner) {
  assertCompatibleProtocol(policy);
  const bucket=createHash('sha256').update(JSON.stringify(['winga-encrypted-rollout',1,owner])).digest().readUInt32BE(0)%100;
  if(!policy.users.has(owner) && bucket>=policy.percentage)throw failure(503,'encrypted_rollout_not_admitted');
}
module.exports={PROTOCOL_VERSION,readConversationReleasePolicy,assertCompatibleProtocol,assertNewConversationAdmission};
