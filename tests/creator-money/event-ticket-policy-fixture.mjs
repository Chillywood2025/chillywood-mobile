import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
export const ids={event:'11111111-1111-4111-8111-111111111111',purchase:'22222222-2222-4222-8222-222222222222',
  buyer:'33333333-3333-4333-8333-333333333333',revision:'44444444-4444-4444-8444-444444444444',other:'55555555-5555-4555-8555-555555555555'};
export const policy=(extra={})=>({eventId:ids.event,purchaseId:ids.purchase,purchaseIntentId:ids.purchase,buyerId:ids.buyer,
  originalSchedule:{startsAt:'2026-11-01T05:00:00Z',endsAt:'2026-11-01T06:00:00Z',timeZone:'America/New_York'},
  currentRevision:{id:ids.revision,startsAt:'2026-11-01T06:00:00Z',endsAt:'2026-11-01T07:00:00Z',timeZone:'America/New_York'},
  acceptedRevisionId:null,choiceRequired:true,refundEligibility:{eligibility:'eligible',status:'provider_review_required',reasons:['material_schedule_change'],createdAt:'2026-10-27T10:00:00Z'},
  history:[],notice:{id:ids.other,createdAt:'2026-10-27T10:00:00Z'},...extra});
export const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
export const load=(file,imports,source=fs.readFileSync(file,'utf8'))=>{
  const context={exports:{},Date,Intl,Promise,require:name=>{assert.ok(name in imports,name);return imports[name];}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);
  return context.exports;
};
export function client(options={}){
  let authority={userId:ids.buyer,sessionGeneration:'one',restoreOnly:false};const calls=[];
  const session={getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration};
  const api=load('_lib/creatorEventTicketPolicy.ts',{
    './accountSessionAuthority':session,
    './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>({authority:options.captured??authority}),
      invokeAccountBoundSupabaseMutationRpc:async(subject,name,args)=>{calls.push({subject,name,args});return options.rpc?options.rpc(name,args):{data:policy(),error:null};}},
  });
  return{api,calls,session,setAuthority:value=>{authority=value;}};
}
