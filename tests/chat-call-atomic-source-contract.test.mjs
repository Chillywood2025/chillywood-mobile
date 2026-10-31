import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {atomicChatCallStartFindings} from '../scripts/lib/chat-call-atomic-source-contract.mjs';
const read=path=>readFileSync(path,'utf8');
const sources={chat:read('_lib/chat.ts'),calls:read('_lib/chillyChatCalls.ts'),migration:read('supabase/migrations/20261031204321_atomic_chilly_chat_call_candidate.sql')};
test('atomic source witness requires unchanged runtime authority boundaries',()=>assert.deepEqual(atomicChatCallStartFindings(sources),[]));
for(const [field,from,to] of [
  ['chat','// A definitive rejection','await endCommunicationRoom(roomId, currentUserId); // A definitive rejection'],
  ['chat','const candidate = await prepareChatCallRoomCandidate();','const candidate = await createCommunicationRoom();'],
  ['calls','input.createRoomCapturePolicy ? "start_chilly_chat_call" : "begin_chilly_chat_call"','"begin_chilly_chat_call"'],
  ['calls','sameAccountSessionAuthority(initiatingAuthority, getCurrentAccountSessionAuthoritySnapshot())','true'],
  ['migration',"'active','open',v_capture","'active','premium',v_capture"],
  ['migration','v_result:=public.begin_chilly_chat_call(p_thread_id,v_room,v_type);','v_result:=null;'],
  ['migration','return v_result;','return v_result; exception when others then return null;'],
  ['migration','v_request.session_id<>v_session','false'],
  ['migration','v_request.call_type<>v_type','false'],
  ['migration','v_request.capture_policy<>v_capture','false'],
])test(`atomic source witness rejects ${field} mutation: ${from}`,()=>{
  assert.ok(sources[field].includes(from));
  assert.ok(atomicChatCallStartFindings({...sources,[field]:sources[field].replace(from,to)}).length>0);
});
