import {useEffect,useState} from 'react';
import {AppState,Platform} from 'react-native';
import {captureAccountBoundSupabaseMutationSubject,invokeAccountBoundSupabaseMutationRpc,assertAccountBoundSupabaseMutationSubjectCurrent} from './accountBoundSupabaseMutation';
import {subscribeToAccountSessionAuthority} from './accountSessionAuthority';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from './supabase';
import {bindStripeSandboxPlaybackWorker,type StripePlaybackDescriptor} from './stripeSandboxPlaybackWorker';
type Source={uri:string;headers:Record<string,string>};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
function descriptor(value:unknown,videoId:string):StripePlaybackDescriptor|null{
 const r=value&&typeof value==='object'?value as Record<string,unknown>:null;
 return r?.protocol==='stripe-sandbox-playback-v1'&&r.status==='READY'&&r.videoId===videoId
 &&r.adapter==='stripe-sandbox-etag-range-v1'&&uuid(r.grantId)&&uuid(r.sourceVersionId)
 &&typeof r.assetSha256==='string'&&/^[0-9a-f]{64}$/.test(r.assetSha256)&&Number.isSafeInteger(r.byteLength)&&Number(r.byteLength)>0
 ?{videoId,grantId:r.grantId,sourceVersionId:r.sourceVersionId,assetSha256:r.assetSha256,byteLength:Number(r.byteLength)}:null;
}
export function useStripeSandboxPaidVideoPlaybackState(videoId:string|null):{source:Source|null;error:string|null}{
 const [state,setState]=useState<{videoId:string;source:Source|null;error:string|null}|null>(null);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{const retire=()=>{setState(null);setRevision(n=>n+1);};const unsub=subscribeToAccountSessionAuthority(retire);
 const life=AppState.addEventListener('change',retire);return()=>{unsub();life.remove();};},[]);
 useEffect(()=>{
 setState(null);if(!videoId||AppState.currentState!=='active')return;
 let retired=false,binding:Awaited<ReturnType<typeof bindStripeSandboxPlaybackWorker>>|null=null,poll:ReturnType<typeof setInterval>|undefined;
 const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),300000);
 // Retiring bytes must not erase the explicit failure set by the abort path.
 const revoke=()=>{if(binding){binding.release();binding=null;}};
 const aborted=()=>{if(!retired){revoke();setState({videoId,source:null,error:'playback_authority_unavailable'});}};
 abort.signal.addEventListener('abort',aborted,{once:true});
 const valid=()=>!retired&&!abort.signal.aborted&&AppState.currentState==='active';
 void(async()=>{
  const subject=await captureAccountBoundSupabaseMutationSubject();if(!valid())return;
  if(!subject)throw Error('playback_authority_unavailable');
  const read=async()=>{const r=await invokeAccountBoundSupabaseMutationRpc<unknown>(subject,'get_stripe_sandbox_paid_video_playback',{p_video_id:videoId});
   assertAccountBoundSupabaseMutationSubjectCurrent(subject);
   return !r.error&&valid()?descriptor(r.data,videoId):null;};
  const d=await read();if(!d)throw Error('playback_authority_unavailable');
  const current=async()=>{const latest=await read();return !!latest&&JSON.stringify(latest)===JSON.stringify(d);};
  const headers={Authorization:`Bearer ${subject.accessToken}`,apikey:SUPABASE_ANON_KEY,'X-Chillywood-Auth-Session':subject.authority.sessionGeneration};
  const uri=`${SUPABASE_URL}/functions/v1/stripe-sandbox-paid-video-playback/${videoId}/${d.grantId}`;
  let source:Source;
  if(Platform.OS==='web'){
   binding=await bindStripeSandboxPlaybackWorker({endpoint:uri,headers,descriptor:d,signal:abort.signal,onLost:()=>{if(!retired)abort.abort();}});
   if(!valid()||!await current())throw Error('playback_authority_unavailable');source={uri:binding.uri,headers:{}};
  }else{if(!await current())throw Error('playback_authority_unavailable');source={uri,headers};}
  if(!valid())return;clearTimeout(timer);setState({videoId,source,error:null});
  let checking=false;
  poll=setInterval(()=>{if(checking)return;checking=true;
   const deadline=setTimeout(()=>{abort.abort();if(!retired)revoke();},15000);
   void current().then(ok=>{if(!ok&&!retired){abort.abort();revoke();}else if(ok&&!retired){binding?.renew();}}).catch(()=>{if(!retired){abort.abort();revoke();}})
    .finally(()=>{checking=false;clearTimeout(deadline);});
  },15000);
 })().catch(error=>{if(!retired){revoke();setState({videoId,source:null,error:error instanceof Error?error.message:'playback_unavailable'});}}).finally(()=>clearTimeout(timer));
 return()=>{retired=true;abort.abort();clearTimeout(timer);if(poll)clearInterval(poll);binding?.release();};
 },[videoId,revision]);
 return state?.videoId===videoId?{source:state.source,error:state.error}:{source:null,error:null};
}
export function useStripeSandboxPaidVideoPlayback(videoId:string|null):Source|null{return useStripeSandboxPaidVideoPlaybackState(videoId).source;}
