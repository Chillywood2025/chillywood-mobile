#!/usr/bin/env node
// Explicit caller-owned, network-isolated PostgreSQL only. Never a provider or URL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const container = option('container'), database = option('database');
assert.match(container ?? '', /^chillywood-event-offer-audit-[a-z0-9-]+$/);
assert.match(database ?? '', /^stripe_followup_validation(?:_[a-z0-9_]+)?$/);
const inspect = JSON.parse(execFileSync('docker', ['inspect', container], {encoding:'utf8'}))[0];
assert.equal(inspect.State.Running, true);
assert.equal(inspect.HostConfig.NetworkMode, 'none');
assert.deepEqual(inspect.Mounts, []);
assert.equal(Object.keys(inspect.HostConfig.PortBindings ?? {}).length, 0);
const args = ['exec','-i',container,'psql','-X','-h','/tmp','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-Atq'];
const sql = input => execFileSync('docker', args, {input,encoding:'utf8',timeout:60_000,stdio:['pipe','pipe','pipe']}).trim();
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${literal(JSON.stringify(value))}::jsonb`;
const service = `set role service_role; select set_config('request.jwt.claims','{"role":"service_role"}',false);`;
const parse = output => JSON.parse(output.split('\n').filter(line => line.startsWith('{')).at(-1));
const read = statement => parse(sql(`select ${statement};`));
const run = statement => parse(sql(`${service}${statement}`));
const moneyState = () => read("jsonb_object_agg(key,state) from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled')");
let checks = 0, observedRaces = 0;
const check = (actual, expected, message) => {assert.deepEqual(actual, expected, message); console.log(`ok ${++checks} - ${message}`);};
const reject = (statement, pattern, message) => {
  assert.throws(() => sql(statement), error => pattern.test(String(error.stderr ?? error)), message);
  console.log(`ok ${++checks} - ${message}`);
};
check(sql('select current_database()'), database, 'explicit disposable database');
check(sql("select to_regprocedure('public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb)') is not null"), 't', 'forward merch projector is installed');
check(sql("select pg_get_functiondef('public.process_stripe_tip_webhook_lifecycle(text,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) like '%payment_status%'"), 't', 'forward tip payment-status authority is installed');
check(moneyState(), {live_money_enabled:'off',payouts_enabled:'off'}, 'live money and payouts are off before tests');
if (process.argv.includes('--startup-only')) {
  console.log(JSON.stringify({passed:true,assertions:checks,scope:'startup-only',providerTransport:false,database}));
  process.exit(0);
}
if (!sql("select to_regclass('event_reservation_fixture.actors')")) {
  sql(fs.readFileSync(new URL('../tests/fixtures/event-reservation-authority.sql', import.meta.url), 'utf8'));
}
const actors = read("jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors");
const sourceFiles = [
  '20261027034836_creator_tip_settlement_authority.sql',
  '20261027034844_creator_merch_payment_refund_reconciliation.sql',
  '20261027034858_creator_connect_observed_configuration.sql',
  '20261027034920_buyer_purchase_partial_refund_presentation.sql',
];
console.log(JSON.stringify({database,container,postgres:sql('show server_version'),sourceSHA256:Object.fromEntries(sourceFiles.map(name => [name,createHash('sha256').update(fs.readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url))).digest('hex')]))}));

function session(input, onData, hold=false) {
  const child = spawn('docker', args, {stdio:['pipe','pipe','pipe']});
  let output='', error='';
  const done = new Promise((resolve,rejectPromise) => {
    const timer = setTimeout(() => {child.kill('SIGTERM'); rejectPromise(new Error('native SQL session timed out'));},60_000);
    child.stdout.on('data', chunk => {output += chunk; onData?.(output);});
    child.stderr.on('data', chunk => {error += chunk;});
    child.on('error', err => {clearTimeout(timer); rejectPromise(err);});
    child.on('close', code => {clearTimeout(timer); resolve({code,output,error});});
  });
  if (hold) child.stdin.write(input); else child.stdin.end(input);
  return {child,done};
}
async function race(first, second, label) {
  let entered; const ready = new Promise(resolve => {entered=resolve;});
  const a = session(`${service}begin;${first}select 'native_settlement_barrier';\n`, out => {
    if (out.includes('native_settlement_barrier')) entered();
  }, true);
  await Promise.race([ready, a.done.then(result => {throw Error(result.error || 'first transaction ended before lock barrier');})]);
  const name = `stripe-native-${randomUUID()}`;
  const b = session(`set application_name=${literal(name)};${service}${second}`);
  let blocked=false;
  try {
    const until=Date.now()+20_000;
    while (Date.now()<until) {
      blocked=sql(`select count(*) from pg_stat_activity where application_name=${literal(name)} and wait_event_type='Lock'`)==='1';
      if (blocked) break;
      await new Promise(resolve => setTimeout(resolve,25));
    }
  } finally {a.child.stdin.end('commit;\n');}
  const results = await Promise.all([a.done,b.done]);
  check(blocked,true,`${label}: second transaction demonstrably waits`);
  for (const result of results) check(result.code,0,`${label}: transaction completes (${result.error})`);
  observedRaces++;
  return results.map(result => parse(result.output));
}
const hash = object => createHash('sha256').update(JSON.stringify(object)).digest('hex');
function event(type, facts, id=`evt_native_${randomUUID().replaceAll('-','')}`) {
  return {id,type,facts,hash:hash({id,type,facts}),attempt:randomUUID()};
}
function tipCall(tip, evt) {
  return `with claim as materialized(select public.reserve_stripe_tip_webhook_event(${literal(evt.id)},${literal(evt.type)},${literal(evt.hash)},'${evt.attempt}') value)
    select case when value->>'disposition'='claimed' then public.process_stripe_tip_webhook_lifecycle(${literal(evt.id)},'${evt.attempt}','${tip.id}',${json(evt.facts)},'{"metadata":{}}'::jsonb,'{}'::jsonb) else value end from claim;`;
}
function tipFacts(tip, type, patch={}) {
  const checkout=type.startsWith('checkout.');
  return {event_livemode:false,object_livemode:false,object_type:checkout?'checkout.session':type.startsWith('payment_intent.')?'payment_intent':type==='charge.refunded'?'charge':'dispute',
    object_id:checkout?tip.session:type.startsWith('payment_intent.')?tip.pi:type==='charge.refunded'?tip.charge:`dp_${tip.key}`,
    payment_intent_id:tip.pi,amount_cents:300,amount_received_cents:300,currency:'usd',
    object_status:checkout?'complete':'succeeded',checkout_mode:'payment',payment_status:'paid',client_reference_id:tip.id,
    metadata_tip_id:tip.id,metadata_sender_id:actors.buyer1.id,metadata_creator_id:actors.creator.id,...patch};
}
function createTip({bindIntent=true}={}) {
  const id=randomUUID(),request=randomUUID(),key=id.replaceAll('-','');
  const tip={id,key,session:`cs_test_${key}`,pi:`pi_${key}`,charge:`ch_${key}`};
  const body={client_reference_id:id,'metadata[chillywood_tip_id]':id,'metadata[fan_user_id]':actors.buyer1.id,'metadata[creator_user_id]':actors.creator.id,
    'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':300,'payment_intent_data[transfer_data][destination]':'acct_nativefixture',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600};
  // Distinct synthetic buyers avoid replacing another unresolved purchase.
  const actor={id:randomUUID(),session:randomUUID()};
  sql(`insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values('${actor.id}',false,false,now());
    insert into auth.sessions(id,user_id) values('${actor.session}','${actor.id}');
    insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select '${actor.id}',public.wave1_sha256('${actor.id}'),document_key,version,market,'member',capability,'${actor.session}','service_reconciliation'
    from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account';`);
  tip.buyer=actor.id; tip.buyerSession=actor.session; tip.request=request;
  body['metadata[fan_user_id]']=actor.id;
  const quote={tipId:id,creatorId:actors.creator.id,amountCents:300,currency:'usd',privateNote:null,providerAccountId:'acct_nativefixture',body};
  run(`select public.reserve_creator_tip_checkout_attempt('${actor.id}','${actor.session}','${request}',${json(quote)});`);
  run(`select public.record_creator_tip_checkout_session('${actor.id}','${actor.session}','${request}',${literal(tip.session)},${bindIntent?literal(tip.pi):'null'});`);
  return tip;
}
const tipEvent = (tip,type,patch) => event(type,tipFacts(tip,type,{metadata_sender_id:tip.buyer,...patch}));
const tipState = tip => read(`jsonb_build_object('status',status,'payment',payment_status,'refund',refunded_amount_cents,'net',creator_net_cents,'payout',payout_status) from public.creator_tip_transactions where id='${tip.id}'`);
const tipComplete = tip => tipCall(tip,tipEvent(tip,'checkout.session.completed'));
const tipRefund = (tip,amount) => tipCall(tip,tipEvent(tip,'charge.refunded',{amount_refunded_cents:amount,refunded:amount===300}));

function createMerch() {
  const id=randomUUID(),key=id.replaceAll('-',''); const order={id,key,session:`cs_test_${key}`,pi:`pi_${key}`,charge:`ch_${key}`};
  sql(`insert into public.merch_orders(id,buyer_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
    values('${id}','${actors.buyer1.id}','stripe_physical_goods','sandbox','pending','not_started','pending',1000,1000,'usd',${literal(order.session)},${literal(order.pi)});`);
  return order;
}
function merchFacts(order,type,patch={}) {
  const checkout=type.startsWith('checkout.');
  return {event_livemode:false,object_livemode:false,object_type:checkout?'checkout.session':type.startsWith('payment_intent.')?'payment_intent':type==='charge.refunded'?'charge':'dispute',
    object_id:checkout?order.session:type.startsWith('payment_intent.')?order.pi:type==='charge.refunded'?order.charge:`dp_${order.key}`,
    payment_intent_id:order.pi,metadata_order_id:order.id,client_reference_id:order.id,mode:'payment',status:checkout?'complete':'succeeded',payment_status:'paid',amount_minor:1000,amount_received_minor:1000,currency:'usd',...patch};
}
const merchEvent=(order,type,patch)=>event(type,merchFacts(order,type,patch));
const merchCall=evt=>`select public.process_stripe_merch_webhook_lifecycle(${literal(evt.id)},${literal(evt.type)},${literal(evt.hash)},${json(evt.facts)});`;
const merchComplete=order=>merchCall(merchEvent(order,'checkout.session.completed'));
const merchRefund=(order,amount)=>merchCall(merchEvent(order,'charge.refunded',{refunded_amount_minor:amount,refunded:amount===1000}));
const merchState=order=>read(`jsonb_build_object('status',order_status,'payment',payment_status,'fulfillment',fulfillment_status,'refund',refunded_amount_minor,'total',amount_total_minor) from public.merch_orders where id='${order.id}'`);

for (const kind of ['tip','merch']) {
  const item=kind==='tip'?createTip():createMerch();
  const evt=kind==='tip'?tipEvent(item,'checkout.session.completed'):merchEvent(item,'checkout.session.completed');
  const call=kind==='tip'?tipCall(item,evt):merchCall(evt);
  const pair=await race(call,call,`${kind} duplicate event`);
  check(pair[1].disposition ?? pair[1].status,'duplicate',`${kind} second event is a duplicate`);
  check(kind==='tip'?tipState(item).payment:merchState(item).payment,kind==='tip'?'succeeded':'paid',`${kind} one payment settles`);
}
const earlyPartialTip=createTip();
run(tipRefund(earlyPartialTip,100));
console.log(JSON.stringify({partialBeforeSuccess:tipState(earlyPartialTip)}));
run(tipComplete(earlyPartialTip));
console.log(JSON.stringify({paidAfterPartial:tipState(earlyPartialTip)}));
check(tipState(earlyPartialTip).net,200,'partial refund before success credits only the remaining original amount');

for (const type of ['charge.refunded','charge.dispute.created']) {
  const tip=createTip({bindIntent:false});
  const evt=tipEvent(tip,type,type==='charge.refunded'?{amount_refunded_cents:300,refunded:true}:{});
  const pending=run(tipCall(tip,evt));
  check(pending.reason,'tip_provider_identity_pending',`${type} before stored PI remains retryable`);
  check(tipState(tip).payment,'pending',`${type} cannot credit or remove an unbound tip`);
  check(sql(`select provider_payment_intent_id is null from public.creator_tip_transactions where id='${tip.id}'`),'t',`${type} cannot bind a payment from metadata`);
  run(`select public.record_creator_tip_checkout_session('${tip.buyer}','${tip.buyerSession}','${tip.request}',${literal(tip.session)},${literal(tip.pi)});`);
  evt.attempt=randomUUID();
  run(tipCall(tip,evt));
  run(tipComplete(tip));
  check(tipState(tip).payment,type==='charge.refunded'?'refunded':'charged_back',`${type} exact event retry settles removal and survives late success`);
  if (type==='charge.refunded') check(tipState(tip).net,0,'full refund removes the original creator balance');
  else check(tipState(tip).payout,'reversed','dispute reverses payout eligibility without rewriting the quoted amount');
}

for (const kind of ['tip','merch']) for (const reverse of [false,true]) {
  const item=kind==='tip'?createTip():createMerch();
  run(kind==='tip'?tipComplete(item):merchComplete(item));
  const partial=kind==='tip'?tipRefund(item,30):merchRefund(item,250),full=kind==='tip'?tipRefund(item,300):merchRefund(item,1000);
  await race(reverse?full:partial,reverse?partial:full,`${kind} ${reverse?'full then partial':'partial then full'}`);
  const state=kind==='tip'?tipState(item):merchState(item);
  check(state.refund,kind==='tip'?300:1000,`${kind} cumulative refund never regresses`);
  check(state.payment,'refunded',`${kind} full refund remains terminal`);
}
for (const kind of ['tip','merch']) for (const firstRemoval of [false,true]) {
  const item=kind==='tip'?createTip():createMerch();
  const success=kind==='tip'?tipComplete(item):merchComplete(item),full=kind==='tip'?tipRefund(item,300):merchRefund(item,1000);
  await race(firstRemoval?full:success,firstRemoval?success:full,`${kind} success/full-refund race ${firstRemoval?'refund first':'success first'}`);
  check((kind==='tip'?tipState(item):merchState(item)).payment,'refunded',`${kind} late success cannot undo refund`);
}
for (const kind of ['tip','merch']) for (const firstRemoval of [false,true]) {
  const item=kind==='tip'?createTip():createMerch();
  const removal=kind==='tip'?tipCall(item,tipEvent(item,'charge.dispute.created')):merchCall(merchEvent(item,'charge.dispute.created',{charge_id:item.charge}));
  const success=kind==='tip'?tipComplete(item):merchComplete(item);
  await race(firstRemoval?removal:success,firstRemoval?success:removal,`${kind} dispute/success race ${firstRemoval?'dispute first':'success first'}`);
  check((kind==='tip'?tipState(item):merchState(item)).payment,kind==='tip'?'charged_back':'disputed',`${kind} dispute wins over success`);
}
for (const kind of ['tip','merch']) for (const disputeFirst of [false,true]) {
  const item=kind==='tip'?createTip():createMerch();
  run(kind==='tip'?tipComplete(item):merchComplete(item));
  const dispute=kind==='tip'?tipCall(item,tipEvent(item,'charge.dispute.created')):merchCall(merchEvent(item,'charge.dispute.created',{charge_id:item.charge}));
  const refund=kind==='tip'?tipRefund(item,300):merchRefund(item,1000);
  await race(disputeFirst?dispute:refund,disputeFirst?refund:dispute,`${kind} refund/dispute race ${disputeFirst?'dispute first':'refund first'}`);
  check((kind==='tip'?tipState(item):merchState(item)).payment,kind==='tip'?'charged_back':'disputed',`${kind} dispute precedence survives reordered full refunds`);
}
for (const fulfillment of ['processing','shipped','delivered','returned']) {
  const order=createMerch(); run(merchComplete(order));
  sql(`update public.merch_orders set fulfillment_status=${literal(fulfillment)} where id='${order.id}';`);
  run(merchRefund(order,250));
  check(merchState(order).fulfillment,fulfillment,`partial refund preserves ${fulfillment}`);
  run(merchRefund(order,1000));
  check(merchState(order).fulfillment,fulfillment==='processing'?'canceled':fulfillment,`full refund preserves completed ${fulfillment} history`);
  check(merchState(order).total,1000,'original charged amount is immutable in projection');
}

for (const kind of ['tip','merch']) {
  const item=kind==='tip'?createTip():createMerch();
  const bad=kind==='tip'?tipEvent(item,'payment_intent.succeeded',{amount_received_cents:299}):merchEvent(item,'payment_intent.succeeded',{amount_received_minor:999});
  run(kind==='tip'?tipCall(item,bad):merchCall(bad));
  check((kind==='tip'?tipState(item):merchState(item)).payment,'pending',`${kind} PaymentIntent received amount must match`);
  const good=kind==='tip'?tipEvent(item,'payment_intent.succeeded'):merchEvent(item,'payment_intent.succeeded');
  run(kind==='tip'?tipCall(item,good):merchCall(good));
  check((kind==='tip'?tipState(item):merchState(item)).payment,kind==='tip'?'succeeded':'paid',`${kind} separately verified PaymentIntent settles`);
}
for (const status of ['received','failed']) {
  const order=createMerch(),evt=merchEvent(order,'checkout.session.completed');
  sql(`insert into public.stripe_merch_events(stripe_event_id,event_type,object_id,linked_order_id,status,metadata)
    values(${literal(evt.id)},${literal(evt.type)},${literal(evt.facts.object_id)},'${order.id}',${literal(status)},'{}');`);
  run(merchCall(evt));
  check(merchState(order).payment,'paid',`legacy ${status} event resumes unfinished projection`);
  check(sql(`select status from public.stripe_merch_events where stripe_event_id=${literal(evt.id)}`),'processed',`legacy ${status} event is atomically finalized`);
}

for (const kind of ['tip','merch']) {
  const item=kind==='tip'?createTip():createMerch();
  run(kind==='tip'?tipComplete(item):merchComplete(item));
  const original=kind==='tip'?tipState(item):merchState(item);
  for (const patch of [{payment_intent_id:'pi_wrong'},{currency:'eur'},{event_livemode:true},
    kind==='tip'?{amount_cents:299}:{amount_minor:999},
    kind==='tip'?{amount_refunded_cents:301}:{refunded_amount_minor:1001},
    {refunded:true}]) {
    const evt=kind==='tip'?tipEvent(item,'charge.refunded',{amount_refunded_cents:100,refunded:false,...patch}):merchEvent(item,'charge.refunded',{refunded_amount_minor:250,refunded:false,...patch});
    run(kind==='tip'?tipCall(item,evt):merchCall(evt));
    check(kind==='tip'?tipState(item):merchState(item),original,`${kind} invalid refund leaves payment unchanged ${JSON.stringify(patch)}`);
  }
}

const retiredBuyerTip=createTip();
sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${retiredBuyerTip.buyerSession}';`);
const compensation=run(tipComplete(retiredBuyerTip));
check(compensation.compensationRequired,true,'retired buyer session requires compensation at settlement');
check(tipState(retiredBuyerTip).net,0,'retired buyer session cannot create creator credit');
sql(`update auth.sessions set not_after=null where id='${retiredBuyerTip.buyerSession}';`);
run(tipCall(retiredBuyerTip,tipEvent(retiredBuyerTip,'payment_intent.succeeded')));
check(tipState(retiredBuyerTip).net,0,'later account authority cannot clear sticky compensation');

// Create the original immutable receipts before disabling new initiation.
const lateItems = {tip:createTip(),merch:createMerch()};
const rollbackItems = {tip:createTip(),merch:createMerch()};
// Valid captured callbacks settle after initiation is disabled; no live rail is enabled.
sql("update public.platform_money_kill_switches set state='off' where key in ('tips_enabled','merch_enabled','digital_sales_enabled');");
for (const kind of ['tip','merch']) {
  const item=lateItems[kind];
  for (const patch of [{payment_status:'unpaid'},{payment_status:'no_payment_required'},{payment_status:null},{payment_status:'future_unknown'},
    {event_livemode:true},{object_livemode:true},{event_livemode:null},{object_livemode:null},
    kind==='tip'?{event_account:'acct_changed'}:{event_account_id:'acct_changed'},
    {currency:'eur'},kind==='tip'?{amount_cents:299}:{amount_minor:999},{payment_intent_id:'pi_wrong'},
    {object_id:'cs_test_wrong'},{client_reference_id:randomUUID()},
    kind==='tip'?{metadata_sender_id:randomUUID()}:{metadata_buyer_id:randomUUID()}]) {
    const evt=kind==='tip'?tipEvent(item,'checkout.session.completed',patch):merchEvent(item,'checkout.session.completed',patch);
    run(kind==='tip'?tipCall(item,evt):merchCall(evt));
    check((kind==='tip'?tipState(item):merchState(item)).payment,'pending',`${kind} malformed/unpaid/wrong binding cannot settle ${JSON.stringify(patch)}`);
  }
  const failed=kind==='tip'?tipEvent(item,'checkout.session.async_payment_failed',{payment_status:'unpaid'}):merchEvent(item,'checkout.session.async_payment_failed',{payment_status:'unpaid'});
  run(kind==='tip'?tipCall(item,failed):merchCall(failed));
  check((kind==='tip'?tipState(item):merchState(item)).payment,'failed',`${kind} delayed failure is recorded`);
  const late=kind==='tip'?tipEvent(item,'checkout.session.async_payment_succeeded'):merchEvent(item,'checkout.session.async_payment_succeeded');
  run(kind==='tip'?tipCall(item,late):merchCall(late));
  check((kind==='tip'?tipState(item):merchState(item)).payment,kind==='tip'?'succeeded':'paid',`${kind} verified late success settles with sales disabled`);
}

sql(`create schema if not exists stripe_settlement_native_fixture;
  create or replace function stripe_settlement_native_fixture.fail_finalization() returns trigger language plpgsql as $$
  begin if new.status='processed' then raise exception 'synthetic_finalization_failure'; end if; return new; end; $$;`);
for (const kind of ['tip','merch']) {
  const item=rollbackItems[kind];
  const evt=kind==='tip'?tipEvent(item,'checkout.session.completed'):merchEvent(item,'checkout.session.completed');
  if (kind==='tip') run(`select public.reserve_stripe_tip_webhook_event(${literal(evt.id)},${literal(evt.type)},${literal(evt.hash)},'${evt.attempt}');`);
  const table=kind==='tip'?'monetization_webhook_events':'stripe_merch_events';
  sql(`create trigger stripe_native_finalization_failure before update on public.${table} for each row execute function stripe_settlement_native_fixture.fail_finalization();`);
  const project=kind==='tip'?`select public.process_stripe_tip_webhook_lifecycle(${literal(evt.id)},'${evt.attempt}','${item.id}',${json(evt.facts)},'{"metadata":{}}','{}');`:merchCall(evt);
  try {reject(`${service}${project}`,/synthetic_finalization_failure/,`${kind} injected finalization failure aborts`);} finally {
    sql(`drop trigger stripe_native_finalization_failure on public.${table};`);
  }
  check((kind==='tip'?tipState(item):merchState(item)).payment,'pending',`${kind} payment projection rolled back with event failure`);
  check(sql(kind==='tip'?`select status from public.monetization_webhook_events where provider='stripe_tip' and event_id=${literal(evt.id)}`:`select count(*) from public.stripe_merch_events where stripe_event_id=${literal(evt.id)}`),kind==='tip'?'received':'0',`${kind} no falsely completed event survives rollback`);
  if (kind==='tip') {
    run(`select public.finalize_stripe_tip_webhook_event(${literal(evt.id)},'${evt.attempt}','failed');`);
    evt.attempt=randomUUID();
  }
  run(kind==='tip'?tipCall(item,evt):merchCall(evt));
  check((kind==='tip'?tipState(item):merchState(item)).payment,kind==='tip'?'succeeded':'paid',`${kind} exact same event retries successfully`);
}
reject("set role authenticated;select public.process_stripe_merch_webhook_lifecycle('evt_denied','checkout.session.completed',repeat('a',64),'{}');",/permission denied/,'authenticated cannot forge merch settlement');
check(moneyState(),{live_money_enabled:'off',payouts_enabled:'off'},'live money and payouts remain off');
console.log(JSON.stringify({passed:true,assertions:checks,lockObservedRaces:observedRaces,providerTransport:false,database}));
