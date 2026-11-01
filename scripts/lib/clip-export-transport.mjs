import { createHash, createHmac } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const enc=value=>encodeURIComponent(value).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hash=value=>createHash('sha256').update(value).digest('hex');
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest();
const lexical=([a],[b])=>a<b?-1:a>b?1:0;
const safeKey=key=>typeof key==='string'&&key.length<=1024&&key.length>0&&!key.startsWith('/')
 &&!key.split('/').some(p=>!p||p==='.'||p==='..')&&!/[\\\x00-\x1f\x7f]/.test(key);
const fail=code=>{throw new Error(code);};

export function createClipOriginSigner(config, now=()=>new Date()) {
 const endpoint=new URL(config.endpoint);
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash
  ||!['','/'].includes(endpoint.pathname)||!config.accessKeyId||!config.secretAccessKey
  ||!['cloudflare_r2','s3'].includes(config.provider)||!config.bucket||!config.region)fail('clip_origin_configuration_invalid');
 return async(method,identity,{headers={},versionId=null}={})=>{
  if(!['GET','PUT'].includes(method)||identity.provider!==config.provider||identity.bucket!==config.bucket||!safeKey(identity.objectKey))fail('clip_origin_identity_invalid');
  if(method==='PUT'&&(headers['If-None-Match']!=='*'||!headers['x-amz-meta-chillywood-write-id']))fail('clip_create_only_required');
  const host=`${config.bucket}.${endpoint.host}`,uri=`/${identity.objectKey.split('/').map(enc).join('/')}`;
  const datetime=now().toISOString().replace(/[:-]|\.\d{3}/g,''),date=datetime.slice(0,8),scope=`${date}/${config.region}/s3/aws4_request`;
  const signed=Object.entries({host,...headers}).map(([k,v])=>[k.toLowerCase(),String(v).trim().replace(/\s+/g,' ')]).sort(lexical);
  const names=signed.map(([key])=>key).join(';'),canonicalHeaders=signed.map(([k,v])=>`${k}:${v}\n`).join('');
  const query=Object.entries({'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Content-Sha256':'UNSIGNED-PAYLOAD',
   'X-Amz-Credential':`${config.accessKeyId}/${scope}`,'X-Amz-Date':datetime,'X-Amz-Expires':'120','X-Amz-SignedHeaders':names,
   ...(versionId?{versionId}:{})}).sort(lexical).map(([k,v])=>`${enc(k)}=${enc(v)}`).join('&');
  const canonical=[method,uri,query,canonicalHeaders,names,'UNSIGNED-PAYLOAD'].join('\n');
  const key=hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`,date),config.region),'s3'),'aws4_request');
  const signature=hmac(key,['AWS4-HMAC-SHA256',datetime,scope,hash(canonical)].join('\n')).toString('hex');
  return `https://${host}${uri}?${query}&X-Amz-Signature=${signature}`;
 };
}

export async function hashClipFile(file,{maxBytes=5368709120,signal}={}) {
 const metadata=await stat(file);
 if(!metadata.isFile()||metadata.size<1||metadata.size>maxBytes)fail('clip_file_size_invalid');
 const digest=createHash('sha256');let size=0;
 for await (const chunk of createReadStream(file,{signal})) {size+=chunk.length;if(size>maxBytes)fail('clip_file_size_invalid');digest.update(chunk);}
 if(size!==metadata.size)fail('clip_file_changed');
 return {sha256:digest.digest('hex'),sizeBytes:size};
}

export async function downloadClipSource({source,file,signer,supabaseUrl,serviceKey,signal,fetcher=fetch,maxBytes=5368709120}) {
 const provider=source.storage_provider,key=source.storage_object_key||source.storage_path,bucket=source.storage_bucket;
 if(!safeKey(key)||!bucket)fail('clip_source_identity_invalid');
 let url,headers={};
 if(provider==='supabase') {
  const root=new URL(supabaseUrl);
  if(root.protocol!=='https:'||root.username||root.password||root.pathname!=='/')fail('clip_supabase_origin_invalid');
  url=`${root.origin}/storage/v1/object/authenticated/${enc(bucket)}/${key.split('/').map(enc).join('/')}`;
  headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`};
 } else url=await signer('GET',{provider,bucket,objectKey:key});
 let response;
 try{response=await fetcher(url,{headers,signal,redirect:'error',cache:'no-store'});}catch{fail('clip_source_download_failed');}
 if(response.status!==200||!response.body||response.headers.has('content-range')||![null,'identity'].includes(response.headers.get('content-encoding')))fail('clip_source_download_invalid');
 const expected=Number(source.file_size_bytes);
 const declared=response.headers.get('content-length');
 if(!Number.isSafeInteger(expected)||expected<1||expected>maxBytes||declared!==null&&Number(declared)!==expected)fail('clip_source_size_mismatch');
 let total=0;
 const counter=new Transform({transform(chunk,_encoding,callback){total+=chunk.length;
  callback(total>expected?new Error('clip_source_size_exceeded'):null,chunk);}});
 try{await pipeline(Readable.fromWeb(response.body),counter,createWriteStream(file,{flags:'wx',mode:0o600}),{signal});}
 catch{fail(signal?.aborted?'render_canceled':'clip_source_download_failed');}
 if(total!==expected)fail('clip_source_size_mismatch');
 return {sizeBytes:total};
}

/** File-stream variant of the secondary producer protocol: no 5 GiB buffers.
 * An uncertain PUT is never retried, replaced, or treated as successful. */
export async function uploadClipOutput({file,identity,signer,signal,fetcher=fetch}) {
 if(identity.provider!=='cloudflare_r2'||!identity.writeToken)fail('clip_output_identity_invalid');
 const local=await hashClipFile(file,{signal});
 if(local.sha256!==identity.sha256||local.sizeBytes!==identity.sizeBytes)fail('clip_output_changed');
 const headers={'If-None-Match':'*','Content-Length':String(local.sizeBytes),'Content-Type':'video/mp4',
  'x-amz-meta-chillywood-write-id':identity.writeToken};
 let response;
 try{response=await fetcher(await signer('PUT',identity,{headers}),{method:'PUT',headers,body:createReadStream(file,{signal}),duplex:'half',signal,redirect:'error'});}
 catch{fail('clip_output_write_unknown');}
 const etag=response.headers.get('etag');
 if(!response.ok||!etag){await response.body?.cancel().catch(()=>{});fail(response.status===412?'clip_output_conflict':'clip_output_write_unknown');}
 await response.body?.cancel().catch(()=>{});
 const readHeaders={'If-Match':etag};
 let readback;
 try{readback=await fetcher(await signer('GET',identity,{headers:readHeaders}),{headers:readHeaders,signal,redirect:'error',cache:'no-store'});}
 catch{fail('clip_output_readback_failed');}
 if(readback.status!==200||!readback.body||readback.headers.has('content-range')
  ||![null,'identity'].includes(readback.headers.get('content-encoding'))||readback.headers.get('etag')!==etag
  ||readback.headers.get('x-amz-meta-chillywood-write-id')!==identity.writeToken
  ||readback.headers.get('content-length')!==String(local.sizeBytes)) {await readback.body?.cancel().catch(()=>{});fail('clip_output_identity_changed');}
 const digest=createHash('sha256');let size=0;
 try{for await(const chunk of Readable.fromWeb(readback.body)){size+=chunk.length;if(size>local.sizeBytes)fail('clip_output_size_mismatch');digest.update(chunk);}}
 catch{fail('clip_output_readback_failed');}
 if(size!==local.sizeBytes||digest.digest('hex')!==local.sha256)fail('clip_output_digest_mismatch');
 return {protocol:'secondary-media-create-only-v1',provider:identity.provider,bucket:identity.bucket,objectKey:identity.objectKey,
  sha256:local.sha256,sizeBytes:local.sizeBytes,etag,versionId:null,createOnly:true,fullReadback:true,writeCompleted:true};
}
