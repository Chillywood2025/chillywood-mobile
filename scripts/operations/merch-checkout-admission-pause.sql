-- Approved cutover operation, NOT a migration or a recurring task.
-- Execute this entire file inside ONE explicit transaction; commit before
-- observing drain. Never restore the old grant as automatic rollback.
set local lock_timeout = '10s';
set local statement_timeout = '20s';
select private.platform_brand_retention_lock();
revoke execute on function public.reserve_merch_checkout_for_actor_with_tracking(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text) from service_role;
do $$
declare f record; r text;
begin
 if to_regprocedure('public.reserve_merch_checkout_dispatch(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text)') is not null
  and has_function_privilege('service_role',to_regprocedure('public.reserve_merch_checkout_dispatch(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text)'),'EXECUTE')
 then raise exception 'new checkout admission already installed; pause contract invalid'; end if;
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'reserve_merch_checkout%'
 loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(r,f.oid,'EXECUTE') then
    raise exception 'checkout admission remains executable: % by %',f.proname,r;
   end if;
  end loop;
 end loop;
end $$;
