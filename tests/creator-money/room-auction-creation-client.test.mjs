import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { webcrypto } from "node:crypto";
import ts from "typescript";

const creator = "11111111-1111-4111-8111-111111111111";
const roomSessionId = "22222222-2222-4222-8222-222222222222";
const input = { partyId: "ROOM", sourceKind: "stage_reserved_seat", roomSessionId, startingAmountMinor: 237,
  minIncrementMinor: 25, closesAt: "2099-01-01T10:00:00Z", paymentDeadline: "2099-01-01T11:00:00Z", environment: "test" };
function harness(options = {}) {
  let authority = { userId: creator, sessionGeneration: "one", restoreOnly: false };
  const storage = options.storage ?? new Map(), calls = [];
  const load = (file, imports) => {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,
      {exports,require:name=>{assert.ok(name in imports,name);return imports[name];},Date,Intl,Set,Map,Uint8Array,crypto:webcrypto,Promise,encodeURIComponent});
    return exports;
  };
  const attempts = load("_lib/creatorRoomAuctionCreationAttempt.ts", {
    "@react-native-async-storage/async-storage": {
      getItem:async k=>storage.get(k)??null, setItem:async(k,v)=>{if(options.storageFailure)throw Error("storage unavailable");storage.set(k,v);},
      removeItem:async k=>storage.delete(k),
    }, "react-native-get-random-values":{},
  });
  const api = load("_lib/creatorRoomSeatAuctions.ts", {
    "./creatorRoomAuctionCreationAttempt":attempts,
    "./accountSessionAuthority":{getCurrentAccountSessionAuthoritySnapshot:()=>authority,sameAccountSessionAuthority:(a,b)=>a?.userId===b?.userId&&a?.sessionGeneration===b?.sessionGeneration},
    "./accountBoundSupabaseMutation":{
      captureAccountBoundSupabaseMutationSubject:async()=>({authority:{...authority},accessToken:"test"}),
      invokeAccountBoundSupabaseMutationRpc:async(_subject,name,args)=>{
        calls.push({name,args});
        if(name==="prepare_creator_room_seat_auction")return {error:null,data:{partyId:input.partyId,roomSessionId:options.currentSession??roomSessionId,sourceKind:input.sourceKind,environment:options.mode??"test",serverNow:"2099-01-01T00:00:00Z"}};
        if(options.create)await options.create(args);
        return {error:null,data:{id:"33333333-3333-4333-8333-333333333333",requestId:args.p_request_id,partyId:args.p_party_id,roomSessionId:args.p_expected_room_session_id,
          claimId:"44444444-4444-4444-8444-444444444444",creatorId:creator,sourceKind:args.p_source_kind,startingAmountMinor:args.p_starting_amount_minor,
          minIncrementMinor:args.p_min_increment_minor,nextBidAmountMinor:args.p_starting_amount_minor,highestAmountMinor:null,myBidAmountMinor:null,awardAmountMinor:null,
          closesAt:args.p_closes_at,paymentDeadline:args.p_payment_deadline,latestCheckoutStartAt:"2099-01-01T10:29:00Z",serverNow:"2099-01-01T00:00:00Z",
          environment:args.p_environment,currency:"usd",state:options.state??"open",isHighestBidder:false,isWinner:false,
          terms:{sourceKind:args.p_source_kind,roomSessionId:args.p_expected_room_session_id,admissionIncluded:true,sameAccountRejoin:true,
            hostControlsMediaAndModeration:true,endsWhenCreatorEndsRoom:true,nonDelivery:"reconciliation_provider_refund_review",automaticRefund:false},
          ...options.response}};
      },
    },
  });
  return {api,calls,storage,switch:()=>{authority={...authority,sessionGeneration:"two"};}};
}
test("creation persists exact request and room incarnation before RPC and reuses it after uncertain response/remount",async()=>{
 const storage=new Map();
 const first=harness({storage,create:async args=>{assert.equal(storage.size,1);assert.equal(JSON.parse([...storage.values()][0]).requestId,args.p_request_id);throw Error("unknown");}});
 await assert.rejects(first.api.createCreatorRoomSeatAuction(input));
 const request=first.calls[0].args.p_request_id;
 const next=harness({storage,currentSession:"55555555-5555-4555-8555-555555555555",state:"canceled"});
 assert.equal((await next.api.prepareCreatorRoomSeatAuction("ROOM","stage_reserved_seat")).roomSessionId,"55555555-5555-4555-8555-555555555555");
 const pending=await next.api.readPendingCreatorRoomSeatAuction("ROOM","stage_reserved_seat");
 assert.equal(pending.roomSessionId,roomSessionId);
 const row=await next.api.createCreatorRoomSeatAuction(pending);
 assert.equal(row.state,"canceled");assert.equal(next.calls.at(-1).args.p_request_id,request);
 assert.equal(next.calls.at(-1).args.p_expected_room_session_id,roomSessionId);assert.equal(storage.size,0);
});
test("changed terms or room session cannot replace an uncertain creator request",async()=>{
 const storage=new Map(),first=harness({storage,create:async()=>{throw Error("unknown");}});
 await assert.rejects(first.api.createCreatorRoomSeatAuction(input));
 for(const change of [{startingAmountMinor:238},{roomSessionId:"55555555-5555-4555-8555-555555555555"},{closesAt:"2099-01-01T10:01:00Z"}]){
  const h=harness({storage});await assert.rejects(h.api.createCreatorRoomSeatAuction({...input,...change}),/previous room auction request is unresolved/);
  assert.equal(h.calls.length,0);assert.equal(storage.size,1);
 }
});
test("wrong request, owner or session response remains unresolved and storage failure prevents creation",async()=>{
 for(const response of [{requestId:"55555555-5555-4555-8555-555555555555"},{creatorId:"55555555-5555-4555-8555-555555555555"},{roomSessionId:"55555555-5555-4555-8555-555555555555"},{startingAmountMinor:238}]){
  const h=harness({response});await assert.rejects(h.api.createCreatorRoomSeatAuction(input));assert.equal(h.storage.size,1);
 }
 const h=harness({storageFailure:true});await assert.rejects(h.api.createCreatorRoomSeatAuction(input),/storage unavailable/);assert.equal(h.calls.length,0);
});
test("duplicate creation is suppressed and late account change keeps original request for recovery",async()=>{
 let resolve;const d=new Promise(r=>{resolve=r;});
 const h=harness({create:()=>d});const pending=h.api.createCreatorRoomSeatAuction(input);
 await new Promise(r=>setImmediate(r));await assert.rejects(h.api.createCreatorRoomSeatAuction(input),/already being checked/);
 h.switch();resolve();await assert.rejects(pending);assert.equal(h.calls.length,1);assert.equal(h.storage.size,1);
});
