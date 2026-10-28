#!/usr/bin/env node
// Explicit, caller-owned, network-isolated PostgreSQL fixture only.
// Synthetic reservations and payment facts; no provider transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const container = option('container'), database = option('database');
assert.match(container ?? '', /^chillywood-event-offer-audit-[a-z0-9-]+$/);
assert.match(database ?? '', /^event_reservation_broadcast_policy_[a-z0-9_]+$/);
const inspect = JSON.parse(execFileSync('docker', ['inspect', container], {encoding:'utf8'}))[0];
assert.equal(inspect.State.Running, true);
assert.equal(inspect.HostConfig.NetworkMode, 'none');
assert.deepEqual(inspect.Mounts, []);
assert.equal(Object.keys(inspect.HostConfig.PortBindings ?? {}).length, 0);
const args = ['exec','-i',container,'psql','-X','-h','/tmp','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-Atq'];
const sql = input => execFileSync('docker', args, {input,encoding:'utf8',timeout:60_000,stdio:['pipe','pipe','pipe']}).trim();
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const parse = output => JSON.parse(output.split('\n').filter(line => line.startsWith('{') || line.startsWith('[')).at(-1));
const read = statement => parse(sql(`select ${statement};`));
let checks = 0, observedRaces = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  console.log(`ok ${++checks} - ${message}`);
};
const moneyState = () => read("jsonb_object_agg(key,state) from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled')");
check(sql('select current_database()'), database, 'explicit disposable database');
check(moneyState(), {live_money_enabled:'off',payouts_enabled:'off'}, 'live money and payouts are off before tests');
check(sql("select to_regprocedure('public.read_my_creator_event_ticket_policy(uuid,uuid)') is not null"), 't', 'buyer policy reader is installed');
check(sql("select to_regprocedure('public.respond_creator_event_schedule_change(uuid,uuid,uuid,text)') is not null"), 't', 'exact-revision choice authority is installed');
const sourceNames = ['20261027085819_creator_event_ticket_schedule_policy.sql','20261027085833_creator_event_explicit_replay_terms.sql',
  '20261027091942_creator_event_reconciliation_identity_order.sql'];
console.log(JSON.stringify({database,container,postgres:sql('show server_version'),providerTransport:false,
  sourceSHA256:Object.fromEntries(sourceNames.map(name => [name,createHash('sha256').update(fs.readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url))).digest('hex')]))}));
if (process.argv.includes('--startup-only')) {
  console.log(JSON.stringify({passed:true,assertions:checks,scope:'startup-only',providerTransport:false,database}));
  process.exit(0);
}

function session(input, onData, hold=false) {
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
  let output='',error='';
  const done=new Promise((resolve,reject) => {
    const timer=setTimeout(() => {child.kill('SIGTERM');reject(new Error('native event policy session timed out'));},60_000);
    child.stdout.on('data',chunk => {output+=chunk;onData?.(output);});
    child.stderr.on('data',chunk => {error+=chunk;});
    child.on('error',err => {clearTimeout(timer);reject(err);});
    child.on('close',code => {clearTimeout(timer);resolve({code,output,error});});
  });
  const bounded="set statement_timeout='40s';set lock_timeout='30s';set idle_in_transaction_session_timeout='40s';"+input;
  if (hold) child.stdin.write(bounded); else child.stdin.end(bounded);
  return {child,done};
}
async function race(first, second, label, secondError=null) {
  let entered,blockerPid;
  const firstName=`event-policy-first-${randomUUID()}`,name=`event-policy-${randomUUID()}`;
  const ready=new Promise(resolve => {entered=resolve;});
  const a=session(`set application_name=${literal(firstName)};begin;${first}select 'event_policy_lock_barrier:'||pg_backend_pid();\n`, output => {
    const match=output.match(/event_policy_lock_barrier:(\d+)/);
    if (match) {blockerPid=Number(match[1]);entered();}
  },true);
  try {
    await Promise.race([ready,a.done.then(result => {throw Error(result.error || 'first transaction ended before lock barrier');})]);
    const b=session(`set application_name=${literal(name)};begin;${second}commit;`);
    let blocked=false;
    try {
      const until=Date.now()+20_000;
      while (Date.now()<until) {
        blocked=sql(`select count(*) from pg_stat_activity where application_name=${literal(name)}
          and datname=${literal(database)} and wait_event_type='Lock' and ${blockerPid}=any(pg_blocking_pids(pid))`)==='1';
        if (blocked) break;
        await new Promise(resolve => setTimeout(resolve,25));
      }
    } finally {a.child.stdin.end('commit;\n');}
    const results=await Promise.all([a.done,b.done]);
    check(blocked,true,`${label}: second transaction demonstrably waits for the first transaction's backend`);
    check(results[0].code,0,`${label}: first transaction completes (${results[0].error})`);
    if (secondError) {
      check(results[1].code !== 0,true,`${label}: stale/terminal second action rejects`);
      assert.match(results[1].error,secondError);
      console.log(`ok ${++checks} - ${label}: exact expected error ${secondError}`);
    } else check(results[1].code,0,`${label}: second transaction completes (${results[1].error})`);
    observedRaces++;
    return results;
  } finally {
    // Terminate only this harness's uniquely named sessions in its explicit
    // fixture database. Docker client termination alone cannot prove rollback.
    if (!a.child.stdin.destroyed && !a.child.stdin.writableEnded) a.child.stdin.end('rollback;\n');
    sql(`select pg_terminate_backend(pid) from pg_stat_activity where datname=${literal(database)}
      and application_name in (${literal(firstName)},${literal(name)}) and pid<>pg_backend_pid();`);
    const remaining=sql(`select count(*) from pg_stat_activity where datname=${literal(database)}
      and application_name in (${literal(firstName)},${literal(name)});`);
    if (remaining!=='0') {
      throw Error(`${label}: native fixture transaction cleanup could not be confirmed`);
    }
  }
}

// Scenarios below exercise the production lifecycle and provider projector.
const actors=read("jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors");
const identity=actor => `set local role authenticated;set local request.jwt.claims=${literal(JSON.stringify({role:'authenticated',sub:actors[actor].id,session_id:actors[actor].session}))};set local request.headers='{"x-chillywood-platform":"ios"}';`;
const service=`set local role service_role;set local request.jwt.claims='{"role":"service_role"}';`;
const run=(actor,statement) => parse(sql(`begin;${identity(actor)}${statement}commit;`));
const row=id => read(`to_jsonb(e) from public.creator_events e where id='${id}'`);
const policy=show => run(show.buyer,`select public.read_my_creator_event_ticket_policy('${show.id}','${show.purchaseId}');`);
const lifecycle=(show,action,{startsAt=null,expected=row(show.id).updated_at}={}) =>
  `${identity('creator')}select public.manage_creator_event_lifecycle('${show.id}',${literal(action)},${literal(expected)},${startsAt?literal(startsAt):'null'},null,'America/New_York','Synthetic native policy notice',true);`;
const choose=(show,revision,choice='keep_ticket') =>
  `${identity(show.buyer)}select public.respond_creator_event_schedule_change('${show.id}','${show.purchaseId}','${revision}',${literal(choice)});`;
const move=(show,minutes) => {
  const before=row(show.id),start=new Date(Date.parse(before.starts_at)+minutes*60_000).toISOString();
  return parse(sql(`begin;${lifecycle(show,'reschedule',{startsAt:start,expected:before.updated_at})}commit;`));
};
const payment=(show,patch={}) => {
  const key=randomUUID().replaceAll('-','');
  return `${service}select public.process_revenuecat_app_store_event_atomic('evt_policy_${key}','NON_RENEWING_PURCHASE',${literal(patch.userId??actors[show.buyer].id)},
    ${literal(patch.productId??show.intent.providerProductId)},${literal(patch.environment??'sandbox')},now(),null,${patch.amountMinor??show.intent.amountMinor},${literal(patch.currency??'usd')},repeat('a',64),'tx_policy_${key}',null,${literal(patch.purchasedAt??show.intent.createdAt)});`;
};
let nextBuyer=0;
function createShow({paid=true}={}) {
  const id=randomUUID(),buyer=`buyer${++nextBuyer}`;
  sql(`insert into public.creator_events(id,host_user_id,event_title,event_type,visibility,status,starts_at,ends_at,time_zone,replay_policy)
    select '${id}','${actors.creator.id}','Native event policy fixture','live_first','public','scheduled',starts_at,starts_at+interval '2 hours','America/New_York','none'
    from(select (date_trunc('day',now() at time zone 'America/New_York')+interval '7 days 12 hours') at time zone 'America/New_York' starts_at) schedule;`);
  const offer=run('creator',`select public.configure_paid_creator_event_sale('${id}','Live only',99,5,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day');`);
  const intent=run(buyer,`select public.create_reserved_creator_event_purchase_intent('${offer.id}','${offer.termsRevisionId}');`);
  const show={id,buyer,offer,intent,purchaseId:intent.id};
  const claim=run(buyer,`select public.begin_creator_event_checkout('${intent.id}','${randomUUID()}');`);
  check(claim.startAuthorized,true,'production checkout claim authorizes the synthetic in-flight store attempt');
  check(typeof claim.checkoutStartedAt,'string','dispatch claim durably records its start before any callback');
  if (paid) {
    const receipt=parse(sql(`begin;${payment(show)}commit;`));
    check(receipt.status,'processed','synthetic payment traverses the production projector');
  }
  const library=run(buyer,`select public.read_my_creator_purchases(50,null,null,'event','${id}');`);
  check(library.items.length,1,'actual purchase library identifies one exact owned event purchase');
  show.purchaseId=library.items[0].id;
  check(library.items[0].purchaseIntentId,intent.id,'library item retains the exact original intent');
  return show;
}

// This fixture setting is confined to the asserted isolated clone. Both live
// switches remain off; the production sandbox catalog and its guards are used.
sql("update public.platform_money_kill_switches set state='sandbox_only' where key='digital_sales_enabled';");
for (const cancellationFirst of [false,true]) {
  const show=createShow();move(show,60);
  const before=policy(show),expected=row(show.id).updated_at;
  check(before.choiceRequired,true,'material change requires an explicit buyer choice');
  const consent=choose(show,before.currentRevision.id),cancel=lifecycle(show,'cancel',{expected});
  await race(cancellationFirst?cancel:consent,cancellationFirst?consent:cancel,
    `buyer consent/cancellation ${cancellationFirst?'cancellation first':'consent first'}`,
    cancellationFirst?/event_ticket_revision_changed/:null);
  const after=policy(show);
  check(after.refundEligibility.reasons.includes('event_canceled'),true,'cancellation protection survives consent ordering');
  check(after.choiceRequired,false,'canceled show cannot solicit schedule acceptance');
  check(after.history.length,cancellationFirst?0:1,'only a choice completed before cancellation enters immutable history');
  check(after.originalSchedule,before.originalSchedule,'cancellation never rewrites original terms');
}
for (const revisionFirst of [false,true]) {
  const show=createShow();move(show,60);
  const before=policy(show),current=row(show.id);
  const consent=choose(show,before.currentRevision.id),change=lifecycle(show,'reschedule',{
    expected:current.updated_at,startsAt:new Date(Date.parse(current.starts_at)+3_600_000).toISOString()});
  await race(revisionFirst?change:consent,revisionFirst?consent:change,
    `buyer consent/new revision ${revisionFirst?'revision first':'consent first'}`,
    revisionFirst?/event_ticket_revision_changed/:null);
  const after=policy(show);
  check(after.choiceRequired,true,'new material revision never inherits silent acceptance');
  check(after.history.length,revisionFirst?0:1,'choice records exactly the revision the buyer saw');
  check(after.acceptedRevisionId,revisionFirst?null:before.currentRevision.id,'accepted revision remains exact under contention');
  check(after.currentRevision.id===before.currentRevision.id,false,'new schedule has its own immutable revision');
}
for (const conflicting of [false,true]) {
  const show=createShow();move(show,60);const before=policy(show);
  await race(choose(show,before.currentRevision.id),choose(show,before.currentRevision.id,conflicting?'request_refund_review':'keep_ticket'),
    conflicting?'conflicting simultaneous buyer choices':'duplicate simultaneous buyer consent',
    conflicting?/event_ticket_choice_already_recorded/:null);
  const after=policy(show);
  check(after.history.length,1,'duplicate or conflicting actions cannot rewrite the first recorded choice');
  check(after.history[0].choice,'keep_ticket','first explicit choice remains immutable');
}
{
  const show=createShow(),initial=row(show.id),expected=initial.updated_at;
  const first=lifecycle(show,'reschedule',{expected,startsAt:new Date(Date.parse(initial.starts_at)+20*60_000).toISOString()});
  const second=lifecycle(show,'reschedule',{expected,startsAt:new Date(Date.parse(initial.starts_at)+40*60_000).toISOString()});
  await race(first,second,'simultaneous creator reschedules',/event_changed_refresh_required/);
  check(policy(show).choiceRequired,false,'first sub-threshold change alone does not require consent');
  move(show,20);
  check(policy(show).choiceRequired,true,'refreshed cumulative changes are material against original terms');
  check(Number(sql(`select count(*) from private.creator_event_schedule_revisions where event_id='${show.id}'`)),3,
    'stale failed reschedule leaves no extra schedule revision');
}
for (const changeFirst of [false,true]) {
  const show=createShow({paid:false}),initial=row(show.id);
  const before=policy(show);
  check(before.refundEligibility,null,'pending payment is not represented as a confirmed charged refund claim');
  const change=lifecycle(show,'reschedule',{expected:initial.updated_at,startsAt:new Date(Date.parse(initial.starts_at)+3_600_000).toISOString()});
  await race(changeFirst?change:payment(show),changeFirst?payment(show):change,
    `pending payment/material reschedule ${changeFirst?'change first':'payment first'}`);
  const after=policy(show);
  check(after.refundEligibility?.reasons.includes('material_schedule_change'),true,'verified paid obligation retains material-change review eligibility');
  check(after.originalSchedule,before.originalSchedule,'pending settlement preserves the original immutable schedule');
  const library=run(show.buyer,`select public.read_my_creator_purchases(50,null,null,'event','${show.id}');`);
  check(library.items.length,1,'callback race leaves one purchase history item');
  check(library.items[0].purchaseIntentId,show.intent.id,'callback race keeps the original purchase identity');
  if (changeFirst) {
    check(library.items[0].status,'reconciliation_required','changed-before-settlement purchase needs reconciliation instead of substitute fulfillment');
    check(Number(sql(`select count(*) from public.paid_creator_event_passes where creator_event_id='${show.id}'`)),0,
      'late payment cannot mint a ticket for changed terms');
  }
}
{
  const show=createShow({paid:false});move(show,60);
  const originalTerms=read(`to_jsonb(q) from public.creator_money_purchase_quotes q where purchase_intent_id='${show.intent.id}'`);
  const negatives=[
    ['wrong buyer',{userId:actors.buyer18.id}],
    ['unmapped product',{productId:'com.chillywood.eventpass.native_unmapped'}],
    ['wrong environment',{environment:'production'}],
    ['receipt predates the exact intent',{purchasedAt:new Date(Date.parse(show.intent.createdAt)-86_400_000).toISOString()}],
    ['invalid charged amount',{amountMinor:0}],
    ['invalid currency',{currency:'ZZ'}],
  ];
  for (const [label,patch] of negatives) {
    const rejected=parse(sql(`begin;${payment(show,patch)}commit;`));
    check(rejected.purchaseIntentId??null,null,`${label}: does not attach a receipt to the original purchase`);
    check(Number(sql(`select count(*) from public.paid_creator_event_passes where creator_event_id='${show.id}'`)),0,
      `${label}: cannot grant a changed show`);
    check(policy(show).refundEligibility,null,`${label}: does not fabricate paid refund-review eligibility`);
  }
  const valid=parse(sql(`begin;${payment(show)}commit;`));
  check(valid.status,'ignored','valid charged receipt for changed terms remains unfulfilled');
  check(valid.purchaseIntentId,show.intent.id,'valid changed-term receipt binds the exact immutable intent');
  check(policy(show).refundEligibility?.reasons.includes('material_schedule_change'),true,
    'exact verified paid obligation earns provider review without fulfillment');
  check(read(`to_jsonb(q) from public.creator_money_purchase_quotes q where purchase_intent_id='${show.intent.id}'`),originalTerms,
    'receipt reconciliation preserves original price and terms');
}
{
  const show=createShow(),before=row(show.id),beforePolicy=policy(show);
  const revisions=Number(sql(`select count(*) from private.creator_event_schedule_revisions where event_id='${show.id}'`));
  sql(`create function private.fixture_event_policy_notice_failure() returns trigger language plpgsql as $body$
    begin if new.event_id='${show.id}'::uuid then raise exception 'fixture_event_policy_notice_failure';end if;return new;end;$body$;
    create trigger fixture_event_policy_notice_failure before insert on private.creator_event_ticket_notices
    for each row execute function private.fixture_event_policy_notice_failure();`);
  try {
    assert.throws(() => move(show,60),error => /fixture_event_policy_notice_failure/.test(String(error.stderr??error)));
    console.log(`ok ${++checks} - transactional notice failure aborts the creator operation`);
    check(row(show.id),before,'notice failure rolls schedule and version back');
    check(Number(sql(`select count(*) from private.creator_event_schedule_revisions where event_id='${show.id}'`)),revisions,
      'notice failure rolls immutable revision insertion back');
    check(policy(show).notice,beforePolicy.notice,'notice failure exposes no undelivered update as saved');
  } finally {
    sql('drop trigger fixture_event_policy_notice_failure on private.creator_event_ticket_notices;drop function private.fixture_event_policy_notice_failure();');
  }
  move(show,60);
  const after=policy(show),again=policy(show);
  check(after.choiceRequired,true,'same creator intent succeeds after transient notice failure');
  check(again.notice.id,after.notice.id,'reader retry reuses the durable notice');
  check(Number(sql(`select count(*) from private.creator_event_ticket_notices where event_id='${show.id}' and kind='schedule_changed'`)),1,
    'retry creates exactly one schedule notice');
}
check(moneyState(),{live_money_enabled:'off',payouts_enabled:'off'},'live money and payouts remain off after native races');
check(sql("select count(*) from pg_trigger where tgname='fixture_event_policy_notice_failure'"),'0','test-only failure trigger removed');
console.log(JSON.stringify({passed:true,assertions:checks,lockObservedRaces:observedRaces,providerTransport:false,database}));
