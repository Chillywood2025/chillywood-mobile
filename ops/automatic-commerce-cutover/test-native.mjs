#!/usr/bin/env node
// Real PostgreSQL, generated disposable database, loopback only. No emulator.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
import {bridgeDefinition, restoreDefinition, literal, DRAIN_SQL, sha256} from './bridge.mjs';
import {catalogHashSQL} from './catalog.mjs';

const bin = process.env.CUTOVER_PG_BINDIR;
assert.ok(bin && path.isAbsolute(bin), 'CUTOVER_PG_BINDIR must name a local native PostgreSQL installation');
const port = process.env.CUTOVER_PG_PORT ?? '55439';
assert.match(port, /^\d{4,5}$/u);
assert.equal(process.argv.length, 2, 'No remote target or arbitrary database arguments');
const database = `cutover_semantics_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const psql = path.join(bin, 'psql');
const args = db => ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', db];
const run = (sql, db = database) => spawnSync(psql, args(db), {input: sql, encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024});
const query = (sql, db) => {const r=run(sql,db);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const fail = (sql, pattern) => {const r=run(sql);assert.notEqual(r.status,0,'expected rejection');assert.match(r.stderr,pattern);};
const sessions = [];
const proof = [];
function start(sql) {
 const name = `cutover-${randomUUID()}`, child=spawn(psql,args(database),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
 child.stdin.write(`set application_name=${literal(name)};set statement_timeout='12s';${sql}\n`);
 const s={name,child,done,output:()=>stdout};sessions.push(s);return s;
}
async function until(fn,label){const deadline=Date.now()+7000;while(Date.now()<deadline){if(fn())return;await delay(20);}throw Error(label);}
const blocked=(a,b)=>query(`select exists(select 1 from pg_stat_activity a,pg_stat_activity b where a.application_name=${literal(a.name)} and b.application_name=${literal(b.name)} and a.pid=any(pg_blocking_pids(b.pid)));`)==='t';
const drain = `do $drain$ begin ${DRAIN_SQL} end $drain$;`;
const definition = signature => JSON.parse(query(`select to_json(pg_get_functiondef(${literal(signature)}::regprocedure));`));
const pause = async () => {const s=start("begin;select pg_advisory_xact_lock(683,91);select 'READY';");await until(()=>s.output().includes('READY'),'barrier not ready');return s;};
const release = async s => {s.child.stdin.end('rollback;\n');assert.equal((await s.done).code,0);};
const catalog = () => query(`select jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),p.proowner::regrole::text,p.proacl,p.provolatile,p.proisstrict,p.prosecdef,p.proparallel,p.proconfig,p.prolang,p.prosrc) order by p.proname)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='fixture';`);

let created=false;
try {
 const version=query("select version();",'postgres');assert.match(version,/PostgreSQL 1[7-9]\./u);
 query(`create database ${database};`,'postgres');created=true;
 query(`create schema fixture;create table fixture.effects(value text);
 create function fixture.plroot() returns text language plpgsql volatile security definer set search_path='' as $f$
 declare v text:=(select 'initializer');
 begin insert into fixture.effects values('old'); return v; end;$f$;
 create function fixture.sqlroot() returns text language sql stable security invoker set search_path='' as $f$ select 'original'; $f$;
 create function fixture.immutableroot() returns integer language sql immutable strict parallel safe as $f$ select 7; $f$;
 create function fixture.compositeroot() returns fixture.effects language sql stable as $f$ select row('composite')::fixture.effects; $f$;
 create function fixture.setroot() returns setof text language sql stable as $f$ select value from fixture.effects; $f$;
 revoke all on function fixture.plroot() from public;`);
 const originals = ['plroot','sqlroot','immutableroot','compositeroot','setroot'].map(name=>definition(`fixture.${name}()`));
 const before=catalog();
 for(const source of originals){const bridge=bridgeDefinition(source);assert.equal(restoreDefinition(bridge),source);query(bridge);}
 for(const name of ['plroot','sqlroot','immutableroot','compositeroot','setroot'])fail(`select fixture.${name}();`,/automatic_commerce_cutover_retry|division by zero/u);
 assert.equal(query('select count(*) from fixture.effects;'),'0','no domain or DECLARE effects');
 for(const source of originals)query(source);
 assert.equal(catalog(),before,'byte-exact definition and metadata restoration');
 proof.push('PL/pgSQL, SQL/STABLE, immutable, composite and set-returning bridges fail closed; attributes/ACL/owner restore exactly');

 // Prepared/inlined SQL plans must not retain old behavior after replacement.
 const cached=start("prepare q as select fixture.immutableroot();execute q;select 'PREPARED';");
 await until(()=>cached.output().includes('PREPARED'),'prepared plan not ready');
 query(bridgeDefinition(originals[2]));cached.child.stdin.end('execute q;\n');
 const cachedResult=await cached.done;assert.notEqual(cachedResult.code,0);assert.match(cachedResult.stderr,/division by zero/u);query(originals[2]);
 proof.push('cached prepared and inlined SQL plan is invalidated by committed bridge');

 // A prebridge old frame blocked before its first domain action survives CREATE
 // OR REPLACE. This is the counterexample to table-lock-only deployment.
 query(`create function fixture.old_frame() returns void language plpgsql as $f$
 begin perform pg_advisory_xact_lock(683,91); insert into fixture.effects values('old_frame');end;$f$;`);
 const old=definition('fixture.old_frame()'),holder=await pause(),running=start('select fixture.old_frame();');running.child.stdin.end();
 await until(()=>blocked(holder,running),'old frame not blocked');query(bridgeDefinition(old));
 fail(drain,/cutover_transactions_not_drained/u);
 await release(holder);assert.equal((await running.done).code,0);
 assert.equal(query("select count(*) from fixture.effects where value='old_frame';"),'1');query(drain);
 proof.push('old prebridge frame remains executable, and positive virtualtransaction drain rejects it until completed');

 // A newly loaded bridge frame can pause BEFORE its raising instruction, resume
 // after final replacement, and must still only raise. The test-only barrier is
 // injected before the unconditional bridge, not used in deployment source.
 const bridge=bridgeDefinition(old),instrumented=bridge.replace('begin\n raise exception', 'begin\n perform pg_advisory_xact_lock(683,91);\n raise exception');
 query(instrumented);const lateHolder=await pause(),late=start('select fixture.old_frame();');late.child.stdin.end();
 await until(()=>blocked(lateHolder,late),'bridge frame not blocked');query(old);await release(lateHolder);
 const lateResult=await late.done;assert.notEqual(lateResult.code,0);assert.match(lateResult.stderr,/automatic_commerce_cutover_retry/u);
 assert.equal(query("select count(*) from fixture.effects where value='old_frame';"),'1');
 proof.push('bridge frame paused before its first instruction cannot resume old domain logic after final commit');

 // READ COMMITTED, idle transactions and transactions without permanent XIDs.
 const idle=start("begin;select 'IDLE';");await until(()=>idle.output().includes('IDLE'),'idle transaction missing');
 fail(drain,/cutover_transactions_not_drained/u);await release(idle);query(drain);
 proof.push('idle/read-only virtualtransactions without permanent XIDs block cutover');

 // Direct DML gets a statement-level fail-closed guard. A transaction holding a
 // relation lock can only cause a bounded rollback, never a partial migration.
 query(`create function fixture.guard() returns trigger language plpgsql as $f$begin raise exception 'automatic_commerce_cutover_retry' using errcode='55P03';end;$f$;
 create trigger aaa_cutover before insert or update or delete on fixture.effects for each statement execute function fixture.guard();`);
 fail("insert into fixture.effects values('forbidden');",/automatic_commerce_cutover_retry/u);
 const lock=start("begin;lock table fixture.effects in access share mode;select 'LOCKED';");await until(()=>lock.output().includes('LOCKED'),'relation holder missing');
 fail("begin;set local lock_timeout='150ms';lock table fixture.effects in access exclusive mode;drop trigger aaa_cutover on fixture.effects;commit;",/lock timeout/u);
 assert.equal(query("select count(*) from pg_trigger where tgname='aaa_cutover';"),'1');await release(lock);
 query("begin;lock table fixture.effects in access exclusive mode;drop trigger aaa_cutover on fixture.effects;commit;");
 proof.push('direct authority DML rejects and relation contention rolls back bounded cutover, preserving bridge');

 // A direct Auth-like DML arrival can wait before opening its authority table.
 // It has no old function frame to preserve. After commit it must see the final
 // statement trigger, even when its transaction already owns an unrelated row.
 query(`create table fixture.authority(id integer primary key,value integer);insert into fixture.authority values(1,0);
 create table fixture.unrelated(id integer primary key);insert into fixture.unrelated values(1);
 create trigger aaa_cutover before insert or update or delete on fixture.authority for each statement execute function fixture.guard();
 create function fixture.final_gate() returns trigger language plpgsql as $f$begin perform pg_advisory_xact_lock(683,92);insert into fixture.effects values('final_statement_gate');return null;end;$f$;`);
 const finalizing=start(`begin;${drain}lock table fixture.authority in access exclusive mode;select 'FINAL_LOCK';`);
 await until(()=>finalizing.output().includes('FINAL_LOCK'),'final relation gate not ready');
 const auth=start('begin;select * from fixture.unrelated where id=1 for update;update fixture.authority set value=1 where id=1;commit;');auth.child.stdin.end();
 await until(()=>blocked(finalizing,auth),'Auth-like statement did not queue before relation open');
 finalizing.child.stdin.end('drop trigger aaa_cutover on fixture.authority;create trigger aaa_final before insert or update or delete on fixture.authority for each statement execute function fixture.final_gate();commit;\n');
 assert.equal((await finalizing.done).code,0);assert.equal((await auth.done).code,0);
 assert.equal(query("select count(*) from fixture.effects where value='final_statement_gate';"),'1');
 assert.equal(query('select value from fixture.authority where id=1;'),'1');
 proof.push('Auth-like direct DML queued after census sees the final statement gate after commit, not a stale bridge trigger');

 // Unchanged ancestors are deliberately included in the conservative closure.
 // Their saved variables/earlier-lock bodies must not begin during the bridge.
 query(`create function fixture.outer_caller() returns void language plpgsql as $f$declare cached text:='pre_gate';begin
 perform 1 from fixture.unrelated where id=1 for update;
 perform fixture.old_frame();insert into fixture.effects values(cached);end;$f$;`);
 const outer=definition('fixture.outer_caller()');query(bridgeDefinition(outer));
 fail('select fixture.outer_caller();',/automatic_commerce_cutover_retry/u);
 query(outer);assert.equal(query("select count(*) from fixture.effects where value='pre_gate';"),'0');
 proof.push('unchanged lock-taking outer caller is bridged before DECLARE, earlier locks and changed callees');
 query('create sequence public.cutover_integer_fixture as bigint maxvalue 9223372036854775807;');
 const exact='[["sequence:public.cutover_integer_fixture", ["sequence", "public.cutover_integer_fixture", "bigint", 1, 1, 9223372036854775807, 1, 1, false]]]';
 assert.equal(query(`set search_path=pg_catalog,public;select ${catalogHashSQL({include:['sequence:public.cutover_integer_fixture']})};`),sha256(exact));
 proof.push('catalog digest preserves 64-bit sequence limits without JavaScript numeric round-tripping');
 console.log(JSON.stringify({schema:1,status:'passed',native:true,version,tests:proof,bridgeSourceSha256:sha256(await import('node:fs').then(fs=>fs.readFileSync(new URL('./bridge.mjs',import.meta.url))))},null,2));
} finally {
 for(const s of sessions){if(!s.child.stdin.destroyed)s.child.stdin.end('rollback;\n');}
 await Promise.allSettled(sessions.map(s=>s.done));
 if(created)query(`drop database ${database};`,'postgres');
}
