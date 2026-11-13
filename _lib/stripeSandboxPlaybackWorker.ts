export type StripePlaybackDescriptor={videoId:string;grantId:string;sourceVersionId:string;assetSha256:string;byteLength:number};
function bounded<T>(operation:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  let settled=false;
  const done=()=>{settled=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);};
  const cancel=()=>{if(!settled){done();reject(Error('playback_cancelled'));}};
  const timer=setTimeout(()=>{if(!settled){done();reject(Error('playback_worker_unavailable'));}},60000);
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted){cancel();return;}
  operation.then(value=>{if(!settled){done();resolve(value);}},error=>{if(!settled){done();reject(error);}});
 });
}
/** Opaque routes also require the registering document's clientId. No bearer URL. */
export async function bindStripeSandboxPlaybackWorker(input:{endpoint:string;headers:Record<string,string>;descriptor:StripePlaybackDescriptor;signal:AbortSignal;onLost:()=>void}):Promise<{uri:string;renew:()=>void;release:()=>void}>{
 if(typeof navigator==='undefined'||!navigator.serviceWorker||!window.isSecureContext)throw Error('secure_browser_playback_required');
 const sw=navigator.serviceWorker,script=new URL('/stripe-sandbox-media-sw.js',location.origin).href;
 const ours=(worker:ServiceWorker|null)=>!worker||worker.scriptURL===script;
 if(!ours(sw.controller))throw Error('playback_worker_conflict');
 const registrations=await bounded(sw.getRegistrations(),input.signal);
 if(registrations.some(r=>!ours(r.active)||!ours(r.waiting)||!ours(r.installing)))throw Error('playback_worker_conflict');
 if(input.signal.aborted)throw Error('playback_cancelled');
 await bounded(sw.register(script,{scope:'/',updateViaCache:'none'}),input.signal);
 await bounded(sw.ready,input.signal);
 if(!sw.controller){await new Promise<void>((resolve,reject)=>{
  const done=()=>{clearTimeout(timer);sw.removeEventListener('controllerchange',changed);input.signal.removeEventListener('abort',cancel);};
  const changed=()=>{if(sw.controller){done();resolve();}};const cancel=()=>{done();reject(Error('playback_cancelled'));};
  const timer=setTimeout(()=>{done();reject(Error('playback_worker_unavailable'));},60000);
  sw.addEventListener('controllerchange',changed);input.signal.addEventListener('abort',cancel,{once:true});
  if(input.signal.aborted)cancel();else changed();
 });}
 const worker=sw.controller;if(!worker||!ours(worker)||input.signal.aborted)throw Error('playback_worker_unavailable');
 const id=crypto.randomUUID();
 let released=false;
 const lost=()=>{release();input.onLost();};
 const release=()=>{if(released)return;released=true;worker.postMessage({action:'release',id});sw.removeEventListener('controllerchange',lost);input.signal.removeEventListener('abort',lost);};
 sw.addEventListener('controllerchange',lost);input.signal.addEventListener('abort',lost,{once:true});
 if(input.signal.aborted||sw.controller!==worker){release();throw Error('playback_cancelled');}
 try{
 await new Promise<void>((resolve,reject)=>{const channel=new MessageChannel();
  const done=()=>{clearTimeout(timer);channel.port1.close();input.signal.removeEventListener('abort',cancel);};
  const cancel=()=>{done();reject(Error('playback_cancelled'));};
  const timer=setTimeout(()=>{done();reject(Error('playback_worker_unavailable'));},10000);
  channel.port1.onmessage=event=>{done();if(event.data?.ok)resolve();else reject(Error('playback_worker_unavailable'));};
  input.signal.addEventListener('abort',cancel,{once:true});
  worker.postMessage({action:'bind',id,endpoint:input.endpoint,descriptor:input.descriptor,authorization:input.headers.Authorization,apikey:input.headers.apikey,sessionId:input.headers['X-Chillywood-Auth-Session']},[channel.port2]);
  if(input.signal.aborted)cancel();
 });
 if(input.signal.aborted||sw.controller!==worker||released)throw Error('playback_cancelled');
 return {uri:new URL(`/_stripe-sandbox-media/${id}`,location.origin).href,renew:()=>{if(!released)worker.postMessage({action:'renew',id});},release};
 }catch(error){release();throw error;}
}
