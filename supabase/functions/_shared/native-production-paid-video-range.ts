type Row = Record<string, unknown>;
type Actor = { buyerId: string; sessionId: string };
type Context = Actor & { protocol: string; admissionId?: string; qualificationId?: string; videoId?: string; grantId?: string;
 sourceVersionId: string; provider: string; bucket: string; objectKey: string; generation: string;
 assetSha256: string; byteLength: number; validUntilMs: number };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const hex = (v: unknown) => typeof v === "string" && /^[0-9a-f]{64}$/u.test(v);
const headers = { "Cache-Control": "private, no-store", "Access-Control-Allow-Origin": "*",
 "Access-Control-Allow-Headers": "authorization, apikey, content-type, range, x-chillywood-auth-session",
 "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { ...headers, "Content-Type": "application/json" } });
const maxRange = 4 * 1024 * 1024;

function context(value: unknown, actor: Actor, now: number, preflight: boolean): Context {
 if (!row(value) || value.protocol !== (preflight ? "native-production-preflight-v1" : "native-production-origin-v1")
  || value.buyerId !== actor.buyerId || value.sessionId !== actor.sessionId || !uuid(value.sourceVersionId)
  || !["s3", "cloudflare_r2"].includes(String(value.provider)) || typeof value.bucket !== "string" || !value.bucket
  || typeof value.objectKey !== "string" || !value.objectKey || !hex(value.assetSha256)
  || typeof value.generation !== "string" || !/^"[0-9a-f]{32}(-[1-9][0-9]*)?"$/u.test(value.generation)
  || !Number.isSafeInteger(value.byteLength) || Number(value.byteLength) < 1
  || !Number.isSafeInteger(value.validUntilMs) || Number(value.validUntilMs) <= now || Number(value.validUntilMs) > now + 5500)
  throw Error("origin_authority_unavailable");
 return value as Context;
}
function range(raw: string | null, length: number) {
 const match = /^bytes=(\d+)-(\d*)$/u.exec(raw ?? "");
 if (!match) throw Error("range_required");
 const start = Number(match[1]), requestedEnd = match[2] ? Number(match[2]) : length - 1;
 if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= length || requestedEnd < start)
  throw Error("range_invalid");
 return { start, end: Math.min(length - 1, requestedEnd, start + maxRange - 1) };
}

export function createNativeProductionPaidVideoRange(deps: {
 enabled(): boolean; authenticate(req: Request, signal: AbortSignal): Promise<Actor | null>;
 rpc(name: string, args: Row, signal: AbortSignal): Promise<unknown>;
 origin(binding: {provider:string;bucket:string;objectKey:string;originReadExpiresAt:string}, method:"GET"|"HEAD", signal:AbortSignal, headers:Record<string,string>):Promise<Response>;
 now?: () => number;
}) {
 const now = deps.now ?? Date.now;
 return async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (!deps.enabled()) return json(503, { status: "unavailable" });
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 5000);
  const signal = AbortSignal.any([req.signal, abort.signal]); const deadline = now() + 5000;
  const current = () => { if (signal.aborted || now() >= deadline) throw Error("deadline"); };
  try {
   const url = new URL(req.url), parts = url.pathname.split("/").filter(Boolean);
   const prefix = parts.indexOf("native-production-paid-video-playback");
   const path = prefix >= 0 ? parts.slice(prefix + 1) : [];
   const preflight = req.method === "POST" && path.length === 2 && path[0] === "preflight";
   if (url.search || !(preflight || (req.method === "GET" && path.length === 2)) || !uuid(path[1]) || (!preflight && !uuid(path[0])))
    return json(400, { status: "unavailable" });
   const expectedSession = req.headers.get("X-Chillywood-Auth-Session");
   if (!uuid(expectedSession)) return json(403, { status: "unavailable" });
   const actor = await deps.authenticate(req, signal); current();
   if (!actor || !uuid(actor.buyerId) || actor.sessionId !== expectedSession) return json(403, { status: "unavailable" });
   let configuration: string | null = null;
   if (preflight) {
    const reader=req.body?.getReader();if(!reader)throw Error("body_missing");
    let raw="",size=0;const decoder=new TextDecoder("utf-8",{fatal:true});
    try{for(;;){const chunk=await reader.read();current();if(chunk.done)break;
     size+=chunk.value.byteLength;if(size>256)throw Error("body_limit");raw+=decoder.decode(chunk.value,{stream:true});}
     raw+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
    const body = JSON.parse(raw);
    if (!row(body) || Object.keys(body).length !== 1 || !hex(body.configurationSha256)) return json(400, { status: "unavailable" });
    configuration = body.configurationSha256 as string;
   }
   const args = preflight
    ? { p_admission_id:path[1],p_buyer_id:actor.buyerId,p_session_id:actor.sessionId,p_configuration_sha256:configuration }
    : { p_video_id:path[0],p_grant_id:path[1],p_buyer_id:actor.buyerId,p_session_id:actor.sessionId };
   const authorize = async () => {
    current(); const value = await deps.rpc(preflight ? "resolve_native_production_checkout_preflight" : "resolve_native_production_paid_video_origin", args, signal); current();
    const bound = context(value, actor, now(), preflight);
    if (preflight ? bound.admissionId !== path[1] || !uuid(bound.qualificationId) : bound.videoId !== path[0] || bound.grantId !== path[1]) throw Error("binding");
    return bound;
   };
   const first = await authorize();
   const requested = preflight ? null : range(req.headers.get("Range"), first.byteLength);
   const origin = await deps.origin({provider:first.provider,bucket:first.bucket,objectKey:first.objectKey,
    originReadExpiresAt:new Date(Math.min(deadline,first.validUntilMs)).toISOString()},preflight?"HEAD":"GET",signal,
    {"if-match":first.generation,...(requested?{range:`bytes=${requested.start}-${requested.end}`}:{})}); current();
   const expectedLength = requested ? requested.end-requested.start+1 : first.byteLength;
   if (origin.status !== (preflight ? 200 : 206) || origin.headers.has("location") || origin.headers.has("content-encoding")
    || origin.headers.get("etag") !== first.generation || origin.headers.get("content-type")?.split(";",1)[0].trim() !== "video/mp4"
    || origin.headers.get("content-length") !== String(expectedLength)
    || (requested && origin.headers.get("content-range") !== `bytes ${requested.start}-${requested.end}/${first.byteLength}`)) {
    await origin.body?.cancel(); throw Error("origin_identity");
   }
   let bytes = new Uint8Array();
   if (requested) {
    const reader = origin.body?.getReader(); if (!reader) throw Error("body_missing");
    bytes = new Uint8Array(expectedLength); let offset=0;
    try { for (;;) { const next=await reader.read(); current(); if(next.done) break;
     if(offset+next.value.byteLength>expectedLength) throw Error("body_overflow");bytes.set(next.value,offset);offset+=next.value.byteLength; }
     if(offset!==expectedLength) throw Error("body_incomplete");
    } finally { await reader.cancel().catch(()=>{}); }
   } else await origin.body?.cancel();
   const latest = await authorize();
   for (const key of Object.keys(first)) if(key!=="validUntilMs" && first[key as keyof Context]!==latest[key as keyof Context]) throw Error("authority_changed");
   const until = Math.min(first.validUntilMs,latest.validUntilMs,deadline); if(now()>=until) throw Error("deadline");
   if (preflight) {
    const recorded = await deps.rpc("record_native_production_checkout_preflight",{...args,p_generation:first.generation,
     p_byte_length:first.byteLength,p_content_type:"video/mp4"},signal); current();
    if(!row(recorded)||recorded.protocol!=="native-production-preflight-v1"||recorded.status!=="READY"||recorded.admissionId!==path[1]||recorded.dispatchAllowed!==false) throw Error("preflight_unavailable");
    return json(200,recorded);
   }
   return new Response(bytes,{status:206,headers:{...headers,"Content-Type":"video/mp4","Content-Length":String(bytes.length),
    "Accept-Ranges":"bytes","Content-Range":`bytes ${requested!.start}-${requested!.end}/${first.byteLength}`,
    "X-Chillywood-Media-Protocol":"native-production-range-v1","X-Chillywood-Video-Id":path[0],"X-Chillywood-Grant-Id":path[1],
    "X-Chillywood-Source-Version":first.sourceVersionId,"X-Chillywood-Asset-Sha256":first.assetSha256,
    "X-Chillywood-Byte-Length":String(first.byteLength),"X-Chillywood-Authorized-Until-Ms":String(until),
    Vary:"Authorization, X-Chillywood-Auth-Session, Range"}});
  } catch { return json(403,{status:"unavailable"}); }
  finally { clearTimeout(timer);abort.abort(); }
 };
}
