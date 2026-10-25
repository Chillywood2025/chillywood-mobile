import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {prepareBrandGuardCloneRestore,createBrandGuardCloneRestorer} from '../scripts/lib/brand-guard-clone-restore.mjs';

const source=readFileSync('supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql','utf8');
const start='-- BEGIN immutable normalized helper DDL safeguard',end='-- END immutable normalized helper DDL safeguard';
const helpers=source.slice(source.indexOf('create function private.platform_brand_index_jsonb_bytes_v1'),source.indexOf(start));
const guard=source.split(start)[1].split(end)[0];
const name='guard_platform_brand_index_helper_ddl_v1';
const target='brand_dispatch_queue_123_abcdef012345';
const setup='create schema private;create schema extensions;create role anon;create role authenticated;create role service_role;';
const restoreHelperOwners='alter function private.platform_brand_index_jsonb_bytes_v1(jsonb) owner to postgres;alter function private.platform_brand_index_normalize_v1(text) owner to postgres;';
const header=(name,type,schema='extensions',owner='postgres')=>`\n--\n-- Name: ${name}; Type: ${type}; Schema: ${schema}; Owner: ${owner}\n--\n\n`;
const section=(name,type,sql,schema='extensions')=>header(name,type,schema)+sql+'\n\n';
function dump(body){return '--\n-- PostgreSQL database dump\n--\n'+
  section('clone_helpers','TABLE',setup+helpers+restoreHelperOwners,'public')+
  section(`${name}()`,'FUNCTION',`CREATE FUNCTION extensions.${name}() RETURNS event_trigger\n LANGUAGE plpgsql\n SET search_path TO ''\n AS $function$${body}$function$;\nALTER FUNCTION extensions.${name}() OWNER TO postgres;`)+
  section(`FUNCTION ${name}()`,'ACL',`REVOKE ALL ON FUNCTION extensions.${name}() FROM PUBLIC;`)+
  section('platform_brand_index_helper_ddl_v1','EVENT TRIGGER',`CREATE EVENT TRIGGER platform_brand_index_helper_ddl_v1 ON ddl_command_end\n EXECUTE FUNCTION extensions.${name}();\nALTER EVENT TRIGGER platform_brand_index_helper_ddl_v1 OWNER TO postgres;`,'-')+
  section('platform_brand_index_helper_drop_v1','EVENT TRIGGER',`CREATE EVENT TRIGGER platform_brand_index_helper_drop_v1 ON sql_drop\n EXECUTE FUNCTION extensions.${name}();\nALTER EVENT TRIGGER platform_brand_index_helper_drop_v1 OWNER TO postgres;`,'-')+
  section('clone_unrelated_after','TABLE','CREATE TABLE public.clone_unrelated_after(id integer);','public')+
  '\n--\n-- PostgreSQL database dump complete\n--\n';}
let original,originalDump;
test.before(async()=>{original=new PGlite();await original.exec(setup+helpers+guard);
  originalDump=dump((await original.query(`select prosrc from pg_proc where oid='extensions.${name}()'::regprocedure`)).rows[0].prosrc);});
test.after(async()=>{await original?.close();});

test('adapter preserves unrelated dump SQL, binds original owner, and rejects incomplete or extended guard sections',()=>{
  assert.match(originalDump,/expected constant jsonb:=E'/u,'real format(%L) fixture includes canonical escape-string JSON');
  const prepared=prepareBrandGuardCloneRestore(originalDump,target).toString();
  assert.ok(prepared.includes(section('clone_helpers','TABLE',setup+helpers+restoreHelperOwners,'public')));
  assert.ok(prepared.includes(section('clone_unrelated_after','TABLE','CREATE TABLE public.clone_unrelated_after(id integer);','public')));
  assert.ok(prepared.includes(`set role "postgres";\n${guard}\n`));
  const proofStart=prepared.indexOf('do $clone_guard_proof$');
  const proofEnd=prepared.indexOf('end $clone_guard_proof$;')+'end $clone_guard_proof$;'.length;
  assert.ok(proofStart>prepared.indexOf(`set role "postgres";`));
  assert.equal(prepared.indexOf('reset role;'),prepared.indexOf('reset role;',proofEnd),'restore role cannot resume before guard proof');
  for(const candidate of [
    originalDump.replace(header(`FUNCTION ${name}()`,'ACL'),'\n-- missing ACL header\n'),
    originalDump.replace('OWNER TO postgres;', 'OWNER TO authenticated;'),
    originalDump.replace(' ON sql_drop',' ON ddl_command_end'),
    originalDump.replace('ALTER EVENT TRIGGER platform_brand_index_helper_drop_v1 OWNER TO postgres;',
      'ALTER EVENT TRIGGER platform_brand_index_helper_drop_v1 OWNER TO postgres;\nALTER EVENT TRIGGER platform_brand_index_helper_drop_v1 DISABLE;'),
    originalDump.replace('REVOKE ALL ON FUNCTION', 'GRANT ALL ON FUNCTION'),
    originalDump.replace('FROM PUBLIC;','FROM PUBLIC;\nCREATE TABLE public.must_not_be_removed(id integer);'),
    originalDump.replace("message='brand_index_helper_immutable'", "message='changed_guard'"),
    originalDump.replace(header(`${name}()`,'FUNCTION'),header(`${name}()`,'FUNCTION')+header(`${name}()`,'FUNCTION')),
    originalDump.replace('Type: ACL;', 'Type: COMMENT;'),
    originalDump.replace(section('platform_brand_index_helper_drop_v1','EVENT TRIGGER',`CREATE EVENT TRIGGER platform_brand_index_helper_drop_v1 ON sql_drop\n EXECUTE FUNCTION extensions.${name}();\nALTER EVENT TRIGGER platform_brand_index_helper_drop_v1 OWNER TO postgres;`,'-'),''),
  ])assert.throws(()=>prepareBrandGuardCloneRestore(candidate,target));
  for(const database of ['postgres','template0','production','brand_dispatch_queue_123_no_random',`${target};drop database postgres`])
    assert.throws(()=>prepareBrandGuardCloneRestore(originalDump,database));
});

test('ordinary restore retains obsolete OIDs; clone adapter rebinds with owner, ACL and mutation protection intact',async t=>{
  const stale=new PGlite(),clone=new PGlite(),secondClone=new PGlite();
  t.after(async()=>{await stale.close();await clone.close();await secondClone.close();});
  await stale.exec('create schema oid_shift;create table oid_shift.rows(id integer);');
  await assert.rejects(stale.exec(originalDump),error=>error.code==='55000'&&error.message==='brand_index_helper_immutable');
  await clone.exec('create schema oid_shift;create table oid_shift.rows(id integer);create role fixture_restore_admin superuser;set session authorization fixture_restore_admin;');
  const prepared=prepareBrandGuardCloneRestore(originalDump,target).toString();
  await assert.rejects(clone.exec(prepared),/brand_guard_clone_target_mismatch/u);
  assert.equal((await clone.query("select to_regnamespace('private') is null absent")).rows[0].absent,true);
  // PGlite exposes only its fixed postgres database. Qualify the real target
  // rejection above, then adapt just its two database-name comparisons so the
  // unchanged restore/installer/denial SQL can run in this embedded fixture.
  const comparison=`current_database()<>'${target}'`;
  assert.equal(prepared.split(comparison).length,3);
  await clone.exec(prepared.replaceAll(comparison,"current_database()<>'postgres'"));
  assert.equal((await clone.query('select current_user::text role,session_user::text login')).rows[0].role,'fixture_restore_admin','restore role resumes only after owner proof');
  const proofOnly=prepared.slice(prepared.indexOf('do $clone_guard_proof$'),prepared.indexOf('end $clone_guard_proof$;')+'end $clone_guard_proof$;'.length);
  await assert.rejects(clone.exec(proofOnly),/brand_guard_clone_proof_role_mismatch/u,'old reset-before-proof context must be rejected explicitly');
  assert.equal((await clone.query('select count(*)::int n from pg_event_trigger')).rows[0].n,2);
  assert.equal((await clone.query("select to_regclass('public.clone_unrelated_after') is not null present")).rows[0].present,true);
  const sourceOids=(await original.query("select oid from pg_proc where proname in ('platform_brand_index_jsonb_bytes_v1','platform_brand_index_normalize_v1') order by proname")).rows;
  const cloneOids=(await clone.query("select oid from pg_proc where proname in ('platform_brand_index_jsonb_bytes_v1','platform_brand_index_normalize_v1') order by proname")).rows;
  assert.notDeepEqual(sourceOids,cloneOids,'fixture must actually move protected object identities');
  await assert.rejects(clone.exec('alter function private.platform_brand_index_normalize_v1(text) cost 1'),error=>error.code==='55000'&&error.message==='brand_index_helper_immutable');
  const clonedBody=(await clone.query(`select prosrc from pg_proc where oid='extensions.${name}()'::regprocedure`)).rows[0].prosrc;
  const secondTarget='r2_qual_123_abcdef012345_2';
  const secondSql=prepareBrandGuardCloneRestore(dump(clonedBody),secondTarget).toString();
  await secondClone.exec('create schema second_shift;create table second_shift.one(id integer);create table second_shift.two(id integer);');
  await secondClone.exec(secondSql.replaceAll(`current_database()<>'${secondTarget}'`,"current_database()<>'postgres'"));
  await assert.rejects(secondClone.exec('drop function private.platform_brand_index_normalize_v1(text) cascade'),error=>error.code==='55000'&&error.message==='brand_index_helper_immutable');
  assert.equal(dump((await original.query(`select prosrc from pg_proc where oid='extensions.${name}()'::regprocedure`)).rows[0].prosrc),originalDump,'original guard definition and its frozen source catalog remain unchanged');
});

test('restored helper owner, ACL, and body changes cannot be blessed by rebinding',async t=>{
  for(const mutation of [
    'alter function private.platform_brand_index_normalize_v1(text) owner to authenticated;',
    'revoke execute on function private.platform_brand_index_normalize_v1(text) from public;',
    'alter function private.platform_brand_index_normalize_v1(text) stable;',
  ]){
    const db=new PGlite();t.after(()=>db.close());
    const changed=originalDump.replace(helpers+restoreHelperOwners,()=>helpers+restoreHelperOwners+mutation);
    const sql=prepareBrandGuardCloneRestore(changed,target).toString().replaceAll(`current_database()<>'${target}'`,"current_database()<>'postgres'");
    await assert.rejects(db.exec(sql),/brand_guard_clone_source_catalog_mismatch/u);
  }
});

test('source catalog fingerprint is read-only, lazy, and checked after failed restoration',()=>{
  const calls=[];let hash='a'.repeat(32);
  const restorer=createBrandGuardCloneRestorer({container:'supabase_db_fixture',run:(command,args,options)=>{
    calls.push({command,args,options});return{status:0,stdout:JSON.stringify({helpers:2,guard:1,events:2,hash})};
  }});
  restorer.assertSourceUnchanged();assert.equal(calls.length,0);
  restorer.prepare(originalDump,target);
  try{throw Error('synthetic restore failure');}catch{}finally{restorer.assertSourceUnchanged();}
  assert.equal(calls.length,2);
  assert.ok(calls.every(call=>call.command==='docker'&&call.args.at(-1)==='postgres'
    &&call.options.input.startsWith("set default_transaction_read_only=on;set statement_timeout='15s';")));
  hash='b'.repeat(32);assert.throws(()=>restorer.assertSourceUnchanged(),/original Brand helpers, guard and event catalog unchanged/u);
});

test('every full logical clone runner uses the adapter and unconditional source catalog check',()=>{
  const files=readdirSync('scripts').filter(name=>name.startsWith('test-')&&name.endsWith('-concurrency.mjs')
    &&readFileSync('scripts/'+name,'utf8').includes('pg_dump'));
  assert.equal(files.length,17);
  for(const file of files){const code=readFileSync('scripts/'+file,'utf8');
    assert.match(code,/createBrandGuardCloneRestorer\(\{container\}\)/u,file);
    assert.match(code,/cloneGuardRestore\.prepare\(/u,file);
    assert.match(code,/finally \{ cloneGuardRestore\.assertSourceUnchanged\(\); \}/u,file);
  }
  const ledger=readFileSync('scripts/test-r2-qualification-ledger-concurrency.mjs','utf8');
  assert.match(ledger,/prepare\(bytes, allowed\(db\)\)/u);
  assert.match(ledger,/prepare\(dump\('postgres'\), baseline\)/u);
});
