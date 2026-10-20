-- Terminal cleanup of a genuinely deleted parent's retained attachment.
-- This never turns an abandoned object-delete into permission to delete a row.
create function private.cleanup_expired_deleted_attachment_source(p_stage_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare r private.deleted_content_records%rowtype; registry private.deleted_media_key_retirements%rowtype;
 source jsonb; parent jsonb; parent_table text; parent_kind text;
begin
 select * into registry from private.deleted_media_key_retirements where stage_id=p_stage_id;
 select * into r from private.deleted_content_records where id=registry.deletion_id;
 if r.id is null or r.expires_at>clock_timestamp() then return 'not_due'; end if;
 if r.deletion_kind='hard' then return 'ready'; end if;
 if r.target_type<>'social_attachment' then return 'unsupported_soft_source'; end if;
 parent_kind:=case r.parent_type when 'watch_party_room_message' then 'room_message' else r.parent_type end;
 parent_table:=case parent_kind when 'profile_post' then 'profile_posts'
   when 'profile_post_comment' then 'profile_post_comments'
   when 'creator_video_comment' then 'creator_video_comments'
   when 'chat_message' then 'chat_messages' when 'room_message' then 'watch_party_room_messages' end;
 if parent_table is null or r.parent_id is null then return 'parent_deletion_unproven'; end if;
 begin
   select to_jsonb(x) into source from public.social_attachments x where x.id::text=r.target_id for update nowait;
   if source is null then return 'ready'; end if;
   execute format('select to_jsonb(x) from public.%I x where id::text=$1 for update nowait',parent_table)
     into parent using r.parent_id;
 exception when lock_not_available then return 'source_busy';
 end;
 if (source->>'created_at')::timestamptz is distinct from r.source_created_at
   or source->>'owner_user_id' is distinct from r.author
   or source->>'surface_type' is distinct from r.parent_type or source->>'surface_id' is distinct from r.parent_id
   or source->>'storage_provider' is distinct from registry.provider
   or source->>'storage_bucket' is distinct from registry.bucket
   or coalesce(nullif(source->>'storage_object_key',''),source->>'storage_path') is distinct from registry.object_key then
   return 'source_live_or_changed';
 end if;
 -- The archive must establish actual parent deletion; a missing parent alone
 -- is not deletion intent. A restored parent or reused ID blocks this cleanup.
 if parent is not null and parent->>'deleted_at' is null then return 'source_live_or_changed'; end if;
 if not exists(select 1 from private.deleted_content_records p
   where p.target_type=parent_kind and p.target_id=r.parent_id
     and p.deleted_at<=r.deleted_at and p.expires_at<=clock_timestamp()
     and (parent is null or ((parent->>'created_at')::timestamptz is not distinct from p.source_created_at
       and p.deletion_kind='soft'))) then return 'parent_deletion_unproven'; end if;
 delete from public.social_attachments where id::text=r.target_id;
 return 'ready';
end $$;
revoke all on function private.cleanup_expired_deleted_attachment_source(uuid) from public,anon,authenticated,service_role;

create or replace function public.claim_deleted_content_media_expiry(p_stage_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.deleted_content_media_stages%rowtype; r private.deleted_content_records%rowtype;
 c private.deleted_content_media_expiry_claims%rowtype; binding jsonb; source_status text;
begin
 if not exists(select 1 from private.deleted_content_retention_settings where media_expiry_enabled) then
   return jsonb_build_object('status','disabled'); end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000'; end if;
 perform private.deleted_media_reference_fence_armed();
 perform pg_advisory_xact_lock(176214,30);
 begin
   select * into s from private.deleted_content_media_stages where id=p_stage_id for update nowait;
   perform 1 from private.deleted_media_key_retirements where stage_id=p_stage_id for update nowait;
   if s.id is null or s.deletion_id is null then return jsonb_build_object('status','not_finalized'); end if;
   select * into r from private.deleted_content_records where id=s.deletion_id for update nowait;
 exception when lock_not_available then return jsonb_build_object('status','source_busy');
 end;
 if r.id is null then return jsonb_build_object('status','missing_deletion_record'); end if;
 if r.expires_at>clock_timestamp() then return jsonb_build_object('status','not_due'); end if;
 if exists(select 1 from public.legal_holds h where h.status='active' and
   private.deleted_content_hold_matches(h.target_type,h.target_id,r.target_type,r.target_id,r.author,r.parent_type,r.parent_id)) then
   return jsonb_build_object('status','held'); end if;
 binding:=private.deleted_media_retirement_binding(p_stage_id);
 if binding->>'supported' is distinct from 'true' or binding->>'provider' is distinct from s.provider
   or binding->>'bucket' is distinct from s.bucket or binding->>'objectKey' is distinct from s.object_key
   or binding->>'deletionId' is distinct from r.id::text then
   return jsonb_build_object('status','unsupported_or_live_reference'); end if;
 -- Subtransaction rolls back metadata cleanup if another live/shared alias
 -- blocks retirement. All authority and hold checks stay under the same lock.
 begin
   source_status:=private.cleanup_expired_deleted_attachment_source(p_stage_id);
   if source_status<>'ready' then return jsonb_build_object('status',source_status); end if;
   if private.deleted_media_has_live_reference(p_stage_id)
     or not private.claim_deleted_media_retirement(p_stage_id) then
     raise exception using errcode='P7201',message='shared_reference_blocks_cleanup';
   end if;
   select * into c from private.deleted_content_media_expiry_claims where stage_id=p_stage_id for update;
   if c.id is null then
     insert into private.deleted_content_media_expiry_claims(stage_id,deletion_id,target_type,target_id,author,parent_type,parent_id,provider,bucket,object_key)
       values(s.id,r.id,r.target_type,r.target_id,r.author,r.parent_type,r.parent_id,s.provider,s.bucket,s.object_key) returning * into c;
     insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
       values('media_claim',r.target_type,r.target_id,r.id,'service:retention_expiry');
     update private.deleted_content_records set content=null where id=r.id;
   end if;
 exception when sqlstate 'P7201' then return jsonb_build_object('status','unsupported_or_live_reference');
 end;
 return jsonb_build_object('status','claimed','claimId',c.id);
end $$;

-- Empty metadata is an explicit capture-time fact, never inferred retrospectively
-- from missing bytes. Unknown historical media rows keep their fail-closed path.
alter function public.expire_deleted_content_text(uuid) set schema private;
alter function private.expire_deleted_content_text(uuid) rename to expire_deleted_content_text_legacy;
revoke all on function private.expire_deleted_content_text_legacy(uuid) from public,anon,authenticated,service_role;
create function public.expire_deleted_content_text(p_deletion_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.deleted_content_records%rowtype; claim uuid;
begin
 if not exists(select 1 from private.deleted_content_retention_settings where text_expiry_enabled) then
   return jsonb_build_object('status','disabled'); end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000'; end if;
 perform private.deleted_media_reference_fence_armed();
 perform pg_advisory_xact_lock(176214,30);
 select * into r from private.deleted_content_records where id=p_deletion_id for update;
 if r.id is null then return jsonb_build_object('status','already_absent'); end if;
 if r.media_disposition<>'metadata_only' then return private.expire_deleted_content_text_legacy(p_deletion_id); end if;
 if r.expires_at>clock_timestamp() then return jsonb_build_object('status','not_due'); end if;
 if r.deletion_kind<>'hard' or exists(select 1 from private.deleted_content_media_stages where deletion_id=r.id) then
   return jsonb_build_object('status','source_cleanup_required'); end if;
 if exists(select 1 from public.legal_holds h where h.status='active' and
   private.deleted_content_hold_matches(h.target_type,h.target_id,r.target_type,r.target_id,r.author,r.parent_type,r.parent_id)) then
   return jsonb_build_object('status','held'); end if;
 insert into private.deleted_content_expiry_claims(deletion_id,target_type,target_id,author,parent_type,parent_id,kind)
   values(r.id,r.target_type,r.target_id,r.author,r.parent_type,r.parent_id,'text_only') returning id into claim;
 insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
   values('claim',r.target_type,r.target_id,r.id,'service:retention_expiry');
 delete from private.deleted_content_records where id=r.id;
 update private.deleted_content_expiry_claims set completed_at=clock_timestamp() where id=claim;
 insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
   values('purge',r.target_type,r.target_id,r.id,'service:retention_expiry');
 return jsonb_build_object('status','purged','claimId',claim);
end $$;
revoke all on function public.expire_deleted_content_text(uuid) from public,anon,authenticated;
grant execute on function public.expire_deleted_content_text(uuid) to service_role;
