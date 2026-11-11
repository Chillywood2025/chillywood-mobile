import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {setTimeout as delay} from 'node:timers/promises';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {databaseFactory} from '../helpers/native-deployment-database.mjs';

const source=readFileSync(new URL('../../scripts/test-revenuecat-premium-quarantine-concurrency.mjs',import.meta.url),'utf8');
test('exited race children report their original error instead of a misleading lock timeout',()=>{
 const body=source.slice(source.indexOf('function assertSessionRunning('),source.indexOf('// These fixtures'));
 const check=vm.runInNewContext(`${body}\nassertSessionRunning`);
 const session=(exitCode,signalCode,stderr)=>({child:{exitCode,signalCode},errorOutput:()=>stderr});
 assert.doesNotThrow(()=>check(session(null,null,''),'race'));
 assert.throws(()=>check(session(1,null,'service_role_required'),'race'),/child exited.*service_role_required/);
 assert.throws(()=>check(session(0,null,''),'race'),/code=0/);
 assert.throws(()=>check(session(null,'SIGTERM',''),'race'),/signal=SIGTERM/);
 assert.throws(()=>check(session(1,null,'a'.repeat(64)),'race'),/<redacted>/);
 assert.match(source,/set local request\.jwt\.claim\.role='service_role';\nselect public\.process_revenuecat_terminal_event_atomic/);
});

test('terminal fixture requires service context; native mode retains real restore/terminal lock ordering',{timeout:600000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,
  databaseFactory:process.env.NATIVE_DEPLOYMENT_PG_BIN?()=>databaseFactory({transport:process.env.NATIVE_PRODUCTION_PG_LOOPBACK==='1'?'loopback':'unix'}):null});
 const lit=x=>`'${String(x).replaceAll("'","''")}'`;
 const hash=x=>createHash('sha256').update(x).digest('hex');
 try {
  await db.exec("update public.platform_money_kill_switches set state='sandbox_only' where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled')");
  const definition=(await db.query("select pg_get_functiondef('public.process_revenuecat_terminal_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text)'::regprocedure) body")).rows[0].body;
  for(const terminalFirst of [false,true]) {
   const user=randomUUID(),original=`fixture-race-${user}`;
   const base=Number((await db.query('select extract(epoch from clock_timestamp())*1000 as n')).rows[0].n);
   const iso=n=>lit(new Date(base+n).toISOString());
   await db.exec(`insert into auth.users(id,is_sso_user,is_anonymous) values(${lit(user)},false,false);
    select public.process_revenuecat_premium_event_atomic('revenuecat_google_play',${lit(`initial-${original}`)},'INITIAL_PURCHASE',${lit(user)}::uuid,
     'premium_subscription','monthly','sandbox','active',${iso(-7200000)}::timestamptz,${iso(3600000)}::timestamptz,${iso(-7200000)}::timestamptz,
     999,'usd',${lit(hash(original))},'NORMAL','google_play','android',null,p.id,${lit(original)})
     from public.monetization_products p where provider='revenuecat_google_play' and provider_product_id='premium_subscription'
      and provider_base_plan_id='monthly' and environment='sandbox' and status='sandbox';
    update public.user_entitlements set expires_at=${iso(-3600000)}::timestamptz where user_id=${lit(user)} and entitlement_key='premium';
    update public.access_grants set expires_at=${iso(-3600000)}::timestamptz where user_id=${lit(user)}::uuid and grant_type='premium';`);
   assert.equal((await db.query('select count(*)::int n from public.revenuecat_premium_transaction_authority where original_transaction_id=$1',[original])).rows[0].n,1);
   const restore=`select public.reconcile_revenuecat_google_premium_snapshot_atomic(${lit(`snapshot-${original}`)},${lit(user)}::uuid,${lit(user)},'fixture-subscription',${lit(original)},
    'premium_subscription','monthly','active',${iso(-600000)}::timestamptz,${iso(3600000)}::timestamptz,${iso(0)}::timestamptz,${lit(hash(`snapshot-${original}`))})`;
   const terminal=`select public.process_revenuecat_terminal_event_atomic('revenuecat_google_play',${lit(`refund-${original}`)},'REFUND',${lit(user)}::uuid,
    'premium_subscription','monthly','sandbox','revoked',${iso(-7200000)}::timestamptz,${iso(3600000)}::timestamptz,${iso(-300000)}::timestamptz,
    ${lit(hash(`refund-${original}`))},'NORMAL','google_play','android',${lit(original)})`;
   await db.exec("select set_config('request.jwt.claim.role','',false)");
   await assert.rejects(db.query(terminal),/service_role_required/);
   const authorized=`set local request.jwt.claim.role='service_role'; ${terminal}`;
   if(db.withConnection) {
    await db.withConnection(async first=>db.withConnection(async second=>{
     // Match the UTC Supabase fixture; fresh native connections otherwise inherit host TZ.
     for(const connection of [first,second]) {
      await connection.query("set time zone 'UTC';begin;set local statement_timeout='15s'");
      assert.equal((await connection.query('show timezone')).rows[0].TimeZone,'UTC');
     }
     let pending;
     try {
      await first.query(terminalFirst?authorized:restore);
      const pid=(await second.query('select pg_backend_pid() pid')).rows[0].pid;
      let settled=false;
      pending=second.query(terminalFirst?restore:authorized).then(value=>({value}),error=>({error})).finally(()=>{settled=true;});
      const deadline=Date.now()+10000;let observed=false;
      while(Date.now()<deadline) {
       if(settled) throw new Error(`race completed before expected lock: ${String((await pending).error??'unexpected success')}`);
       observed=(await db.query("select wait_event_type='Lock' and $2::int=any(pg_blocking_pids(pid)) blocked from pg_stat_activity where pid=$1",[pid,(await first.query('select pg_backend_pid() pid')).rows[0].pid])).rows[0]?.blocked===true;
       if(observed) break;
       await delay(25);
      }
      assert.equal(observed,true,'actual independent-backend blocker required');
      await first.query('commit');
      const outcome=await pending;
      if(terminalFirst) {assert.match(outcome.error?.message??'',/premium_reconciliation_terminal_authority_not_superseded/);await second.query('rollback');}
      else {assert.equal(outcome.error,undefined);await second.query('commit');}
      for(const connection of [first,second]) assert.notEqual((await connection.query("select current_setting('request.jwt.claim.role',true) role")).rows[0].role,'service_role');
     } finally {await first.query('rollback');if(pending) await pending;await second.query('rollback');}
    }));
   } else {
    // PGlite proves authority semantics only; independent lock edges require native mode.
    await db.exec('begin');try {await db.exec(restore);await db.exec(authorized);await db.exec('commit');}catch(error){await db.exec('rollback');throw error;}
   }
   const row=(await db.query('select authority_state,public.premium_subject_has_finite_authority_internal($1) active from public.revenuecat_premium_transaction_authority where original_transaction_id=$2',[user,original])).rows[0];
   assert.equal(row.authority_state,'financial_terminal');assert.equal(row.active,false);
  }
  assert.equal((await db.query("select pg_get_functiondef('public.process_revenuecat_terminal_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text,text,text)'::regprocedure) body")).rows[0].body,definition);
 } finally {await db.close();}
});
