-- Source-only. No enrollment assertion, capability issuance, configuration,
-- backfill, credential, scheduler or API grant is supplied here.
create table private.google_play_external_capability_program_bindings (
 capability_id uuid primary key references private.creator_external_payment_capabilities(id) on delete restrict,
 program_id uuid not null references private.google_play_external_program_config(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp()
);
alter table private.google_play_external_capability_program_bindings enable row level security;
alter table private.google_play_external_capability_program_bindings force row level security;
revoke all on private.google_play_external_capability_program_bindings from public,anon,authenticated,service_role;
create trigger google_external_capability_program_immutable before update or delete
 on private.google_play_external_capability_program_bindings for each row
 execute function private.guard_event_ticket_terms_immutable();

create function private.google_play_external_bound_program_ready(p_capability_id uuid,p_program_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.creator_external_payment_capabilities c
 join private.google_play_external_capability_program_bindings b on b.capability_id=c.id
 join private.google_play_external_program_config p on p.id=b.program_id
 where c.id=p_capability_id and p.id=p_program_id
 and c.platform='android' and c.storefront_country='US'
 and c.route_kind='android_external_content_link' and c.environment='test'
 and c.enabled and c.revoked_at is null and c.verified_at<=clock_timestamp() and c.expires_at>clock_timestamp()
 and p.package_name='com.chillywood.mobile' and p.environment=c.environment
 and p.enabled and p.revoked_at is null and p.verified_at<=clock_timestamp() and p.expires_at>clock_timestamp());
$$;
revoke all on function private.google_play_external_bound_program_ready(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function private.google_play_external_program_ready(p_capability_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.google_play_external_capability_program_bindings b
 where b.capability_id=p_capability_id
 and private.google_play_external_bound_program_ready(b.capability_id,b.program_id));
$$;

-- Preserve the complete existing authority bodies and their API ACLs. Abort
-- rather than silently patch a changed predecessor. Historical report enqueue,
-- claim and completion deliberately remain unchanged after revocation.
do $repair$
declare body text; old text; updated text;
begin
 body:=pg_get_functiondef('public.admit_google_play_external_session(text,uuid,integer,uuid,text,integer,uuid)'::regprocedure);
 old:='not private.google_play_external_program_ready(a.capability_id)';
 if position(old in body)=0 then raise exception 'google_program_admission_predecessor_changed'; end if;
 body:=replace(body,old,'not private.google_play_external_bound_program_ready(a.capability_id,a.program_id)');
 old:=$old$select * into program from private.google_play_external_program_config where enabled and revoked_at is null
     and environment='test' and verified_at<=clock_timestamp() and expires_at>clock_timestamp()+interval '2 minutes'$old$;
 updated:=$new$select * into program from private.google_play_external_program_config where enabled and revoked_at is null
     and id=(select b.program_id from private.google_play_external_capability_program_bindings b where b.capability_id=cap.id)
     and private.google_play_external_bound_program_ready(cap.id,id)
     and environment='test' and verified_at<=clock_timestamp() and expires_at>clock_timestamp()+interval '2 minutes'$new$;
 if position(old in body)=0 then raise exception 'google_program_selection_predecessor_changed'; end if;
 execute replace(body,old,updated);
 body:=pg_get_functiondef('public.bind_google_play_external_checkout(uuid,uuid,text,uuid,text,integer)'::regprocedure);
 old:='where id=admission.program_id and enabled';
 if position(old in body)=0 then raise exception 'google_program_checkout_predecessor_changed'; end if;
 execute replace(body,old,'where id=admission.program_id and private.google_play_external_bound_program_ready(cap,id) and enabled');
end;
$repair$;
