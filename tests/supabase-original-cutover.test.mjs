import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const source=readFileSync(new URL('../supabase/functions/_shared/supabase-original-cutover.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source.replace(/^import .*;\n/gm,'').replace('export async function','async function'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const cutoverSupabaseOriginal=new Function('createHash',js+';return cutoverSupabaseOriginal;')(createHash);
const receipt='10000000-0000-4000-8000-000000000001',row='20000000-0000-4000-8000-000000000001',job='30000000-0000-4000-8000-000000000001';
const bytes=Buffer.from('harmless synthetic fixture');
const binding={state:'readback_required',receiptId:receipt,tableName:'videos',rowId:row,sourceBucket:'creator-videos',sourceKey:'old.mp4',sourceStorageId:row,sourceStorageVersion:'generation-one',targetKey:`originals/supabase-migration/${receipt}/videos/${row}`,sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length};
function fixture(options={}){
 const calls=[];
 const deps={supabaseUrl:'https://project.example',targetAllowed:async()=>options.allowed!==false,
  targetUrl:async(method,key)=>{calls.push(['sign-target',method,key]);return 'https://private.example/object'},
  adminClient:{storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:options.sourceUrl??'https://project.example/storage/v1/object/sign/creator-videos/old.mp4?token=synthetic'}})})},
   rpc:async(name,args)=>{calls.push([name,args]);return name==='read_supabase_original_copy_cutover'?{data:{...binding,...options.binding}}:{data:options.commitBad?{}:{state:'committed',receiptId:receipt,scanJobId:job,alreadyCommitted:false}}}},
  fetcher:async(url,config)=>{calls.push(['fetch',url.origin,config]);const target=url.origin==='https://private.example';return new Response(target&&options.changed?Buffer.alloc(bytes.length):bytes,{status:options.status??200,headers:{'content-length':String(options.length??bytes.length),...(options.headers??{})}})}
 };
 return {calls,deps};
}
test('full source and new target GETs precede atomic commit; no PUT or DELETE',async()=>{
 const f=fixture();const result=await cutoverSupabaseOriginal(receipt,f.deps);
 assert.equal(result.scanJobId,job);assert.equal(result.oldObjectDeletionAllowed,false);
 assert.deepEqual(f.calls.map(c=>c[0]),['read_supabase_original_copy_cutover','fetch','sign-target','fetch','commit_supabase_original_copy_cutover']);
 assert.equal(f.calls[2][1],'GET');
 assert.ok(f.calls.filter(c=>c[0]==='fetch').every(c=>c[2].redirect==='error'&&!c[2].method));
 const args=f.calls.at(-1)[1];assert.equal(args.p_source_storage_version,'generation-one');
 assert.equal(args.p_readback_assertions.sourceSha256,binding.sha256);
 assert.equal(args.p_readback_assertions.targetSha256,binding.sha256);
});
for(const options of [{changed:true},{status:206},{length:1},{headers:{'content-range':'bytes 0-2/3'}},{headers:{'content-encoding':'gzip'}},{sourceUrl:'https://other.example/storage/v1/object/sign/creator-videos/old.mp4'},{binding:{targetKey:'existing'}},{binding:{sourceStorageVersion:null}},{allowed:false}]) {
 test('fail closed before commit '+JSON.stringify(options),async()=>{
  const f=fixture(options);await assert.rejects(()=>cutoverSupabaseOriginal(receipt,f.deps));
  assert.ok(!f.calls.some(c=>c[0]==='commit_supabase_original_copy_cutover'));
 });
}
test('uncertain commit never reported completed or retried internally',async()=>{
 const f=fixture({commitBad:true});await assert.rejects(()=>cutoverSupabaseOriginal(receipt,f.deps),/commit_unconfirmed/);
 assert.equal(f.calls.filter(c=>c[0]==='commit_supabase_original_copy_cutover').length,1);
});
test('exact completed retry returns existing pending scan without downloads',async()=>{
 const f=fixture({binding:{state:'committed',sourceMatches:true,scanJobId:job}});
 assert.equal((await cutoverSupabaseOriginal(receipt,f.deps)).alreadyCommitted,true);
 assert.equal(f.calls.length,1);
});
