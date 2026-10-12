const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function moduleAt(path,namespace){const context={window:{WingaModules:{admin:{},api:{admin:{}}}}};vm.runInNewContext(fs.readFileSync(path,'utf8'),context);return namespace(context.window.WingaModules);}
test('admin loop reports isolate failed analytics and retain authenticated canonical routes',async()=>{
 const factory=moduleAt('src/api/admin-client.js',m=>m.api.admin.createAdminApiClient),calls=[];
 const client=factory({baseUrl:'/api',createAuthHeaders:()=>({'X-Test-Auth':'fixture'}),fetchJson:async(url,options)=>{calls.push({url,options});if(url.endsWith('/rooms'))throw new Error('outage');return {entryCount:4};}});
 const reports=await client.loadGrowthLoopReports();assert.equal(reports.length,13);
 assert.equal(reports.find(r=>r.loop==='room').available,false);assert.equal(reports.find(r=>r.loop==='room').data,null);
 assert.equal(reports.find(r=>r.loop==='collection').data.entryCount,4);
 assert.ok(calls.every(c=>c.options.headers['X-Test-Auth']==='fixture'));
 assert.ok(calls.some(c=>c.url==='/api/admin/growth/content?type=COLLECTION'));
});
function uiFixture(){
 const factory=moduleAt('src/admin/ui.js',m=>m.admin.createAdminUiModule);
 const node=(tag,props={})=>({tag,...props,isConnected:true,children:[],append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);},replaceChildren(...items){this.children=items;}});
 let actor='admin',admin=true,resolve;const panel=node('section');
 const module=factory({createElement:node,createSectionHeading:props=>node('h2',props),createEmptyState:text=>node('p',{textContent:text}),getAnalyticsPanel:()=>panel,formatNumber:String,isAdminUser:()=>admin,getCurrentUser:()=>actor,isAdminAnalyticsContext:()=>admin,loadGrowthLoopReports:()=>new Promise(r=>{resolve=r;}),translate:(_key,_args,fallback)=>fallback});
 return {module,panel,resolve:rows=>resolve(rows),switchActor:()=>{actor='other';admin=false;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const text=node=>[node.textContent||'',...(node.children||[]).map(text)].join(' ');
test('loop dashboard keeps missing metrics unknown and renders labels as text',async()=>{
 const f=uiFixture();f.module.renderAnalyticsPanel({topCategories:[],recentProducts:[]},'Admin','');await settle();
 f.resolve([{loop:'collection',available:true,data:{entryCount:2,cohort:{activationRate:null},limitations:['<script>private</script>']}},{loop:'room',available:false,data:null}]);await settle();
 const rendered=text(f.panel);assert.match(rendered,/Collections/);assert.match(rendered,/Report unavailable; no zero values inferred/);assert.match(rendered,/—/);assert.match(rendered,/<script>private<\/script>/);
});
test('late loop responses cannot populate another account dashboard',async()=>{
 const f=uiFixture();f.module.renderAnalyticsPanel({topCategories:[],recentProducts:[]},'Admin','');await settle();f.switchActor();
 f.resolve([{loop:'collection',available:true,data:{entryCount:999}}]);await settle();assert.equal(text(f.panel).includes('999'),false);
});
