import { validNativeTerminalData } from "./native-store-sandbox-terminal-contract-v1.ts";
import { validNativeDispatchData } from "./native-store-sandbox-dispatch-contract-v1.ts";
/** Normal-app command boundary. No purchase SDK or provider mutation.
 * Dispatch evidence is accepted only from the authenticated server executor. */
export type NativeStoreSandboxActorV1 = { userId:string;accountId:string;sessionGeneration:string };
export type NativeStoreSandboxRequestV1 = { protocol:"native-store-sandbox-command-v1";requestId:string;
 command:"cancel-preparation"|"terminal-recover"|"offer"|"prepare"|"recover"|"claim"|"claim-recover"|"reserve"|"reserve-recover"|"dispatch-consume"|"dispatch-recover"|"dispatch-qualification";payload:Record<string,unknown> };
const row=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,names:string[])=>Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const id=(v:unknown,prefix:string)=>typeof v==="string"&&v.startsWith(prefix)&&uuid(v.slice(prefix.length));
const positive=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0;
const text=(v:unknown)=>typeof v==="string"&&v.length>0&&new TextEncoder().encode(v).length<=512&&v===v.trim()&&!/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(v);
const canonical=(v:unknown):string=>JSON.stringify(v,(_k,x)=>row(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export function validNativeStoreSandboxQuoteV1(v:unknown):v is Record<string,unknown> {
 if(!row(v)||!keys(v,["offerId","offerRevision","resourceId","resourceRevision","creatorId","kind","amountMinor","currency","asset","catalog","quoteDigest"])
 ||!id(v.offerId,"scv1_offer_")||!positive(v.offerRevision)||!id(v.resourceId,"scv1_resource_")||!positive(v.resourceRevision)
 ||!uuid(v.creatorId)||v.kind!=="paid_content"||!positive(v.amountMinor)||v.currency!=="usd"
 ||typeof v.quoteDigest!=="string"||!/^[a-f0-9]{64}$/u.test(v.quoteDigest)||!row(v.asset)||!row(v.catalog))return false;
 const a=v.asset,c=v.catalog;
 return keys(a,["id","incarnation","sha256","byteLength","resourceRevision","profile"])
 &&id(a.id,"scv1_asset_")&&uuid(a.incarnation)&&typeof a.sha256==="string"&&/^[a-f0-9]{64}$/u.test(a.sha256)
 &&positive(a.byteLength)&&(a.byteLength as number)<=16777216&&a.resourceRevision===v.resourceRevision&&a.profile==="scpv-mp4-h264-aac-v1"
 &&keys(c,["bindingId","revision","projectId","appId","store","environment","wireProductId"])
 &&id(c.bindingId,"nssv1_catalog_")&&positive(c.revision)&&text(c.projectId)&&text(c.appId)
 &&["APP_STORE","PLAY_STORE"].includes(c.store as string)&&c.environment==="SANDBOX"&&text(c.wireProductId);
}
export function parseNativeStoreSandboxRequestV1(v:unknown):NativeStoreSandboxRequestV1|null {
 if(!row(v)||!keys(v,["protocol","requestId","command","payload"])||v.protocol!=="native-store-sandbox-command-v1"||!uuid(v.requestId)||!row(v.payload))return null;
 const p=v.payload;
 if(v.command==="cancel-preparation"||v.command==="terminal-recover")return keys(p,["selectionId"])&&id(p.selectionId,"nssv1_selection_")?v as NativeStoreSandboxRequestV1:null;
 if(v.command==="dispatch-qualification")return keys(p,["selectionId"])&&id(p.selectionId,"nssv1_selection_")?v as NativeStoreSandboxRequestV1:null;
 if(v.command==="dispatch-consume"||v.command==="dispatch-recover")return keys(p,["selectionId","reservationId"])&&id(p.selectionId,"nssv1_selection_")&&id(p.reservationId,"nssv1_reservation_")?v as NativeStoreSandboxRequestV1:null;
 if(v.command==="reserve"||v.command==="reserve-recover")return keys(p,["selectionId"])&&id(p.selectionId,"nssv1_selection_")?v as NativeStoreSandboxRequestV1:null;
 if(v.command==="claim"||v.command==="claim-recover")return keys(p,v.command==="claim"?["selectionId","transactionIdentifier","productIdentifier"]:["selectionId"])
 &&id(p.selectionId,"nssv1_selection_")&&(v.command==="claim-recover"||(text(p.transactionIdentifier)&&text(p.productIdentifier)))?v as NativeStoreSandboxRequestV1:null;
 if(v.command==="recover")return keys(p,["originalRequestId"])&&uuid(p.originalRequestId)?v as NativeStoreSandboxRequestV1:null;
 if(v.command!=="offer"&&v.command!=="prepare")return null;
 if(!keys(p,v.command==="offer"?["offerId","store"]:["offerId","store","expectedQuote"])||!id(p.offerId,"scv1_offer_")||!["APP_STORE","PLAY_STORE"].includes(p.store as string))return null;
 if(v.command==="prepare"&&(!validNativeStoreSandboxQuoteV1(p.expectedQuote)||p.expectedQuote.offerId!==p.offerId||!row(p.expectedQuote.catalog)||p.expectedQuote.catalog.store!==p.store))return null;
 return v as NativeStoreSandboxRequestV1;
}
export function validateNativeStoreSandboxResultV1(v:unknown,actor:NativeStoreSandboxActorV1,request:NativeStoreSandboxRequestV1):boolean {
 if(!row(v)||!keys(v,["protocol","command","requestId","actor","status","data","dispatchAllowed","correlation"])
 ||v.protocol!==request.protocol||v.command!==request.command||v.requestId!==request.requestId||canonical(v.actor)!==canonical(actor)
 ||(!request.command.startsWith("dispatch-")&&v.dispatchAllowed!==false)||v.correlation!=="unsupported"||!row(v.data)||!["ok","held","unknown"].includes(v.status as string))return false;
 if(request.command==="cancel-preparation"||request.command==="terminal-recover")return validNativeTerminalData(v.data,{command:request.command,requestId:request.requestId,selectionId:request.payload.selectionId,status:v.status,dispatchAllowed:v.dispatchAllowed});
 if(request.command.startsWith("dispatch-"))return validNativeDispatchData(v.data,{command:request.command,requestId:request.requestId,selectionId:request.payload.selectionId,reservationId:request.payload.reservationId,buyerId:actor.userId,sessionGeneration:actor.sessionGeneration,status:v.status,dispatchAllowed:v.dispatchAllowed});
 if(request.command==="reserve"||request.command==="reserve-recover"){
  const d=v.data,r=d.reservation;
  if(!keys(d,["reservation","reason"]))return false;
  if(v.status==="held")return r===null&&["reservation_terminal","selection_terminal"].includes(d.reason as string);
  if(v.status==="unknown")return request.command==="reserve-recover"&&r===null&&d.reason==="reservation_unknown";
  return v.status==="ok"&&d.reason===null&&validNativeStoreSandboxReservationV1(r)&&r.selectionId===request.payload.selectionId
   &&(request.command!=="reserve"||r.originalRequestId===request.requestId);
 }
 const d=v.data,key=request.command.startsWith("claim")?"claim":request.command==="offer"?"quote":"selection";
 if(!keys(d,[key,"reason"]))return false;
 if(v.status!=="ok")return d[key]===null&&text(d.reason)&&(v.status!=="unknown"||request.command==="recover"||request.command==="claim-recover");
 if(d.reason!==null)return false;
 if(request.command==="claim"||request.command==="claim-recover"){
  if(!validNativeStoreSandboxClaimV1(d.claim)||d.claim.selectionId!==request.payload.selectionId)return false;
  return request.command==="claim-recover"||(d.claim.originalRequestId===request.requestId
   &&d.claim.transactionIdentifier===request.payload.transactionIdentifier&&d.claim.productIdentifier===request.payload.productIdentifier);
 }
 if(request.command==="offer")return validNativeStoreSandboxQuoteV1(d.quote)&&d.quote.offerId===request.payload.offerId&&row(d.quote.catalog)&&d.quote.catalog.store===request.payload.store&&d.quote.creatorId!==actor.userId;
 if(!row(d.selection)||!keys(d.selection,["id","originalRequestId","originalSessionGeneration","createdAt","quote"]))return false;
 const s=d.selection;
 if(!id(s.id,"nssv1_selection_")||!uuid(s.originalRequestId)||!uuid(s.originalSessionGeneration)||typeof s.createdAt!=="string"||!Number.isFinite(Date.parse(s.createdAt))
 ||!validNativeStoreSandboxQuoteV1(s.quote)||s.quote.creatorId===actor.userId)return false;
 return request.command==="recover"?s.originalRequestId===request.payload.originalRequestId
 :s.originalRequestId===request.requestId&&s.originalSessionGeneration===actor.sessionGeneration&&canonical(s.quote)===canonical(request.payload.expectedQuote);
}
export function validNativeStoreSandboxReservationV1(v:unknown):v is Record<string,unknown>{
 return row(v)&&keys(v,["id","selectionId","originalRequestId","originalSessionGeneration","createdAt","quoteDigest","state","dispatchAllowed","providerQualified"])
 &&id(v.id,"nssv1_reservation_")&&id(v.selectionId,"nssv1_selection_")&&uuid(v.originalRequestId)&&uuid(v.originalSessionGeneration)
 &&typeof v.createdAt==="string"&&/^\d{4}-\d\d-\d\dT/u.test(v.createdAt)&&Number.isFinite(Date.parse(v.createdAt))
 &&typeof v.quoteDigest==="string"&&/^[a-f0-9]{64}$/u.test(v.quoteDigest)&&v.state==="dispatch_reserved"&&v.dispatchAllowed===false&&v.providerQualified===false;
}
// Adapt only the known service RPC envelope. Validate BEFORE dropping its
// providerQualified field, so a hostile provider flag cannot be laundered.
export function adaptNativeStoreReservationResultV1(v:unknown):unknown{
 if(!row(v)||!keys(v,["protocol","command","requestId","actor","status","data","dispatchAllowed","providerQualified"])
 ||v.protocol!=="native-store-sandbox-reservation-v1"||v.providerQualified!==false||v.dispatchAllowed!==false)throw Error("reservation_result_invalid");
 const {providerQualified: _qualified,...rest}=v;void _qualified;
 return {...rest,protocol:"native-store-sandbox-command-v1",correlation:"unsupported"};
}
export function validNativeStoreSandboxClaimV1(v:unknown):v is Record<string,unknown>{
 return row(v)&&keys(v,["id","selectionId","originalRequestId","originalSessionGeneration","createdAt","transactionIdentifier","productIdentifier","evidence","settlementAllowed"])
 &&id(v.id,"nssv1_claim_")&&id(v.selectionId,"nssv1_selection_")&&uuid(v.originalRequestId)&&uuid(v.originalSessionGeneration)
 &&typeof v.createdAt==="string"&&Number.isFinite(Date.parse(v.createdAt))&&text(v.transactionIdentifier)&&text(v.productIdentifier)
 &&v.evidence==="client_assertion"&&v.settlementAllowed===false;
}
export function createNativeStoreSandboxCommandHandlerV1(deps:{authenticate:(request:Request)=>Promise<NativeStoreSandboxActorV1|null>;
 execute:(input:{actor:NativeStoreSandboxActorV1;request:NativeStoreSandboxRequestV1})=>Promise<unknown>}) {
 return async(request:Request):Promise<Response>=>{
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
  if(request.method!=="POST")return reply(405,{error:"method_not_allowed"});
  try{
   const verified=await deps.authenticate(request);
   if(!verified||!uuid(verified.userId)||verified.accountId!==verified.userId||!uuid(verified.sessionGeneration))return reply(401,{error:"authentication_required"});
   const actor=Object.freeze({userId:verified.userId,accountId:verified.accountId,sessionGeneration:verified.sessionGeneration});
   if(request.headers.has("content-encoding")&&request.headers.get("content-encoding")!=="identity")return reply(415,{error:"encoded_body_unsupported"});
   const reader=request.body?.getReader();if(!reader)return reply(400,{error:"request_invalid"});
   let total=0;const chunks:Uint8Array[]=[];let timer:ReturnType<typeof setTimeout>|undefined;
   const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("body_deadline")),5000);});
   try{for(;;){const next=await Promise.race([reader.read(),deadline]);if(next.done)break;total+=next.value.length;if(total>16384)return reply(413,{error:"request_too_large"});chunks.push(next.value);}}
   finally{clearTimeout(timer);void reader.cancel().catch(()=>{});reader.releaseLock();}
   const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let value:unknown;try{value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{return reply(400,{error:"request_invalid"});}
   const parsed=parseNativeStoreSandboxRequestV1(value);if(!parsed)return reply(400,{error:"request_invalid"});
   Object.freeze(parsed.payload);Object.freeze(parsed);
   const result=await deps.execute({actor,request:parsed});
   if(!validateNativeStoreSandboxResultV1(result,actor,parsed))throw Error("result_invalid");
   return reply(200,result);
  }catch{return reply(503,{error:"native_store_preparation_uncertain",retryPurchase:false});}
 };
}
