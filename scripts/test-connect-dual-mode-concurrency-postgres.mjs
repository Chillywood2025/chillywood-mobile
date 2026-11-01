#!/usr/bin/env node
// Native independent sessions, disposable CLI clone only. No provider traffic.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
import {load,connect,account} from '../tests/creator-money/stripe-connect-observed-fixture.mjs';
if(process.argv.includes('--help')){console.log('Run real Connect lock schedules in an owned disposable local Supabase clone; no provider traffic.');process.exit(0);}
assert.equal(process.argv.length,2,'no arbitrary targets');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/mu)?.[1];assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_connect_modes`;
const restore=createBrandGuardCloneRestorer({container}),sessions=[];let cloned=false;
const lit=x=>x===null?'null':`'${String(x).replaceAll("'","''")}'`;
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='20s';${sql}`),'clone SQL').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','connect-fixture-admin',...a],input,encoding);
const service="set local role service_role;set local request.jwt.claims='{\"role\":\"service_role\"}';";
const rpc=sql=>JSON.parse(query(`begin;${service}${sql};commit;`).split('\n').at(-1));
function start(sql){const name=`connect-modes-${randomUUID()}`,child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
 child.stdin.write(`set application_name=${lit(name)};set statement_timeout='25s';${sql}\n`);
 const s={name,child,done,output:()=>stdout};sessions.push(s);return s;}
async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(fn())return;await delay(25);}throw Error(label);}
const blocked=(h,w)=>query(`select exists(select 1 from pg_stat_activity h,pg_stat_activity w where h.datname=current_database() and w.datname=current_database() and h.application_name=${lit(h.name)} and w.application_name=${lit(w.name)} and h.pid=any(pg_blocking_pids(w.pid)));`)==='t';
const completed=async s=>{const r=await s.done;assert.equal(r.code,0,r.stderr);return r;};
const update=id=>`update public.creator_payout_accounts set last_provider_sync_at=clock_timestamp(),details_submitted=false where id=${lit(id)};`;
const selected=creator=>JSON.parse(query(`select jsonb_build_object('id',payout_account_id,'mode',metadata->>'provider_environment','payable',eligible_for_payouts) from public.creator_payout_eligibility_records where creator_user_id=${lit(creator)};`));
try{
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
 assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
 assert.ok(success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n').includes(container));
 assert.equal(query("select exists(select 1 from supabase_migrations.schema_migrations where version='20261101171600');",'postgres'),'t');
 success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create clone');cloned=true;
 query('create schema vault;create extension supabase_vault with schema vault;');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 success(dump,'read source export');success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore clone');
 const creator=randomUUID(),session=randomUUID(),testId=randomUUID(),platform='acct_nativePlatform',liveAccount='acct_nativeLive';
 query(`insert into auth.users(id,email_confirmed_at,is_sso_user,is_anonymous) values('${creator}',now(),false,false);
 insert into auth.sessions(id,user_id) values('${session}','${creator}');
 insert into public.wave1_legal_document_versions(document_key,version,market,capability,effective_at) values('payout_terms','native-dual-mode','UNITED_STATES','payout',now()-interval '1 day') on conflict do nothing;
 insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
 select '${creator}',public.wave1_sha256('${creator}'),document_key,version,market,'member',capability,'${session}','service_reconciliation' from public.wave1_legal_document_versions where active and market='UNITED_STATES';
 insert into public.wave1_creator_eligibility(creator_user_id,state,account_status,age_18_plus,legal_accepted,creator_role,moderation_state,market,rollout_eligible,platform_capability,provider_eligible,kyc_complete,tax_complete,sanctions_clear,payout_eligible,authority_source,last_operation_key)
 values('${creator}','PENDING_VERIFICATION','ACTIVE',true,true,true,'CLEAR','UNITED_STATES',true,true,false,false,false,false,false,'synthetic_fixture','native');
 insert into public.creator_payout_accounts(id,creator_user_id,provider,provider_environment,provider_account_id) values('${testId}','${creator}','stripe_connect','test','acct_nativeTest');
 insert into private.creator_connect_onboarding_policy(environment,enabled,platform_account_id,configuration_key,country,currency,return_url,refresh_url,controller_pricing_evidence_hash,hosted_onboarding_evidence_hash,verified_at,expires_at)
 values('live',true,'${platform}','stripe_connect_live_express_recipient_controller_v1','US','usd','https://synthetic.invalid/return','https://synthetic.invalid/refresh',repeat('a',64),repeat('b',64),clock_timestamp(),clock_timestamp()+interval '1 day');`);
 // Actual confirmation waits for a callback's account row, then callback must
 // finish without trying to take confirmation's already-held creator mutex.
 const a=start(`begin;select id from public.creator_payout_accounts where id='${testId}' for update;select 'HOLDING';`);
 await until(()=>a.output().includes('HOLDING'),'test row holder missing');
 const b=start(`begin;${service}select public.confirm_creator_connect_live_setup('${creator}','${session}','distinct-live-account-v1');commit;`);b.child.stdin.end();
 await until(()=>blocked(a,b),'confirmation did not reach test row lock');
 a.child.stdin.end(`${update(testId)}commit;\n`);await completed(a);await completed(b);
 const reserved=rpc(`select public.reserve_creator_connect_account_creation('${creator}','${session}')`);
 assert.equal(rpc(`select public.claim_creator_connect_account_creation('${creator}','${session}','${reserved.attemptId}')`).claimed,true);
 const creationFacts={attemptId:reserved.attemptId,creatorId:creator,platformAccountId:platform,accountId:liveAccount,environment:'live',modeVerified:true,configurationKey:'stripe_connect_live_express_recipient_controller_v1',country:'US',currency:'usd',payoutSchedule:'manual',controllerStatus:'match'};
 const bind=`select public.record_creator_connect_created_account('${creator}','${session}','${reserved.attemptId}','${liveAccount}',${lit(JSON.stringify(creationFacts))}::jsonb);`;
 assert.equal(rpc(bind).bound,true);
 const liveId=query(`select id from public.creator_payout_accounts where creator_user_id='${creator}' and provider_environment='live';`);
 query(`insert into private.creator_connect_live_observation_policy(platform_account_id,enabled) values('${platform}',true);`);
 const context=rpc(`select public.get_creator_connect_live_observation_context('${creator}')`);
 const cashout=load('supabase/functions/_shared/creator-cashout-execution.ts');
 const {observeLiveConnectAccount}=load('supabase/functions/_shared/stripe-connect-live-observation.ts',{'./stripe-connect.ts':connect,'./creator-cashout-execution.ts':cashout});
 const v2={id:liveAccount,livemode:true,dashboard:'express',defaults:{responsibilities:{fees_collector:'application',losses_collector:'application'}},configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{status:'active'}}}}}};
 const replies=[{id:platform},v2,account({id:liveAccount,livemode:undefined,country:'US',default_currency:'usd',requirements:{currently_due:[],past_due:[],eventually_due:[],pending_verification:[]},settings:{payouts:{schedule:{interval:'manual'}}}}),v2];
 const facts=await observeLiveConnectAccount(context,'rk_live_synthetic',async()=>Response.json(replies.shift()));
 const c=start(`begin;select id from public.creator_payout_accounts where id='${liveId}' for update;select 'HOLDING';`);
 await until(()=>c.output().includes('HOLDING'),'live row holder missing');
 const d=start(`begin;${service}${bind}commit;`);d.child.stdin.end();await until(()=>blocked(c,d),'binder did not reach live row lock');
 c.child.stdin.end(`${service}select public.record_creator_connect_live_observation(${lit(JSON.stringify(context))}::jsonb,${lit(JSON.stringify(facts))}::jsonb);commit;\n`);
 await completed(c);await completed(d);assert.equal(selected(creator).id,liveId);
 // Both insert/update orders cross statement snapshots. The ON CONFLICT
 // tuple guard, not an earlier existence SELECT, must preserve live priority.
 for(const liveFirst of [true,false]){
  const who=randomUUID(),old=randomUUID(),fresh=randomUUID();
  query(`insert into auth.users(id,email_confirmed_at,is_sso_user,is_anonymous) values('${who}',now(),false,false);insert into public.creator_payout_accounts(id,creator_user_id,provider,provider_environment,provider_account_id) values('${old}','${who}','stripe_connect','test','acct_test${who.replaceAll('-','')}');`);
  const insert=`insert into public.creator_payout_accounts(id,creator_user_id,provider,provider_environment,provider_account_id) values('${fresh}','${who}','stripe_connect','live','acct_live${who.replaceAll('-','')}');`;
  const h=start(`begin;${liveFirst?insert:update(old)}select 'HOLDING';`);await until(()=>h.output().includes('HOLDING'),'projection holder missing');
  const w=start(`begin;${liveFirst?update(old):insert}commit;`);w.child.stdin.end();await until(()=>blocked(h,w),'projection did not block on eligibility tuple');
  h.child.stdin.end('commit;\n');await completed(h);await completed(w);
  assert.deepEqual(selected(who),{id:fresh,mode:'live',payable:false});
 }
 assert.equal(query("select count(*) from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled') and state<>'off';"),'0');
 console.log('PASS native Connect: callback/confirmation and observation/binder complete without lock cycles; both snapshot orders retain distinct live projection. Synthetic only.');
}finally{
 for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end();s.child.kill('SIGTERM');}
 await Promise.allSettled(sessions.map(s=>s.done));
 if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--force',database]),'drop owned clone');
}
