import test from 'node:test';
import assert from 'node:assert/strict';
import { mount, React, deferred, edit, video } from './platform-studio-mounted-harness.mjs';
import { loadStudioFunctions } from './helpers/studio-source-harness.mjs';

async function open(h) {
 await h.press(h.button('Open actions for Title A'));await h.press(h.button('Edit details'));
 const format=h.button('Format. Choose frame shape and preview fit.');
 if(!format.props.accessibilityState.expanded)await h.press(format);
}
const status={id:'job',status:'queued',outputVideoId:null};
test('mounted export uses saved exact edit, coalesces taps, cancels and reviews only a ready output',async t=>{
 const gate=deferred(),requests=[];let job=null;
 const h=await mount(t,{overrides:{invokeAccountBoundSupabaseMutationRpc:async(_subject,name,args)=>{
  if(name==='read_creator_clip_export')return {data:job,error:null};
  requests.push([name,args]);
  if(name==='request_creator_clip_export'){await gate.promise;job=status;return {data:job,error:null};}
  job={...status,status:'canceled'};return {data:job,error:null};
 }}});
 await open(h);const exportButton=h.button('Export Video');assert.ok(exportButton);
 await h.press(exportButton);await React.act(async()=>{void exportButton.props.onPress();});
 assert.equal(requests.length,1);assert.equal(requests[0][1].p_video_id,'A');
 assert.deepEqual(JSON.parse(JSON.stringify(requests[0][1].p_edit)),{clip_format:'vertical_9_16',fit_mode:'fill',trim_start_ms:null,trim_end_ms:null,brand_mark_enabled:false,brand_asset_id:null});
 await h.resolve(gate);assert.match(h.text(),/Export queued/);await h.press(h.button('Cancel Export'));
 assert.equal(requests[1][0],'cancel_creator_clip_export');assert.equal(requests[1][1].p_job_id,'job');
 job={id:'job',status:'ready',outputVideoId:'rendered-video'};await h.timers();
 await h.press(h.button('Review Exported Draft'));
 assert.equal(h.routes.at(-1).params.videoId,'rendered-video');
});
test('mounted lost enqueue response retries same UUID and does not claim success',async t=>{
 const keys=[];let tries=0;
 const h=await mount(t,{overrides:{invokeAccountBoundSupabaseMutationRpc:async(_subject,name,args)=>{
  if(name==='read_creator_clip_export')return {data:null,error:null};
  keys.push(args.p_request_id);return ++tries===1?{data:null,error:{message:'account_bound_rpc_outcome_unknown'}}:{data:status,error:null};
 }}});
 await open(h);await h.press(h.button('Export Video'));assert.match(h.text(),/could not be confirmed/);
 await h.press(h.button('Export Video'));assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.match(h.text(),/Export queued/);
});
test('mounted source edits disable export until saved and owner replacement discards a late export result',async t=>{
 const held=deferred();
 const h=await mount(t,{overrides:{invokeAccountBoundSupabaseMutationRpc:async(_subject,name)=>name==='read_creator_clip_export'?{data:null,error:null}:held.promise}});
 await open(h);
 await h.change(h.find(n=>n.props.accessibilityLabel==='Trim start in seconds'),'1.25');
 assert.equal(h.button('Export Video').props.disabled,true);assert.match(h.text(),/Save Draft before exporting/);
 await h.press(h.button('Content'));await open(h);
 await h.press(h.button('Export Video'));
 await h.account({user:{id:'other',email:'other@example.test'},isSignedIn:true,isLoading:false,
  authority:{userId:'other',accountId:'other',sessionGeneration:'new',state:'ACTIVE',restoreOnly:false},authorityStatus:'active'});
 await h.resolve(held,{data:{...status,status:'ready',outputVideoId:'old-private-draft'},error:null});
 assert.equal(h.button('Review Exported Draft'),undefined);assert.ok(!h.text().includes('Export ready'));
});
test('mounted changed saved edit receives a new operation ID after an unknown enqueue outcome',async t=>{
 let savedEdit=edit('A'),stored=video('A');const requests=[];
 const h=await mount(t,{videos:[stored],overrides:{
  readClipStudioEdit:async()=>savedEdit,
  updateCreatorVideoMetadata:async(_id,patch)=>(stored={...stored,...patch}),
  saveClipStudioEdit:async(_id,patch)=>(savedEdit={...patch,videoId:'A'}),
  readCreatorVideoForOwner:async()=>stored,readCreatorVideos:async()=>[stored],
  invokeAccountBoundSupabaseMutationRpc:async(_subject,name,args)=>{
   if(name==='read_creator_clip_export')return {data:null,error:null};
   requests.push(args);return {data:null,error:{message:'unknown_outcome'}};
  },
 }});
 await open(h);await h.press(h.button('Export Video'));
 await h.change(h.find(n=>n.props.accessibilityLabel==='Trim start in seconds'),'1.25');
 await h.press(h.button('Save Draft'));await h.press(h.button('Export Video'));
 assert.equal(requests.length,2);assert.notEqual(requests[0].p_request_id,requests[1].p_request_id);
 assert.equal(requests[1].p_edit.trim_start_ms,1250);
});
test('production trim validation accepts seconds and rejects invalid or reversed ranges',()=>{
 const {getClipTrimValidationMessage}=loadStudioFunctions('_lib/clipStudio.ts',['getClipTrimValidationMessage'],{});
 assert.equal(getClipTrimValidationMessage('1.250','2.5'),null);assert.equal(getClipTrimValidationMessage('',''),null);
 for(const range of [['-1','2'],['2','1'],['bad','2'],['0','9001'],['9000',''],['1.1234','2']])assert.ok(getClipTrimValidationMessage(...range));
});
