import {createHash,createHmac} from 'node:crypto';
const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const hash=s=>createHash('sha256').update(s).digest('hex');
const hmac=(k,s)=>createHmac('sha256',k).update(s).digest();

// Explicit output-only configuration. This does not discover credentials,
// create a key, change bucket policy or silently borrow scanner credentials.
export function createSecondaryMediaS3Signer({provider,bucket,endpoint,region,accessKeyId,secretAccessKey,allowExpiry=false},now=()=>new Date()){
 if(typeof endpoint!=='string'||!endpoint)throw Error('secondary_media_output_configuration_missing');
 const url=new URL(endpoint);
 if(!['cloudflare_r2','hetzner_s3'].includes(provider)||url.protocol!=='https:'||url.username||url.password||url.port
  ||url.search||url.hash||!['','/'].includes(url.pathname)||!bucket||!region||!accessKeyId||!secretAccessKey
  ||provider==='cloudflare_r2'&&!/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(url.hostname)
  ||provider==='hetzner_s3'&&!/^[a-z0-9-]+\.your-objectstorage\.com$/.test(url.hostname))throw Error('secondary_media_output_configuration_invalid');
 return async(method,identity,{headers={},versionId,reconcile=false}={})=>{
  if(!(allowExpiry?['DELETE','HEAD','GET']:['PUT','GET']).includes(method)||identity.provider!==provider||identity.bucket!==bucket
   ||!identity.objectKey||identity.objectKey.startsWith('/')||identity.objectKey.includes('..')
   ||!/^[A-Za-z0-9_./-]+$/.test(identity.objectKey))throw Error('secondary_media_signer_identity_invalid');
  if(method==='PUT'&&headers['If-None-Match']!=='*')throw Error('secondary_media_create_only_required');
  if(method==='GET'&&!headers['If-Match']&&!reconcile)throw Error('secondary_media_readback_condition_required');
  if(allowExpiry&&(!/^[a-f0-9-]{36}$/.test(identity.claimId)||!/^[a-f0-9]{64}$/.test(identity.contractSha256)
    ||provider==='hetzner_s3'&&(!versionId||versionId==='null')))throw Error('secondary_media_expiry_binding_required');
  const dateTime=now().toISOString().replace(/[:-]|\.\d{3}/g,''),date=dateTime.slice(0,8);
  const scope=`${date}/${region}/s3/aws4_request`,path=`/${enc(bucket)}/${identity.objectKey.split('/').map(enc).join('/')}`;
  const values={host:url.host,...Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),String(v).trim().replace(/\s+/g,' ')]))};
  const names=Object.keys(values).sort(),signedHeaders=names.join(';');
  const query={'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Content-Sha256':'UNSIGNED-PAYLOAD',
   'X-Amz-Credential':`${accessKeyId}/${scope}`,'X-Amz-Date':dateTime,'X-Amz-Expires':'60','X-Amz-SignedHeaders':signedHeaders};
  if(versionId)query.versionId=versionId;
  const canonicalQuery=Object.entries(query).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${enc(k)}=${enc(v)}`).join('&');
  const canonical=[method,path,canonicalQuery,names.map(k=>`${k}:${values[k]}\n`).join(''),signedHeaders,'UNSIGNED-PAYLOAD'].join('\n');
  const key=hmac(hmac(hmac(hmac('AWS4'+secretAccessKey,date),region),'s3'),'aws4_request');
  const signature=hmac(key,['AWS4-HMAC-SHA256',dateTime,scope,hash(canonical)].join('\n')).toString('hex');
  return `${url.origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
 };
}

export function secondaryMediaOutputConfig(env,bucket){
 return {provider:'cloudflare_r2',bucket,endpoint:env.MEDIA_OUTPUT_R2_ENDPOINT,region:env.MEDIA_OUTPUT_R2_REGION||'auto',
  accessKeyId:env.MEDIA_OUTPUT_R2_ACCESS_KEY_ID,secretAccessKey:env.MEDIA_OUTPUT_R2_SECRET_ACCESS_KEY};
}
