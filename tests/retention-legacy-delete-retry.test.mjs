import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../supabase/functions/media-storage/index.ts',import.meta.url),'utf8');
const body=ts.transpileModule(source.slice(source.lastIndexOf('Deno.serve(')),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({reply={data:{status:'already_deleted',retentionHandled:true}},allowed=false,restricted=false}={}) {
 let handler;const calls=[];
 const actor={rpc:async(name,args)=>{calls.push({name,args,actor:true});return reply;}};
 const names=['Deno','readRequiredEnv','readMediaOriginStorageConfig','authenticateRequest','normalizeAction','normalizeSurfaceType','toText','isSafeObjectKey','createClient','captureSecurityRequestContext','isAccountAccessRestricted','safeWriteMediaSecurityEvent','canDeleteCreatorVideo','canDeleteSocialAttachment','json'];
 const values=[{serve:fn=>handler=fn},()=> 'synthetic',()=>({provider:'cloudflare_r2',bucket:'chillywood-media-origin'}),async()=>({actorClient:actor,user:{id:'owner'}}),x=>x,x=>x,x=>x??'',()=>true,()=>({rpc:()=>{throw Error('service role cannot delete content');}}),async()=>({}),async()=>restricted,async()=>{},async()=>{calls.push({objectAuthorization:true});return allowed;},async()=>allowed,(status,value)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})];
 new Function(...names,body)(...values);
 const invoke=(extra={})=>handler(new Request('https://edge.test',{method:'POST',body:JSON.stringify({action:'delete_content',surfaceType:'creator_video',recordId:'source',objectKey:'originals/retired.mp4',sourceCreatedAt:'2026-01-01T00:00:00Z',...extra})}));
 return {calls,invoke};
}
test('actual handler reaches actor-bound already_deleted retry without live-row/reservation authorization',async()=>{
 const f=fixture();const response=await f.invoke();assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,retentionHandled:true});
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'delete_retained_content');assert.equal(f.calls[0].args.p_source_created_at,'2026-01-01T00:00:00Z');
});
test('cross-owner or missing-retirement RPC rejection is never acknowledged or routed to physical deletion',async()=>{
 for(const message of ['cross_owner','missing_retirement']){const f=fixture({reply:{error:{message}}});assert.equal((await f.invoke()).status,409);assert.equal(f.calls.length,1);}
});
test('disabled retention retains old exact-object authorization',async()=>{
 for(const allowed of [true,false]) {const f=fixture({allowed,reply:{data:{status:'disabled',retentionHandled:false}}});const r=await f.invoke();assert.equal(r.status,allowed?200:403);assert.equal(f.calls[1].objectAuthorization,true);}
});
test('restricted account and missing incarnation never reach deletion RPC',async()=>{
 const f=fixture({restricted:true});assert.equal((await f.invoke()).status,403);assert.equal(f.calls.length,0);
 const g=fixture();assert.equal((await g.invoke({sourceCreatedAt:''})).status,400);assert.equal(g.calls.length,0);
});
