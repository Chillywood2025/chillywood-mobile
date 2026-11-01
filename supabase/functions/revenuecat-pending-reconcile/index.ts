import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createAdminClient,jsonResponse,readOptionalEnv,hashText} from '../_shared/provider-readiness.ts';
import {canonicalSnapshot,readPendingRevenueCatSnapshot,type PendingSnapshotJob} from '../_shared/revenuecat-pending-snapshot.ts';

export async function handler(req:Request){
 if(req.method!=='POST')return jsonResponse(405,{error:'method_not_allowed'});
 const service=readOptionalEnv('SUPABASE_SERVICE_ROLE_KEY');
 if(!service||req.headers.get('authorization')!==`Bearer ${service}`)return jsonResponse(403,{error:'service_authority_required'});
 const project=readOptionalEnv('REVENUECAT_PROJECT_ID'),key=readOptionalEnv('REVENUECAT_SECRET_API_KEY');
 const environment=readOptionalEnv('REVENUECAT_RECONCILIATION_ENVIRONMENT');
 if(!project||!key||!['sandbox','production'].includes(environment??''))return jsonResponse(503,{error:'snapshot_worker_not_configured'});
 const admin=createAdminClient();if(!admin.configured)return jsonResponse(503,{error:'server_not_configured'});
 let job:PendingSnapshotJob|null=null;
 const rpc=async(name:string,args:Record<string,unknown>)=>{
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{const result=await Promise.race([admin.client.rpc(name,args),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('database_deadline')),5000);})]);
   if(result.error)throw Error('snapshot_database_rejected');return result.data;
  }finally{if(timeout)clearTimeout(timeout);}
 };
 try{
  // Request body is deliberately not an authority/input surface.
  job=await rpc('claim_revenuecat_nonpurchase_snapshot',{p_environment:environment,p_project_id:project}) as PendingSnapshotJob|null;
  if(!job)return jsonResponse(200,{claimed:false,financialAuthority:false});
  if(job.environment!==environment||job.project_id!==project)throw Error('snapshot_ineligible');
  const snapshot=await readPendingRevenueCatSnapshot(job,key);
  const result=await rpc('complete_revenuecat_nonpurchase_snapshot',{p_event_id:job.event_id,p_lease:job.lease,
   p_snapshot:snapshot,p_snapshot_hash:await hashText(canonicalSnapshot(snapshot))});
  return jsonResponse(200,{...result as Record<string,unknown>,financialAuthority:false});
 }catch(error){
  if(job)await rpc('defer_revenuecat_nonpurchase_snapshot',{p_event_id:job.event_id,p_lease:job.lease,
   p_reason:error instanceof Error?error.message:'provider_unavailable'}).catch(()=>{});
  return jsonResponse(503,{error:'snapshot_reconciliation_incomplete',retryable:true,financialAuthority:false});
 }
}
if(import.meta.main)Deno.serve(handler);
