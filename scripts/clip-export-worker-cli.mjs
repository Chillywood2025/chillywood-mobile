#!/usr/bin/env node
// OFF and --help must not import runtime adapters, load credentials or connect.
const required=value=>{const text=value?.trim();if(!text)throw new Error('worker_configuration_missing');return text;};
async function main(){
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--help'){
  console.log('Usage: node scripts/clip-export-worker-cli.mjs --once|--pool\nDefault OFF. Requires an explicitly enabled, registered and qualified worker identity.');return;
 }
 if(process.env.CLIP_EXPORT_WORKER_ENABLED!=='true'){
  console.log(JSON.stringify({enabled:false,claimed:0,completed:0,failed:0}));return;
 }
 if(args.length!==1||!['--once','--pool'].includes(args[0]))throw new Error('worker_mode_required');
 const workerId=required(process.env.CLIP_EXPORT_WORKER_ID);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(workerId))throw new Error('worker_identity_required');
 const supabaseUrl=required(process.env.SUPABASE_URL).replace(/\/$/,''),serviceKey=required(process.env.SUPABASE_SERVICE_ROLE_KEY);
 if(supabaseUrl!=='https://bmkkhihfbmsnnmcqkoly.supabase.co')throw new Error('worker_project_mismatch');
 if(required(process.env.MEDIA_ORIGIN_PRIVATE_ONLY)!=='true'||required(process.env.MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED)!=='true')throw new Error('private_origin_required');
 const outputBucket=required(process.env.MEDIA_ORIGIN_BUCKET);
 if(outputBucket!=='chillywood-media-origin')throw new Error('worker_output_bucket_mismatch');
 const {createClipOriginSigner}=await import('./lib/clip-export-transport.mjs');
 const {runClipExportPool}=await import('./lib/clip-export-pool.mjs');
 const origin=createClipOriginSigner({provider:'cloudflare_r2',bucket:outputBucket,endpoint:required(process.env.MEDIA_ORIGIN_R2_ENDPOINT),
  region:process.env.MEDIA_ORIGIN_R2_REGION||'auto',accessKeyId:required(process.env.MEDIA_ORIGIN_R2_ACCESS_KEY_ID),secretAccessKey:required(process.env.MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY)});
 const signer=async(method,identity,options)=>{
  if(identity.provider==='cloudflare_r2')return origin(method,identity,options);
  if(identity.provider!=='s3'||method!=='GET')throw new Error('unsupported_source_provider');
  return createClipOriginSigner({provider:'s3',bucket:required(process.env.S3_BUCKET),endpoint:required(process.env.S3_ENDPOINT),region:required(process.env.S3_REGION),
   accessKeyId:required(process.env.S3_ACCESS_KEY_ID),secretAccessKey:required(process.env.S3_SECRET_ACCESS_KEY)})(method,identity,options);
 };
 const rpc=async(name,args)=>{
  if(!/^[a-z_]+$/u.test(name))throw new Error('worker_rpc_unavailable');
  let response;
  try{response=await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
   headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify(args)});}
  catch{throw new Error('worker_rpc_unavailable');}
  if(!response.ok){
   await response.body?.cancel().catch(()=>{});
   throw new Error(response.status===401||response.status===403?'worker_rpc_auth_failed':'worker_rpc_unavailable');
  }
  try{return await response.json();}catch{throw new Error('worker_rpc_unavailable');}
 };
 const stop=new AbortController(),drain=new AbortController();
 const terminate=()=>drain.abort(),interrupt=()=>stop.abort();
 process.once('SIGTERM',terminate);process.once('SIGINT',interrupt);
 try{
  const result=await runClipExportPool({enabled:true,workerId,once:args[0]==='--once',rpc,signer,outputBucket,supabaseUrl,serviceKey,
   signal:stop.signal,drainSignal:drain.signal,onMetric:value=>console.log(JSON.stringify(value))});
  console.log(JSON.stringify(result));
  if(result.failed>0||result.sessionLost||result.sessionClosed!==true)process.exitCode=1;
 }finally{process.removeListener('SIGTERM',terminate);process.removeListener('SIGINT',interrupt);}
}
main().catch(()=>{console.error(JSON.stringify({ok:false,errorCode:'clip_worker_failed',secretsPrinted:false}));process.exitCode=1;});
