import assert from 'node:assert/strict';
import {createHash,randomUUID,timingSafeEqual,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const serviceKey='synthetic-service-key',projectUrl='https://bmkkhihfbmsnnmcqkoly.supabase.co';
const pin=key=>createHash('sha256').update(key,'utf8').digest('hex');
function load(path,imports={}) {
  const source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  const js=ts.transpileModule(source,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText;
  const exports={};
  new Function('exports',...Object.keys(imports),js)(exports,...Object.values(imports));
  return exports;
}
const brandDependencies=load('../supabase/functions/_shared/brand-retention-expiry.ts');
const workerDependencies={
  ...load('../supabase/functions/_shared/deleted-content-retention.ts'),
  ...load('../supabase/functions/_shared/deleted-content-media-expiry.ts'),
  ...load('../supabase/functions/_shared/brand-retention-worker.ts',brandDependencies),
};
const {runDeletedContentRetentionWorker}=load('../supabase/functions/_shared/deleted-content-retention-worker.ts',workerDependencies);

function fixture(options={}) {
  const env={RETENTION_WORKER_SERVICE_KEY_SHA256:pin(serviceKey),SUPABASE_URL:projectUrl,
    SUPABASE_SERVICE_ROLE_KEY:'synthetic-different-injected-key',...options.env};
  const calls=[],logs=[],envReads=[],comparisons=[],fetches=[],brandRequests=[];let handler,clientSettings;
  const Deno={env:{get:name=>{envReads.push(name);return env[name];}},serve:value=>{handler=value;}};
  const createClient=(url,key,settings)=>{
    calls.push('createClient');assert.equal(url,projectUrl);assert.equal(key,options.expectedKey??serviceKey);
    assert.deepEqual(settings.auth,{persistSession:false,autoRefreshToken:false});
    assert.deepEqual(Object.keys(settings).sort(),['auth','global']);
    assert.deepEqual(Object.keys(settings.global),['fetch']);
    assert.equal(typeof settings.global.fetch,'function');clientSettings=settings;
    return {rpc:(name,args)=>{
      calls.push(name);
      if(options.rpcError)throw Error('synthetic-private-rpc-error');
      if(name===options.brandRpcErrorAt)throw Error('synthetic-private-brand-rpc-error');
      let data;
      if(name==='list_deleted_content_expiry_work'&&options.textWork) {
        assert.deepEqual(args,{});data=options.textWork;
      } else if(name==='expire_deleted_content_text') {
        assert.deepEqual(args,{p_deletion_id:options.textWork.deletionIds[0]});data=options.textReply;
      } else if(name==='list_platform_brand_retention_expiry_work') {
        assert.deepEqual(args,{});
        data=options.brandWork??{enabled:false,qualified:false,assetIds:[],limit:25};
      } else if(name==='record_platform_brand_retention_worker_heartbeat') {
        assert.deepEqual(args,{p_enabled:options.brandWork?.enabled??false,p_qualified:options.brandWork?.qualified??false});
        data={status:'recorded',enabled:args.p_enabled,qualified:args.p_qualified,permanentlyAbsent:false};
      } else if(name==='begin_platform_brand_retention_batch_transport') {
        data={status:'claimed',assetId:args.p_asset_id,claimToken:'22222222-2222-4222-8222-222222222222'};
      } else if(name==='read_platform_brand_retention_batch_claim'||name==='prepare_platform_brand_retention_batch_dispatch') {
        data={status:name==='prepare_platform_brand_retention_batch_dispatch'?'dispatch_authorized':'authorized',assetId:args.p_asset_id,claimToken:args.p_claim_token,
          provider:'supabase',bucket:'platform-brand-assets',objectKey:`owner/logo/${args.p_asset_id}.png`,
          storageObjectId:'33333333-3333-4333-8333-333333333333',storageVersion:'exact-version',
          providerOrigin:projectUrl,providerContractSha256:'a'.repeat(64),exactVersionDelete:true,permanentlyAbsent:false,
          metadataPresent:true,observationOnly:options.brandObservationOnly??false,deleteAcknowledged:options.brandAcknowledged??false};
      } else if(name==='record_platform_brand_retention_transport_result') {
        data={status:args.p_outcome,assetId:args.p_asset_id,claimToken:args.p_claim_token,permanentlyAbsent:false};
      } else {
        assert.deepEqual(args,{});
        data=name==='record_deleted_content_worker_heartbeat'?{}:{enabled:false};
      }
      return {then:resolve=>resolve({data,error:null})};
    }};
  };
  const origin=()=>{calls.push('origin');throw Error('unexpected_provider_access');};
  const brandOrigin=(url,key)=>{
    calls.push('brandOrigin');assert.equal(url,projectUrl);assert.equal(key,options.expectedKey??serviceKey);
    return brandDependencies.createBrandExpiryOrigin(url,key,async(input,init)=>{
      brandRequests.push({input:String(input),init});
      if(init.method==='GET'&&options.brandCurrentPresent&&!String(input).includes('/object/info/'))return new Response('synthetic cached bytes',{status:200});
      if(init.method==='GET')return new Response(JSON.stringify({code:'NoSuchKey',statusCode:'404'}),{status:options.brandDeleteStatus??400});
      return new Response(null,{status:init.method==='DELETE'?(options.brandDeleteStatus??204):404});
    });
  };
  const logger={warn:value=>{if(options.loggerError)throw Error('synthetic-private-log-error');logs.push(JSON.parse(value));}};
  const crypto={
    randomUUID:()=>{if(options.idError)throw Error('synthetic-private-id-error');return randomUUID();},
    subtle:{digest:async(...args)=>{
      if(options.digestError)throw Error('synthetic-private-digest-error');
      return webcrypto.subtle.digest(...args);
    }},
  };
  load('../supabase/functions/deleted-content-retention-expiry/index.ts',{
    Deno,createClient,runDeletedContentRetentionWorker,createRetiredMediaOriginCleanup:origin,
    createBrandExpiryOrigin:brandOrigin,console:logger,crypto,
    timingSafeEqual:(actual,expected)=>{
      comparisons.push([actual.byteLength,expected.byteLength]);
      if(options.compareError)throw Error('synthetic-private-comparison-error');
      return timingSafeEqual(actual,expected);
    },
    fetch:async(input,init)=>{fetches.push({input,init});return new Response('{}');},
  });
  assert.equal(typeof handler,'function');
  return {handler,calls,logs,envReads,env,comparisons,fetches,brandRequests,get clientSettings(){return clientSettings;}};
}

function request(authorization='Bearer '+serviceKey,options={}) {
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
  assert.deepEqual(f.logs,[{event:'deleted_content_retention_auth_denied',requestId:body.requestId,reason}]);
  assert.deepEqual(f.calls,[],'denial must precede client, work claims, heartbeat and provider access');
  assert.deepEqual(f.fetches,[]);
  assert.deepEqual(f.envReads,['RETENTION_WORKER_SERVICE_KEY_SHA256','SUPABASE_URL']);
  return body;
}

test('missing or malformed verifier fails closed without falling back to the injected key',async()=>{
  for(const value of [undefined,'',pin(serviceKey).toUpperCase(),'0'.repeat(63),'0'.repeat(65),
    'g'.repeat(64),' '+pin(serviceKey),pin(serviceKey)+'\n',serviceKey]) {
    const f=fixture({env:{RETENTION_WORKER_SERVICE_KEY_SHA256:value,SUPABASE_SERVICE_ROLE_KEY:serviceKey}});
    await denied(f,request(),'configuration_invalid');assert.deepEqual(f.comparisons,[]);
  }
});

test('configuration must bind exactly the approved HTTPS project before authentication or client creation',async()=>{
  for(const value of [undefined,'','https://other.supabase.co','http://bmkkhihfbmsnnmcqkoly.supabase.co',
    projectUrl+'/',projectUrl+':443',projectUrl+'/rest/v1',projectUrl+'?redirect=private',
    projectUrl+'#private',projectUrl+'.attacker.invalid',
    'https://user@bmkkhihfbmsnnmcqkoly.supabase.co',projectUrl.toUpperCase()]) {
    const f=fixture({env:{SUPABASE_URL:value}});
    await denied(f,request(),'configuration_invalid');assert.deepEqual(f.comparisons,[]);
  }
});

test('strict bounded bearer parsing rejects missing, malformed, duplicate and non-bearer authority',async()=>{
  for(const auth of [null,'','Bearer','Bearer ','Basic synthetic-service-key','bearer synthetic-service-key',
    'Bearer  synthetic-service-key','Bearer\tsynthetic-service-key','Bearer '+serviceKey+', Bearer '+serviceKey,
    'Bearer '+serviceKey+' other','Bearer synthetic/key','Bearer synthetic=key','Bearer '+'x'.repeat(4097)]) {
    const f=fixture();await denied(f,request(auth,{headers:{apikey:serviceKey}}),'bearer_mismatch');
    assert.deepEqual(f.comparisons,[]);
  }
  const duplicate=request(null);duplicate.headers.append('Authorization','Bearer '+serviceKey);
  duplicate.headers.append('Authorization','Bearer '+serviceKey);
  await denied(fixture(),duplicate,'bearer_mismatch');
});

test('wrong credentials and replay of the stored hash never authorize, even with a matching injected key',async()=>{
  for(const key of ['synthetic-other-key','synthetic-service-keY','eyJyb2xlIjoic2VydmljZV9yb2xlIn0.e30.fake',
    pin(serviceKey),'x'.repeat(4096)]) {
    const f=fixture({env:{SUPABASE_SERVICE_ROLE_KEY:key}});
    await denied(f,request('Bearer '+key,{headers:{apikey:key}}),'bearer_mismatch');
    assert.deepEqual(f.comparisons,[[32,32]],'compare real fixed-length SHA-256 digests');
  }
});

test('verified incoming key is used despite absent, stale or whitespace-padded injected keys',async()=>{
  for(const runtimeKey of [undefined,'','synthetic-stale-key',serviceKey+' ']) {
    for(const apiKey of [undefined,'','synthetic-unrelated-key',serviceKey]) {
      const f=fixture({env:{SUPABASE_SERVICE_ROLE_KEY:runtimeKey}});
      const response=await f.handler(request(undefined,{headers:apiKey===undefined?{}:{apikey:apiKey}}));
      assert.equal(response.status,200);assert.deepEqual(f.comparisons,[[32,32]]);
      assert.equal(f.calls.at(-1),'record_deleted_content_worker_heartbeat');
      assert.deepEqual(f.logs,[]);
      assert.deepEqual(f.envReads,['RETENTION_WORKER_SERVICE_KEY_SHA256','SUPABASE_URL']);
    }
  }
});

test('disabled authenticated pass runs the real worker and heartbeat without provider construction',async()=>{
  const f=fixture();
  const response=await f.handler(request(' \tBearer '+serviceKey+'\t '));
  assert.equal(response.status,200,'Fetch normalizes outer header whitespace before the handler');
  assert.deepEqual(await response.json(),{
    text:{enabled:false,results:[]},media:{enabled:false,results:[]},stages:{enabled:false,results:[]},
    brand:{enabled:false,qualified:false,success:true,results:[],heartbeatRecorded:true,permanentPhysicalAbsenceGuaranteed:false},
    success:true,
    permanentPhysicalAbsenceGuaranteed:false,
  });
  assert.deepEqual(f.calls,['createClient','list_deleted_content_expiry_work',
    'list_deleted_content_media_expiry_work','list_deleted_content_stage_cleanup_work',
    'list_platform_brand_retention_expiry_work','record_platform_brand_retention_worker_heartbeat',
    'record_deleted_content_worker_heartbeat']);
  assert.deepEqual(f.logs,[]);
});

test('invalid text expiry outcomes cannot refresh successful heartbeat or continue provider work',async()=>{
  const id='11111111-1111-4111-8111-111111111111';
  for(const textReply of [{status:'failed'},{status:'future_status'},{status:'purged'},[],null]) {
    const f=fixture({textWork:{enabled:true,deletionIds:[id]},textReply});
    const response=await f.handler(request());
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'retention_work_failed',permanentPhysicalAbsenceGuaranteed:false});
    assert.deepEqual(f.calls,['createClient','list_deleted_content_expiry_work','expire_deleted_content_text']);
    assert.deepEqual(f.brandRequests,[]);
  }
});

test('actual worker entrypoint lazily uses a separate exact Brand origin with the verified project and key',async()=>{
  const asset='11111111-1111-4111-8111-111111111111';
  const f=fixture({brandWork:{enabled:true,qualified:true,assetIds:[asset],limit:25}});
  const response=await f.handler(request()),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.success,true);
  assert.deepEqual(body.brand.results,[{assetId:asset,status:'observed_absent',permanentlyAbsent:false}]);
  assert.equal(f.calls.filter(name=>name==='brandOrigin').length,1);
  assert.equal(f.calls.includes('origin'),false,'Brand must never use the R2 cleanup origin');
  assert.deepEqual(f.brandRequests.map(call=>call.init.method),['DELETE','GET','HEAD','GET']);
  for(const call of f.brandRequests) {
    const url=new URL(call.input);assert.equal(url.origin,projectUrl);assert.equal(url.search,call.init.method==='GET'?'':'?versionId=exact-version');
    assert.equal(call.init.headers.Authorization,'Bearer '+serviceKey);assert.equal(call.init.redirect,'error');
  }
  assert.deepEqual(f.envReads,['RETENTION_WORKER_SERVICE_KEY_SHA256','SUPABASE_URL']);
  assert.equal(body.permanentPhysicalAbsenceGuaranteed,false);
});

test('actual entrypoint uses batch permit once and later reconciles GET200 without another DELETE',async()=>{
  const asset='11111111-1111-4111-8111-111111111111';
  const options={brandWork:{enabled:true,qualified:true,assetIds:[asset],limit:25},brandCurrentPresent:true};
  const f=fixture(options);
  let response=await f.handler(request()),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.brand.results[0].status,'delete_acknowledged','current GET200 cannot prove absence');
  assert.equal(f.calls.filter(name=>name==='prepare_platform_brand_retention_batch_dispatch').length,1);
  assert.equal(f.calls.includes('prepare_platform_brand_retention_dispatch'),false,'entrypoint must retain batch gate wrapper');
  // Model the persisted immutable intent and acknowledgement returned by the
  // actual SQL reader on subsequent batches; no elapsed-time success shortcut.
  options.brandObservationOnly=true;options.brandAcknowledged=true;
  response=await f.handler(request());body=await response.json();
  assert.equal(response.status,200);assert.equal(body.brand.results[0].status,'delete_acknowledged');
  options.brandCurrentPresent=false;
  response=await f.handler(request());body=await response.json();
  assert.equal(response.status,200);assert.equal(body.brand.results[0].status,'observed_absent');
  assert.equal(f.brandRequests.filter(call=>call.init.method==='DELETE').length,1,'three entrypoint calls dispatch exactly once');
  assert.equal(f.calls.filter(name=>name==='prepare_platform_brand_retention_batch_dispatch').length,1,'observation-only path does not request another permit');
  assert.equal(body.permanentPhysicalAbsenceGuaranteed,false);
});

test('unqualified or malformed Brand dispatch never constructs either provider origin',async()=>{
  for(const malformed of [false,true]) {
    const f=fixture({brandWork:{enabled:true,qualified:false,assetIds:malformed?['invalid']:[],limit:25}});
    const response=await f.handler(request()),body=await response.json();
    assert.equal(response.status,malformed?503:200);assert.equal(body.success,!malformed);
    assert.equal(f.calls.includes('brandOrigin'),false);assert.equal(f.calls.includes('origin'),false);
    assert.deepEqual(f.brandRequests,[]);
    if(malformed) assert.equal(f.calls.some(name=>name.includes('heartbeat')),false);
    else {assert.equal(body.brand.enabled,true);assert.equal(body.brand.qualified,false);}
  }
});

test('entrypoint reports Brand provider and RPC failure as 503 with safe partial outcomes, never R2 success',async()=>{
  const asset='11111111-1111-4111-8111-111111111111';
  for(const options of [{brandDeleteStatus:503},{brandRpcErrorAt:'record_platform_brand_retention_transport_result'}]) {
    const f=fixture({...options,brandWork:{enabled:true,qualified:true,assetIds:[asset],limit:25}});
    const response=await f.handler(request()),body=await response.json();
    assert.equal(response.status,503);assert.equal(body.success,false);assert.equal(body.error,'retention_work_failed');
    assert.equal(body.brand.results[0].status,options.brandDeleteStatus?'failed':'unconfirmed');
    assert.equal(body.brand.heartbeatRecorded,false);
    assert.equal(f.calls.some(name=>name.includes('heartbeat')),false);
    assert.equal(body.permanentPhysicalAbsenceGuaranteed,false);
    assert.equal(JSON.stringify(body).includes('synthetic-private'),false);
  }
});

test('pin is read per request and removal or replacement immediately denies the previous key',async()=>{
  const f=fixture();assert.equal((await f.handler(request())).status,200);
  for(const value of [undefined,pin('synthetic-replacement-key')]) {
    f.env.RETENTION_WORKER_SERVICE_KEY_SHA256=value;f.calls.length=0;f.logs.length=0;f.envReads.length=0;
    await denied(f,request(),value===undefined?'configuration_invalid':'bearer_mismatch');
  }
  const replacement=fixture({expectedKey:'synthetic-replacement-key',
    env:{RETENTION_WORKER_SERVICE_KEY_SHA256:pin('synthetic-replacement-key')}});
  assert.equal((await replacement.handler(request('Bearer synthetic-replacement-key'))).status,200);
});

test('digest or vetted comparison failures deny before effects without disclosing exceptions',async()=>{
  for(const options of [{digestError:true},{compareError:true}]) {
    const f=fixture(options);const body=await denied(f,request(),'verification_failed');
    assert.equal(JSON.stringify({body,logs:f.logs}).includes('synthetic-private'),false);
  }
});

test('denial diagnostics contain only fixed categories and server-generated correlation',async()=>{
  const f=fixture();
  const body=await denied(f,request('Bearer synthetic-private-token',{
    headers:{'x-request-id':'synthetic-private-request-id',apikey:serviceKey,
      cookie:'private=synthetic-private-cookie'},body:'synthetic-private-body',
  }),'bearer_mismatch');
  const serialized=JSON.stringify({body,logs:f.logs});
  for(const value of [serviceKey,pin(serviceKey),projectUrl,'synthetic-private','Bearer','apikey','cookie']) {
    assert.equal(serialized.includes(value),false);
  }
  const other=await denied(fixture(),request(null),'bearer_mismatch');
  assert.notEqual(body.requestId,other.requestId);
});

test('database transport restricts origin and credentials and forces redirect rejection',async()=>{
  const f=fixture();assert.equal((await f.handler(request())).status,200);
  const guardedFetch=f.clientSettings.global.fetch;
  for(const input of [projectUrl+'/rest/v1/rpc/list_deleted_content_expiry_work',
    new URL(projectUrl+'/rest/v1/'),new Request(projectUrl+'/rest/v1/',{redirect:'follow'})]) {
    await guardedFetch(input,{method:'POST',redirect:'follow',headers:{Authorization:'Bearer '+serviceKey}});
    assert.equal(f.fetches.at(-1).input,input);
    assert.equal(f.fetches.at(-1).init.redirect,'error');
    assert.deepEqual(f.fetches.at(-1).init.headers,{Authorization:'Bearer '+serviceKey});
  }
  const allowedCalls=f.fetches.length;
  for(const input of ['https://attacker.invalid/',projectUrl+'.attacker.invalid/rest/v1/',
    'http://bmkkhihfbmsnnmcqkoly.supabase.co/rest/v1/',
    'https://user:pass@bmkkhihfbmsnnmcqkoly.supabase.co/rest/v1/',
    projectUrl+':444/rest/v1/',new Request('https://attacker.invalid/'),'not-a-url']) {
    await assert.rejects(guardedFetch(input,{headers:{Authorization:'Bearer '+serviceKey}}));
  }
  assert.equal(f.fetches.length,allowedCalls,'foreign destinations must never reach fetch');
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

test('method rejection precedes configuration and work; authenticated work failure stays generic',async()=>{
  const method=fixture(),methodResponse=await method.handler(request(null,{method:'GET'}));
  assert.equal(methodResponse.status,405);
  assert.deepEqual(await methodResponse.json(),{error:'method_not_allowed'});
  assert.deepEqual(method.calls,[]);assert.deepEqual(method.envReads,[]);assert.deepEqual(method.logs,[]);
  const work=fixture({rpcError:true}),workResponse=await work.handler(request());
  assert.equal(workResponse.status,503);
  assert.deepEqual(await workResponse.json(),{error:'retention_work_failed',permanentPhysicalAbsenceGuaranteed:false});
  assert.deepEqual(work.calls,['createClient','list_deleted_content_expiry_work']);assert.deepEqual(work.logs,[]);
});

test('entrypoint does not disable default gateway JWT verification and uses vetted Node crypto',()=>{
  const source=readFileSync(new URL('../supabase/functions/deleted-content-retention-expiry/index.ts',import.meta.url),'utf8');
  assert.match(source,/import \{timingSafeEqual\} from "node:crypto";/);
  assert.equal(source.includes('SUPABASE_SERVICE_ROLE_KEY'),false);
  const config=readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8');
  const section=config.match(/\[functions\.deleted-content-retention-expiry\]([^[]*)/);
  assert.doesNotMatch(section?.[1]??'',/verify_jwt\s*=\s*false/,'Supabase defaults to JWT verification');
});
