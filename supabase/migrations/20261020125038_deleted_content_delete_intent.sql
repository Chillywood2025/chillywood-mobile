-- SOURCE ONLY. Explicit content deletion is separate from an object-only delete.
-- All flags stay disabled. No provider operation, migration of bytes or schedule.
begin;

alter table private.deleted_content_records add column media_disposition text not null default 'unknown'
 check(media_disposition in ('unknown','text_only','metadata_only','retained_original'));

alter table public.media_security_audit_events drop constraint media_security_audit_events_action_check;
alter table public.media_security_audit_events add constraint media_security_audit_events_action_check
 check(action in ('create_upload_url','verify_upload','create_download_url','delete_object','delete_content',
  'private_media_download_url','private_media_delete','media_readability_result_recorded'));

-- The old staging implementation is now callable only inside an actual source
-- deletion transaction. An old delete_object request cannot acquire new content
-- deletion authority or leave a newly abandoned stage.
alter function public.stage_deleted_content_media(text,text,text,text,text,uuid) set schema private;
alter function private.stage_deleted_content_media(text,text,text,text,text,uuid) rename to stage_deleted_content_media_internal;
revoke all on function private.stage_deleted_content_media_internal(text,text,text,text,text,uuid)
 from public,anon,authenticated,service_role;

create function public.stage_deleted_content_media(
 p_type text,p_target text,p_provider text,p_bucket text,p_object_key text,p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.deleted_media_key_retirements;
begin
 perform private.deleted_media_reference_fence_armed();
 -- A stopped worker does not release a retired original to the old immediate
 -- DELETE route. Existing claims and staging provenance survive runtime stops.
 select * into r from private.deleted_media_key_retirements
  where provider=p_provider and bucket=p_bucket and object_key=p_object_key;
 if r.id is not null then
  if r.target_type is distinct from p_type
   or (p_target is not null and r.target_id is distinct from p_target)
   or (p_target is null and r.author is distinct from p_actor::text) then
   raise exception 'deleted_content_binding_conflict' using errcode='55000';
  end if;
  return jsonb_build_object('decision','defer','retention',r.status);
 end if;
 if not exists(select 1 from private.deleted_content_retention_settings where media_staging_enabled or legacy_object_deletes_blocked) then
  return jsonb_build_object('decision','delete_now','retention','disabled');
 end if;
 -- Unsupported, detached, replacement and no-record requests need their own
 -- proven object cleanup protocol. A caller omitting recordId cannot establish
 -- unattached provenance or evade the fence. Never turn them into parent DELETE.
 raise exception 'explicit_content_delete_required' using errcode='55000';
end $$;
revoke all on function public.stage_deleted_content_media(text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.stage_deleted_content_media(text,text,text,text,text,uuid) to service_role;

create or replace function private.capture_deleted_content_row(p_type text,v jsonb,p_soft boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare d uuid; a text; b jsonb; k text; t timestamptz:=clock_timestamp();
 stage_id uuid; decision jsonb; revoked jsonb; original_key text; coverage text; disposition text:='text_only';
begin
 perform private.deleted_media_reference_fence_armed();
 if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then return null; end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'retention_requires_read_committed' using errcode='25000';
 end if;
 k:=coalesce(v->>'id',v->>'owner_user_id');
 a:=coalesce(v->>'user_id',v->>'sender_user_id',v->>'owner_id',v->>'owner_user_id');
 if k is null or a is null then raise exception 'deleted_content_missing_identity'; end if;
 select id into d from private.deleted_content_records where target_type=p_type and target_id=k
  and deletion_kind='soft' and source_created_at is not distinct from nullif(v->>'created_at','')::timestamptz
  order by deleted_at desc,id limit 1;
 if d is not null then
  if p_type in ('creator_video','social_attachment') and not (
   exists(select 1 from private.deleted_content_records x where x.id=d and x.media_disposition='metadata_only')
    and private.deleted_content_source_coverage(p_type,v)='metadata_only'
   or exists(select 1 from private.deleted_content_records x join private.deleted_media_key_retirements r on r.deletion_id=x.id
    join private.deleted_content_media_stages s on s.id=r.stage_id and s.deletion_id=x.id
    where x.id=d and x.media_disposition='retained_original' and r.status='retained'
     and r.target_type=p_type and r.target_id=k and r.author=a
     and r.provider=v->>'storage_provider' and r.bucket=v->>'storage_bucket'
     and r.object_key=coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path')
     and r.source_created_at is not distinct from v->>'created_at')
  ) then raise exception 'deleted_content_existing_media_proof_required' using errcode='55000'; end if;
  return d;
 end if;
 if p_type in ('creator_video','social_attachment') then
  coverage:=private.deleted_content_source_coverage(p_type,v);
  if coverage='metadata_only' then disposition:='metadata_only';
  elsif coverage<>'eligible_r2_original' then
   raise exception 'deleted_content_original_retention_unavailable: %',coverage using errcode='55000';
  else
  disposition:='retained_original';
  original_key:=coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path');
  if not exists(select 1 from private.deleted_content_retention_settings where media_staging_enabled)
   or v->>'storage_provider' is distinct from 'cloudflare_r2'
   or v->>'storage_bucket' is distinct from 'chillywood-media-origin'
   or nullif(original_key,'') is null then
   raise exception 'deleted_content_original_retention_unavailable' using errcode='55000';
  end if;
  decision:=private.stage_deleted_content_media_internal(p_type,k,v->>'storage_provider',v->>'storage_bucket',original_key,auth.uid());
  select r.stage_id into stage_id from private.deleted_media_key_retirements r
   where r.target_type=p_type and r.target_id=k and r.author=a
    and r.provider=v->>'storage_provider' and r.bucket=v->>'storage_bucket' and r.object_key=original_key
    and r.source_created_at is not distinct from v->>'created_at' and r.status='staged';
  if decision->>'decision' is distinct from 'defer' or stage_id is null then
   raise exception 'deleted_content_original_retention_unavailable' using errcode='55000';
  end if;
  revoked:=public.revoke_media_object_delivery(p_type,v->>'storage_provider',v->>'storage_bucket',
   original_key,a::uuid,k,null,null);
  if revoked->>'revoked' is distinct from 'true' then
   raise exception 'deleted_content_delivery_revocation_required' using errcode='55000';
  end if;
  end if;
 end if;
 case p_type
  when 'profile_post','profile_post_comment','creator_video_comment','chat_message' then b:=jsonb_build_object('body',v->'body');
  when 'room_message' then b:=jsonb_build_object('body',v->'text');
  when 'creator_video' then b:=jsonb_build_object('title',v->'title','description',v->'description');
  when 'social_attachment','platform_brand_asset' then b:=null;
  when 'platform_brand_profile' then return null;
  else raise exception 'deleted_content_unsupported_target';
 end case;
 insert into private.deleted_content_records(target_type,target_id,author,owner_protected,content,source_updated_at,source_created_at,parent_type,parent_id,deletion_kind,deleted_at,expires_at,media_disposition)
 values(p_type,k,a,exists(select 1 from public.platform_role_memberships where user_id=a and role='owner'),b,
  nullif(v->>'updated_at','')::timestamptz,nullif(v->>'created_at','')::timestamptz,v->>'surface_type',v->>'surface_id',
  case when p_soft then 'soft' else 'hard' end,t,t+interval '720 hours',disposition) returning id into d;
 -- Only this exact deleted original belongs to this deletion. A replaced stage
 -- stays abandoned, even if a later incarnation or replacement is deleted.
 update private.deleted_content_media_stages set deletion_id=d where id=stage_id and deletion_id is null;
 insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
 values('capture',p_type,k,d,auth.uid()::text);
 return d;
end $$;
revoke all on function private.capture_deleted_content_row(text,jsonb,boolean) from public,anon,authenticated,service_role;

create or replace function private.capture_deleted_content_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare v jsonb:=to_jsonb(old); a record;
begin
 -- DELETE has no locator admission trigger. Share the activation latch even
 -- while disabled so first enable cannot overtake an in-flight source delete.
 perform private.deleted_media_reference_fence_armed();
 if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then
  if tg_op='UPDATE' then return new; end if;
  return old;
 end if;
 if tg_op='UPDATE' then
  if v->>'deleted_at' is not null or to_jsonb(new)->>'deleted_at' is null then return new; end if;
  v:=to_jsonb(new);
 end if;
 perform private.capture_deleted_content_row(tg_argv[0],v,tg_op='UPDATE');
 if tg_argv[0] in ('profile_post','profile_post_comment','creator_video_comment','chat_message','room_message') then
  for a in select x.* from public.social_attachments x
   where x.surface_id::text=v->>'id'
    and x.surface_type=case tg_argv[0] when 'room_message' then 'watch_party_room_message' else tg_argv[0] end
   for update loop
   perform private.capture_deleted_content_row('social_attachment',to_jsonb(a),true);
  end loop;
 end if;
 if tg_op='UPDATE' then return new; end if;
 return old;
end $$;
revoke all on function private.capture_deleted_content_trigger() from public,anon,authenticated,service_role;

-- This endpoint grants only the source owner's existing content-delete power.
-- Gateway object moderation permission cannot silently become row-delete power.
create function public.delete_retained_content(
 p_type text,p_target uuid,p_provider text,p_bucket text,p_object_key text,p_source_created_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb; actor uuid:=auth.uid(); removed integer;
begin
 if actor is null or not public.whole_app_exact_current_session_authority_internal() then
  raise exception 'deleted_content_current_session_required' using errcode='42501';
 end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'retention_requires_read_committed' using errcode='25000';
 end if;
 if p_type='creator_video' then
  select to_jsonb(x) into v from public.videos x where x.id=p_target for update;
 elsif p_type='social_attachment' then
  select to_jsonb(x) into v from public.social_attachments x where x.id=p_target for update;
 else raise exception 'deleted_content_unsupported_target' using errcode='22023'; end if;
 if p_source_created_at is null then raise exception 'deleted_content_source_identity_required' using errcode='22023'; end if;
 if v is null then
  if exists(select 1 from private.deleted_media_key_retirements r
   where r.target_type=p_type and r.target_id=p_target::text and r.author=actor::text
    and r.provider=p_provider and r.bucket=p_bucket and r.object_key=p_object_key
    and r.source_created_at::timestamptz=p_source_created_at and r.status in ('retained','claimed')) then
   return jsonb_build_object('status','already_deleted','retentionHandled',true);
  end if;
  raise exception 'deleted_content_source_binding_changed' using errcode='55000';
 end if;
 if coalesce(v->>'owner_id',v->>'owner_user_id') is distinct from actor::text
  or v->>'storage_provider' is distinct from p_provider or v->>'storage_bucket' is distinct from p_bucket
  or coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path') is distinct from p_object_key
  or (v->>'created_at')::timestamptz is distinct from p_source_created_at then
  raise exception 'deleted_content_source_binding_changed' using errcode='55000';
 end if;
 perform private.deleted_media_reference_fence_armed();
 if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled and media_staging_enabled) then
  return jsonb_build_object('status','disabled','retentionHandled',false);
 end if;
 -- Lock waits cannot turn an earlier session check into continuing authority.
 if not public.whole_app_exact_current_session_authority_internal() then
  raise exception 'deleted_content_current_session_required' using errcode='42501';
 end if;
 if p_type='creator_video' then delete from public.videos where id=p_target;
 else delete from public.social_attachments where id=p_target; end if;
 get diagnostics removed=row_count;
 if removed<>1 then raise exception 'deleted_content_source_binding_changed' using errcode='55000'; end if;
 if not public.whole_app_exact_current_session_authority_internal() then
  raise exception 'deleted_content_current_session_required' using errcode='42501';
 end if;
 return jsonb_build_object('status','deleted','retentionHandled',true);
end $$;
revoke all on function public.delete_retained_content(text,uuid,text,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.delete_retained_content(text,uuid,text,text,text,timestamptz) to authenticated;

commit;
