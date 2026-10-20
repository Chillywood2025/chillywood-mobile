import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {checkDeletedMediaRetirement} from './deleted-media-retirement.ts';
const input={provider:'cloudflare_r2',bucket:'chillywood-media-origin',objectKey:'synthetic/key',purpose:'read'};
test('retirement fence forwards exact immutable tuple and purpose',async()=>{
 let called=false;
 const result=await checkDeletedMediaRetirement({rpc:async(name,args)=>{
 called=true;assert.equal(name,'check_deleted_media_retirement');
 assert.deepEqual(args,{p_provider:input.provider,p_bucket:input.bucket,p_object_key:input.objectKey,p_purpose:input.purpose});
 return {data:{allowed:true},error:null};
 }},input);
 assert.equal(called,true);assert.deepEqual(result,{allowed:true});
});
test('errors malformed replies and expired deadlines deny',async()=>{
 for(const data of [null,[],{},true,{allowed:'true'},{allowed:false},{allowed:true,expiresAt:null},{allowed:true,expiresAt:'bad'},
 {allowed:true,expiresAt:'2000-01-01T00:00:00Z'}])
 assert.deepEqual(await checkDeletedMediaRetirement({rpc:async()=>({data,error:null})},input),{allowed:false});
 assert.deepEqual(await checkDeletedMediaRetirement({rpc:async()=>({data:{allowed:true},error:{code:'failure'}})},input),{allowed:false});
 assert.deepEqual(await checkDeletedMediaRetirement({rpc:async()=>{throw Error('network');}},input),{allowed:false});
});
test('inspection carries finite server deadline for internal signer cap',async()=>{
 const expiresAt=new Date(Date.now()+60000).toISOString();
 assert.deepEqual(await checkDeletedMediaRetirement({rpc:async()=>({data:{allowed:true,expiresAt},error:null})},{...input,purpose:'inspection'}),{allowed:true,expiresAt});
});
test('source contract remains no-copy and no provider capability assumption',()=>{
 const sql=readFileSync(new URL('../../migrations/20261020013500_deleted_media_reference_retirement.sql',import.meta.url),'utf8');
 assert.match(sql,/pg_advisory_xact_lock\(176214,30\)/);
 assert.match(sql,/retirement_tombstone_permanent/);
 assert.match(sql,/n\.nspname='public'/);
 assert.match(sql,/t\.tgenabled in \('O','A'\)/);
 assert.doesNotMatch(sql,/references auth\.users|create extension|http_request|net\.http|cron\.schedule/i);
 assert.match(sql,/provider='cloudflare_r2'/);
 assert.match(sql,/bucket='chillywood-media-origin'/);
});
