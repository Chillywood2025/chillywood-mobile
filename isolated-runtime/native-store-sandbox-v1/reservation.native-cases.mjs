import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
export async function runReservationCases(x){
 const {q,args,bin,env,children,service,json,literal,call,actor,buyer,session,offer,asset,route,binding,nativeCatalog,preparePayload,other,otherSession,newSession,root,ts}=x;
 let cases=0;const expression=(command,payload,requestId=randomUUID(),who=actor)=>`public.native_store_sandbox_reservation_v1('${who.userId}','${who.sessionGeneration}',${literal(command)},'${requestId}',${json(payload)})`;
 const reserve=(command,payload,requestId,who)=>JSON.parse(q(service+'select '+expression(command,payload,requestId,who)+';'));
 // q supplies the actual isolated database; exceptions roll back each one-shot
 // transaction, so mutation cases cannot alter the baseline proof fixture.
 const reject=(sql,pattern)=>assert.throws(()=>q(sql),pattern);
 const compiled=ts.transpileModule(fs.readFileSync(path.join(root,'supabase/functions/_shared/native-store-sandbox-reservation-v1.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}),api={};new Function('exports',compiled.outputText)(api);
 let identity=actor;const handler=api.createNativeStoreReservationHandlerV1({authenticate:async()=>identity,execute:async(a,c)=>{try{return reserve(c.command,c.payload,c.requestId,a);}catch(error){console.error('Local reservation SQL proof failure:',error.message);throw error;}}});
 const http=async(command,payload,requestId=randomUUID())=>{const response=await handler(new Request('https://local.invalid',{method:'POST',body:JSON.stringify({protocol:'native-store-sandbox-reservation-v1',command,requestId,payload})}));assert.equal(response.status,200,await response.clone().text());return response.json();};
 const selection=call('prepare',preparePayload).data.selection,payload={selectionId:selection.id},requestId=randomUUID();
 assert.equal((await http('reserve-recover',payload)).status,'unknown');cases++;
 for(const mutation of [
  `update sandbox_commerce_v1.offers set status='retired' where id='${offer}';`,
  `update sandbox_commerce_v1.delivery_assets set state='quarantined' where id='${asset}';`,
  `update sandbox_commerce_v1.paid_video_routes set active=false where id='${route}';`,
  `insert into sandbox_commerce_v1.native_store_catalog_retirements values('${binding}',1,'reservation-fixture');`,
  'update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=false;',
 ]){reject('begin;'+mutation+service+'select '+expression('reserve',payload)+';',/native_store_|test_store_v3_|sandbox_asset/u);cases++;}
 reject(`begin;insert into sandbox_commerce_v1.native_store_catalog_retirements values('${binding}',1,'superseded');`
  +`insert into sandbox_commerce_v1.native_store_catalog_bindings values('${binding}',2,'${offer}',1,'APP_STORE',${json({...nativeCatalog,revision:2})});`
  +service+'select '+expression('reserve',payload)+';',/native_store_reservation_quote_changed/u);cases++;
 reject(`begin;update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id='${session}';`+service+'select '+expression('reserve',payload)+';',/session|authority/u);cases++;
 for(const role of ['anon','authenticated']){reject(`set role ${role};select ${expression('reserve',payload)};`,/permission denied/u);reject(`set role ${role};select * from sandbox_commerce_v1.native_store_reservations;`,/permission denied/u);}cases++;
 for(const role of ['anon','authenticated','service_role'])reject(`set role ${role};select sandbox_commerce_v1.native_store_quote_command_armed('${buyer}','${session}','offer','${randomUUID()}',${json({offerId:'scv1_offer_'+offer,store:'APP_STORE'})});`,/permission denied/u);cases++;
 reject(`set role sbx_v1_core_owner;select sandbox_commerce_v1.native_store_quote_command_armed('${buyer}','${session}','offer','${randomUUID()}',${json({offerId:'scv1_offer_'+offer,store:'APP_STORE'})});`,/native_store_quote_unarmed/u);cases++;
 reject(service+'select '+expression('reserve',{...payload,buyerId:other})+';',/native_store_reservation_invalid/u);cases++;
 identity=null;assert.equal((await handler(new Request('https://local.invalid',{method:'POST',body:'{}'}))).status,401);identity=actor;cases++;
 const first=await http('reserve',payload,requestId);assert.equal(first.dispatchAllowed,false);assert.equal(first.providerQualified,false);assert.equal(first.data.reservation.state,'dispatch_reserved');cases++;
 const renewed={userId:buyer,accountId:buyer,sessionGeneration:newSession};identity=renewed;
 assert.deepEqual((await http('reserve',payload,requestId)).data.reservation,first.data.reservation);
 assert.deepEqual((await http('reserve-recover',payload)).data.reservation,first.data.reservation);identity=actor;cases++;
 reject(service+'select '+expression('reserve',payload)+';',/native_store_reservation_conflict/u);
 const historical=JSON.parse(q(`begin;update sandbox_commerce_v1.paid_video_routes set active=false where id='${route}';`+service+'select '+expression('reserve-recover',payload)+';rollback;'));
 assert.deepEqual(historical.data.reservation,first.data.reservation);cases++;
 const alternative=product=>{
  const oid=randomUUID(),bid=randomUUID();q(`insert into sandbox_commerce_v1.offers(id,resource_id,resource_revision,catalog_id) select '${oid}',resource_id,resource_revision,catalog_id from sandbox_commerce_v1.offers where id='${offer}';`
   +`insert into sandbox_commerce_v1.native_store_catalog_bindings values('${bid}',1,'${oid}',1,'APP_STORE',${json({...nativeCatalog,bindingId:'nssv1_catalog_'+bid,wireProductId:product})});`);
  const p={offerId:'scv1_offer_'+oid,store:'APP_STORE'},quote=call('offer',p).data.quote;return call('prepare',{...p,expectedQuote:quote}).data.selection;
 };
 const second=alternative(nativeCatalog.wireProductId);reject(service+'select '+expression('reserve',{selectionId:second.id})+';',/native_store_shared_sku_reserved/u);cases++;
 const otherActor={userId:other,accountId:other,sessionGeneration:otherSession};assert.equal(reserve('reserve-recover',payload,randomUUID(),otherActor).status,'unknown');
 reject(service+'select '+expression('reserve',payload,randomUUID(),otherActor)+';',/native_store_selection_unavailable/u);
 const otherSelection=call('prepare',preparePayload,randomUUID(),otherActor).data.selection;assert.equal(reserve('reserve',{selectionId:otherSelection.id},randomUUID(),otherActor).status,'ok');cases++;
 reject("set role service_role;select * from sandbox_commerce_v1.native_store_reservations;",/permission denied/u);
 // The consumption FK rejects a bare parent TRUNCATE before its trigger runs.
 // Include both tables separately to prove immutable guards still reject the
 // operation when PostgreSQL's structural FK check is satisfied.
 reject('truncate sandbox_commerce_v1.native_store_reservations;',/cannot truncate a table referenced in a foreign key constraint/u);
 for(const mutation of ['update sandbox_commerce_v1.native_store_reservations set product_id=\'other\'','delete from sandbox_commerce_v1.native_store_reservations','truncate sandbox_commerce_v1.native_store_reservations,sandbox_commerce_v1.native_store_dispatch_attempts,sandbox_commerce_v1.native_store_qualified_attempts,sandbox_commerce_v1.native_store_allocations,sandbox_commerce_v1.native_store_reservation_terminals'])reject(mutation+';',/native_store_quote_immutable/u);cases++;
 const race=alternative('reservation-race-product'),racePayload={selectionId:race.id},raceId=randomUUID();let out='',err='';
 // Obtain actual database connection arguments from the same owning harness.
 const db=q('select current_database();');const child=spawn(path.join(bin,'psql'),args(db),{env,stdio:['pipe','pipe','pipe']});children.push(child);
 child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);const done=new Promise(resolve=>child.once('exit',resolve));
 child.stdin.write('begin;'+service+'select '+expression('reserve',racePayload,raceId)+";select 'reservation_ready';\n");
 const until=Date.now()+3000;while(!out.includes('reservation_ready')&&Date.now()<until)await delay(10);assert.ok(out.includes('reservation_ready'),err);
 reject(service+'select '+expression('reserve',racePayload,raceId)+';',/native_store_reservation_busy/u);
 child.stdin.end('commit;\n');assert.equal(await done,0,err);
 assert.equal(reserve('reserve',racePayload,raceId,renewed).data.reservation.originalSessionGeneration,session);cases++;
 const timed=alternative('reservation-timeout-product'),timedPayload={selectionId:timed.id};let timedOut='',timedErr='';
 const holder=spawn(path.join(bin,'psql'),args(db),{env,stdio:['pipe','pipe','pipe']});children.push(holder);
 holder.stdout.on('data',v=>timedOut+=v);holder.stderr.on('data',v=>timedErr+=v);const ended=new Promise(resolve=>holder.once('exit',resolve));
 const began=Date.now();holder.stdin.write('begin;'+service+'select '+expression('reserve',timedPayload)+";select 'budget_pid:'||pg_backend_pid();select 'budget_ready';\n");
 const readyUntil=Date.now()+3000;while(!timedOut.includes('budget_ready')&&Date.now()<readyUntil)await delay(10);assert.ok(timedOut.includes('budget_ready'),timedErr);
 // Leave transaction open; the server's original five-second budget, not a
 // scripted COMMIT or sleep, must terminate and roll back the inserted fence.
 const backend=timedOut.match(/budget_pid:(\d+)/u)?.[1];assert.ok(backend);
 while(q(`select count(*) from pg_stat_activity where pid=${backend};`)!=='0'&&Date.now()-began<7000)await delay(20);
 assert.equal(q(`select count(*) from pg_stat_activity where pid=${backend};`),'0','original server transaction budget must terminate backend');
 holder.stdin.end('select 1;\n');let timer;
 try{await Promise.race([ended,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('server transaction budget did not terminate')),7000);})]);}finally{clearTimeout(timer);}
 assert.match(timedErr,/transaction timeout/u);assert.ok(Date.now()-began<7000);
 assert.equal(q(`select count(*) from sandbox_commerce_v1.native_store_reservations where selection_id='${timed.id.slice('nssv1_selection_'.length)}';`),'0');cases++;
 assert.equal(q('select count(*) from sandbox_commerce_v1.intents;'),'0');assert.equal(q('select count(*) from sandbox_commerce_v1.resource_grants;'),'0');cases++;
 console.log(JSON.stringify({protocol:'native-store-server-reservation-proof-v1',cases,passed:cases,managedInstall:true,dispatchAllowed:false,providerQualified:false}));
}
