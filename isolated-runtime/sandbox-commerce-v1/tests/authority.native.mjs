#!/usr/bin/env node
// Real source adapter on an isolated PG17.6 minimum-schema fixture, not Supabase.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');
const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const here=path.dirname(fileURLToPath(import.meta.url));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'sandbox-authority-native-'));
const data=path.join(work,'data'),port='55449',db='authority_'+randomUUID().replaceAll('-','');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
const args=database=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U','postgres','-d',database];
const run=(tool,a,input)=>spawnSync(path.join(bin,tool),a,{input,encoding:'utf8',env,timeout:30000,maxBuffer:4*1024*1024});
const invoke=(tool,a,input)=>{const r=run(tool,a,input);assert.equal(r.status,0,`${tool}: ${r.error?.message??''}\n${r.stderr??''}`);return r.stdout.trim();};
const q=sql=>invoke('psql',args(db),sql);
const reset=()=>q('select authority_fixture.reset();');
const user='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
const call=op=>`select sandbox_commerce_v1.assert_authority('${user}','${session}','${op}');`;
const accept=op=>JSON.parse(q('set role sbx_v1_core_owner;'+call(op)));
const reject=(op,pattern,extra='')=>{const r=run('psql',args(db),extra+'set role sbx_v1_core_owner;'+call(op));assert.notEqual(r.status,0);assert.match(r.stderr,pattern);};
const cases=[],children=[];
let started=false,startAttempted=false,report;
const cleanup={sessionsClosed:false,clusterStopped:false,clusterNotRunningVerified:false,directoryRemoved:false};
const begin=Date.now();
try {
 const version=invoke('postgres',['--version']);assert.match(version,/PostgreSQL\) 17\.6/u);
 invoke('initdb',['-D',data,'-U','postgres','--encoding=UTF8','--no-locale','--auth=trust']);
 startAttempted=true;
 invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(work,'server.log'),'-o',`-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c max_prepared_transactions=0 -c autovacuum=off`,'start']);started=true;
 invoke('psql',args('postgres'),`create database ${db};`);
 q(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
 create role sbx_v1_authority_owner nologin noinherit nobypassrls;
 create role sbx_v1_core_owner nologin noinherit nobypassrls;
 create schema sandbox_commerce_v1;revoke all on schema sandbox_commerce_v1 from public;
 grant usage,create on schema sandbox_commerce_v1 to sbx_v1_authority_owner;
 grant usage on schema sandbox_commerce_v1 to sbx_v1_core_owner;
 alter default privileges for role postgres grant execute on functions to authenticated;`);
 q(fs.readFileSync(path.join(here,'premium-authority.fixture.sql'),'utf8'));
 q(fs.readFileSync(path.join(here,'authority.fixture.sql'),'utf8'));
 // Forced RLS exists BEFORE helper creation, matching source install ordering.
 // Exercise actual owner bypass; fresh installer role gets no shared grants.
 q(`do $$declare t regclass;begin foreach t in array array['auth.users'::regclass,'auth.sessions'::regclass,
 'public.account_deletion_requests'::regclass,'public.user_profiles'::regclass,
 'public.wave1_legal_document_versions'::regclass,'public.wave1_legal_acceptances'::regclass,
 'public.wave1_creator_eligibility'::regclass,'public.creator_payout_eligibility_records'::regclass,
 'public.creator_payout_accounts'::regclass,'public.platform_money_kill_switches'::regclass,
 'public.user_entitlements'::regclass,'public.access_grants'::regclass,'public.provider_events'::regclass,
 'public.revenuecat_premium_transaction_authority'::regclass,'public.monetization_products'::regclass,
 'public.revenuecat_terminal_authority_quarantines'::regclass,
 'public.revenuecat_terminal_authority_quarantine_resolutions'::regclass,
 'public.revenuecat_consumable_transaction_intents'::regclass,
 'public.revenuecat_unbound_initial_authority'::regclass,'public.revenuecat_unbound_terminal_authority'::regclass,
 'sandbox_commerce_v1.declarations'::regclass] loop
 execute format('alter table %s enable row level security',t);execute format('alter table %s force row level security',t);end loop;end$$;`);
 q('begin;'+fs.readFileSync(path.join(here,'../premium-authority.sql'),'utf8')+fs.readFileSync(path.join(here,'../authority.sql'),'utf8')+'commit;');
 cases.push('Fresh-role function creation succeeds with own declarations and shared authority FORCE RLS already active; no new table grants.');
 reset();assert.equal(accept('creator').creator,true);assert.equal(accept('buyer').creator,false);assert.equal(accept('delivery').creator,false);
 cases.push('Real adapter admits explicit adult-US creator with complete Premium graph; free buyer/delivery shape separate.');
 q('truncate public.user_entitlements;');accept('buyer');accept('delivery');reject('creator',/sandbox_creator_authority_required/u);
 cases.push('Absent Premium denies creator but free buyer and historical delivery remain allowed.');
 for(const sql of ["delete from auth.users;","update auth.users set deleted_at=clock_timestamp();","update auth.users set email_confirmed_at=null;","update auth.users set raw_app_meta_data='{\"accountDeidentified\":\"true\"}';","update auth.users set banned_until=clock_timestamp()+interval '1 hour';","insert into public.account_deletion_requests values('"+user+"','scheduled');"]){reset();q(sql);reject('buyer',/sandbox_current_account_required/u);}
 cases.push('Missing/deleted/unconfirmed/deidentified/banned/scheduled-deletion accounts fail closed.');
 for(const sql of ['delete from auth.sessions;',"update auth.sessions set user_id='33333333-3333-4333-8333-333333333333';","update auth.sessions set not_after=clock_timestamp()-interval '1 second';"]){reset();q(sql);reject('buyer',/sandbox_current_session_required/u);}
 cases.push('Missing, wrong-account and expired exact Auth session reject.');
 reset();q("update auth.users set is_anonymous=true;");reject('creator',/sandbox_current_account_required/u);
 cases.push('Creator anonymous identity rejects even with other positive source facts.');
 for(const sql of ['truncate public.wave1_legal_document_versions;',"delete from public.wave1_legal_document_versions where document_key='terms';","update public.wave1_legal_acceptances set invalidated_at=clock_timestamp() where document_key='terms';","insert into public.user_profiles values('"+user+"','creator');","update public.wave1_legal_document_versions set version='2' where document_key='terms';"]){reset();q(sql);reject('buyer',/sandbox_current_legal_required/u);}
 cases.push('Empty/incomplete legal configuration, invalidated consent, role drift and changed document version reject.');
 reset();q(`insert into auth.sessions values('33333333-3333-4333-8333-333333333333','${user}',null);`);accept('buyer');reject('creator',/sandbox_current_legal_required/u);
 q(`insert into public.wave1_legal_acceptances select user_id,'33333333-3333-4333-8333-333333333333',document_key,document_version,market,capability,role_key,invalidated_at from public.wave1_legal_acceptances;`);accept('creator');
 cases.push('Creator requires every active session consent; current buyer exact-session rule stays distinct.');
 reset();q("insert into public.wave1_legal_document_versions values('terms','account',true,'UNITED_STATES','future',clock_timestamp()+interval '1 day');");reject('buyer',/sandbox_current_legal_required/u);
 cases.push('Future active document still requires source-compatible acceptance despite current canonical configuration.');
 reset();q('truncate sandbox_commerce_v1.declarations;');reject('creator',/sandbox_creator_authority_required/u);
 q(`insert into public.wave1_creator_eligibility(creator_user_id,state,account_status,age_18_plus,market,moderation_state) values('${user}','INELIGIBLE','UNKNOWN',true,'UNITED_STATES','CLEAR');`);accept('creator');
 cases.push('No invented age/market declaration; valid legacy positive facts can qualify after pure refresh reduction.');
 for(const change of ["declared_18_plus=false","country_code='CA'","region_code='XX'","declaration_version='unknown'","session_id=null"]){reset();q(`insert into public.wave1_creator_eligibility(creator_user_id,age_18_plus,market) values('${user}',true,'UNITED_STATES');update sandbox_commerce_v1.declarations set ${change};`);reject('creator',/sandbox_creator_authority_required/u);}
 cases.push('Explicit negative or malformed own declaration vetoes legacy positive age/market facts.');
 reset();q("update auth.sessions set id='33333333-3333-4333-8333-333333333333';update public.wave1_legal_acceptances set session_generation='33333333-3333-4333-8333-333333333333';");
 reject('creator',/sandbox_current_session_required/u);
 const seller=JSON.parse(q(`set role sbx_v1_core_owner;select sandbox_commerce_v1.assert_authority('${user}',null,'creator_subject');`));
 assert.equal(seller.session_id,'33333333-3333-4333-8333-333333333333');assert.equal(seller.creator,true);
 reject('creator_subject',/sandbox_authority_context_invalid/u);
 cases.push('Independent seller subject chooses current session after authoring-session rotation; exact creator cannot borrow it and declarations are not credentials.');
 for(const field of ["state='SUSPENDED'","state='REVOKED'","account_status='RESTRICTED'","account_status='DELETED'","age_18_plus=false","market='EXCLUDED_TERRITORY'","moderation_state='PENDING'","moderation_state='SUSPENDED'","creator_role=false","platform_capability=false","provider_eligible=false","kyc_complete=false","tax_complete=false","sanctions_clear=false","payout_eligible=false"]){reset();q(`insert into public.wave1_creator_eligibility(creator_user_id)values('${user}');update public.wave1_creator_eligibility set ${field};`);reject('creator',/sandbox_creator_authority_required/u);}
 cases.push('Every source sticky suspension/revocation/account/age/market/moderation/role/compliance false rejects.');
 for(const sql of [`insert into public.creator_payout_eligibility_records values('${user}',true,null,null);`,`insert into public.creator_payout_eligibility_records values('${user}',false,'pending_review',null);`,`insert into public.creator_payout_eligibility_records values('${user}',false,null,'on_hold');`,`insert into public.creator_payout_accounts values('${user}','test','restricted','eligible');`,`insert into public.creator_payout_accounts values('${user}','test',null,'disabled');`]){reset();q(sql);reject('creator',/sandbox_creator_authority_required/u);}
 cases.push('Absent-row fraud/admin/eligibility holds and test payout-account restrictions deny.');
 for(const key of ['live_money_enabled','payouts_enabled','cashout_enabled']){reset();q(`delete from public.platform_money_kill_switches where key='${key}';`);reject('buyer',/sandbox_financial_controls_required/u);accept('delivery');}
 cases.push('Missing financial safety switch closes new initiation while historical delivery remains available.');
 reset();reject('buyer',/sandbox_authority_context_invalid/u,'begin isolation level repeatable read;');reject('buyer',/sandbox_authority_context_invalid/u,'begin isolation level serializable;');
 reject('buyer',/sandbox_authority_transaction_expired/u,"begin;select pg_sleep(5.05);");
 cases.push('Repeatable-read/serializable and over-five-second transactions reject.');
 reset();q("update auth.sessions set not_after=clock_timestamp()+interval '2 seconds';");const lease=accept('buyer');assert.ok(Date.parse(lease.valid_until)-Date.now()<2050);
 cases.push('Returned authority deadline is bounded by actual exact-session expiry.');
 reset();q(`insert into public.wave1_legal_document_versions values('creator_terms','account',true,'UNITED_STATES','future',clock_timestamp()+interval '2 seconds');insert into public.wave1_legal_acceptances values('${user}','${session}','creator_terms','future','UNITED_STATES','account','member',null);`);
 const legalLease=accept('buyer');assert.ok(Date.parse(legalLease.valid_until)-Date.now()<2050);
 cases.push('Future effective legal configuration expires the decision before its time-only change, even when already accepted.');
 reset();const writer=spawn(path.join(bin,'psql'),args(db),{env,stdio:['pipe','pipe','pipe']});children.push(writer);let stdout='';writer.stdout.on('data',s=>stdout+=s.toString());let stderr='';writer.stderr.on('data',s=>stderr+=s.toString());const done=new Promise(resolve=>writer.on('close',code=>resolve(code)));
 writer.stdin.write("begin;set idle_in_transaction_session_timeout='10s';insert into public.account_deletion_requests values('"+user+"','scheduled');select 'HELD';\n");
 const deadline=Date.now()+5000;while(!stdout.includes('HELD')&&Date.now()<deadline)await delay(10);assert.ok(stdout.includes('HELD'),stderr);
 reject('buyer',/could not obtain lock on relation/u);writer.stdin.end('rollback;\n');assert.equal(await done,0);
 cases.push('Actual adapter SHARE NOWAIT rejects pre-existing uncommitted absent restriction insert.');
 assert.equal(q(`select has_function_privilege('authenticated','sandbox_commerce_v1.assert_authority(uuid,uuid,text)','EXECUTE'),has_function_privilege('service_role','sandbox_commerce_v1.assert_authority(uuid,uuid,text)','EXECUTE'),has_function_privilege('sbx_v1_core_owner','sandbox_commerce_v1.legal_current(uuid,uuid,boolean,timestamptz)','EXECUTE');`),'f|f|f');
 assert.equal(q(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sandbox_commerce_v1' and pg_get_userbyid(p.proowner)<>'postgres';`),'0');
 cases.push('Closed helper/API ACL survives transfer to postgres despite broad postgres default privileges; core only API.');
 report={status:'passed',engine:version,scope:'Real source SQL on synthetic local tables/roles; not Supabase Auth/RLS policies, app, provider or deployment proof',caseCount:cases.length,cases,sourceHashes:Object.fromEntries(['authority.sql','premium-authority.sql'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(here,'..',f))).digest('hex')]))};
} finally {
 for(const child of children)if(child.exitCode===null){child.stdin.end('rollback;\n');child.kill('SIGTERM');}
 cleanup.sessionsClosed=children.every(child=>child.exitCode!==null);
 if(startAttempted){let status=run('pg_ctl',['-D',data,'status']);if(status.status===0){invoke('pg_ctl',['-D',data,'-m','immediate','-w','-t','15','stop']);cleanup.clusterStopped=true;status=run('pg_ctl',['-D',data,'status']);}else if(started&&status.status===3)cleanup.clusterStopped=true;
 assert.equal(status.status,3,'Local cluster status uncertain; preserve directory');assert.ok(started,'Failed start may have delayed descendants; preserve directory');cleanup.clusterNotRunningVerified=true;}
 else {cleanup.clusterStopped=true;cleanup.clusterNotRunningVerified=true;}
 assert.ok(cleanup.sessionsClosed);fs.rmSync(work,{recursive:true});cleanup.directoryRemoved=true;
}
assert.ok(report);process.stdout.write(JSON.stringify({...report,durationMs:Date.now()-begin,cleanup},null,2)+'\n');
