// Source boundary witness only. Executable transaction/mounted regressions are
// separate; these checks are not installed-device or provider-delivery proof.
import {readFileSync} from 'node:fs';
export function atomicChatCallStartFindings({chat,calls,migration}) {
  const findings=[];
  if(!chat.includes('const candidate = await prepareChatCallRoomCandidate();')
    || !chat.includes('createRoomCapturePolicy: candidate.capturePolicy')
    || /\b(?:createCommunicationRoom|endCommunicationRoom)\s*\(/u.test(chat))
    findings.push('direct Chat start must use atomic allocation and never speculatively End a candidate');
  if(!calls.includes('input.createRoomCapturePolicy ? "start_chilly_chat_call" : "begin_chilly_chat_call"')
    || !calls.includes('sameAccountSessionAuthority(initiatingAuthority, getCurrentAccountSessionAuthoritySnapshot())'))
    findings.push('atomic client must retain exact-session authority and old explicit API compatibility');
  const allocation=migration.indexOf('insert into public.communication_rooms(');
  const admission=migration.indexOf('v_result:=public.begin_chilly_chat_call(p_thread_id,v_room,v_type);');
  if(allocation<0 || admission<allocation || /\bexception\s+when\b/iu.test(migration)
    || !migration.includes("values(v_room,v_room,v_actor::text,'active','open',v_capture);"))
    findings.push('direct Chat candidate and begin must share an unswallowed transaction with open access');
  if(!migration.includes('public.whole_app_exact_current_session_authority_internal()')
    || !migration.includes('not public.can_access_chat_thread(p_thread_id)')
    || !migration.includes('v_request.session_id<>v_session')
    || !migration.includes('v_request.call_type<>v_type')
    || !migration.includes('v_request.capture_policy<>v_capture'))
    findings.push('atomic server must bind session, thread, mode and capture policy');
  return findings;
}
export function readAtomicChatCallStartFindings() {
  const read=path=>readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');
  return atomicChatCallStartFindings({chat:read('_lib/chat.ts'),calls:read('_lib/chillyChatCalls.ts'),
    migration:read('supabase/migrations/20261031204321_atomic_chilly_chat_call_candidate.sql')});
}
