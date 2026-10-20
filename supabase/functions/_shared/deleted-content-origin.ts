// Private worker-only signer. Consumer inspection readers remain GET/HEAD-only.
// Ordinary DELETE is permitted solely after the durable registry proves that
// this logical key can never represent legitimate new content again.
import {inspectionOriginConfig} from "./content-inspection-private-origin.ts";
import {buildCanonicalSignedHeaders} from "./media-upload-integrity.ts";
export type RetiredMediaClaimBinding={claimId:string;provider:string;bucket:string;objectKey:string};
const enc=(s:string)=>encodeURIComponent(s).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const bytes=(s:string)=>new TextEncoder().encode(s);
const hex=(v:ArrayBuffer)=>Array.from(new Uint8Array(v),x=>x.toString(16).padStart(2,"0")).join("");
const hmac=async(key:Uint8Array|ArrayBuffer,text:string)=>{
 const material=new Uint8Array(key instanceof ArrayBuffer?key:key.slice().buffer as ArrayBuffer);
 const k=await crypto.subtle.importKey("raw",material,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return crypto.subtle.sign("HMAC",k,bytes(text));
};
export function createRetiredMediaOriginCleanup(env:(name:string)=>string|undefined,request:typeof fetch=fetch){
 const config=inspectionOriginConfig(env),endpoint=new URL(config.endpoint);
 if(config.provider!=="cloudflare_r2" || config.bucket!=="chillywood-media-origin"
   || endpoint.protocol!=="https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
   || !["","/"].includes(endpoint.pathname))throw Error("retired_media_origin_unsupported");
 const host=`${config.bucket}.${endpoint.host}`;
 return async(binding:RetiredMediaClaimBinding,method:"HEAD"|"DELETE")=>{
  if(!/^[0-9a-f-]{36}$/i.test(binding.claimId) || binding.provider!==config.provider || binding.bucket!==config.bucket
    || !binding.objectKey || binding.objectKey.length>1024 || binding.objectKey.startsWith("/") || binding.objectKey.includes("..")
    || [...binding.objectKey].some(c=>c.charCodeAt(0)<32 || c.charCodeAt(0)===127 || c==="\\"))throw Error("retired_media_binding_invalid");
  const path=`/${binding.objectKey.split("/").map(enc).join("/")}`;
  const dateTime=new Date().toISOString().replace(/[:-]|\.\d{3}/g,""),date=dateTime.slice(0,8);
  const scope=`${date}/${config.region}/s3/aws4_request`,signed=buildCanonicalSignedHeaders(host,{});
  const query=Object.entries({"X-Amz-Algorithm":"AWS4-HMAC-SHA256","X-Amz-Content-Sha256":"UNSIGNED-PAYLOAD",
    "X-Amz-Credential":`${config.accessKeyId}/${scope}`,"X-Amz-Date":dateTime,"X-Amz-Expires":"30","X-Amz-SignedHeaders":signed.signedHeaders})
    .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${enc(k)}=${enc(v)}`).join("&");
  const canonical=[method,path,query,signed.canonicalHeaders,signed.signedHeaders,"UNSIGNED-PAYLOAD"].join("\n");
  const toSign=["AWS4-HMAC-SHA256",dateTime,scope,hex(await crypto.subtle.digest("SHA-256",bytes(canonical)))].join("\n");
  const k=await hmac(await hmac(await hmac(await hmac(bytes(`AWS4${config.secretAccessKey}`),date),config.region),"s3"),"aws4_request");
  try{return await request(`https://${host}${path}?${query}&X-Amz-Signature=${hex(await hmac(k,toSign))}`,{
    method,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),
  });}catch{throw Error("retired_media_origin_request_failed");}
 };
}
