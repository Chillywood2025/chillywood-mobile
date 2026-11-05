// Disposable native/WASM fixtures only. Choose an actual privilege change from
// the observed clone, which can have Supabase's implicit API grants enabled.
import assert from 'node:assert/strict';

// Replacement strings interpret $$, $&, $` and $'. SQL is literal data here.
// Require exactly one anchor and use a callback so dollar-quoted bodies survive.
export function injectBefore(sql,anchor,prefix) {
 assert.equal(sql.split(anchor).length,2,'fixture injection requires exactly one anchor');
 return sql.replace(anchor,()=>prefix+anchor);
}
export function eventHookDriftSql(sql) {
 return injectBefore(sql,'do $payout_observer_apply$',
  'create function extensions.observer_fixture_hook() returns event_trigger language plpgsql as $$begin return;end$$;create event trigger observer_fixture_hook on ddl_command_end execute function extensions.observer_fixture_hook();set local role postgres;');
}
export const notificationLockHolderSQL="begin;update public.notification_activity_events set attempts=attempts where false;select 'HOLDING';";
export const observerBarrierKey=77005010859;
export function observerBarrierSql(sql,anchor,{outsideDo=false}={}) {
 const pause=outsideDo
  ?`set local lock_timeout='0';select pg_advisory_xact_lock(${observerBarrierKey});set local lock_timeout='5s';`
  :`perform set_config('lock_timeout','0',true);perform pg_advisory_xact_lock(${observerBarrierKey});perform set_config('lock_timeout','5s',true);`;
 return injectBefore(sql,anchor,pause);
}

export function nativeDriftCases(before) {
 const notificationTable=state=>state.catalog.tables.find(t=>t.name==='public.notifications');
 const anonSelect=notificationTable(before)?.anonSelect;
 if(typeof anonSelect!=='boolean')throw Error('notification ACL fixture baseline missing');
 return [
  {label:'prior history name',mutation:"update supabase_migrations.schema_migrations set name=coalesce(name,'')||'_drift' where version=(select min(version) from supabase_migrations.schema_migrations)",observe:s=>s.priorHistorySHA256},
  {label:'ledger column default',mutation:"alter table supabase_migrations.schema_migrations alter column name set default 'unexpected'",observe:s=>s.invariantsSha256},
  {label:'ledger insert trigger',mutation:'create trigger observer_ledger_drift before insert on supabase_migrations.schema_migrations for each row execute function pg_catalog.suppress_redundant_updates_trigger()',observe:s=>s.invariantsSha256},
  {label:'ledger insert rule',mutation:'create rule observer_ledger_rule as on insert to supabase_migrations.schema_migrations do also select 1',observe:s=>s.ledgerRulesAbsent},
  {label:'notification anon SELECT',mutation:anonSelect?'revoke select on public.notifications from anon,public':'grant select on public.notifications to anon',observe:s=>notificationTable(s)?.anonSelect},
  {label:'activity worker cron',mutation:"update cron.job set schedule='1 minute'",observe:s=>s.workerSchedule},
 ];
}
