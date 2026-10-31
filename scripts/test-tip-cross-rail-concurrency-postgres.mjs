#!/usr/bin/env node
// Two real PostgreSQL sessions, only in an owned disposable clone of a local
// Supabase CLI reset. Synthetic provider facts; no Google/Stripe HTTP or money.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';

if(process.argv.includes('--help')){
  console.log('Run after local Supabase reset. Only generated local clone is written; no remote URLs accepted.');process.exit(0);
}
assert.equal(process.argv.length,2);
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/mu)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_tip_action`;
const restore=createBrandGuardCloneRestorer({container});
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='20s';set time zone 'UTC';${sql}`),'fixture query').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc',
  'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','tip-action-fixture-admin',...a],input,encoding);
const sessions=[];
function session(name,sql){
  const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
  child.stdin.write(`set application_name=${lit(name)};set statement_timeout='30s';set time zone 'UTC';${sql}\n`);
  const s={child,done,output:()=>stdout,name};sessions.push(s);return s;
}
async function until(predicate,label){const deadline=Date.now()+20000;while(Date.now()<deadline){if(predicate())return;await delay(25);}throw Error(label);}
let cloned=false;
try{
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
  assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
  const containers=success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n');
  assert.ok(containers.includes(container));
  assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261030190449');",'postgres'),'t');
  success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create disposable clone');cloned=true;
  query('create schema vault;create extension supabase_vault with schema vault;');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql',
    '--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  success(dump,'read-only local source export');
  success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore clone');
  for(const name of ['event-reservation-authority','creator-external-payment-capabilities','creator-external-payment-authority'])
    query(readFileSync(`tests/fixtures/${name}.sql`,'utf8'));
  const actors=JSON.parse(query("select jsonb_object_agg(kind,jsonb_build_object('id',user_id,'session',session_id)) from event_reservation_fixture.actors"));
  const auth=(who,role='authenticated')=>`set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:actors[who].id,session_id:actors[who].session}))};set local request.headers='{"x-chillywood-platform":"ios"}';`;
  const call=(who,sql,role)=>`begin;${auth(who,role)}select ${sql};commit;`;
  const rpc=(who,sql,role)=>JSON.parse(query(call(who,sql,role)).split('\n').at(-1));
  let checks=0;
  async function race(label,who,first,second,error) {
    const holder=session(`tip-holder-${checks}`,`begin;${auth(who,first.role)}select ${first.sql};select 'HOLDER_READY';`);
    await until(()=>holder.output().includes('HOLDER_READY'),`${label}: holder did not finish production function`);
    const waiter=session(`tip-waiter-${checks}`,call(who,second.sql,second.role));waiter.child.stdin.end();
    // A clock delay is never scheduling proof: record a real blocking edge AND
    // the contended advisory lock while both production transactions are open.
    await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(holder.name)}
      where h.datname=current_database() and w.datname=current_database() and w.application_name=${lit(waiter.name)}
      and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid))
      and exists(select 1 from pg_locks l where l.pid=w.pid and l.locktype='advisory' and not l.granted);`)==='1',`${label}: no observed advisory blocking edge`);
    const evidence=JSON.parse(query(`select jsonb_build_object('holderPid',h.pid,'waiterPid',w.pid,
      'waitEvent',w.wait_event,'blockers',pg_blocking_pids(w.pid)) from pg_stat_activity w
      join pg_stat_activity h on h.application_name=${lit(holder.name)}
      where h.datname=current_database() and w.datname=current_database() and w.application_name=${lit(waiter.name)}`));
    assert.ok(evidence.blockers.includes(evidence.holderPid));
    assert.notEqual(evidence.holderPid,evidence.waiterPid);
    console.log(JSON.stringify({schedule:label,...evidence}));
    holder.child.stdin.end('commit;\n');const firstResult=await holder.done;assert.equal(firstResult.code,0,firstResult.stderr);
    const secondResult=await waiter.done;
    if(error){assert.notEqual(secondResult.code,0);assert.match(secondResult.stderr,new RegExp(error));}
    else assert.equal(secondResult.code,0,secondResult.stderr);
    console.log(`ok ${++checks} - ${label}`);return secondResult;
  }
  function quote(who,tip,amount=299) {
    return {tipId:tip,creatorId:actors.creator.id,amountCents:amount,currency:'usd',privateNote:null,providerAccountId:'acct_fixture',
      capabilityId:'ef000000-0000-4000-8000-000000000001',body:{client_reference_id:tip,'metadata[chillywood_tip_id]':tip,
      'metadata[fan_user_id]':actors[who].id,'metadata[creator_user_id]':actors.creator.id,'line_items[0][price_data][currency]':'usd',
      'line_items[0][price_data][unit_amount]':amount,'payment_intent_data[transfer_data][destination]':'acct_fixture',
      'payment_method_types[0]':'card',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600}};
  }
  function external(who,action,tip,amount=299,sessionId=actors[who].session) {
    return {role:'service_role',sql:`public.reserve_creator_tip_checkout_attempt('${actors[who].id}','${sessionId}','${action}',${lit(JSON.stringify(quote(who,tip,amount)))}::jsonb)`};
  }
  function native(who,action) {
    const intent=rpc(who,`public.create_ios_app_store_purchase_intent('com.chillywood.tip.tier2','creator_tip','${actors.creator.id}','{}')`);
    return {sql:`public.begin_creator_money_checkout('${intent.id}','${action}')`,intent:intent.id};
  }
  const abandon=action=>({sql:`public.resolve_creator_tip_payment_action('${action}',true)`});
  function verify(who,action,nativeOp,tip,provider) {
    const claims=JSON.parse(query(`select coalesce(jsonb_agg(to_jsonb(c)),'[]') from private.creator_tip_action_claims c where buyer_id='${actors[who].id}' and action_id='${action}'`));
    assert.equal(claims.length,provider?1:0,'one immutable canonical dispatch identity or no dispatch');
    if(provider){assert.equal(claims[0].provider,provider);assert.equal(claims[0].session_id,actors[who].session);assert.equal(claims[0].amount_minor,299);
      assert.equal(claims[0].provider_reference_id,provider==='stripe_connect'?tip:nativeOp.intent);}
    if(nativeOp)assert.equal(query(`select checkout_attempt_id is not null from public.money_purchase_intents where id='${nativeOp.intent}'`),provider==='revenuecat_app_store'?'t':'f');
    if(tip){assert.equal(query(`select count(*) from public.creator_tip_transactions where id='${tip}'`),provider==='stripe_connect'?'1':'0');
      assert.equal(query(`select count(*) from private.creator_tip_checkout_attempts where buyer_id='${actors[who].id}' and request_id='${action}'`),provider==='stripe_connect'?'1':'0');}
  }
  for(const [index,[nativeFirst,sameAction]] of [[true,true],[false,true],[true,false],[false,false]].entries()) {
    const who=`buyer${index+1}`,nativeAction=randomUUID(),stripeAction=sameAction?nativeAction:randomUUID();
    const tip=randomUUID(),n=native(who,nativeAction),s=external(who,stripeAction,tip);
    await race(`${sameAction?'same':'different'} action ${nativeFirst?'native then Stripe':'Stripe then native'}`,who,
      nativeFirst?n:s,nativeFirst?s:n,'tip_action_route_conflict|tip_prior_payment_unresolved');
    const winningAction=nativeFirst?nativeAction:stripeAction;
    verify(who,winningAction,n,tip,nativeFirst?'revenuecat_app_store':'stripe_connect');
    assert.equal(query(`select count(*) from private.creator_tip_action_claims where buyer_id='${actors[who].id}'`),'1');
    assert.equal(query(`select count(*) from private.creator_tip_checkout_attempts where buyer_id='${actors[who].id}'`),nativeFirst?'0':'1');
    const result=rpc(who,`public.resolve_creator_tip_payment_action('${winningAction}',true)`);
    assert.equal(result.dispatched,true);assert.equal(result.abandoned,false);assert.equal(result.terminal,false);
  }
  for(const [index,[rail,abandonFirst]] of [['native',true],['native',false],['stripe',true],['stripe',false]].entries()) {
    const who=`buyer${index+5}`,action=randomUUID(),tip=rail==='stripe'?randomUUID():null;
    const dispatch=rail==='native'?native(who,action):external(who,action,tip),stop=abandon(action);
    const result=await race(`${rail}: ${abandonFirst?'abandon before dispatch':'dispatch before abandon'}`,who,
      abandonFirst?stop:dispatch,abandonFirst?dispatch:stop,abandonFirst?'tip_action_abandoned':null);
    if(!abandonFirst)assert.match(result.stdout,/"dispatched": true/);
    verify(who,action,rail==='native'?dispatch:null,tip,abandonFirst?null:rail==='native'?'revenuecat_app_store':'stripe_connect');
    assert.equal(query(`select count(*) from private.creator_tip_abandoned_actions where buyer_id='${actors[who].id}' and action_id='${action}'`),abandonFirst?'1':'0');
  }
  // Mismatched immutable amount is tested through the actual Stripe RPC under
  // contention, not by changing production functions or disabling a trigger.
  const who='buyer9',action=randomUUID(),tip=randomUUID(),original=external(who,action,tip);
  await race('same Stripe action cannot change amount',who,original,external(who,action,tip,300),'tip_checkout_request_conflict');
  verify(who,action,null,tip,'stripe_connect');
  // A foreign session is denied before locking and is intentionally NOT
  // misreported as a successful two-backend race.
  const invalid=external(who,action,tip,299,actors.buyer10.session);
  const denied=docker(args(),call(who,invalid.sql,invalid.role));
  assert.notEqual(denied.status,0);assert.match(denied.stderr,/tip_buyer_authority_required/);
  verify(who,action,null,tip,'stripe_connect');
  assert.equal(query('select count(*) from public.access_grants'),'0','tip attempts never grant content access');
  assert.equal(checks,9);
  console.log('Tip actions: 9 observed native PostgreSQL advisory-lock races plus invalid-session rejection; synthetic providers only.');
}finally{
  for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end('rollback;\n');s.child.kill('SIGTERM');}
  try{if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');}
  finally{restore.assertSourceUnchanged();}
}
