const test = require('node:test');
const assert = require('node:assert/strict');
const { createConversationTransport } = require('../backend/conversation-transport');

const env = { WINGA_PHOENIX_TRANSPORT_ENABLED: 'true', WINGA_PHOENIX_CANARY_USERS: 'alice,bob',
  CONVERSATION_TICKET_SECRET: 't'.repeat(48), CONVERSATION_SERVICE_TOKEN: 's'.repeat(48) };
const session = { username: 'alice', sessionId: 'device-a', token: 'private-session-token', expiresAt: 900000 };

test('transport is opt-in and requires distinct credentials', () => {
  const disabled = createConversationTransport({env:{}});
  assert.equal(disabled.enabled,false);
  assert.throws(()=>disabled.issue(session),{status:404});
  assert.throws(()=>createConversationTransport({env:{...env,CONVERSATION_SERVICE_TOKEN:'short'}}));
  assert.throws(()=>createConversationTransport({env:{...env,CONVERSATION_SERVICE_TOKEN:env.CONVERSATION_TICKET_SECRET}}));
  assert.throws(()=>createConversationTransport({env:{...env,WINGA_PHOENIX_CANARY_USERS:''}}).issue(session),{status:404});
  assert.throws(()=>createConversationTransport({env}).issue({...session,username:'outside-canary'}),{status:404});
});

test('tickets bind audience, expiry, registered device and current session token without disclosing it', async () => {
  let time=100000;
  const transport=createConversationTransport({env,now:()=>time});
  const {ticket}=transport.issue(session);
  assert.equal(Buffer.from(ticket.split('.')[0],'base64url').toString().includes(session.token),false);
  const store={resolveConversationTransportSession:async(id,owner)=>id===session.sessionId && owner===session.username?session:null};
  assert.equal((await transport.authorize(ticket,store)).deviceId,session.sessionId);
  await assert.rejects(transport.authorize(ticket,{resolveConversationTransportSession:async()=>null}),{status:401});
  await assert.rejects(transport.authorize(ticket,{resolveConversationTransportSession:async()=>({...session,token:'rotated'})}),{status:401});
  assert.throws(()=>transport.verify(ticket+'x'),{status:401});
  const removed=createConversationTransport({env:{...env,WINGA_PHOENIX_CANARY_USERS:'bob'},now:()=>time});
  assert.throws(()=>removed.verify(ticket),{status:401});
  time=400000;
  assert.throws(()=>transport.verify(ticket),{status:401});
});

test('service adapter rejects browser credentials, unscoped commands and forged sender metadata', () => {
  const transport=createConversationTransport({env});
  const headers={authorization:`Bearer ${env.CONVERSATION_SERVICE_TOKEN}`};
  assert.equal(transport.serviceAllowed({headers}),true);
  assert.equal(transport.serviceAllowed({headers:{...headers,origin:'https://wingamarket.com'}}),false);
  assert.equal(transport.serviceAllowed({headers:{...headers,cookie:'winga_auth=forged'}}),false);
  const input={version:1,ticket:'ticket',command:'send',payload:{receiverId:'bob',message:'test',clientMessageId:'12345678-1234-4234-8234-123456789abc'}};
  assert.equal(transport.validateCommand(input),input);
  for(const value of [{...input,command:'delete-user'},{...input,payload:{...input.payload,senderId:'eve'}},
    {...input,payload:{...input.payload,message:'x'.repeat(4001)}},{...input,payload:{...input.payload,clientMessageId:'bad'}}]) {
    assert.throws(()=>transport.validateCommand(value),{status:400});
  }
});
