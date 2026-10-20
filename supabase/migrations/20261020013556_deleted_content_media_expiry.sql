-- SOURCE ONLY. Permanent reference retirement, not assumed provider versioning.
-- Depends at runtime on the separately reviewed retirement/admission guards.
-- No cron, provider setting or activation is installed by this migration.
alter table private.deleted_content_retention_settings add column media_expiry_enabled boolean not null default false;
alter table private.deleted_content_retention_settings add check(not media_expiry_enabled or (activation_ready and capture_enabled and media_staging_enabled));
alter table private.deleted_content_retention_events drop constraint deleted_content_retention_events_operation_check;
alter table private.deleted_content_retention_events add check(operation in
 ('capture','stage','finalize','hold_change','claim','purge','reconcile','media_claim','media_cleanup_receipt'));
create table private.deleted_content_media_expiry_claims (
 id uuid primary key default gen_random_uuid(), stage_id uuid not null unique,
 deletion_id uuid not null, target_type text not null,target_id text not null,
 author text not null,parent_type text,parent_id text,
 provider text not null,bucket text not null,object_key text not null,
 claimed_at timestamptz not null default clock_timestamp(),
 last_attempt_at timestamptz,last_observed_absent_at timestamptz,
 next_check_at timestamptz not null default clock_timestamp(),
 unique(provider,bucket,object_key)
);
alter table private.deleted_content_media_expiry_claims enable row level security;
alter table private.deleted_content_media_expiry_claims force row level security;
revoke all on private.deleted_content_media_expiry_claims from public,anon,authenticated,service_role;

create or replace function private.deleted_content_legal_hold_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000';
 end if;
 perform pg_advisory_xact_lock(176214,30);
 if new.status='active' and (
   exists(select 1 from private.deleted_content_expiry_claims c where
     private.deleted_content_hold_matches(new.target_type,new.target_id,c.target_type,c.target_id,c.author,c.parent_type,c.parent_id))
   or exists(select 1 from private.deleted_content_media_expiry_claims c where
     private.deleted_content_hold_matches(new.target_type,new.target_id,c.target_type,c.target_id,c.author,c.parent_type,c.parent_id))
 ) then raise exception 'retention_preservation_unavailable_deletion_already_claimed' using errcode='55000'; end if;
 if exists(select 1 from private.deleted_content_retention_settings where capture_enabled)
   or exists(select 1 from private.deleted_content_expiry_claims)
   or exists(select 1 from private.deleted_content_media_expiry_claims) then
   insert into private.deleted_content_retention_events(operation,target_type,target_id,actor)
     values('hold_change',new.target_type,new.target_id,coalesce(new.released_by_user_id,new.placed_by_user_id));
 end if;
 return new;
end $$;

-- Snapshot bodies may only be cleared after an irrevocable, hold-serialized
-- expiry claim. No identity, timestamps or replacement body can be edited.
create or replace function private.deleted_content_immutable() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='deleted_content_records' and tg_op='UPDATE' then
   if new.content is null and old.expires_at<=clock_timestamp()
     and (to_jsonb(new)-'content')=(to_jsonb(old)-'content')
     and exists(select 1 from private.deleted_content_media_expiry_claims c where c.deletion_id=old.id) then
     return new;
   end if;
 end if;
 raise exception 'deleted_content_immutable' using errcode='42501';
end $$;

create function public.claim_deleted_content_media_expiry(p_stage_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.deleted_content_media_stages%rowtype; r private.deleted_content_records%rowtype;
 c private.deleted_content_media_expiry_claims%rowtype; binding jsonb;
begin
 if not exists(select 1 from private.deleted_content_retention_settings where media_expiry_enabled) then return jsonb_build_object('status','disabled'); end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000';
 end if;
 perform pg_advisory_xact_lock(176214,30);
 select * into s from private.deleted_content_media_stages where id=p_stage_id for update;
 if s.id is null or s.deletion_id is null then return jsonb_build_object('status','not_finalized'); end if;
 select * into r from private.deleted_content_records where id=s.deletion_id for update;
 if r.id is null then return jsonb_build_object('status','missing_deletion_record'); end if;
 if r.expires_at>clock_timestamp() then return jsonb_build_object('status','not_due'); end if;
 if exists(select 1 from public.legal_holds h where h.status='active' and
   private.deleted_content_hold_matches(h.target_type,h.target_id,r.target_type,r.target_id,r.author,r.parent_type,r.parent_id)) then
   return jsonb_build_object('status','held');
 end if;
 -- Missing helpers or incomplete guard coverage never authorize provider calls.
 if to_regprocedure('private.deleted_media_retirement_binding(uuid)') is null
   or to_regprocedure('private.deleted_media_has_live_reference(uuid)') is null
   or to_regprocedure('private.claim_deleted_media_retirement(uuid)') is null then
   return jsonb_build_object('status','retirement_protocol_unavailable');
 end if;
 binding:=private.deleted_media_retirement_binding(p_stage_id);
 if binding->>'supported' is distinct from 'true'
   or binding->>'provider' is distinct from s.provider
   or binding->>'bucket' is distinct from s.bucket
   or binding->>'objectKey' is distinct from s.object_key
   or private.deleted_media_has_live_reference(p_stage_id) then
   return jsonb_build_object('status','unsupported_or_live_reference');
 end if;
 if not private.claim_deleted_media_retirement(p_stage_id) then
   return jsonb_build_object('status','retirement_claim_denied');
 end if;
 select * into c from private.deleted_content_media_expiry_claims where stage_id=p_stage_id for update;
 if c.id is null then
   insert into private.deleted_content_media_expiry_claims(stage_id,deletion_id,target_type,target_id,author,parent_type,parent_id,provider,bucket,object_key)
    values(s.id,r.id,r.target_type,r.target_id,r.author,r.parent_type,r.parent_id,s.provider,s.bucket,s.object_key) returning * into c;
   insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
    values('media_claim',r.target_type,r.target_id,r.id,'service:retention_expiry');
   update private.deleted_content_records set content=null where id=r.id;
 end if;
 return jsonb_build_object('status','claimed','claimId',c.id);
end $$;

create function public.read_deleted_content_media_expiry_claim(p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.deleted_content_media_expiry_claims%rowtype; binding jsonb;
begin
 if not exists(select 1 from private.deleted_content_retention_settings where media_expiry_enabled) then return jsonb_build_object('status','disabled'); end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000';
 end if;
 perform pg_advisory_xact_lock(176214,30);
 select * into c from private.deleted_content_media_expiry_claims where id=p_claim_id for update;
 if c.id is null then return jsonb_build_object('status','absent'); end if;
 binding:=private.deleted_media_retirement_binding(c.stage_id);
 if binding->>'supported' is distinct from 'true' or binding->>'provider' is distinct from c.provider
   or binding->>'bucket' is distinct from c.bucket or binding->>'objectKey' is distinct from c.object_key
   or private.deleted_media_has_live_reference(c.stage_id)
   or not private.claim_deleted_media_retirement(c.stage_id) then
   return jsonb_build_object('status','retirement_proof_changed');
 end if;
 update private.deleted_content_media_expiry_claims set last_attempt_at=clock_timestamp(),next_check_at=clock_timestamp()+interval '1 minute' where id=c.id;
 return jsonb_build_object('status','authorized','claimId',c.id,'provider',c.provider,'bucket',c.bucket,'objectKey',c.object_key);
end $$;

create function public.record_deleted_content_media_expiry_result(p_claim_id uuid,p_result text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.deleted_content_media_expiry_claims%rowtype;
begin
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000';
 end if;
 if p_result not in ('observed_absent','delete_acknowledged','failed') then raise exception 'invalid_cleanup_result'; end if;
 perform pg_advisory_xact_lock(176214,30);
 select * into c from private.deleted_content_media_expiry_claims where id=p_claim_id for update;
 if c.id is null then raise exception 'cleanup_claim_required'; end if;
 update private.deleted_content_media_expiry_claims
 set last_observed_absent_at=case when p_result='observed_absent' then clock_timestamp() else last_observed_absent_at end,
     next_check_at=clock_timestamp()+case when p_result='observed_absent' then interval '1 day' else interval '1 minute' end
 where id=c.id;
 insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
 values('media_cleanup_receipt',c.target_type,c.target_id,c.deletion_id,'service:retention_expiry');
 -- A late pre-retirement PUT may still settle. A 404 is an observation, never a
 -- claim that all future bytes are impossible. Tombstone and repeat cleanup stay.
 return jsonb_build_object('status',p_result,'permanentlyAbsent',false);
end $$;

create function public.list_deleted_content_media_expiry_work() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ids uuid[];
begin
 if not exists(select 1 from private.deleted_content_retention_settings where media_expiry_enabled) then
   return jsonb_build_object('enabled',false,'stageIds','[]'::jsonb);
 end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000';
 end if;
 perform pg_advisory_xact_lock(176214,31);
 select array_agg(id) into ids from (
  select s.id from private.deleted_content_media_stages s join private.deleted_content_records r on r.id=s.deletion_id
  left join private.deleted_content_media_expiry_claims c on c.stage_id=s.id
  left join private.deleted_content_work_dispatch q on q.kind='media' and q.work_id=s.id
  where r.expires_at<=clock_timestamp() and (c.id is null or c.next_check_at<=clock_timestamp())
    and (q.work_id is null or q.next_attempt_at<=clock_timestamp())
  order by greatest(coalesce(q.next_attempt_at,r.expires_at),coalesce(c.next_check_at,r.expires_at)),s.id limit 20
 ) x;
 insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at)
 select 'media',unnest(ids),clock_timestamp()+interval '1 minute'
 on conflict(kind,work_id) do update set next_attempt_at=excluded.next_attempt_at;
 return jsonb_build_object('enabled',true,'stageIds',coalesce(to_jsonb(ids),'[]'::jsonb));
end $$;
revoke all on function public.claim_deleted_content_media_expiry(uuid),public.read_deleted_content_media_expiry_claim(uuid),
 public.record_deleted_content_media_expiry_result(uuid,text),public.list_deleted_content_media_expiry_work() from public,anon,authenticated;
grant execute on function public.claim_deleted_content_media_expiry(uuid),public.read_deleted_content_media_expiry_claim(uuid),
 public.record_deleted_content_media_expiry_result(uuid,text),public.list_deleted_content_media_expiry_work() to service_role;
