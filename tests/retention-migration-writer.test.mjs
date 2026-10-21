import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
const retirementSource=readFileSync(new URL('../supabase/functions/_shared/deleted-media-retirement.ts',import.meta.url),'utf8');
const retirementJs=ts.transpileModule(retirementSource.replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const checkDeletedMediaRetirement=new Function(retirementJs+';return checkDeletedMediaRetirement;')();
const source=readFileSync(new URL('../supabase/functions/media-object-storage-migration/index.ts',import.meta.url),'utf8');
function load(fetcher=()=>{throw Error('unexpected network');}) {
 const body=ts.transpileModule(source.replace(/^import .*;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function('Deno','fetch','crypto','checkDeletedMediaRetirement',body+'\nreturn {createPresignedS3Url,copyObject};')(
  {env:{get:()=>''},serve:()=>{}},fetcher,webcrypto,checkDeletedMediaRetirement);
}
const config={endpoint:'https://storage.example.test',region:'auto',bucket:'chillywood-media-origin',accessKeyId:'synthetic-id',secretAccessKey:'synthetic-not-a-credential'};
const entry={tableName:'videos',rowId:'fixture',targetBucket:config.bucket,targetObjectKey:'originals/fixture.mp4',sourceBucket:'legacy-source'};
const reconciliation={status:'exists_exact',sourceHead:{sizeBytes:3,etag:'synthetic',contentType:'video/mp4',forcePathStyle:false},resolvedObjectKey:'old/fixture.mp4'};
test('migration PUT signs the create-only condition; GET does not gain write conditions',async()=>{
 const {createPresignedS3Url}=load();
 for(const method of ['PUT','GET','HEAD']) {
  const url=new URL(await createPresignedS3Url({...config,method,objectKey:'originals/fixture.mp4',expiresSeconds:120}));
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'),method==='PUT'?'host;if-none-match':'host');
 }
});
test('migration copy fails closed before reading or writing provider when fence is unavailable or denied',async()=>{
 let requests=0;const {copyObject}=load(()=>{requests++;throw Error('network must not run');});
 for(const data of [null,{}, {allowed:false},{allowed:'true'}]) {
  await assert.rejects(copyObject({rpc:async()=>({data,error:null})},entry,{...config,bucket:'legacy-source'},config,reconciliation),/migration_target_retired_or_unavailable/);
 }
 assert.equal(requests,0);
});
test('migration copy sends signed create-only PUT and never retries conflict as overwrite',async()=>{
 const requests=[];
 const {copyObject}=load(async(url,options={})=>{
  requests.push({url,options});
  if(options.method==='PUT') return new Response(null,{status:412});
  return new Response('abc',{status:200,headers:{'content-type':'video/mp4'}});
 });
 await assert.rejects(copyObject({rpc:async()=>({data:{allowed:true},error:null})},entry,{...config,bucket:'legacy-source'},config,reconciliation),/r2_origin_upload_failed_412/);
 assert.equal(requests.length,2);
 assert.equal(requests[1].options.headers['If-None-Match'],'*');
 assert.equal(new URL(requests[1].url).searchParams.get('X-Amz-SignedHeaders'),'host;if-none-match');
});
