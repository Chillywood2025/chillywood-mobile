import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { A, B, uuid, digest, quote, allocation, clone, load, v1, contract } from "./helpers/isolated-test-store-v3-fixtures.mjs";

const requestId = uuid(100), readId = uuid(101), clock = Date.parse("2026-11-07T12:00:00Z");
const intent = () => ({ id: allocation.intentId, state: "prepared", quote: clone(quote), createdAt: "2026-11-07T11:00:00Z", expiresAt: "2030-01-01T00:00:00Z", receipt: null, grantId: null, dispatchAllowed: false, accessRequiresCurrentAuthorization: true, notPayable: true });
const result = (command, id, data, sessionId = A.sessionGeneration, status = "ok") => ({ protocol: "isolated-paid-video-checkout-v3", command, requestId: id, actor: { userId: A.userId, sessionId }, status, data, providerDispatchAllowed: false, grantsAccess: false, financialAuthority: false, notPayable: true });
const preparation = () => result("prepare", requestId, { intent: intent(), replayed: false });
const recovered = (sessionId = A.sessionGeneration) => result("recover", readId, { originalRequestId: requestId, originalSessionId: A.sessionGeneration, originalPayload: { offerId: quote.offerId, expectedQuote: clone(quote) }, intent: intent() }, sessionId);
const expected = (command, id, payload, sessionId = A.sessionGeneration) => ({ command, requestId: id, payload, actor: { userId: A.userId, sessionId }, configurationDigest: digest });
function fixture() {
  let current = A, respond = () => preparation(), writeHook = null;
  const listeners = new Set(), calls = [], data = new Map();
  const transport = load("_lib/isolatedPaidVideoCheckoutV3.ts", {
    "react-native-get-random-values": {}, "react-native": { Platform: { OS: "ios" } }, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract,
    "./supabase": { SUPABASE_URL: "https://fixture.invalid", SUPABASE_ANON_KEY: "public-fixture" },
    "./accountBoundSupabaseMutation": { captureAccountBoundSupabaseMutationSubject: async () => ({ authority: current, accessToken: "captured-token" }) },
    "./accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => current,
      sameAccountSessionAuthority: (a,b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly,
      subscribeToAccountSessionAuthority(fn) { listeners.add(fn); return () => listeners.delete(fn); } },
  }, { fetch: async (url, options) => { calls.push({url,...options}); return {ok:true,json:async()=>respond(JSON.parse(options.body))}; } });
  const storage = { async getItem(key) { return data.get(key) ?? null; }, async setItem(key,value) { await writeHook?.(key,value); data.set(key,value); } };
  const journalModule = load("_lib/isolatedPaidVideoCheckoutV3Attempts.ts", { "@react-native-async-storage/async-storage":{default:storage}, "./isolatedTestStoreContract":v1,"./isolatedTestStoreV3Contract":contract,"./isolatedPaidVideoCheckoutV3":transport });
  const create = (extra={}) => journalModule.createPaidVideoCheckoutV3Journal({userId:A.userId,configurationDigest:digest,storage,now:()=>clock,...extra});
  return {transport,create,journal:create(),data,calls,storage,capture:()=>transport.capturePaidVideoCheckoutV3Client(current,digest),
    respond(fn){respond=fn;},change(value){current=value;for(const fn of listeners)fn(value);},writeHook(fn){writeHook=fn;} };
}
const input = () => ({requestId,sessionGeneration:A.sessionGeneration,quote:clone(quote)});
const binding = (sessionGeneration=A.sessionGeneration) => ({requestId:readId,sessionGeneration});

test("full asset quote, strict ownership and explicit unavailable offer parse without granting access",()=>{
  const f=fixture(), p={offerId:quote.offerId,expectedQuote:quote};
  assert.equal(f.transport.parsePaidVideoCheckoutV3Result(preparation(),expected("prepare",requestId,p)).grantsAccess,false);
  const offered=result("offer",requestId,{quote,preparationAllowed:false});
  assert.equal(f.transport.parsePaidVideoCheckoutV3Result(offered,expected("offer",requestId,{offerId:quote.offerId})).data.preparationAllowed,false);
  for(const mutate of [v=>{v.data.intent.quote.asset.incarnation=uuid(70);},v=>{v.data.intent.quote.asset.sha256="a".repeat(64);},v=>{v.data.intent.quote.asset.byteLength++;},v=>{v.data.intent.quote.asset.resourceRevision++;},v=>{v.actor.sessionId=B.sessionGeneration;},v=>{v.grantsAccess=true;},v=>{v.data.intent.signedUrl="https://fixture.invalid/private";}]){
    const changed=preparation();mutate(changed);assert.throws(()=>f.transport.parsePaidVideoCheckoutV3Result(changed,expected("prepare",requestId,p)),/invalid_response/u);
  }
});
test("durable preparation and uncertainty precede the only network opportunity",async()=>{
  const f=fixture(), ticket=await f.journal.prepare(input());let sent=0;
  const observed=await ticket.dispatch(async()=>{sent++;assert.equal((await f.journal.list())[0].state,"unknown");return preparation();});
  assert.equal(observed.state,"unknown");assert.equal(observed.intentId,allocation.intentId);
  await assert.rejects(ticket.dispatch(async()=>{sent++;}),/capability_consumed/u);
  const confirmed=await f.journal.reconcile(requestId,recovered(),binding());assert.equal(confirmed.state,"intent_prepared");assert.equal(sent,1);
});
test("lost preparation, restart and missing recovery never reconstruct a mutation ticket",async()=>{
  const f=fixture(), ticket=await f.journal.prepare(input());await ticket.dispatch(async()=>{throw Error("lost");});
  assert.equal((await f.create().prepare(input())).mayDispatch,false);
  await f.create().reconcile(requestId,result("recover",readId,{originalRequestId:requestId,intent:null},A.sessionGeneration,"unknown"),binding());
  await assert.rejects(f.create().prepare({...input(),requestId:uuid(102)}),/unresolved_attempt/u);
  assert.equal((await f.create().list())[0].state,"unknown");
});
test("fresh-session recovery preserves original actor session and immutable full quote",async()=>{
  const f=fixture();await(await f.journal.prepare(input())).dispatch(async()=>preparation());
  const later=uuid(103), confirmed=await f.create().reconcile(requestId,recovered(later),binding(later));
  assert.equal(confirmed.sessionGeneration,A.sessionGeneration);assert.equal(confirmed.observedSessionGeneration,later);
  for(const mutate of [v=>{v.data.originalSessionId=later;},v=>{v.data.originalPayload.expectedQuote.asset.sha256="a".repeat(64);},v=>{v.data.intent.quote.amountMinor++;}]){
    const bad=recovered(later);mutate(bad);await assert.rejects(f.journal.reconcile(requestId,bad,binding(later)),/invalid_response/u);
  }
  await assert.rejects(f.create().prepare({...input(),sessionGeneration:later}),/request_conflict/u);
});
test("account/profile namespaces retain history without adopting another installation authority",async()=>{
  const f=fixture();await f.journal.prepare(input());
  assert.equal((await f.create({userId:B.userId}).list()).length,0);
  assert.equal((await f.create({configurationDigest:"c".repeat(64)}).list()).length,0);
  assert.equal((await f.create().list()).length,1);
});
test("only exact local presend failure resolves not-applied and allows a new explicit preparation",async()=>{
  const f=fixture(), ticket=await f.journal.prepare(input());
  await ticket.dispatch(async()=>{throw new f.transport.PaidVideoCheckoutV3Error("authority_retired",requestId,"not_sent");});
  assert.equal((await f.journal.list())[0].state,"not_applied");
  assert.equal((await f.journal.prepare({...input(),requestId:uuid(104)})).mayDispatch,true);
  const g=fixture();await(await g.journal.prepare(input())).dispatch(async()=>{throw {code:"authority_retired",requestId,outcome:"not_sent"};});
  assert.equal((await g.journal.list())[0].state,"unknown");
});
test("failed durable write, partial acknowledgement and readback mismatch never permit dispatch",async()=>{
  for(const commit of [false,true]){
    const f=fixture();f.writeHook((key,value)=>{if(commit)f.data.set(key,value);throw Error("storage");});
    await assert.rejects(f.journal.prepare(input()),/storage_unavailable/u);f.writeHook(null);
    await assert.rejects(f.create().prepare({...input(),requestId:uuid(105)}),/storage_unavailable/u);
  }
});
test("known receipt and negative history cannot regress under out-of-order recovery",async()=>{
  const f=fixture();await(await f.journal.prepare(input())).dispatch(async()=>preparation());
  const paid=recovered();paid.data.intent.state="verified";paid.data.intent.receipt={id:`scv1_receipt_${uuid(106)}`,state:"refunded",purchasedAt:"2026-11-07T12:00:00Z",originalTransactionId:"original"};paid.data.intent.grantId=`scv1_grant_${uuid(107)}`;
  await f.journal.reconcile(requestId,paid,binding());
  await f.journal.reconcile(requestId,recovered(),binding());
  const old=clone(paid);old.data.intent.receipt.state="verified";await f.journal.reconcile(requestId,old,binding());
  assert.equal((await f.journal.list())[0].intent.receipt.state,"refunded");
});
test("transport captures exact session and retires permanently across A to B to A",async()=>{
  const f=fixture(), client=await f.capture();let finish;f.respond(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=client.request("prepare",requestId,{offerId:quote.offerId,expectedQuote:quote});
  while(!finish)await new Promise(resolve=>setImmediate(resolve));f.change(B);f.change(A);finish(preparation());
  await assert.rejects(pending,e=>e.outcome==="unknown");await assert.rejects(client.request("recover",readId,{originalRequestId:requestId}),/authority_retired/u);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].headers.Authorization,"Bearer captured-token");assert.match(f.calls[0].url,/isolated-paid-video-checkout-v3$/u);
});
test("transport rejects duplicate preparation and legacy tip quotes before sending",async()=>{
  const f=fixture(), client=await f.capture();await client.request("prepare",requestId,{offerId:quote.offerId,expectedQuote:quote});
  await assert.rejects(client.request("prepare",requestId,{offerId:quote.offerId,expectedQuote:quote}),/invalid_request/u);
  const old=clone(quote);delete old.asset;old.kind="creator_tip";await assert.rejects(client.request("prepare",uuid(108),{offerId:quote.offerId,expectedQuote:old}),/invalid_request/u);assert.equal(f.calls.length,1);
});
test("history validates PostgreSQL microsecond order and never grants delivery by grantId",()=>{
  const f=fixture(), first=intent(), second=intent();first.id=`scv1_intent_${uuid(109)}`;second.id=`scv1_intent_${uuid(110)}`;
  first.createdAt="2026-11-07T11:00:00.000002Z";second.createdAt="2026-11-07T11:00:00.000001Z";
  const p={limit:2,cursor:null}, value=result("history",readId,{intents:[first,second],nextCursor:second.id});
  assert.equal(f.transport.parsePaidVideoCheckoutV3Result(value,expected("history",readId,p)).data.intents.length,2);
  value.data.intents.reverse();assert.throws(()=>f.transport.parsePaidVideoCheckoutV3Result(value,expected("history",readId,p)),/invalid_response/u);
});
test("current playback resolution can select another grant but cannot change the requested intent or grant authority",()=>{
  const f=fixture(), i=intent();i.state="verified";i.grantId=`scv1_grant_${uuid(710)}`;i.receipt={id:`scv1_receipt_${uuid(711)}`,state:"refunded",purchasedAt:"2026-11-07T12:00:00Z",originalTransactionId:"original"};
  const p={intentId:i.id}, current=`scv1_grant_${uuid(712)}`, value=result("resolve_playback",readId,{intent:i,currentGrantId:current,accessRequiresCurrentAuthorization:true});
  const parsed=f.transport.parsePaidVideoCheckoutV3Result(value,expected("resolve_playback",readId,p));
  assert.equal(parsed.data.currentGrantId,current);assert.notEqual(parsed.data.intent.grantId,current);assert.equal(parsed.grantsAccess,false);
  const missing=clone(value);missing.data.currentGrantId=null;assert.equal(f.transport.parsePaidVideoCheckoutV3Result(missing,expected("resolve_playback",readId,p)).data.currentGrantId,null);
  for(const mutate of [v=>{v.data.intent.id=`scv1_intent_${uuid(713)}`;},v=>{v.data.currentGrantId=uuid(714);},v=>{v.data.accessRequiresCurrentAuthorization=false;},v=>{v.data.signedUrl="https://invalid.test";},v=>{v.grantsAccess=true;},v=>{v.actor.sessionId=B.sessionGeneration;}]){
    const bad=clone(value);mutate(bad);assert.throws(()=>f.transport.parsePaidVideoCheckoutV3Result(bad,expected("resolve_playback",readId,p)),/invalid_response/u);
  }
});
const closed = (id=uuid(120),session=A.sessionGeneration) => { const expired=intent();expired.state="expired";return result("abandon",id,{intent:expired,replayed:false,
  closure:{id:uuid(121),originalRequestId:requestId,originalSessionId:A.sessionGeneration,configurationDigest:digest,closedAt:"2026-11-07T12:00:00Z",kind:"unallocated_preparation",allocationAbsent:true,dispatchAbsent:true}},session); };
async function confirmed(f){await(await f.journal.prepare(input())).dispatch(async()=>preparation());return f.journal.reconcile(requestId,recovered(),binding());}
test("explicit closure is durable before send and only the exact server tombstone permits replacement",async()=>{
  const f=fixture();await confirmed(f);const action=await f.journal.prepareAbandon({requestId:uuid(120),sessionGeneration:A.sessionGeneration,originalRequestId:requestId});
  const outcome=await action.dispatch(async payload=>{const saved=(await f.journal.list())[0];assert.equal(saved.closureAttempts[0].state,"unknown");assert.equal(payload.originalSessionId,A.sessionGeneration);assert.deepEqual(clone(payload.expectedQuote),quote);return closed();});
  assert.equal(outcome.state,"closed");assert.equal(outcome.closure.allocationAbsent,true);assert.equal(outcome.intent.receipt,null);
  await assert.rejects(action.dispatch(async()=>closed()),/capability_consumed/u);assert.equal((await f.journal.prepare({...input(),requestId:uuid(122)})).mayDispatch,true);
});
test("lost closure and expiry recovery remain unknown until explicit cross-session closure re-ack",async()=>{
  const f=fixture();await confirmed(f);await(await f.journal.prepareAbandon({requestId:uuid(120),sessionGeneration:A.sessionGeneration,originalRequestId:requestId})).dispatch(async()=>{throw Error("lost");});
  const later=uuid(123), expired=recovered(later);expired.data.intent.state="expired";
  assert.equal((await f.create().reconcile(requestId,expired,binding(later))).state,"unknown");
  await assert.rejects(f.create().prepare({...input(),requestId:uuid(124)}),/unresolved_attempt/u);
  assert.equal((await f.create().prepareAbandon({requestId:uuid(120),sessionGeneration:later,originalRequestId:requestId})).mayDispatch,false);
  const ticket=await f.create().prepareAbandon({requestId:uuid(125),sessionGeneration:later,originalRequestId:requestId});const response=closed(uuid(125),later);response.data.replayed=true;
  assert.equal((await ticket.dispatch(async()=>response)).state,"closed");assert.equal((await f.journal.list())[0].sessionGeneration,A.sessionGeneration);
});
test("contradictory closure tuple, receipt or missing no-allocation proof cannot resolve uncertainty",async()=>{
  for(const mutate of [v=>{v.data.closure.originalSessionId=B.sessionGeneration;},v=>{v.data.closure.configurationDigest="a".repeat(64);},v=>{v.data.closure.dispatchAbsent=false;},v=>{v.data.intent.quote.asset.sha256="a".repeat(64);},v=>{v.data.intent.state="provider_pending";}]){
    const f=fixture();await confirmed(f);const ticket=await f.journal.prepareAbandon({requestId:uuid(120),sessionGeneration:A.sessionGeneration,originalRequestId:requestId});const bad=closed();mutate(bad);
    assert.equal((await ticket.dispatch(async()=>bad)).state,"unknown");await assert.rejects(f.journal.prepare({...input(),requestId:uuid(126)}),/unresolved_attempt/u);
  }
});
test("known closure stays closed when an older preparation snapshot arrives",async()=>{
  const f=fixture();await confirmed(f);await(await f.journal.prepareAbandon({requestId:uuid(120),sessionGeneration:A.sessionGeneration,originalRequestId:requestId})).dispatch(async()=>closed());
  assert.equal((await f.journal.reconcile(requestId,recovered(),binding())).state,"closed");
});
if(process.env.ISOLATED_PAID_VIDEO_CHECKOUT_V3_FIXTURE)test("actual PostgreSQL checkout captures traverse strict parser and original-request journal recovery",async()=>{
  const entries=JSON.parse(fs.readFileSync(process.env.ISOLATED_PAID_VIDEO_CHECKOUT_V3_FIXTURE,"utf8"));assert.ok(entries.length>=35);
  const f=fixture();for(const entry of entries)f.transport.parsePaidVideoCheckoutV3Result(entry.result,{...entry.input.request,actor:entry.input.actor});
  const original=entries.find(e=>e.input.request.command==="prepare"&&!e.result.data.replayed), request=original.input.request;
  const recovery=entries.find(e=>e.input.request.command==="recover"&&e.result.status==="ok"&&e.result.data.originalRequestId===request.requestId&&e.result.data.intent.state==="prepared");assert.ok(recovery);
  const journal=f.create({userId:original.input.actor.userId,configurationDigest:request.configurationDigest,now:()=>Date.parse(original.result.data.intent.createdAt)+1});
  const ticket=await journal.prepare({requestId:request.requestId,sessionGeneration:original.input.actor.sessionId,quote:request.payload.expectedQuote});
  const direct=await ticket.dispatch(async()=>original.result);assert.equal(direct.state,"unknown");
  const saved=await journal.reconcile(request.requestId,recovery.result,{requestId:recovery.input.request.requestId,sessionGeneration:recovery.input.actor.sessionId});
  assert.equal(saved.state,"intent_prepared");assert.deepEqual(clone(saved.quote),request.payload.expectedQuote);assert.equal(saved.intent.grantId,null);
});
if(process.env.ISOLATED_PAID_VIDEO_CHECKOUT_V3_FIXTURE)test("actual PostgreSQL unallocated tombstone closes exactly its original durable preparation",async()=>{
  const entries=JSON.parse(fs.readFileSync(process.env.ISOLATED_PAID_VIDEO_CHECKOUT_V3_FIXTURE,"utf8")), abandoned=entries.find(e=>e.input.request.command==="abandon");assert.ok(abandoned,"successor fixture must capture actual abandonment");
  const payload=abandoned.input.request.payload, original=entries.find(e=>e.input.request.command==="prepare"&&e.input.request.requestId===payload.originalRequestId);
  const recovery=entries.find(e=>e.input.request.command==="recover"&&e.result.status==="ok"&&e.result.data.originalRequestId===payload.originalRequestId);assert.ok(original&&recovery);
  const f=fixture(), journal=f.create({userId:original.input.actor.userId,configurationDigest:original.input.request.configurationDigest});
  await(await journal.prepare({requestId:payload.originalRequestId,sessionGeneration:payload.originalSessionId,quote:payload.expectedQuote})).dispatch(async()=>original.result);
  await journal.reconcile(payload.originalRequestId,recovery.result,{requestId:recovery.input.request.requestId,sessionGeneration:recovery.input.actor.sessionId});
  const ticket=await journal.prepareAbandon({requestId:abandoned.input.request.requestId,sessionGeneration:abandoned.input.actor.sessionId,originalRequestId:payload.originalRequestId});
  const saved=await ticket.dispatch(async sent=>{assert.deepEqual(clone(sent),payload);return abandoned.result;});assert.equal(saved.state,"closed");assert.equal(saved.closure.id,abandoned.result.data.closure.id);
});
if(process.env.ISOLATED_PAID_VIDEO_CURRENT_GRANT_CAPTURES)test("all actual PostgreSQL current-grant responses preserve historical receipt identity and independent access resolution",()=>{
  const entries=JSON.parse(fs.readFileSync(process.env.ISOLATED_PAID_VIDEO_CURRENT_GRANT_CAPTURES,"utf8"));assert.equal(entries.length,15);const f=fixture();
  for(const entry of entries){const parsed=f.transport.parsePaidVideoCheckoutV3Result(entry.result,{...entry.input.request,actor:entry.input.actor});assert.equal(parsed.grantsAccess,false);assert.equal(parsed.data.accessRequiresCurrentAuthorization,true);}
  assert.ok(entries.some(e=>e.result.data.currentGrantId&&e.result.data.currentGrantId!==e.result.data.intent.grantId));
  assert.ok(entries.some(e=>e.result.data.intent.receipt?.state==="refunded"&&e.result.data.currentGrantId));
  assert.ok(entries.some(e=>e.result.data.intent.receipt?.state==="verified"&&e.result.data.currentGrantId===null));
});
