import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const source=readFileSync(new URL('../supabase/functions/_shared/brand-retention-origin.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source.replace(/^import .*;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};new Function('exports','createHash',js)(exports,createHash);
const binding={assetId:'00000000-0000-4000-8000-000000000001',ownerId:'platform_rachi_official',sourceCreatedAt:'2026-10-01T01:00:00Z',storageObjectId:'00000000-0000-4000-8000-000000000002',storageVersion:'object-incarnation-1',provider:'supabase',bucket:'platform-brand-assets',objectKey:'platform_rachi_official/logo/fixture.png'};
function fixture(options={}) {
  const calls=[];let checks=0;
  const verify=exports.createBrandOriginVerifier({projectUrl:options.projectUrl??'https://project.supabase.test',
    bindingCurrent:async()=>{calls.push('binding');if(options.bindingError)throw Error('secret synthetic token');return ++checks!==options.denyCheck;},
    signedUrl:async()=>{calls.push('sign');if(options.signError)throw Error('secret synthetic token');return options.url??`https://project.supabase.test/storage/v1/object/sign/${binding.bucket}/${binding.objectKey}?token=synthetic`;},
    fetcher:async(url,init)=>{calls.push('GET');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
      if(options.error)throw Error('secret synthetic token');
      return new Response(options.body??'abcdef',{status:options.status??200,headers:{'content-length':'6',...options.headers}});
    }});
  return {verify,calls};
}
test('full exact readback preserves official TEXT owner and returns no scan or enrollment authority',async()=>{
  const f=fixture();const proof=await f.verify(binding);
  assert.deepEqual(f.calls,['binding','sign','GET','binding']);
  assert.equal(proof.sha256,createHash('sha256').update('abcdef').digest('hex'));
  assert.equal(proof.sizeBytes,6);assert.equal(proof.storageVersion,binding.storageVersion);
  assert.equal(proof.enrollmentAllowed,false);assert.equal(proof.scanEvidence,false);
  assert.equal(JSON.stringify(proof).includes('token'),false);
});
test('insecure or decorated project endpoints reject before any signing or reads',()=>{
  for(const projectUrl of ['http://project.test','https://user:pass@project.test','https://project.test/path','https://project.test/?query=1','https://project.test/#fragment','invalid']) {
    assert.throws(()=>fixture({projectUrl}),/brand_origin_config_invalid/);
  }
});
test('cross-project, wrong-key, userinfo and fragment signed URLs reject before GET',async()=>{
  for(const url of ['https://other.test/storage/v1/object/sign/platform-brand-assets/fixture',
    'https://project.supabase.test/storage/v1/object/sign/platform-brand-assets/other',
    `https://user:pass@project.supabase.test/storage/v1/object/sign/${binding.bucket}/${binding.objectKey}`,
    `https://project.supabase.test/storage/v1/object/sign/${binding.bucket}/${binding.objectKey}#fragment`]) {
    const f=fixture({url});await assert.rejects(f.verify(binding),/brand_origin_signed_url_invalid/);assert.equal(f.calls.includes('GET'),false);
  }
});
test('malformed incarnation and cross-owner keys cannot initiate transport',async()=>{
  for(const patch of [{assetId:'bad'},{storageObjectId:'bad'},{storageVersion:''},{sourceCreatedAt:'bad'},
    {ownerId:'wrong-owner'},{objectKey:'platform_rachi_official/../other'}, {objectKey:'platform_rachi_official/%2fsecret'},
    {provider:'s3'},{bucket:'another-bucket'}]) {
    const f=fixture();await assert.rejects(f.verify({...binding,...patch}),/brand_origin_binding_invalid/);assert.deepEqual(f.calls,[]);
  }
});
test('signed URL must carry exactly one token and no image transformation or alternate response parameters',async()=>{
  for(const query of ['', '?token=', '?token=one&token=two', '?token=synthetic&width=1', '?token=synthetic&download=1']) {
    const f=fixture({url:`https://project.supabase.test/storage/v1/object/sign/${binding.bucket}/${binding.objectKey}${query}`});
    await assert.rejects(f.verify(binding),/brand_origin_signed_url_invalid/);assert.equal(f.calls.includes('GET'),false);
  }
});
test('stale before or after readback cannot mint successful proof',async()=>{
  for(const denyCheck of [1,2]) {const f=fixture({denyCheck});await assert.rejects(f.verify(binding),/brand_origin_binding_stale/);assert.equal(f.calls.includes('GET'),denyCheck===2);}
});
test('partial, encoded, missing or unbounded length and failed responses are not complete-object proof',async()=>{
  for(const options of [{status:206},{status:404},{headers:{'content-range':'bytes 0-5/6'}},
    {headers:{'content-encoding':'gzip'}},{headers:{'content-length':'0'}},{headers:{'content-length':'no'}},
    {headers:{'content-length':String(512*1024*1024+1)}}]) {
    const f=fixture(options);await assert.rejects(f.verify(binding),/brand_origin_full_read_required/);
    assert.equal(f.calls.filter(x=>x==='binding').length,1);
  }
});
test('short or oversized streams fail instead of accepting declared metadata',async()=>{
  for(const body of ['abc','abcdefghi']) {const f=fixture({body});await assert.rejects(f.verify(binding),/brand_origin_(length_mismatch|read_failed)/);assert.equal(f.calls.filter(x=>x==='binding').length,1);}
});
test('provider errors never disclose transport credentials',async()=>{
  const f=fixture({error:true});await assert.rejects(f.verify(binding),error=>error.message==='brand_origin_read_failed');
  for(const [options,message] of [[{bindingError:true},'brand_origin_binding_stale'],[{signError:true},'brand_origin_signing_failed']]) {
    const other=fixture(options);await assert.rejects(other.verify(binding),error=>error.message===message);
    assert.equal(other.calls.includes('GET'),false);
  }
});
test('actual service orchestration obtains exact binding, rechecks both sides, and never records scan/admission',async()=>{
  const calls=[];
  const result=await exports.verifyPlatformBrandRetentionOrigin(binding.assetId,{projectUrl:'https://project.supabase.test',
    adminClient:{rpc:async(name,args)=>{calls.push(name);assert.equal(name,'read_platform_brand_retention_binding');assert.deepEqual(args,{p_asset_id:binding.assetId});return {data:{...binding}};},
      storage:{from:bucket=>{assert.equal(bucket,binding.bucket);return {createSignedUrl:async(key,seconds)=>{calls.push('sign');assert.equal(key,binding.objectKey);assert.equal(seconds,120);return {data:{signedUrl:`https://project.supabase.test/storage/v1/object/sign/${bucket}/${key}?token=synthetic`}};}};}}},
    fetcher:async()=>{calls.push('GET');return new Response('abc',{headers:{'content-length':'3'}});}});
  assert.deepEqual(calls,['read_platform_brand_retention_binding','read_platform_brand_retention_binding','sign','GET','read_platform_brand_retention_binding']);
  assert.equal(result.recorded,false);assert.equal(result.enrollmentAllowed,false);assert.deepEqual(result.binding,binding);
});
test('service orchestration rejects changed incarnation after read without recording a receipt',async()=>{
  for(const field of ['ownerId','sourceCreatedAt','storageObjectId','storageVersion','objectKey']) {
    let reads=0;let signs=0;let gets=0;
    const replacements={ownerId:'other',sourceCreatedAt:'2026-10-02T00:00:00Z',storageObjectId:'00000000-0000-4000-8000-000000000003',storageVersion:'new-version',objectKey:'platform_rachi_official/logo/replaced.png'};
    await assert.rejects(exports.verifyPlatformBrandRetentionOrigin(binding.assetId,{projectUrl:'https://project.supabase.test',adminClient:{
      rpc:async()=>({data:++reads===3?{...binding,[field]:replacements[field]}:{...binding}}),
      storage:{from:()=>({createSignedUrl:async()=>{signs++;return {data:{signedUrl:`https://project.supabase.test/storage/v1/object/sign/${binding.bucket}/${binding.objectKey}?token=synthetic`}};}})}},
      fetcher:async()=>{gets++;return new Response('abc',{headers:{'content-length':'3'}});}}),/brand_origin_binding_stale/);
    assert.equal(signs,1);assert.equal(gets,1);assert.equal(reads,3);
  }
});
const endpoint=ts.transpileModule(readFileSync(new URL('../supabase/functions/media-object-storage-migration/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function handlerFixture(options={}) {
  const calls=[];const token='synthetic-test-operator-token-for-disposable-tests';
  const env={MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN_SHA256:createHash('sha256').update(token).digest('hex'),SUPABASE_URL:'https://project.supabase.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-not-a-key'};
  const admin={from:()=>{throw Error('must not inspect unrelated inventory');},rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='read_platform_brand_retention_binding')return {data:{...binding}};
    assert.equal(name,'record_platform_brand_retention_proof');
    assert.equal(args.p_proof.originSha256,createHash('sha256').update('abc').digest('hex'));
    assert.equal(args.p_proof.originSizeBytes,3);
    assert.deepEqual(Object.keys(args.p_proof).sort(),['originSha256','originSizeBytes','scanReceiptId']);
    return options.receipt??{data:{recorded:true,assetId:binding.assetId}};
  },storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:`https://project.supabase.test/storage/v1/object/sign/${binding.bucket}/${binding.objectKey}?token=synthetic`}})})}};
  const handler=new Function('Deno','createClient','crypto','checkDeletedMediaRetirement','verifyPlatformBrandRetentionOrigin',endpoint+';return handler;')(
    {env:{get:k=>env[k]},serve:()=>{}},()=>admin,globalThis.crypto,()=>{throw Error('unrelated operation');},
    (id,deps)=>exports.verifyPlatformBrandRetentionOrigin(id,{...deps,fetcher:async()=>{calls.push({name:'GET'});return new Response('abc',{headers:{'content-length':'3'}});}}));
  return {calls,request:async(payload,authorized=true)=>handler(new Request('https://edge.test',{method:'POST',headers:{'x-media-object-migration-token':authorized?token:'wrong'},body:JSON.stringify(payload)}))};
}
test('actual handler and verifier preserve operator gate and selected-object scope',async()=>{
  const f=handlerFixture();const payload={action:'verify_brand_retention_origin',assetId:binding.assetId};
  assert.equal((await f.request(payload,false)).status,401);assert.deepEqual(f.calls,[]);
  const response=await f.request(payload);assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.recorded,false);assert.equal(result.expiryActivated,false);
  assert.equal(f.calls.some(call=>call.name==='record_platform_brand_retention_proof'),false);
  for(const privateValue of [binding.ownerId,binding.objectKey,'token='])assert.equal(JSON.stringify(result).includes(privateValue),false);
});
test('actual handler records only actual full readback plus selected scan receipt, not caller claims',async()=>{
  const f=handlerFixture();const response=await f.request({action:'record_brand_retention_proof',assetId:binding.assetId,
    scanReceiptId:'00000000-0000-4000-8000-000000000005',originSha256:'fabricated',scanResult:'clean'});
  assert.equal(response.status,200);assert.equal((await response.json()).recorded,true);
  assert.equal(f.calls.filter(call=>call.name==='record_platform_brand_retention_proof').length,1);
});
test('actual handler rejects missing receipt before reads and uncertain or mismatching receipt acknowledgements without retry',async()=>{
  const payload={action:'record_brand_retention_proof',assetId:binding.assetId};const missing=handlerFixture();
  assert.equal((await missing.request(payload)).status,400);assert.deepEqual(missing.calls,[]);
  for(const receipt of [{error:{message:'private failure'}},{data:null},{data:[{recorded:true,assetId:binding.assetId}]},{data:{recorded:'true',assetId:binding.assetId}},{data:{recorded:true,assetId:'wrong'}}]) {
    const f=handlerFixture({receipt});const response=await f.request({...payload,scanReceiptId:'00000000-0000-4000-8000-000000000005'});
    assert.equal(response.status,409);assert.equal(f.calls.filter(call=>call.name==='record_platform_brand_retention_proof').length,1);
    assert.equal(JSON.stringify(await response.json()).includes('private failure'),false);
  }
});
