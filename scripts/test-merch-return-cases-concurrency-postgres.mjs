#!/usr/bin/env node
// Native contention proof ONLY in an owned disposable clone of a local CLI DB.
// Synthetic carrier/payment facts; no HTTP, credential provisioning or payouts.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
import {runOrdinaryProfileMetadataRaces} from './lib/ordinary-profile-metadata-races.mjs';
import {runMerchCheckoutDispatchRaces} from './lib/merch-checkout-dispatch-races.mjs';
import {runMerchPublicationRaces} from './lib/merch-publication-races.mjs';
import {runMerchTaxCategoryRaces} from './lib/merch-tax-category-races.mjs';
import {runMerchLiveCheckoutRaces} from './lib/merch-live-checkout-races.mjs';
import {runMerchAdmissionCutoverRace} from './lib/merch-admission-cutover-race.mjs';
import {commerceActor,commerceSeedAdapter,seedQualifiedCommerceCreator} from '../tests/helpers/automatic-commerce-fixture.mjs';
import {runAutomaticCommerceObserverRaces} from './lib/automatic-commerce-observer-races.mjs';
import {runAutomaticCommerceDeclarationRaces} from './lib/automatic-commerce-declaration-races.mjs';
import {runAutomaticCommerceAuthorityRaces} from './lib/automatic-commerce-authority-races.mjs';
import {runOrdinaryNativeDispatchRaces} from './lib/ordinary-native-dispatch-races.mjs';

if(process.argv.includes('--help')){
  console.log('Run after local Supabase reset. Writes only a generated local clone. No remote URLs or provider calls.');process.exit(0);
}
assert.equal(process.argv.length,2,'no remote URL or positional arguments accepted');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/mu)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_merch_return_cases`;
const restore=createBrandGuardCloneRestorer({container});
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const json=x=>`${lit(JSON.stringify(x))}::jsonb`;
const args=(db=database,user='postgres')=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='20s';set time zone 'UTC';${sql}`),'fixture query').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc',
  'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','merch-return-cases-fixture-admin',...a],input,encoding);
const sessions=[];let serial=0,checks=0;
function session(sql,{admin=false}={}){
  const name=`merch-return-cases-${++serial}`;
  // Same local-clone admin transport as restore/export below. Only the
  // disabled-statistics observation fixture needs a superuser session; the
  // reservation holder/waiter and every prior schedule retain postgres.
  const command=admin?['exec','-i',container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"',
    'merch-return-cases-fixture-session',...args(database,'supabase_admin').slice(3)]:args();
  const child=spawn('docker',command,{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
  const adminGuard=admin?`do $fixture_admin$ begin if current_database()<>${lit(database)} or current_user<>'supabase_admin'
    or not current_setting('is_superuser')::boolean then raise exception 'wrong disposable fixture admin target';end if;end $fixture_admin$;`:'';
  child.stdin.write(`set application_name=${lit(name)};set statement_timeout='30s';set time zone 'UTC';${adminGuard}${sql}\n`);
  const s={child,done,output:()=>stdout,diagnostics:()=>({exitCode:child.exitCode,stderr}),name};sessions.push(s);return s;
}
async function until(predicate,label){const deadline=Date.now()+20000;while(Date.now()<deadline){if(predicate())return;await delay(25);}throw Error(label);}
const parsed=s=>JSON.parse(s.trim().split('\n').findLast(line=>line.startsWith('{')||line.startsWith('[')));
let cloned=false;
try{
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
  assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
  assert.ok(success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n').includes(container));
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261030212744');",'postgres'),'t','reset must include returns migration');
  success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create owned clone');cloned=true;
  query('create schema vault;create extension supabase_vault with schema vault;');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  success(dump,'read-only local source export');
  success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore owned clone');
  query(readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
  const actors=JSON.parse(query("select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors"));
  actors.creator=commerceActor();
  query('delete from public.sandbox_monetization_testers where user_id in(select user_id::text from event_reservation_fixture.actors)');
  query("update public.platform_money_kill_switches set state='off' where key='live_money_enabled'");
  await seedQualifiedCommerceCreator(commerceSeedAdapter(query),actors.creator);
  const auth=(who='creator',role='authenticated')=>`set local role ${role};set local request.jwt.claims=${json({role,sub:actors[who].id,session_id:actors[who].session}).replace(/::jsonb$/u,'')};set local request.headers='{"x-chillywood-platform":"ios"}';`;
  const tx=(sql,role='service_role',who='creator')=>`begin;${auth(who,role)}select ${sql};commit;`;
  const rpc=(sql,role='service_role',who='creator')=>parsed(query(tx(sql,role,who)));
  async function race(label,first,second,{error,afterBlocked='',retentionFence=false,authorityPrefix=false}={}){
    const holder=session(`begin;${first}select 'HOLDER_READY';`);
    await until(()=>holder.output().includes('HOLDER_READY'),`${label}: holder not ready`);
    const waiter=session(`begin;${second}commit;`);waiter.child.stdin.end();
    await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(holder.name)}
      where h.datname=current_database() and w.datname=current_database() and w.application_name=${lit(waiter.name)}
       and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`)==='1',`${label}: no actual blocking edge`);
    const evidence=JSON.parse(query(`select jsonb_build_object('holderPid',h.pid,'waiterPid',w.pid,'waitEvent',w.wait_event,
      'blockers',pg_blocking_pids(w.pid)) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(holder.name)}
      where h.datname=current_database() and w.datname=current_database() and w.application_name=${lit(waiter.name)}`));
    assert.notEqual(evidence.holderPid,evidence.waiterPid);assert.ok(evidence.blockers.includes(evidence.holderPid));
    if(retentionFence||authorityPrefix)assert.equal(query(`select count(*) from pg_locks w join pg_locks h
      on h.locktype=w.locktype and h.database=w.database and h.classid=w.classid and h.objid=w.objid and h.objsubid=w.objsubid
      where w.pid=${evidence.waiterPid} and h.pid=${evidence.holderPid} and w.locktype='advisory'
       and w.classid=176214 and w.objid=32 and w.objsubid=2 and not w.granted and h.granted;`),'1','writer/reader waits at exact commerce authority gate');
    if(authorityPrefix)assert.equal(query(`select count(*) from pg_locks where pid=${evidence.waiterPid}
      and locktype='advisory' and granted and not(classid=176214 and objid=32 and objsubid=2);`),'0',
      'split-prefix writer owns no downstream user/global/Premium/creator advisory while waiting for the entry gate');
    console.log(JSON.stringify({schedule:label,...evidence}));
    holder.child.stdin.end(afterBlocked+'commit;\n');const a=await holder.done;assert.equal(a.code,0,a.stderr);
    const b=await waiter.done;if(error){assert.notEqual(b.code,0);assert.match(b.stderr,error);}else assert.equal(b.code,0,b.stderr);
    if(retentionFence){
      assert.notEqual(b.code,0);
      assert.match(b.stderr,/^ERROR:\s+merch_current_session_required\r?$/mu);
      assert.match(b.stderr,/PL\/pgSQL function private\.assert_merch_checkout_actor\(uuid,uuid\) line \d+ at RAISE/u);
    }
    // A verified SQL rejection has no result row. Never manufacture JSON for
    // it or relax the exit/error assertions above; successful sessions still
    // must return parseable JSON before the schedule is counted as passed.
    const result={first:parsed(a.stdout),second:error?null:parsed(b.stdout)};
    console.log(`ok ${++checks} - ${label}`);return result;
  }
  const product=randomUUID(),creator=actors.creator.id,buyer=actors.buyer1.id;
  query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,
    environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
    values('${product}','${creator}','Concurrency fixture','Concurrency fixture','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',10,'tracked');`);
  const paid=Math.floor(Date.now()/1000)-35*86400;
  function make(){
    const id=randomUUID(),suffix=id.replaceAll('-',''),pi=`pi_${suffix}`,cs=`cs_test_${suffix}`;
    query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,
      amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id,created_at)
      values('${id}','${product}','${buyer}','${creator}','stripe_physical_goods','sandbox','pending','not_started','pending',1000,1000,'usd','${cs}','${pi}',clock_timestamp()-interval '40 days');`);
    const facts={event_livemode:false,object_livemode:false,event_account_id:null,metadata_order_id:id,payment_intent_id:pi,
      amount_minor:1000,currency:'usd',metadata_environment:'sandbox',metadata_rail:'physical_merch'};
    assert.equal(rpc(`public.process_stripe_merch_webhook_lifecycle('evt_ck_${suffix}','checkout.session.completed','${'a'.repeat(64)}',${json({...facts,object_id:cs,object_type:'checkout.session',mode:'payment',status:'complete',payment_status:'paid',client_reference_id:id,shipping_country:'US',shipping_postal_code:'12345'})})`).reason,'payment_confirmed');
    assert.equal(rpc(`public.process_stripe_merch_webhook_lifecycle('evt_pi_${suffix}','payment_intent.succeeded','${'b'.repeat(64)}',${json({...facts,object_id:pi,object_type:'payment_intent',status:'succeeded',amount_received_minor:1000,event_created_seconds:paid})})`).reason,'payment_confirmed');
    return id;
  }

  const order=make(),number='RETURNRACE123456',request1=randomUUID(),request2=randomUUID();
  const open=request=>"public.submit_merch_return_case("+lit(order)+","+lit(request)+",'non_delivery','Synthetic native non-delivery concern')";
  const opened=await race('simultaneous case opens retain both unresolved claims',
    auth('buyer1')+'select '+open(request1)+';',auth('buyer1')+'select '+open(request2)+';');
  assert.notEqual(opened.first.id,opened.second.id);
  const projection=()=>JSON.parse(query('select public.merch_order_projection_internal(o) from public.merch_orders o where id='+lit(order)));
  let state=projection();
  assert.equal(state.unresolvedReturnCaseCount,2);
  assert.ok(state.returnHoldReasons.includes('merch_case_unresolved'));
  assert.equal(state.verifiedDeliveryAt,null,'case creation never fabricates delivery');
  const latestHold=()=>query('select cardinality(unresolved_case_ids) from private.merch_return_case_hold_events where order_id='+lit(order)+' order by event_id desc limit 1');
  assert.equal(latestHold(),'2');
  assert.equal(query('select count(*) from private.merch_return_cases where order_id='+lit(order)),'2');

  // Production tracking worker with synthetic provider facts; no HTTP or labels.
  rpc("public.assign_merch_tracking("+lit(order)+",'usps',"+lit(number)+")",'authenticated','creator');
  const assignment=query('select id from private.merch_tracking_assignments where order_id='+lit(order));
  query("insert into private.merch_tracking_qualification values(true,true,'SYNTHETIC native return fixture',clock_timestamp()+interval '1 day');"+
    "insert into private.merch_tracking_accounts values("+lit(creator)+",'managed_return_fixture',true,'SYNTHETIC native return fixture',clock_timestamp()+interval '1 day');");
  const lease=rpc('public.claim_merch_tracking_jobs(1)')[0].lease;
  const facts={status:'DELIVERED',status_date:new Date((paid+4*86400)*1000).toISOString(),first_event_at:new Date((paid+86400)*1000).toISOString(),
    carrier:'usps',tracking_number:number,test:true,destination_zip:'12345',destination_country:'US',review_reason:null,payload_hash:'d'.repeat(64)};
  const finish=token=>'public.complete_merch_tracking_job('+lit(assignment)+','+lit(token)+','+json(facts)+',true)';
  const close=(id,request=randomUUID())=>"public.respond_merch_return_case("+lit(id)+","+lit(request)+",'buyer_close','Synthetic voluntary support closure')";
  await race('case closes while carrier evidence arrives after return deadline',
    auth('buyer1')+'select '+close(opened.first.id)+';',auth('creator','service_role')+'select '+finish(lease)+';');
  state=projection();
  assert.equal(state.unresolvedReturnCaseCount,1,'one remaining case still holds the affected order');
  assert.ok(state.returnHoldReasons.includes('merch_case_unresolved'));
  assert.ok(Date.parse(state.returnWindowEndsAt)<Date.now(),'carrier proves an elapsed clock, not payout release');
  assert.equal(latestHold(),'1');
  assert.equal(query('select count(*) from private.merch_return_evidence where order_id='+lit(order)),'1');

  const responseRequest=randomUUID();
  const response="public.respond_merch_return_case("+lit(opened.second.id)+","+lit(responseRequest)+",'creator_response','Synthetic creator reply')";
  await race('same creator response retry remains exactly once',auth('creator')+'select '+response+';',auth('creator')+'select '+response+';');
  assert.equal(query('select count(*) from private.merch_return_case_events where request_id='+lit(responseRequest)),'1');
  assert.equal(projection().unresolvedReturnCaseCount,1);

  query("update private.merch_tracking_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where assignment_id="+lit(assignment)+";"+
    "update public.merch_orders set payment_status='disputed' where id="+lit(order)+";");
  const nextLease=rpc('public.claim_merch_tracking_jobs(1)')[0].lease;
  await race('carrier evidence commits before last closure without clearing provider dispute',
    auth('creator','service_role')+'select '+finish(nextLease)+';',auth('buyer1')+'select '+close(opened.second.id)+';');
  state=projection();
  assert.equal(state.unresolvedReturnCaseCount,0);
  assert.ok(!state.returnHoldReasons.includes('merch_case_unresolved'));
  assert.ok(state.returnHoldReasons.includes('merch_dispute_unresolved'));
  assert.equal(state.paymentStatus,'disputed');
  assert.equal(query('select count(*) from public.creator_earnings_ledger'),'0');
  assert.equal(checks,4);
  await runAutomaticCommerceObserverRaces({query,session,until,race,actors,lit});
  query("update public.platform_money_kill_switches set state='off' where key='live_money_enabled'");
  assert.equal(checks,6);
  await runMerchCheckoutDispatchRaces({query,rpc,race,auth,actors,lit,json});
  assert.equal(checks,18);
  await runMerchAdmissionCutoverRace({query,rpc,session,until,auth,actors,lit});
  await runMerchLiveCheckoutRaces({query,race,auth,actors,lit,json});
  await runMerchPublicationRaces({query,race,auth,actors,lit});
  await runMerchTaxCategoryRaces({query,race,auth,actors,lit});
  assert.equal(checks,35);
  await runAutomaticCommerceDeclarationRaces({query,race,lit});
  assert.equal(checks,38);
  await runAutomaticCommerceAuthorityRaces({query,race,lit});
  assert.equal(checks,44);
  assert.equal(await runOrdinaryNativeDispatchRaces({query,race,lit,session,until}),153);
  assert.equal(checks,197);
  const profileCounts=await runOrdinaryProfileMetadataRaces({query,lit,session,until});
  assert.deepEqual(profileCounts,{blocking:90,nonblocking:27});
  console.log('PASS native: 287 PostgreSQL blocking-edge schedules (197 commerce +90 profile),27 profile nonblocking controls,2 observer SKIP LOCKED controls and1 managed-style Auth tuple control. Retains all156 original commerce schedules with reviewed gate-first outcomes, adds39 partial canonical-prefix interleavings,1 explicit stale-mode denial and1 Auth DELETE/declaration FK schedule. Synthetic source fixture only; no arbitrary external Auth transaction or baseline media deadlock guarantee.');
}finally{
  for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
  try{if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop owned clone');}
  finally{restore.assertSourceUnchanged();}
}
