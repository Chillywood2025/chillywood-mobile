import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const source=readFileSync(new URL('../supabase/functions/_shared/supabase-original-copy.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source.replace(/^import .*;\n/gm,'').replace('export async function','async function'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const copy=new Function('createHash',js+';return copySupabaseOriginal;')(createHash);
const input={tableName:'videos',rowId:'00000000-0000-4000-8000-000000000001',receiptId:'00000000-0000-4000-8000-000000000002'};
function fixture(options={}) {
 const calls=[]; let uploaded; let receipt; let fences=0;
 const snapshot={id:input.rowId,storage_provider:'supabase',storage_bucket:'creator-videos',storage_path:'old/source.mp4',owner_id:'00000000-0000-4000-8000-000000000003',created_at:'fixture',...options.snapshot};
 const deps={supabaseUrl:'https://project.supabase.test',
  adminClient:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:snapshot})})})}),
   storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:options.signedUrl??'https://project.supabase.test/storage/v1/object/sign/creator-videos/old/source.mp4?token=synthetic'}})})},
   rpc:async(name,args)=>{calls.push('receipt');receipt={name,args};return options.receiptFailure?{error:{message:'fixture'}}:{data:options.receiptData??{recorded:true,receiptId:input.receiptId,cutoverAllowed:false}};}},
  targetAllowed:async()=>{fences++;return options.fenceAt!==fences;},
  targetUrl:async(method,key)=>`https://r2.test/${key}?method=${method}`,
  fetcher:async(url,init={})=>{
   assert.equal(init.redirect,'error');calls.push(init.method??'GET');
   if(init.method==='PUT') {
    assert.equal(init.headers['If-None-Match'],'*');
    if(options.conflict)return new Response(null,{status:412});
    uploaded=new Uint8Array(await new Response(init.body).arrayBuffer());return new Response(null,{status:200});
   }
   if(String(url).startsWith('https://r2.test'))return new Response(options.mismatch?'bad':uploaded,{headers:options.targetHeaders});
   return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('abc'));c.enqueue(new TextEncoder().encode('def'));c.close();}}),{status:options.sourceStatus??200,headers:{'content-length':'6',...options.sourceHeaders}});
  }};
 return {deps,calls,get receipt(){return receipt;},snapshot};
}
test('streams exact original, create-only copies and independently hashes full readback before receipt; never cuts over',async()=>{
 const f=fixture();const result=await copy(input,f.deps);
 assert.deepEqual(f.calls,['GET','PUT','GET','receipt']);
 assert.equal(f.receipt.name,'record_supabase_original_copy_receipt');
 assert.deepEqual(f.receipt.args.p_source_snapshot,f.snapshot);
 assert.equal(f.receipt.args.p_sha256,createHash('sha256').update('abcdef').digest('hex'));
 assert.equal(f.receipt.args.p_size_bytes,6);
 assert.equal(f.receipt.args.p_proof_assertions.independentReadback,true);
 assert.equal(result.metadataChanged,false);assert.equal(result.retentionEnrolled,false);
});
test('mismatching target bytes never yield receipt or metadata update',async()=>{
 const f=fixture({mismatch:true});await assert.rejects(copy(input,f.deps),/readback_mismatch/);assert.equal(f.receipt,undefined);
});
test('existing target conflict is not adopted or overwritten',async()=>{
 const f=fixture({conflict:true});await assert.rejects(copy(input,f.deps),/target_conflict/);assert.deepEqual(f.calls,['GET','PUT']);
});
test('provider locator ambiguity and malformed identities fail before transport',async()=>{
 for(const snapshot of [{storage_path:'../bad'},{storage_path:'backups/file'},{storage_bucket:'wrong-bucket'},{owner_id:'not-uuid'},{storage_object_key:'different'},{storage_provider:'s3'},{deleted_at:'deleted'}]) {
  const f=fixture({snapshot});await assert.rejects(copy(input,f.deps));assert.deepEqual(f.calls,[]);
 }
 const f=fixture();await assert.rejects(copy({...input,tableName:'platform_brand_assets'},f.deps));assert.deepEqual(f.calls,[]);
});
test('signed source URL cannot redirect credentials to another origin',async()=>{
 const f=fixture({signedUrl:'https://evil.test/storage/v1/object/sign/file'});await assert.rejects(copy(input,f.deps),/source_url_invalid/);assert.deepEqual(f.calls,[]);
});
test('signed URL for a different same-project object is not accepted as source proof',async()=>{
 const f=fixture({signedUrl:'https://project.supabase.test/storage/v1/object/sign/creator-videos/other.mp4?token=synthetic'});
 await assert.rejects(copy(input,f.deps),/source_url_invalid/);assert.deepEqual(f.calls,[]);
});
test('retirement fence denies before transport or before receipt',async()=>{
 for(const fenceAt of [1,2]) {const f=fixture({fenceAt});await assert.rejects(copy(input,f.deps),/target_(became_)?unavailable/);assert.equal(f.receipt,undefined);}
});
test('uncertain or failed receipt is not retried and success not claimed',async()=>{
 const f=fixture({receiptFailure:true});await assert.rejects(copy(input,f.deps),/receipt_not_recorded/);assert.equal(f.calls.filter(x=>x==='receipt').length,1);
});

test('partial or encoded source responses cannot become full-object copy evidence',async()=>{
 for(const options of [{sourceStatus:206},{sourceHeaders:{'content-encoding':'gzip'}}]) {
  const f=fixture(options);await assert.rejects(copy(input,f.deps));assert.equal(f.receipt,undefined);assert.deepEqual(f.calls,['GET']);
 }
});

test('actual migration handler keeps operator authentication and dispatches only one explicit copy',async()=>{
 const endpointSource=readFileSync(new URL('../supabase/functions/media-object-storage-migration/index.ts',import.meta.url),'utf8');
 const body=ts.transpileModule(endpointSource.replace(/^import .*;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const token='synthetic-operator-token-for-disposable-test-only';
 const env={MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN_SHA256:createHash('sha256').update(token).digest('hex'),
  SUPABASE_URL:'https://project.supabase.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic',
  MEDIA_ORIGIN_PRIVATE_ONLY:'true',MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED:'true',R2_ORIGIN_BUCKET:'chillywood-media-origin',
  R2_ORIGIN_ENDPOINT:'https://r2.test',R2_ORIGIN_ACCESS_KEY_ID:'synthetic',R2_ORIGIN_SECRET_ACCESS_KEY:'synthetic'};
 let copied=0;const admin={};
 const handler=new Function('Deno','createClient','crypto','checkDeletedMediaRetirement','copySupabaseOriginal',body+';return handler;')(
  {env:{get:k=>env[k]},serve:()=>{}},()=>admin,globalThis.crypto,
  async()=>({allowed:true}),async(args,deps)=>{copied++;assert.deepEqual(args,input);assert.equal(deps.adminClient,admin);return {copied:true,metadataChanged:false};});
 const payload={action:'copy_supabase_original',table_name:input.tableName,row_id:input.rowId,receipt_id:input.receiptId};
 const request=authorized=>new Request('https://edge.test',{method:'POST',headers:authorized?{'x-media-object-migration-token':token}:{},body:JSON.stringify(payload)});
 assert.equal((await handler(request(false))).status,401);assert.equal(copied,0);
 const result=await handler(request(true));assert.equal(result.status,200);assert.equal(copied,1);
 assert.equal((await result.json()).metadataChanged,false);
 delete env.MEDIA_ORIGIN_PRIVATE_ONLY;
 assert.equal((await handler(request(true))).status,409);assert.equal(copied,1);
});

test('bounded explicit Content-Length is required and actual stream must match it',async()=>{
 for(const length of ['', '0', '999999999999', '7', '5']) {
  const f=fixture({sourceHeaders:{'content-length':length}});await assert.rejects(copy(input,f.deps));assert.equal(f.receipt,undefined);
 }
});

test('receipt confirmation must match this exact operation and deny cutover',async()=>{
 for(const receiptData of [{recorded:true},{recorded:true,receiptId:'different',cutoverAllowed:false},
  {recorded:true,receiptId:input.receiptId},{recorded:true,receiptId:input.receiptId,cutoverAllowed:true},[]]) {
  const f=fixture({receiptData});await assert.rejects(copy(input,f.deps),/receipt_not_recorded/);
 }
});

test('HTTP200 with Content-Range is partial evidence on source or readback',async()=>{
 for(const options of [{sourceHeaders:{'content-range':'bytes 0-5/100'}},{targetHeaders:{'content-range':'bytes 0-5/100'}}]) {
  const f=fixture(options);await assert.rejects(copy(input,f.deps));assert.equal(f.receipt,undefined);
 }
});


test('actual handler and actual copy helper reject unsafe endpoint before any source operation',async()=>{
 const endpointSource=readFileSync(new URL('../supabase/functions/media-object-storage-migration/index.ts',import.meta.url),'utf8');
 const body=ts.transpileModule(endpointSource.replace(/^import .*;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const token='synthetic-operator-token-for-disposable-test-only';
 for(const endpoint of ['http://r2.test','https://user:pass@r2.test','https://r2.test?x=1','https://r2.test#fragment','https://r2.test/non-root','not-a-url']) {
  const env={MEDIA_OBJECT_MIGRATION_OPERATOR_TOKEN_SHA256:createHash('sha256').update(token).digest('hex'),
   SUPABASE_URL:'https://project.supabase.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic',MEDIA_ORIGIN_PRIVATE_ONLY:'true',
   MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED:'true',R2_ORIGIN_BUCKET:'chillywood-media-origin',R2_ORIGIN_ENDPOINT:endpoint,
   R2_ORIGIN_ACCESS_KEY_ID:'synthetic',R2_ORIGIN_SECRET_ACCESS_KEY:'synthetic'};
  let sourceReads=0;
  const admin={from:()=>{sourceReads++;throw Error('source must not be read');},storage:{from:()=>{throw Error('source must not be signed');}}};
  const handler=new Function('Deno','createClient','crypto','checkDeletedMediaRetirement','copySupabaseOriginal',body+';return handler;')(
   {env:{get:k=>env[k]},serve:()=>{}},()=>admin,globalThis.crypto,async()=>({allowed:true}),copy);
  const response=await handler(new Request('https://edge.test',{method:'POST',headers:{'x-media-object-migration-token':token},
   body:JSON.stringify({action:'copy_supabase_original',table_name:input.tableName,row_id:input.rowId,receipt_id:input.receiptId})}));
  assert.equal(response.status,409,endpoint);assert.equal(sourceReads,0,endpoint);
 }
});
