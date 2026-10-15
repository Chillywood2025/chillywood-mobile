import assert from 'node:assert/strict';
import test from 'node:test';
import {mount,productionFunctions} from './platform-studio-mounted-harness.mjs';
for(const malformed of [false,true])test(`mounted Paid save invokes real production helper and rejects malformed RPC=${malformed}`,async t=>{
 let writes=0,saved=false;const service=productionFunctions('_lib/creatorPaidVideos.ts',['toText','savePaidVideoOffer'],{
  runCurrentAccountBoundSupabaseMutationRpc:async(name,payload)=>{
   writes++;assert.equal(name,'set_creator_content_price');assert.equal(payload.p_content_id,'B');assert.equal(payload.p_content_type,'creator_video');assert.equal(payload.p_is_paid,true);assert.equal(payload.p_price_cents,99);assert.equal(payload.p_currency,'usd');
   saved=!malformed;return {data:malformed?{}:{status:'saved',id:'offer-B'},error:null};
  },
 });
 const h=await mount(t,{route:{tab:'monetization',manage:'paid_videos'},overrides:{savePaidVideoOffer:service.savePaidVideoOffer,saveCreatorSandboxMonetizationConfig:async()=>({id:'config'}),listMyPaidVideoOffers:async()=>saved?[{id:'offer-B',videoId:'B',creatorId:'owner',isPaid:true,priceCents:99,currency:'usd',status:'sandbox'}]:[]}});
 await h.press(h.button('Manage paid unlock for Title B'));await h.press(h.button('Paid · $0.99'));await h.press(h.button('Save video access'));assert.equal(writes,1);
 if(malformed){assert.match(h.text(),/could not be confirmed/);assert.doesNotMatch(h.text(),/setup saved at/);}else assert.match(h.text(),/setup saved at \$0.99/);
});
