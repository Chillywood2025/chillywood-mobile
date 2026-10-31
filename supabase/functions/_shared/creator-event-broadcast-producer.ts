// Normal event Egress orchestration. D7D proof sessions never enter this lane.
// All transport is injected at this boundary so tests execute the production
// state machine without contacting a provider or reading credentials.
export type EventBroadcastSource = {
  allowed: boolean; reason?: string; eventId: string; hostId: string; roomId: string; broadcastId: string;
  state: string; attemptId: string | null; egressId: string | null; outputPrefix: string | null;
  stopAt: string | null; serverId?: string; assignmentId?: string; claimed?: boolean; privateOrigin?: string; creatorSessionId?: string;
};
// Provider facts, not observation times or a guarantee of individual playback.
export type EventBroadcastTiming = { startedAtNs: string | null; endedAtNs: string | null;
  segmentsStartedAtNs: string | null; segmentsEndedAtNs: string | null; durationNs: string | null;
  segmentCount: string | null; interrupted: boolean };
export type EventBroadcastProviderInfo = { egressId: string; roomId: string; outputPrefix: string; status: 'starting' | 'active' | 'ending' | 'complete' | 'failed'; timing?: EventBroadcastTiming };
export type EventBroadcastReceipt = { status: 'starting' | 'active' | 'ending' | 'stopped' | 'failed' | 'uncertain'; egressId: string | null;
  sourceUrl?: string; playlistPath?: string; privateOriginVerified?: boolean; timing?: EventBroadcastTiming; coverageInterrupted?: boolean };
export type EventBroadcastProducerDependencies = {
  read: (eventId: string, userId: string, sessionId: string, action: string) => Promise<EventBroadcastSource>;
  claim: (source: EventBroadcastSource, userId: string, sessionId: string) => Promise<EventBroadcastSource>;
  receipt: (source: EventBroadcastSource, receipt: EventBroadcastReceipt) => Promise<void>;
  costAllowed: () => Promise<boolean>;
  hostPresent: (source: EventBroadcastSource, sessionId: string) => Promise<boolean>;
  list: (source: EventBroadcastSource) => Promise<EventBroadcastProviderInfo[]>;
  start: (source: EventBroadcastSource) => Promise<EventBroadcastProviderInfo>;
  stop: (source: EventBroadcastSource, egressId: string) => Promise<EventBroadcastProviderInfo>;
  verifyPrivateOrigin: (source: EventBroadcastSource, replay?: boolean) => Promise<{sourceUrl: string; playlistPath: string; coverageInterrupted?: boolean} | null>;
  now?: () => number;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safe = (source: EventBroadcastSource, state: string, reason: string) => ({ creatorEventId: source.eventId,
  state, reason, canStart: state === 'active', rawHlsUrlReturned: false, fullRoomTokenForSpectators: false });
const validSource = (source: EventBroadcastSource, eventId: string, userId: string) => source.allowed === true
  && source.eventId === eventId && source.hostId === userId && UUID.test(source.broadcastId)
  && /^EVENT[A-F0-9]{32}$/.test(source.roomId);
const exactInfo = (source: EventBroadcastSource, info: EventBroadcastProviderInfo) => !!source.attemptId && UUID.test(source.attemptId)
  && source.outputPrefix === `creator-events/${source.broadcastId}/${source.attemptId}`
  && info.roomId === source.roomId && info.outputPrefix === source.outputPrefix && /^EG_[A-Za-z0-9_-]+$/.test(info.egressId)
  && (!source.egressId || info.egressId === source.egressId);

export async function stopCreatorEventBroadcast(source: EventBroadcastSource, deps: EventBroadcastProducerDependencies) {
  // A missing ListEgress result cannot establish completion: LiveKit omits
  // completed egress, and a lost start response may still be executing.
  const candidates = (await deps.list(source)).filter(info => exactInfo(source, info));
  if (candidates.length > 1 || (candidates.length === 0 && !source.egressId)) {
    await deps.receipt(source, {status:'uncertain',egressId:source.egressId});
    return safe(source, 'uncertain', 'provider_stop_requires_reconciliation');
  }
  const terminal=candidates[0]&&(candidates[0].status==='complete'||candidates[0].status==='failed')?candidates[0]:null;
  const stopped = terminal??await deps.stop(source, source.egressId || candidates[0].egressId);
  if (!exactInfo(source, stopped)) throw new Error('event_broadcast_provider_identity_mismatch');
  if (stopped.status !== 'complete' && stopped.status !== 'failed') {
    await deps.receipt(source, {status:stopped.status==='ending'?'ending':'uncertain',egressId:stopped.egressId,timing:stopped.timing});
    return safe(source, 'uncertain', 'provider_stop_pending');
  }
  const replay=stopped.status==='complete'?await deps.verifyPrivateOrigin(source,true).catch(()=>null):null;
  const state=stopped.status==='failed'?'failed':'stopped';
  await deps.receipt(source, {status:state,egressId:stopped.egressId,timing:stopped.timing,...(replay?{...replay,privateOriginVerified:true}:{})});
  return safe(source, state, 'provider_stop_confirmed');
}

export async function runCreatorEventBroadcast(action: 'start' | 'refresh' | 'stop', eventId: string,
  actor: {userId:string;sessionId:string}, deps: EventBroadcastProducerDependencies) {
  if (!UUID.test(eventId) || !UUID.test(actor.userId) || !UUID.test(actor.sessionId)) throw new Error('event_broadcast_request_invalid');
  let source = await deps.read(eventId,actor.userId,actor.sessionId,action);
  if(source.eventId===eventId&&source.state==='prepared'&&source.reason==='event_broadcast_not_started')return safe(source,'prepared','event_broadcast_not_started');
  if (!validSource(source,eventId,actor.userId)) return safe({...source,eventId},'unavailable',source.reason ?? 'event_broadcast_authority_required');
  // Confirmed terminal receipts remain readable after the host stops publishing.
  // Do not turn persisted completion into uncertainty when ListEgress omits it.
  if(source.state==='stopped'||source.state==='failed')return safe(source,source.state,'provider_stop_confirmed');
  if(action==='stop'&&!source.attemptId)return safe(source,'prepared','event_broadcast_not_started');
  if (action === 'stop') return stopCreatorEventBroadcast(source,deps);
  if (!(await deps.costAllowed())) return safe(source,'unavailable','event_broadcast_cost_guard_blocked');
  if (!(await deps.hostPresent(source,actor.sessionId))) return safe(source,'unavailable','event_broadcast_host_tracks_required');
  if (source.stopAt && Date.parse(source.stopAt) <= (deps.now ?? Date.now)()) return stopCreatorEventBroadcast(source,deps);
  if (!source.attemptId) {
    if (action !== 'start') return safe(source,'prepared','event_broadcast_not_started');
    source = await deps.claim(source,actor.userId,actor.sessionId);
    if (!validSource(source,eventId,actor.userId)) return safe({...source,eventId},'unavailable',source.reason ?? 'event_broadcast_authority_required');
    if (!(await deps.hostPresent(source,actor.sessionId)) || !(await deps.costAllowed())) {
      await deps.receipt(source,{status:'uncertain',egressId:source.egressId});
      return safe(source,'uncertain','event_broadcast_authority_changed_before_dispatch');
    }
  }
  if (!source.attemptId || !source.outputPrefix || !source.stopAt || !Number.isFinite(Date.parse(source.stopAt))) throw new Error('event_broadcast_attempt_invalid');
  try {
    const candidates = (await deps.list(source)).filter(info => exactInfo(source,info));
    if (candidates.length > 1) throw new Error('event_broadcast_provider_identity_ambiguous');
    let info = candidates[0];
    if (!info) {
      if (!source.claimed || source.egressId || action !== 'start') {
        await deps.receipt(source,{status:'uncertain',egressId:source.egressId});
        return safe(source,'uncertain','provider_start_requires_reconciliation');
      }
      // The database claim is issued once. A timeout never repeats this call.
      info = await deps.start(source);
    }
    if (!exactInfo(source,info)) throw new Error('event_broadcast_provider_identity_mismatch');
    source = {...source,egressId:info.egressId};
    // A refresh can observe natural provider completion before the deadline
    // worker does. Use the same terminal/private-index verifier in both paths.
    if (info.status === 'complete') return stopCreatorEventBroadcast(source,deps);
    if (info.status !== 'active') {
      await deps.receipt(source,{status:info.status==='failed'?'failed':info.status==='ending'?'ending':'starting',egressId:info.egressId,timing:info.timing});
      return safe(source,info.status==='failed'?'failed':'starting','provider_broadcast_not_active');
    }
    const origin = await deps.verifyPrivateOrigin(source);
    if (!origin) {
      await deps.receipt(source,{status:'starting',egressId:info.egressId,timing:info.timing});
      return safe(source,'starting','private_playback_verification_required');
    }
    // Repeat actor and room authority after provider IO; receipt SQL also
    // rechecks approval/event/room/cap before any playable projection.
    const current = await deps.read(eventId,actor.userId,actor.sessionId,'refresh');
    if (!validSource(current,eventId,actor.userId) || current.attemptId !== source.attemptId
      || !(await deps.hostPresent(current,actor.sessionId)) || !(await deps.costAllowed())) {
      return stopCreatorEventBroadcast({...source,egressId:info.egressId},deps);
    }
    await deps.receipt(source,{status:'active',egressId:info.egressId,timing:info.timing,...origin,privateOriginVerified:true});
    return safe(source,'active','verified_event_broadcast_ready');
  } catch {
    if(source.egressId){
      try{return await stopCreatorEventBroadcast(source,deps);}catch{/* Durable cleanup below retains the exact provider identity. */}
    }
    await deps.receipt(source,{status:'uncertain',egressId:source.egressId});
    return safe(source,'uncertain','provider_start_requires_reconciliation');
  }
}
