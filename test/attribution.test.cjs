const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../assets/js/lead-attribution.js');
const time = Date.parse('2026-11-12T20:00:00.000Z');
const storage = () => { const m=new Map(); return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)}; };
const page=(href,shared=storage(),now=time,referrer='')=>api.createCollector({
  href:()=>href,storage:()=>shared,now:()=>now,referrer:()=>referrer,
  crypto:()=>require('node:crypto').webcrypto
});
test('tab first touch survives navigation and more than 24h without being overwritten',()=>{
  const shared=storage();
  const first=page('https://liqevent.com/?gclid=Original_AbC&utm_source=google&utm_medium=cpc',shared).context();
  const next=page('https://liqevent.com/corporate-events/',shared,time+48*3600000).context();
  assert.deepEqual(next.first_touch,first.first_touch);
  assert.equal(next.submit_page,'https://liqevent.com/corporate-events/');
  assert.equal(next.storage_scope,'tab_session');
  assert.equal('consent' in next,false);
});
test('direct first touch and later tagged touch remain separate, direct navigation does not erase tags',()=>{
  const shared=storage(); const first=page('https://liqevent.com/',shared).context();
  const later=page('https://liqevent.com/conferences/?utm_source=newsletter&utm_campaign=conference&utm_medium=email',shared,time+1000).context();
  assert.deepEqual(later.first_touch,first.first_touch);
  assert.equal(later.latest_tagged_touch.utm_source,'newsletter');
  assert.deepEqual(page('https://liqevent.com/',shared,time+2000).context().latest_tagged_touch,later.latest_tagged_touch);
  assert.equal(page('https://liqevent.com/',storage()).context().latest_tagged_touch,null);
});
test('UTM and all click IDs preserve their values, unrelated query/hash/contact data are omitted',()=>{
  const value=page('https://liqevent.com/?utm_source=google&utm_medium=cpc&utm_campaign=B2B&utm_content=ad&utm_term=event&gclid=Aa_1&gbraid=Bb-2&wbraid=Cc_3&email=private@example.test#contact',storage(),time,'https://google.com/search?q=private').context();
  assert.equal(value.first_touch.gclid,'Aa_1'); assert.equal(value.first_touch.gbraid,'Bb-2'); assert.equal(value.first_touch.wbraid,'Cc_3');
  assert.equal(value.first_touch.utm_term,'event'); assert.equal(value.first_touch.referrer,'https://google.com/search');
  assert.equal(JSON.stringify(value).includes('private'),false);
  assert.equal(page('https://liqevent.com/?gclid=a&gclid=b').context().first_touch.gclid,null);
  assert.equal(page('https://liqevent.com/?utm_campaign=24146502700').context().first_touch.utm_campaign,'24146502700');
});
test('missing storage or browser crypto cannot prevent a lead, IDs are only generated for payloads',()=>{
  const shared=storage(),collector=page('https://liqevent.com/',shared);
  const a=collector.submission(),b=collector.submission();
  assert.match(a.submission_id,/^[0-9a-f-]{36}$/);assert.notEqual(a.submission_id,b.submission_id);
  assert.equal(shared.getItem(api.KEY).includes('submission_id'),false);
  const broken=api.createCollector({href:()=> 'https://liqevent.com/?gclid=KeepMe',storage:()=>{throw Error('blocked');},referrer:()=>'',now:()=>time});
  assert.equal(broken.context().status,'storage_unavailable');
  assert.equal(broken.submission().submission_id,'unknown');
  assert.equal(broken.context().first_touch.gclid,'KeepMe');
});
test('module never writes analytics consent, permanent storage or sends events/network',()=>{
  const source=fs.readFileSync(require.resolve('../assets/js/lead-attribution.js'),'utf8');
  const forbidden=()=>{throw Error('Forbidden analytics or network');};
  const win={location:{href:'https://liqevent.com/?gclid=ABC'},document:{referrer:''},sessionStorage:storage(),
    fetch:forbidden,gtag:forbidden,fbq:forbidden,dataLayer:[]};
  Object.defineProperty(win,'localStorage',{get:forbidden});Object.defineProperty(win.document,'cookie',{get:forbidden,set:forbidden});
  vm.runInNewContext(source,{window:win,URL,Date,TextEncoder});
  assert.equal(win.LIQEVENT_ATTRIBUTION.context().first_touch.gclid,'ABC'); assert.deepEqual(win.dataLayer,[]);
  assert.equal(/localStorage|document\.cookie|consent.*granted|MAX_AGE_MS/.test(source),false);
});
