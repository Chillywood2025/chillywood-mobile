// Synthetic approved provider reports; the real broadcast/HLS table guards,
// canonical projector, room policy and invalidation triggers stay installed.
// This is not provider commissioning or a replacement authority function.
export function approvedOrdinaryBroadcastSQL({partyId,hostId,broadcastId,playbackId}){
 const lit=x=>`'${String(x).replaceAll("'","''")}'`;
 return `insert into public.room_broadcast_sessions(id,source_type,source_room_id,host_user_id,channel_user_id,broadcast_status,
 hls_playback_url,playback_url_status,rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket,metadata)
 values(${lit(broadcastId)},'watch_party_room',${lit(partyId)},${lit(hostId)},${lit(hostId)},'active_later',
 'https://example.invalid/ordinary-discovery.m3u8','public_safe_available','creator_owned','public_free',true,true,false,false,'{"d7f_public_safe_approved":true}');
 insert into public.spectator_hls_playback_records(id,broadcast_session_id,source_room_id,host_user_id,visibility,
 playback_status,playlist_path,rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket)
 values(${lit(playbackId)},${lit(broadcastId)},${lit(partyId)},${lit(hostId)},'public','live','ordinary/index.m3u8','creator_owned','public_free',true,true,false,false);`;
}
