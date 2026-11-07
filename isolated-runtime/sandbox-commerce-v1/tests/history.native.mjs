#!/usr/bin/env node
// Real private history/recovery SQL; disposable synthetic PostgreSQL only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {BUYER,BUYER_SESSION,SELLER,SELLER_SESSION,fixtureApi,sqlJson,sqlText} from './receipts.fixture.mjs';
import {historyInstallSql} from './history.fixture.mjs';
assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');
const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const here=path.dirname(fileURLToPath(import.meta.url)),install=historyInstallSql(here);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sandbox-history-native-'));
const data=path.join(directory,'data'),port='55457',db='history_'+randomUUID().replaceAll('-','');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')));
const args=(database=db)=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres','-d',database];
const run=(tool,argv,input)=>spawnSync(path.join(bin,tool),argv,{env,input,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
const invoke=(tool,argv,input)=>{const r=run(tool,argv,input);assert.equal(r.status,0,`${r.error?.message??''}\n${r.stderr}`);return r.stdout.trim();};
const q=sql=>invoke('psql',args(),sql),runQuery=sql=>run('psql',args(),sql);
const api=fixtureApi(q,runQuery),cases=[],captures=[],checkoutCaptures=[],clients=[];
const body=fields=>({protocol:'sandbox-commerce-v1',requestId:randomUUID(),...fields});
const command=(name,payload={},user=SELLER,sid=SELLER_SESSION,expected=sid)=>api.actorPrefix(user,sid)
 +`select public.isolated_sandbox_tips_v1(${sqlText(name)},${sqlJson(payload.protocol?payload:body(payload))},${sqlText(user)},${sqlText(expected)});`;
const call=(name,fields={},user=SELLER,sid=SELLER_SESSION)=>{
 const payload=fields.protocol?fields:body(fields);const response=JSON.parse(q(command(name,payload,user,sid)));
 assert.equal(response.actor.userId,user);assert.equal(response.actor.sessionGeneration,sid);
 captures.push({command:name,payload,response});return response.data;
};
const reject=(sql,pattern)=>{const r=runQuery(sql);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);};
const originalRequest=context=>q(`select request_id from sandbox_commerce_v1.requests where command='checkout.prepare'
 and result#>>'{data,intent,id}'=${sqlText(context.intent.id)};`);
const fresh=()=>{api.reset();return api.prepare(api.seedCatalog());};
// Populate bounded-read cases only. The first offer uses actual publication;
// extra rows model repeated publications without claiming provider execution.
const offerCopies=(context,extra)=>q(`insert into sandbox_commerce_v1.offers(resource_id,resource_revision,catalog_id,created_at)
 select o.resource_id,o.resource_revision,o.catalog_id,o.created_at from sandbox_commerce_v1.offers o
 cross join generate_series(1,${extra}) where o.id=${sqlText(context.offer.id.replace('scv1_offer_',''))};`);
const addSession=(user,sid)=>q(`insert into auth.sessions values('${sid}','${user}',clock_timestamp()+interval '1 hour');
 insert into public.wave1_legal_acceptances select '${user}','${sid}',document_key,version,market,capability,'member',null
 from public.wave1_legal_document_versions where capability='account';`);
const waitFor=async(test,label)=>{const until=Date.now()+2500;while(!test()&&Date.now()<until)await delay(15);assert.ok(test(),label);};
const held=async sql=>{
 const child=spawn(path.join(bin,'psql'),args(),{env,stdio:['pipe','pipe','pipe']});
 const c={child,stdout:'',stderr:'',closed:false,code:null};clients.push(c);
 child.stdout.on('data',b=>{c.stdout+=b;});child.stderr.on('data',b=>{c.stderr+=b;});
 child.stdin.on('error',()=>{});child.on('close',code=>{c.code=code;c.closed=true;});
 child.stdin.write('begin;'+sql+"select 'HISTORY_HELD';\n");
 await waitFor(()=>c.stdout.includes('HISTORY_HELD')||c.closed,'Fixture did not reach held state');
 assert.ok(!c.closed,c.stderr);return c;
};
const finish=async(c,sql='commit;')=>{c.child.stdin.end(sql+'\n');await waitFor(()=>c.closed,'Fixture did not close');assert.equal(c.code,0,c.stderr);};
const record=(name,fn)=>{fn();cases.push(name);};
let startAttempted=false,started=false,report;
const cleanup={sessionsClosed:false,clusterStopped:false,clusterNotRunningVerified:false,directoryRemoved:false};
const began=Date.now();
try{
 const engine=invoke('postgres',['--version']);assert.match(engine,/PostgreSQL\) 17\.6/u);
 invoke('initdb',['-D',data,'-U','postgres','--encoding=UTF8','--no-locale','--auth=trust']);
 startAttempted=true;invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(directory,'server.log'),'-o',
  `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c max_prepared_transactions=0 -c autovacuum=off`,'start']);started=true;
 invoke('psql',args('postgres'),`create database ${db};`);q(install.sql);
 q(`alter table auth.users enable row level security;alter table auth.users force row level security;
 alter table auth.sessions enable row level security;alter table auth.sessions force row level security;`);

 record('New history entrypoint is authenticated-only; tables/private projections and privileged capability stay closed',()=>{
  api.reset();
  for(const role of ['anon','service_role'])reject(`set role ${role};set request.jwt.claims='{"role":"authenticated"}';
   select public.isolated_sandbox_tips_v1('capability.read','{}','${SELLER}','${SELLER_SESSION}');`,/permission denied/u);
  for(const expression of ['select * from sandbox_commerce_v1.intent_abandonments;',
   `select sandbox_commerce_v1.creator_capability_read('${SELLER}','${SELLER_SESSION}');`,
   `select sandbox_commerce_v1.history_attempt('${randomUUID()}','${BUYER_SESSION}','${BUYER}');`])
   reject('set role authenticated;'+expression,/permission denied/u);
  assert.equal(q("select pg_get_userbyid(proowner) from pg_proc where oid='sandbox_commerce_v1.creator_capability_read(uuid,uuid)'::regprocedure;"),'postgres');
 });
 record('Current capability distinguishes creator admission, free buyer Premium requirement and explicit declaration',()=>{
  api.reset();const seller=call('capability.read');assert.equal(seller.canAuthor,true);assert.equal(seller.creatorReason,'eligible');
  assert.equal(seller.declaration.declared18Plus,true);assert.equal(seller.checkoutConnected,false);
  const buyer=call('capability.read',{},BUYER,BUYER_SESSION);assert.equal(buyer.canAuthor,false);assert.equal(buyer.creatorReason,'premium_required');
  q(`update sandbox_commerce_v1.declarations set declared_18_plus=false where user_id='${SELLER}';`);
  assert.equal(call('capability.read').creatorReason,'creator_eligibility_required');
 });
 record('Capability retains precise creator legal/control failure while base account legal denial is an error',()=>{
  api.reset();q(`delete from public.wave1_legal_acceptances where user_id='${SELLER}' and capability='creator_money';`);
  assert.equal(call('capability.read').creatorReason,'creator_legal_required');
  api.reset();q("update public.platform_money_kill_switches set state='on' where key='live_money_enabled';");
  assert.equal(call('capability.read').creatorReason,'financial_controls_unavailable');
  q(`delete from public.wave1_legal_acceptances where user_id='${SELLER}' and capability='account';`);
  reject(command('capability.read'),/sandbox_current_legal_required/u);
 });
 record('Studio returns own actual titles, offers and catalog; an empty free-owner studio is not missing authority',()=>{
  const c=fresh();const studio=call('studio.read',{cursor:null,limit:10});
  assert.equal(studio.resources[0].id,c.resource.id);assert.equal(studio.resources[0].title,'Synthetic provider tip');
  assert.equal(studio.resources[0].offers[0].id,c.offer.id);assert.equal(studio.catalog[0].amountMinor,99);
  assert.equal(call('studio.read',{cursor:null,limit:10},BUYER,BUYER_SESSION).resources.length,0);
  assert.equal(call('offer.read',{offerId:c.offer.id},BUYER,BUYER_SESSION).offer.checkoutConnected,false);
 });
 record('Studio and exact resource recovery have bounded empty, ten-offer and truncated previews',()=>{
  const c=fresh();const draft=api.command('resource.create',{kind:'creator_tip',title:'Empty offer draft'},SELLER,SELLER_SESSION).data.resource;
  const empty=call('studio.read',{cursor:null,limit:10}).resources.find(r=>r.id===draft.id);
  assert.deepEqual(empty.offers,[]);assert.equal(empty.offersNextCursor,null);assert.equal(empty.offersTruncated,false);
  assert.deepEqual(call('offers.read',{resourceId:draft.id,cursor:null,limit:50}),{resourceId:draft.id,offers:[],nextCursor:null});
  offerCopies(c,9);
  const exact=call('studio.read',{cursor:null,limit:10}).resources.find(r=>r.id===c.resource.id);
  assert.equal(exact.offers.length,10);assert.equal(exact.offersNextCursor,null);assert.equal(exact.offersTruncated,false);
  offerCopies(c,1);
  const preview=call('studio.read',{cursor:null,limit:10}).resources.find(r=>r.id===c.resource.id);
  assert.equal(preview.offers.length,10);assert.equal(preview.offersTruncated,true);assert.ok(preview.offersNextCursor);
  assert.equal(preview.offersNextCursor.id,preview.offers.at(-1).id.replace('scv1_offer_',''));
  const original=q(`select request_id from sandbox_commerce_v1.requests where command='resource.create'
   and result#>>'{data,resource,id}'=${sqlText(c.resource.id)};`);
  const recovery=call('request.read',{originalRequestId:original}).resource;
  assert.equal(recovery.offers.length,10);assert.equal(recovery.offersTruncated,true);assert.ok(recovery.offersNextCursor);
 });
 record('Offer continuation preserves tied ordering and insertion cutoff while returning current retirement state',()=>{
  const c=fresh();offerCopies(c,54);
  const expected=q(`select 'scv1_offer_'||id from sandbox_commerce_v1.offers
   where resource_id=${sqlText(c.resource.id.replace('scv1_resource_',''))} order by created_at desc,id desc;`).split('\n');
  const preview=call('studio.read',{cursor:null,limit:10}).resources[0];
  const later=api.command('offer.publish',{resourceId:c.resource.id,expectedRevision:c.resource.revision,
   amountMinor:c.amountMinor,currency:'usd'},SELLER,SELLER_SESSION).data.offer;
  const retiredId=expected[12];call('offer.retire',{offerId:retiredId,expectedRevision:1});
  q(`delete from public.user_entitlements where user_id='${SELLER}';update sandbox_commerce_v1.lifecycle set state='retired';`);
  const all=[...preview.offers];let cursor=preview.offersNextCursor;
  while(cursor){const page=call('offers.read',{resourceId:c.resource.id,cursor,limit:13});
   assert.ok(page.offers.length<=13);if(page.nextCursor){assert.equal(page.offers.length,13);assert.equal(page.nextCursor.asOf,preview.offersNextCursor.asOf);}
   all.push(...page.offers);cursor=page.nextCursor;
  }
  assert.deepEqual(all.map(o=>o.id),expected);assert.equal(new Set(all.map(o=>o.id)).size,55);
  assert.ok(!all.some(o=>o.id===later.id));assert.equal(all.find(o=>o.id===retiredId).status,'retired');
  assert.equal(all.find(o=>o.id===retiredId).available,false);
 });
 record('Offer pages enforce owner and exact current session while preserving retained read-only access',()=>{
  const c=fresh(),sid=randomUUID();addSession(SELLER,sid);
  const payload={resourceId:c.resource.id,cursor:null,limit:50};
  const before=q('select count(*) from sandbox_commerce_v1.requests;');
  reject(command('offers.read',payload,BUYER,BUYER_SESSION),/sandbox_resource_unavailable/u);
  reject(command('offers.read',payload,SELLER,sid,SELLER_SESSION),/sandbox_account_binding_invalid/u);
  q(`delete from public.user_entitlements where user_id='${SELLER}';update sandbox_commerce_v1.lifecycle set state='retired';
   delete from auth.sessions where id='${SELLER_SESSION}';`);
  reject(command('offers.read',payload),/sandbox_current_session_required/u);
  assert.equal(call('offers.read',payload,SELLER,sid).offers[0].id,c.offer.id);
  assert.equal(q('select count(*) from sandbox_commerce_v1.requests;'),before);
  reject(command('offers.read',{...payload,resourceId:'scv1_resource_'+randomUUID()},SELLER,sid),/sandbox_resource_unavailable/u);
 });
 record('Offer pages honor the maximum fifty rows and reject malformed or oversized page requests',()=>{
  const c=fresh();offerCopies(c,50);
  const first=call('offers.read',{resourceId:c.resource.id,cursor:null,limit:50});
  assert.equal(first.offers.length,50);assert.ok(first.nextCursor);
  const last=call('offers.read',{resourceId:c.resource.id,cursor:first.nextCursor,limit:50});
  assert.equal(last.offers.length,1);assert.equal(last.nextCursor,null);
  assert.equal(new Set([...first.offers,...last.offers].map(o=>o.id)).size,51);
  for(const limit of [0,-1,1.5,'2',51])reject(command('offers.read',{resourceId:c.resource.id,cursor:null,limit}),/sandbox_page_invalid/u);
  reject(command('offers.read',{resourceId:null,cursor:null,limit:10}),/sandbox_command_payload_invalid/u);
  reject(command('offers.read',{resourceId:c.resource.id,cursor:{asOf:'infinity',createdAt:'infinity',id:randomUUID()},limit:10}),/sandbox_page_invalid/u);
 });
 record('Missing request recovery is read-only unknown even with a free advisory key',()=>{
  api.reset();const before=q('select count(*) from sandbox_commerce_v1.requests;');
  const r=call('request.read',{originalRequestId:randomUUID()},BUYER,BUYER_SESSION);
  assert.equal(r.resolution,'unknown');assert.equal(r.noDispatchProven,false);assert.equal(r.retryAllowed,false);
  assert.equal(r.recordedCommand,null);assert.equal(q('select count(*) from sandbox_commerce_v1.requests;'),before);
 });
 {
  api.reset();const originalId=randomUUID();
  const c=await held(`select pg_advisory_xact_lock(hashtextextended('sandbox-commerce-v1:${BUYER}:${originalId}',683));`);
  const result=call('request.read',{originalRequestId:originalId},BUYER,BUYER_SESSION);
  assert.equal(result.resolution,'busy');assert.equal(result.noDispatchProven,false);await finish(c);
  cases.push('An in-flight original request returns busy without waiting, mutation or absence proof');
 }
 record('Exact request recovery returns canonical original payload and current retained projection, never repeats mutation',()=>{
  const c=fresh(),id=originalRequest(c);const before=q('select count(*) from sandbox_commerce_v1.intents;');
  q(`update sandbox_commerce_v1.intents set created_at=statement_timestamp()-interval '2 seconds',
   expires_at=statement_timestamp()-interval '1 second' where id='${c.rawIntentId}';`);
  const r=call('request.read',{originalRequestId:id},BUYER,BUYER_SESSION);
  assert.equal(r.resolution,'found');assert.equal(r.recordedCommand,'checkout.prepare');assert.equal(r.recordedPayload.requestId,id);
  assert.equal(r.entry.status,'expired');assert.equal(r.noDispatchProven,false);assert.equal(r.recordedSessionId,BUYER_SESSION);
  assert.equal(r.entry.offerRevision,c.offer.revision);assert.equal(r.entry.resourceRevision,c.resource.revision);
  assert.equal(q('select count(*) from sandbox_commerce_v1.intents;'),before);
 });
 record('A real pre-prepare quote is confirmed only by the same original request and immutable persisted intent tuple',()=>{
  api.reset();const scope=api.seedCatalog();
  const resource=api.command('resource.create',{kind:'creator_tip',title:'Quoted recovery tip'},SELLER,SELLER_SESSION).data.resource;
  const offer=api.command('offer.publish',{resourceId:resource.id,expectedRevision:resource.revision,
   amountMinor:scope.amountMinor,currency:'usd'},SELLER,SELLER_SESSION).data.offer;
  const observed=call('offer.read',{offerId:offer.id},BUYER,BUYER_SESSION).offer;
  const quote={offerId:observed.id,offerRevision:observed.revision,resourceId:observed.resourceId,
   resourceRevision:observed.resourceRevision,creatorId:observed.creatorId,kind:observed.kind,
   amountMinor:observed.amountMinor,currency:observed.currency};
  const payload={offerId:quote.offerId,expectedRevision:quote.offerRevision};
  const response=api.command('checkout.prepare',payload,BUYER,BUYER_SESSION);
  const recoveryPayload=body({originalRequestId:response.requestId});
  const result=call('request.read',recoveryPayload,BUYER,BUYER_SESSION),recoveryResponse=captures.at(-1).response;
  assert.equal(result.resolution,'found');assert.equal(result.recordedCommand,'checkout.prepare');
  assert.equal(result.recordedSessionId,BUYER_SESSION);assert.equal(result.recordedPayload.requestId,response.requestId);
  assert.equal(result.entry.id,response.data.intent.id);
  for(const [key,value]of Object.entries(quote))assert.equal(result.entry[key],value);
  checkoutCaptures.push({actor:{...response.actor,state:'ACTIVE',restoreOnly:false},command:'checkout.prepare',
   requestId:response.requestId,payload,quote,response,recovery:{requestId:recoveryPayload.requestId,response:recoveryResponse}});
 });
 record('Authoring recovery projects exact recorded requests and current owned declaration/resource/offer state',()=>{
  const c=fresh();
  for(const [recorded,field,id]of[['resource.create','resource',c.resource.id],['offer.publish','offer',c.offer.id]]){
   const original=q(`select request_id from sandbox_commerce_v1.requests where command=${sqlText(recorded)}
    and result#>>${sqlText('{data,'+field+',id}')}=${sqlText(id)};`);
   const found=call('request.read',{originalRequestId:original});
   assert.equal(found.resolution,'found');assert.equal(found.recordedCommand,recorded);assert.equal(found[field].id,id);
   for(const other of ['resource','offer','entry','declaration'].filter(x=>x!==field))assert.equal(found[other],null);
  }
  const declared=api.command('creator.declare',{declared18Plus:true,countryCode:'US',regionCode:null,
   declarationVersion:'adult-us-creator-v1'},SELLER,SELLER_SESSION);
  assert.equal(declared.status,'ok');
  q(`update sandbox_commerce_v1.declarations set declared_18_plus=false where user_id='${SELLER}';`);
  const found=call('request.read',{originalRequestId:declared.requestId});
  assert.equal(found.recordedPayload.declared18Plus,true);assert.equal(found.declaration.declared18Plus,false);
  assert.equal(found.recordedSessionId,SELLER_SESSION);assert.equal(found.noDispatchProven,false);
 });
 record('New-session and A-to-B-to-A reads preserve original ownership/session and reject stale expected-session claims',()=>{
  const c=fresh(),id=originalRequest(c),sid=randomUUID(),other=randomUUID(),otherSid=randomUUID();addSession(BUYER,sid);
  q(`insert into auth.users(id,email_confirmed_at,raw_app_meta_data) values('${other}',clock_timestamp(),'{}');`);addSession(other,otherSid);
  assert.equal(call('status.read',{intentId:c.intent.id,receiptId:null},BUYER,sid).entry.originalSessionMatchesCurrent,false);
  assert.equal(call('request.read',{originalRequestId:id},BUYER,sid).recordedSessionId,BUYER_SESSION);
  assert.equal(call('request.read',{originalRequestId:id},other,otherSid).resolution,'unknown');
  reject(command('status.read',{intentId:c.intent.id,receiptId:null},other,otherSid),/sandbox_history_unavailable/u);
  reject(command('status.read',{intentId:c.intent.id,receiptId:null},BUYER,sid,BUYER_SESSION),/sandbox_account_binding_invalid/u);
  q(`delete from auth.sessions where id='${BUYER_SESSION}';`);
  reject(command('status.read',{intentId:c.intent.id,receiptId:null},BUYER,BUYER_SESSION),/sandbox_current_session_required/u);
  assert.equal(call('status.read',{intentId:c.intent.id,receiptId:null},BUYER,sid).entry.id,c.intent.id);
  assert.equal(q(`select buyer_session_id from sandbox_commerce_v1.intents where id='${c.rawIntentId}';`),BUYER_SESSION);
 });
 record('History keyset pages are stable across timestamp ties and later inserts, with account scoping',()=>{
  api.reset();const scope=api.seedCatalog();const items=Array.from({length:5},()=>api.prepare(scope));
  q("update sandbox_commerce_v1.intents set created_at=statement_timestamp()-interval '1 minute';");
  const first=call('history.read',{role:'buyer',cursor:null,limit:2},BUYER,BUYER_SESSION);assert.ok(first.nextCursor);
  const later=api.prepare(scope);let ids=first.items.map(i=>i.id),cursor=first.nextCursor;
  while(cursor){const page=call('history.read',{role:'buyer',cursor,limit:2},BUYER,BUYER_SESSION);ids.push(...page.items.map(i=>i.id));cursor=page.nextCursor;}
  assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);assert.ok(!ids.includes(later.intent.id));
  assert.deepEqual([...ids].sort(),items.map(i=>i.intent.id).sort());
  assert.equal(call('history.read',{role:'creator',cursor:null,limit:50},BUYER,BUYER_SESSION).items.length,0);
 });
 record('Verified/refunded receipts remain discoverable for buyer and creator after Premium loss, retirement and title changes',()=>{
  const c=fresh();api.beginDispatch(c);const receipt=api.receipt(c);const stored=api.invokeReceipt(receipt);assert.equal(stored.status,'processed');
  q(`delete from public.user_entitlements where user_id='${SELLER}';update sandbox_commerce_v1.resources set title='Current changed title',revision=revision+1;
   update sandbox_commerce_v1.lifecycle set state='retired';`);
  for(const [user,sid,role]of[[BUYER,BUYER_SESSION,'buyer'],[SELLER,SELLER_SESSION,'creator']]){
   const item=call('history.read',{role,cursor:null,limit:10},user,sid).items[0];assert.equal(item.receipt.status,'verified');
   assert.equal(item.amountMinor,99);assert.equal(item.title,undefined);assert.equal(item.buyerId,undefined);
   assert.equal(item.offerRevision,c.offer.revision);assert.equal(item.resourceRevision,c.resource.revision);
   assert.equal(call('status.read',{intentId:null,receiptId:'scv1_receipt_'+stored.receiptId},user,sid).entry.id,c.intent.id);
  }
  assert.equal(api.invokeReceipt(api.terminal(receipt)).status,'processed');
  assert.equal(call('status.read',{intentId:c.intent.id,receiptId:null},BUYER,BUYER_SESSION).entry.receipt.status,'refunded');
  const cap=call('capability.read');assert.equal(cap.canAuthor,false);assert.equal(cap.generationState,'retired');
 });
 record('Owner can retire after Premium loss and generation retirement; exact replay reprojects without another revision',()=>{
  const c=fresh(),p=body({offerId:c.offer.id,expectedRevision:c.offer.revision});
  q(`delete from public.user_entitlements where user_id='${SELLER}';update sandbox_commerce_v1.lifecycle set state='retired';`);
  reject(command('offer.retire',p,BUYER,BUYER_SESSION),/sandbox_offer_unavailable/u);
  const retired=call('offer.retire',p).offer;assert.equal(retired.status,'retired');assert.equal(retired.available,false);
  assert.equal(retired.revision,c.offer.revision+1);assert.equal(call('offer.retire',p).offer.revision,retired.revision);
  assert.equal(call('status.read',{intentId:c.intent.id,receiptId:null},BUYER,BUYER_SESSION).entry.offerRevision,c.offer.revision);
  assert.equal(call('request.read',{originalRequestId:p.requestId}).offer.status,'retired');
  reject(command('offer.retire',{...p,expectedRevision:retired.revision}),/sandbox_idempotency_conflict/u);
 });
 record('Exact undispatched abandonment under a new owner session preserves original identity and creates a durable tombstone',()=>{
  const c=fresh(),original=originalRequest(c),sid=randomUUID();addSession(BUYER,sid);
  const p=body({intentId:c.intent.id,originalRequestId:original});
  reject(command('checkout.abandon',{intentId:c.intent.id,originalRequestId:randomUUID()},BUYER,sid),/sandbox_original_request_mismatch/u);
  const result=call('checkout.abandon',p,BUYER,sid);assert.equal(result.noDispatchProven,true);
  assert.equal(result.entry.status,'abandoned');assert.equal(result.abandonment.originalSessionId,BUYER_SESSION);
  assert.equal(result.abandonment.abandonedBySessionId,sid);assert.equal(result.entry.providerDispatchAllowed,false);
  assert.deepEqual(call('checkout.abandon',p,BUYER,sid).abandonment,result.abandonment);
  assert.equal(call('request.read',{originalRequestId:original},BUYER,sid).noDispatchProven,true);
  const creator=call('status.read',{intentId:c.intent.id,receiptId:null}).entry;
  assert.equal(creator.status,'abandoned');assert.equal(creator.abandonment,null);assert.equal(creator.noDispatchProven,false);
  assert.equal(q(`select buyer_session_id from sandbox_commerce_v1.intents where id='${c.rawIntentId}';`),BUYER_SESSION);
  reject(api.servicePrefix+`select public.isolated_sandbox_begin_dispatch_v1(${sqlText(c.intent.id)},'${c.dispatchId}');`,/sandbox_tip_dispatch_unavailable/u);
 });
 record('Later-session abandonment replay retains the original tombstone actor instead of rebinding it',()=>{
  const c=fresh(),p=body({intentId:c.intent.id,originalRequestId:originalRequest(c)}),sid=randomUUID();
  const first=call('checkout.abandon',p,BUYER,BUYER_SESSION);addSession(BUYER,sid);
  const replay=call('checkout.abandon',p,BUYER,sid);
  assert.deepEqual(replay.abandonment,first.abandonment);assert.equal(replay.entry.originalSessionMatchesCurrent,false);
  assert.equal(replay.abandonment.abandonedBySessionId,BUYER_SESSION);
  assert.equal(q('select count(*) from sandbox_commerce_v1.intent_abandonments;'),'1');
  assert.equal(q("select count(*) from sandbox_commerce_v1.requests where command='checkout.abandon';"),'1');
 });
 {
  const c=fresh(),original=originalRequest(c);
  const holder=await held(command('checkout.abandon',{intentId:c.intent.id,originalRequestId:original},BUYER,BUYER_SESSION));
  reject(api.servicePrefix+`select public.isolated_sandbox_begin_dispatch_v1(${sqlText(c.intent.id)},'${c.dispatchId}');`,/sandbox_dispatch_busy/u);
  assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'),'0');await finish(holder);
  assert.equal(call('status.read',{intentId:c.intent.id,receiptId:null},BUYER,BUYER_SESSION).entry.status,'abandoned');
  cases.push('Abandonment-first interleaving excludes dispatch under the same advisory gate until its tombstone commits');
 }
 {
  const c=fresh(),original=originalRequest(c);
  const holder=await held(api.servicePrefix+`select public.isolated_sandbox_begin_dispatch_v1(${sqlText(c.intent.id)},'${c.dispatchId}');`);
  reject(command('checkout.abandon',{intentId:c.intent.id,originalRequestId:original},BUYER,BUYER_SESSION),/sandbox_dispatch_busy/u);
  await finish(holder);
  reject(command('checkout.abandon',{intentId:c.intent.id,originalRequestId:original},BUYER,BUYER_SESSION),/sandbox_undispatched_abandonment_unavailable/u);
  assert.equal(q('select count(*) from sandbox_commerce_v1.intent_abandonments;'),'0');
  assert.equal(call('status.read',{intentId:c.intent.id,receiptId:null},BUYER,BUYER_SESSION).entry.dispatchState,'claimed');
  cases.push('Dispatch-first interleaving and committed uncertain claim never become no-dispatch proof');
 }
 {
  const c=fresh();const holder=await held(command('offer.retire',{offerId:c.offer.id,expectedRevision:c.offer.revision}));
  reject(api.servicePrefix+`select public.isolated_sandbox_begin_dispatch_v1(${sqlText(c.intent.id)},'${c.dispatchId}');`,/could not obtain lock/u);
  assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'),'0');await finish(holder);
  reject(api.servicePrefix+`select public.isolated_sandbox_begin_dispatch_v1(${sqlText(c.intent.id)},'${c.dispatchId}');`,/sandbox_tip_quote_changed/u);
  cases.push('Offer retirement wins before dispatch or makes its NOWAIT quote read fail without a claim');
 }
 {
  const c=fresh();const holder=await held(api.servicePrefix+`select public.isolated_sandbox_begin_dispatch_v1(${sqlText(c.intent.id)},'${c.dispatchId}');`);
  reject(command('offer.retire',{offerId:c.offer.id,expectedRevision:c.offer.revision}),/could not obtain lock/u);
  await finish(holder);
  assert.equal(call('offer.retire',{offerId:c.offer.id,expectedRevision:c.offer.revision}).offer.status,'retired');
  const current=call('status.read',{intentId:c.intent.id,receiptId:null},BUYER,BUYER_SESSION).entry;
  assert.equal(current.status,'provider_pending');assert.equal(current.dispatchState,'claimed');assert.equal(current.noDispatchProven,false);
  assert.equal(current.abandonment,null);assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'),'1');
  cases.push('Dispatch-first retirement waits on no row and preserves the committed uncertain provider claim');
 }
 record('Malformed page/status/command payloads fail rather than broadening access',()=>{
  api.reset();for(const [cmd,p]of[['studio.read',{cursor:null,limit:51}],['history.read',{role:'all',cursor:null,limit:10}],
   ['status.read',{intentId:null,receiptId:null}],['studio.read',{cursor:{asOf:'infinity',createdAt:'infinity',id:randomUUID()},limit:10}],
   ['request.read',{originalRequestId:randomUUID(),userId:BUYER}]])reject(command(cmd,p),/sandbox_page_invalid|sandbox_command_payload_invalid/u);
 });
 record('History and lifecycle actions create no buyer Premium, access grants or financial switch changes',()=>{
  const c=fresh(),original=originalRequest(c);
  const sharedSnapshot=()=>q(`select jsonb_build_object(
   'entitlements',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.user_entitlements t),
   'controls',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.platform_money_kill_switches t));`);
  const before=sharedSnapshot();
  call('capability.read');call('studio.read',{cursor:null,limit:10});
  call('offer.retire',{offerId:c.offer.id,expectedRevision:c.offer.revision});
  call('checkout.abandon',{intentId:c.intent.id,originalRequestId:original},BUYER,BUYER_SESSION);
  call('history.read',{role:'buyer',cursor:null,limit:10},BUYER,BUYER_SESSION);
  assert.equal(sharedSnapshot(),before);
  assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`),'0');
  assert.equal(q('select count(*) from sandbox_commerce_v1.grants;'),'0');
  assert.equal(q("select count(*) from public.platform_money_kill_switches where state<>'off';"),'0');
 });
 for(const [file,hash]of Object.entries(install.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(here,'..',file))).digest('hex'),hash);
 report={status:'passed',engine,caseCount:cases.length,cases,sourceHashes:install.sourceHashes,
  captureCounts:{history:captures.length,checkout:checkoutCaptures.length},
  scope:'Actual seven-file SQL on synthetic source projections. No provider authentication, hosted owner/Auth/pool or UI/device qualification.',
  fixtureLifecycleReset:'Disposable reset bypasses lifecycle only between independent cases; no runtime reset API.',
  paginationScope:'Immutable created_at/id keyset with insertion cutoff; mutable status remains current per page, not a historic MVCC snapshot.'};
}finally{
 for(const c of clients)if(!c.closed){c.child.stdin.end('rollback;\n');c.child.kill('SIGTERM');await waitFor(()=>c.closed,'Local client cleanup failed');}
 cleanup.sessionsClosed=clients.every(c=>c.closed);
 if(startAttempted){let s=run('pg_ctl',['-D',data,'status']);if(s.status===0){invoke('pg_ctl',['-D',data,'-m','immediate','-w','-t','15','stop']);cleanup.clusterStopped=true;s=run('pg_ctl',['-D',data,'status']);}else if(started&&s.status===3)cleanup.clusterStopped=true;
  assert.equal(s.status,3,'Local cluster status uncertain; retain data');assert.ok(started,'Uncertain startup; retain data');cleanup.clusterNotRunningVerified=true;
 }else{cleanup.clusterStopped=true;cleanup.clusterNotRunningVerified=true;}
 assert.ok(cleanup.sessionsClosed);fs.rmSync(directory,{recursive:true});cleanup.directoryRemoved=true;
}
assert.ok(report);
if(process.env.ISOLATED_SANDBOX_TIPS_FIXTURE){assert.ok(path.isAbsolute(process.env.ISOLATED_SANDBOX_TIPS_FIXTURE));fs.writeFileSync(process.env.ISOLATED_SANDBOX_TIPS_FIXTURE,JSON.stringify({protocol:'sandbox-commerce-v1',cases:captures,checkoutCases:checkoutCaptures,
 provenance:{synthetic:true,providerOrProductionCalls:false,quoteSource:'actual buyer offer.read before checkout.prepare; confirmed by exact original request.read',sourceHashes:install.sourceHashes}},null,2)+'\n');}
process.stdout.write(JSON.stringify({...report,durationMs:Date.now()-began,cleanup},null,2)+'\n');
