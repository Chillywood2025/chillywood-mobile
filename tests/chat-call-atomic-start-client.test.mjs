import assert from 'node:assert/strict';
import test from 'node:test';
import {loadStubbed} from './customer-experience-adversarial-helpers.mjs';
import {isAccountBoundSupabaseRpcOutcomeAmbiguous} from '../_lib/accountBoundSupabaseRpc.mjs';

const original={userId:'caller',accountId:'caller',sessionGeneration:'first',state:'ACTIVE',restoreOnly:false};
const input={actorUserId:'caller',threadId:'thread',communicationRoomId:'ATOMIC001',callType:'video',createRoomCapturePolicy:'host_managed'};
function fixture({outcome='success',replacementAt=null,readable=true}={}) {
  let current=original;let reads=0;const requests=[];
  const invite={id:'invite',thread_id:'thread',communication_room_id:'ATOMIC001',caller_user_id:'caller',callee_user_id:'callee',
    call_type:'video',status:'ringing',chat_call_media_provider:'livekit',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+45000).toISOString()};
  const api=loadStubbed('_lib/chillyChatCalls.ts',{
    './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>current,readCurrentAccountSessionAuthority:async()=>current,
      sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration&&a.accountId===b.accountId&&a.state===b.state},
    './accountBoundSupabaseMutation':{AccountBoundSupabaseMutationError:class extends Error{},isAccountBoundSupabaseMutationOutcomeAmbiguous:isAccountBoundSupabaseRpcOutcomeAmbiguous,
      runCurrentAccountBoundSupabaseMutationRpc:async(name,args,actor)=>{
        requests.push({name,args,actor});if(replacementAt==='response')current={...original,sessionGeneration:'replacement'};
        if(outcome==='missing')return {data:null,error:{code:'PGRST202',message:'missing function'}};
        if(outcome==='unknown')return {data:null,error:{code:'account_bound_rpc_outcome_unknown',message:'account_bound_rpc_outcome_unknown'}};
        if(outcome==='malformed')return {data:{unexpected:true},error:null};
        return {data:{created:true,role:'caller',invite},error:null};
      }},
    './supabase':{supabase:{from:table=>{
      assert.equal(table,'chat_call_invites');const q={select:()=>q,eq:(key,value)=>{assert.equal(key,'communication_room_id');assert.equal(value,input.communicationRoomId);return q;},order:()=>q,limit:()=>q,
        returns:async()=>{reads++;if(replacementAt==='read')current={...original,sessionGeneration:'replacement'};return {data:readable?[invite]:null,error:null};}};return q;
    }}},
  });return {api,requests,reads:()=>reads};
}
for(const outcome of ['success','unknown','malformed'])test(`atomic ${outcome} reply preserves exact candidate without duplicate admission`,async()=>{
  const f=fixture({outcome});const result=await f.api.beginChillyChatCall(input);
  assert.equal(result.invite.id,'invite');assert.equal(result.created,true);
  assert.deepEqual(f.requests,[{name:'start_chilly_chat_call',actor:'caller',args:{p_call_type:'video',p_communication_room_id:'ATOMIC001',p_thread_id:'thread',p_capture_policy:'host_managed'}}]);
  assert.equal(f.reads(),outcome==='success'?0:1);
});
for(const replacementAt of ['response','read'])test(`atomic unknown reply cannot cross session replacement during ${replacementAt}`,async()=>{
  const f=fixture({outcome:'unknown',replacementAt});await assert.rejects(f.api.beginChillyChatCall(input));
  assert.equal(f.requests.length,1);assert.equal(f.reads(),replacementAt==='response'?0:1);
});
for(const outcome of ['missing','unknown','malformed'])test(`unconfirmed ${outcome} never falls back to old allocate or begin API`,async()=>{
  const f=fixture({outcome,readable:false});await assert.rejects(f.api.beginChillyChatCall(input));
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].name,'start_chilly_chat_call');
});
test('direct call candidate preparation reads capture defaults but writes no room',async()=>{
  let creates=0;
  const api=loadStubbed('_lib/communication.ts',{
    'expo-constants':{default:{}},'react-native':{Platform:{OS:'android'}},
    './appConfig':{readAppConfig:async()=>({}),resolveRoomDefaultConfig:()=>({communication:{capturePolicy:'best_effort'}})},
    './userData':{readUserProfile:async()=>({defaultCommunicationCapturePolicy:'host_managed'})},
    './roomRules':{normalizeCapturePolicy:value=>value==='host_managed'?'host_managed':'best_effort'},
    './watchParty':{createPartyIdentifier:()=>{creates++;return 'CANDIDATE';}},
    './supabase':{supabase:{from:()=>{throw Error('candidate preparation must not write');}}},
  });
  assert.deepEqual(await api.prepareChatCallRoomCandidate(),{roomId:'CANDIDATE',capturePolicy:'host_managed'});assert.equal(creates,1);
});
