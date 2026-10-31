import test from 'node:test';
import assert from 'node:assert/strict';
import {reservedRoomClient,reservedRoomDeclarations} from './helpers/reserved-room-client-runtime.mjs';
import {sourceComposition,mountComposition} from './helpers/live-recovery-mounted-source.mjs';

const claim='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
const rawStage=(patch={})=>({allowed:true,reason:'verified_reserved_room_seat',viewerOnly:true,
  seatEligible:true,seatApproved:false,hostAuthority:false,grantsPublish:false,requiresHostApproval:true,
  reservedSeatClaimId:claim,admissionIncluded:true,sameAccountRejoin:true,partyId:'ROOM',roomSessionId:session,...patch});
const rawParty=(patch={})=>({allowed:true,reason:'verified_reserved_room_admission',requiresPurchase:false,
  reservedSeatClaimId:claim,admissionIncluded:true,grantsPublish:false,partyId:'ROOM',roomSessionId:session,...patch});

test('production reserved-seat readers retain exact claims without inventing native offers or publish authority',async()=>{
  const stage=await reservedRoomClient('_lib/liveWatchPartyMoney.ts',rawStage()).readLiveWatchPartyMoneyAccess('ROOM');
  assert.equal(stage.allowed,true);assert.equal(stage.seatReviewState,'eligible');assert.equal(stage.seatOfferId,null);
  assert.equal(stage.reservedSeatClaimId,claim);assert.equal(stage.grantsPublish,false);assert.equal(stage.seatApproved,false);
  assert.equal(await reservedRoomClient('_lib/liveWatchPartyMoney.ts',rawStage({partyId:'OTHER'})).readLiveWatchPartyMoneyAccess('ROOM'),null);
  for(const patch of [{reservedSeatClaimId:null},{roomSessionId:null},{admissionIncluded:false},{grantsPublish:true},
    {requiresHostApproval:false},{hostAuthority:true},{seatEligible:false},{viewerOnly:false},{seatOfferId:claim}]){
    assert.equal(reservedRoomClient('_lib/liveWatchPartyMoney.ts',null).parseLiveWatchPartyMoneyAccess(rawStage(patch)),null,JSON.stringify(patch));
  }
  const party=await reservedRoomClient('_lib/paidWatchPartyTickets.ts',rawParty()).resolvePaidWatchPartyTicketAccess('ROOM');
  assert.equal(party.allowed,true);assert.equal(party.ticketId,null);assert.equal(party.offer,null);assert.equal(party.reservedSeatClaimId,claim);
  for(const patch of [{partyId:'OTHER'},{roomSessionId:null},{reservedSeatClaimId:null},{grantsPublish:true},
    {admissionIncluded:false},{requiresPurchase:true},{ticketId:claim}]){
    assert.equal((await reservedRoomClient('_lib/paidWatchPartyTickets.ts',rawParty(patch)).resolvePaidWatchPartyTicketAccess('ROOM')).allowed,false,JSON.stringify(patch));
  }
});

test('production Party viewer admission recognizes only exact parsed reserved claims',async()=>{
  const {paidWatchPartyTicketAllowsExactRoomViewerAccess:allows}=reservedRoomDeclarations('_lib/watchParty.ts',
    ['UUID_REGEX','paidWatchPartyTicketAllowsExactRoomViewerAccess']);
  const access=await reservedRoomClient('_lib/paidWatchPartyTickets.ts',rawParty()).resolvePaidWatchPartyTicketAccess('ROOM');
  assert.equal(allows(access,'ROOM'),true);assert.equal(allows(access,'OTHER'),false);
  for(const patch of [{roomSessionId:null},{reservedSeatClaimId:null},{allowed:false},{requiresPurchase:true},{offer:{id:claim}}])
    assert.equal(allows({...access,...patch},'ROOM'),false,JSON.stringify(patch));
});

test('actual token role resolver requires fresh membership and host approval after reserved-seat authority',async()=>{
  const parser=reservedRoomClient('supabase/functions/_shared/watch-party-livekit-authority.ts',null);
  const {resolveEffectiveParticipantRole:resolve}=reservedRoomDeclarations('supabase/functions/livekit-token/index.ts',[
    'ACTIVE_MEMBERSHIP_STATES','WATCH_PARTY_MEMBERSHIP_ACTIVE_WINDOW_MS','LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS',
    'sanitizeText','parseTimeMillis','firstValidTimeMillis','isRecentTime','normalizeWatchPartyMembership',
    'isFreshWatchPartyMembership','isWatchPartySpeakerSeatMembership','membershipSeatMillis',
    'getAuthorizedWatchPartySpeakerSeatIds','fetchWatchPartyMemberships','resolveCurrentWatchPartyLiveKitAuthority',
    'resolveEffectiveParticipantRole'],{parseWatchPartyLiveKitAuthorityDecision:parser.parseWatchPartyLiveKitAuthorityDecision});
  const authority={allowed:true,paidSeatRequired:true,speakerEligible:true,hostAuthority:false,grantsPublish:false,
    reason:'verified_reserved_room_seat',reservedSeatClaimId:claim,partyId:'ROOM',roomSessionId:session};
  const row={user_id:'buyer',role:'viewer',stage_role:'viewer',can_speak:false,membership_state:'active',last_seen_at:new Date().toISOString()};
  const run=(patch={},member={})=>resolve({rpc:async()=>({data:{...authority,expiresAt:new Date(Date.now()+30000).toISOString(),...patch}}),
    from:()=>({select:()=>({eq:async()=>({data:[{...row,...member}],error:null})})})},
    {kind:'watch-party',roomName:'ROOM',hostUserId:'host'},'live-stage','speaker','buyer',session,{});
  const waiting=await run();assert.equal(waiting.ok,true);assert.equal(waiting.canPublish,false);assert.equal(waiting.participantRole,'viewer');
  const approved=await run({}, {stage_role:'speaker',can_speak:true});assert.equal(approved.canPublish,true);assert.equal(approved.participantRole,'speaker');
  assert.equal((await run({}, {stage_role:'speaker',can_speak:true,is_muted:true})).canPublish,false);
  assert.equal((await run({speakerEligible:false},{stage_role:'speaker',can_speak:true})).participantRole,'viewer','Party admission never promotes');
  assert.equal((await run({partyId:'OTHER'})).ok,false);
  assert.equal((await run({}, {last_seen_at:new Date(Date.now()-60000).toISOString()})).ok,false);
  assert.equal((await run({}, {membership_state:'removed'})).ok,false);
});

test('React-mounted actual Stage eligibility/button computation recognizes a reserved spot but waits for host approval',async t=>{
  const parser=reservedRoomClient('_lib/liveWatchPartyMoney.ts',null).parseLiveWatchPartyMoneyAccess;
  const source=sourceComposition('app/watch-party/live-stage/[partyId].tsx','WatchPartyLiveStageScreen');
  source.declaration('currentUserHasLiveSeatRequestEligibility');
  source.declaration('stageSeatRequestButtonDisabled');
  const values={liveMoneyAccess:parser(rawStage()),currentStageParticipantState:{role:'viewer'},currentStageSeatRequestPending:false,
    canRequestSeat:state=>state.role==='viewer'};
  const Component=source.compile({inputs:Object.keys(values),outputs:['currentUserHasLiveSeatRequestEligibility','stageSeatRequestButtonDisabled']});
  const mounted=await mountComposition(t,Component,values);
  assert.equal(mounted.current.currentUserHasLiveSeatRequestEligibility,true);
  assert.equal(mounted.current.stageSeatRequestButtonDisabled,false,'reserved guest may request host approval');
  await mounted.update({currentStageSeatRequestPending:true});assert.equal(mounted.current.stageSeatRequestButtonDisabled,true);
  await mounted.update({currentStageSeatRequestPending:false,currentStageParticipantState:{role:'speaker'}});
  assert.equal(mounted.current.stageSeatRequestButtonDisabled,true,'approved speaker does not request another spot');
  await mounted.update({liveMoneyAccess:null,currentStageParticipantState:{role:'viewer'}});
  assert.equal(mounted.current.currentUserHasLiveSeatRequestEligibility,false);assert.equal(mounted.current.stageSeatRequestButtonDisabled,true);
});
