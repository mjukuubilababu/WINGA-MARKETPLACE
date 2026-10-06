(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WingaMessageSearch=api;
})(typeof globalThis!=='undefined'?globalThis:this,function() {
  const MAX_SCAN=5000,MAX_RESULTS=100;
  const failure=()=>{throw Object.assign(new Error('message_search_invalid'),{code:'message_search_invalid'});}; // i18n-gate: allow -- internal code, UI renders a localized fixed error
  const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().trim();
  function date(value) {
    if(!value)return null;
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))failure();
    const parsed=Date.parse(value+'T00:00:00.000Z');
    if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==value)failure();
    return parsed;
  }
  // Accept only the visible projection, never raw MLS records, packets or media descriptors.
  function search(messages,{owner,peer,query='',sender='',from='',to='',limit=MAX_RESULTS}={}) {
    if(!Array.isArray(messages)||typeof owner!=='string'||!owner||typeof peer!=='string'||!peer||owner===peer
      ||typeof query!=='string'||query.length>200||![owner,peer,''].includes(sender)
      ||!Number.isInteger(limit)||limit<1||limit>MAX_RESULTS)failure();
    const start=date(from),end=date(to),terms=normalize(query).split(/\s+/u).filter(Boolean);
    if(start!==null&&end!==null&&start>end)failure();
    const rows=[],seen=new Set();
    for(const item of messages.slice(-MAX_SCAN)) {
      if(!item||typeof item.id!=='string'||seen.has(item.id)||item.eventRecord||item.hidden||item.deleted
        ||item.richUnavailable||!((item.senderId===owner&&item.receiverId===peer)||(item.senderId===peer&&item.receiverId===owner))
        ||sender&&item.senderId!==sender)continue;
      const stamp=Date.parse(item.timestamp);
      if(!Number.isFinite(stamp)||start!==null&&stamp<start||end!==null&&stamp>=end+86400000)continue;
      const content=item.richContent;
      if(['reaction','edit','hide'].includes(content?.type))continue;
      const text=typeof content?.text==='string'?content.text:typeof item.message==='string'?item.message:'';
      if(text.startsWith('WINGA-MEDIA/')||text.startsWith('WINGA-CONTENT/')||text.length>4096)continue;
      const products=content?.type==='product'&&Array.isArray(content.data?.ids)?content.data.ids.filter(v=>typeof v==='string').slice(0,10):[];
      const reference=typeof item.productName==='string'?item.productName.slice(0,255):'';
      const haystack=normalize([text,reference,item.senderId,...products].join(' '));
      if(!terms.every(term=>haystack.includes(term)))continue;
      seen.add(item.id);
      rows.push({id:item.id,sender:item.senderId,text,productName:reference,timestamp:item.timestamp});
    }
    rows.sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)||a.id.localeCompare(b.id));
    return {items:rows.slice(0,limit),matches:rows.length,truncated:messages.length>MAX_SCAN||rows.length>limit,
      scope:'loaded-device-history'};
  }
  return {search,MAX_SCAN,MAX_RESULTS};
});
