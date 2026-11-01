#!/usr/bin/env node
// Synthetic native PostgreSQL evidence only: no provider, URL or live fallback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';

const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const container=option('container'),database=option('database');
assert.match(container??'',/^chillywood-event-offer-audit-[a-z0-9-]+$/);
assert.match(database??'',/^stripe_followup_validation(?:_[a-z0-9_]+)?$/);
const inspection=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(inspection.State.Running,true);
assert.equal(inspection.HostConfig.NetworkMode,'none');
assert.deepEqual(inspection.Mounts,[]);
assert.equal(Object.keys(inspection.HostConfig.PortBindings??{}).length,0);
const args=['exec','-i',container,'psql','-X','-h','/tmp','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-Atq'];
const sql=input=>execFileSync('docker',args,{input,encoding:'utf8',timeout:60_000,stdio:['pipe','pipe','pipe']}).trim();
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
const parse=output=>JSON.parse(output.split('\n').filter(line=>line.startsWith('{')).at(-1));
const read=statement=>parse(sql(`select ${statement};`));
let checks=0,races=0;
const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);console.log(`ok ${++checks} - ${message}`);};
const deny=(statement,pattern,message)=>{
  assert.throws(()=>sql(statement),error=>pattern.test(String(error.stderr??error)),message);
  console.log(`ok ${++checks} - ${message}`);
};
const moneyState=()=>read("jsonb_object_agg(key,state) from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled')");
check(sql('select current_database()'),database,'explicit synthetic database');
check(moneyState(),{live_money_enabled:'off',payouts_enabled:'off'},'live money and payouts are off');
const sourceFiles=['supabase/migrations/20261027034858_creator_connect_observed_configuration.sql','supabase/functions/_shared/stripe-connect.ts'];
console.log(JSON.stringify({database,container,sourceSHA256:Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(new URL(`../${file}`,import.meta.url))).digest('hex')]))}));

function session(input,onData,hold=false){
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let output='',error='';
  const done=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('native Connect session timed out'));},60_000);
    child.stdout.on('data',chunk=>{output+=chunk;onData?.(output);});
    child.stderr.on('data',chunk=>{error+=chunk;});
    child.on('error',cause=>{clearTimeout(timer);reject(cause);});
    child.on('close',code=>{clearTimeout(timer);resolve({code,output,error});});
  });
  if(hold)child.stdin.write(input);else child.stdin.end(input);
  return {child,done};
}
async function race(first,second,label){
  let entered;const ready=new Promise(resolve=>{entered=resolve;});
  const a=session(`begin;${first}select 'native_connect_barrier';\n`,output=>{if(output.includes('native_connect_barrier'))entered();},true);
  await Promise.race([ready,a.done.then(result=>{throw Error(result.error||'Connect transaction ended before barrier');})]);
  const name=`native-connect-${randomUUID()}`;
  const b=session(`set application_name=${literal(name)};${second}`);
  let blocked=false;
  try{
    const deadline=Date.now()+20_000;
    while(Date.now()<deadline){
      blocked=sql(`select count(*) from pg_stat_activity where application_name=${literal(name)} and wait_event_type='Lock'`)==='1';
      if(blocked)break;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
  }finally{a.child.stdin.end('commit;\n');}
  const results=await Promise.all([a.done,b.done]);
  check(blocked,true,`${label}: stale observer waits on the actual row lock`);
  for(const result of results)check(result.code,0,`${label}: transaction completes (${result.error})`);
  races++;
  return results.map(result=>parse(result.output));
}

const creator=randomUUID(),account=`acct_native${creator.replaceAll('-','')}`;
sql(`insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values('${creator}',false,false,now());`);
const row=parse(sql(`with value as (
  insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,
    provider_account_type,provider_controller_type,provider_is_controller,provider_dashboard_type,provider_fees_payer,
    provider_fees_payer_raw,provider_losses_collector,provider_requirements_collection,provider_configuration_observed_at,
    provider_configuration_account_id,provider_configuration_status,provider_expected_configuration_key,
    details_submitted,payouts_enabled,requirements_currently_due,requirements_past_due)
  values('${creator}','stripe_connect','test',${literal(account)},'none','application',true,'express','platform',
    'application','platform','stripe',clock_timestamp(),${literal(account)},'match','stripe_connect_test_express_controller_v1',
    true,true,'[]','[]') returning id,provider_configuration_observed_at
) select to_jsonb(value) from value;`));
const accountState=()=>read(`jsonb_build_object('account',provider_account_id,'observedAccount',provider_configuration_account_id,
  'observedAt',provider_configuration_observed_at,'status',provider_configuration_status,'dashboard',provider_dashboard_type)
  from public.creator_payout_accounts where id='${row.id}'`);
const eligibility=()=>read(`jsonb_build_object('status',metadata->'provider_configuration'->>'status','ready',provider_ready,
  'payable',eligible_for_payouts,'hold',fraud_hold_active,'review',admin_review_status,'reason',eligibility_reason,
  'tax',tax_ready) from public.creator_payout_eligibility_records where creator_user_id='${creator}'`);
function observe(snapshot,status,seconds=1,expectedAccount=account){
  return `with changed as (update public.creator_payout_accounts
    set provider_configuration_status=${literal(status)},provider_dashboard_type=${literal(status==='match'?'express':'none')},
      provider_configuration_observed_at=${literal(snapshot.observedAt)}::timestamptz+interval '${seconds} second'
    where id='${row.id}' and provider='stripe_connect' and provider_environment='test'
      and provider_account_id=${literal(expectedAccount)}
      and provider_configuration_observed_at=${literal(snapshot.observedAt)}::timestamptz returning id)
    select jsonb_build_object('updated',count(*)) from changed;`;
}
check(eligibility().status,'match','canonical observation initializes matching eligibility');
check(eligibility().payable,false,'matching provider state never grants payout execution');
for(const winner of ['mismatch','match']){
  const snapshot=accountState(),loser=winner==='match'?'mismatch':'match';
  const results=await race(observe(snapshot,winner),observe(snapshot,loser,2),`${winner} observation wins compare-and-set`);
  check(results.map(result=>result.updated),[1,0],'exactly one observer owns the prior observed_at snapshot');
  check(accountState().status,winner,'stale observer cannot replace the canonical account state');
  check(eligibility().status,winner,'eligibility commits the same winning configuration');
  check(eligibility().ready,winner==='match','provider readiness reflects the winning configuration');
  check(eligibility().payable,false,'competing observations never authorize payouts');
}

const beforeFailure=accountState(),eligibilityBeforeFailure=eligibility();
const retryStatement=observe(beforeFailure,'mismatch');
sql(`create schema if not exists stripe_connect_native_fixture;
  create or replace function stripe_connect_native_fixture.fail_projection() returns trigger language plpgsql as $$
    begin raise exception 'synthetic_connect_projection_failure';end;$$;
  create trigger stripe_native_connect_failure before update on public.creator_payout_eligibility_records
    for each row when(new.creator_user_id='${creator}') execute function stripe_connect_native_fixture.fail_projection();`);
try{deny(retryStatement,/synthetic_connect_projection_failure/,'injected eligibility failure aborts the observation transaction');}
finally{sql('drop trigger stripe_native_connect_failure on public.creator_payout_eligibility_records;');}
check(accountState(),beforeFailure,'failed eligibility projection rolls back the account observation');
check(eligibility(),eligibilityBeforeFailure,'failed eligibility projection preserves its prior state');
check(parse(sql(retryStatement)).updated,1,'same observation retries after transaction rollback');
check(eligibility().status,'mismatch','successful retry projects the new configuration');

parse(sql(observe(accountState(),'match')));
const boundBefore=accountState(),eligibleBefore=eligibility();
const replacement=`acct_replacement${creator.replaceAll('-','')}`;
deny(`update public.creator_payout_accounts set provider_account_id=${literal(replacement)} where id='${row.id}';`,
  /configuration_observation_check/,'raw replacement cannot inherit a matching observation');
check(accountState(),boundBefore,'rejected replacement preserves the account binding');
check(eligibility(),eligibleBefore,'rejected replacement preserves matching eligibility atomically');
deny(`update public.creator_payout_accounts set provider_account_id=${literal(replacement)},
  provider_configuration_status='unknown',provider_configuration_observed_at=null,provider_configuration_account_id=null where id='${row.id}';`,
  /connect_account_binding_immutable/,'even a cleared observation cannot replace an immutable account binding');
check(accountState(),boundBefore,'failed cleared replacement preserves the original account and observation');
check(parse(sql(observe(boundBefore,'match'))).updated,1,'original account observation can still refresh its unchanged binding');

sql(`update public.creator_payout_eligibility_records set fraud_hold_active=true,admin_review_status='on_hold',
    eligibility_status='on_hold',eligibility_reason='Synthetic native platform hold',tax_ready=true where creator_user_id='${creator}';
  update public.creator_payout_accounts set provider_configuration_account_id=${literal(account)},provider_configuration_status='match',
    provider_configuration_observed_at=clock_timestamp(),provider_dashboard_type='express' where id='${row.id}';`);
check(eligibility(),{status:'match',ready:false,payable:false,hold:true,review:'on_hold',reason:'Synthetic native platform hold',tax:true},
  'fresh valid observation preserves platform holds and independent tax state');
for(const role of ['anon','authenticated','service_role']){
  check(sql(`select has_function_privilege(${literal(role)},'private.project_creator_connect_observed_eligibility()','EXECUTE')`),'f',`${role} cannot invoke the private projection directly`);
}
check(moneyState(),{live_money_enabled:'off',payouts_enabled:'off'},'live money and payouts remain off');
console.log(JSON.stringify({passed:true,assertions:checks,lockObservedRaces:races,providerTransport:false,database}));
