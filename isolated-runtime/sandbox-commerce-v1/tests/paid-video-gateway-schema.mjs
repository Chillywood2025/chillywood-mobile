// Deterministic v2 machine contract derived from the immutable v1 authoring
// schema. The v1 file is never rewritten or widened.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const original=new URL('../paid-video-contract-v1.json',import.meta.url), output=new URL('../paid-video-contract-v2.json',import.meta.url);
const schema=JSON.parse(fs.readFileSync(original,'utf8'));
schema.title='Inactive isolated Paid Video v2 authoring and private upload gateway contract';
const digest={type:'string',pattern:'^[a-f0-9]{64}$'}, uuid={type:'string',format:'uuid'}, number={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
for(const variant of schema.oneOf){
 variant.properties.protocol={const:'isolated-paid-video-v2'};
 variant.properties.configurationDigest=digest;variant.properties.capabilityExpiresAtMs=number;
 variant.required.push('configurationDigest','capabilityExpiresAtMs');
 if(variant.properties.command.const==='capability.read')for(const name of ['transferAvailable','checkoutAvailable'])variant.properties.data.properties[name]={type:'boolean'};
 if(variant.properties.command.const==='resource.read')variant.properties.data.properties.offer={$ref:'#/definitions/offer'};
 if(variant.properties.command.const==='upload.read'){
  variant.properties.data.properties.transfer={anyOf:[{type:'null'},object({requestId:uuid,originalSessionId:uuid,configurationDigest:digest})]};
  variant.properties.data.required.push('transfer');
 }
}
schema.definitions.upload.properties.transferAvailable={type:'boolean'};
schema.definitions.offer.properties.checkoutAvailable={type:'boolean'};
schema.definitions.recoveryRecorded.properties.originalConfigurationDigest=digest;
schema.definitions.recoveryRecorded.required.push('originalConfigurationDigest');
for(const variant of schema.definitions.request.oneOf){variant.properties.p_configuration_digest=digest;variant.required.push('p_configuration_digest');}
schema.definitions.gatewayRequest={oneOf:schema.definitions.request.oneOf.map(variant=>{
 const payload=structuredClone(variant.properties.p_payload);delete payload.properties.protocol;delete payload.properties.requestId;payload.required=payload.required.filter(k=>!['protocol','requestId'].includes(k));
 return object({protocol:{const:'isolated-paid-video-v2'},command:variant.properties.p_command,requestId:uuid,expectedSessionId:uuid,configurationDigest:digest,payload});
})};
const uploadId=schema.definitions.upload.properties.id, version={type:'string',pattern:'^(?!null$)[A-Za-z0-9._-]{1,256}$'};
schema.definitions.transferResponse=object({protocol:{const:'scpv-transfer-v2'},state:{enum:['unknown','acknowledged','exists_unverified']},uploadId,requestId:uuid,verificationRequired:{const:true}});
schema.definitions.probeResponse=object({protocol:{const:'scpv-upload-probe-v2'},state:{const:'observed'},observationRaw:{type:'string',maxLength:4096},signature:digest});
schema.definitions.objectReceipt=object({protocol:{const:'scpv-object-receipt-v2'},state:{const:'recorded'},uploadId,userId:uuid,originalSessionId:uuid,originalConfigurationDigest:digest,
 requestId:uuid,transferId:uuid,incarnation:uuid,sha256:digest,byteLength:{type:'integer',minimum:1,maximum:16777216},objectVersion:version});
schema.definitions.reconcileRequest=object({protocol:{const:'scpv-reconcile-v2'},observationRaw:{type:'string',maxLength:4096},signature:digest});
schema.definitions.objectObservation=object({protocol:{const:'scpv-object-observation-v2'},userId:uuid,sessionId:uuid,uploadId,requestId:uuid,transferId:uuid,
 originalSessionId:uuid,configurationDigest:digest,originalConfigurationDigest:digest,verifierId:uuid,incarnation:uuid,sha256:digest,byteLength:{type:'integer',minimum:1,maximum:16777216},objectVersion:version,checkedAtMs:number,expiresAtMs:number});
const encoded=JSON.stringify(schema,null,2)+'\n';
if(process.argv[2]==='--write')fs.writeFileSync(output,encoded);else{assert.equal(process.argv[2],'--check');assert.equal(fs.readFileSync(output,'utf8'),encoded);console.log('Paid Video v2 generated schema matches its immutable v1 derivation');}
