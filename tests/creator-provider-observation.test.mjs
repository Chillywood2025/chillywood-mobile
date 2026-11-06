import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceCreator} from './helpers/automatic-commerce-fixture.mjs';

// Execute the production worker and actual canonical adapter. Only transport
// and the Supabase query protocol are replaced by the owned SQL fixture.
function productionModule(file, cache=new Map()) {
  file=path.resolve(file);
  if(cache.has(file)) return cache.get(file);
  const module={exports:{}};cache.set(file,module.exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const require=name=>{
    if(name==='npm:@supabase/supabase-js@2') return {createClient:()=>{throw Error('no network client');}};
    if(name.startsWith('.')) return productionModule(path.resolve(path.dirname(file),name),cache);
    throw Error(`Unexpected dependency ${name}`);
  };
  new Function('require','module','exports',code)(require,module,module.exports);
  return module.exports;
}
function sqlClient(db, errors=[]) {
  const safe=name=>{assert.match(name,/^[a-z_]+$/);return `"${name}"`;};
  return {
    rpc:async(name,args)=>{
      try { const result=await db.query(`select public.${safe(name)}(${Object.keys(args).map((k,i)=>`${safe(k)}=>$${i+1}`).join(',')}) result`,Object.values(args));return {data:result.rows[0].result,error:null}; }
      catch(error){errors.push(error.message);return {data:null,error:{message:error.message}};}
    },
    from:table=>{
      let mode='select',values,filters=[],single=false;
      const q={select:()=>q,update:v=>{mode='update';values=v;return q;},insert:v=>{mode='insert';values=v;return q;},
        eq:(k,v)=>{filters.push([k,v]);return q;},is:(k,v)=>{assert.equal(v,null);filters.push([k,null]);return q;},
        single:()=>{single=true;return q;},then:(resolve,reject)=>execute().then(resolve,reject)};
      const execute=async()=>{
        try {
          const params=[];const bind=v=>{params.push(v&&typeof v==='object'?JSON.stringify(v):v);return `$${params.length}`;};
          let sql=mode==='select'?`select * from public.${safe(table)}`:mode==='update'
            ?`update public.${safe(table)} set ${Object.entries(values).map(([k,v])=>`${safe(k)}=${bind(v)}`).join(',')}`
            :`insert into public.${safe(table)}(${Object.keys(values).map(safe).join(',')}) values(${Object.values(values).map(bind).join(',')})`;
          if(filters.length) sql+=' where '+filters.map(([k,v])=>v===null?`${safe(k)} is null`:`${safe(k)}=${bind(v)}`).join(' and ');
          if(mode!=='select')sql+=' returning *';
          const rows=JSON.parse(JSON.stringify((await db.query(sql,params)).rows));
          if(single&&rows.length!==1)throw Error('expected exactly one row');
          return {data:single?rows[0]:rows,error:null};
        }catch(error){errors.push(error.message);return {data:null,error:{message:error.message}};}
      };return q;
    },
  };
}

test('full-chain provider queue executes canonical observation, audit, CAS and strict pending', {timeout:180000},async()=>{
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true});
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  try {
    const actor=await seedCommerceCreator(db);
    await db.query(`insert into public.wave1_creator_eligibility(creator_user_id,creator_role,account_status,authority_source,last_operation_key)
      values($1,true,'ACTIVE','synthetic_test','synthetic_test') on conflict(creator_user_id) do update set creator_role=true,account_status='ACTIVE'`,[actor.id]);
    const account=await scalar(`insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id)
      values($1,'stripe_connect','test','acct_providerFixture') returning id`,[actor.id]);
    await db.exec(`select set_config('request.jwt.claim.role','service_role',false);select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
    assert.deepEqual(await scalar('select public.claim_creator_provider_observations()'),[],'disabled by default');
    await db.exec('update private.creator_provider_observation_control set enabled=true');
    const {runProviderObservations}=productionModule('supabase/functions/_shared/creator-provider-observation.ts');
    const calls=[];
    const transport=async(url,init)=>{calls.push([url,init.method]);return Response.json({id:'acct_providerFixture',livemode:false,
      type:'express',controller:{type:'application',is_controller:true,stripe_dashboard:{type:'express'},fees:{payer:'application'},losses:{payments:'application'},requirement_collection:'stripe'},
      charges_enabled:true,payouts_enabled:true,details_submitted:true,country:'US',default_currency:'usd',
      capabilities:{card_payments:'active',transfers:'active'},requirements:{currently_due:[],past_due:[],eventually_due:[],pending_verification:[],disabled_reason:null}});};
    const errors=[];
    const result=await runProviderObservations(sqlClient(db,errors),{test:'sk_test_SyntheticOnly',live:''},transport);
    assert.equal(result.observed,1,JSON.stringify({result,errors}));assert.equal(calls.length,1);assert.equal(calls[0][1],'GET');
    assert.equal(await scalar('select tax_status from public.creator_payout_accounts where id=$1',[account]),'not_connected');
    assert.equal(await scalar('select observed_at is not null and lease_token is null from private.creator_provider_observation_jobs where account_id=$1',[account]),true);
    assert.equal(await scalar("select count(*)::int from public.platform_admin_audit_logs where action='creator_provider_observation_persisted' and actor_role='system' and actor_user_id is null"),1);
    assert.notEqual(await scalar('select tax_complete from public.wave1_creator_eligibility where creator_user_id=$1',[actor.id]),true);
    assert.deepEqual(await scalar('select public.claim_creator_provider_observations()'),[],'minute cap');
    assert.equal((await scalar('select public.complete_creator_provider_observation($1,null)',[account])).completed,false);
    await db.exec("update private.creator_provider_observation_control set last_claimed_at=null;update private.creator_provider_observation_jobs set due_at=clock_timestamp()-interval '1 second'");
    const [job]=await scalar('select public.claim_creator_provider_observations()');assert.ok(job);
    assert.equal((await scalar('select public.complete_creator_provider_observation($1,$2)',[account,job.lease_token])).completed,false,'no caller freshness minting');
    assert.equal((await scalar('select public.fail_creator_provider_observation($1,$2)',[account,job.lease_token])).recorded,true);
    assert.equal(await scalar('select failure_count from private.creator_provider_observation_jobs where account_id=$1',[account]),1);
    for(const role of ['anon','authenticated']){
      assert.equal(await scalar("select has_function_privilege($1,'public.claim_creator_provider_observations()','execute')",[role]),false);
      assert.equal(await scalar("select has_table_privilege($1,'private.creator_provider_observation_jobs','select')",[role]),false);
    }
    assert.equal(await scalar("select relforcerowsecurity from pg_class where oid='private.creator_provider_observation_jobs'::regclass"),true);
    await db.query(`insert into private.creator_eligibility_declarations(creator_id,session_id,declared_18_plus,country_code,region_code,declaration_version)
      values($1,$2,true,'US','CA','adult-us-creator-v1')`,[actor.id,actor.session]);
    const counts=await scalar('select public.account_purge_deidentification_counts($1)',[actor.id]);
    assert.equal(counts.creatorEligibilityDeclarations,1);
    await scalar('select public.create_account_purge_manual_review_items($1,null,$2)',[actor.id,JSON.stringify(counts)]);
    const retained=(await db.query("select category,status,metadata from public.account_purge_manual_review_items where source_type='creator_eligibility_declarations' and target_user_id=$1",[actor.id])).rows;
    assert.deepEqual(retained,[{category:'abuse_security_records',status:'retained',metadata:{retainedCount:1}}]);
    // Separate synthetic production Premium and live account, never relabel a
    // test entitlement or account. Exercise canonical live SQL and all 4 GETs.
    const live=await seedCommerceCreator(db,undefined,{environment:'production'});
    await db.query(`insert into public.wave1_creator_eligibility(creator_user_id,creator_role,account_status,authority_source,last_operation_key)
      values($1,true,'ACTIVE','synthetic_test','synthetic_test')`,[live.id]);
    const liveAccount=await scalar(`insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id)
      values($1,'stripe_connect','live','acct_liveFixture') returning id`,[live.id]);
    await db.exec(`insert into private.creator_connect_live_observation_policy(platform_account_id,enabled) values('acct_platformFixture',true);
      update private.creator_provider_observation_control set last_claimed_at=null;
      select set_config('request.jwt.claim.role','service_role',false);select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
    const liveReads=[];
    const liveTransport=async(url,init)=>{
      assert.equal(init.method,'GET');assert.match(init.headers.Authorization,/^Bearer sk_live_/);liveReads.push(url);
      if(url.endsWith('/v1/account'))return Response.json({id:'acct_platformFixture',livemode:true});
      if(url.includes('/v2/'))return Response.json({id:'acct_liveFixture',livemode:true,dashboard:'express',
        defaults:{responsibilities:{fees_collector:'application',losses_collector:'application'}},
        configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{status:'active'}}}}}});
      const original=await (await transport(url,init)).json();
      return Response.json({...original,id:'acct_liveFixture',livemode:true,settings:{payouts:{schedule:{interval:'manual'}}}});
    };
    const liveErrors=[];
    const liveResult=await runProviderObservations(sqlClient(db,liveErrors),{test:'',live:'sk_live_SyntheticOnly'},liveTransport);
    assert.equal(liveResult.observed,1,JSON.stringify({liveResult,liveErrors}));assert.equal(liveReads.length,4);
    assert.equal(await scalar('select observed_at is not null from private.creator_provider_observation_jobs where account_id=$1',[liveAccount]),true);
    assert.equal(await scalar("select metadata->>'provider_environment' from public.platform_admin_audit_logs where target_id=$1 and action='creator_provider_observation_persisted'",[liveAccount]),'live');
    assert.notEqual(await scalar('select tax_complete from public.wave1_creator_eligibility where creator_user_id=$1',[live.id]),true);
    for(let i=0;i<6;i++){
      const queued=await seedCommerceCreator(db,undefined,{environment:'production'});
      await db.query(`insert into public.wave1_creator_eligibility(creator_user_id,creator_role,account_status,authority_source,last_operation_key)
        values($1,true,'ACTIVE','synthetic_test','synthetic_test')`,[queued.id]);
      await db.query(`insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id)
        values($1,'stripe_connect','live',$2)`,[queued.id,`acct_queue${i}`]);
    }
    await db.exec(`update private.creator_provider_observation_control set last_claimed_at=null;
      select set_config('request.jwt.claim.role','service_role',false);select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
    const first=await scalar('select public.claim_creator_provider_observations()');assert.equal(first.length,5);
    await db.exec('update private.creator_provider_observation_control set last_claimed_at=null');
    const next=await scalar('select public.claim_creator_provider_observations()');assert.equal(next.length,1);
    assert.equal(first.some(x=>x.account_id===next[0].account_id),false,'leases prevent duplicate claims');
    await db.query("update private.creator_provider_observation_jobs set lease_until=clock_timestamp()-interval '1 second' where account_id=$1",[first[0].account_id]);
    assert.equal((await scalar('select public.complete_creator_provider_observation($1,$2)',[first[0].account_id,first[0].lease_token])).completed,false,'expired lease cannot complete');
    await db.exec('update private.creator_provider_observation_control set last_claimed_at=null');
    assert.deepEqual(await scalar('select public.claim_creator_provider_observations()'),[],'expired unknown observations back off');
    assert.equal(await scalar('select failure_count from private.creator_provider_observation_jobs where account_id=$1',[first[0].account_id]),1);
    await db.exec("update public.platform_money_kill_switches set state='off' where key='live_money_enabled';update private.creator_provider_observation_control set last_claimed_at=null");
    await db.query('update private.creator_provider_observation_jobs set due_at=clock_timestamp() where account_id=$1',[account]);
    const uncertain=sqlClient(db);const realRpc=uncertain.rpc;let attempts=0;
    uncertain.rpc=async(name,args)=>name==='complete_creator_provider_observation'
      ?(attempts++,{data:null,error:{message:'synthetic lost response'}}):realRpc(name,args);
    const unknown=await runProviderObservations(uncertain,{test:'sk_test_SyntheticOnly',live:''},transport);
    assert.equal(unknown.pending,1);assert.equal(attempts,1,'unknown write is never immediately retried');
    assert.equal(await scalar('select lease_token is not null from private.creator_provider_observation_jobs where account_id=$1',[account]),true);
  }finally{await db.close();}
});
