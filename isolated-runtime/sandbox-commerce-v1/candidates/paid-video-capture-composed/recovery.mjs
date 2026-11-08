// One bounded operator RPC per invocation. No provider API or purchase retry.
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const row=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,wanted)=>row(v)&&Object.keys(v).length===wanted.length&&wanted.every(k=>Object.hasOwn(v,k));
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const targetFields=['protocol','installationId','sourceSha256','consumerBinding','projectId','connectionId','connectionRevision','providerConfigurationDigest'];
const targetValid=v=>keys(v,targetFields)&&v.protocol==='scv3-capture-recovery-target-v1'&&uuid(v.installationId)&&uuid(v.connectionId)
 &&/^[a-f0-9]{64}$/u.test(v.sourceSha256)&&/^[a-f0-9]{64}$/u.test(v.providerConfigurationDigest)
 &&v.consumerBinding==='sandbox-commerce-v1:protocol-3:capture-composed-v1'&&typeof v.projectId==='string'&&/^[A-Za-z0-9_-]{1,128}$/u.test(v.projectId)
 &&Number.isSafeInteger(v.connectionRevision)&&v.connectionRevision>0;
export function createCaptureRecovery({projectRef,serviceRoleKey,expectedTarget,installationMode,request=globalThis.fetch}) {
 if(!['bootstrap','retained'].includes(installationMode))throw Error('capture_recovery_configuration_invalid');
 const reviewedSource=JSON.parse(fs.readFileSync(new URL(installationMode==='bootstrap'?'./source-manifest.json':'./retained-source-manifest.json',import.meta.url),'utf8')).installationSourceSha256;
 if(typeof projectRef!=='string'||!/^[a-z0-9]{20}$/u.test(projectRef)
  ||typeof serviceRoleKey!=='string'||serviceRoleKey.length<32||serviceRoleKey.length>8192||/[\r\n]/u.test(serviceRoleKey)
  ||!targetValid(expectedTarget)||expectedTarget.sourceSha256!==reviewedSource||typeof request!=='function')throw Error('capture_recovery_configuration_invalid');
 const target=Object.freeze({...expectedTarget});
 const exactTarget=value=>targetValid(value)&&targetFields.every(k=>value[k]===target[k]);
 const endpoint='https://'+projectRef+'.supabase.co/rest/v1/rpc/';
 async function call(name,body,validate){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);let reader;
  try{
   const response=await request(endpoint+name,{method:'POST',redirect:'error',signal:controller.signal,
    headers:{apikey:serviceRoleKey,authorization:'Bearer '+serviceRoleKey,'content-type':'application/json'},body:JSON.stringify(body)});
   if(response.status!==200||!response.body)throw Error('capture_recovery_outcome_unknown');
   reader=response.body.getReader();const chunks=[];let size=0;
   for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536)throw Error('capture_recovery_result_invalid');chunks.push(part.value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(controller.signal.aborted||!validate(value))throw Error('capture_recovery_result_invalid');return value;
  }catch{throw Error('capture_recovery_outcome_unknown');}
  finally{clearTimeout(timer);controller.abort();if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}}
 }
 return Object.freeze({
  pending:({after=null,limit=16}={})=>{
   if((after!==null&&!uuid(after))||!Number.isInteger(limit)||limit<1||limit>32)throw Error('capture_recovery_selector_invalid');
   return call('isolated_test_store_capture_pending_v3',{p_expected_target:target,p_after:after,p_limit:limit},v=>
    keys(v,['protocol','target','rows','authorityGranted','nextCursor'])&&v.protocol==='scv3-capture-pending-v1'&&v.authorityGranted===false&&exactTarget(v.target)
    &&Array.isArray(v.rows)&&v.rows.length<=limit&&v.rows.every(r=>keys(r,['ingressId','firstDeferredAt','reason'])&&uuid(r.ingressId)
     &&date(r.firstDeferredAt)&&r.reason==='capture_admission_unavailable')
    &&new Set(v.rows.map(r=>r.ingressId)).size===v.rows.length
    &&v.rows.every((r,index)=>index===0?r.ingressId>(after??''):r.ingressId>v.rows[index-1].ingressId)
    &&v.nextCursor===(v.rows.length===limit?v.rows.at(-1).ingressId:null));
  },
  reconcile:ingressId=>{
   if(!uuid(ingressId))throw Error('capture_recovery_selector_invalid');
   return call('isolated_test_store_capture_reconcile_v3',{p_expected_target:target,p_ingress_id:ingressId},v=>
    keys(v,['protocol','target','ingressId','result','authorityGranted'])&&v.protocol==='scv3-capture-reconciliation-v1'
    &&v.ingressId===ingressId&&v.authorityGranted===false&&exactTarget(v.target)
    &&keys(v.result,['protocol','receiptId','status','durable','acknowledgementAllowed','authorityGranted','financialAuthority'])
    &&v.result.protocol==='scv3-test-store-ingress-result-v1'&&v.result.receiptId===ingressId&&['recorded','duplicate','conflict'].includes(v.result.status)
    &&v.result.durable===true&&v.result.acknowledgementAllowed===true&&v.result.authorityGranted===false&&v.result.financialAuthority===false);
  },
 });
}

// Exactly one bounded page, with durable progress before each local projection.
// Unavailable entries are revisited only on a later sweep, never in a hot loop.
export async function runCaptureRecoveryPass({api,state,save,now=Date.now,maxItems=8,maxDurationMs=30000}){
 if(!row(state)||(state.cursor!==null&&!uuid(state.cursor))||(state.inFlight!==null&&!uuid(state.inFlight))
  ||typeof save!=='function'||!Number.isInteger(maxItems)||maxItems<1||maxItems>16
  ||!Number.isInteger(maxDurationMs)||maxDurationMs<5000||maxDurationMs>30000)throw Error('capture_recovery_pass_invalid');
 const deadline=now()+maxDurationMs,progress={...state},attempts=[];
 const persist=async patch=>{Object.assign(progress,patch);await save(structuredClone(progress));};
 if(progress.inFlight!==null){
  // A previous process stopped after journaling dispatch. Retain uncertainty
  // and move the sweep cursor forward; SQL will recheck the exact immutable ID
  // on a later sweep, never mint a replacement purchase or receipt identity.
  await persist({cursor:progress.inFlight,lastUnknown:progress.inFlight,inFlight:null});
 }
 let page;
 try{page=await api.pending({after:progress.cursor,limit:maxItems});}
 catch{return {protocol:'scv3-capture-recovery-pass-v1',status:'read_unknown',attempts,nextCursor:progress.cursor,authorityGranted:false};}
 for(const entry of page.rows){
  if(now()+5000>deadline)return {protocol:'scv3-capture-recovery-pass-v1',status:'budget',attempts,nextCursor:progress.cursor,authorityGranted:false};
  await persist({inFlight:entry.ingressId});
  try{
   const result=await api.reconcile(entry.ingressId);
   attempts.push({ingressId:entry.ingressId,status:result.result.status});
   await persist({cursor:entry.ingressId,inFlight:null});
  }catch{
   await persist({cursor:entry.ingressId,inFlight:null,lastUnknown:entry.ingressId});
   attempts.push({ingressId:entry.ingressId,status:'outcome_unknown'});
   return {protocol:'scv3-capture-recovery-pass-v1',status:'outcome_unknown',attempts,nextCursor:progress.cursor,authorityGranted:false};
  }
 }
 if(page.nextCursor===null)await persist({cursor:null});
 return {protocol:'scv3-capture-recovery-pass-v1',status:'complete',attempts,nextCursor:progress.cursor,authorityGranted:false};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const args=process.argv.slice(2),operation=args.shift(),id=operation==='reconcile'?args.shift():null;
 if(!['pending','reconcile','once'].includes(operation)||(operation==='reconcile'&&!uuid(id))
  ||args.length!==(operation==='once'?4:2)||args[0]!=='--target'||!path.isAbsolute(args[1])
  ||(operation==='once'&&(args[2]!=='--state'||!path.isAbsolute(args[3]))))throw Error('Use pending|once|reconcile <retained-ingress-uuid> --target <absolute-witness-file>; once also requires --state <absolute-private-state-file>');
 let lockPath,lockNonce;
 try{
  if(fs.realpathSync(args[1])!==args[1])throw Error('capture_recovery_witness_invalid');
  const raw=fs.readFileSync(args[1]);if(raw.length>4096)throw Error('capture_recovery_witness_invalid');
  const witness=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(!keys(witness,['supabaseProjectRef','installationMode','expectedTarget']))throw Error('capture_recovery_witness_invalid');
  const api=createCaptureRecovery({projectRef:witness.supabaseProjectRef,installationMode:witness.installationMode,expectedTarget:witness.expectedTarget,serviceRoleKey:process.env.SCPV_CAPTURE_RECOVERY_SERVICE_ROLE_KEY});
  let result;
  if(operation==='once'){
   const statePath=args[3],directory=path.dirname(statePath);
   if(fs.realpathSync(directory)!==directory||!fs.statSync(directory).isDirectory()||(fs.statSync(directory).mode&0o077)!==0)throw Error('capture_recovery_state_invalid');
   lockPath=statePath+'.lock';lockNonce=randomUUID();
   const lock=fs.openSync(lockPath,'wx',0o600);fs.writeFileSync(lock,lockNonce);fs.fsyncSync(lock);fs.closeSync(lock);
   let state={protocol:'scv3-capture-recovery-state-v1',target:witness,cursor:null,inFlight:null,lastUnknown:null};
   if(fs.existsSync(statePath)){
    if(fs.realpathSync(statePath)!==statePath||(fs.statSync(statePath).mode&0o077)!==0||fs.statSync(statePath).size>8192)throw Error('capture_recovery_state_invalid');
    state=JSON.parse(fs.readFileSync(statePath,'utf8'));
    if(!keys(state,['protocol','target','cursor','inFlight','lastUnknown'])||state.protocol!=='scv3-capture-recovery-state-v1'
     ||!keys(state.target,['supabaseProjectRef','installationMode','expectedTarget'])||state.target.supabaseProjectRef!==witness.supabaseProjectRef||state.target.installationMode!==witness.installationMode
     ||!targetValid(state.target.expectedTarget)||!targetFields.every(k=>state.target.expectedTarget[k]===witness.expectedTarget[k])
     ||(state.lastUnknown!==null&&!uuid(state.lastUnknown)))throw Error('capture_recovery_state_invalid');
   }
   const save=next=>{
    const temporary=statePath+'.'+lockNonce+'.tmp',fd=fs.openSync(temporary,'wx',0o600);
    fs.writeFileSync(fd,JSON.stringify(next)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fs.renameSync(temporary,statePath);
    const parent=fs.openSync(directory,'r');fs.fsyncSync(parent);fs.closeSync(parent);
   };
   result=await runCaptureRecoveryPass({api,state,save});
  }else result=operation==='pending'?await api.pending():await api.reconcile(id);
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch{process.stderr.write('Capture recovery outcome unknown; retain the same ingress identity and state. No provider work was requested.\n');process.exitCode=1;}
 finally{if(lockPath&&lockNonce&&fs.existsSync(lockPath)&&fs.readFileSync(lockPath,'utf8')===lockNonce)fs.unlinkSync(lockPath);}
}
