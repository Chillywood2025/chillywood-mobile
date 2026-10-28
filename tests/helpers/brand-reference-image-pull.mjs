import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

export const BRAND_IMAGE_PULL_BUDGET_MS=300_000;
const backoffs=[10_000,30_000,60_000];
const diagnosticLimit=8192;
const denialPattern=/unauthorized|forbidden|denied|authentication required|manifest unknown|name unknown|not found|digest[^\n]*mismatch/i;

// Registry diagnostics use Go durations as well as HTTP seconds/dates. Never
// turn an unreadable or excessive server delay into an earlier retry.
export function brandImageRetryAfterMs(text,wallNow=Date.now()){
 const markers=[...text.matchAll(/retry-after[^\S\r\n]*:/gi)];
 assert.ok(markers.length<=1,'ambiguous registry retry-after; refusing an early retry');
 const matches=[...text.matchAll(/retry-after[^\S\r\n]*:[^\S\r\n]*([^\r\n]*)/gi)];
 const match=matches[0];
 if(!match)return 0;
 const parts=match[1].split(/,\s*allowed:/i);
 assert.ok(parts.length<=2&&(parts.length===1||/^\s*\d+\/(?:second|minute|hour)\s*$/i.test(parts[1])),
  'unreadable registry retry-after suffix; refusing an early retry');
 const value=parts[0].trim();
 let ms;
 if(/^\d+(?:\.\d+)?$/.test(value))ms=Number(value)*1000;
 else if(/^(?:\d+(?:\.\d+)?(?:ns|[µμu]s|ms|s|m|h))+$/.test(value)){
  const units={ns:1e-6,'µs':1e-3,'μs':1e-3,us:1e-3,ms:1,s:1000,m:60_000,h:3_600_000};
  ms=[...value.matchAll(/(\d+(?:\.\d+)?)(ns|[µμu]s|ms|s|m|h)/g)]
   .reduce((sum,[,n,unit])=>sum+Number(n)*units[unit],0);
 }else if(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), /.test(value))ms=Math.max(0,Date.parse(value)-wallNow);
 assert.ok(Number.isFinite(ms)&&ms>=0,'unreadable registry retry-after; refusing an early retry');
 return Math.ceil(ms);
}

// A killed/errored child still owns this attempt until close, not merely exit
// or an observer timeout. No successor can overlap its stdout/stderr lifetime.
export function runBrandImagePullAttempt({args,cwd,env,timeoutMs,signal,onOutput=()=>{},now=()=>performance.now(),deadline=now()+timeoutMs,
 spawnProcess=spawn,setTimer=setTimeout,clearTimer=clearTimeout}){
 return new Promise(resolve=>{
  if(signal?.aborted){resolve({code:null,signal:null,cancelled:true,diagnostic:''});return;}
  if(deadline<=now()){resolve({code:null,signal:null,processTimeout:true,diagnostic:''});return;}
  let child;
  try{child=spawnProcess('docker',args,{cwd,env,stdio:['ignore','pipe','pipe']});}
  catch(error){resolve({code:null,signal:null,error:error.message,diagnostic:''});return;}
  let diagnostic='',errorMessage,processTimeout=false,cancelled=false,denied=false,diagnosticTruncated=false;
  const abort=()=>{cancelled=true;child.kill('SIGTERM');};
  const timer=setTimer(()=>{processTimeout=true;child.kill('SIGKILL');},Math.max(0,Math.min(timeoutMs,deadline-now())));
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  for(const stream of [child.stdout,child.stderr])stream?.on('data',chunk=>{
   const next=diagnostic+chunk.toString();denied||=denialPattern.test(next);
   diagnosticTruncated||=next.length>diagnosticLimit;
   diagnostic=next.slice(-diagnosticLimit);onOutput(chunk);
  });
  child.on('error',error=>{errorMessage=error.message;});
  child.on('close',(code,childSignal)=>{
   clearTimer(timer);signal?.removeEventListener('abort',abort);
   resolve({code,signal:childSignal,error:errorMessage,processTimeout,cancelled,denied,diagnosticTruncated,diagnostic});
  });
 });
}

// Only acquisition is retried. Qualification gates must remain single-attempt
// and fail-fast, and the caller must still verify the downloaded image identity.
export async function pullBrandNativeImage({imageReference,runAttempt,onBackoff=()=>{},signal,
 now=()=>performance.now(),wallNow=Date.now,sleep=delay,random=Math.random}){
 assert.match(imageReference,/^ghcr\.io\/supabase\/postgres@sha256:[a-f0-9]{64}$/);
 const args=Object.freeze(['pull','--platform','linux/amd64',imageReference]);
 const deadline=now()+BRAND_IMAGE_PULL_BUDGET_MS;
 for(let attempt=1;attempt<=4;attempt++){
  assert.ok(!signal?.aborted,'image pull cancelled');
  const timeoutMs=Math.floor(deadline-now());
  assert.ok(timeoutMs>0,'image pull exceeded its total 300-second budget');
  const result=await runAttempt({attempt,label:`pull-image-attempt-${attempt}`,args,timeoutMs,deadline,now,signal});
  assert.ok(!signal?.aborted&&!result.cancelled&&!result.signal,'image pull cancelled or signalled');
  assert.ok(!result.processTimeout&&now()<deadline,'image pull exceeded its total 300-second budget');
  assert.ok(!result.error,result.error);
  if(result.code===0)return;
  const diagnostic=result.diagnostic??'';
  const denied=result.denied||denialPattern.test(diagnostic);
  // Fail closed on unknown/mixed or truncated output: a surviving throttle
  // marker cannot conceal an earlier denial, server delay or unrelated error.
  const lines=diagnostic.trim().split(/\r?\n/).filter(Boolean);
  const rateLine=/^(?:Error(?: response from daemon)?:\s*|error pulling image configuration: download failed after attempts=[1-9]\d*:\s*)?(?:toomanyrequests(?::\s*(?:too many requests|retry-after:\s*.+))?|HTTP(?:\/[\d.]+)?\s+429(?:\s+Too Many Requests)?|429\s+Too Many Requests|(?:unexpected )?status(?: code)?[:=]?\s+429)$/i;
  // These are the non-error progress shapes in the observed pinned pull. Do
  // not permit arbitrary Docker lines or another image identity as progress.
  const progress=line=>line===`${imageReference}: Pulling from supabase/postgres`||/^[a-f0-9]{12}: (?:Pulling fs layer|Waiting)$/.test(line);
  const throttled=lines.some(line=>rateLine.test(line))&&lines.every(line=>rateLine.test(line)||/^retry-after\s*:/i.test(line)||progress(line));
  assert.ok(Number.isInteger(result.code)&&result.code>0&&throttled&&!denied&&!result.diagnosticTruncated,`image pull failed without retryable throttling (exit ${result.code})`);
  assert.ok(attempt<4,'image pull throttling exhausted four attempts');
  const jitter=random();assert.ok(Number.isFinite(jitter)&&jitter>=0&&jitter<1,'invalid pull retry jitter');
  const waitMs=Math.max(backoffs[attempt-1],brandImageRetryAfterMs(diagnostic,wallNow()))+Math.floor(jitter*1000);
  assert.ok(waitMs<deadline-now(),'registry retry delay exceeds the remaining image-pull budget');
  onBackoff({attempt,waitMs});
  assert.ok(waitMs<deadline-now(),'image-pull diagnostics exhausted the remaining budget');
  await sleep(waitMs,undefined,{signal});
 }
}
