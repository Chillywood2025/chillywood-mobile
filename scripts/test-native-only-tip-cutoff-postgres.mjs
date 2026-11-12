#!/usr/bin/env node
// Fresh, caller-owned trust-authenticated loopback PostgreSQL only. Uses the
// existing validated native adapter, never saved credentials or a remote URL.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {databaseFactory,localNativeOptions} from '../tests/helpers/native-profile-database.mjs';
import {runNativeTipCutoffProof} from '../tests/creator-money/native-only-tip-admission-fixture.mjs';

await runNativeTipCutoffProof({databaseFactory,diagnostic:console.log,
  beforeCutoff:async({db,cutoffSQL,other,quote})=>{
    // databaseFactory validated this exact driver path/version before this hook.
    const {default:pg}=await import(pathToFileURL(process.env.NATIVE_PG_DRIVER).href);
    const database=(await db.query('select current_database() as name')).rows[0].name;
    assert.match(database,/^profile_replay_[0-9a-f]{32}$/u);
    const options={...localNativeOptions(),database};
    const holder=new pg.Client({...options,application_name:'tip-cutoff-holder'});
    const observer=new pg.Client({...options,application_name:'tip-cutoff-observer'});
    let migration;
    try {
      await holder.connect();await observer.connect();
      await holder.query("begin;set local statement_timeout='20min';select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
      const tip='ea000000-0000-4000-8000-000000000021',request='ea000000-0000-4000-8000-000000000022';
      const q={...quote,tipId:tip,body:{...quote.body,client_reference_id:tip,'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':other.user_id}};
      const admitted=await holder.query('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4) as attempt',[other.user_id,other.session_id,request,q]);
      assert.equal(admitted.rows[0].attempt.tipId,tip,'actual pre-cutover admission holds insertion locks');
      const holderPid=(await holder.query('select pg_backend_pid() as pid')).rows[0].pid;
      const installerPid=(await db.query('select pg_backend_pid() as pid')).rows[0].pid;
      assert.notEqual(holderPid,installerPid);
      migration=db.exec(cutoffSQL);
      // Capture rejection immediately without an unhandled promise while waiting.
      const completed=migration.then(()=>({ok:true}),error=>({ok:false,error}));
      let evidence;
      const deadline=Date.now()+120_000;
      while(Date.now()<deadline){
        const result=await observer.query(`select pg_blocking_pids($1) as blockers,exists(select 1 from pg_locks
          where pid=$1 and locktype='relation' and relation='private.creator_tip_checkout_attempts'::regclass
          and mode='ShareRowExclusiveLock' and not granted) as awaiting_cutoff`,[installerPid]);
        evidence=result.rows[0];
        if(evidence.awaiting_cutoff&&evidence.blockers.includes(holderPid))break;
        await delay(25);
      }
      assert.equal(evidence.awaiting_cutoff,true,'installer visibly waits for actual attempt transaction');
      assert.ok(evidence.blockers.includes(holderPid));
      await holder.query('rollback');
      const result=await completed;if(!result.ok)throw result.error;
      assert.equal((await db.query('select count(*)::integer as n from public.creator_tip_transactions where id=$1',[tip])).rows[0].n,0);
      console.log(JSON.stringify({schedule:'attempt rollback before cutoff commit',holderPid,installerPid,...evidence}));
    } finally {
      try {await holder.query('rollback');} catch {}
      if(migration)await migration.catch(()=>{});
      await Promise.all([holder.end(),observer.end()]);
    }
  },
});
