#!/usr/bin/env node
import { createClipOriginSigner } from './lib/clip-export-transport.mjs';
import { runClipExportOnce } from './lib/clip-export-worker.mjs';

// Deliberately one job per invocation. A qualified operator installs scheduling;
// this command neither enables the DB gate nor changes existing scanner config.
const env=name=>{const value=process.env[name]?.trim();if(!value)throw new Error('worker_configuration_missing');return value;};
async function main(){
 if(process.argv.slice(2).join(' ')!=='--once')throw new Error('use_once');
 const supabaseUrl=env('SUPABASE_URL').replace(/\/$/,''),serviceKey=env('SUPABASE_SERVICE_ROLE_KEY');
 if(supabaseUrl!=='https://bmkkhihfbmsnnmcqkoly.supabase.co')throw new Error('worker_project_mismatch');
 if(env('MEDIA_ORIGIN_PRIVATE_ONLY')!=='true'||env('MEDIA_ORIGIN_PUBLIC_PLAYBACK_DISABLED')!=='true')throw new Error('private_origin_required');
 const outputBucket=env('MEDIA_ORIGIN_BUCKET');
 if(outputBucket!=='chillywood-media-origin')throw new Error('worker_output_bucket_mismatch');
 const origin=createClipOriginSigner({provider:'cloudflare_r2',bucket:outputBucket,endpoint:env('MEDIA_ORIGIN_R2_ENDPOINT'),
  region:process.env.MEDIA_ORIGIN_R2_REGION||'auto',accessKeyId:env('MEDIA_ORIGIN_R2_ACCESS_KEY_ID'),secretAccessKey:env('MEDIA_ORIGIN_R2_SECRET_ACCESS_KEY')});
 const signer=async(method,identity,options)=>{
  if(identity.provider==='cloudflare_r2')return origin(method,identity,options);
  if(identity.provider!=='s3'||method!=='GET')throw new Error('unsupported_source_provider');
  return createClipOriginSigner({provider:'s3',bucket:env('S3_BUCKET'),endpoint:env('S3_ENDPOINT'),region:env('S3_REGION'),
   accessKeyId:env('S3_ACCESS_KEY_ID'),secretAccessKey:env('S3_SECRET_ACCESS_KEY')})(method,identity,options);
 };
 const rpc=async(name,args)=>{
  if(!/^[a-z_]+$/.test(name))throw new Error('invalid_rpc');
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
   headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw new Error('worker_rpc_unavailable');}
  return response.json();
 };
 const stop=new AbortController();process.once('SIGTERM',()=>stop.abort());process.once('SIGINT',()=>stop.abort());
 const result=await runClipExportOnce({rpc,signer,outputBucket,supabaseUrl,serviceKey,signal:stop.signal});
 console.log(JSON.stringify(result));if(result.claimed&&!result.completed)process.exitCode=1;
}
main().catch(()=>{console.error(JSON.stringify({ok:false,errorCode:'clip_worker_failed',secretsPrinted:false}));process.exitCode=1;});
