#!/usr/bin/env node
// PostgreSQL 17.6 timer controls plus exact source guard. No production connection.
// Usage: node availability.native.mjs --local-bin /absolute/pgsql/bin
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');
const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const corePath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../core.sql');
const coreSource=fs.readFileSync(corePath,'utf8');
const guardSource=coreSource.match(/create function sandbox_commerce_v1\.arm_transaction_timeout\(\)[\s\S]*?end; \$\$;/u)?.[0];
assert.ok(guardSource,'Exact source guard must be present');
const transitionSource=coreSource.match(/create function sandbox_commerce_v1\.transition\(p_expected text,p_next text\)[\s\S]*?end; \$\$;/u)?.[0];
const lifecycleSource=coreSource.match(/create table sandbox_commerce_v1\.lifecycle \([\s\S]*?\n\);/u)?.[0];
assert.ok(transitionSource);assert.ok(lifecycleSource);
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sandbox-timeout-contract-'));
const data=path.join(directory,'data'),port='55453';
const args=(user='fixture_admin')=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U',user,'-d','postgres'];
const run=(tool,a,input)=>spawnSync(path.join(bin,tool),a,{env,input,encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
const invoke=(tool,a,input)=>{const r=run(tool,a,input);assert.equal(r.status,0,`${tool}: ${r.error?.message??''}\n${r.stderr??''}`);return r.stdout.trim();};
const q=sql=>invoke('psql',args(),sql);
const command=sql=>run('psql',args('executor'),'\\set VERBOSITY verbose\n'+sql);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const children=[];
function session(sql,user='executor'){
 const child=spawn(path.join(bin,'psql'),args(user),{env,stdio:['pipe','pipe','pipe']});children.push(child);
 let stdout='',stderr='',readyResolve,readyReject;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const closed=new Promise(resolve=>child.on('close',(code,signal)=>{readyReject(new Error(stderr||`closed ${code} ${signal}`));resolve({code,signal,stdout,stderr});}));
 child.stdin.on('error',()=>{});
 child.stdout.on('data',b=>{stdout+=b.toString();if(stdout.includes('fixture_ready'))readyResolve();});
 child.stderr.on('data',b=>{stderr+=b.toString();});
 child.stdin.write('\\set VERBOSITY verbose\n'+sql+'\n\\echo fixture_ready\n');
 return {child,ready,closed,end:sql=>child.stdin.end(sql+'\n')};
}
function assertWriterFree(){assert.equal(q('begin;lock table timer_fixture.authority in row exclusive mode nowait;rollback;'),'');}
function assertWriterBlocked(){const r=run('psql',args(),'begin;lock table timer_fixture.authority in row exclusive mode nowait;rollback;');assert.notEqual(r.status,0);assert.match(r.stderr,/could not obtain lock/u);}
const fixture=`
create role executor login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema timer_fixture;
revoke all on schema timer_fixture from public;
create table timer_fixture.authority(id integer primary key);
create table timer_fixture.pending(id integer primary key);
create function timer_fixture.statement_attribute() returns text language plpgsql security definer
set search_path='' set statement_timeout='100ms' as $$begin
 lock table timer_fixture.authority in share mode nowait;
 perform pg_sleep(0.35); return 'statement_attribute_returned'; end;$$;
create function timer_fixture.transaction_attribute() returns text language plpgsql security definer
set search_path='' set transaction_timeout='150ms' as $$begin
 lock table timer_fixture.authority in share mode nowait;
 return current_setting('transaction_timeout'); end;$$;
create function timer_fixture.dynamic_timer(p_ms integer) returns text language plpgsql security definer
set search_path='' as $$begin
 perform set_config('transaction_timeout',p_ms::text,true);
 lock table timer_fixture.authority in share mode nowait;
 return current_setting('transaction_timeout'); end;$$;
-- Synthetic candidate, not product source: re-arm against ONE transaction
-- start deadline, so repeat admissions cannot extend the maximum deadline.
create function timer_fixture.absolute_timer(p_budget_ms integer) returns text language plpgsql security definer
set search_path='' as $$declare remaining_ms integer; begin
 remaining_ms:=floor(extract(epoch from
   (transaction_timestamp()+p_budget_ms*interval '1 millisecond'-clock_timestamp()))*1000);
 if remaining_ms<1 then raise exception 'fixture_transaction_expired'; end if;
 perform set_config('transaction_timeout','0',true);
 perform set_config('transaction_timeout',remaining_ms::text,true);
 lock table timer_fixture.authority in share mode nowait;
 return current_setting('transaction_timeout'); end;$$;
create function timer_fixture.nested_absolute(p_budget_ms integer) returns text language plpgsql security definer
set search_path='' set row_security=off as $$begin
 return timer_fixture.absolute_timer(p_budget_ms); end;$$;
create function timer_fixture.hold_then_work(p_wait float8,p_insert integer default null) returns text language plpgsql security definer
set search_path='' as $$begin
 lock table timer_fixture.authority in share mode nowait;
 if p_insert is not null then insert into timer_fixture.pending values(p_insert); end if;
 perform pg_sleep(p_wait);return 'done'; end;$$;
-- One-shot public-entry candidate: refuse unknown positive timer context.
-- Product integration would use a constant budget, not user input or a marker.
create function timer_fixture.arm_zero_only(p_budget_ms integer) returns text language plpgsql security definer
set search_path='' as $$declare remaining_ms integer; begin
 if current_setting('transaction_timeout')::interval<>interval '0' then
  raise exception 'fixture_unknown_timer_context' using errcode='42501'; end if;
 remaining_ms:=floor(extract(epoch from
   (transaction_timestamp()+p_budget_ms*interval '1 millisecond'-clock_timestamp()))*1000);
 if remaining_ms<1 then raise exception 'fixture_transaction_expired' using errcode='42501'; end if;
 perform set_config('transaction_timeout',remaining_ms::text,true);
 return current_setting('transaction_timeout'); end;$$;
create function timer_fixture.rpc_zero(p_budget_ms integer) returns text language plpgsql security definer
set search_path='' set row_security=off as $$begin
 perform timer_fixture.arm_zero_only(p_budget_ms);
 lock table timer_fixture.authority in share mode nowait;
 return current_setting('transaction_timeout'); end;$$;
create function timer_fixture.rpc_catches_cancel() returns text language plpgsql security definer
set search_path='' as $$begin
 perform timer_fixture.arm_zero_only(500);
 lock table timer_fixture.authority in share mode nowait;
 begin
  insert into timer_fixture.pending values(42);
  perform pg_sleep(1);
 exception when query_canceled then return 'cancel_caught'; end;
 return 'unexpected'; end;$$;
-- Negative control: an OUTER function SET for the same parameter defeats
-- persistence. No real RPC/caller wrapper may have this SET clause.
create function timer_fixture.unsafe_outer_context() returns text language plpgsql security definer
set search_path='' set transaction_timeout=0 as $$begin
 return timer_fixture.rpc_zero(200); end;$$;
revoke all on all functions in schema timer_fixture from public;
grant usage on schema timer_fixture to executor;
grant execute on all functions in schema timer_fixture to executor;
-- Fixture-only blocker relation; executor has no authority-table privileges.
grant insert on timer_fixture.pending to executor;
`;
const cases=[];let startAttempted=false,started=false,report;
const cleanup={clusterStopped:false,clusterNotRunningVerified:false,directoryRemoved:false};
const begun=Date.now();
try{
 const version=invoke('postgres',['--version']);assert.match(version,/PostgreSQL\) 17\.6/u);
 invoke('initdb',['-D',data,'-U','fixture_admin','--encoding=UTF8','--no-locale','--auth=trust']);
 startAttempted=true;
 invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(directory,'server.log'),'-o',`-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c autovacuum=off`,'start']);started=true;
 q(fixture);
 q('create schema sandbox_commerce_v1;'+guardSource+`
 revoke all on function sandbox_commerce_v1.arm_transaction_timeout() from public;
 create function timer_fixture.actual_source_rpc() returns text language plpgsql security definer
 set search_path='' as $$begin
  perform sandbox_commerce_v1.arm_transaction_timeout();
  lock table timer_fixture.authority in share mode nowait;
  return current_setting('transaction_timeout');end;$$;
 revoke all on function timer_fixture.actual_source_rpc() from public;
 grant execute on function timer_fixture.actual_source_rpc() to executor;`);
 q(lifecycleSource+"insert into sandbox_commerce_v1.lifecycle(singleton) values(true);"+transitionSource+`
 create role fixture_operator login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
 revoke all on function sandbox_commerce_v1.transition(text,text) from public;
 grant usage on schema sandbox_commerce_v1 to fixture_operator;
 grant execute on function sandbox_commerce_v1.transition(text,text) to fixture_operator;`);
 let r=command('begin;select timer_fixture.statement_attribute();rollback;');
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/statement_attribute_returned/u);
 cases.push({name:'Function SET statement_timeout does not arm the current already-started statement',result:'350ms work completed under function-local 100ms setting'});

 r=command("begin;select timer_fixture.transaction_attribute();select current_setting('transaction_timeout');select pg_sleep(0.35);rollback;");
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/150ms\n0/u);
 cases.push({name:'Function SET transaction_timeout is restored to zero at return',result:'Outer transaction survived another 350ms while retaining its SHARE lock'});

 r=command("begin;select timer_fixture.dynamic_timer(150);select current_setting('transaction_timeout');select pg_sleep(0.4);commit;");
 assert.notEqual(r.status,0);assert.match(r.stderr,/25P04.*transaction timeout/u);assert.match(r.stdout,/150ms\n150ms/u);assertWriterFree();
 cases.push({name:'Dynamic SET LOCAL transaction timer survives a definer with search_path SET and ends post-return work',sqlstate:'25P04'});

 r=command("begin;set local transaction_timeout='1000ms';select timer_fixture.dynamic_timer(150);select pg_sleep(0.35);select 'survived_smaller_setting';rollback;");
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/survived_smaller_setting/u);
 cases.push({name:'Assigning a smaller positive value does not shorten an already-active transaction timer',result:'350ms work survived advertised 150ms setting under prior 1000ms timer'});

 r=command("begin;set local transaction_timeout='1000ms';select timer_fixture.nested_absolute(300);select pg_sleep(0.6);commit;");
 assert.notEqual(r.status,0);assert.match(r.stderr,/25P04.*transaction timeout/u);assertWriterFree();
 cases.push({name:'Disable/re-arm to a transaction-start deadline replaces an already-active longer timer through nested definer returns',sqlstate:'25P04'});

 const repeatStart=Date.now();
 r=command('begin;select timer_fixture.nested_absolute(600);select pg_sleep(0.3);select timer_fixture.nested_absolute(600);select pg_sleep(0.45);commit;');
 const repeatElapsed=Date.now()-repeatStart;
 assert.notEqual(r.status,0);assert.match(r.stderr,/25P04.*transaction timeout/u);assertWriterFree();
 cases.push({name:'Repeated admissions re-arm only the remaining original transaction budget',sqlstate:'25P04',elapsedMs:repeatElapsed});

 const idle=session('begin;select timer_fixture.nested_absolute(500);');await idle.ready;assertWriterBlocked();
 await sleep(750);assertWriterFree();idle.end('select 1;');const idleResult=await idle.closed;
 assert.notEqual(idleResult.code,0);assert.match(idleResult.stderr,/25P04.*transaction timeout/u);
 cases.push({name:'Dynamic absolute transaction timer remains active while client is idle after RPC return and releases SHARE locks',sqlstate:'25P04'});

 r=command("begin;set local transaction_timeout='1000ms';set local statement_timeout='150ms';set local lock_timeout='75ms';set local idle_in_transaction_session_timeout='200ms';select timer_fixture.hold_then_work(0.5);commit;");
 assert.notEqual(r.status,0);assert.match(r.stderr,/57014.*statement timeout/u);assertWriterFree();
 cases.push({name:'Executor SET LOCAL timeouts before the RPC cancel long RPC execution',sqlstate:'57014'});

 const executorIdle=session("begin;set local transaction_timeout='1000ms';set local statement_timeout='150ms';set local lock_timeout='75ms';set local idle_in_transaction_session_timeout='200ms';select timer_fixture.hold_then_work(0);");
 await executorIdle.ready;assertWriterBlocked();await sleep(450);assertWriterFree();executorIdle.end('select 1;');const executorIdleResult=await executorIdle.closed;
 assert.notEqual(executorIdleResult.code,0);assert.match(executorIdleResult.stderr,/25P03.*idle-in-transaction timeout/u);
 cases.push({name:'Executor idle-in-transaction timeout releases post-RPC locks before the transaction-wide cap',sqlstate:'25P03'});

 const blocker=session('begin;insert into timer_fixture.pending values(7);');await blocker.ready;
 r=command("begin;set local transaction_timeout='1000ms';set local statement_timeout='500ms';set local lock_timeout='100ms';set local idle_in_transaction_session_timeout='200ms';select timer_fixture.hold_then_work(0,7);commit;");
 assert.notEqual(r.status,0);assert.match(r.stderr,/55P03.*lock timeout/u);assertWriterFree();blocker.end('rollback;');assert.equal((await blocker.closed).code,0);
 cases.push({name:'Executor lock_timeout bounds an implicit unique-key wait after acquiring the authority SHARE fence',sqlstate:'55P03'});

 r=command("begin;set local transaction_timeout='150ms';set local transaction_timeout='1000ms';do $$begin perform timer_fixture.arm_zero_only(500);exception when insufficient_privilege then raise notice 'unknown_timer_rejected';end$$;select pg_sleep(0.4);commit;");
 assert.notEqual(r.status,0);assert.match(r.stderr,/unknown_timer_rejected/u);assert.match(r.stderr,/25P04.*transaction timeout/u);assertWriterFree();
 cases.push({name:'Zero-only guard rejects positive context without weakening a hidden stricter active alarm',sqlstate:'25P04'});

 r=command("begin;select timer_fixture.rpc_zero(250);do $$begin perform timer_fixture.rpc_zero(250);exception when insufficient_privilege then raise notice 'second_entry_rejected';end$$;select pg_sleep(0.5);commit;");
 assert.notEqual(r.status,0);assert.match(r.stderr,/second_entry_rejected/u);assert.match(r.stderr,/25P04.*transaction timeout/u);assertWriterFree();
 cases.push({name:'Zero-only RPC cannot re-arm a second admission in the same transaction',sqlstate:'25P04'});

 const cancelled=session("begin;set local statement_timeout='100ms';select timer_fixture.rpc_catches_cancel();");
 await cancelled.ready;assertWriterBlocked();assert.equal(q('select count(*) from timer_fixture.pending where id=42;'),'0');
 await sleep(650);assertWriterFree();cancelled.end('select 1;');const cancelledResult=await cancelled.closed;
 assert.notEqual(cancelledResult.code,0);assert.match(cancelledResult.stdout,/cancel_caught/u);assert.match(cancelledResult.stderr,/25P04.*transaction timeout/u);
 cases.push({name:'Guard outside an exception subtransaction survives caught query cancellation; rolled-back inner work is absent and remaining outer locks time out',sqlstate:'25P04'});

 const rolledBack=session("begin;savepoint before_rpc;select timer_fixture.rpc_zero(250);rollback to savepoint before_rpc;select current_setting('transaction_timeout');");
 await rolledBack.ready;assertWriterFree();await sleep(400);rolledBack.end("select 'still_alive';rollback;");const rolledBackResult=await rolledBack.closed;
 assert.equal(rolledBackResult.code,0,rolledBackResult.stderr);assert.match(rolledBackResult.stdout,/\n0\nfixture_ready/u);assert.match(rolledBackResult.stdout,/still_alive/u);
 cases.push({name:'Rolling back the whole guard subtransaction restores zero together with releasing its authority locks'});

 r=command("begin;select timer_fixture.rpc_zero(250);commit;select current_setting('transaction_timeout');begin;select pg_sleep(0.4);select 'pooled_followup_survived';commit;");
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/\n0\n/u);assert.match(r.stdout,/pooled_followup_survived/u);assertWriterFree();
 cases.push({name:'Successful commit restores the connection setting; a pooled follow-up transaction inherits no timer'});

 const finalBlocker=session('begin;insert into timer_fixture.pending values(8);');await finalBlocker.ready;
 r=command('begin;select timer_fixture.rpc_zero(250);select timer_fixture.hold_then_work(0,8);commit;');
 assert.notEqual(r.status,0);assert.match(r.stderr,/25P04.*transaction timeout/u);assertWriterFree();finalBlocker.end('rollback;');assert.equal((await finalBlocker.closed).code,0);
 cases.push({name:'Zero-only RPC timer bounds an implicit unique-key wait in later active work and releases its earlier SHARE fence',sqlstate:'25P04'});

 r=command("begin;select timer_fixture.unsafe_outer_context();select current_setting('transaction_timeout');select pg_sleep(0.4);select 'outer_context_defeated_guard';rollback;");
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/\n0\n/u);assert.match(r.stdout,/outer_context_defeated_guard/u);
 cases.push({name:'Negative control: outer function SET transaction_timeout restores the old value after the guard',result:'Reject this invocation design; own wrappers must not SET the same parameter'});

 r=command("begin;set local transaction_timeout='1000ms';select timer_fixture.actual_source_rpc();commit;");
 assert.notEqual(r.status,0);assert.match(r.stderr,/42501.*sandbox_timeout_context_invalid/u);assertWriterFree();
 cases.push({name:'Exact current source guard rejects pre-existing positive timer context',sqlstate:'42501'});

 const agedStart=Date.now();
 r=command('begin;select pg_sleep(4.55);select timer_fixture.actual_source_rpc();select pg_sleep(0.8);commit;');
 assert.notEqual(r.status,0);assert.match(r.stderr,/25P04.*transaction timeout/u);assertWriterFree();
 cases.push({name:'Exact current source guard uses remaining transaction-start budget for an already-aged transaction',sqlstate:'25P04',elapsedMs:Date.now()-agedStart});

 r=command("begin;select timer_fixture.actual_source_rpc();commit;select current_setting('transaction_timeout');");
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/\n0\n/u);assertWriterFree();
 cases.push({name:'Exact current source guard is transaction-local and leaves a committed connection at zero'});

 const operator=session("begin;select sandbox_commerce_v1.transition('disabled','active');",'fixture_operator');await operator.ready;
 const busyLifecycle=run('psql',args(),'begin;select state from sandbox_commerce_v1.lifecycle where singleton for share nowait;rollback;');
 assert.notEqual(busyLifecycle.status,0);assert.match(busyLifecycle.stderr,/could not obtain lock/u);
 await sleep(5250);
 assert.equal(q('begin;select state from sandbox_commerce_v1.lifecycle where singleton for share nowait;rollback;'),'disabled');
 operator.end('select 1;');const operatorResult=await operator.closed;
 assert.notEqual(operatorResult.code,0);assert.match(operatorResult.stderr,/25P04.*transaction timeout/u);
 cases.push({name:'Exact source operator transition bounds post-return lifecycle writer lock; idle timeout rolls back its uncommitted state change',sqlstate:'25P04'});
 assert.equal(fs.readFileSync(corePath,'utf8'),coreSource,'Core source changed during test');
 report={status:'passed',engine:version,scope:'Synthetic timer/lock controls plus exact current source arm helper; not full product, PostgREST, pooler, hosted database or load qualification',caseCount:cases.length,cases,
 assumptions:['Official PostgreSQL 17.6 local binaries supplied explicitly','Synthetic fixture_admin definers with narrow NOSUPERUSER executor/operator','Exact local arm helper, transition and lifecycle table are installed from source; no private target metadata is read','Scheduling and interrupt processing are ordinary local OS behavior; timeouts are not hard real-time guarantees'],
 sourceHashes:{'core.sql':createHash('sha256').update(coreSource).digest('hex')},guardHash:createHash('sha256').update(guardSource).digest('hex'),
 fixtureHash:createHash('sha256').update(fixture).digest('hex'),harnessHash:createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex')};
}finally{
 for(const child of children){if(child.exitCode===null)child.stdin.end('rollback;\n');}
 if(startAttempted){let s=run('pg_ctl',['-D',data,'status']);if(s.status===0){invoke('pg_ctl',['-D',data,'-m','immediate','-w','-t','15','stop']);cleanup.clusterStopped=true;s=run('pg_ctl',['-D',data,'status']);}else if(started&&s.status===3)cleanup.clusterStopped=true;assert.equal(s.status,3,'Local cluster status uncertain; preserve data');assert.ok(started,'Uncertain start; preserve data');cleanup.clusterNotRunningVerified=true;}else{cleanup.clusterStopped=true;cleanup.clusterNotRunningVerified=true;}
 fs.rmSync(directory,{recursive:true});cleanup.directoryRemoved=true;
}
assert.ok(report);process.stdout.write(JSON.stringify({...report,durationMs:Date.now()-begun,cleanup},null,2)+'\n');
