import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCapture, environment, connection, request, event } from './source-loader.mjs';
const ack = patch => ({ protocol:'test-store-qualification-result-v1', entryId:'22222222-2222-4222-8222-222222222222',
  status:'captured',phase:'capturing',durable:true,acknowledgementAllowed:true,behavioralQualificationGranted:false,authorityGranted:false,...patch });
test('independent capture is disabled for empty and legacy environments',async()=>{
  for(const env of [{},{TEST_STORE_QUALIFICATION_ENABLED:'true'},{TEST_STORE_V2_INGRESS_ENABLED:'true'}]){
    const api=loadCapture(env); assert.equal((await api.edge.handler(request())).status,503);
  }
});
test('exact authenticated encrypted request reaches only the dedicated RPC with separate backend credentials',async()=>{
  const calls=[];const api=loadCapture(environment(),async(url,options)=>{calls.push({url:String(url),options});return Response.json(ack());});
  const raw=JSON.stringify(event()), response=await api.edge.handler(request(raw));assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.economicProjectionAllowed,false);assert.equal(calls.length,1);
  const call=calls[0];assert.equal(call.url,'https://synthetic.invalid/rest/v1/rpc/isolated_test_store_capture_ingest_v1');
  assert.equal(call.options.redirect,'error');assert.equal(call.options.headers.authorization,'Bearer synthetic-server-credential');
  assert.notEqual(call.options.headers.authorization,connection().authentication.secret);assert.equal(call.options.signal.aborted,true);
  const body=JSON.parse(call.options.body);assert.deepEqual(Object.keys(body).sort(),['p_connection_id','p_connection_revision','p_envelope','p_observation']);
  assert.equal(new TextDecoder().decode(await api.qualification.decryptQualificationEnvelope(body.p_envelope,connection())),raw);
});
test('invalid independent identity or backend configuration cannot fetch',async()=>{
  for(const patch of [{RCQ_CAPTURE_V1_CONNECTION_REVISION:'01'},{RCQ_CAPTURE_V1_CONNECTION_REVISION:'9007199254740992'},
    {RCQ_CAPTURE_V1_STORAGE_KEY_BASE64:'invalid'},{SUPABASE_URL:'http://synthetic.invalid'},
    {SUPABASE_URL:'https://synthetic.invalid/path'},{SUPABASE_URL:'https://synthetic.invalid?x=1'},
    {SUPABASE_SERVICE_ROLE_KEY:''},{SUPABASE_SERVICE_ROLE_KEY:'bad\nkey'}]) {
    let calls=0;const api=loadCapture({...environment(),...patch},()=>{calls++;throw Error('unexpected');});
    assert.equal((await api.edge.handler(request())).status,503);assert.equal(calls,0);
  }
});
test('provider authentication fails before persistence',async()=>{
  const api=loadCapture(environment());assert.equal((await api.edge.handler(request('{}','wrong'))).status,401);
});
test('transport errors, invalid results, oversized bytes and falsely authoritative acknowledgements fail closed',async()=>{
  for(const responder of [()=>{throw Error('private backend detail');},()=>Response.json(ack(),{status:201}),
    ()=>new Response('not json'),()=>new Response('a'.repeat(16385)),()=>new Response(new Uint8Array([255])),
    ()=>Response.json(ack({authorityGranted:true})),()=>Response.json(ack({durable:false})),
    ()=>Response.json({...ack(),extra:'unreviewed'})]){
    let calls=0;const api=loadCapture(environment(),()=>{calls++;return responder();});
    const response=await api.edge.handler(request());assert.equal(response.status,503);assert.equal(calls,1);
    assert.equal((await response.text()).includes('private backend detail'),false);
  }
});
