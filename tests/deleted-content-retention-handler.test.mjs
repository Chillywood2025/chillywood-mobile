import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const serviceKey='synthetic-service-key',projectUrl='https://project.supabase.test';
function load(path,imports={}) {
  const source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  const js=ts.transpileModule(source,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText;
  const exports={};
  new Function('exports',...Object.keys(imports),js)(exports,...Object.values(imports));
  return exports;
}
const workerDependencies={
  ...load('../supabase/functions/_shared/deleted-content-retention.ts'),
  ...load('../supabase/functions/_shared/deleted-content-media-expiry.ts'),
};
const {runDeletedContentRetentionWorker}=load('../supabase/functions/_shared/deleted-content-retention-worker.ts',workerDependencies);

function fixture(options={}) {
  const env={SUPABASE_SERVICE_ROLE_KEY:serviceKey,SUPABASE_URL:projectUrl,...options.env};
  const calls=[],logs=[],envReads=[];let handler;
  const Deno={env:{get:name=>{envReads.push(name);return env[name];}},serve:value=>{handler=value;}};
  const createClient=(url,key,settings)=>{
    calls.push('createClient');assert.equal(url,projectUrl);assert.equal(key,serviceKey);
    assert.deepEqual(settings,{auth:{persistSession:false,autoRefreshToken:false}});
    return {rpc:(name,args)=>{
      calls.push(name);assert.deepEqual(args,{});
      if(options.rpcError)throw Error('synthetic-private-rpc-error');
      const data=name==='record_deleted_content_worker_heartbeat'?{}:{enabled:false};
      return {then:resolve=>resolve({data,error:null})};
    }};
  };
  const origin=()=>{calls.push('origin');throw Error('unexpected_provider_access');};
  const logger={warn:value=>{if(options.loggerError)throw Error('synthetic-private-log-error');logs.push(JSON.parse(value));}};
  const crypto={randomUUID:()=>{if(options.idError)throw Error('synthetic-private-id-error');return randomUUID();}};
  load('../supabase/functions/deleted-content-retention-expiry/index.ts',{
    Deno,createClient,runDeletedContentRetentionWorker,createRetiredMediaOriginCleanup:origin,console:logger,crypto,
  });
  assert.equal(typeof handler,'function');
  return {handler,calls,logs,envReads,env};
}

function request(authorization=`Bearer ${serviceKey}`,options={}) {
  const headers=new Headers(options.headers);
  if(authorization!==null)headers.set('authorization',authorization);
  return new Request('https://edge.test/?private=synthetic-private-query',{
    method:options.method??'POST',headers,...(options.body===undefined?{}:{body:options.body}),
  });
}

async function denied(f,req,reason) {
  const response=await f.handler(req),body=await response.json();
  assert.equal(response.status,403);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('content-type'),'application/json');
  assert.deepEqual(Object.keys(body).sort(),['error','requestId']);
  assert.equal(body.error,'not_allowed');
  assert.match(body.requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(f.logs,[{
    event:'deleted_content_retention_auth_denied',requestId:body.requestId,reason,
    serviceRoleKeyConfigured:Boolean(f.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseUrlConfigured:Boolean(f.env.SUPABASE_URL),
  }]);
  assert.deepEqual(f.calls,[],'denial must precede client, work claims, heartbeat and provider access');
  assert.deepEqual(f.envReads,['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_URL']);
  return body;
}

test('entrypoint distinguishes all missing configuration combinations only in server logs',async()=>{
  for(const absent of [undefined,'']) {
    for(const env of [
      {SUPABASE_SERVICE_ROLE_KEY:absent},{SUPABASE_URL:absent},
      {SUPABASE_SERVICE_ROLE_KEY:absent,SUPABASE_URL:absent},
    ])await denied(fixture({env}),request(),'configuration_missing');
  }
});

test('entrypoint preserves exact bearer equality and does not accept apikey, user or malformed authority',async()=>{
  for(const auth of [null,'','Bearer ordinary-user','Basic synthetic-service-key',
    'bearer synthetic-service-key','Bearer  synthetic-service-key','Bearer synthetic-service-key, Bearer ordinary-user']) {
    await denied(fixture(),request(auth,{headers:{apikey:serviceKey}}),'bearer_mismatch');
  }
});

test('denial diagnostics contain only categorical fields and server-generated correlation',async()=>{
  const f=fixture();
  const body=await denied(f,request('Bearer synthetic-private-token',{
    headers:{'x-request-id':'synthetic-private-request-id',apikey:serviceKey,
      cookie:'private=synthetic-private-cookie'},body:'synthetic-private-body',
  }),'bearer_mismatch');
  const serialized=JSON.stringify({body,logs:f.logs});
  for(const value of [serviceKey,projectUrl,'synthetic-private','Bearer','apikey','cookie']) {
    assert.equal(serialized.includes(value),false);
  }
  const second=fixture(),other=await denied(second,request(null),'bearer_mismatch');
  assert.notEqual(body.requestId,other.requestId);
});

test('synthetic trailing env-key whitespace reproduces mismatch without normalizing credentials',async()=>{
  const paddedKey=`${serviceKey} `;
  const req=request(`Bearer ${paddedKey}`);
  assert.equal(req.headers.get('Authorization'),`Bearer ${serviceKey}`,'Fetch headers trim outer whitespace');
  await denied(fixture({env:{SUPABASE_SERVICE_ROLE_KEY:paddedKey}}),req,'bearer_mismatch');
});

test('correct lowercase header name and surrounding header whitespace retain existing success semantics',async()=>{
  const f=fixture();
  const response=await f.handler(request(` \tBearer ${serviceKey}\t `));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{
    text:{enabled:false,results:[]},media:{enabled:false,results:[]},stages:{enabled:false,results:[]},
    permanentPhysicalAbsenceGuaranteed:false,
  });
  assert.deepEqual(f.calls,['createClient','list_deleted_content_expiry_work',
    'list_deleted_content_media_expiry_work','list_deleted_content_stage_cleanup_work',
    'record_deleted_content_worker_heartbeat']);
  assert.deepEqual(f.logs,[]);
});

test('configuration is read per request, not captured during bootstrap',async()=>{
  const f=fixture({env:{SUPABASE_SERVICE_ROLE_KEY:undefined}});
  await denied(f,request(),'configuration_missing');
  f.env.SUPABASE_SERVICE_ROLE_KEY=serviceKey;
  assert.equal((await f.handler(request())).status,200);
  assert.equal(f.logs.length,1);
});

test('logging or correlation failures cannot bypass denial or leak exceptions',async()=>{
  for(const options of [{loggerError:true},{idError:true}]) {
    const f=fixture(options),response=await f.handler(request(null)),body=await response.json();
    assert.equal(response.status,403);assert.equal(body.error,'not_allowed');
    assert.deepEqual(f.calls,[]);assert.deepEqual(f.logs,[]);
    assert.equal(JSON.stringify(body).includes('synthetic-private'),false);
    assert.deepEqual(Object.keys(body).sort(),options.idError?['error']:['error','requestId']);
  }
});

test('method rejection still precedes environment and work; authorized work failure stays generic',async()=>{
  const method=fixture(),methodResponse=await method.handler(request(null,{method:'GET'}));
  assert.equal(methodResponse.status,405);
  assert.deepEqual(await methodResponse.json(),{error:'method_not_allowed'});
  assert.deepEqual(method.calls,[]);assert.deepEqual(method.envReads,[]);assert.deepEqual(method.logs,[]);
  const work=fixture({rpcError:true}),workResponse=await work.handler(request());
  assert.equal(workResponse.status,503);
  assert.deepEqual(await workResponse.json(),{error:'retention_work_failed',permanentPhysicalAbsenceGuaranteed:false});
  assert.deepEqual(work.calls,['createClient','list_deleted_content_expiry_work']);
  assert.deepEqual(work.logs,[]);
});
