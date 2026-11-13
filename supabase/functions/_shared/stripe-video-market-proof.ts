// Checkout-only verifier. This does NOT consume a nonce or authorize a charge.
// Callers must atomically bind/consume the observation with the exact order.
// It intentionally does not reuse the permissive v1 audit-path matcher.
const PATH = '/functions/v1/stripe-paid-video-checkout';
const PURPOSE = 'stripe-video-new-checkout';
const LIMIT = 32768;
const encoder = new TextEncoder();
const hex = (value: ArrayBuffer) => [...new Uint8Array(value)].map(b=>b.toString(16).padStart(2,'0')).join('');
const digest = async(value: string | Uint8Array) => hex(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):new Uint8Array(value)));
const fail = (): never => { throw Error('trusted_checkout_market_proof_required'); };
const sameSignature = (actual:string,expected:string) => {
  if(!/^[0-9a-f]{64}$/.test(actual))return false;
  let difference=0; for(let i=0;i<64;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
  return difference===0;
};
export type StripeVideoMarketObservation = {
  nonce: string; bodySha256: string; authorizationSha256: string;
  observedAt: string; expiresAt: string; country: 'US'; verification: 'trusted_ip_country_observation';
  requestId: string; videoId: string; platform: 'web'|'ios'|'android';
};

export async function readStripeVideoRequestBody(request:Request):Promise<Uint8Array> {
  if(!request.body)return fail();
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
    if(length>LIMIT)return fail();chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  return body;
}

export async function verifyStripeVideoMarketProof(request:Request, body:Uint8Array,
  options:{secret:string; audience:string; nowMs?:number}):Promise<StripeVideoMarketObservation> {
  const url=new URL(request.url),now=options.nowMs??Date.now();
  if(request.method!=='POST'||url.pathname!==PATH||url.search||body.byteLength>LIMIT
    ||!options.secret||!Number.isFinite(now))return fail();
  let audience:URL;try{audience=new URL(options.audience);}catch{return fail();}
  if(audience.protocol!=='https:'||audience.origin!==options.audience)return fail();
  const headers=request.headers,proof=headers.get('x-chillywood-network-proof')??'',
    signature=headers.get('x-chillywood-network-proof-signature')??'',
    timestamp=headers.get('x-chillywood-network-proof-timestamp')??'',
    version=headers.get('x-chillywood-network-proof-version');
  if(version!=='v2'||proof.length>4096||! /^[A-Za-z0-9_-]+$/.test(proof)
    ||!/^\d{10}$/.test(timestamp)||!/^sha256=[0-9a-f]{64}$/.test(signature))return fail();
  const instant=Number(timestamp)*1000;
  // Five minutes accommodates existing provider reads, not an unlimited lease.
  if(instant>now+30000||now-instant>300000)return fail();
  const key=await crypto.subtle.importKey('raw',encoder.encode(options.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const expected=hex(await crypto.subtle.sign('HMAC',key,encoder.encode(`v2.${timestamp}.${proof}`)));
  if(!sameSignature(signature.slice(7),expected))return fail();
  let row:Record<string,unknown>;
  try{const encoded=proof.replace(/-/g,'+').replace(/_/g,'/');row=JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')));}
  catch{return fail();}
  if(!row||typeof row!=='object'||Array.isArray(row)||row.version!=='v2'||row.purpose!==PURPOSE
    ||row.timestamp!==timestamp||row.audience!==options.audience||row.request_path!==PATH||row.method!=='POST'
    ||!['web','ios','android'].includes(String(row.platform))||row.platform!==headers.get('x-chillywood-platform')
    ||row.country!=='US'||typeof row.nonce!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.nonce))return fail();
  const authorization=headers.get('authorization')??'';
  if(!/^Bearer [^\s]+$/.test(authorization)||row.body_sha256!==await digest(body)
    ||row.authorization_sha256!==await digest(authorization))return fail();
  let identity:Record<string,unknown>;
  try{identity=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{return fail();}
  const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  if(!identity||typeof identity!=='object'||Array.isArray(identity)||identity.action!==undefined
    ||!uuid(identity.requestId)||!uuid(identity.videoId))return fail();
  return {nonce:row.nonce,bodySha256:row.body_sha256 as string,authorizationSha256:row.authorization_sha256 as string,
    observedAt:new Date(instant).toISOString(),expiresAt:new Date(instant+300000).toISOString(),
    country:'US',verification:'trusted_ip_country_observation',requestId:identity.requestId,videoId:identity.videoId,
    platform:row.platform as 'web'|'ios'|'android'};
}
