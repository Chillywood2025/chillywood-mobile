import test from 'node:test';
import assert from 'node:assert/strict';
import {loadStubbed} from './customer-experience-adversarial-helpers.mjs';

function fixture(options={}) {
 let current=true, uploads=0, cleanups=0; const calls=[];
 const subject={accessToken:'frozen-token'};
 const api=loadStubbed('_lib/merchProductPhotos.ts',{
  './accountBoundSupabaseMutation':{
   captureAccountBoundSupabaseMutationSubject:async()=>subject,
   assertAccountBoundSupabaseMutationSubjectCurrent:()=>{if(!current)throw Error('account_changed');},
   invokeAccountBoundSupabaseMutationRpc:async(_subject,name,args)=>{calls.push({name,args});return {data:options.targetMissing?false:name==='check_creator_merch_photo_target'?true:{id:'product',updatedAt:'new'},error:null};},
  },
  './socialAttachmentPicker':{pickSocialAttachmentFile:async()=>null},
  './supabase':{SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture-anon'},
  './imageUploadNormalization':{normalizeImageUploadFile:async file=>({file,cleanup:async()=>{cleanups++;}})},
  './platformBranding':{uploadPlatformBrandAsset:async input=>{
   uploads++;assert.equal(input.assetType,'merch_product_image');assert.equal(input.accessToken,'frozen-token');
   input.attempt.payload={id:'asset'};input.attempt.fileUri=input.file.uri;
   if(options.switchAccount)current=false;
   if(options.fail)throw Error('unconfirmed');
   return {id:'asset',scanStatus:options.scan??'pending_scan',moderationStatus:options.moderation??'pending_review'};
  }},
 });
 return {api,calls,replaceAccount(){current=false;},get uploads(){return uploads;},get cleanups(){return cleanups;}};
}
const input={ownerUserId:'owner',productId:'product',file:{uri:'file:///photo.png',mimeType:'image/png',size:79}};
test('photo picker cancellation is not an upload; staging is not product binding',async()=>{
 const f=fixture();assert.equal(await f.api.pickMerchProductPhoto(),null);
 const attempt={};const staged=await f.api.uploadMerchProductPhoto({...input,attempt});
 assert.deepEqual(staged,{assetId:'asset',previewUrl:input.file.uri,status:'pending_review'});
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'check_creator_merch_photo_target');
 assert.equal(attempt.upload.payload.id,'asset');assert.equal(f.cleanups,1);
});
test('unconfirmed attempt retains identity, refuses replacement, and cleans temporary bytes',async()=>{
 const f=fixture({fail:true}),attempt={};
 await assert.rejects(f.api.uploadMerchProductPhoto({...input,attempt}),/unconfirmed/);
 assert.equal(attempt.upload.payload.id,'asset');assert.equal(f.cleanups,1);
 await assert.rejects(f.api.uploadMerchProductPhoto({...input,file:{uri:'file:///replacement.png'},attempt}),/same photo/);
 assert.equal(f.uploads,1);
});
test('missing product or account switch cannot yield a usable staged result',async()=>{
 const missing=fixture({targetMissing:true});await assert.rejects(missing.api.uploadMerchProductPhoto(input),/unavailable/);assert.equal(missing.uploads,0);
 const switched=fixture({switchAccount:true});await assert.rejects(switched.api.uploadMerchProductPhoto(input),/account_changed/);assert.equal(switched.cleanups,1);
});
test('photo readiness requires both clean scan and review; remove binds null with revision',async()=>{
 for(const [scan,moderation,expected] of [['clean','clean','ready'],['clean','pending_review','pending_review'],['malware_detected','clean','blocked']]){
  const f=fixture({scan,moderation});assert.equal((await f.api.uploadMerchProductPhoto(input)).status,expected);
 }
 const f=fixture();await f.api.assignMerchProductPhoto({ownerUserId:'owner',productId:'product',assetId:null,expectedUpdatedAt:'revision'});
 assert.deepEqual(f.calls[0],{name:'assign_merch_product_photo',args:{p_product_id:'product',p_asset_id:null,p_expected_updated_at:'revision'}});
});
test('photo signing failure never hides catalog; switched-account results are still rejected',async()=>{
 const original=globalThis.fetch;
 const products=[{id:'p',photoStoragePath:'owner/merch_product_image/photo.png',imageUrl:'https://legacy.invalid/image.png'}];
 try {
  const f=fixture();globalThis.fetch=async()=>{throw Error('offline');};
  const rows=await f.api.resolveMerchProductPhotos(products);
  assert.equal(rows[0].id,'p');assert.equal(rows[0].photoUrl,null);assert.equal(rows[0].imageUrl,products[0].imageUrl);
  globalThis.fetch=async(_url,options)=>{assert.equal(options.headers.Authorization,'Bearer frozen-token');assert.equal(JSON.parse(options.body).expiresIn,300);return {ok:true,json:async()=>({signedURL:'/object/sign/platform-brand-assets/owner/merch_product_image/photo.png?token=fixture'})};};
  assert.match((await f.api.resolveMerchProductPhotos(products))[0].photoUrl,/^https:\/\/fixture.invalid\/storage\/v1\/object\/sign\//);
  globalThis.fetch=async()=>({ok:true,json:async()=>({signedURL:'https://wrong.invalid/photo'})});
  assert.equal((await f.api.resolveMerchProductPhotos(products))[0].photoUrl,null);
  globalThis.fetch=async()=>{f.replaceAccount();throw Error('offline');};
  await assert.rejects(f.api.resolveMerchProductPhotos(products),/account_changed/);
 }finally{globalThis.fetch=original;}
});
