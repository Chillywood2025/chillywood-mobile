import assert from 'node:assert/strict';
import test from 'node:test';
import { loadStudioFunctions } from './helpers/studio-source-harness.mjs';
const asset={id:'asset-one',ownerUserId:'creator-one'};
const harness=response=>{
 const calls=[];
 const api=loadStudioFunctions('_lib/platformBranding.ts',['removePlatformBrandAsset'],{
  toText:value=>String(value??'').trim(),
  runCurrentAccountBoundSupabaseMutationRpc:async(...args)=>{calls.push(args);return typeof response==='function'?response():response;},
  supabase:{from(){throw Error('unsafe direct-write fallback');},storage:{from(){throw Error('unsafe provider-delete fallback');}}},
 });
 return {...api,calls};
};
test('brand removal uses initiating owner account-bound RPC and exact server tombstone acknowledgement',async()=>{
 const h=harness({data:{assetId:asset.id,deletedAt:'2026-10-21T00:00:00Z'},error:null});
 await h.removePlatformBrandAsset(asset);
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[['remove_platform_brand_asset',{p_asset_id:asset.id},asset.ownerUserId]]);
});
test('brand removal failures never report success or fall back to direct storage deletion',async()=>{
 for(const response of [
  {data:null,error:new Error('RPC unavailable')},
  {data:null,error:new Error('account changed')},
  {data:null,error:new Error('retention rollback')},
  {data:{assetId:'wrong',deletedAt:'2026-10-21'},error:null},
  {data:{assetId:asset.id},error:null},
 ]){const h=harness(response);await assert.rejects(h.removePlatformBrandAsset(asset));assert.equal(h.calls.length,1);}
});
test('brand removal supports retry acknowledgement without sending a fresh client timestamp',async()=>{
 const h=harness({data:{assetId:asset.id,deletedAt:'2026-10-21T00:00:00Z'},error:null});
 await h.removePlatformBrandAsset(asset);await h.removePlatformBrandAsset(asset);
 assert.deepEqual(h.calls[0],h.calls[1]);
});
