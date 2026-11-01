import {readFileSync} from 'node:fs';
import {callRetryFixture, literal} from './chat-call-retry-concurrency-fixture.mjs';

export const chatActivityMigration = '20261031205522_chat_meaningful_activity_and_call_reads.sql';
export const chatActivityPredecessor = '20261031204321';
const migration = readFileSync(new URL(`../../supabase/migrations/${chatActivityMigration}`, import.meta.url), 'utf8');
const fixtures = [71, 72, 73].map(callRetryFixture);
const empty = callRetryFixture(74);
const assertSQL = (expression, label) => `do $assert$ begin
  if (${expression}) is not true then raise exception ${literal(label)}; end if;
end $assert$;`;
const snapshot = (table, omitted = []) => {
  const row = `to_jsonb(t)${omitted.map(c => `-${literal(c)}`).join('')}`;
  return `(select coalesce(jsonb_agg(${row} order by (${row})::text),'[]'::jsonb) from ${table} t)`;
};
const tables = ['public.chat_thread_members', 'public.chat_threads', 'public.chat_messages', 'public.chat_call_events', 'auth.users', 'public.account_deletion_requests', 'private.platform_brand_reference_indexes_v1'];
const indexCatalog = `(select jsonb_agg(jsonb_build_array(i.indexrelid,c.relowner,pg_get_indexdef(i.indexrelid),
  pg_get_expr(i.indexprs,i.indrelid),i.indisvalid,i.indisready,i.indislive,i.indisunique,
  i.indclass::text,i.indcollation::text) order by i.indexrelid)
  from pg_index i join pg_class c on c.oid=i.indexrelid
  where i.indrelid in ('public.chat_thread_members'::regclass,'public.chat_threads'::regclass))`;
const existingTriggers = `(select jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) order by tgname)
  from pg_trigger where tgrelid in ('public.chat_thread_members'::regclass,'public.chat_threads'::regclass) and not tgisinternal)`;
const restrictionFunctions = `(select jsonb_agg(jsonb_build_array(oid::regprocedure::text,pg_get_functiondef(oid),proacl) order by oid)
  from pg_proc where oid in ('public.is_account_access_restricted(text)'::regprocedure,
    'public.assert_account_private_feature_allowed(text,text)'::regprocedure,
    'public.enforce_chat_thread_members_account_access_guard()'::regprocedure))`;
const accessCatalog = `(select jsonb_agg(jsonb_build_object('table',c.relname,'owner',c.relowner,
  'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
  'columns',(select jsonb_agg(jsonb_build_array(a.attname,a.attacl) order by a.attname) from pg_attribute a
    where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      and a.attname not in ('last_call_read_at','activity_admission_watermark')),
  'policies',(select jsonb_agg(jsonb_build_array(p.polname,p.polcmd,p.polpermissive,p.polroles,
    pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
    from pg_policy p where p.polrelid=c.oid)) order by c.relname)
  from pg_class c where c.oid in ('public.chat_thread_members'::regclass,'public.chat_threads'::regclass))`;
const originalPrefix = `alter table public.chat_threads add column activity_admission_watermark timestamptz;
alter table public.chat_thread_members add column last_call_read_at timestamptz;
update public.chat_thread_members set last_call_read_at=last_read_at;`;
const columnsAbsent = `not exists(select 1 from information_schema.columns where table_schema='public' and
  (table_name='chat_thread_members' and column_name='last_call_read_at' or table_name='chat_threads' and column_name='activity_admission_watermark'))`;

// One connection, one transaction, no history edits or external services. All
// synthetic restrictions are introduced AFTER legitimate membership creation.
export function chatActivityUpgradeSQL() {
  return `begin;
set local lock_timeout='10s'; set local statement_timeout='120s'; set local time zone 'UTC';
${assertSQL(columnsAbsent, 'upgrade requires predecessor schema')}
${fixtures.map((f, i) => f.setup + `
insert into public.chat_messages(thread_id,sender_user_id,body,message_type,created_at)
  values('${f.thread}','${f.caller}','Synthetic retained message','text','2098-01-01 01:02:03.123456+00'),
    ('${f.thread}','${f.caller}','Synthetic earlier message','text','2000-01-01 01:02:03.234567+00');
insert into public.chat_call_events(thread_id,actor_user_id,call_type,event_type,created_at)
  values('${f.thread}','${f.caller}','voice','ended','${i === 1 ? '2097' : '2099'}-01-01 01:02:03.654321+00'),
    ('${f.thread}','${f.caller}','voice','ended','2001-01-01 01:02:03.345678+00');
update public.chat_thread_members set last_read_at=case when user_id='${f.caller}' then null
  else '2026-10-30 01:02:03.123456+00'::timestamptz end where thread_id='${f.thread}';
${i === 1 ? `update auth.users set banned_until='2199-01-01' where id in ('${f.caller}','${f.callee}');` : ''}
${i === 2 ? `insert into public.account_deletion_requests(user_id,status,delete_after,restore_deadline)
  values('${f.caller}','scheduled','2199-01-01','2199-01-01'),('${f.callee}','scheduled','2199-01-01','2199-01-01');` : ''}
`).join('\n')}
${empty.setup.replace('participant_pair_key,created_by)', 'participant_pair_key,created_by,created_at,updated_at)')
  .replace(`'${empty.thread}','direct','${empty.caller}::${empty.callee}','${empty.caller}')`,
    `'${empty.thread}','direct','${empty.caller}::${empty.callee}','${empty.caller}','2002-03-04 01:02:03.123456+00','2003-04-05 01:02:03.654321+00')`)}
select set_config('request.jwt.claims','{}',true);
${fixtures.map((f,i) => assertSQL(`public.is_account_access_restricted('${f.caller}')=${i !== 0} and public.is_account_access_restricted('${f.callee}')=${i !== 0}`, 'active/restricted fixture classification')).join('\n')}
-- Synthetic pre-existing Brand expression index, generated by the real spec.
-- Never refresh its registry after upgrade: the newly added column must make
-- the retained row-schema fingerprint stale and select the exact full scan.
do $index$ declare spec record; begin
  if not exists(select 1 from private.platform_brand_reference_indexes_v1 where table_oid='public.chat_thread_members'::regclass) then
    select * into strict spec from private.platform_brand_index_spec_v1('public.chat_thread_members'::regclass);
    execute format('create index test_upgrade_member_brand on public.chat_thread_members using gin ((%s) extensions.gin_trgm_ops)',spec.scan_expression);
    insert into private.platform_brand_reference_indexes_v1(table_oid,index_oid,row_schema,scan_expression,index_expression,environment)
      select 'public.chat_thread_members'::regclass,'public.test_upgrade_member_brand'::regclass,spec.row_schema,spec.scan_expression,
        pg_get_expr(indexprs,indrelid,false),private.platform_brand_index_environment_v1()
      from pg_index where indexrelid='public.test_upgrade_member_brand'::regclass;
  end if;
end $index$;
${assertSQL(`private.platform_brand_index_expression_v1('public.chat_thread_members'::regclass) is not null`, 'pre-existing registered expression index qualified')}
-- Existing sync triggers use transaction now(), so an accidental UPDATE can
-- be invisible in a same-transaction timestamp comparison. Observe writes as
-- well as values; this test-only trigger never replaces or disables a guard.
create temp table upgrade_thread_writes(id uuid);
create function pg_temp.observe_upgrade_thread_write() returns trigger language plpgsql as $observe$
begin insert into pg_temp.upgrade_thread_writes values(new.id); return new; end $observe$;
create trigger test_upgrade_thread_write after update on public.chat_threads
  for each row execute function pg_temp.observe_upgrade_thread_write();
create temp table upgrade_before as select ${tables.map((t,i) => `${snapshot(t)} as rows${i}`).join(',')},
  ${existingTriggers} as triggers, ${restrictionFunctions} as restrictions, ${accessCatalog} as access, ${indexCatalog} as indexes;
create temp table upgrade_watermarks as select id,greatest(
  (select max(created_at) from public.chat_messages where thread_id=t.id),
  (select max(created_at) from public.chat_call_events where thread_id=t.id),'1970-01-01'::timestamptz) as cut
  from public.chat_threads t;
-- Exact original failing prefix, including both DDL statements. Catching the
-- guard exception rolls back this entire subtransaction, not just its UPDATE.
do $negative$ begin
  begin
    execute ${literal(originalPrefix)};
    raise exception 'original migration unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'account_access_restricted' then raise; end if;
  end;
end $negative$;
${assertSQL(columnsAbsent, 'negative control must roll back schema')}
savepoint before_upgrade;
${migration}
${assertSQL(`not exists(select 1 from upgrade_thread_writes)`, 'schema initialization must not issue application thread UPDATEs')}
${assertSQL(`not exists(select 1 from public.chat_thread_members where last_call_read_at is distinct from last_read_at)`, 'exact read state including NULL and microseconds')}
${tables.map((t,i) => assertSQL(`${snapshot(t,i === 0 ? ['last_call_read_at'] : i === 1 ? ['activity_admission_watermark'] : [])}=(select rows${i} from upgrade_before)`, `all original ${t} fields unchanged`)).join('\n')}
${assertSQL(`${existingTriggers}=(select triggers from upgrade_before) and ${restrictionFunctions}=(select restrictions from upgrade_before)`, 'restriction functions, ACLs and triggers unchanged')}
${assertSQL(`${accessCatalog}=(select access from upgrade_before)`, 'existing ownership, table/column ACLs, RLS and policies unchanged')}
${assertSQL(`${indexCatalog}=(select indexes from upgrade_before)`, 'existing index OIDs, definitions, owners, opclasses and validity unchanged')}
${assertSQL(`private.platform_brand_index_expression_v1('public.chat_thread_members'::regclass) is null`, 'stale Brand schema fingerprint retains full-scan fallback')}
${assertSQL(`not has_column_privilege('authenticated','public.chat_thread_members','last_call_read_at','UPDATE')
  and not has_column_privilege('authenticated','public.chat_threads','activity_admission_watermark','UPDATE')`, 'new metadata grants no client write authority')}
${assertSQL(`not exists(select 1 from public.chat_threads t join upgrade_watermarks w using(id) where t.activity_admission_watermark is distinct from w.cut)`, 'exact historical message/call maximum')}
${assertSQL(`(select activity_admission_watermark from public.chat_threads where id='${empty.thread}')='1970-01-01'::timestamptz`, 'empty thread epoch floor')}
${assertSQL(`to_regprocedure('pg_temp.initialize_chat_activity_watermark(uuid)') is null`, 'temporary helper removed')}
${fixtures.slice(1).flatMap(f => [f.caller,f.callee]).map(user => `do $restricted$ begin
  begin
    update public.chat_thread_members set last_call_read_at=last_call_read_at where user_id='${user}';
    raise exception 'restricted UPDATE unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'account_access_restricted' then raise; end if;
  end;
end $restricted$;`).join('\n')}
-- Delete the future-dated prior head on the active thread, then admit new
-- activity: persisted watermark must survive deletion and advance strictly.
delete from public.chat_call_events where thread_id='${fixtures[0].thread}';
insert into public.chat_call_events(thread_id,actor_user_id,call_type,event_type)
  values('${fixtures[0].thread}','${fixtures[0].caller}','voice','ended');
${assertSQL(`(select min(created_at) from public.chat_call_events where thread_id='${fixtures[0].thread}') >
  (select cut from upgrade_watermarks where id='${fixtures[0].thread}')`, 'next admission above deleted legacy head')}
rollback to savepoint before_upgrade;
${assertSQL(columnsAbsent, 'rollback restores predecessor schema')}
${tables.map((t,i) => assertSQL(`${snapshot(t)}=(select rows${i} from upgrade_before)`, `rollback restores ${t}`)).join('\n')}
${assertSQL(`${existingTriggers}=(select triggers from upgrade_before) and ${restrictionFunctions}=(select restrictions from upgrade_before)`, 'rollback restores guard catalog')}
${assertSQL(`${accessCatalog}=(select access from upgrade_before)`, 'rollback restores access catalog')}
${assertSQL(`${indexCatalog}=(select indexes from upgrade_before) and private.platform_brand_index_expression_v1('public.chat_thread_members'::regclass) is not null`, 'rollback restores index catalog and qualification')}
rollback;
${assertSQL(columnsAbsent, 'outer rollback leaves predecessor schema')}
${assertSQL(`not exists(select 1 from auth.users where id in (${[...fixtures,empty].flatMap(f => [f.caller,f.callee]).map(literal).join(',')}))`, 'outer rollback removes every synthetic account')}
${assertSQL(`to_regprocedure('pg_temp.observe_upgrade_thread_write()') is null
  and to_regclass('public.test_upgrade_member_brand') is null`, 'outer rollback removes test-only instrumentation')}
select 'CHAT_ACTIVITY_POPULATED_UPGRADE_PASS';`;
}
