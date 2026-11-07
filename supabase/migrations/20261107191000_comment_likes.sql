-- Individual public comment/reply likes. Private actor rows never leave this
-- schema; aggregate readers authorize the current comment AND its source.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create schema comment_likes_private;
revoke all on schema comment_likes_private from public,anon,authenticated,service_role;
create table comment_likes_private.likes (
  kind text not null check(kind in ('profile_post_comment','creator_video_comment')),
  comment_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(kind,comment_id,user_id)
);
create index comment_likes_user_idx on comment_likes_private.likes(user_id,kind,comment_id);
create table comment_likes_private.counts (
  kind text not null, comment_id uuid not null, bucket smallint not null check(bucket between 0 and 63),
  likes bigint not null default 0 check(likes>=0), primary key(kind,comment_id,bucket)
);
create table comment_likes_private.limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null, attempts integer not null check(attempts between 1 and 120)
);
alter table comment_likes_private.likes enable row level security;
alter table comment_likes_private.likes force row level security;
alter table comment_likes_private.counts enable row level security;
alter table comment_likes_private.counts force row level security;
alter table comment_likes_private.limits enable row level security;
alter table comment_likes_private.limits force row level security;
revoke all on all tables in schema comment_likes_private from public,anon,authenticated,service_role;

create function comment_likes_private.visible(p_kind text,p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is not null and (not public.wave1_current_caller_authority_internal()
    or public.is_account_access_restricted(auth.uid()::text)) then return false; end if;
  if p_kind='profile_post_comment' then
    return exists(select 1 from public.profile_post_comments c join public.profile_posts p on p.id=c.post_id
      where c.id=p_id and c.deleted_at is null and c.moderation_status in ('clean','reported')
        and p.deleted_at is null and p.visibility='public' and p.moderation_status in ('clean','reported')
        and public.can_view_profile_content(p.user_id)
        and (c.parent_comment_id is null or exists(select 1 from public.profile_post_comments parent
          where parent.id=c.parent_comment_id and parent.post_id=c.post_id and parent.deleted_at is null
            and parent.moderation_status in ('clean','reported'))));
  elsif p_kind='creator_video_comment' then
    return exists(select 1 from public.creator_video_comments c join public.videos v on v.id=c.video_id
      where c.id=p_id and c.deleted_at is null and c.moderation_status in ('clean','reported')
        and v.visibility='public' and v.moderation_status in ('clean','reported') and v.quarantined_at is null
        and public.media_scan_public_safe(v.scan_status)
        and public.can_read_creator_video_row(v.owner_id::text,v.visibility,v.moderation_status,v.scan_status,
          v.storage_path,v.storage_object_key,v.playback_url,auth.uid()::text)
        and (c.parent_comment_id is null or exists(select 1 from public.creator_video_comments parent
          where parent.id=c.parent_comment_id and parent.video_id=c.video_id and parent.deleted_at is null
            and parent.moderation_status in ('clean','reported'))));
  end if;
  return false;
end;
$$;
create function comment_likes_private.track() returns trigger
language plpgsql security definer set search_path='' as $$
declare k text; target uuid; actor uuid; b smallint; delta integer;
begin
  if TG_OP='DELETE' then k:=old.kind;target:=old.comment_id;actor:=old.user_id;delta:=-1;
  else k:=new.kind;target:=new.comment_id;actor:=new.user_id;delta:=1; end if;
  b:=mod(pg_catalog.get_byte(pg_catalog.decode(pg_catalog.md5(actor::text),'hex'),0),64)::smallint;
  insert into comment_likes_private.counts(kind,comment_id,bucket) values(k,target,b) on conflict do nothing;
  update comment_likes_private.counts set likes=likes+delta where kind=k and comment_id=target and bucket=b;
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger comment_like_count after insert or delete on comment_likes_private.likes
  for each row execute function comment_likes_private.track();
create function comment_likes_private.source_deleted() returns trigger
language plpgsql security definer set search_path='' as $$
declare k text:=case when TG_TABLE_NAME='profile_post_comments' then 'profile_post_comment' else 'creator_video_comment' end;
begin
  delete from comment_likes_private.likes where kind=k and comment_id=old.id;
  delete from comment_likes_private.counts where kind=k and comment_id=old.id;
  return old;
end;
$$;
create trigger profile_comment_likes_cleanup after delete on public.profile_post_comments
  for each row execute function comment_likes_private.source_deleted();
create trigger video_comment_likes_cleanup after delete on public.creator_video_comments
  for each row execute function comment_likes_private.source_deleted();
revoke all on all functions in schema comment_likes_private from public,anon,authenticated,service_role;

create function public.read_comment_likes_batch(p_kind text,p_comment_ids uuid[])
returns table(comment_id uuid,like_count bigint,liked_by_viewer boolean,can_like boolean)
language plpgsql stable security definer set search_path='' as $$
declare target uuid;
begin
  if p_kind not in ('profile_post_comment','creator_video_comment') or p_kind is null
    or coalesce(cardinality(p_comment_ids),0)>50 then raise exception 'Invalid comment batch.' using errcode='22023'; end if;
  for target in select distinct x.id from unnest(coalesce(p_comment_ids,'{}'::uuid[])) x(id) where x.id is not null loop
    if comment_likes_private.visible(p_kind,target) then
      return query select target,coalesce(sum(c.likes),0)::bigint,
        exists(select 1 from comment_likes_private.likes l where l.kind=p_kind and l.comment_id=target and l.user_id=auth.uid()),
        auth.uid() is not null
      from comment_likes_private.counts c where c.kind=p_kind and c.comment_id=target;
    end if;
  end loop;
end;
$$;
create function public.set_comment_like(p_kind text,p_comment_id uuid,p_liked boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); source_id uuid; parent_id uuid;
begin
  if viewer is null then raise exception 'Current signed-in account required.' using errcode='42501'; end if;
  perform 1 from auth.users where id=viewer for share;
  if not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(viewer::text)
    then raise exception 'Current signed-in account required.' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('profile_post_comment','creator_video_comment') or p_comment_id is null or p_liked is null
    then raise exception 'Comment and desired state required.' using errcode='22023'; end if;
  insert into comment_likes_private.limits(user_id,started_at,attempts) values(viewer,clock_timestamp(),1)
  on conflict(user_id) do update set
    started_at=case when comment_likes_private.limits.started_at<=clock_timestamp()-interval '1 minute' then clock_timestamp() else comment_likes_private.limits.started_at end,
    attempts=case when comment_likes_private.limits.started_at<=clock_timestamp()-interval '1 minute' then 1 else comment_likes_private.limits.attempts+1 end
  where comment_likes_private.limits.started_at<=clock_timestamp()-interval '1 minute' or comment_likes_private.limits.attempts<120;
  if not found then raise exception 'rate_limited' using errcode='P0001'; end if;
  if not p_liked then
    -- Withdrawal remains possible after source privacy changes, without exposing existence.
    delete from comment_likes_private.likes where kind=p_kind and comment_id=p_comment_id and user_id=viewer;
    return false;
  end if;
  -- Lock source before child to agree with cascading deletes. Recheck all current
  -- predicates after locks; no client IDs/timestamps/counter deltas grant access.
  if p_kind='profile_post_comment' then
    select c.post_id,c.parent_comment_id into source_id,parent_id from public.profile_post_comments c where c.id=p_comment_id;
    perform 1 from public.profile_posts where id=source_id for share;
    if parent_id is not null then perform 1 from public.profile_post_comments where id=parent_id for share; end if;
    perform 1 from public.profile_post_comments where id=p_comment_id and post_id=source_id for share;
  else
    select c.video_id,c.parent_comment_id into source_id,parent_id from public.creator_video_comments c where c.id=p_comment_id;
    perform 1 from public.videos where id=source_id for share;
    if parent_id is not null then perform 1 from public.creator_video_comments where id=parent_id for share; end if;
    perform 1 from public.creator_video_comments where id=p_comment_id and video_id=source_id for share;
  end if;
  if not found or not comment_likes_private.visible(p_kind,p_comment_id) then raise exception 'Comment unavailable.' using errcode='42501'; end if;
  insert into comment_likes_private.likes(kind,comment_id,user_id) values(p_kind,p_comment_id,viewer) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.read_comment_likes_batch(text,uuid[]),public.set_comment_like(text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.read_comment_likes_batch(text,uuid[]) to anon,authenticated;
grant execute on function public.set_comment_like(text,uuid,boolean) to authenticated;
commit;
