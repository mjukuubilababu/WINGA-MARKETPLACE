(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WingaRichContent=api;
})(globalThis,function() {
  const PREFIX='WINGA-CONTENT/1\n',MAX_BYTES=12000,EDIT_WINDOW_MS=15*60*1000;
  const REACTIONS=['\u2764\uFE0F','\uD83D\uDC4D','\uD83D\uDE02','\uD83D\uDD25'];
  const TYPES=['text','product','reel','short','collection','order','payment','delivery','location','contact','reaction','edit','hide','seller-question','seller-response'];
  const id=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(value);
  const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
  const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const exact=(value,keys)=>record(value)&&Object.keys(value).sort().join(',')===keys.sort().join(',');
  const text=(value,max=4096)=>typeof value==='string'&&value.length<=max&&!/[\u0000]/.test(value);
  const fail=()=>{throw Object.assign(new Error('rich_content_invalid'),{code:'rich_content_invalid'});}; // i18n-gate: allow -- internal schema diagnostic, localized by callers
  function validate(value) {
    if(!exact(value,['version','type','text','reply','data'])||value.version!==1||!TYPES.includes(value.type)
      ||!text(value.text)||!record(value.data)||!(value.reply===null
        ||exact(value.reply,['id','quote'])&&uuid(value.reply.id)&&text(value.reply.quote,256)))fail();
    const d=value.data;
    if(['seller-question','seller-response'].includes(value.type)&&(!exact(d,['questionId','productId'])||!uuid(d.questionId)||!id(d.productId)
      ||value.reply!==null||!value.text.trim()||!text(value.text,2048)))fail();
    if(value.type==='text'&&(!exact(d,[])||!value.text.trim()))fail();
    if(['product','reel','short','collection'].includes(value.type)
      &&(!exact(d,['ids'])||!Array.isArray(d.ids)||!d.ids.length||d.ids.length>8
        ||d.ids.some(v=>!id(v))||new Set(d.ids).size!==d.ids.length))fail();
    if(['order','payment','delivery'].includes(value.type)&&(!exact(d,['id'])||!id(d.id)))fail();
    if(value.type==='location'&&(!exact(d,['latitude','longitude','label'])
      ||!Number.isFinite(d.latitude)||Math.abs(d.latitude)>90||!Number.isFinite(d.longitude)
      ||Math.abs(d.longitude)>180||!text(d.label,160)))fail();
    if(value.type==='contact'&&(!exact(d,['username','name'])||!id(d.username)||!text(d.name,160)))fail();
    if(value.type==='reaction'&&(!exact(d,['targetId','emoji'])||!uuid(d.targetId)
      ||!(d.emoji===''||REACTIONS.includes(d.emoji))||value.reply!==null||value.text!==''))fail();
    if(value.type==='edit'&&(!exact(d,['targetId'])||!uuid(d.targetId)||!value.text.trim()||value.reply!==null))fail();
    if(value.type==='hide'&&(!exact(d,['targetId'])||!uuid(d.targetId)||value.text!==''||value.reply!==null))fail();
    if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_BYTES)fail();
    return structuredClone(value);
  }
  function encode(value){return PREFIX+JSON.stringify(validate(value));}
  function parse(message) {
    if(typeof message!=='string'||!message.startsWith(PREFIX))return null;
    if(new TextEncoder().encode(message).length>MAX_BYTES+PREFIX.length)return null;
    try{return validate(JSON.parse(message.slice(PREFIX.length)));}catch{return null;}
  }
  const create=(type,textValue='',data={},reply=null)=>validate({version:1,type,text:textValue,reply,data});
  const event=value=>['reaction','edit','hide'].includes(value?.type);
  function contentOf(item) {
    const rich=parse(item.message);
    if(rich)return rich;
    if(item.message?.startsWith('WINGA-MEDIA/')||item.message?.startsWith('WINGA-CONTENT/')||item.message?.startsWith('WINGA-ROOM/'))return null;
    try{return create('text',item.message||' ');}catch{return null;}
  }
  function canEdit(item,actor,time=Date.now()) {
    const c=item.richContent||contentOf(item),created=Date.parse(item.timestamp);
    return item.owner===actor&&item.status!=='pending'&&c?.type==='text'
      &&Number.isFinite(created)&&time>=created&&time-created<=EDIT_WINDOW_MS;
  }
  function project(history,owner) {
    const sequence=item=>/^[1-9][0-9]{0,18}$/.test(item.sequence||item.conversationSequence||'')?BigInt(item.sequence||item.conversationSequence):null;
    const compare=(a,b)=>{
      const conversation=String(a.conversationId||'').localeCompare(String(b.conversationId||''));
      if(conversation)return conversation;
      const x=sequence(a),y=sequence(b);
      if(x!==null && y!==null && x!==y)return x<y?-1:1;
      if((x===null)!==(y===null))return x===null?-1:1;
      return (Date.parse(a.timestamp)||0)-(Date.parse(b.timestamp)||0)||a.id.localeCompare(b.id);
    };
    const sorted=history.slice().sort(compare);
    const rows=new Map(),events=[];
    for(const item of sorted) {
      const c=parse(item.message);
      if(event(c)){events.push([item,c]);continue;}
      rows.set(item.id,{...item,richContent:c,reactions:[],edited:false});
    }
    const reactions=new Map(),hidden=new Set();
    for(const [item,c] of events) {
      if(item.status==='pending')continue;
      const target=rows.get(c.data.targetId);
      if(!target||!Number.isFinite(Date.parse(item.timestamp))||Date.parse(item.timestamp)<Date.parse(target.timestamp)
        ||item.conversationId!==target.conversationId
        ||sequence(item)!==null&&sequence(target)!==null&&sequence(item)<=sequence(target)
        ||![target.owner,target.peer].includes(item.owner)||item.owner===item.peer)continue;
      if(c.type==='hide') {if(item.owner===owner)hidden.add(target.id);continue;}
      if(c.type==='edit') {
        if(canEdit(target,item.owner,Date.parse(item.timestamp))) {
          const next={...(target.richContent||create('text',target.message)),text:c.text};
          rows.set(target.id,{...target,richContent:next,edited:true});
        }
      }else {
        const key=JSON.stringify([target.id,item.owner]);
        const prior=reactions.get(key);
        if(!prior||compare(item,prior.item)>0)reactions.set(key,{item,emoji:c.data.emoji});
      }
    }
    for(const {item,emoji} of reactions.values()) {
      if(!emoji)continue;
      const target=rows.get(parse(item.message).data.targetId);
      let group=target.reactions.find(r=>r.emoji===emoji);
      if(!group){group={emoji,owners:[]};target.reactions.push(group);}
      group.owners.push(item.owner);
    }
    return [...rows.values()].filter(item=>!hidden.has(item.id))
      .concat(events.filter(([item])=>item.status==='pending').map(([item,c])=>({...item,richContent:c,eventRecord:true,reactions:[]})));
  }
  return {PREFIX,MAX_BYTES,EDIT_WINDOW_MS,REACTIONS,TYPES,encode,parse,create,event,project,canEdit,contentOf};
});
