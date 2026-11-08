-- Fresh inactive V3 composition only. The capture registry is in this same DB.
-- No reservation, provider state, enabled control or installer operator is seeded.
reset role;
grant rcq_v1_consumer to sbx_v1_core_owner with inherit true, set false;
set local role sbx_v1_core_owner;

create table sandbox_commerce_v1.test_store_v3_capture_deferred (
 ingress_id uuid primary key references sandbox_commerce_v1.test_store_v3_ingress(id),
 reason text not null check(reason='capture_admission_unavailable'),
 first_deferred_at timestamptz not null default clock_timestamp()
);
alter table sandbox_commerce_v1.test_store_v3_capture_deferred enable row level security;
alter table sandbox_commerce_v1.test_store_v3_capture_deferred force row level security;
create policy core_owner on sandbox_commerce_v1.test_store_v3_capture_deferred
 to sbx_v1_core_owner using(true) with check(true);
revoke all on sandbox_commerce_v1.test_store_v3_capture_deferred from public,anon,authenticated,service_role,sbx_v1_operator;
create trigger immutable before update or delete on sandbox_commerce_v1.test_store_v3_capture_deferred
 for each row execute function sandbox_commerce_v1.test_store_v3_immutable();
create trigger no_truncate before truncate on sandbox_commerce_v1.test_store_v3_capture_deferred
 for each statement execute function sandbox_commerce_v1.test_store_v3_immutable();

create function sandbox_commerce_v1.test_store_v3_capture_binding()
returns text language sql immutable security invoker set search_path='' as $$
 select 'sandbox-commerce-v1:protocol-3:capture-composed-v1'::text;
$$;

-- A positive return retains the registry's SHARE lock until the caller's
-- original bounded transaction ends. Errors never become positive admission.
-- The nonthrowing form lets authenticated ingress retain negatives when this
-- additional authority is absent, malformed, inaccessible or contended.
create function sandbox_commerce_v1.test_store_v3_capture_decision(p_project text)
returns text language plpgsql volatile security invoker set search_path='' as $$
declare verdict jsonb; binding text:=sandbox_commerce_v1.test_store_v3_capture_binding();
begin
 if p_project is null or p_project !~ '^[A-Za-z0-9_-]{1,128}$' then return 'unavailable'; end if;
 verdict:=rc_qualification_capture_v1.commerce_admission(p_project,binding);
 if verdict=jsonb_build_object(
  'protocol','rcq-commerce-admission-v1','projectId',p_project,'consumerBinding',binding,
  'status','not_capture','reason',null,'authorityGranted',false,'economicProjectionAllowed',false)
 then return 'admitted'; end if;
 if verdict->>'reason' in ('capture_reserved','consumer_binding_mismatch') and verdict=jsonb_build_object(
  'protocol','rcq-commerce-admission-v1','projectId',p_project,'consumerBinding',binding,
  'status','unavailable','reason',verdict->>'reason','authorityGranted',false,'economicProjectionAllowed',false)
 then return 'excluded'; end if;
 return 'unavailable';
exception when others then
 return 'unavailable';
end; $$;

create function sandbox_commerce_v1.test_store_v3_capture_admitted(p_project text)
returns boolean language sql volatile security invoker set search_path='' as $$
 select sandbox_commerce_v1.test_store_v3_capture_decision(p_project)='admitted';
$$;

create function sandbox_commerce_v1.test_store_v3_assert_capture_admission(p_project text)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
 if sandbox_commerce_v1.test_store_v3_capture_admitted(p_project) is not true
 then raise exception 'test_store_v3_capture_admission_required' using errcode='P0001'; end if;
end; $$;

-- Consume every independently retained subject, not just the primary customer.
-- This is an exclusion classifier only; not_qualification never grants access.
create function sandbox_commerce_v1.test_store_v3_capture_history(p_project text,p_raw text,p_common jsonb)
returns text language plpgsql volatile security invoker set search_path='' as $$
declare subject text; verdict text; result text:='not_qualification';
begin
 for subject in select value from (
   select p_common->>'userId' as value union select p_common->>'originalUserId'
   union select jsonb_array_elements_text(p_common->'aliases')
   union select jsonb_array_elements_text(p_common->'transferredFrom')
   union select jsonb_array_elements_text(p_common->'transferredTo')
   union select jsonb_array_elements_text(p_common->'conflictingUserIds')
  ) subjects
 loop
  verdict:=rc_qualification_capture_v1.history_gate(p_project,p_raw,p_common->>'eventId',
   p_common->>'originalTransactionId',p_common->>'transactionId',subject);
  if verdict in ('capture_active','qualification_unresolved','qualification_event_conflict','qualification_economic_history')
   then return verdict;
  elsif verdict='qualification_replay' then result:=verdict;
  elsif verdict is distinct from 'not_qualification' then return 'capture_unavailable'; end if;
 end loop;
 return result;
exception when others then
 return 'capture_unavailable';
end; $$;

revoke all on function sandbox_commerce_v1.test_store_v3_capture_binding(),
 sandbox_commerce_v1.test_store_v3_capture_decision(text),
 sandbox_commerce_v1.test_store_v3_capture_admitted(text),
 sandbox_commerce_v1.test_store_v3_assert_capture_admission(text),
 sandbox_commerce_v1.test_store_v3_capture_history(text,text,jsonb)
 from public,anon,authenticated,service_role,sbx_v1_operator;
reset role;
