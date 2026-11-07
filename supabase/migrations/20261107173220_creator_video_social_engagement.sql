-- Public video engagement. No view/share event is inferred from opening a card
-- or an OS share sheet. Reaction identities remain private; only totals and the
-- caller's own state are returned after current source authorization.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create schema video_engagement_private;
revoke all on schema video_engagement_private from public, anon, authenticated, service_role;

create table video_engagement_private.likes (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(video_id,user_id)
);
create index video_engagement_likes_user_idx on video_engagement_private.likes(user_id,video_id);
create table video_engagement_private.reposts (
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  published boolean not null default true,
  primary key(video_id,user_id)
);
create index video_engagement_reposts_user_page_idx on video_engagement_private.reposts(user_id,created_at desc,video_id desc) where published;
create table video_engagement_private.counts (
  video_id uuid not null references public.videos(id) on delete cascade,
  bucket smallint not null check (bucket between 0 and 63),
  like_count bigint not null default 0 check (like_count >= 0),
  comment_count bigint not null default 0 check (comment_count >= 0),
  repost_count bigint not null default 0 check (repost_count >= 0),
  primary key(video_id,bucket)
);
create table video_engagement_private.write_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  attempts integer not null check (attempts between 1 and 60)
);
alter table video_engagement_private.likes enable row level security;
alter table video_engagement_private.likes force row level security;
alter table video_engagement_private.reposts enable row level security;
alter table video_engagement_private.reposts force row level security;
alter table video_engagement_private.counts enable row level security;
alter table video_engagement_private.counts force row level security;
alter table video_engagement_private.write_limits enable row level security;
alter table video_engagement_private.write_limits force row level security;
revoke all on all tables in schema video_engagement_private from public, anon, authenticated, service_role;

create function video_engagement_private.bucket(value text) returns smallint
language sql immutable strict security invoker set search_path = '' as $$
  select mod(pg_catalog.get_byte(pg_catalog.decode(pg_catalog.md5(value),'hex'),0),64)::smallint
$$;
create function video_engagement_private.apply_delta(p_video uuid,p_bucket smallint,p_likes bigint,p_comments bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_likes=0 and p_comments=0 then return; end if;
  -- Parent cascade cannot resurrect a counter row.
  if not exists(select 1 from public.videos where id=p_video) then return; end if;
  insert into video_engagement_private.counts(video_id,bucket) values(p_video,p_bucket) on conflict do nothing;
  update video_engagement_private.counts set like_count=like_count+p_likes,comment_count=comment_count+p_comments
    where video_id=p_video and bucket=p_bucket;
end;
$$;
create function video_engagement_private.track_like() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP='DELETE' then
    perform video_engagement_private.apply_delta(old.video_id,video_engagement_private.bucket(old.user_id::text),-1,0);
    return old;
  end if;
  perform video_engagement_private.apply_delta(new.video_id,video_engagement_private.bucket(new.user_id::text),1,0);
  return new;
end;
$$;
create function video_engagement_private.track_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_counted boolean:=false; new_counted boolean:=false;
begin
  -- This product metric is visible top-level discussion threads, not reply
  -- rows. A hidden/deleted thread cannot leave orphan replies in the total.
  if TG_OP<>'INSERT' then old_counted:=old.parent_comment_id is null and old.deleted_at is null and old.moderation_status in ('clean','reported'); end if;
  if TG_OP<>'DELETE' then new_counted:=new.parent_comment_id is null and new.deleted_at is null and new.moderation_status in ('clean','reported'); end if;
  if TG_OP='UPDATE' and old.video_id=new.video_id and old.id=new.id and old_counted=new_counted then return new; end if;
  if old_counted then perform video_engagement_private.apply_delta(old.video_id,video_engagement_private.bucket(old.id::text),0,-1); end if;
  if new_counted then perform video_engagement_private.apply_delta(new.video_id,video_engagement_private.bucket(new.id::text),0,1); end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on all functions in schema video_engagement_private from public, anon, authenticated, service_role;

-- Snapshot and trigger installation are atomic. This is a bounded locking
-- migration, not a zero-interruption deployment claim. Measure before rollout.
lock table public.creator_video_comments in share row exclusive mode;
insert into video_engagement_private.counts(video_id,bucket,comment_count)
select video_id,video_engagement_private.bucket(id::text),count(*)
from public.creator_video_comments where parent_comment_id is null and deleted_at is null and moderation_status in ('clean','reported')
group by video_id,video_engagement_private.bucket(id::text);
create trigger creator_video_likes_exact_count after insert or delete on video_engagement_private.likes
  for each row execute function video_engagement_private.track_like();
create trigger creator_video_comments_exact_count after insert or update or delete on public.creator_video_comments
  for each row execute function video_engagement_private.track_comment();

create function video_engagement_private.track_repost() returns trigger
language plpgsql security definer set search_path = '' as $$
declare delta integer:=0; target uuid; actor uuid;
begin
  if TG_OP='UPDATE' and (new.video_id<>old.video_id or new.user_id<>old.user_id or new.created_at<>old.created_at)
  then raise exception 'Repost identity is immutable.'; end if;
  if TG_OP<>'INSERT' and old.published then delta:=delta-1; end if;
  if TG_OP<>'DELETE' and new.published then delta:=delta+1; end if;
  if TG_OP='DELETE' then target:=old.video_id; actor:=old.user_id; else target:=new.video_id; actor:=new.user_id; end if;
  if delta<>0 and exists(select 1 from public.videos where id=target) then
    insert into video_engagement_private.counts(video_id,bucket)
      values(target,video_engagement_private.bucket(actor::text)) on conflict do nothing;
    update video_engagement_private.counts set repost_count=repost_count+delta
      where video_id=target and bucket=video_engagement_private.bucket(actor::text);
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger creator_video_reposts_exact_count after insert or update or delete on video_engagement_private.reposts
  for each row execute function video_engagement_private.track_repost();

-- A public repost is not a private share. Withdrawing public profile access or
-- scheduling deletion/ban withdraws publication without destroying the record.
-- Making the account public again does not silently republish past activity.
create function video_engagement_private.withdraw_reposts(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  for target in select video_id from video_engagement_private.reposts where user_id=p_user and published order by video_id
  loop
    update video_engagement_private.reposts set published=false where user_id=p_user and video_id=target and published;
  end loop;
end;
$$;
create function video_engagement_private.profile_privacy_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.shares_visibility<>'public' or new.profile_access_visibility<>'public' or new.profile_visibility<>'everyone' then
    if new.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then perform video_engagement_private.withdraw_reposts(new.user_id::uuid); end if;
  end if;
  return new;
end;
$$;
create trigger creator_video_reposts_profile_privacy after update of shares_visibility,profile_access_visibility,profile_visibility on public.user_profiles
  for each row execute function video_engagement_private.profile_privacy_changed();
create function video_engagement_private.account_ban_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.banned_until is not null and new.banned_until>now() then perform video_engagement_private.withdraw_reposts(new.id); end if;
  return new;
end;
$$;
create trigger creator_video_reposts_account_ban after update of banned_until on auth.users
  for each row execute function video_engagement_private.account_ban_changed();
create function video_engagement_private.account_deletion_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('scheduled','completed') then
    perform 1 from auth.users where id=new.user_id for update;
    perform video_engagement_private.withdraw_reposts(new.user_id);
  end if;
  return new;
end;
$$;
create trigger creator_video_reposts_account_deletion after insert or update of status on public.account_deletion_requests
  for each row execute function video_engagement_private.account_deletion_changed();
revoke all on all functions in schema video_engagement_private from public,anon,authenticated,service_role;

create function public.read_authorized_creator_video_engagement(p_video_id uuid)
returns table(video_id uuid,like_count bigint,comment_count bigint,liked_by_viewer boolean,can_like boolean,repost_count bigint,reposted_by_viewer boolean,can_repost boolean)
language sql stable security definer rows 1 set search_path = '' as $$
  select v.id,coalesce(sum(c.like_count),0)::bigint,coalesce(sum(c.comment_count),0)::bigint,
    exists(select 1 from video_engagement_private.likes l where l.video_id=v.id and l.user_id=auth.uid()),
    auth.uid() is not null and public.wave1_current_caller_authority_internal(),
    coalesce(sum(c.repost_count),0)::bigint,
    exists(select 1 from video_engagement_private.reposts r where r.video_id=v.id and r.user_id=auth.uid() and r.published),
    auth.uid() is not null and public.wave1_current_caller_authority_internal()
      and exists(select 1 from public.user_profiles p where p.user_id=auth.uid()::text and p.shares_visibility='public'
        and p.profile_access_visibility='public' and p.profile_visibility='everyone')
  from public.videos v left join video_engagement_private.counts c on c.video_id=v.id
  where v.id=p_video_id and v.visibility='public' and v.moderation_status in ('clean','reported')
    and v.quarantined_at is null and public.media_scan_public_safe(v.scan_status)
    and public.can_read_creator_video_row(v.owner_id::text,v.visibility,v.moderation_status,v.scan_status,
      v.storage_path,v.storage_object_key,v.playback_url,auth.uid()::text)
  group by v.id
$$;
revoke all on function public.read_authorized_creator_video_engagement(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_authorized_creator_video_engagement(uuid) to anon,authenticated;

create function public.read_creator_video_engagement_batch(p_video_ids uuid[])
returns table(video_id uuid,like_count bigint,comment_count bigint,liked_by_viewer boolean,can_like boolean,repost_count bigint,reposted_by_viewer boolean,can_repost boolean)
language plpgsql stable security invoker set search_path = '' as $$
declare target uuid;
begin
  if coalesce(cardinality(p_video_ids),0)>50 then raise exception 'Too many videos.' using errcode='22023'; end if;
  for target in select distinct x.id from unnest(coalesce(p_video_ids,'{}'::uuid[])) x(id) where x.id is not null
  loop
    -- Keep source RLS as well as the aggregate helper's explicit authority.
    perform 1 from public.videos v where v.id=target;
    if not found then continue; end if;
    return query select * from public.read_authorized_creator_video_engagement(target);
  end loop;
end;
$$;
revoke all on function public.read_creator_video_engagement_batch(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_video_engagement_batch(uuid[]) to anon,authenticated;

create function public.set_creator_video_like(p_video_id uuid,p_liked boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare viewer uuid:=auth.uid(); v public.videos%rowtype;
begin
  if viewer is null or not public.wave1_current_caller_authority_internal()
    or public.is_account_access_restricted(viewer::text)
  then raise exception 'Current signed-in account required.' using errcode='42501'; end if;
  if p_video_id is null or p_liked is null then raise exception 'Video and desired state required.' using errcode='22023'; end if;
  -- One row per account serializes mutations and bounds concurrent spam. Never
  -- trust client timestamps or a client-supplied counter delta.
  insert into video_engagement_private.write_limits(user_id,started_at,attempts) values(viewer,clock_timestamp(),1)
  on conflict(user_id) do update set
    started_at=case when video_engagement_private.write_limits.started_at<=clock_timestamp()-interval '1 minute'
      then clock_timestamp() else video_engagement_private.write_limits.started_at end,
    attempts=case when video_engagement_private.write_limits.started_at<=clock_timestamp()-interval '1 minute'
      then 1 else video_engagement_private.write_limits.attempts+1 end
  where video_engagement_private.write_limits.started_at<=clock_timestamp()-interval '1 minute'
    or video_engagement_private.write_limits.attempts<60;
  if not found then raise exception 'rate_limited' using errcode='P0001'; end if;
  if not p_liked then
    -- Withdrawal does not reveal whether a now-private/removed video exists.
    delete from video_engagement_private.likes where video_id=p_video_id and user_id=viewer;
    return false;
  end if;
  select * into v from public.videos where id=p_video_id for share;
  if not found or v.visibility<>'public' or v.moderation_status not in ('clean','reported')
    or v.quarantined_at is not null or not public.media_scan_public_safe(v.scan_status)
    or not public.can_read_creator_video_row(v.owner_id::text,v.visibility,v.moderation_status,v.scan_status,
      v.storage_path,v.storage_object_key,v.playback_url,viewer::text)
  then raise exception 'Video unavailable.' using errcode='42501'; end if;
  insert into video_engagement_private.likes(video_id,user_id) values(p_video_id,viewer) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.set_creator_video_like(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_creator_video_like(uuid,boolean) to authenticated;

create function public.set_creator_video_repost(p_video_id uuid,p_reposted boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare viewer uuid:=auth.uid(); v public.videos%rowtype; profile public.user_profiles%rowtype;
begin
  if viewer is null or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(viewer::text)
  then raise exception 'Current signed-in account required.' using errcode='42501'; end if;
  if p_video_id is null or p_reposted is null then raise exception 'Video and desired state required.' using errcode='22023'; end if;
  -- Serializes with ban/account-deletion flows, then profile privacy changes,
  -- then source withdrawal. The record is never published under stale privacy.
  perform 1 from auth.users where id=viewer for share;
  select * into profile from public.user_profiles where user_id=viewer::text for share;
  if public.is_account_access_restricted(viewer::text) then raise exception 'Account unavailable.' using errcode='42501'; end if;
  if not p_reposted then
    update video_engagement_private.reposts set published=false where video_id=p_video_id and user_id=viewer and published;
    return false;
  end if;
  if profile.user_id is null or profile.shares_visibility<>'public' or profile.profile_access_visibility<>'public' or profile.profile_visibility<>'everyone'
  then raise exception 'Public profile and shares required to repost.' using errcode='42501'; end if;
  -- Shared abuse budget; accounts cannot evade it by alternating like/repost.
  insert into video_engagement_private.write_limits(user_id,started_at,attempts) values(viewer,clock_timestamp(),1)
  on conflict(user_id) do update set
    started_at=case when video_engagement_private.write_limits.started_at<=clock_timestamp()-interval '1 minute'
      then clock_timestamp() else video_engagement_private.write_limits.started_at end,
    attempts=case when video_engagement_private.write_limits.started_at<=clock_timestamp()-interval '1 minute'
      then 1 else video_engagement_private.write_limits.attempts+1 end
  where video_engagement_private.write_limits.started_at<=clock_timestamp()-interval '1 minute' or video_engagement_private.write_limits.attempts<60;
  if not found then raise exception 'rate_limited'; end if;
  select * into v from public.videos where id=p_video_id for share;
  if not found or v.visibility<>'public' or v.moderation_status not in ('clean','reported') or v.quarantined_at is not null
    or not public.media_scan_public_safe(v.scan_status)
    or not public.can_read_creator_video_row(v.owner_id::text,v.visibility,v.moderation_status,v.scan_status,
      v.storage_path,v.storage_object_key,v.playback_url,viewer::text)
  then raise exception 'Video unavailable.' using errcode='42501'; end if;
  insert into video_engagement_private.reposts(video_id,user_id) values(p_video_id,viewer)
    on conflict(video_id,user_id) do update set published=true where not video_engagement_private.reposts.published;
  return true;
end;
$$;
revoke all on function public.set_creator_video_repost(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_creator_video_repost(uuid,boolean) to authenticated;

create function public.read_creator_video_reposts(p_user_id text,p_before_created_at timestamptz default null,p_before_video_id uuid default null,p_limit integer default 24)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare item record; result jsonb:='[]'; last_at timestamptz; last_id uuid; scanned integer:=0; more boolean:=false;
begin
  if p_limit is null or p_limit<1 or p_limit>50 or (p_before_created_at is null)<>(p_before_video_id is null)
    or p_user_id is null or p_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then raise exception 'Invalid repost page.' using errcode='22023'; end if;
  if (auth.uid() is not null and not public.wave1_current_caller_authority_internal())
    or public.is_account_access_restricted(p_user_id) or not public.can_view_profile_content(p_user_id)
    or not exists(select 1 from public.user_profiles where user_id=p_user_id and shares_visibility='public')
  then return null; end if;
  for item in select r.video_id,r.created_at from video_engagement_private.reposts r
    where r.user_id=p_user_id::uuid and r.published
      and (p_before_created_at is null or (r.created_at,r.video_id)<(p_before_created_at,p_before_video_id))
    order by r.created_at desc,r.video_id desc limit p_limit+1
  loop
    scanned:=scanned+1;
    if scanned>p_limit then more:=true; exit; end if;
    last_at:=item.created_at; last_id:=item.video_id;
    if exists(select 1 from public.read_authorized_creator_video_engagement(item.video_id)) then
      result:=result||jsonb_build_array(jsonb_build_object('videoId',item.video_id,'createdAt',item.created_at));
    end if;
  end loop;
  return jsonb_build_object('items',result,'nextCursor',case when more then jsonb_build_object('createdAt',last_at,'videoId',last_id) else null end);
end;
$$;
revoke all on function public.read_creator_video_reposts(text,timestamptz,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_video_reposts(text,timestamptz,uuid,integer) to anon,authenticated;
comment on function public.read_creator_video_engagement_batch(uuid[]) is
  'At most 50 current-source-authorized public video summaries. comment_count means visible top-level discussion threads, excluding replies. 64 shards per video; no reaction identities, private messages, fabricated views or share-sheet counts.';
commit;
