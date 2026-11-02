import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {assertLiveKitAuthoritativeRoomSelect,assertPublicRoomCountAuthority} from '../scripts/lib/live-room-source-authority-contract.mjs';
const livekit=fs.readFileSync('supabase/functions/livekit-token/index.ts','utf8');
test('actual versioned LiveKit room query retains exact source, access, liveness and lifecycle binding',()=>{
  assertLiveKitAuthoritativeRoomSelect(livekit);
  const selection='party_id,host_user_id,room_type,content_access_rule,is_active,started_at,updated_at,last_activity_at,room_generation,host_settings_revision,discovery_paused';
  for(const field of selection.split(',')) assert.throws(()=>assertLiveKitAuthoritativeRoomSelect(livekit.replace(selection,selection.split(',').filter(f=>f!==field).join(','))),assert.AssertionError,field);
  for(const [from,to] of [['.from("watch_party_rooms")','.from("communication_rooms")'],['.eq("party_id", roomName)','.eq("party_id", "FOREIGN")'],[`.select("${selection}")`,'.select("*")']])
    assert.throws(()=>assertLiveKitAuthoritativeRoomSelect(livekit.replaceAll(from,to)+`\n// ${from}`),assert.AssertionError,`comment cannot replace executable authority: ${from}`);
});
test('actual mounted count consumers use canonical bounded RPC and reject raw room resurrection',()=>{
  const sources={home:fs.readFileSync('app/(tabs)/index.tsx','utf8'),explore:fs.readFileSync('app/(tabs)/explore.tsx','utf8'),title:fs.readFileSync('app/title/[id].tsx','utf8'),helper:fs.readFileSync('_lib/publicPartyRoomCounts.ts','utf8')};
  assertPublicRoomCountAuthority(sources);
  for(const key of ['home','explore','title']) assert.throws(()=>assertPublicRoomCountAuthority({...sources,[key]:sources[key]+'\nsupabase.from("watch_party_rooms").select("party_id");'}),assert.AssertionError,key);
  for(const key of ['explore','title']) assert.throws(()=>assertPublicRoomCountAuthority({...sources,[key]:sources[key].replaceAll('usePublicPartyRoomCounts(', 'unsafeCount(')}),assert.AssertionError,key);
  assert.throws(()=>assertPublicRoomCountAuthority({...sources,helper:sources.helper.replace('rpc("read_public_party_room_counts"','rpc("unsafe_count"')}),assert.AssertionError);
  assert.throws(()=>assertPublicRoomCountAuthority({...sources,helper:sources.helper.replace('.abortSignal(signal)','')}),assert.AssertionError);
});
