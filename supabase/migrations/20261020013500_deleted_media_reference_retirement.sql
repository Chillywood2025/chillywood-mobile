-- SOURCE CONTRACT ONLY: no activation, provider request, archive copy or schedule.
-- R2 private-origin canonical originals only. Trusted provider/DB administrators
-- and configuration changes are outside this application protocol's boundary.
-- Retirement prevents legitimate key reuse; late writes can remain physically
-- present until best-effort cleanup. No exact-byte deletion deadline is claimed.
create table private.deleted_media_key_retirements (
 id uuid primary key default gen_random_uuid(),
 stage_id uuid not null unique,
 provider text not null check(provider='cloudflare_r2'),
 bucket text not null check(bucket='chillywood-media-origin'),
 object_key text not null,
 target_type text not null check(target_type in ('creator_video','social_attachment')),
 target_id text not null, author text not null,
 reservation_id uuid not null, verified_at timestamptz not null, attached_at timestamptz not null,
 source_created_at text,
 staged_inspection_proof jsonb, inspection_proof jsonb, inspection_proof_fingerprint text,
 check((inspection_proof is null and inspection_proof_fingerprint is null) or
   (inspection_proof is not null and inspection_proof_fingerprint is not null and inspection_proof_fingerprint=md5(inspection_proof::text))),
 status text not null default 'staged' check(status in ('staged','retained','claimed')),
 deletion_id uuid, deleted_at timestamptz, expires_at timestamptz, claimed_at timestamptz,
 unique(provider,bucket,object_key),
 check((status='staged' and deletion_id is null) or
   (status in ('retained','claimed') and deletion_id is not null and expires_at=deleted_at+interval '720 hours')),
 check((status='claimed')=(claimed_at is not null))
);
-- Deliberately no foreign keys: account/source/archive cleanup must not remove
-- provenance or the permanent retired key tombstone.
alter table private.deleted_media_key_retirements enable row level security;
alter table private.deleted_media_key_retirements force row level security;
revoke all on private.deleted_media_key_retirements from public,anon,authenticated,service_role;

create function private.deleted_media_preserve_identity() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'retirement_tombstone_permanent'; end if;
 if (to_jsonb(new)-array['status','deletion_id','deleted_at','expires_at','claimed_at','inspection_proof','inspection_proof_fingerprint'])
     is distinct from (to_jsonb(old)-array['status','deletion_id','deleted_at','expires_at','claimed_at','inspection_proof','inspection_proof_fingerprint'])
    or (old.status='claimed' and to_jsonb(new) is distinct from to_jsonb(old))
    or (old.status='retained' and new.status='staged')
    or ((new.inspection_proof,new.inspection_proof_fingerprint) is distinct from (old.inspection_proof,old.inspection_proof_fingerprint)
      and not (old.status='staged' and new.status='retained'))
    or (old.deletion_id is not null and (new.deletion_id,new.deleted_at,new.expires_at)
      is distinct from (old.deletion_id,old.deleted_at,old.expires_at)) then
   raise exception 'retirement_identity_immutable';
 end if;
 return new;
end $$;
create trigger deleted_media_preserve_identity before update or delete on private.deleted_media_key_retirements
for each row execute function private.deleted_media_preserve_identity();

create function private.register_deleted_media_retirement() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.media_upload_reservations%rowtype; v jsonb; d private.deleted_content_records%rowtype;
 k text; prefix text; proof jsonb; staged_proof jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(176214,30);
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'retirement_read_committed_required' using errcode='25000'; end if;
 if new.provider<>'cloudflare_r2' or new.bucket<>'chillywood-media-origin' then return new; end if;
 if tg_op='INSERT' then
   if new.target_type='creator_video' then select to_jsonb(t) into v from public.videos t where id::text=new.target_id;
   elsif new.target_type='social_attachment' then select to_jsonb(t) into v from public.social_attachments t where id::text=new.target_id;
   else return new; end if;
   k:=coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path');
   -- Exact original, never thumbnail, migration source alias, URL or prefix guess.
   if k is distinct from new.object_key or v->>'storage_provider'<>'cloudflare_r2'
      or v->>'storage_bucket'<>'chillywood-media-origin'
      or new.author !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or new.target_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(v->>'owner_id',v->>'owner_user_id') is distinct from new.author then return new; end if;
   if new.target_type='creator_video' then
     prefix:=new.author||'/'||new.target_id||'/source.';
     if left(k,length(prefix))<>prefix or substr(k,length(prefix)+1)!~'^[a-z0-9]{1,10}$' then return new; end if;
   else
     if coalesce(v->>'surface_type','') !~ '^[a-z_]+$' or coalesce(v->>'surface_id','') !~ '^[0-9a-f-]{36}$' then return new; end if;
     prefix:=new.author||'/'||(v->>'surface_type')||'/'||(v->>'surface_id')||'/'||new.target_id||'.';
     if left(k,length(prefix))<>prefix or substr(k,length(prefix)+1)!~'^[a-z0-9]{1,10}$' then return new; end if;
   end if;
   select * into r from public.media_upload_reservations where id=new.reservation_id
    and storage_provider=new.provider and storage_bucket=new.bucket and storage_object_key=k
    and owner_user_id::text=new.author and surface_type=new.target_type and attached_record_id=new.target_id
    and status='verified' and verified_at is not null and attached_at is not null for update;
   if r.id is null then return new; end if;
   -- Capture only while the exact reservation is still verified. Gateway
   -- revocation happens after staging; its intentional transition is validated
   -- at finalization rather than relaxing ordinary inspection authority.
   if to_regprocedure('private.content_inspection_media_binding(text,uuid)') is not null then
     execute 'select private.content_inspection_media_binding($1,$2)' into staged_proof using new.target_type,new.target_id::uuid;
     if staged_proof->>'provider' is distinct from new.provider or staged_proof->>'bucket' is distinct from new.bucket
       or staged_proof->>'objectKey' is distinct from k or staged_proof->>'reservationId' is distinct from r.id::text then staged_proof:=null; end if;
   end if;
   insert into private.deleted_media_key_retirements(stage_id,provider,bucket,object_key,target_type,target_id,author,
      reservation_id,verified_at,attached_at,source_created_at,staged_inspection_proof)
   values(new.id,new.provider,new.bucket,k,new.target_type,new.target_id,new.author,r.id,r.verified_at,r.attached_at,v->>'created_at',staged_proof);
 elsif new.deletion_id is not null and old.deletion_id is null then
   -- Capture runs BEFORE source deletion. A staged key that was replaced in
   -- between is edit history, not this content's deleted original. Do not adopt
   -- it into retention merely because the target ID eventually gets deleted.
   if new.target_type='creator_video' then select to_jsonb(t) into v from public.videos t where id::text=new.target_id;
   else select to_jsonb(t) into v from public.social_attachments t where id::text=new.target_id; end if;
   if v is null or coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path') is distinct from new.object_key
      or v->>'storage_provider' is distinct from new.provider or v->>'storage_bucket' is distinct from new.bucket
      or coalesce(v->>'owner_id',v->>'owner_user_id') is distinct from new.author
      or not exists(select 1 from private.deleted_media_key_retirements registry where registry.stage_id=new.id
         and registry.source_created_at is not distinct from v->>'created_at') then return new; end if;
   select * into d from private.deleted_content_records where id=new.deletion_id
    and target_type=new.target_type and target_id=new.target_id and author=new.author;
   if d.id is null then raise exception 'retirement_deletion_binding_mismatch'; end if;
   -- The later inspection contract owns full fresh source/scan/parent proof
   -- validation. Missing validator/proof means unavailable, never fabrication.
   select registry.staged_inspection_proof into staged_proof from private.deleted_media_key_retirements registry where registry.stage_id=new.id;
   if d.deletion_kind='hard' and staged_proof is not null
      and to_regprocedure('private.finalize_deleted_media_inspection_proof(uuid,jsonb)') is not null then
     execute 'select private.finalize_deleted_media_inspection_proof($1,$2)' into proof using new.id,staged_proof;
   end if;
   update private.deleted_media_key_retirements set inspection_proof=proof,
     inspection_proof_fingerprint=case when proof is not null then md5(proof::text) end,status='retained',deletion_id=d.id,deleted_at=d.deleted_at,expires_at=d.expires_at
    where stage_id=new.id and status='staged';
 end if;
 return new;
end $$;
create trigger register_deleted_media_retirement after insert or update on private.deleted_content_media_stages
for each row execute function private.register_deleted_media_retirement();

-- Every public locator-bearing table is covered, including service-role and
-- migration writers. JSON fields are included because they may contain locators.
-- Unknown new tables fail readiness until their trigger is installed by review.
create function private.deleted_media_locator_columns(p_table oid) returns text[]
language sql stable set search_path='' as $$
 select coalesce(array_agg(a.attname::text order by a.attnum),'{}'::text[]) from pg_catalog.pg_attribute a
 where a.attrelid=p_table and a.attnum>0 and not a.attisdropped
 and (a.attname ~* '(url|uri|path|object_key|locator|manifest|playback)' or a.atttypid in ('json'::regtype,'jsonb'::regtype))
$$;
create function private.deleted_media_locator_document(p_row jsonb,p_table oid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) from jsonb_each(p_row) x(k,v)
 where k=any(private.deleted_media_locator_columns(p_table))
$$;
create function private.deleted_media_normalize_locator(p_text text) returns text
language plpgsql immutable set search_path='' as $$
declare result text:=coalesce(p_text,''); next_value text; c text; i integer; pass integer; n integer;
begin
 -- Canonical supported keys contain ASCII only. Decode percent-encoded ASCII
 -- conservatively, including nested encoding; never infer a different key.
 for pass in 1..4 loop
   next_value:=''; i:=1;
   while i<=length(result) loop
     c:=substr(result,i,3);
     if c ~ '^%[0-9A-Fa-f]{2}$' then
       n:=get_byte(decode(substr(c,2),'hex'),0);
       if n between 32 and 126 then next_value:=next_value||chr(n); i:=i+3; continue; end if;
     end if;
     next_value:=next_value||substr(result,i,1); i:=i+1;
   end loop;
   exit when next_value=result; result:=next_value;
 end loop;
 return result;
end $$;
create function private.deleted_media_mentions(p_document jsonb,p_key text) returns boolean
language sql immutable set search_path='' as $$
 -- Conservative substring match also catches URLs, arrays and metadata aliases.
 -- False positives block cleanup; they never authorize deletion.
 select strpos(private.deleted_media_normalize_locator(p_document::text),p_key)>0
$$;
create function private.deleted_media_reference_identity(p_row jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(k,v),'{}'::jsonb) from jsonb_each(p_row) x(k,v)
 where k ~ '(^id$|_id$|_type$|^created_at$|^target_table$|^target_column$)'
$$;
create function private.guard_deleted_media_references() returns trigger
language plpgsql security definer set search_path='' as $$
declare r private.deleted_media_key_retirements%rowtype; doc jsonb; old_doc jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(176214,30);
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'retirement_read_committed_required' using errcode='25000'; end if;
 doc:=private.deleted_media_locator_document(to_jsonb(new),tg_relid);
 if tg_op='UPDATE' then old_doc:=private.deleted_media_locator_document(to_jsonb(old),tg_relid); end if;
 for r in select * from private.deleted_media_key_retirements where status in ('retained','claimed') loop
   if private.deleted_media_mentions(doc,r.object_key) then
     -- Before claim, unchanged existing bindings may be restored/updated. They
     -- remain live references and prevent claim. New rows/aliases are forbidden.
     if r.status='retained' and tg_op='UPDATE' and doc=old_doc
       and private.deleted_media_reference_identity(to_jsonb(new))
         =private.deleted_media_reference_identity(to_jsonb(old))
       then continue; end if;
     raise exception 'media_key_retired_reference_forbidden' using errcode='55000';
   end if;
 end loop;
 return new;
end $$;
do $$ declare t record; begin
 for t in select c.oid,n.nspname,c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('r','p')
   and cardinality(private.deleted_media_locator_columns(c.oid))>0 loop
   execute format('create trigger zzz_deleted_media_reference_guard before insert or update on %I.%I for each row execute function private.guard_deleted_media_references()',t.nspname,t.relname);
 end loop;
end $$;
create function private.deleted_media_reference_coverage_ready() returns boolean
language sql stable set search_path='' as $$
 select not exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0
   and not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=c.oid
    and t.tgfoid='private.guard_deleted_media_references()'::regprocedure and t.tgenabled in ('O','A')
    and (t.tgtype::integer & 23)=23 and t.tgqual is null))
$$;
create function private.deleted_media_retirement_binding(p_stage_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.deleted_media_key_retirements%rowtype;
begin
 select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id;
 if current_setting('transaction_isolation')<>'read committed' or r.id is null or r.status='staged' or not private.deleted_media_reference_coverage_ready() then
   return jsonb_build_object('supported',false,'reason','unfinalized_or_uncovered_key_class'); end if;
 return jsonb_build_object('supported',true,'provider',r.provider,'bucket',r.bucket,'objectKey',r.object_key,
  'targetType',r.target_type,'targetId',r.target_id,'author',r.author,'retirementId',r.id,'status',r.status,
  'expiresAt',r.expires_at,'deletionId',r.deletion_id,'guarantee','logical_key_retirement_best_effort_physical_cleanup');
end $$;
create function private.deleted_media_has_live_reference(p_stage_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.deleted_media_key_retirements%rowtype; t record; found_ref boolean; predicate text;
begin
 perform pg_catalog.pg_advisory_xact_lock(176214,30);
 select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id;
 if r.id is null or not private.deleted_media_reference_coverage_ready() then return true; end if;
 for t in select c.oid,c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0 loop
   predicate:='true';
   -- Reservations are provenance, not delivery references. Only the EXACT
   -- registered reservation is excluded; competing reservations block cleanup.
   if t.relname='media_upload_reservations' then predicate:=format('id::text<>%L',r.reservation_id::text); end if;
   -- Historical terminal scan receipts cannot publish content by themselves.
   if t.relname='media_scan_jobs' then predicate:='coalesce(to_jsonb(x)->>''status'','''') not in (''clean'',''malware_detected'',''quarantined'')'; end if;
   execute format('select exists(select 1 from public.%I x where %s and private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$1))',t.relname,predicate,t.oid)
     into found_ref using r.object_key;
   if found_ref then return true; end if;
 end loop;
 return false;
end $$;
create function private.claim_deleted_media_retirement(p_stage_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.deleted_media_key_retirements%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(176214,30);
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'retirement_read_committed_required' using errcode='25000'; end if;
 select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id for update;
 if r.id is null or not coalesce((private.deleted_media_retirement_binding(p_stage_id)->>'supported')::boolean,false) then return false; end if;
 if r.status='claimed' then return true; end if;
 if r.expires_at>clock_timestamp() or private.deleted_media_has_live_reference(p_stage_id) then return false; end if;
 -- Caller must additionally check legal holds and create its durable deletion
 -- claim under this SAME transaction/lock before any provider operation.
 update private.deleted_media_key_retirements set status='claimed',claimed_at=clock_timestamp() where id=r.id;
 return true;
end $$;

-- A read-only admission/delivery fence. The caller still must enforce its normal
-- exact-record authority. Errors fail closed; this RPC grants no access itself.
create function public.check_deleted_media_retirement(p_provider text,p_bucket text,p_object_key text,p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.deleted_media_key_retirements%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(176214,30);
 if current_setting('transaction_isolation')<>'read committed' then return jsonb_build_object('allowed',false); end if;
 if p_purpose not in ('upload','read','inspection','publish') then return jsonb_build_object('allowed',false); end if;
 select * into r from private.deleted_media_key_retirements where object_key=p_object_key and status in ('retained','claimed') limit 1;
 if r.id is null then return jsonb_build_object('allowed',true); end if;
 if p_provider is distinct from r.provider or p_bucket is distinct from r.bucket or r.status='claimed' then return jsonb_build_object('allowed',false); end if;
 return jsonb_build_object('allowed',p_purpose='inspection' and clock_timestamp()<r.expires_at,'expiresAt',r.expires_at);
end $$;
revoke all on function public.check_deleted_media_retirement(text,text,text,text) from public,anon,authenticated;
grant execute on function public.check_deleted_media_retirement(text,text,text,text) to service_role;
-- Private functions are implementation details, never directly callable by app roles.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and (p.proname like 'deleted_media_%' or p.proname in ('register_deleted_media_retirement','guard_deleted_media_references','claim_deleted_media_retirement')) loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
