-- Disabled source protocol. An old object-delete is NOT whole-content intent.
-- Orphan cleanup has its own permanent claim and never creates a snapshot.
-- Most locator documents have no encoded ASCII. Avoid a character-by-character
-- walk over every unrelated JSON document in the real reference inventory.
create or replace function private.deleted_media_normalize_locator(p_text text) returns text
language plpgsql immutable set search_path='' as $$
declare result text:=coalesce(p_text,''); next_value text; pass integer;
begin
 if result !~ '%[0-9A-Fa-f]{2}' then return result; end if;
 for pass in 1..4 loop
   -- Tokenize a whole pass at once. Sequential replace() would incorrectly
   -- decode nested escapes twice per pass and change the reference contract.
   select string_agg(case when token[1] ~ '^%[0-9A-Fa-f]{2}$' then
       case when get_byte(decode(substr(token[1],2),'hex'),0) between 32 and 126
         then chr(get_byte(decode(substr(token[1],2),'hex'),0)) else token[1] end
       else token[1] end,'' order by ordinal)
     into next_value from regexp_matches(result,'(%[0-9A-Fa-f]{2}|[^%]+|%)','g') with ordinality as parts(token,ordinal);
   next_value:=coalesce(next_value,'');
   exit when next_value=result; result:=next_value;
 end loop;
 return result;
end $$;

alter table private.deleted_media_key_retirements
 drop constraint deleted_media_key_retirements_status_check,
 drop constraint deleted_media_key_retirements_check1,
 drop constraint deleted_media_key_retirements_check2;
alter table private.deleted_media_key_retirements
 add constraint deleted_media_retirement_status check(status in ('staged','retained','claimed','cleanup_claimed')),
 add constraint deleted_media_retirement_clock check(
   (status in ('staged','cleanup_claimed') and deletion_id is null and deleted_at is null and expires_at is null) or
   (status in ('retained','claimed') and deletion_id is not null and expires_at=deleted_at+interval '720 hours')),
 add constraint deleted_media_retirement_claim_clock check(
   (status in ('claimed','cleanup_claimed'))=(claimed_at is not null));

create or replace function private.deleted_media_preserve_identity() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'retirement_tombstone_permanent'; end if;
 if (to_jsonb(new)-array['status','deletion_id','deleted_at','expires_at','claimed_at','inspection_proof','inspection_proof_fingerprint'])
     is distinct from (to_jsonb(old)-array['status','deletion_id','deleted_at','expires_at','claimed_at','inspection_proof','inspection_proof_fingerprint'])
    or (old.status in ('claimed','cleanup_claimed') and to_jsonb(new) is distinct from to_jsonb(old))
    or (old.status='retained' and new.status not in ('retained','claimed'))
    or (new.status='cleanup_claimed' and old.status not in ('staged','cleanup_claimed'))
    or ((new.inspection_proof,new.inspection_proof_fingerprint) is distinct from (old.inspection_proof,old.inspection_proof_fingerprint)
      and not (old.status='staged' and new.status='retained'))
    or (old.deletion_id is not null and (new.deletion_id,new.deleted_at,new.expires_at)
      is distinct from (old.deletion_id,old.deleted_at,old.expires_at)) then
   raise exception 'retirement_identity_immutable';
 end if;
 return new;
end $$;

-- A cleanup claim is deliberately not a retained deletion and must never enter
-- the archive-expiry or inspection authority paths.
create or replace function private.deleted_media_retirement_binding(p_stage_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.deleted_media_key_retirements%rowtype;
begin
 select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id;
 if current_setting('transaction_isolation')<>'read committed' or r.id is null
   or r.status not in ('retained','claimed') or not private.deleted_media_reference_coverage_ready() then
   return jsonb_build_object('supported',false,'reason','unfinalized_or_uncovered_key_class'); end if;
 return jsonb_build_object('supported',true,'provider',r.provider,'bucket',r.bucket,'objectKey',r.object_key,
  'targetType',r.target_type,'targetId',r.target_id,'author',r.author,'retirementId',r.id,'status',r.status,
  'expiresAt',r.expires_at,'deletionId',r.deletion_id,'guarantee','logical_key_retirement_best_effort_physical_cleanup');
end $$;

create table private.deleted_content_stage_cleanup_claims (
 id uuid primary key default gen_random_uuid(), stage_id uuid not null unique,
 retirement_id uuid not null unique, target_type text not null,target_id text not null,
 author text not null,parent_type text,parent_id text,
 provider text not null check(provider='cloudflare_r2'),
 bucket text not null check(bucket='chillywood-media-origin'),object_key text not null,
 claimed_at timestamptz not null default clock_timestamp(),
 last_attempt_at timestamptz,last_observed_absent_at timestamptz,
 next_check_at timestamptz not null default clock_timestamp(),
 unique(provider,bucket,object_key)
);
alter table private.deleted_content_stage_cleanup_claims enable row level security;
alter table private.deleted_content_stage_cleanup_claims force row level security;
revoke all on private.deleted_content_stage_cleanup_claims from public,anon,authenticated,service_role;
create function private.preserve_deleted_stage_cleanup_claim() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'cleanup_claim_permanent'; end if;
 if (to_jsonb(new)-array['last_attempt_at','last_observed_absent_at','next_check_at'])
    is distinct from (to_jsonb(old)-array['last_attempt_at','last_observed_absent_at','next_check_at']) then
   raise exception 'cleanup_claim_identity_immutable';
 end if;
 return new;
end $$;
create trigger preserve_deleted_stage_cleanup_claim before update or delete
 on private.deleted_content_stage_cleanup_claims for each row
 execute function private.preserve_deleted_stage_cleanup_claim();

-- Include orphan claims in the SAME legal-hold serialization boundary.
create or replace function private.deleted_content_legal_hold_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not private.deleted_media_reference_fence_armed() then return new; end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000';
 end if;
 perform pg_advisory_xact_lock(176214,30);
 if new.status='active' and (
   exists(select 1 from private.deleted_content_expiry_claims c where
     private.deleted_content_hold_matches(new.target_type,new.target_id,c.target_type,c.target_id,c.author,c.parent_type,c.parent_id))
   or exists(select 1 from private.deleted_content_media_expiry_claims c where
     private.deleted_content_hold_matches(new.target_type,new.target_id,c.target_type,c.target_id,c.author,c.parent_type,c.parent_id))
   or exists(select 1 from private.deleted_content_stage_cleanup_claims c where
     private.deleted_content_hold_matches(new.target_type,new.target_id,c.target_type,c.target_id,c.author,c.parent_type,c.parent_id))
 ) then raise exception 'retention_preservation_unavailable_deletion_already_claimed' using errcode='55000'; end if;
 if exists(select 1 from private.deleted_content_retention_settings where capture_enabled)
   or exists(select 1 from private.deleted_content_expiry_claims)
   or exists(select 1 from private.deleted_content_media_expiry_claims)
   or exists(select 1 from private.deleted_content_stage_cleanup_claims) then
   insert into private.deleted_content_retention_events(operation,target_type,target_id,actor)
     values('hold_change',new.target_type,new.target_id,coalesce(new.released_by_user_id,new.placed_by_user_id));
 end if;
 return new;
end $$;

create or replace function private.guard_deleted_media_references() returns trigger
language plpgsql security definer set search_path='' as $$
declare r private.deleted_media_key_retirements%rowtype; doc jsonb; old_doc jsonb;
begin
 if not private.deleted_media_reference_fence_armed() then return new; end if;
 perform pg_catalog.pg_advisory_xact_lock(176214,30);
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'retirement_read_committed_required' using errcode='25000'; end if;
 doc:=private.deleted_media_locator_document(to_jsonb(new),tg_relid);
 if tg_op='UPDATE' then old_doc:=private.deleted_media_locator_document(to_jsonb(old),tg_relid); end if;
 for r in select * from private.deleted_media_key_retirements where status in ('retained','claimed','cleanup_claimed') loop
   if private.deleted_media_mentions(doc,r.object_key) then
     if r.status='retained' and tg_op='UPDATE' and doc=old_doc
       and private.deleted_media_reference_identity(to_jsonb(new))
         =private.deleted_media_reference_identity(to_jsonb(old)) then continue; end if;
     raise exception 'media_key_retired_reference_forbidden' using errcode='55000';
   end if;
 end loop;
 return new;
end $$;

create or replace function public.check_deleted_media_retirement(p_provider text,p_bucket text,p_object_key text,p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.deleted_media_key_retirements%rowtype;
begin
 if not private.deleted_media_reference_fence_armed() then
   return jsonb_build_object('allowed',coalesce(p_purpose in ('upload','read','inspection','publish'),false));
 end if;
 perform pg_catalog.pg_advisory_xact_lock(176214,30);
 if current_setting('transaction_isolation')<>'read committed' then return jsonb_build_object('allowed',false); end if;
 if p_purpose not in ('upload','read','inspection','publish') then return jsonb_build_object('allowed',false); end if;
 select * into r from private.deleted_media_key_retirements
   where object_key=p_object_key and status in ('retained','claimed','cleanup_claimed') limit 1;
 if r.id is null then return jsonb_build_object('allowed',true); end if;
 if p_provider is distinct from r.provider or p_bucket is distinct from r.bucket or r.status in ('claimed','cleanup_claimed') then
   return jsonb_build_object('allowed',false); end if;
 return jsonb_build_object('allowed',p_purpose='inspection' and clock_timestamp()<r.expires_at,'expiresAt',r.expires_at);
end $$;

create or replace function public.reconcile_deleted_content_stage(p_stage_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.deleted_content_media_stages%rowtype; r private.deleted_media_key_retirements%rowtype;
 c private.deleted_content_stage_cleanup_claims%rowtype; v jsonb; parent_kind text; parent_key text;
begin
 if not exists(select 1 from private.deleted_content_retention_settings where media_expiry_enabled) then
   return jsonb_build_object('status','disabled'); end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000'; end if;
 if not private.deleted_media_reference_fence_armed() then raise exception 'retirement_fence_not_armed'; end if;
 perform pg_advisory_xact_lock(176214,30);
 begin
   select * into s from private.deleted_content_media_stages where id=p_stage_id for update nowait;
   select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id for update nowait;
 exception when lock_not_available then return jsonb_build_object('status','source_busy');
 end;
 if s.id is null then return jsonb_build_object('status','absent'); end if;
 if r.id is null or (r.provider,r.bucket,r.object_key,r.reservation_id,r.target_type,r.target_id,r.author)
   is distinct from (s.provider,s.bucket,s.object_key,s.reservation_id,s.target_type,s.target_id,s.author) then
   return jsonb_build_object('status','original_provenance_required'); end if;
 -- Stage.deletion_id alone is not finalization: old versions linked replaced
 -- keys to a later parent deletion even though the registry correctly refused.
 if r.status in ('retained','claimed') then return jsonb_build_object('status','finalized'); end if;
 select * into c from private.deleted_content_stage_cleanup_claims where stage_id=s.id;
 if r.status='cleanup_claimed' then
   if c.id is null then raise exception 'cleanup_claim_missing'; end if;
   return jsonb_build_object('status','claimed','claimId',c.id);
 end if;
 if s.reconcile_after>clock_timestamp() then return jsonb_build_object('status','not_due'); end if;
 -- Lock writers hold source before advisory. NOWAIT prevents inverse-order
 -- deadlocks and lets their commit/rollback determine the next bounded retry.
 begin
   if s.target_type='creator_video' then
     select to_jsonb(x) into v from public.videos x where id::text=s.target_id for update nowait;
   else
     select to_jsonb(x) into v from public.social_attachments x where id::text=s.target_id for update nowait;
   end if;
 exception when lock_not_available then return jsonb_build_object('status','source_busy');
 end;
 if v is not null and private.deleted_media_mentions(v,s.object_key) then
   return jsonb_build_object('status','attached_requires_explicit_content_delete','retainedContent',false,'automaticRepairAllowed',false);
 end if;
 -- Canonical social keys were validated at registration against the original
 -- parent. Decode only that immutable exact key, never the replacement row.
 if r.target_type='social_attachment' then
   parent_kind:=split_part(r.object_key,'/',2); parent_key:=split_part(r.object_key,'/',3);
   if split_part(r.object_key,'/',1)<>r.author or parent_kind !~ '^[a-z_]+$'
     or parent_key !~ '^[0-9a-f-]{36}$'
     or r.object_key !~ ('^'||r.author||'/'||parent_kind||'/'||parent_key||'/'||r.target_id||'\.[a-z0-9]{1,10}$') then
     return jsonb_build_object('status','original_parent_provenance_required');
   end if;
 end if;
 if exists(select 1 from public.legal_holds h where h.status='active' and
   private.deleted_content_hold_matches(h.target_type,h.target_id,r.target_type,r.target_id,r.author,parent_kind,parent_key)) then
   return jsonb_build_object('status','held'); end if;
 if not private.deleted_media_reference_coverage_ready() or private.deleted_media_has_live_reference(s.id) then
   return jsonb_build_object('status','unsupported_or_live_reference'); end if;
 update private.deleted_media_key_retirements set status='cleanup_claimed',claimed_at=clock_timestamp() where id=r.id;
 insert into private.deleted_content_stage_cleanup_claims(stage_id,retirement_id,target_type,target_id,author,parent_type,parent_id,provider,bucket,object_key)
   values(s.id,r.id,r.target_type,r.target_id,r.author,parent_kind,parent_key,r.provider,r.bucket,r.object_key) returning * into c;
 insert into private.deleted_content_retention_events(operation,target_type,target_id,actor)
   values('reconcile',r.target_type,r.target_id,'service:stage_cleanup_claim');
 return jsonb_build_object('status','claimed','claimId',c.id,'retainedContent',false);
end $$;

create function public.read_deleted_content_stage_cleanup_claim(p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.deleted_content_stage_cleanup_claims%rowtype; r private.deleted_media_key_retirements%rowtype;
begin
 if not exists(select 1 from private.deleted_content_retention_settings where media_expiry_enabled) then
   return jsonb_build_object('status','disabled'); end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000'; end if;
 perform private.deleted_media_reference_fence_armed();
 perform pg_advisory_xact_lock(176214,30);
 select * into c from private.deleted_content_stage_cleanup_claims where id=p_claim_id for update;
 if c.id is null then return jsonb_build_object('status','absent'); end if;
 select * into r from private.deleted_media_key_retirements where id=c.retirement_id;
 if r.id is null or r.status<>'cleanup_claimed'
   or (r.stage_id,r.provider,r.bucket,r.object_key,r.target_type,r.target_id,r.author)
     is distinct from (c.stage_id,c.provider,c.bucket,c.object_key,c.target_type,c.target_id,c.author)
   or not private.deleted_media_reference_coverage_ready()
   or private.deleted_media_has_live_reference(c.stage_id) then
   return jsonb_build_object('status','retirement_proof_changed'); end if;
 update private.deleted_content_stage_cleanup_claims
   set last_attempt_at=clock_timestamp(),next_check_at=clock_timestamp()+interval '1 minute' where id=c.id;
 return jsonb_build_object('status','authorized','claimId',c.id,'provider',c.provider,'bucket',c.bucket,'objectKey',c.object_key);
end $$;

create function public.record_deleted_content_stage_cleanup_result(p_claim_id uuid,p_result text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.deleted_content_stage_cleanup_claims%rowtype;
begin
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000'; end if;
 if p_result not in ('observed_absent','delete_acknowledged','failed') then raise exception 'invalid_cleanup_result'; end if;
 perform private.deleted_media_reference_fence_armed();
 perform pg_advisory_xact_lock(176214,30);
 select * into c from private.deleted_content_stage_cleanup_claims where id=p_claim_id for update;
 if c.id is null then raise exception 'cleanup_claim_required'; end if;
 update private.deleted_content_stage_cleanup_claims
 set last_observed_absent_at=case when p_result='observed_absent' then clock_timestamp() else last_observed_absent_at end,
     next_check_at=clock_timestamp()+case when p_result='observed_absent' then interval '1 day' else interval '1 minute' end
 where id=c.id;
 insert into private.deleted_content_retention_events(operation,target_type,target_id,actor)
   values('media_cleanup_receipt',c.target_type,c.target_id,'service:stage_cleanup');
 return jsonb_build_object('status',p_result,'permanentlyAbsent',false);
end $$;

create function public.list_deleted_content_stage_cleanup_work() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ids uuid[];
begin
 if not exists(select 1 from private.deleted_content_retention_settings where media_expiry_enabled) then
   return jsonb_build_object('enabled',false,'stageIds','[]'::jsonb); end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000'; end if;
 perform pg_advisory_xact_lock(176214,31);
 select array_agg(id) into ids from (
   select s.id from private.deleted_content_media_stages s
   join private.deleted_media_key_retirements r on r.stage_id=s.id and r.status in ('staged','cleanup_claimed')
   left join private.deleted_content_stage_cleanup_claims c on c.stage_id=s.id
   left join private.deleted_content_work_dispatch q on q.kind='stage' and q.work_id=s.id
   where s.reconcile_after<=clock_timestamp() and (c.id is null or c.next_check_at<=clock_timestamp())
     and (q.work_id is null or q.next_attempt_at<=clock_timestamp())
   order by greatest(coalesce(q.next_attempt_at,s.reconcile_after),coalesce(c.next_check_at,s.reconcile_after)),s.id limit 20
 ) work;
 insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at)
   select 'stage',unnest(ids),clock_timestamp()+interval '1 minute'
   on conflict(kind,work_id) do update set next_attempt_at=excluded.next_attempt_at;
 return jsonb_build_object('enabled',true,'stageIds',coalesce(to_jsonb(ids),'[]'::jsonb));
end $$;
revoke all on function private.preserve_deleted_stage_cleanup_claim() from public,anon,authenticated,service_role;
revoke all on function public.read_deleted_content_stage_cleanup_claim(uuid),
 public.record_deleted_content_stage_cleanup_result(uuid,text),public.list_deleted_content_stage_cleanup_work() from public,anon,authenticated;
grant execute on function public.read_deleted_content_stage_cleanup_claim(uuid),
 public.record_deleted_content_stage_cleanup_result(uuid,text),public.list_deleted_content_stage_cleanup_work() to service_role;

-- Stage dispatch belongs exclusively to the cleanup queue above. The old text
-- queue must not lease a stage and starve its provider-processing pass.
create or replace function public.list_deleted_content_expiry_work() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ids uuid[];
begin
 if not exists(select 1 from private.deleted_content_retention_settings where text_expiry_enabled) then
   return jsonb_build_object('enabled',false,'deletionIds','[]'::jsonb,'stageIds','[]'::jsonb); end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000'; end if;
 perform pg_advisory_xact_lock(176214,31);
 select array_agg(id) into ids from (
   select r.id from private.deleted_content_records r
   left join private.deleted_content_work_dispatch q on q.kind='text' and q.work_id=r.id
   where r.expires_at<=clock_timestamp() and (q.work_id is null or q.next_attempt_at<=clock_timestamp())
   order by coalesce(q.next_attempt_at,r.expires_at),r.id limit 20
 ) work;
 insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at)
   select 'text',unnest(ids),clock_timestamp()+interval '1 minute'
   on conflict(kind,work_id) do update set next_attempt_at=excluded.next_attempt_at;
 return jsonb_build_object('enabled',true,'deletionIds',coalesce(to_jsonb(ids),'[]'::jsonb),'stageIds','[]'::jsonb);
end $$;

create or replace function public.list_deleted_content_media_expiry_work() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ids uuid[];
begin
 if not exists(select 1 from private.deleted_content_retention_settings where media_expiry_enabled) then
   return jsonb_build_object('enabled',false,'stageIds','[]'::jsonb); end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000'; end if;
 perform pg_advisory_xact_lock(176214,31);
 select array_agg(id) into ids from (
  select s.id from private.deleted_content_media_stages s
  join private.deleted_media_key_retirements registry on registry.stage_id=s.id
    and registry.status in ('retained','claimed') and registry.deletion_id=s.deletion_id
  join private.deleted_content_records r on r.id=s.deletion_id
  left join private.deleted_content_media_expiry_claims c on c.stage_id=s.id
  left join private.deleted_content_work_dispatch q on q.kind='media' and q.work_id=s.id
  where r.expires_at<=clock_timestamp() and (c.id is null or c.next_check_at<=clock_timestamp())
    and (q.work_id is null or q.next_attempt_at<=clock_timestamp())
  order by greatest(coalesce(q.next_attempt_at,r.expires_at),coalesce(c.next_check_at,r.expires_at)),s.id limit 20
 ) work;
 insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at)
   select 'media',unnest(ids),clock_timestamp()+interval '1 minute'
   on conflict(kind,work_id) do update set next_attempt_at=excluded.next_attempt_at;
 return jsonb_build_object('enabled',true,'stageIds',coalesce(to_jsonb(ids),'[]'::jsonb));
end $$;
