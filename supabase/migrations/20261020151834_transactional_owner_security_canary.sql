-- Transactional Owner Security revocation and purpose-limited canary fixtures.
-- No helper/table ACL widening, expiry sweep, Auth user deletion or live grants.
begin;
create schema if not exists private;

create table private.owner_security_revocation_receipts (
 request_id uuid primary key,
 actor_user_id uuid not null,
 actor_session_id uuid not null,
 device_id uuid not null,
 mode text not null check(mode in ('single','bulk')),
 grant_id uuid,
 reason text not null,
 receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 check((mode='single')=(grant_id is not null))
);
create table private.admin_canary_fixture_runs (
 run_id uuid primary key,
 actor_user_id uuid not null,
 actor_session_id uuid not null,
 actor_role text not null check(actor_role in ('owner','operator','moderator')),
 started_at timestamptz not null,
 deadline timestamptz not null,
 status text not null default 'open' check(status in ('open','closed')),
 closed_at timestamptz,
 cleanup_receipt jsonb,
 check(deadline=started_at+interval '15 minutes'),
 check((status='closed')=(closed_at is not null)),
 check((status='closed')=(cleanup_receipt is not null))
);
create table private.admin_canary_fixture_users (
 run_id uuid not null references private.admin_canary_fixture_runs(run_id),
 label text not null check(label in ('admin','granted-admin','moderator','target-moderator','viewer')),
 user_id uuid not null unique,
 email text not null unique,
 registered_at timestamptz,
 primary key(run_id,label),
 unique(run_id,label,user_id),
 check(email='liveops.proof+'||label||'.'||run_id::text||'@chillywoodstream.com')
);
create table private.admin_canary_fixture_roles (
 run_id uuid not null,
 label text not null,
 role text not null check(role in ('operator','moderator')),
 role_id bigint not null unique,
 user_id uuid not null,
 primary key(run_id,label,role),
 foreign key(run_id,label,user_id) references private.admin_canary_fixture_users(run_id,label,user_id),
 check((label in ('admin','granted-admin') and role='operator') or (label='moderator' and role='moderator'))
);
create table private.admin_canary_fixture_grants (
 run_id uuid not null,
 label text not null,
 permission_key text not null check(permission_key in
  ('legal_review','evidence_export','legal_hold','legal_request_intake','dmca_review')),
 grant_id uuid not null unique,
 user_id uuid not null,
 primary key(run_id,label,permission_key),
 foreign key(run_id,label,user_id) references private.admin_canary_fixture_users(run_id,label,user_id),
 check(label='granted-admin')
);
alter table private.owner_security_revocation_receipts enable row level security;
alter table private.owner_security_revocation_receipts force row level security;
alter table private.admin_canary_fixture_runs enable row level security;
alter table private.admin_canary_fixture_runs force row level security;
alter table private.admin_canary_fixture_users enable row level security;
alter table private.admin_canary_fixture_users force row level security;
alter table private.admin_canary_fixture_roles enable row level security;
alter table private.admin_canary_fixture_roles force row level security;
alter table private.admin_canary_fixture_grants enable row level security;
alter table private.admin_canary_fixture_grants force row level security;
revoke all on private.owner_security_revocation_receipts,private.admin_canary_fixture_runs,
 private.admin_canary_fixture_users,private.admin_canary_fixture_roles,private.admin_canary_fixture_grants
 from public,anon,authenticated,service_role;

create function private.preserve_admin_mutation_identity() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'admin_mutation_record_immutable'; end if;
 if tg_table_name='admin_canary_fixture_runs' then
  if (to_jsonb(new)-array['status','closed_at','cleanup_receipt'])
    is distinct from (to_jsonb(old)-array['status','closed_at','cleanup_receipt'])
    or old.status='closed' then raise exception 'admin_canary_run_immutable'; end if;
 elsif tg_table_name='admin_canary_fixture_users' then
  if (to_jsonb(new)-'registered_at') is distinct from (to_jsonb(old)-'registered_at')
    or old.registered_at is not null then raise exception 'admin_canary_user_immutable'; end if;
 else raise exception 'admin_mutation_record_immutable';
 end if;
 return new;
end $$;
create trigger preserve_owner_security_receipt before update or delete on private.owner_security_revocation_receipts
 for each row execute function private.preserve_admin_mutation_identity();
create trigger preserve_admin_canary_run before update or delete on private.admin_canary_fixture_runs
 for each row execute function private.preserve_admin_mutation_identity();
create trigger preserve_admin_canary_user before update or delete on private.admin_canary_fixture_users
 for each row execute function private.preserve_admin_mutation_identity();
create trigger preserve_admin_canary_role before update or delete on private.admin_canary_fixture_roles
 for each row execute function private.preserve_admin_mutation_identity();
create trigger preserve_admin_canary_grant before update or delete on private.admin_canary_fixture_grants
 for each row execute function private.preserve_admin_mutation_identity();

-- Only preallocated immutable synthetic UUIDs participate in this fence. Every
-- normal authority producer serializes with close before it can commit active
-- authority for one of those subjects; revocation remains available afterward.
create function private.guard_admin_canary_authority() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare subject text; previous_subject text; r private.admin_canary_fixture_runs;
begin
 subject:=to_jsonb(new)->>case when tg_table_name='platform_role_memberships' then 'user_id' else 'target_user_id' end;
 if tg_op='UPDATE' then
  previous_subject:=to_jsonb(old)->>case when tg_table_name='platform_role_memberships' then 'user_id' else 'target_user_id' end;
  if previous_subject is distinct from subject and exists(select 1 from private.admin_canary_fixture_users f
   where f.user_id::text=previous_subject) then raise exception 'admin_canary_subject_immutable'; end if;
 end if;
 if new.status<>'active' then return new; end if;
 select x.* into r from private.admin_canary_fixture_runs x
 join private.admin_canary_fixture_users f on f.run_id=x.run_id
 where f.user_id::text=subject for update of x;
 if not found then return new; end if;
 if r.status<>'open' or r.deadline<=clock_timestamp() then raise exception 'admin_canary_run_closed'; end if;
 if new.expires_at is null or new.expires_at>r.deadline or new.expires_at<=clock_timestamp() then
  raise exception 'admin_canary_authority_deadline_required'; end if;
 return new;
end $$;
create trigger zzzz_guard_admin_canary_role_authority before insert or update on public.platform_role_memberships
 for each row execute function private.guard_admin_canary_authority();
create trigger zzzz_guard_admin_canary_permission_authority before insert or update on public.platform_staff_permission_grants
 for each row execute function private.guard_admin_canary_authority();

-- Fence even an Auth creation whose HTTP response was lost. Insert-before-close
-- holds the run until commit; close-before-insert rejects the late subject.
-- GoTrue may finalize confirmation/metadata after its initial insert, so their
-- complete proof remains mandatory at registration and every provision call.
create function private.guard_admin_canary_auth_insert() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare r private.admin_canary_fixture_runs; expected_email text;
begin
 select x.* into r from private.admin_canary_fixture_runs x
 join private.admin_canary_fixture_users f on f.run_id=x.run_id where f.user_id=new.id for update of x;
 if not found then return new; end if;
 select f.email into expected_email from private.admin_canary_fixture_users f where f.user_id=new.id;
 if r.status<>'open' or r.deadline<=clock_timestamp() then raise exception 'admin_canary_run_closed'; end if;
 if lower(btrim(new.email)) is distinct from expected_email then
  raise exception 'admin_canary_auth_identity_mismatch' using errcode='42501'; end if;
 return new;
end $$;
create trigger zzzz_guard_admin_canary_auth_insert before insert on auth.users
 for each row execute function private.guard_admin_canary_auth_insert();

-- VOLATILE obtains a fresh READ COMMITTED snapshot on every post-wait call.
-- Canonical legal/session/restriction authority is retained. Raw wall-clock
-- bounds close the stable helpers' transaction-start now() expiry window.
create function private.assert_admin_mutation_actor(p_canary boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role text; actor_email text;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'admin_mutation_requires_read_committed' using errcode='25000';
 end if;
 if actor is null or public.platform_exact_current_session_authority_internal() is not true
  or not exists(select 1 from auth.sessions s where s.user_id=actor
   and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception 'admin_mutation_current_session_required' using errcode='42501';
 end if;
 actor_role:=public.platform_staff_actor_role();
 if actor_role is null or not exists(select 1 from public.platform_role_memberships m
  where m.user_id=actor::text and m.role=actor_role and m.status='active'
   and (m.expires_at is null or m.expires_at>clock_timestamp()))
  or public.is_account_access_restricted(actor::text) then
  raise exception 'admin_mutation_staff_required' using errcode='42501';
 end if;
 if not p_canary and actor_role is distinct from 'owner' then
  raise exception 'owner_required' using errcode='42501';
 end if;
 if p_canary and actor_role<>'owner' and (
  actor_role not in ('operator','moderator')
  or not exists(select 1 from public.platform_staff_permission_grants g
   where g.target_user_id=actor::text and g.status='active'
    and g.permission_key in ('audit_review','security_review')
    and (g.expires_at is null or g.expires_at>clock_timestamp()))) then
  raise exception 'audit_review_required' using errcode='42501';
 end if;
 select lower(btrim(u.email)) into actor_email from auth.users u where u.id=actor;
 return jsonb_build_object('userId',actor,'sessionId',auth.jwt()->>'session_id',
  'role',actor_role,'email',actor_email);
end $$;

create function private.lock_admin_mutation_actor() returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 perform u.id from auth.users u where u.id=auth.uid() for share;
 perform s.id from auth.sessions s where s.user_id=auth.uid()
  and s.id::text=auth.jwt()->>'session_id' for share;
 perform m.id from public.platform_role_memberships m where m.user_id=auth.uid()::text
  and m.status='active' order by m.id for share;
 if public.platform_staff_actor_role() is distinct from 'owner' then
  perform g.id from public.platform_staff_permission_grants g where g.target_user_id=auth.uid()::text
   and g.status='active' and g.permission_key in ('audit_review','security_review')
   order by g.id for share;
 end if;
 perform a.id from public.wave1_legal_acceptances a where a.user_id=auth.uid()
  and a.invalidated_at is null order by a.id for share;
 perform d.document_key from public.wave1_legal_document_versions d where d.active
  order by d.document_key,d.version,d.market,d.capability for share;
end $$;

create function private.assert_owner_security_context(p_context uuid,p_device uuid,p_action text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c public.security_request_context; d public.owner_trusted_devices;
begin
 select * into d from public.owner_trusted_devices where id=p_device;
 if not found or d.owner_user_id is distinct from auth.uid()
  or d.trusted_at is null or d.trusted_at>clock_timestamp() or d.revoked_at is not null then
  raise exception 'trusted_device_required' using errcode='42501';
 end if;
 select * into c from public.security_request_context where id=p_context;
 if not found or c.user_id is distinct from auth.uid()
  or c.source is distinct from 'admin-owner-controls:'||p_action
  or c.metadata->>'auth_session_id' is distinct from auth.jwt()->>'session_id'
  or c.metadata->>'owner_security_action' is distinct from p_action
  or c.device_hash is distinct from d.device_fingerprint_hash
  or c.created_at>clock_timestamp() or c.created_at<clock_timestamp()-interval '5 minutes'
  or (c.retention_expires_at is not null and c.retention_expires_at<=clock_timestamp()) then
  raise exception 'owner_security_context_required' using errcode='42501';
 end if;
 return jsonb_build_object('security_context_id',c.id,'security_context_capture_status',c.capture_status,
  'security_context_network_proof_state',coalesce(c.metadata->>'network_proof_state','missing'),
  'security_context_network_proof_verified',c.network_proof_verified,'security_context_source',c.source);
end $$;

create function public.owner_security_revoke_grants(
 p_request_id uuid,p_mode text,p_grant_id uuid,p_reason text,p_security_context_id uuid,p_device_id uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); authority jsonb; context_metadata jsonb; old_receipt private.owner_security_revocation_receipts;
 action text; scope_time timestamptz:=clock_timestamp(); revoked_time timestamptz;
 scope jsonb; item jsonb; current_grant public.platform_staff_permission_grants; result jsonb;
 ids uuid[]:='{}'; single_grant jsonb; v_reason text:=btrim(coalesce(p_reason,''));
begin
 -- Match normalizeExactSubjectId so a durable receipt remains recoverable
 -- through the existing Edge/client operation parser.
 if p_request_id is null
  or p_request_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or p_mode not in ('single','bulk') or p_mode is null
  or (p_mode='single') is distinct from (p_grant_id is not null)
  or length(v_reason) not between 6 and 1000 then raise exception 'owner_security_request_invalid' using errcode='22023'; end if;
 authority:=private.assert_admin_mutation_actor(false);
 action:=case when p_mode='single' then 'revoke_temporary_owner_grant' else 'revoke_all_temporary_owner_grants' end;
 perform private.assert_owner_security_context(p_security_context_id,p_device_id,action);
 -- Capture exact identities AND all mutable columns before any lock wait.
 -- A producer using transaction now() cannot join this fixed scope by committing
 -- during the request-lock wait or conceal a renewal under the timestamp cutoff.
 select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]'::jsonb) into scope
 from public.platform_staff_permission_grants g where g.status='active' and (
  (p_mode='single' and g.id=p_grant_id) or
  (p_mode='bulk' and g.granted_at<=scope_time and g.updated_at<=scope_time
   and (g.expires_at is null or g.expires_at>scope_time)
   and (g.expires_at is not null or lower(btrim(g.target_email)) like 'liveops.proof+%'
    or g.metadata->'canary_proof'='true'::jsonb or g.metadata->'cleanup_required'='true'::jsonb)));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-security-request:'||p_request_id::text,0));
 -- Lock all present subjects in one order before actor/session/role authority.
 perform u.id from auth.users u where u.id=actor or u.id::text in (
  select x->>'target_user_id' from jsonb_array_elements(scope) x) order by u.id for share;
 perform private.lock_admin_mutation_actor();
 perform d.id from public.owner_trusted_devices d where d.id=p_device_id for share;
 perform c.id from public.security_request_context c where c.id=p_security_context_id for share;
 authority:=private.assert_admin_mutation_actor(false);
 context_metadata:=private.assert_owner_security_context(p_security_context_id,p_device_id,action);
 select * into old_receipt from private.owner_security_revocation_receipts where request_id=p_request_id;
 if found then
  if old_receipt.actor_user_id is distinct from actor
   or old_receipt.actor_session_id::text is distinct from auth.jwt()->>'session_id'
   or old_receipt.device_id is distinct from p_device_id
   or old_receipt.mode is distinct from p_mode or old_receipt.grant_id is distinct from p_grant_id
   or old_receipt.reason is distinct from v_reason then
   raise exception 'owner_security_request_conflict' using errcode='22023';
  end if;
  return old_receipt.receipt;
 end if;
 if p_mode='single' and jsonb_array_length(scope)=0 then raise exception 'temporary_grant_not_found' using errcode='P0002'; end if;
 for item in select value from jsonb_array_elements(scope) order by value->>'id' loop
  select * into current_grant from public.platform_staff_permission_grants where id=(item->>'id')::uuid for update;
  if not found or to_jsonb(current_grant) is distinct from item then
   raise exception 'owner_security_scope_changed' using errcode='40001';
  end if;
  ids:=array_append(ids,current_grant.id);
 end loop;
 if private.assert_admin_mutation_actor(false) is distinct from authority then
  raise exception 'admin_mutation_authority_changed' using errcode='42501';
 end if;
 perform private.assert_owner_security_context(p_security_context_id,p_device_id,action);
 revoked_time:=clock_timestamp();
 for item in select value from jsonb_array_elements(scope) order by value->>'id' loop
  update public.platform_staff_permission_grants set status='revoked',reason=v_reason,
   revoked_by=actor::text,revoked_at=revoked_time,updated_at=revoked_time
   where id=(item->>'id')::uuid returning * into current_grant;
  if p_mode='single' then single_grant:=to_jsonb(current_grant); end if;
  insert into public.platform_staff_permission_audit(actor_user_id,actor_email,actor_role,
   target_user_id,target_email,permission_key,action,reason,metadata,security_context_id)
  values(actor::text,authority->>'email','owner',current_grant.target_user_id,current_grant.target_email,
   current_grant.permission_key,'revoke',v_reason,
   jsonb_build_object('source','owner_security_center')||context_metadata||
    case when p_mode='bulk' then '{"bulk_revoke":true}'::jsonb else '{}'::jsonb end,p_security_context_id);
 end loop;
 if cardinality(ids)>0 then
  insert into public.security_audit_events(actor_user_id,actor_email,actor_role,event_type,severity,
   target_type,target_id,reason,metadata,security_context_id)
  values(actor,authority->>'email','owner',
   case when p_mode='single' then 'temporary_grant_revoked' else 'temporary_grants_bulk_revoked' end,
   case when p_mode='single' then 'high' else 'critical' end,
   case when p_mode='single' then 'platform_staff_permission_grant' else 'platform_staff_permission_grants' end,
   case when p_mode='single' then p_grant_id::text else 'temporary_owner_grants' end,v_reason,
   context_metadata||case when p_mode='single' then jsonb_build_object('grant_type',single_grant->>'permission_key',
    'target_email',lower(btrim(single_grant->>'target_email')),'target_user_id',single_grant->>'target_user_id')
    else jsonb_build_object('revoked_count',cardinality(ids)) end,p_security_context_id);
 end if;
 result:=jsonb_build_object('ok',true,'requestId',p_request_id,'mode',p_mode,'scopeAsOf',scope_time,
  'revokedCount',cardinality(ids),'grantIds',to_jsonb(ids),'grant',single_grant,'revokedAt',revoked_time);
 insert into private.owner_security_revocation_receipts(request_id,actor_user_id,actor_session_id,device_id,mode,grant_id,reason,receipt)
 values(p_request_id,actor,(auth.jwt()->>'session_id')::uuid,p_device_id,p_mode,p_grant_id,v_reason,result);
 -- Includes waits in every grant, audit and receipt sink; failure rolls all back.
 if private.assert_admin_mutation_actor(false) is distinct from authority then
  raise exception 'admin_mutation_authority_changed' using errcode='42501';
 end if;
 perform private.assert_owner_security_context(p_security_context_id,p_device_id,action);
 return result;
end $$;

create function private.assert_admin_canary_user(p_run uuid,p_label text,p_require_present boolean)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare r private.admin_canary_fixture_runs; f private.admin_canary_fixture_users; u auth.users;
begin
 select * into strict r from private.admin_canary_fixture_runs where run_id=p_run;
 select * into f from private.admin_canary_fixture_users where run_id=p_run and label=p_label;
 if not found then raise exception 'admin_canary_label_invalid' using errcode='22023'; end if;
 select * into u from auth.users where id=f.user_id;
 if not found then
  if p_require_present then raise exception 'admin_canary_auth_user_missing'; end if;
  return false;
 end if;
 if lower(btrim(u.email)) is distinct from f.email or u.email_confirmed_at is null or u.deleted_at is not null or u.created_at is null
  or u.created_at<r.started_at or u.created_at>r.deadline
  or not coalesce(u.raw_app_meta_data @> jsonb_build_object('canary_proof',true,
   'canary_proof_run_id',p_run::text,'proof_label',p_label),false) then
  raise exception 'admin_canary_auth_identity_mismatch' using errcode='42501';
 end if;
 return true;
end $$;

create function private.admin_canary_manifest(p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r private.admin_canary_fixture_runs; f private.admin_canary_fixture_users; users jsonb:='[]'; active_count integer;
begin
 select * into r from private.admin_canary_fixture_runs where run_id=p_run;
 if not found then raise exception 'admin_canary_run_not_found' using errcode='P0002'; end if;
 for f in select * from private.admin_canary_fixture_users where run_id=p_run order by label loop
  users:=users||jsonb_build_array(jsonb_build_object('label',f.label,'userId',f.user_id,'email',f.email,
   'registered',f.registered_at is not null,'authPresent',private.assert_admin_canary_user(p_run,f.label,false)));
 end loop;
 select (select count(*) from public.platform_role_memberships m join private.admin_canary_fixture_roles x on x.role_id=m.id
   where x.run_id=p_run and m.status='active')+
  (select count(*) from public.platform_staff_permission_grants g join private.admin_canary_fixture_grants x on x.grant_id=g.id
   where x.run_id=p_run and g.status='active') into active_count;
 return jsonb_build_object('runId',p_run,'status',r.status,'deadline',r.deadline,'startedAt',r.started_at,
  'registeredActiveCount',active_count,'cleanupVerified',r.status='closed' and active_count=0,
  'users',users,'roleIds',coalesce((select jsonb_agg(role_id order by role_id) from private.admin_canary_fixture_roles where run_id=p_run),'[]'),
  'grantIds',coalesce((select jsonb_agg(grant_id order by grant_id) from private.admin_canary_fixture_grants where run_id=p_run),'[]'),
  'cleanupReceipt',r.cleanup_receipt);
end $$;

create function public.begin_admin_canary_run(p_run_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare authority jsonb; r private.admin_canary_fixture_runs; pending private.admin_canary_fixture_runs;
 started timestamptz; label text; result jsonb;
begin
 if p_run_id is null then raise exception 'admin_canary_run_id_required' using errcode='22023'; end if;
 -- Match normalizeExactSubjectId/createCanaryProofScope before persisting a
 -- manifest: unsupported UUID versions/variants cannot poison discovery/resume.
 if p_run_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  raise exception 'admin_canary_run_id_invalid' using errcode='22023'; end if;
 authority:=private.assert_admin_mutation_actor(true);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('admin-canary-actor:'||auth.uid()::text,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('admin-canary-run:'||p_run_id::text,0));
 perform private.lock_admin_mutation_actor();
 authority:=private.assert_admin_mutation_actor(true);
 select * into r from private.admin_canary_fixture_runs where run_id=p_run_id for update;
 if found then
  if r.actor_user_id is distinct from auth.uid() or r.actor_session_id::text is distinct from auth.jwt()->>'session_id' then
   raise exception 'admin_canary_actor_mismatch' using errcode='42501'; end if;
  return private.admin_canary_manifest(p_run_id)||jsonb_build_object('created',false);
 end if;
 select x.* into pending from private.admin_canary_fixture_runs x where x.actor_user_id=auth.uid()
  and (x.status='open' or exists(select 1 from private.admin_canary_fixture_users f
   join auth.users u on u.id=f.user_id where f.run_id=x.run_id)
   or exists(select 1 from public.platform_role_memberships m join private.admin_canary_fixture_roles f on f.role_id=m.id
    where f.run_id=x.run_id and m.status='active')
   or exists(select 1 from public.platform_staff_permission_grants g join private.admin_canary_fixture_grants f on f.grant_id=g.id
    where f.run_id=x.run_id and g.status='active'))
  order by x.started_at,x.run_id limit 1;
 if found then raise exception 'admin_canary_pending_run' using errcode='55000',
  detail=jsonb_build_object('runId',pending.run_id,'status',pending.status,'deadline',pending.deadline)::text;
 end if;
 started:=clock_timestamp();
 insert into private.admin_canary_fixture_runs(run_id,actor_user_id,actor_session_id,actor_role,started_at,deadline)
 values(p_run_id,auth.uid(),(auth.jwt()->>'session_id')::uuid,authority->>'role',started,started+interval '15 minutes');
 foreach label in array array['admin','granted-admin','moderator','target-moderator','viewer'] loop
  insert into private.admin_canary_fixture_users(run_id,label,user_id,email)
  values(p_run_id,label,gen_random_uuid(),'liveops.proof+'||label||'.'||p_run_id::text||'@chillywoodstream.com');
 end loop;
 result:=private.admin_canary_manifest(p_run_id)||jsonb_build_object('created',true);
 if private.assert_admin_mutation_actor(true) is distinct from authority then
  raise exception 'admin_mutation_authority_changed' using errcode='42501'; end if;
 return result;
end $$;

create function public.register_admin_canary_user(p_run_id uuid,p_label text,p_user_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.admin_canary_fixture_runs; f private.admin_canary_fixture_users;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'admin_canary_service_required' using errcode='42501'; end if;
 select * into r from private.admin_canary_fixture_runs where run_id=p_run_id for update;
 if not found then raise exception 'admin_canary_run_not_found' using errcode='P0002'; end if;
 select * into f from private.admin_canary_fixture_users where run_id=p_run_id and label=p_label;
 if not found or (p_user_id is not null and p_user_id is distinct from f.user_id) then
  raise exception 'admin_canary_subject_mismatch' using errcode='42501'; end if;
 perform u.id from auth.users u where u.id=f.user_id for share;
 if r.status<>'open' or r.deadline<=clock_timestamp() then raise exception 'admin_canary_run_closed'; end if;
 perform private.assert_admin_canary_user(p_run_id,p_label,true);
 if f.registered_at is null then update private.admin_canary_fixture_users set registered_at=clock_timestamp()
  where run_id=p_run_id and label=p_label; end if;
 if r.deadline<=clock_timestamp() then raise exception 'admin_canary_run_closed'; end if;
 return jsonb_build_object('runId',p_run_id,'label',p_label,'userId',f.user_id,'email',f.email);
end $$;

create function public.provision_admin_canary_fixture(
 p_run_id uuid,p_label text,p_role text default null,p_permission_key text default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare authority jsonb; r private.admin_canary_fixture_runs; f private.admin_canary_fixture_users;
 role_id bigint; grant_id uuid; result jsonb; metadata jsonb;
begin
 if (p_role is null)=(p_permission_key is null)
  or (p_role is not null and p_role not in ('operator','moderator'))
  or (p_role is not null and not ((p_label in ('admin','granted-admin') and p_role='operator')
    or (p_label='moderator' and p_role='moderator')))
  or (p_permission_key is not null and p_label is distinct from 'granted-admin')
  or (p_permission_key is not null and p_permission_key not in
   ('legal_review','evidence_export','legal_hold','legal_request_intake','dmca_review')) then
  raise exception 'admin_canary_fixture_scope_invalid' using errcode='22023'; end if;
 authority:=private.assert_admin_mutation_actor(true);
 perform private.lock_admin_mutation_actor();
 select * into r from private.admin_canary_fixture_runs where run_id=p_run_id for update;
 if not found then raise exception 'admin_canary_run_not_found' using errcode='P0002'; end if;
 if r.actor_user_id is distinct from auth.uid() or r.actor_session_id::text is distinct from auth.jwt()->>'session_id' then
  raise exception 'admin_canary_actor_mismatch' using errcode='42501'; end if;
 select * into f from private.admin_canary_fixture_users where run_id=p_run_id and label=p_label;
 if not found or f.registered_at is null then raise exception 'admin_canary_user_not_registered' using errcode='42501'; end if;
 perform u.id from auth.users u where u.id=f.user_id for share;
 authority:=private.assert_admin_mutation_actor(true);
 if r.status<>'open' or r.deadline<=clock_timestamp() then raise exception 'admin_canary_run_closed'; end if;
 perform private.assert_admin_canary_user(p_run_id,p_label,true);
 metadata:=jsonb_build_object('canary_proof',true,'canary_proof_run_id',p_run_id,'cleanup_required',true,
  'granted_actor_role','system','fixture_label',p_label,'original_actor_user_id',r.actor_user_id);
 if p_role is not null then
  select x.role_id into role_id from private.admin_canary_fixture_roles x
   where x.run_id=p_run_id and x.label=p_label and x.role=p_role;
  if role_id is null then
   insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by,granted_at,expires_at,updated_at)
   values(p_role,f.user_id::text,f.email,'active','CANARY PROOF run '||p_run_id::text||'; exact cleanup required.',
    'admin-owner-controls-canary',clock_timestamp(),r.deadline,clock_timestamp()) returning id into role_id;
   insert into private.admin_canary_fixture_roles values(p_run_id,p_label,p_role,role_id,f.user_id);
   insert into public.platform_staff_role_audit(actor_user_id,actor_email,actor_role,target_user_id,target_email,action,role,reason,metadata)
   values(auth.uid()::text,authority->>'email',authority->>'role',f.user_id::text,f.email,'grant',p_role,
    'CANARY PROOF temporary fixture role.',metadata);
  elsif not exists(select 1 from public.platform_role_memberships m where m.id=role_id and m.status='active'
   and m.user_id=f.user_id::text and m.role=p_role and m.email=f.email and m.expires_at=r.deadline
   and m.granted_by='admin-owner-controls-canary') then raise exception 'admin_canary_fixture_changed';
  end if;
 else
  select x.grant_id into grant_id from private.admin_canary_fixture_grants x
   where x.run_id=p_run_id and x.label=p_label and x.permission_key=p_permission_key;
  if grant_id is null then
   insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason,
    metadata,granted_by,granted_at,expires_at,updated_at)
   values(f.user_id::text,f.email,p_permission_key,'active','CANARY PROOF temporary scoped permission.',
    metadata,'admin-owner-controls-canary',clock_timestamp(),r.deadline,clock_timestamp()) returning id into grant_id;
   insert into private.admin_canary_fixture_grants values(p_run_id,p_label,p_permission_key,grant_id,f.user_id);
   insert into public.platform_staff_permission_audit(actor_user_id,actor_email,actor_role,target_user_id,target_email,
    permission_key,action,reason,metadata)
   values(auth.uid()::text,authority->>'email',authority->>'role',f.user_id::text,f.email,p_permission_key,'grant',
    'CANARY PROOF temporary scoped permission.',metadata);
  elsif not exists(select 1 from public.platform_staff_permission_grants g where g.id=grant_id and g.status='active'
   and g.target_user_id=f.user_id::text and g.target_email=f.email and g.permission_key=p_permission_key
   and g.expires_at=r.deadline and g.granted_by='admin-owner-controls-canary'
   and g.metadata->>'canary_proof_run_id'=p_run_id::text) then raise exception 'admin_canary_fixture_changed';
  end if;
 end if;
 result:=jsonb_build_object('runId',p_run_id,'label',p_label,'roleId',role_id,'grantId',grant_id,'deadline',r.deadline);
 if private.assert_admin_mutation_actor(true) is distinct from authority then
  raise exception 'admin_mutation_authority_changed' using errcode='42501'; end if;
 perform private.assert_admin_canary_user(p_run_id,p_label,true);
 if r.deadline<=clock_timestamp() then raise exception 'admin_canary_run_closed'; end if;
 return result;
end $$;

create function public.read_admin_canary_manifest(p_run_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'admin_canary_service_required' using errcode='42501'; end if;
 return private.admin_canary_manifest(p_run_id);
end $$;

-- Discovery is actor-owned, including runs from an older session. Provisioning
-- still requires the immutable original session; service cleanup never does.
create function public.list_admin_canary_pending_runs() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare authority jsonb; run_id uuid; runs jsonb:='[]';
begin
 authority:=private.assert_admin_mutation_actor(true);
 perform private.lock_admin_mutation_actor();
 authority:=private.assert_admin_mutation_actor(true);
 for run_id in select r.run_id from private.admin_canary_fixture_runs r where r.actor_user_id=auth.uid()
  and (r.status='open' or exists(select 1 from private.admin_canary_fixture_users f
   join auth.users u on u.id=f.user_id where f.run_id=r.run_id)
   or exists(select 1 from public.platform_role_memberships m join private.admin_canary_fixture_roles f on f.role_id=m.id
    where f.run_id=r.run_id and m.status='active')
   or exists(select 1 from public.platform_staff_permission_grants g join private.admin_canary_fixture_grants f on f.grant_id=g.id
    where f.run_id=r.run_id and g.status='active')) order by r.started_at,r.run_id loop
  runs:=runs||jsonb_build_array(private.admin_canary_manifest(run_id));
 end loop;
 if private.assert_admin_mutation_actor(true) is distinct from authority then
  raise exception 'admin_mutation_authority_changed' using errcode='42501'; end if;
 return jsonb_build_object('runs',runs);
end $$;

create function public.cleanup_admin_canary_run(p_run_id uuid,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r private.admin_canary_fixture_runs; f private.admin_canary_fixture_users; item record;
 m public.platform_role_memberships; g public.platform_staff_permission_grants;
 role_count integer:=0; grant_count integer:=0; result jsonb; stamp timestamptz; metadata jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'admin_canary_service_required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 6 and 1000 then raise exception 'reason_required'; end if;
 select * into r from private.admin_canary_fixture_runs where run_id=p_run_id for update;
 if not found then raise exception 'admin_canary_run_not_found' using errcode='P0002'; end if;
 perform u.id from auth.users u where u.id in(select user_id from private.admin_canary_fixture_users where run_id=p_run_id)
  order by u.id for share;
 -- A timed-out Auth create may have committed before registration. Only the
 -- preallocated exact identity with matching server app_metadata is recovered.
 for f in select * from private.admin_canary_fixture_users where run_id=p_run_id order by label loop
  if private.assert_admin_canary_user(p_run_id,f.label,false) and f.registered_at is null then
   update private.admin_canary_fixture_users set registered_at=clock_timestamp() where run_id=p_run_id and label=f.label;
  end if;
 end loop;
 -- Foreign authority is neither adopted nor revoked. The run lock held here
 -- fences every future active write until this transaction closes or aborts.
 if exists(select 1 from public.platform_role_memberships m join private.admin_canary_fixture_users f
   on f.user_id::text=m.user_id where f.run_id=p_run_id and m.status='active'
   and not exists(select 1 from private.admin_canary_fixture_roles x where x.run_id=p_run_id and x.role_id=m.id))
  or exists(select 1 from public.platform_staff_permission_grants g join private.admin_canary_fixture_users f
   on f.user_id::text=g.target_user_id where f.run_id=p_run_id and g.status='active'
   and not exists(select 1 from private.admin_canary_fixture_grants x where x.run_id=p_run_id and x.grant_id=g.id)) then
  raise exception 'admin_canary_unregistered_authority';
 end if;
 metadata:=jsonb_build_object('canary_proof',true,'canary_proof_run_id',p_run_id,'cleanup_required',false,
  'original_actor_user_id',r.actor_user_id,'purpose','exact_canary_cleanup');
 stamp:=clock_timestamp();
 for item in select * from private.admin_canary_fixture_roles where run_id=p_run_id order by role_id loop
  select * into m from public.platform_role_memberships where id=item.role_id for update;
  if not found or m.user_id is distinct from item.user_id::text or m.role is distinct from item.role
   or m.email is distinct from (select email from private.admin_canary_fixture_users where run_id=p_run_id and label=item.label)
   or m.expires_at is distinct from r.deadline or m.granted_by is distinct from 'admin-owner-controls-canary' then
   raise exception 'admin_canary_fixture_changed'; end if;
  if m.status='active' then
   if r.status='closed' then raise exception 'admin_canary_cleanup_unverified'; end if;
   update public.platform_role_memberships set status='revoked',notes=p_reason,revoked_at=stamp,
    revoked_by='admin-owner-controls-canary',updated_at=stamp where id=m.id;
   insert into public.platform_staff_role_audit(actor_role,target_user_id,target_email,action,role,reason,metadata)
   values('system',m.user_id,m.email,'revoke',m.role,p_reason,metadata);
   role_count:=role_count+1;
  end if;
 end loop;
 for item in select * from private.admin_canary_fixture_grants where run_id=p_run_id order by grant_id loop
  select * into g from public.platform_staff_permission_grants where id=item.grant_id for update;
  if not found or g.target_user_id is distinct from item.user_id::text or g.permission_key is distinct from item.permission_key
   or g.target_email is distinct from (select email from private.admin_canary_fixture_users where run_id=p_run_id and label=item.label)
   or g.expires_at is distinct from r.deadline or g.granted_by is distinct from 'admin-owner-controls-canary'
   or g.metadata->>'canary_proof_run_id' is distinct from p_run_id::text then
   raise exception 'admin_canary_fixture_changed'; end if;
  if g.status='active' then
   if r.status='closed' then raise exception 'admin_canary_cleanup_unverified'; end if;
   update public.platform_staff_permission_grants set status='revoked',reason=p_reason,revoked_at=stamp,
    revoked_by='admin-owner-controls-canary',updated_at=stamp where id=g.id;
   insert into public.platform_staff_permission_audit(actor_role,target_user_id,target_email,permission_key,action,reason,metadata)
   values('system',g.target_user_id,g.target_email,g.permission_key,'revoke',p_reason,metadata);
   grant_count:=grant_count+1;
  end if;
 end loop;
 if exists(select 1 from public.platform_role_memberships m join private.admin_canary_fixture_roles x on x.role_id=m.id
   where x.run_id=p_run_id and m.status='active')
  or exists(select 1 from public.platform_staff_permission_grants g join private.admin_canary_fixture_grants x on x.grant_id=g.id
   where x.run_id=p_run_id and g.status='active') then raise exception 'admin_canary_cleanup_unverified'; end if;
 if r.status='closed' then return r.cleanup_receipt||private.admin_canary_manifest(p_run_id); end if;
 insert into public.security_audit_events(actor_role,event_type,severity,target_type,target_id,reason,metadata)
 values('system','admin_canary_fixture_cleanup','high','admin_canary_run',p_run_id::text,p_reason,
  metadata||jsonb_build_object('revoked_role_count',role_count,'revoked_grant_count',grant_count));
 result:=jsonb_build_object('ok',true,'runId',p_run_id,'status','closed','activeCount',0,
  'revokedRoleCount',role_count,'revokedGrantCount',grant_count,'closedAt',stamp);
 update private.admin_canary_fixture_runs set status='closed',closed_at=stamp,cleanup_receipt=result where run_id=p_run_id;
 return result||private.admin_canary_manifest(p_run_id);
end $$;

revoke all on function private.preserve_admin_mutation_identity(),private.guard_admin_canary_authority(),
 private.guard_admin_canary_auth_insert(),private.assert_admin_mutation_actor(boolean),
 private.lock_admin_mutation_actor(),private.assert_owner_security_context(uuid,uuid,text),
 private.assert_admin_canary_user(uuid,text,boolean),private.admin_canary_manifest(uuid)
 from public,anon,authenticated,service_role;
revoke all on function public.owner_security_revoke_grants(uuid,text,uuid,text,uuid,uuid),
 public.begin_admin_canary_run(uuid),public.provision_admin_canary_fixture(uuid,text,text,text),
 public.list_admin_canary_pending_runs(),
 public.register_admin_canary_user(uuid,text,uuid),public.read_admin_canary_manifest(uuid),
 public.cleanup_admin_canary_run(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.owner_security_revoke_grants(uuid,text,uuid,text,uuid,uuid),
 public.begin_admin_canary_run(uuid),public.provision_admin_canary_fixture(uuid,text,text,text) to authenticated;
grant execute on function public.list_admin_canary_pending_runs() to authenticated;
grant execute on function public.register_admin_canary_user(uuid,text,uuid),
 public.read_admin_canary_manifest(uuid),public.cleanup_admin_canary_run(uuid,text) to service_role;
commit;
