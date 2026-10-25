import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {loadStudioFunctions} from './helpers/studio-source-harness.mjs';

// Execute the production consumer with an already-valid-evidence RPC double.
// Actual capture-off intent -> genuine Owner receipt -> disposition bootstrap is
// separately executed by brand-empty-test-disposition.test.mjs. This consumer
// double is not migration, concurrency, provider or installed-UI qualification.
test('activation consumes authoritative ready/blockers, not missing positive-byte proof',async()=>{
 const source=readFileSync('supabase/migrations/20261020201322_deleted_content_activation_readiness.sql','utf8');
 const start=source.indexOf('create function private.guard_deleted_content_activation()');
 assert.ok(start>=0);
 const guard=source.slice(start,source.indexOf('end $$;',start)+'end $$;'.length);
 const db=new PGlite();
 const flags=['activation_ready','capture_enabled','media_staging_enabled','text_expiry_enabled','media_expiry_enabled'];
 const report={ready:true,blockers:[],platformBrandMissingCurrentScanProofCount:1,
  platformBrandMissingRetentionEvidenceCount:0,platformBrandSupportedEmptyTestCount:1};
 try{
  await db.exec(`create schema private;
   create table private.deleted_media_reference_fence(singleton boolean primary key);
   insert into private.deleted_media_reference_fence values(true);
   create table private.consumer_readiness_fixture(report jsonb);
   insert into private.consumer_readiness_fixture values('{}');
   create function public.deleted_content_expiry_readiness() returns jsonb language sql as
    'select report from private.consumer_readiness_fixture';
   create table private.deleted_content_retention_settings(${flags.map(flag=>`${flag} boolean not null default false`).join(',')});
   insert into private.deleted_content_retention_settings default values;`);
  await db.exec(guard);
  await db.exec(`create trigger readiness before update on private.deleted_content_retention_settings
   for each row execute function private.guard_deleted_content_activation();`);
  const reset=()=>db.exec(`update private.deleted_content_retention_settings set ${flags.map(flag=>`${flag}=false`).join(',')}`);
  const setReport=value=>db.query('update private.consumer_readiness_fixture set report=$1',[value]);
  for(const flag of flags){
   await reset();await setReport(report);
   await db.exec(`update private.deleted_content_retention_settings set ${flag}=true`);
   assert.equal((await db.query(`select ${flag} allowed from private.deleted_content_retention_settings`)).rows[0].allowed,true);
   for(const blocker of ['platform_brand_transport_not_qualified','platform_brand_batch_not_enabled',
    'platform_brand_worker_completion_missing_or_stale','legacy_object_delete_gate_open','consumer_rollout_not_qualified']){
    await reset();
    await setReport({...report,ready:false,blockers:[blocker]});
    await assert.rejects(db.exec(`update private.deleted_content_retention_settings set ${flag}=true`),
     error=>error.code==='55000'&&error.message.includes(blocker));
    assert.equal((await db.query(`select ${flag} allowed from private.deleted_content_retention_settings`)).rows[0].allowed,false,
     'supported empty evidence never clears independent global/provider/worker blockers');
   }
  }
  await setReport({...report,ready:undefined});
  await assert.rejects(db.exec('update private.deleted_content_retention_settings set capture_enabled=true'),/retention_activation_blocked/);
 }finally{await db.close();}
});

const text=value=>String(value??'').trim();
const archivedAsset={id:'empty-retained',ownerUserId:'owner',assetType:'logo',assetState:'archived',
 moderationStatus:'clean',scanStatus:'clean',deletedAt:'2026-10-25T00:00:00Z'};

test('Brand read consumers exclude archived historical-clean assets before signing or display',async()=>{
 const profile={heroImageAssetId:'empty-retained',heroVideoAssetId:'empty-claimed',logoAssetId:'live'};
 const rows=[
  {id:'empty-retained',owner_user_id:'owner',asset_state:'archived',moderation_status:'clean',scan_status:'clean',deleted_at:archivedAsset.deletedAt},
  {id:'empty-claimed',owner_user_id:'owner',asset_state:'archived',moderation_status:'pending_review',scan_status:'clean',deleted_at:archivedAsset.deletedAt},
  {id:'live',owner_user_id:'owner',asset_state:'published',moderation_status:'clean',scan_status:'clean',deleted_at:null},
  {id:'review',owner_user_id:'owner',asset_state:'draft',moderation_status:'pending_review',scan_status:'pending_scan',deleted_at:null},
 ];
 const queries=[],parsed=[];
 const query=table=>{
  const calls=[],builder={};
  for(const method of ['select','eq','in','is','order','limit'])builder[method]=(...args)=>{calls.push([method,...args]);return builder;};
  builder.maybeSingle=()=>table==='public_profile'?Promise.resolve({data:profile,error:null}):builder;
  builder.returns=async()=>{
   if(table==='platform_brand_profiles')return {data:profile,error:null};
   assert.equal(table,'platform_brand_assets');queries.push(calls);
   assert.ok(calls.some(([method,column,value])=>method==='is'&&column==='deleted_at'&&value===null),
    'each recent, selected, review and public lookup must exclude tombstones');
   const data=rows.filter(row=>calls.every(([method,column,value])=>
    method==='eq'||method==='is'?row[column]===value:method==='in'?value.includes(row[column]):true));
   return {data,error:null};
  };
  return builder;
 };
 const api=loadStudioFunctions('_lib/platformBranding.ts',[
  'readPlatformBrandStudio','readPlatformBrandReviewQueue','readPublicPlatformBranding','getProfileSelectedAssetIds','createBundle',
 ],{
  toText:text,PLATFORM_BRAND_PROFILE_SELECT:'*',PLATFORM_BRAND_ASSET_SELECT:'*',PLATFORM_BRAND_PUBLIC_SCAN_STATUSES:['clean'],
  createDefaultPlatformBrandProfile:()=>({}),parseProfile:row=>row,
  parseAsset:async row=>{assert.equal(row.deleted_at,null,'archived rows never reach signing/parsing');parsed.push(row.id);return {...row,signedUrl:'synthetic'};},
  supabase:{from:query,rpc:name=>{assert.equal(name,'read_public_platform_brand_profile');return query('public_profile');}},
 });
 const studio=await api.readPlatformBrandStudio('owner',{throwOnUnavailable:true});
 assert.deepEqual(Array.from(studio.assets,asset=>asset.id),['live','review']);
 assert.equal(studio.heroImage,null);assert.equal(studio.heroVideo,null);
 assert.deepEqual(Array.from(await api.readPlatformBrandReviewQueue(),asset=>asset.id),['review']);
 const published=await api.readPublicPlatformBranding('owner',{throwOnUnavailable:true});
 assert.deepEqual(Array.from(published.assets,asset=>asset.id),['live']);
 assert.equal(published.heroImage,null);assert.equal(published.heroVideo,null);
 assert.equal(queries.length,4,'recent, missing-selected, reviewer and public readers exercised');
 assert.ok(parsed.length>0,'active media remains a positive witness');
});

test('stale archived media cannot become publish-ready or counted as a clean Studio asset',async()=>{
 const profile={logoAssetId:archivedAsset.id};
 const api=loadStudioFunctions('_lib/platformBranding.ts',[
  'formatPlatformBrandAssetStatus','resolveBrandPublishReadbackStatus','getProfileSelectedAssetIds',
 ],{
  toText:text,PLATFORM_BRAND_PUBLIC_SCAN_STATUSES:['clean'],
  readPlatformBrandStudio:async()=>({profile,assets:[archivedAsset]}),
  readPublicPlatformBranding:async()=>null,
 });
 assert.equal(api.formatPlatformBrandAssetStatus(archivedAsset),'Removed');
 const readback=await api.resolveBrandPublishReadbackStatus('owner',[archivedAsset.id]);
 assert.equal(readback.blockedCount,1);assert.equal(readback.publicReadyCount,0);assert.equal(readback.publicReturnedCount,0);
 const ui=loadStudioFunctions('app/channel-settings.tsx',[
  'brandStudioAssets','brandUploadedAssets','brandCheckingCount','brandBlockedCount','brandReadyToPublishCount',
 ],{
  platformBranding:{assets:[archivedAsset],logo:archivedAsset},brandClearedDesignAssets:[archivedAsset],
  user:{id:'owner'},confirmedBrandRemovalIds:null,
 });
 assert.equal(ui.brandStudioAssets.length,0);assert.equal(ui.brandUploadedAssets.length,0);
 assert.equal(ui.brandCheckingCount,0);assert.equal(ui.brandBlockedCount,0);assert.equal(ui.brandReadyToPublishCount,0);
});
