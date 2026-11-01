import {readFileSync} from 'node:fs';
import path from 'node:path';
import {persistSecondaryMediaInventory} from './secondary-media-producer.mjs';
import {createSecondaryMediaS3Signer,secondaryMediaOutputConfig} from './secondary-media-s3-signer.mjs';
const lit=v=>`'${String(v).replaceAll("'","''")}'`;
const signatures={
 begin_secondary_media_producer:['p_source_type','p_source_id','p_producer_id','p_expected_source_binding','p_provider','p_bucket','p_output_prefix'],
 reserve_secondary_media_objects:['p_producer_id','p_claim_token','p_inventory'],
 begin_secondary_media_object_write:['p_producer_id','p_claim_token','p_object_key'],
 read_secondary_media_object_write:['p_producer_id','p_claim_token','p_object_key'],
 record_secondary_media_object_receipt:['p_producer_id','p_claim_token','p_object_key','p_write_token','p_receipt'],
 seal_secondary_media_producer:['p_producer_id','p_claim_token'],
};
export function createLinkedSecondaryMediaProducer({query,bucket,env=process.env,fetcher=fetch}){
 const targetURL=createSecondaryMediaS3Signer(secondaryMediaOutputConfig(env,bucket));
 const rpc=async(name,args)=>{
  const parameters=signatures[name];if(!parameters)throw Error('secondary_media_rpc_unsupported');
  const sql=parameters.map(key=>{
   const value=args[key];if(value===undefined||value===null)throw Error('secondary_media_rpc_parameter_missing');
   return `${key} => ${typeof value==='object'?lit(JSON.stringify(value))+'::jsonb':lit(value)}`;
  }).join(',');
  const rows=query(`with worker_context as materialized (select set_config('request.jwt.claim.role','service_role',true))
   select public.${name}(${sql}) as result from worker_context`);
  if(!Array.isArray(rows)||rows.length!==1||!rows[0].result)throw Error('secondary_media_rpc_response_invalid');
  return rows[0].result;
 };
 return {
  async begin({sourceId,producerId,outputPrefix}){
   const rows=query(`select private.secondary_media_read_source('creator_video',${lit(sourceId)}::uuid) as binding`);
   if(!rows?.[0]?.binding)throw Error('secondary_media_source_binding_unavailable');
   return rpc('begin_secondary_media_producer',{p_source_type:'creator_video',p_source_id:sourceId,p_producer_id:producerId,
    p_expected_source_binding:rows[0].binding,p_provider:'cloudflare_r2',p_bucket:bucket,p_output_prefix:outputPrefix});
  },
  async persist({producer,inventory,outputRoot,contentType,cacheControl}){
   return persistSecondaryMediaInventory({producerId:producer.producerId,claimToken:producer.claimToken,inventory},
    {rpc,targetURL,fetcher,contentType,cacheControl,readLocalBytes:async object=>{
     if(!object.relativePath||object.relativePath.startsWith('/')||object.relativePath.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('secondary_media_local_path_invalid');
     return readFileSync(path.join(outputRoot,object.relativePath));
    }});
  },
 };
}
