import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, deferred } from './platform-studio-mounted-harness.mjs';

async function open(h){
 await h.press(h.button('Open actions for Title A'));await h.press(h.button('Edit details'));
 const format=h.button('Format. Choose frame shape and preview fit.');
 if(!format.props.accessibilityState.expanded)await h.press(format);
}

test('background and resume cannot freshen an old in-flight status response',async t=>{
 const held=deferred();let reads=0;
 const h=await mount(t,{overrides:{invokeAccountBoundSupabaseMutationRpc:async()=>++reads===2?held.promise:{data:null,error:null}}});
 await open(h);await h.timers();await h.appState('background');await h.appState('active');
 await h.resolve(held,{data:{id:'old',status:'ready',outputVideoId:'old-draft'},error:null});
 assert.equal(h.button('Review Exported Draft'),undefined);
});

for(const [code,copy] of [['clip_export_capacity_exhausted',/The export queue is full/],['clip_export_admission_paused',/New exports are temporarily paused/]])
 test(`admission rejection ${code} does not enqueue or auto-retry`,async t=>{
  const requests=[];
  const h=await mount(t,{overrides:{invokeAccountBoundSupabaseMutationRpc:async(_subject,name,args)=>{
   if(name==='read_creator_clip_export')return {data:null,error:null};
   requests.push(args);return {data:null,error:{message:code}};
  }}});
  await open(h);await h.press(h.button('Export Video'));assert.match(h.text(),copy);assert.match(h.text(),/This request was not added/);
  await h.timers();assert.equal(requests.length,1);assert.equal(h.button('Cancel Export'),undefined);
  await h.press(h.button('Export Video'));assert.equal(requests[0].p_request_id,requests[1].p_request_id);
 });

test('technical delay is distinct from demand and terminal output wins over health',async t=>{
 let job={id:'job',status:'queued',displayState:'technical_delay',outputVideoId:null};let mutations=0;
 const h=await mount(t,{overrides:{invokeAccountBoundSupabaseMutationRpc:async(_subject,name)=>{
  if(name!=='read_creator_clip_export')mutations++;return {data:job,error:null};
 }}});
 await open(h);assert.match(h.text(),/delayed by a processing issue/);assert.ok(h.button('Cancel Export'));
 job={...job,status:'ready',outputVideoId:'draft'};await h.timers();
 assert.match(h.text(),/Latest export ready/);assert.doesNotMatch(h.text(),/delayed by a processing issue/);
 assert.ok(h.button('Review Exported Draft'));assert.equal(mutations,0);
});

for(const code of ['hdr_dolby_vision_unqualified','hdr_color_metadata_unqualified','hdr_conversion_unavailable'])
 test(`safe HDR failure ${code} preserves the original and does not automatically retry`,async t=>{
  let mutations=0;
  const h=await mount(t,{overrides:{invokeAccountBoundSupabaseMutationRpc:async(_subject,name)=>{
   if(name!=='read_creator_clip_export')mutations++;
   return {data:{id:'hdr',status:'failed',errorCode:code,outputVideoId:null},error:null};
  }}});
  await open(h);assert.match(h.text(),/Your original HDR video is unchanged/);
  assert.match(h.text(),code==='hdr_conversion_unavailable'?/renderer needs attention/:/not yet qualified for export/);
  assert.equal(h.button('Review Exported Draft'),undefined);await h.timers();assert.equal(mutations,0);
 });

test('a deleted exported draft offers a new export rather than a broken review action',async t=>{
 const requests=[];
 const h=await mount(t,{overrides:{invokeAccountBoundSupabaseMutationRpc:async(_subject,name,args)=>{
  if(name==='read_creator_clip_export')return {data:{id:'old',status:'stale',errorCode:'output_unavailable',outputVideoId:null},error:null};
  requests.push(args);return {data:{id:'new',status:'queued',outputVideoId:null},error:null};
 }}});
 await open(h);assert.match(h.text(),/Exported draft is no longer available/);
 assert.equal(h.button('Review Exported Draft'),undefined);assert.equal(requests.length,0);
 await h.press(h.button('Export Video'));assert.equal(requests.length,1);assert.match(h.text(),/Export queued/);
});

test('a delayed empty poll cannot erase a newly accepted export',async t=>{
 const held=deferred();let reads=0;
 const queued={id:'new-job',status:'queued',outputVideoId:null};const requests=[];
 const h=await mount(t,{overrides:{invokeAccountBoundSupabaseMutationRpc:async(_subject,name,args)=>{
  if(name==='read_creator_clip_export')return ++reads===1?{data:null,error:null}:held.promise;
  requests.push(args);return {data:queued,error:null};
 }}});
 await open(h);await h.timers();await h.press(h.button('Export Video'));
 assert.match(h.text(),/Export queued/);
 await h.resolve(held,{data:null,error:null});
 assert.match(h.text(),/Export queued/);assert.ok(h.button('Cancel Export'));
 assert.equal(h.button('Export Video'),undefined);assert.equal(requests.length,1);
});

test('a status read started before cancel cannot overwrite the confirmed cancellation',async t=>{
 const held=deferred();let reads=0;
 const queued={id:'job',status:'queued',outputVideoId:null};
 const h=await mount(t,{overrides:{invokeAccountBoundSupabaseMutationRpc:async(_subject,name)=>{
  if(name==='read_creator_clip_export')return ++reads===1?{data:queued,error:null}:held.promise;
  return {data:{...queued,status:'canceled'},error:null};
 }}});
 await h.press(h.button('Open actions for Title A'));await h.press(h.button('Edit details'));
 const format=h.button('Format. Choose frame shape and preview fit.');
 if(!format.props.accessibilityState.expanded)await h.press(format);
 await h.timers();
 await h.press(h.button('Cancel Export'));
 assert.match(h.text(),/Export canceled/);
 await h.resolve(held,{data:queued,error:null});
 assert.match(h.text(),/Export canceled/);
 assert.equal(h.button('Cancel Export'),undefined);
});

test('a pre-cancel poll cannot replace a subsequent newly accepted job',async t=>{
 const held=deferred();let reads=0;const canceled=[];
 const old={id:'old-job',status:'queued',outputVideoId:null};
 const h=await mount(t,{overrides:{invokeAccountBoundSupabaseMutationRpc:async(_subject,name,args)=>{
  if(name==='read_creator_clip_export')return ++reads===1?{data:old,error:null}:held.promise;
  if(name==='cancel_creator_clip_export'){canceled.push(args.p_job_id);return {data:{...old,status:'canceled'},error:null};}
  return {data:{...old,id:'new-job'},error:null};
 }}});
 await open(h);await h.timers();await h.press(h.button('Cancel Export'));
 await h.press(h.button('Export Video'));await h.resolve(held,{data:old,error:null});
 await h.press(h.button('Cancel Export'));assert.deepEqual(canceled,['old-job','new-job']);
});

test('leaving and reopening the editor rejects the old editor status response',async t=>{
 const held=deferred();let reads=0;
 const h=await mount(t,{overrides:{invokeAccountBoundSupabaseMutationRpc:async()=>{
  reads++;return reads===2?held.promise:{data:null,error:null};
 }}});
 await open(h);await h.timers();await h.press(h.button('Content'));await open(h);
 await h.resolve(held,{data:{id:'old',status:'ready',outputVideoId:'stale-draft'},error:null});
 assert.equal(h.button('Review Exported Draft'),undefined);assert.ok(h.button('Export Video'));
});
