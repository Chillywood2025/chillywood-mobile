import { readLiveCostGuardTokenDecision } from './live-cost-guard.ts';
import { createEventBroadcastTransport } from './creator-event-broadcast-transport.ts';
import { stopCreatorEventBroadcast, type EventBroadcastProducerDependencies, type EventBroadcastSource } from './creator-event-broadcast-producer.ts';

type Admin = {from:(table:string)=>any;rpc:(name:string,args?:Record<string,unknown>)=>PromiseLike<{data:any;error:unknown}>};
// The existing cost helper treats missing settings as defaults. Retain its
// policy but make transport failures from every settings/event/action query
// explicit instead of interpreting a failed read as an empty history.
function checkedCostQuery(query:any):any {
  const wrapper:any={then:(resolve:any,reject:any)=>Promise.resolve(query).then((result:any)=>{
    if(result.error)throw new Error('event_broadcast_cost_guard_unavailable');return result;
  }).then(resolve,reject)};
  for(const method of ['select','order','limit','maybeSingle','gte','eq'])wrapper[method]=(...args:any[])=>checkedCostQuery(query[method](...args));
  return wrapper;
}
export function createEventBroadcastRuntime(admin:Admin,env:(name:string)=>string|undefined): EventBroadcastProducerDependencies {
  const transport=createEventBroadcastTransport(admin,env);
  const rpc=async(name:string,args:Record<string,unknown>)=>{const result=await admin.rpc(name,args);if(result.error||!result.data)throw new Error('event_broadcast_authority_unavailable');return result.data;};
  return {
    ...transport,
    read:async(eventId,userId,sessionId,action)=>rpc('read_creator_event_broadcast_producer_authority',{
      p_creator_event_id:eventId,p_user_id:userId,p_session_id:sessionId,p_action:action}),
    claim:async(source,userId,sessionId)=>{
      // Missing output credentials fail before the one-time durable dispatch
      // claim, allowing safe preparation/qualification without provider IO.
      transport.configured(source);
      return rpc('claim_creator_event_broadcast_start',{p_creator_event_id:source.eventId,p_user_id:userId,p_session_id:sessionId});
    },
    receipt:async(source,receipt)=>{
      const saved=await rpc('record_creator_event_broadcast_provider_coverage',{
        p_creator_event_id:source.eventId,p_user_id:source.hostId,p_session_id:source.creatorSessionId,
        p_attempt_id:source.attemptId,p_egress_id:receipt.egressId,
        p_provider_status:({starting:'STARTING',active:'ACTIVE',ending:'ENDING',stopped:'COMPLETE',failed:'FAILED',uncertain:'UNKNOWN'} as const)[receipt.status],
        p_source_url:receipt.sourceUrl??null,p_playlist_path:receipt.playlistPath??null,
        p_private_origin_verified:receipt.privateOriginVerified===true,
        p_provider_binding_verified:receipt.status!=='uncertain'&&!!receipt.egressId,
        p_provider_timing:receipt.timing?{...receipt.timing,interrupted:receipt.timing.interrupted||receipt.coverageInterrupted===true}:null,
        p_server_id:source.serverId??null,p_room_name:source.roomId,p_output_prefix:source.outputPrefix,
      });
      if(receipt.status==='active'&&saved.state!=='active')throw new Error('event_broadcast_activation_not_confirmed');
    },
    costAllowed:async()=>{
      // The older shared helper uses defaults on read errors. This new producer
      // requires a successful settings read first and never starts on unknown.
      const settings=await admin.from('admin_live_cost_guard_settings').select('id').order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(settings.error||!settings.data)return false;
      const decision=await readLiveCostGuardTokenDecision({from:(table:string)=>checkedCostQuery(admin.from(table))},'live-stage');
      return !decision.blockNewLiveRooms;
    },
  };
}

export async function runEventBroadcastDeadlineWorker(admin:Admin,deps:EventBroadcastProducerDependencies) {
  const claimed=await admin.rpc('claim_due_creator_event_broadcast_stops',{p_limit:3});
  if(claimed.error||!Array.isArray(claimed.data))throw new Error('event_broadcast_worker_queue_unavailable');
  const results=await Promise.all((claimed.data as EventBroadcastSource[]).map(async source=>{
    try{return await stopCreatorEventBroadcast(source,deps);}catch{
      await deps.receipt(source,{status:'uncertain',egressId:source.egressId});
      return {state:'uncertain'};
    }
  }));
  // A dispatch that cannot complete its cleanup does not advertise a fresh
  // healthy lease that would admit more cost-bearing starts.
  const healthy=results.every(result=>result.state==='stopped'||result.state==='failed');
  if(healthy){const heartbeat=await admin.rpc('heartbeat_creator_event_broadcast_worker');if(heartbeat.error)throw new Error('event_broadcast_worker_heartbeat_unconfirmed');}
  return {processed:results.length,stopped:results.filter(result=>result.state==='stopped'||result.state==='failed').length,healthy};
}
