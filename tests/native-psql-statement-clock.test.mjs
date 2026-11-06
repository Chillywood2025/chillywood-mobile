import assert from 'node:assert/strict';
import test from 'node:test';
import {splitNativePsqlStatements} from './helpers/native-psql-statements.mjs';
import {nativeSetupDatabase} from './helpers/native-runner-setup-preflight.mjs';

test('psql command splitter retains quoted bodies and rejects malformed or meta-command input',()=>{
 const source="-- comment;\nselect 'a;''b', \"name;\"; /* nested /* ; */ ; */ do $body$ begin perform ';'; end $body$;";
 assert.equal(splitNativePsqlStatements(source).length,2);
 assert.equal(splitNativePsqlStatements("select 'ordinary\\'; commit;").length,2);
 assert.equal(splitNativePsqlStatements("select E'escaped\\\';still-string'; select 2;").length,2);
 assert.equal(splitNativePsqlStatements('select $$first;second$$;select $tag_2$third;fourth$tag_2$;').length,2);
 assert.equal(splitNativePsqlStatements('select 1 as price$usd$; select $1;').length,2,'dollars in unquoted identifiers and parameters are not body delimiters');
 assert.throws(()=>splitNativePsqlStatements("select 'unterminated"),/native_setup_unterminated_sql/u);
 assert.throws(()=>splitNativePsqlStatements('select 1;/* unterminated'),/native_setup_unterminated_sql/u);
 assert.throws(()=>splitNativePsqlStatements('select 1;\\gexec'),/native_setup_psql_meta_command_unsupported/u);
});

test('sequential native transport preserves separate statement clocks and explicit transaction time',{timeout:120000},async()=>{
 const db=nativeSetupDatabase();
 try {
  const result=db.query(`begin;
   create temporary table native_clock_probe(observed_at timestamptz,created_at timestamptz default now());
   select pg_sleep(0.02);
   insert into native_clock_probe(observed_at) values(statement_timestamp());
   select jsonb_build_object('auditPredatesObservation',created_at<observed_at,'defaultIsTransactionStart',created_at=transaction_timestamp()) from native_clock_probe;
   rollback;`);
  assert.deepEqual(JSON.parse(result.split('\n').find(line=>line.startsWith('{'))),{auditPredatesObservation:true,defaultIsTransactionStart:true});
  const committed=db.query(`create temporary table native_clock_commits(stamp timestamptz default now());
   insert into native_clock_commits default values;select pg_sleep(0.02);insert into native_clock_commits default values;
   select max(stamp)>min(stamp) from native_clock_commits;`);
  assert.equal(committed.split('\n').at(-1),'t','commands without BEGIN have distinct autocommit transactions');
  db.query('create table public.native_psql_error_probe(id integer primary key);');
  assert.throws(()=>db.query('insert into public.native_psql_error_probe values(1);select 1/0;insert into public.native_psql_error_probe values(2);'),/division by zero/u);
  assert.equal(db.query('select array_agg(id order by id)::text from public.native_psql_error_probe'),'{1}',
   'psql ON_ERROR_STOP retains earlier autocommit and never executes later command');
  assert.throws(()=>db.query('begin;insert into public.native_psql_error_probe values(3);select 1/0;commit;'),/division by zero/u);
  assert.equal(db.query('select array_agg(id order by id)::text from public.native_psql_error_probe'),'{1}',
   'failed explicit transaction is rolled back when the connection closes');
  assert.throws(()=>db.query("begin;select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false);select 1/0;commit;"),/division by zero/u);
  assert.equal(db.query("select current_setting('request.jwt.claims')"),'{}','failed batch cannot leak claims');
 }finally{await db.close();}
});
