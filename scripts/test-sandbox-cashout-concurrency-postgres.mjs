#!/usr/bin/env node
// Real PostgreSQL lock proof. Only an owned clone of a local Supabase CLI DB;
// synthetic evidence, no provider traffic or changes to the source database.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
import {seedCashoutExecutionFixture,creator,session as actorSession} from '../tests/helpers/cashout-execution-fixture.mjs';
if(process.argv.includes('--help')){console.log('After local Supabase reset, test actual cashout locks in a generated disposable clone. No remote URLs or provider calls.');process.exit(0);}
assert.equal(process.argv.length,2,'no arbitrary target arguments');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/mu)?.[1];assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_sandbox_cashout`,restore=createBrandGuardCloneRestorer({container});
const lit=x=>x===null?'null':`'${String(x).replaceAll("'","''")}'`;
const args=(db=database,user='postgres')=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='20s';${sql}`),'local clone SQL').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','cashout-fixture-admin',...a],input,encoding);
const auth=(role,actor={creator,session:actorSession})=>`set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:actor.creator,session_id:actor.session}))};`;
const parse=text=>{const value=text.trim().split('\n').at(-1);if(value==='t')return true;if(value==='f')return false;try{return JSON.parse(value);}catch{return value;}};
const sessions=[];let cloned=false;
function start(sql){const name=`cashout-${randomUUID()}`,child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
 child.stdin.write(`set application_name=${lit(name)};set statement_timeout='25s';${sql}\n`);
 const s={name,child,done,output:()=>stdout};sessions.push(s);return s;}
async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(fn())return;await delay(25);}throw Error(label);}
const blocked=(holder,waiter)=>query(`select exists(select 1 from pg_stat_activity h,pg_stat_activity w where h.datname=current_database() and w.datname=current_database() and h.application_name=${lit(holder.name)} and w.application_name=${lit(waiter.name)} and h.pid=any(pg_blocking_pids(w.pid)));`)==='t';
try{
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
 assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
 assert.ok(success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n').includes(container));
 assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261102194000');",'postgres'),'t');
 success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create owned clone');cloned=true;
 query('create schema vault;create extension supabase_vault with schema vault;');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 success(dump,'read-only source export');success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore disposable clone');
 // Fixture uses connection-scoped roles/claims. One persistent psql batch is
 // assembled before each data query to preserve that explicit identity.
 let prefix='';const remember=sql=>{for(const statement of sql.split(';'))if(/^\s*(?:set (?:role|request\.)|reset role|select set_config\()/iu.test(statement))prefix+=`${statement};`;};
 const db={exec:async sql=>{query(`${prefix}${sql};`);remember(sql);},query:async(sql,values=[])=>{
  const expanded=sql.replace(/\$(\d+)/gu,(_,i)=>lit(values[Number(i)-1]));
  const output=query(`${prefix}${expanded};`);remember(expanded);return {rows:output?[{value:parse(output)}]:[]};}};
 const run=(actor,role,sql)=>parse(query(`begin;${auth(role,actor)}${sql}commit;`));
 const claim=(id,stage='funding')=>`select public.claim_sandbox_creator_cashout_dispatch(${lit(id)},${lit(stage)});`;
 const cancel=id=>`select public.cancel_undispatched_sandbox_creator_cashout(${lit(id)});`;
 const observe=(id,facts)=>`select public.record_sandbox_creator_cashout_observation(${lit(id)},null,${lit(JSON.stringify(facts))}::jsonb);`;
 const phase=id=>query(`select phase from private.sandbox_cashout_executions where id=${lit(id)};`);
 const request=(a,operation=randomUUID())=>`select public.request_sandbox_creator_cashout(9200,'instant',${lit(a.qualification)},${lit(operation)},184,25,8991);`;
 // Separate authenticated connections, real source-domain locks, and observed
 // pg_blocking_pids barriers: elapsed time alone is never concurrency evidence.
 let schedules=0;
 async function race(first,second,outcome='commit'){
  const h=start(`begin;${first}select 'HOLDING';`);
  await until(()=>h.output().includes('HOLDING'),'first operation did not reach lock barrier');
  const w=start(`begin;${second}commit;`);w.child.stdin.end();
  await until(()=>blocked(h,w),'second operation did not block on the real transaction');
  h.child.stdin.end(`${outcome};\n`);const held=await h.done;assert.equal(held.code,0,held.stderr);
  const waited=await w.done;schedules++;return {held,waited};
 }
 const passed=r=>assert.equal(r.code,0,r.stderr);
 const failed=(r,error)=>{assert.notEqual(r.code,0);assert.match(r.stderr,error);};
 const production=()=>query(`select md5(jsonb_build_array(
  (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.money_access_ledger_events t where environment='production'),
  (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.creator_earnings_ledger t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.creator_payout_requests t),
  (select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from private.creator_cashout_executions t))::text);`);
 async function seed(){
  await db.exec('reset role');
  const a=await seedCashoutExecutionFixture(db,{creatorId:randomUUID(),sessionId:randomUUID(),recipientAccountId:'acct_'+randomUUID().replaceAll('-',''),reserveInitialRequest:false});
  // Provider account IDs are globally unique across mode rows. The test-mode
  // binding must be a distinct account, never reuse/convert the live fixture.
  a.accountId='acct_test'+randomUUID().replaceAll('-','');
  // Existing helper seeds synthetic live controls in this disposable clone;
  // close all live gates before ANY sandbox operation. Nothing calls a provider.
  query(`reset role;update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled','cashout_enabled');
   update public.platform_money_kill_switches set state='sandbox_only' where key in ('stripe_connect_enabled','creator_monetization_enabled','provider_webhooks_enabled');
   update private.sandbox_cashout_control set enabled=true;
   insert into public.sandbox_monetization_testers(user_id,email,status,expires_at) values(${lit(a.creator)},${lit('native-'+a.creator+'@example.test')},'active',now()+interval '1 day');
   insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,country) values(${lit(a.creator)},'stripe_connect','test',${lit(a.accountId)},'US');`);
  a.qualification=query(`insert into private.sandbox_cashout_qualifications(creator_id,platform_account_id,account_id,destination_id,payout_type,source_type,
   provider_fee_bps,provider_fee_fixed_minor,settlement_policy_version,simulated_tax_bps,simulated_platform_bps,simulated_provider_bps,simulated_provider_fixed_minor,
   manual_schedule_verified,exclusive_writer_verified,zero_additional_application_fee_verified,platform_fee_payer_verified,test_mode_verified,provider_evidence_reference,verified_at,expires_at)
   values(${lit(a.creator)},'acct_sandboxPlatform',${lit(a.accountId)},'ba_sandboxDestination','instant','card',0,25,'synthetic-native-v1',0,1000,0,0,
   true,true,true,true,true,'SYNTHETIC DISPOSABLE TEST ONLY',now()-interval '1 minute',now()+interval '1 day') returning id;`);
  const buyer=randomUUID();query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values(${lit(buyer)},${lit(buyer+'@example.test')},now(),false,false);`);
  a.sources=[];
  for(const [amount,currency] of [[10000,'usd'],[333,'usd'],[100000,'eur']]){
   const event=randomUUID(),money=randomUUID();
   query(`insert into public.provider_events(id,provider,provider_event_id,user_id,environment,event_type,status,idempotency_key)
    values(${lit(event)},'revenuecat_app_store',${lit(event)},${lit(buyer)},'sandbox','INITIAL_PURCHASE','processed',${lit(event)});
    insert into public.money_access_ledger_events(id,user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,metadata)
    values(${lit(money)},${lit(buyer)},${lit(a.creator)},${lit(event)},'INITIAL_PURCHASE',${amount},${lit(currency)},'sandbox','not_payable','sandbox_only','tip',${lit(JSON.stringify({original_transaction_id:event}))}::jsonb);`);
   a.sources.push(money);
  }
  a.production=production();return a;
 }
 // Physical earnings use the real order/tax binding and canonical webhook
 // processor. Never create a digital provider event or money ledger for merch.
 function seedMerch(a){
  const buyer=randomUUID(),product=randomUUID(),id=randomUUID(),suffix=id.replaceAll('-','');
  const digitalCounts=()=>query('select (select count(*) from public.provider_events)||\':\'||(select count(*) from public.money_access_ledger_events);');
  const before=digitalCounts();
  query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values(${lit(buyer)},${lit(buyer+'@example.test')},now(),false,false);
   insert into public.merch_products(id,display_name,product_key,provider,status,environment,price_minor,currency,inventory_status,shipping_tracking_mode)
   values(${lit(product)},'Synthetic native physical merch',${lit('native_'+suffix)},'stripe_physical_goods','sandbox','sandbox',1000,'usd','in_stock','tracked');
   insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
    professional_basis_reference,coverage_evidence_reference,full_permitted_scope_reviewed,collection_mode,liability_type,tax_code,tax_behavior,
    registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,enabled,provider_verified_at,provider_expires_at,expires_at)
   values('physical_merch',${lit(product)},'acct_sandboxPlatform','sandbox','US_all_destinations','all_supported_platforms',
    'SYNTHETIC TEST ONLY','SYNTHETIC TEST ONLY',true,'automatic','self','txcd_99999999','inclusive','SYNTHETIC TEST ONLY',
    'SYNTHETIC TEST ONLY','SYNTHETIC TEST ONLY',true,now(),now()+interval '1 hour',now()+interval '1 hour');
   insert into public.merch_orders(id,buyer_id,creator_id,product_id,provider,environment,order_status,fulfillment_status,payment_status,
    amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
   values(${lit(id)},${lit(buyer)},${lit(a.creator)},${lit(product)},'stripe_physical_goods','sandbox','pending','not_started','pending',1000,1000,'usd',${lit('cs_test_'+suffix)},${lit('pi_'+suffix)});`);
  assert.equal(run(a,'service_role',`select public.bind_commerce_tax_checkout_policy('physical_merch',${lit(id)},${lit(product)},'acct_sandboxPlatform','sandbox','US_all_destinations');`).ready,true);
  const facts={event_livemode:false,object_livemode:false,object_id:'cs_test_'+suffix,object_type:'checkout.session',payment_intent_id:'pi_'+suffix,
   metadata_order_id:id,metadata_buyer_id:buyer,client_reference_id:id,mode:'payment',status:'complete',payment_status:'paid',amount_minor:1000,currency:'usd'};
  const webhook=(type,body)=>`select public.process_stripe_merch_webhook_lifecycle(${lit('evt_'+randomUUID().replaceAll('-',''))},${lit(type)},${lit(createHash('sha256').update(JSON.stringify(body)).digest('hex'))},${lit(JSON.stringify(body))}::jsonb);`;
  assert.equal(run(a,'service_role',webhook('checkout.session.completed',facts)).reason,'payment_confirmed');
  assert.equal(parse(query(`select private.sandbox_cashout_merch_source(${lit(id)},${lit(a.qualification)});`)).netMinor,900);
  assert.equal(digitalCounts(),before,'physical sale must not fabricate digital accounting');
  return {id,refund:()=>webhook('charge.refunded',{...facts,object_type:'charge',object_id:'ch_'+suffix,refunded_amount_minor:1000,refunded:true}),assertNoDigital:()=>assert.equal(digitalCounts(),before)};
 }
 function invariants(a){
  assert.equal(production(),a.production,'sandbox operations changed production accounting');
  assert.equal(query(`select count(*) from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled','cashout_enabled') and state='off';`),'3');
  assert.equal(query(`select count(*) from private.sandbox_cashout_allocations a join public.money_access_ledger_events m on m.id=a.money_ledger_id where m.currency<>'usd' or m.environment<>'sandbox';`),'0');
  assert.equal(query(`select count(*) from public.money_access_ledger_events where creator_id=${lit(a.creator)} and environment='sandbox' and payable_state='payable';`),'0');
 }
 function funded(a){
  const id=run(a,'authenticated',request(a)).requestId;
  assert.equal(run(a,'service_role',claim(id)).claimed,true);
  a.transfer='tr_'+randomUUID().replaceAll('-','');
  assert.equal(run(a,'service_role',observe(id,{kind:'transfer',objectId:a.transfer,amountMinor:8991,reversedMinor:0,fullyReversed:false,accountId:a.accountId,environment:'test'})).status,'funded');
  return id;
 }
 // Same operation replay and competing operations both wait on real source
 // rows; only one execution owns the two USD allocations after commit.
 for(const sameOperation of [true,false]){
  const a=await seed(),op=randomUUID();
  const {held,waited}=await race(auth('authenticated',a)+request(a,op),auth('authenticated',a)+request(a,sameOperation?op:randomUUID()));
  if(sameOperation){passed(waited);assert.equal(parse(held.stdout.split('HOLDING')[0]).requestId,parse(waited.stdout).requestId);}
  else failed(waited,/sandbox_cashout_already_pending/);
  assert.equal(query(`select count(*) from private.sandbox_cashout_executions where creator_id=${lit(a.creator)};`),'1');
  assert.equal(query(`select count(*)||':'||sum(amount_minor) from private.sandbox_cashout_allocations where execution_id in(select id from private.sandbox_cashout_executions where creator_id=${lit(a.creator)});`),'2:9200');
  invariants(a);
 }
 const mixedRequest=a=>`select public.request_sandbox_creator_cashout(10000,'instant',${lit(a.qualification)},${lit(randomUUID())},200,25,9775);`;
 // Both requests share one creator: the mixed request needs 9299 digital plus
 // 701 physical units, while the competing 9200 request is digital-only.
 for(const first of ['mixed','digital']){
  const a=await seed(),merch=seedMerch(a);
  const {waited}=await race(auth('authenticated',a)+(first==='mixed'?mixedRequest(a):request(a)),auth('authenticated',a)+(first==='mixed'?request(a):mixedRequest(a)));
  failed(waited,/sandbox_cashout_already_pending/);
  assert.equal(query(`select count(*) from private.sandbox_cashout_executions where creator_id=${lit(a.creator)};`),'1');
  assert.equal(query(`select sum(amount_minor) from private.sandbox_cashout_allocations where execution_id in(select id from private.sandbox_cashout_executions where creator_id=${lit(a.creator)});`),first==='mixed'?'9299':'9200');
  assert.equal(query(`select coalesce(sum(amount_minor),0) from private.sandbox_cashout_merch_allocations where order_id=${lit(merch.id)};`),first==='mixed'?'701':'0');
  merch.assertNoDigital();invariants(a);
 }
 // Canonical physical refund owns the order row before claim arrives. Its
 // commit fences funding; rollback preserves both domains and admits once.
 for(const outcome of ['commit','rollback']){
  const a=await seed(),merch=seedMerch(a),id=run(a,'authenticated',mixedRequest(a)).requestId;
  const {held,waited}=await race(auth('service_role',a)+merch.refund(),auth('service_role',a)+claim(id),outcome);
  assert.equal(parse(held.stdout.split('HOLDING')[0]).reason,'full_refund_recorded');
  if(outcome==='commit'){failed(waited,/sandbox_source_reconciliation_required/);assert.equal(phase(id),'prepared');}
  else {passed(waited);assert.equal(parse(waited.stdout).claimed,true);assert.equal(phase(id),'funding_unknown');}
  assert.equal(query(`select count(*) from private.sandbox_cashout_merch_simulated_returns where execution_id=${lit(id)};`),'0');
  assert.equal(query(`select sum(amount_minor) from private.sandbox_cashout_merch_allocations where execution_id=${lit(id)};`),'701');
  merch.assertNoDigital();invariants(a);
 }
 // Committed refunds/revocations deny dispatch; rolled-back changes cannot
 // poison the source or leave durable dispatch state after a rolled-back claim.
 for(const mutation of ['refund','revocation'])for(const outcome of ['commit','rollback']){
  const a=await seed(),id=run(a,'authenticated',request(a)).requestId;
  const change=mutation==='refund'?`update public.money_access_ledger_events set payable_state='refunded',status='refunded' where id=${lit(a.sources[0])};`
   :`insert into private.sandbox_cashout_revocations(qualification_id) values(${lit(a.qualification)});`;
  const {waited}=await race(change,auth('service_role',a)+claim(id),outcome);
  if(outcome==='commit'){failed(waited,mutation==='refund'?/sandbox_source_reconciliation_required/:/sandbox_cashout_provider_qualification_required/);assert.equal(phase(id),'prepared');}
  else {passed(waited);assert.equal(parse(waited.stdout).claimed,true);assert.equal(phase(id),'funding_unknown');}
  invariants(a);
 }
 // Claim/cancel commit and rollback schedules, including duplicate claims.
 for(const mutation of ['session','tester','control'])for(const outcome of ['commit','rollback']){
  const a=await seed(),id=run(a,'authenticated',request(a)).requestId;
  const change=mutation==='session'?`update auth.sessions set not_after=now()-interval '1 minute' where id=${lit(a.session)};`
   :mutation==='tester'?`update public.sandbox_monetization_testers set status='revoked' where user_id=${lit(a.creator)};`
   :'update private.sandbox_cashout_control set enabled=false;';
  const {waited}=await race(change,auth('service_role',a)+claim(id),outcome);
  if(outcome==='commit'){failed(waited,mutation==='control'?/sandbox_payout_execution_disabled/:/sandbox_origin_tester_required/);assert.equal(phase(id),'prepared');}
  else {passed(waited);assert.equal(parse(waited.stdout).claimed,true);assert.equal(phase(id),'funding_unknown');}
  invariants(a);
 }
 for(const outcome of ['commit','rollback']){
  const a=await seed(),id=run(a,'authenticated',request(a)).requestId;
  const {waited}=await race(auth('service_role',a)+claim(id),auth('authenticated',a)+cancel(id),outcome);
  if(outcome==='commit'){failed(waited,/sandbox_cashout_cannot_cancel/);assert.equal(phase(id),'funding_unknown');}
  else {passed(waited);assert.equal(phase(id),'canceled');}
  invariants(a);
 }
 {
  const a=await seed(),id=run(a,'authenticated',request(a)).requestId;
  const {waited}=await race(auth('service_role',a)+claim(id),auth('service_role',a)+claim(id));
  passed(waited);assert.equal(parse(waited.stdout).claimed,false);invariants(a);
 }
 for(const first of ['cancel','payout'])for(const outcome of ['commit','rollback']){
  const a=await seed(),id=funded(a);
  const {waited}=await race(auth(first==='cancel'?'authenticated':'service_role',a)+(first==='cancel'?cancel(id):claim(id,'payout')),
   auth(first==='cancel'?'service_role':'authenticated',a)+(first==='cancel'?claim(id,'payout'):cancel(id)),outcome);
  const payoutWon=(first==='payout'&&outcome==='commit')||(first==='cancel'&&outcome==='rollback');
  if(first==='payout'&&outcome==='commit')failed(waited,/sandbox_cashout_cannot_cancel/);else passed(waited);
  assert.equal(phase(id),payoutWon?'payout_unknown':'funding_return_pending');
  assert.equal(query(`select count(*) from private.sandbox_cashout_simulated_return_accounting where execution_id=${lit(id)};`),'0','cancel is not return proof');
  invariants(a);
 }
 // A late failed observation without balance proof must not erase committed
 // full-return proof. Two simultaneous terminal observations release once.
 {
  const a=await seed(),id=funded(a);run(a,'service_role',claim(id,'payout'));
  const payout={kind:'payout',objectId:'po_'+randomUUID().replaceAll('-',''),status:'failed',amountMinor:8991,accountId:a.accountId,destinationId:'ba_sandboxDestination',environment:'test'};
  const confirmed={...payout,returnedMinor:8991,returnTransactionId:'txn_nativeReturn'};
  const {waited}=await race(auth('service_role',a)+observe(id,confirmed),auth('service_role',a)+observe(id,payout));passed(waited);
  assert.equal(phase(id),'return_confirmed');
  run(a,'service_role',claim(id,'reversal'));
  const proof={kind:'reversal',objectId:'trr_'+randomUUID().replaceAll('-',''),transferId:a.transfer,amountMinor:8991,accountId:a.accountId,environment:'test'};
  const returned=await race(auth('service_role',a)+observe(id,proof),auth('service_role',a)+observe(id,proof));passed(returned.waited);
  assert.equal(phase(id),'returned');
  assert.equal(query(`select count(*)||':'||sum(released_minor)||':'||sum(retained_fixture_cost_minor) from private.sandbox_cashout_simulated_return_accounting where execution_id=${lit(id)};`),'2:9175:25');
  assert.equal(run(a,'authenticated',`select public.preview_sandbox_creator_cashout(9275,'instant');`).availableMinor,9274);
  const late=docker(args(),`begin;${auth('service_role',a)}${observe(id,{...payout,status:'pending'})}commit;`);
  assert.notEqual(late.status,0);assert.match(late.stderr,/sandbox_terminal_observation_conflict/);assert.equal(phase(id),'returned');
  invariants(a);
 }
 restore.assertSourceUnchanged();
 assert.equal(schedules,25,'all real-lock schedules executed');
 console.log('PASS native sandbox cashout: 25 actual-lock schedules including mixed digital/physical reservations, canonical merch refunds, refund/revocation/subject/control barriers, cancellation commit/rollback, monotonic returns and single release; production gates/accounting unchanged.');
}finally{
 for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end();s.child.kill('SIGTERM');}
 await Promise.allSettled(sessions.map(s=>s.done));
 if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--force',database]),'drop owned clone');
}
