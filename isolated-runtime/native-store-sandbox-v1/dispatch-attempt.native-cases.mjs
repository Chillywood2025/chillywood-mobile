import assert from 'node:assert/strict';import path from 'node:path';import {randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
export async function runDispatchAttemptCases(x){
 const {q,args,bin,env,children,json,call,actor,buyer,session,other,otherSession,newSession,offer,route,asset,nativeCatalog,preparePayload,clientBindings,clientSource,api,freshNativeFixture}=x;
 let cases=0;
 // The reviewed managed closure must install this object itself. Never mask a
 // missing module with a fixture administrator's after-the-fact installation.
 assert.equal(q("select to_regclass('sandbox_commerce_v1.native_store_dispatch_attempts') is not null;"),'t','managed closure omitted dispatch attempt module');
 const owner="set role sbx_v1_core_owner;set request.jwt.claims='{\"role\":\"service_role\"}';";
 const expression=(reservation,request,recover=false,who=actor)=>`sandbox_commerce_v1.native_store_consume_attempt('${who.userId}','${who.sessionGeneration}','${reservation.slice(18)}','${request}',${recover})`;
 const consume=(r,id,recover=false,who=actor)=>JSON.parse(q(owner+'select '+expression(r,id,recover,who)+';'));
 const reject=(sql,pattern)=>assert.throws(()=>q(sql),pattern);
 const reserve=(p=preparePayload)=>{const s=call('prepare',p).data.selection;return call('reserve',{selectionId:s.id}).data.reservation;};
 const alternative=()=>{const oid=randomUUID(),bid=randomUUID();q(`insert into sandbox_commerce_v1.offers(id,resource_id,resource_revision,catalog_id) select '${oid}',resource_id,resource_revision,catalog_id from sandbox_commerce_v1.offers where id='${offer}';insert into sandbox_commerce_v1.native_store_catalog_bindings values('${bid}',1,'${oid}',1,'APP_STORE',${json({...nativeCatalog,bindingId:'nssv1_catalog_'+bid,wireProductId:'consume-'+bid})});`);const p={offerId:'scv1_offer_'+oid,store:'APP_STORE'};return reserve({...p,expectedQuote:call('offer',p).data.quote});};
 const r=reserve(),id=randomUUID();assert.equal(consume(r.id,id,true).attempt,null);cases++;
 for(const role of ['anon','authenticated','service_role']){reject(`set role ${role};select ${expression(r.id,id)};`,/permission denied/u);reject(`set role ${role};select * from sandbox_commerce_v1.native_store_dispatch_attempts;`,/permission denied/u);}cases++;
 reject(owner+'select '+expression(r.id,id,false,{userId:other,sessionGeneration:otherSession})+';',/native_store_attempt_unavailable/u);cases++;
 reject(`begin;update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=false;`+owner+'select '+expression(r.id,id)+';',/native_store_attempt_disabled/u);cases++;
 reject(`begin;update sandbox_commerce_v1.offers set status='retired' where id='${offer}';`+owner+'select '+expression(r.id,id)+';',/native_store_attempt_quote_changed|native_store_offer_unavailable/u);cases++;
 for(const mutation of [`update sandbox_commerce_v1.paid_video_routes set active=false where id='${route}';`,`update sandbox_commerce_v1.delivery_assets set state='quarantined' where id='${asset}';`]){reject('begin;'+mutation+owner+'select '+expression(r.id,id)+';',/native_store_|sandbox_|test_store_/u);cases++;}
 reject(`begin;update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${session}';`+owner+'select '+expression(r.id,id)+';',/sandbox_.*required/u);cases++;
 const first=consume(r.id,id);assert.equal(first.newlyConsumed,true);assert.equal(first.dispatchAllowed,false);assert.equal(first.attempt.state,'consumed');assert.equal(first.attempt.originalSessionGeneration,session);cases++;
 for(const who of [actor,{userId:buyer,sessionGeneration:newSession}]){const repeated=consume(r.id,id,false,who);assert.equal(repeated.newlyConsumed,false);assert.deepEqual(repeated.attempt,first.attempt);assert.equal(consume(r.id,randomUUID(),true,who).newlyConsumed,false);}cases++;
 reject(owner+'select '+expression(r.id,randomUUID())+';',/native_store_attempt_conflict/u);
 for(const sql of ['update sandbox_commerce_v1.native_store_dispatch_attempts set request_id=gen_random_uuid()','delete from sandbox_commerce_v1.native_store_dispatch_attempts','truncate sandbox_commerce_v1.native_store_dispatch_attempts'])reject(sql+';',/native_store_quote_immutable/u);cases++;
 // A lost response after commit and a crash before hypothetical SDK invocation
 // both leave the same durable, non-reissuable evidence. No SDK exists here.
 const lost=alternative(),lostId=randomUUID();consume(lost.id,lostId);assert.equal(consume(lost.id,lostId).newlyConsumed,false);cases++;
 const rolled=alternative(),rolledId=randomUUID();q('begin;'+owner+'select '+expression(rolled.id,rolledId)+';rollback;');assert.equal(consume(rolled.id,rolledId,true).attempt,null);assert.equal(consume(rolled.id,rolledId).newlyConsumed,true);cases++;
 const expired=alternative(),expiredId=randomUUID();reject('begin;'+owner+'select '+expression(expired.id,expiredId)+';select pg_sleep(6);commit;',/transaction timeout/u);assert.equal(consume(expired.id,expiredId,true).attempt,null);cases++;
 const db=q('select current_database();'),race=alternative(),raceId=randomUUID();let out='',err='';
 const child=spawn(path.join(bin,'psql'),args(db),{env,stdio:['pipe','pipe','pipe']});children.push(child);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);const done=new Promise(resolve=>child.once('exit',resolve));
 child.stdin.write('begin;'+owner+'select '+expression(race.id,raceId)+";select 'consume_ready';\n");
 const until=Date.now()+3000;while(!out.includes('consume_ready')&&Date.now()<until)await delay(10);assert.ok(out.includes('consume_ready'),err);
 reject(owner+'select '+expression(race.id,raceId,false,{userId:buyer,sessionGeneration:newSession})+';',/native_store_attempt_busy/u);
 reject(owner+'select '+expression(race.id,randomUUID())+';',/native_store_attempt_busy/u);
 child.stdin.end('commit;\n');assert.equal(await done,0,err);assert.equal(consume(race.id,raceId,false,{userId:buyer,sessionGeneration:newSession}).newlyConsumed,false);cases++;
 // Actual private SQL attempt -> real client retained v2 evidence -> original
 // account's new-session claim through real Edge handler and PostgreSQL.
 const f=freshNativeFixture('consumed-client-proof'),memory=new Map(),storage={getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>{memory.set(k,v);}};
 const original={...actor,state:'ACTIVE',restoreOnly:false};let live={...original},requests=0;
 const bindings={...clientBindings,'./accountSessionAuthority':{...clientBindings['./accountSessionAuthority'],getCurrentAccountSessionAuthoritySnapshot:()=>live},'./accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>({authority:live,accessToken:'synthetic-local-auth'})}};
 const handler=api.createNativeStoreSandboxCommandHandlerV1({authenticate:async()=>live,execute:async({actor:a,request:r})=>call(r.command,r.payload,r.requestId,a)});
 const connect=async()=>{const exports={};new Function('exports','require','fetch',clientSource)(exports,n=>bindings[n],async(url,opts)=>{requests++;return handler(new Request(url,opts));});return exports.captureNativeSandboxQuoteClient(live,f.payload.offerId,f.payload.store,{storage});};
 const c=await connect();const selected=(await c.prepare((await c.offer()).data.quote)).data.selection;await c.retainPurchaseAttempt(selected.id);
 const reservation=(await c.recoverPurchaseAttempt()).data.reservation,consumed=consume(reservation.id,randomUUID());
 const retain=await c.createCallbackRetainer(selected.id,consumed.attempt),beforeRequests=requests;
 live={...original,userId:other,accountId:other,sessionGeneration:otherSession};c.dispose();
 await retain(Object.freeze({productIdentifier:f.nativeCatalog.wireProductId,transactionIdentifier:'synthetic-original-owner-consumed'}),Object.freeze(original));
 assert.equal(requests,beforeRequests);const saved=[...memory.values()].map(v=>JSON.parse(v)).find(v=>v.version===2);
 assert.deepEqual(saved.consumedAttempt,consumed.attempt);assert.equal(saved.userId,buyer);
 live={...original,sessionGeneration:newSession};const restarted=await connect();
 try{const result=await restarted.retrySavedClaim();assert.equal(result.data.claim.transactionIdentifier,'synthetic-original-owner-consumed');assert.equal(result.data.claim.evidence,'client_assertion');assert.equal(result.dispatchAllowed,false);assert.equal(result.data.claim.settlementAllowed,false);}finally{restarted.dispose();}cases++;
 assert.equal(q('select count(*) from sandbox_commerce_v1.intents;'),'0');assert.equal(q('select count(*) from sandbox_commerce_v1.resource_grants;'),'0');cases++;
 console.log(JSON.stringify({protocol:'native-store-private-consume-proof-v1',cases,passed:cases,dispatchAllowed:false,providerQualified:false}));
}
