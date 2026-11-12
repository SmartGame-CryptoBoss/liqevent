import test from 'node:test';
import assert from 'node:assert/strict';
import api from '../../assets/js/lead-attribution.js';
import {handleRequest} from '../src/index.js';
import {attributionRecord,appendAttribution} from '../src/attribution.js';

const now=Date.parse('2026-11-12T20:00:00.000Z');
const context=api.createCollector({href:()=> 'https://liqevent.com/?utm_source=google&utm_medium=cpc&utm_campaign=B2B&gclid=Test_Exact_123',
  referrer:()=> 'https://www.google.com/', storage:()=>({getItem:()=>null,setItem(){}}),now:()=>now}).context();
const lead={name:'OFFLINE TEST',email:'test@example.invalid',eventType:'Корпоратив',privacyConsent:true,website:'',turnstileToken:'MOCKED',attribution_context:context};
const env={TURNSTILE_SECRET_KEY:'MOCK',BOT_TOKEN:'MOCK',CHAT_ID:'MOCK',FORMSPREE_ENDPOINT:'https://formspree.io/f/mock123',
  ATTEMPT_RATE_LIMITER:{limit:async()=>({success:true})},LEAD_RATE_LIMITER:{limit:async()=>({success:true})}};
const response=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
const request=data=>new Request('https://worker.example.invalid/',{method:'POST',headers:{Origin:'https://liqevent.com','Content-Type':'application/json'},body:JSON.stringify(data)});
const fixture=(fallback=false)=>{
  const calls=[],logs=[];
  const fetchImpl=async(url,options)=>{
    if(String(url).includes('/siteverify'))return response({success:true,hostname:'liqevent.com',action:'lead_form'});
    const body=JSON.parse(options.body); calls.push({url:String(url),body});
    if(String(url).includes('api.telegram.org'))return response({ok:!fallback});
    if(String(url).includes('formspree.io'))return response({ok:true});
    throw Error('Unexpected outbound URL in offline mock');
  };
  return {calls,logs,dependencies:{fetchImpl,uuid:()=> '11111111-1111-4111-8111-111111111111',now:()=>now,log:value=>logs.push(value)}};
};
test('V1 accepts optional metadata without becoming V2 and delivers one Telegram message',async()=>{
  const f=fixture(); const res=await handleRequest(request(lead),env,f.dependencies);
  const result=await res.json(); assert.equal(res.status,200); assert.equal(result.ok,true);
  assert.equal(result.channel,'telegram');assert.equal(result.submission_id,'11111111-1111-4111-8111-111111111111');
  assert.equal(f.calls.length,1); assert.match(f.calls[0].body.text,/Attribution/);
  assert.match(f.calls[0].body.text,/Test_Exact_123/); assert.match(f.calls[0].body.text,/google \/ cpc/);
  assert.equal('lead_ref' in result,false); assert.equal('test_id' in result,false);
  assert.equal(f.logs.length,1);
  assert.deepEqual(Object.keys(f.logs[0]),['event','submission_id','received_at','channel','attribution_status']);
  assert.equal(JSON.stringify(f.logs).includes('test@example.invalid'),false);
  assert.equal(JSON.stringify(f.logs).includes('Test_Exact_123'),false);
});
test('existing V2 assignment and return values survive optional metadata',async()=>{
  const f=fixture(); const id='22222222-2222-4222-8222-222222222222';
  const result=await (await handleRequest(request({...lead,test_id:'liq_v2_landing_202610',variant:'corporate',lead_ref:id}),env,f.dependencies)).json();
  assert.equal(result.ok,true); assert.equal(result.lead_ref,id);assert.equal(result.variant,'corporate');
  assert.equal(result.submission_id,'11111111-1111-4111-8111-111111111111');assert.equal(f.calls.length,1);
});
test('fallback receives the same server ID and full sanitized attribution context',async()=>{
  const f=fixture(true);const result=await (await handleRequest(request(lead),env,f.dependencies)).json();
  assert.equal(result.channel,'formspree');assert.equal(f.calls.length,2);
  const fallback=f.calls[1].body;
  assert.equal(fallback.submission_id,result.submission_id);
  assert.equal(fallback.attribution_context.first_touch.gclid,'Test_Exact_123');
  assert.ok(f.calls[0].body.text.includes(result.submission_id));
});
test('invalid optional metadata never rejects a valid protected business lead',async()=>{
  const f=fixture();const result=await (await handleRequest(request({...lead,attribution_context:{schema_version:999,first_touch:context.first_touch}}),env,f.dependencies)).json();
  assert.equal(result.ok,true);assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].body.text.includes('Test_Exact_123'),false);
  assert.match(f.calls[0].body.text,/unknown/);
});
test('browser submission ID survives Telegram and Formspree, invalid IDs safely fall back',async()=>{
  const id='33333333-3333-4333-8333-333333333333';
  for(const fallback of [false,true]){
    const f=fixture(fallback);const result=await (await handleRequest(request({...lead,submission_id:id}),env,f.dependencies)).json();
    assert.equal(result.submission_id,id);assert.ok(f.calls[0].body.text.includes(id));
    if(fallback){assert.equal(f.calls[1].body.submission_id,id);assert.deepEqual(f.calls[1].body.attribution_context,context);}
  }
  const f=fixture();const result=await (await handleRequest(request({...lead,submission_id:'<bad>private@example.test'}),env,f.dependencies)).json();
  assert.equal(result.submission_id,'11111111-1111-4111-8111-111111111111');
  assert.equal(f.calls[0].body.text.includes('private@example.test'),false);
});
test('Turnstile, consent and delivery failure still block successful responses',async()=>{
  const f=fixture();const res=await handleRequest(request({...lead,privacyConsent:false}),env,f.dependencies);
  assert.equal(res.status,422);assert.equal(f.calls.length,0);
  const missing=await handleRequest(request({...lead,turnstileToken:''}),env,f.dependencies);
  assert.equal(missing.status,400);assert.equal(f.calls.length,0);
  const bad={...f.dependencies,fetchImpl:async(url)=>String(url).includes('/siteverify')?response({success:true,hostname:'liqevent.com',action:'lead_form'}):response({ok:false})};
  const failed=await handleRequest(request(lead),{...env,FORMSPREE_ENDPOINT:''},bad);
  assert.equal(failed.status,502);assert.equal((await failed.json()).ok,false);
});
test('Telegram HTML escaping and length limits do not corrupt IDs',()=>{
  const record=attributionRecord({...context,first_touch:{...context.first_touch,utm_campaign:'<b>fake</b>'}},'server-id',now);
  const text=appendAttribution('BASE',record);
  assert.match(text,/&lt;b&gt;fake&lt;\/b&gt;/);assert.equal(text.includes('Campaign (first): <b>fake'),false);
  const limited=appendAttribution('x'.repeat(3650),record);
  assert.ok(limited.length<=4096);assert.match(limited,/telegram_message_limit/);
  assert.equal(limited.includes('Test_Exact_12\n'),false);
});
