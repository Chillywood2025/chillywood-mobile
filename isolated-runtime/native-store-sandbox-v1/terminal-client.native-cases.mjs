import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// Real client -> real shared Edge -> real managed PostgreSQL. No store SDK,
// invented terminal rows, or handwritten server-result adapter.
export async function runTerminalClientCases({q,call,actor,newSession,other,otherSession,load,root,ts,freshNativeFixture}) {
 let cases=0;
 async function fixture() {
  const data=freshNativeFixture('terminal-client-'+randomUUID()),quote=data.preparePayload.expectedQuote;
  let active={...actor,state:'ACTIVE',restoreOnly:false},loss=null,failSlotRead=false;
  const memory=new Map(),requests=[],listeners=new Set();
  const storage={getItem:async k=>{if(failSlotRead&&k.startsWith('@chillywood/native-store-attempt:')&&k.includes(':generation:')&&!k.endsWith(':successor')){failSlotRead=false;throw Error('synthetic successor read loss');}return memory.get(k)??null;},setItem:async(k,v)=>{memory.set(k,v);}};
  const authority={getCurrentAccountSessionAuthoritySnapshot:()=>active,sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&['userId','accountId','sessionGeneration','state','restoreOnly'].every(k=>a[k]===b[k]),subscribeToAccountSessionAuthority:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  const edge=load('native-store-sandbox-command-v1.ts').createNativeStoreSandboxCommandHandlerV1({authenticate:async()=>({userId:active.userId,accountId:active.accountId,sessionGeneration:active.sessionGeneration}),execute:async({actor:a,request:r})=>call(r.command,r.payload,r.requestId,a)});
  const transport=async(url,options)=>{const r=JSON.parse(options.body);requests.push(r);if(loss==='before'&&r.command==='cancel-preparation')throw Error('synthetic-before-server');const result=await edge(new Request(url,options));if(loss==='after'&&r.command==='cancel-preparation')throw Error('synthetic-after-commit');return result;};
  const api=()=>{const result={},bindings={'../supabase/functions/_shared/native-store-sandbox-terminal-contract-v1':load('native-store-sandbox-terminal-contract-v1.ts'),'../supabase/functions/_shared/native-store-sandbox-dispatch-contract-v1':load('native-store-sandbox-dispatch-contract-v1.ts'),'@react-native-async-storage/async-storage':storage,'react-native-get-random-values':{},'./accountSessionAuthority':authority,'./accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>({authority:active,accessToken:'synthetic-local-auth'})},'./supabase':{SUPABASE_URL:'https://local.invalid',SUPABASE_ANON_KEY:'synthetic-local-public'}};
   new Function('exports','require','fetch',ts.transpileModule(fs.readFileSync(path.join(root,'_lib/nativeStoreSandboxQuote.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(result,name=>{assert.ok(Object.hasOwn(bindings,name),'unmodeled '+name);return bindings[name];},transport);return result;};
  const change=who=>{active={...who,state:'ACTIVE',restoreOnly:false};listeners.forEach(fn=>fn(active));};
  return{quote,memory,requests,storage,interruptSlotRead:()=>{failSlotRead=true;},connect:()=>api().captureNativeSandboxQuoteClient(active,quote.offerId,'APP_STORE',{storage}),renew:()=>change({...actor,sessionGeneration:newSession}),other:()=>change({userId:other,accountId:other,sessionGeneration:otherSession}),loss:v=>{loss=v;}};
 }
 const first=await fixture(),c=await first.connect(),selection=(await c.prepare(first.quote)).data.selection;
 assert.equal((await c.recoverTerminal()).status,'unknown');const cancelled=(await c.cancelPreparation()).data.terminal;
 assert.equal(cancelled.kind,'cancelled_before_consume');assert.equal(cancelled.reservationId,null);assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_reservations where selection_id='${selection.id.slice(16)}';`),'0');cases++;
 const old=[...first.memory.entries()];await c.advanceAfterTerminal();await assert.rejects(c.recover());
 const fresh=await first.connect();assert.equal(await fresh.readSaved(),null);const successor=(await fresh.prepare(first.quote)).data.selection;assert.notEqual(successor.id,selection.id);await fresh.retainPurchaseAttempt(successor.id);assert.equal((await fresh.recoverPurchaseAttempt()).data.reservation.selectionId,successor.id);
 for(const[k,v]of old)assert.equal(first.memory.get(k),v);fresh.dispose();cases++;
 const shared=await fixture(),a=await shared.connect(),sa=(await a.prepare(shared.quote)).data.selection;await a.retainPurchaseAttempt(sa.id);const ra=(await a.recoverPurchaseAttempt()).data.reservation,original=[...shared.memory.entries()];
 const stale=await shared.connect();await stale.recover();await a.cancelPreparation();await a.advanceAfterTerminal();const b=await shared.connect(),sb=(await b.prepare(shared.quote)).data.selection;
 assert.equal((await b.readPurchaseAttempt()).status,'terminal_slot_available');shared.interruptSlotRead();await assert.rejects(b.retainPurchaseAttempt(sb.id));const beforeStale=[...shared.memory.entries()];await assert.rejects(stale.retainPurchaseAttempt(sa.id));assert.deepEqual([...shared.memory.entries()],beforeStale);stale.dispose();await b.retainPurchaseAttempt(sb.id);const rb=(await b.recoverPurchaseAttempt()).data.reservation;assert.notEqual(rb.id,ra.id);assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_reservations where id in('${ra.id.slice(18)}','${rb.id.slice(18)}');`),'2');
 for(const[k,v]of original){assert.equal(shared.memory.get(k),v);await shared.storage.setItem(k,v);}b.dispose();const restarted=await shared.connect();assert.equal((await restarted.recover()).data.selection.id,sb.id);assert.equal((await restarted.recoverPurchaseAttempt()).data.reservation.id,rb.id);restarted.dispose();cases++;
 for(const loss of ['before','after']){
  const f=await fixture(),client=await f.connect(),s=(await client.prepare(f.quote)).data.selection;f.loss(loss);await assert.rejects(client.cancelPreparation());client.dispose();f.loss(null);f.renew();const reconnected=await f.connect();await reconnected.recover();const read=await reconnected.recoverTerminal();assert.equal(read.status,loss==='before'?'unknown':'ok');
  const terminal=(await reconnected.cancelPreparation()).data.terminal;assert.equal(terminal.selectionId,s.id);assert.equal(new Set(f.requests.filter(r=>r.command==='cancel-preparation').map(r=>r.requestId)).size,1);await reconnected.advanceAfterTerminal();const next=await f.connect();assert.equal(await next.readSaved(),null);next.dispose();cases++;
 }
 const held=await fixture(),h=await held.connect(),hs=(await h.prepare(held.quote)).data.selection;await h.retainPurchaseAttempt(hs.id);const hr=(await h.recoverPurchaseAttempt()).data.reservation;
 q(`set role sbx_v1_core_owner;set request.jwt.claims='{"role":"service_role"}';select sandbox_commerce_v1.native_store_consume_attempt('${actor.userId}','${actor.sessionGeneration}','${hr.id.slice(18)}','${randomUUID()}',false);`);
 assert.equal((await h.cancelPreparation()).data.reason,'consumption_unresolved');await assert.rejects(h.advanceAfterTerminal());assert.equal([...held.memory.keys()].some(k=>k.endsWith(':successor')),false);h.dispose();cases++;
 const isolated=await fixture(),oldClient=await isolated.connect(),is=(await oldClient.prepare(isolated.quote)).data.selection;await oldClient.cancelPreparation();isolated.other();await assert.rejects(oldClient.recoverTerminal());const otherClient=await isolated.connect();assert.equal(await otherClient.readSaved(),null);otherClient.dispose();assert.equal(call('terminal-recover',{selectionId:is.id},randomUUID(),{userId:other,accountId:other,sessionGeneration:otherSession}).data.terminal,null);cases++;
 console.log(JSON.stringify({protocol:'native-terminal-client-edge-postgres-proof-v1',cases,passed:cases,realClient:true,realEdge:true,realPostgres:true,realSdkInvoked:false,providerObserved:false}));return cases;
}
