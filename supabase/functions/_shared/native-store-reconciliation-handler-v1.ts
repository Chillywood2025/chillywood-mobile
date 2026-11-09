/** Private service-only reconciliation boundary; never a provider webhook ACK. */
export function createNativeStoreReconciliationHandlerV1(deps: {
 enabled(): boolean;
 authenticate(request: Request): Promise<boolean>;
 process(rawReceiptId: string, deadlineMs: number): Promise<unknown>;
}) {
 const io=Object.freeze({...deps});
 return async(request:Request):Promise<Response>=>{
  const base={protocol:"native-store-reconciliation-v1",acknowledgementAllowed:false,retryAllowed:false,grantsAccess:false,financialAuthority:false,payable:false};
  const reply=(code:number,status:string,rawReceiptId?:string)=>Response.json({...base,status,...rawReceiptId?{rawReceiptId}:{}},{status:code,headers:{"cache-control":"no-store"}});
  if(request.method!=="POST")return reply(405,"method_not_allowed");
  if(io.enabled()!==true)return reply(503,"disabled");
  const deadline=performance.now()+15000;let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  const bounded=async<T>(call:()=>Promise<T>):Promise<T>=>{const remaining=deadline-performance.now();if(remaining<=0||request.signal.aborted)throw Error("unavailable");let timer:ReturnType<typeof setTimeout>;
   try{const result=await Promise.race([call(),new Promise<never>((_r,reject)=>{timer=setTimeout(()=>reject(Error("unavailable")),remaining);})]);if(performance.now()>=deadline||request.signal.aborted)throw Error("unavailable");return result;}finally{clearTimeout(timer!);}};
  let rawReceiptId:string|undefined;
  try{
   if(await bounded(()=>io.authenticate(request))!==true)return reply(403,"service_authority_required");
   if(request.headers.has("content-encoding")&&request.headers.get("content-encoding")!=="identity")return reply(415,"invalid_request");
   if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type")??""))return reply(415,"invalid_request");
   reader=request.body?.getReader();if(!reader)return reply(400,"invalid_request");
   const bytes:Uint8Array[]=[];let length=0;
   for(;;){const part=await bounded(()=>reader!.read());if(part.done)break;length+=part.value.byteLength;if(length>1024)return reply(413,"invalid_request");bytes.push(part.value);}
   const joined=new Uint8Array(length);let offset=0;for(const chunk of bytes){joined.set(chunk,offset);offset+=chunk.byteLength;}
   const text=new TextDecoder("utf-8",{fatal:true}).decode(joined);
   // Only this single scalar request is supported. This grammar also rejects
   // duplicate keys, encoded key aliases, nested caller scope and trailing data.
   const match=/^\s*\{\s*"rawReceiptId"\s*:\s*"([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})"\s*\}\s*$/u.exec(text);
   if(!match)return reply(400,"invalid_request");rawReceiptId=match[1];
   const result=await bounded(()=>io.process(rawReceiptId!,Math.max(1,Math.floor(deadline-performance.now()))));
   if(!result||typeof result!=="object"||Array.isArray(result))throw Error("unavailable");
   const r=result as Record<string,unknown>;
   if(r.protocol!=="native-store-effect-worker-result-v1"||r.rawReceiptId!==rawReceiptId||!["processed","held","unknown"].includes(String(r.status))
    ||r.acknowledgementAllowed!==false||r.grantsAccess!==false||r.financialAuthority!==false||r.payable!==false)throw Error("unavailable");
   // Never expose journal plaintext, claim/customer identifiers, keys, the
   // worker's private effect object, or a shared-hook acknowledgement.
   return reply(r.status==="unknown"?503:200,String(r.status),rawReceiptId);
  }catch{return reply(503,"outcome_unknown",rawReceiptId);}
  finally{if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}}
 };
}
