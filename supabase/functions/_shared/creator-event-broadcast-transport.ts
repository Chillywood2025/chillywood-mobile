import { AccessToken, RoomServiceClient } from 'npm:livekit-server-sdk@2';
import { createInspectionOriginReader } from './content-inspection-private-origin.ts';
import { readLiveKitParticipantSessionGeneration } from './livekit-session-generation.ts';
import type { EventBroadcastProviderInfo, EventBroadcastSource } from './creator-event-broadcast-producer.ts';

type Row = Record<string, any>;
type Admin = {from:(table:string)=>any};
type Output = {provider:'s3';endpoint:string;bucket:string;region:string;accessKeyId:string;secretAccessKey:string};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
export function eventBroadcastOutputConfig(env:(name:string)=>string|undefined): Output {
  const value = (suffix:string) => text(env(`EGRESS_OUTPUT_${suffix}`)) || text(env(`S3_${suffix}`));
  const config:Output={provider:'s3',endpoint:value('ENDPOINT'),bucket:value('BUCKET'),region:value('REGION'),accessKeyId:value('ACCESS_KEY_ID'),secretAccessKey:value('SECRET_ACCESS_KEY')};
  if(Object.values(config).some(value=>!value))throw new Error('event_broadcast_output_not_configured');
  const endpoint=new URL(config.endpoint);
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash
    || !['','/'].includes(endpoint.pathname)||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket))throw new Error('event_broadcast_output_not_configured');
  return config;
}

export function parseEventEgressInfo(value:unknown): EventBroadcastProviderInfo | null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Row, request=raw.egress, outputs=request?.outputs;
  const field=(row:Row|undefined,snake:string,camel:string):unknown=>
    row?.[snake]!==undefined&&row?.[camel]!==undefined&&row[snake]!==row[camel]?null:row?.[snake]??row?.[camel];
  // Normal StartEgress only. Never accept a D7D/legacy composite receipt as
  // evidence for this producer, even if a caller supplied a matching room.
  const segments=Array.isArray(outputs)&&outputs.length===1?outputs[0]?.segments:null;
  const filename=text(field(segments,'filename_prefix','filenamePrefix'));
  const prefix=filename.endsWith('/segment')?filename.slice(0,-8):'';
  const status=({0:'starting',1:'active',2:'ending',3:'complete',4:'failed',5:'failed',6:'failed',
    EGRESS_STARTING:'starting',EGRESS_ACTIVE:'active',EGRESS_ENDING:'ending',EGRESS_COMPLETE:'complete',
    EGRESS_FAILED:'failed',EGRESS_ABORTED:'failed',EGRESS_LIMIT_REACHED:'failed'} as Record<string,EventBroadcastProviderInfo['status']>)[String(raw.status??0)];
  const egressId=text(field(raw,'egress_id','egressId')),roomId=text(field(raw,'room_name','roomName'));
  if(!status||!/^EG_[A-Za-z0-9_-]+$/.test(egressId)||!/^EVENT[A-F0-9]{32}$/.test(roomId)
    || !/^creator-events\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(prefix)
    || text(field(request,'room_name','roomName'))!==roomId
    || text(field(segments,'live_playlist_name','livePlaylistName'))!==`${prefix}/live.m3u8`)return null;
  // ProtoJSON int64 values must stay decimal strings: JS numbers lose nanos.
  // Conflicting aliases, absent/zero/unsafe values cannot become coverage.
  const integer=(value:unknown):string|null=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)
    &&BigInt(value)<=9223372036854775807n?value:null;
  const results=field(raw,'segment_results','segmentResults');
  const segment=Array.isArray(results)&&results.length===1?results[0]:null;
  const bound=segment&&field(segment,'playlist_name','playlistName')===`${prefix}/index.m3u8`
    &&field(segment,'live_playlist_name','livePlaylistName')===`${prefix}/live.m3u8`;
  const zero=(value:unknown)=>value===undefined||value===0||value==='0';
  const empty=(value:unknown)=>value===undefined||(typeof value==='string'&&!value.trim());
  const backup=field(raw,'backup_storage_used','backupStorageUsed');
  return {egressId,roomId,outputPrefix:prefix,status,timing:{
    startedAtNs:integer(field(raw,'started_at','startedAt')),endedAtNs:integer(field(raw,'ended_at','endedAt')),
    segmentsStartedAtNs:bound?integer(field(segment,'started_at','startedAt')):null,
    segmentsEndedAtNs:bound?integer(field(segment,'ended_at','endedAt')):null,
    durationNs:bound?integer(segment.duration):null,segmentCount:bound?integer(field(segment,'segment_count','segmentCount')):null,
    interrupted:!empty(raw.error)||!empty(raw.details)||!zero(field(raw,'error_code','errorCode'))
      ||!zero(field(raw,'retry_count','retryCount'))||!(backup===undefined||backup===false),
  }};
}

export function createEventBroadcastTransport(admin:Admin,env:(name:string)=>string|undefined,request:typeof fetch=fetch) {
  const required=(key:string)=>{const value=text(env(key));if(!value)throw new Error('event_broadcast_provider_not_configured');return value;};
  const endpoint=async(source:EventBroadcastSource)=>{
    if(!source.serverId||!source.assignmentId)throw new Error('event_broadcast_assignment_required');
    const assignment=await admin.from('livekit_room_assignments').select('assigned_server_id,app_room_id,livekit_room_name').eq('id',source.assignmentId).maybeSingle();
    if(assignment.error||assignment.data?.assigned_server_id!==source.serverId||assignment.data?.app_room_id!==source.roomId||assignment.data?.livekit_room_name!==source.roomId)throw new Error('event_broadcast_assignment_changed');
    const server=await admin.from('livekit_servers').select('public_ws_url,internal_api_url').eq('id',source.serverId).maybeSingle();
    if(server.error||!server.data)throw new Error('event_broadcast_server_unavailable');
    const raw=text(server.data.internal_api_url)||text(env('LIVEKIT_API_URL'))||text(server.data.public_ws_url);
    const url=new URL(raw.replace(/^wss:/,'https:').replace(/^ws:/,'http:'));
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('event_broadcast_server_unavailable');
    return url.toString().replace(/\/$/,'');
  };
  const rpc=async(source:EventBroadcastSource,method:string,body:Row)=>{
    const token=new AccessToken(required('LIVEKIT_API_KEY'),required('LIVEKIT_API_SECRET'),{identity:`creator-event-egress-${source.broadcastId}`,ttl:'60s'});
    token.addGrant({room:source.roomId,roomRecord:true});
    const response=await request(`${await endpoint(source)}/twirp/livekit.Egress/${method}`,{method:'POST',headers:{Authorization:`Bearer ${await token.toJwt()}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15_000),redirect:'error'});
    if(!response.ok){await response.body?.cancel();throw new Error('event_broadcast_provider_request_unconfirmed');}
    return response.json();
  };
  const parse=(value:unknown)=>{const result=parseEventEgressInfo(value);if(!result)throw new Error('event_broadcast_provider_receipt_invalid');return result;};
  return {
    configured:(source?:EventBroadcastSource)=>{const output=eventBroadcastOutputConfig(env);required('LIVEKIT_API_KEY');required('LIVEKIT_API_SECRET');
      if(source&&source.privateOrigin!==`https://${output.bucket}.${new URL(output.endpoint).host}`)throw new Error('event_broadcast_origin_approval_required');},
    hostPresent:async(source:EventBroadcastSource,sessionId:string)=>{
      const client=new RoomServiceClient(await endpoint(source),required('LIVEKIT_API_KEY'),required('LIVEKIT_API_SECRET'));
      const participant=await client.getParticipant(source.roomId,source.hostId);
      const generation=readLiveKitParticipantSessionGeneration(participant.metadata,{roomName:source.roomId,participantIdentity:source.hostId});
      let metadata:Row;try{metadata=JSON.parse(participant.metadata);}catch{return false;}
      return participant.identity===source.hostId&&generation===sessionId&&metadata.participantRole==='host'
        && participant.permission?.canPublish===true&&participant.tracks.some(track=>!track.muted&&(track.type===0||track.type===1));
    },
    list:async(source:EventBroadcastSource)=>{
      const results:EventBroadcastProviderInfo[]=[];let page:unknown;
      for(let n=0;n<10;n++){
        const response=await rpc(source,'ListEgress',{room_name:source.roomId,...(source.egressId?{egress_id:source.egressId}:{}),...(page?{page_token:page}:{})});
        // ProtoJSON omits default-valued repeated fields, so a successful {}
        // is an empty list. It still never proves a prior attempt completed.
        if(!response||typeof response!=='object'||Array.isArray(response)
          ||Object.keys(response).some(key=>!['items','next_page_token','nextPageToken'].includes(key))
          ||(response.items!=null&&!Array.isArray(response.items)))throw new Error('event_broadcast_provider_list_invalid');
        for(const item of response.items??[]){const info=parseEventEgressInfo(item);if(info)results.push(info);}
        page=response.next_page_token??response.nextPageToken;
        if(!page||(typeof page==='object'&&Object.keys(page).length===0))return results;
      }
      throw new Error('event_broadcast_provider_list_incomplete');
    },
    start:async(source:EventBroadcastSource)=>{
      const output=eventBroadcastOutputConfig(env);const prefix=source.outputPrefix;
      if(!prefix||prefix!==`creator-events/${source.broadcastId}/${source.attemptId}`)throw new Error('event_broadcast_output_identity_invalid');
      if(source.privateOrigin!==`https://${output.bucket}.${new URL(output.endpoint).host}`)throw new Error('event_broadcast_origin_approval_required');
      return parse(await rpc(source,'StartEgress',{room_name:source.roomId,template:{layout:'grid'},
        outputs:[{segments:{filename_prefix:`${prefix}/segment`,playlist_name:`${prefix}/index.m3u8`,live_playlist_name:`${prefix}/live.m3u8`,segment_duration:2}}],
        storage:{s3:{access_key:output.accessKeyId,secret:output.secretAccessKey,bucket:output.bucket,endpoint:output.endpoint,region:output.region,force_path_style:true}}}));
    },
    stop:async(source:EventBroadcastSource,egressId:string)=>parse(await rpc(source,'StopEgress',{egress_id:egressId})),
    verifyPrivateOrigin:async(source:EventBroadcastSource,replay=false)=>{
      const output=eventBroadcastOutputConfig(env),origin=new URL(output.endpoint),prefix=source.outputPrefix;
      if(!prefix||prefix!==`creator-events/${source.broadcastId}/${source.attemptId}`||source.privateOrigin!==`https://${output.bucket}.${origin.host}`)return null;
      const playlistPath=`${prefix}/${replay?'index':'live'}.m3u8`,sourceUrl=`https://${output.bucket}.${origin.host}/${playlistPath}`;
      const signed=createInspectionOriginReader(output,request);
      const read=async(path:string)=>{
        // A 403 alone could hide a missing object. Require a successful signed
        // read of the very same object as well; 404 never proves privacy.
        const anonymous=await request(`https://${output.bucket}.${origin.host}/${path}`,{redirect:'error',signal:AbortSignal.timeout(10_000),cache:'no-store'});
        const denied=anonymous.status===403,publiclyReadable=anonymous.ok;await anonymous.body?.cancel();
        if(publiclyReadable)throw new Error('event_broadcast_origin_public');if(!denied)return null;
        const result=await signed({provider:'s3',bucket:output.bucket,objectKey:path},'GET',{},AbortSignal.timeout(10_000));
        if(!result.ok){await result.body?.cancel();return null;}return result;
      };
      const playlist=await read(playlistPath);if(!playlist)return null;
      const content=await playlist.text();if(content.length>256_000||!content.startsWith('#EXTM3U')||(replay&&!content.includes('#EXT-X-ENDLIST')))return null;
      const references=content.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
      if(references.length===0)return null;
      // This output emits plain MPEG-TS segments. Encryption/steering/variant
      // playlists require a separately qualified producer and fail closed.
      if(/#EXT-X-(?:KEY|MAP|STREAM-INF|CONTENT-STEERING)/.test(content))return null;
      for(const reference of references){
        if(!/^[A-Za-z0-9_./-]+\.ts$/.test(reference)||reference.split('/').includes('..'))return null;
        const url=new URL(reference,sourceUrl);if(url.origin!==new URL(sourceUrl).origin||!url.pathname.startsWith(`/${prefix}/`))return null;
      }
      const segment=await read(new URL(references[0],sourceUrl).pathname.slice(1));if(!segment)return null;await segment.body?.cancel();
      // Playable discontinuous output is not uninterrupted interval evidence.
      return {sourceUrl,playlistPath,coverageInterrupted:/#EXT-X-(?:GAP|DISCONTINUITY)(?::|\s|$)/m.test(content)
        ||/#EXT-X-DISCONTINUITY-SEQUENCE:(?!0\s*$)/m.test(content)};
    },
  };
}
