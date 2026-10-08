const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('late commerce metadata cannot replace another account or session even for the same peer',async()=>{
  const source=fs.readFileSync(require.resolve('../app.js'),'utf8'),waits=[],captured=[];
  const load=()=>new Promise(resolve=>waits.push(resolve));
  const context={currentUser:'alice',currentSession:{sessionId:'a'},currentOrders:{},chatUiState:{activeContext:{withUser:'seller'}},
    captureClientError:(...v)=>captured.push(v),getConversationOffers:()=>[],getConversationAvailabilityRequests:()=>[],
    window:{WingaDataLayer:{loadMyOrders:load,loadConversationOffers:load,loadConversationAvailabilityRequests:load,loadCommerceGoals:load}}};
  vm.runInNewContext(source.slice(source.indexOf('async function refreshOrdersState()'),source.indexOf('function stopMessagePolling()')),context);
  const jobs=['refreshOrdersState','refreshConversationOffersState','refreshConversationAvailabilityState','refreshCommerceGoalsState'].map(name=>context[name]());
  context.currentUser='bob';context.currentSession={sessionId:'b'};
  context.currentOrders={newOwner:true};
  context.chatUiState.conversationOffers=['bob-offer'];context.chatUiState.conversationAvailabilityRequests=['bob-availability'];context.chatUiState.commerceGoals=['bob-goal'];
  for(const resolve of waits)resolve([{private:'alice'}]);await Promise.all(jobs);
  assert.deepEqual(context.currentOrders,{newOwner:true});assert.deepEqual(context.chatUiState.conversationOffers,['bob-offer']);
  assert.deepEqual(context.chatUiState.conversationAvailabilityRequests,['bob-availability']);assert.deepEqual(context.chatUiState.commerceGoals,['bob-goal']);
  assert.equal(captured.length,0);
});
