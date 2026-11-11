import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { prepareCreatorMoneyPurchaseSubject, invokeCreatorMoneyPurchaseSubjectRpc,
  isCreatorMoneyPurchaseAuthorityCurrent } from './creatorMoneyPurchaseAuthority';
import { subscribeToAccountSessionAuthority } from './accountSessionAuthority';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

type Source = { uri: string; headers: Record<string,string> };
export function useNativeProductionPaidVideoPlayback(videoId: string | null): Source | null {
  const [ready,setReady]=useState<{videoId:string;source:Source}|null>(null);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const retire=()=>{setReady(null);setRevision(value=>value+1);};
    const unsubscribe=subscribeToAccountSessionAuthority(retire);
    const lifecycle=AppState.addEventListener('change',retire);
    return()=>{unsubscribe();lifecycle.remove();};
  },[]);
  useEffect(()=>{
    setReady(null); if(!videoId||AppState.currentState!=='active')return;
    let retired=false;const abort=new AbortController();
    const timer=setTimeout(()=>abort.abort(),15000);
    void(async()=>{
      const subject=await prepareCreatorMoneyPurchaseSubject();
      if(!subject||retired)return;
      const result=await invokeCreatorMoneyPurchaseSubjectRpc<unknown>(subject,'get_native_production_paid_video_playback',{p_video_id:videoId});
      const row=result.data&&typeof result.data==='object'&&!Array.isArray(result.data)?result.data as Record<string,unknown>:null;
      if(result.error||!row||row.protocol!=='native-production-playback-v1'||row.status!=='READY'||row.videoId!==videoId
        ||row.adapter!=='native-production-etag-range-v1'||typeof row.grantId!=='string'
        ||typeof row.assetSha256!=='string'||!/^[0-9a-f]{64}$/.test(row.assetSha256)
        ||!Number.isSafeInteger(row.byteLength)||Number(row.byteLength)<1||retired
        ||!isCreatorMoneyPurchaseAuthorityCurrent(subject.authority))return;
      const headers={Authorization:`Bearer ${subject.accessToken}`,apikey:SUPABASE_ANON_KEY,
        'X-Chillywood-Auth-Session':subject.authority.sessionGeneration};
      const uri=`${SUPABASE_URL}/functions/v1/native-production-paid-video-playback/${encodeURIComponent(videoId)}/${encodeURIComponent(row.grantId)}`;
      const probe=await fetch(uri,{headers:{...headers,Range:'bytes=0-0'},signal:abort.signal,redirect:'error',cache:'no-store'});
      if(probe.status!==206||probe.headers.get('Content-Range')!==`bytes 0-0/${row.byteLength}`
        ||(await probe.arrayBuffer()).byteLength!==1||retired||AppState.currentState!=='active'
        ||!isCreatorMoneyPurchaseAuthorityCurrent(subject.authority))return;
      setReady({videoId,source:{uri,headers}});
    })().catch(()=>{if(!retired)setReady(null);}).finally(()=>clearTimeout(timer));
    return()=>{retired=true;abort.abort();clearTimeout(timer);};
  },[videoId,revision]);
  return ready?.videoId===videoId?ready.source:null;
}
