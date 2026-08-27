-- Bind every creator-video rendition to one exact video/creator and prevent a
-- trusted worker from aliasing another row's public playback artifact.  The
-- trigger covers future writes; the deployment assertions refuse to preserve a
-- historical confused-deputy row.

create or replace function public."creator_video_rendition_binding_valid"(
  p_video_id uuid,
  p_source_id text,
  p_creator_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_video_id is null
      or p_creator_id is null
      or coalesce(p_source_id,'')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then false
    else p_source_id::uuid=p_video_id
      and exists (
        select 1
        from public."videos" video
        where video."id"=p_video_id
          and video."owner_id"=p_creator_id
      )
  end;
$$;
revoke all on function public."creator_video_rendition_binding_valid"(uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."creator_video_rendition_binding_valid"(uuid,text,uuid)
  to anon,authenticated,service_role;
comment on function public."creator_video_rendition_binding_valid"(uuid,text,uuid) is
  'Boolean-only RLS helper binding creator_video source_id, video_id, and creator_id. It returns no source or playback metadata.';

create table if not exists public."media_rendition_output_path_claims" (
  "output_path" text primary key,
  "rendition_kind" text not null,
  "rendition_id" uuid not null,
  "created_at" timestamptz not null default pg_catalog.now(),
  constraint "media_rendition_output_path_claims_kind_check"
    check ("rendition_kind" in ('media_rendition','video_rendition')),
  constraint "media_rendition_output_path_claims_nonblank_check"
    check (nullif(pg_catalog.btrim("output_path"),'') is not null)
);
alter table public."media_rendition_output_path_claims" enable row level security;
revoke all on table public."media_rendition_output_path_claims"
  from public,anon,authenticated,service_role;
comment on table public."media_rendition_output_path_claims" is
  'Internal transactional registry preventing one playback artifact from being claimed by multiple rendition rows.';

create or replace function public."media_rendition_output_paths_valid"(
  p_rendition_id uuid,
  p_public_playback_path text,
  p_manifest_path text,
  p_variant_playlist_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with supplied_paths as (
    select distinct supplied."path"
    from pg_catalog.unnest(array[
      p_public_playback_path,p_manifest_path,p_variant_playlist_path
    ]) supplied("path")
    where nullif(pg_catalog.btrim(coalesce(supplied."path",'')),'') is not null
  )
  select p_rendition_id is not null
    and not exists (
      select 1
      from supplied_paths supplied
      where not exists (
        select 1
        from public."media_rendition_output_path_claims" claim
        where claim."output_path"=supplied."path"
          and claim."rendition_kind"='media_rendition'
          and claim."rendition_id"=p_rendition_id
      )
    );
$$;
revoke all on function public."media_rendition_output_paths_valid"(uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public."media_rendition_output_paths_valid"(uuid,text,text,text)
  to anon,authenticated,service_role;
comment on function public."media_rendition_output_paths_valid"(uuid,text,text,text) is
  'Boolean-only RLS helper proving that every supplied playback path is transactionally claimed by the exact rendition row.';

create or replace function public."enforce_media_rendition_source_and_path_binding"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paths text[];
  v_path text;
  v_claimed boolean;
begin
  if new."source_type"='creator_video'
    and not public."creator_video_rendition_binding_valid"(
      new."video_id",new."source_id",new."creator_id"
    )
  then
    raise exception 'creator_video_rendition_source_binding_invalid';
  end if;

  select pg_catalog.array_agg(candidate."path" order by candidate."path")
  into v_paths
  from (
    select distinct supplied."path"
    from pg_catalog.unnest(array[
      new."public_playback_path",new."manifest_path",new."variant_playlist_path"
    ]) supplied("path")
    where nullif(pg_catalog.btrim(coalesce(supplied."path",'')),'') is not null
  ) candidate;

  if coalesce(pg_catalog.cardinality(v_paths),0)>0 then
    -- The claim table's primary key arbitrates concurrent writers even when a
    -- blocked READ COMMITTED statement retains its pre-wait query snapshot.
    foreach v_path in array v_paths loop
      v_claimed:=false;
      insert into public."media_rendition_output_path_claims"(
        "output_path","rendition_kind","rendition_id"
      ) values (v_path,'media_rendition',new."id")
      on conflict ("output_path") do update
        set "rendition_id"=excluded."rendition_id"
        where public."media_rendition_output_path_claims"."rendition_kind"
          =excluded."rendition_kind"
          and public."media_rendition_output_path_claims"."rendition_id"
            =excluded."rendition_id"
      returning true into v_claimed;

      if not coalesce(v_claimed,false) then
        raise exception 'media_rendition_output_path_reused';
      end if;
    end loop;
  end if;

  return new;
end;
$$;
revoke all on function public."enforce_media_rendition_source_and_path_binding"()
  from public,anon,authenticated,service_role;

create or replace function public."release_media_rendition_output_path_claims"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='DELETE' then
    delete from public."media_rendition_output_path_claims" claim
    where claim."rendition_kind"='media_rendition'
      and claim."rendition_id"=old."id";
    return old;
  end if;
  delete from public."media_rendition_output_path_claims" claim
  where claim."rendition_kind"='media_rendition'
    and claim."rendition_id"=new."id"
    and claim."output_path"<>all(array[
      coalesce(new."public_playback_path",''),coalesce(new."manifest_path",''),
      coalesce(new."variant_playlist_path",'')]);
  return new;
end;
$$;
revoke all on function public."release_media_rendition_output_path_claims"()
  from public,anon,authenticated,service_role;

do $$
begin
  if exists (
    select 1
    from public."media_renditions" rendition
    where rendition."source_type"='creator_video'
      and not public."creator_video_rendition_binding_valid"(
        rendition."video_id",rendition."source_id",rendition."creator_id"
      )
  ) then
    raise exception 'historical_creator_video_rendition_source_binding_invalid';
  end if;

  if exists (
    select 1 from public."video_renditions" rendition
    join public."videos" video on video."id"=rendition."video_id"
    where rendition."owner_id" is distinct from video."owner_id"
  ) then
    raise exception 'historical_video_rendition_owner_binding_invalid';
  end if;

  if exists (
    with expanded_paths as (
      select 'media_rendition'::text as kind,rendition."id",output_path."path"
      from public."media_renditions" rendition
      cross join lateral pg_catalog.unnest(array[
        rendition."public_playback_path",
        rendition."manifest_path",
        rendition."variant_playlist_path"
      ]) output_path("path")
      where nullif(pg_catalog.btrim(coalesce(output_path."path",'')),'') is not null
      union all
      select 'video_rendition',rendition."id",output_path."path"
      from public."video_renditions" rendition
      cross join lateral pg_catalog.unnest(array[
        rendition."storage_path",rendition."manifest_path"
      ]) output_path("path")
      where nullif(pg_catalog.btrim(coalesce(output_path."path",'')),'') is not null
    )
    select 1
    from expanded_paths
    group by expanded_paths."path"
    having count(distinct expanded_paths."kind"||':'||expanded_paths."id"::text)>1
  ) then
    raise exception 'historical_media_rendition_output_path_reused';
  end if;
end;
$$;

insert into public."media_rendition_output_path_claims"(
  "output_path","rendition_kind","rendition_id"
)
select distinct output_path."path",'media_rendition',rendition."id"
from public."media_renditions" rendition
cross join lateral pg_catalog.unnest(array[
  rendition."public_playback_path",
  rendition."manifest_path",
  rendition."variant_playlist_path"
]) output_path("path")
where nullif(pg_catalog.btrim(coalesce(output_path."path",'')),'') is not null
union all
select distinct output_path."path",'video_rendition',rendition."id"
from public."video_renditions" rendition
cross join lateral pg_catalog.unnest(array[
  rendition."storage_path",rendition."manifest_path"
]) output_path("path")
where nullif(pg_catalog.btrim(coalesce(output_path."path",'')),'') is not null
on conflict ("output_path") do update
  set "rendition_id"=excluded."rendition_id"
  where public."media_rendition_output_path_claims"."rendition_kind"
    =excluded."rendition_kind"
    and public."media_rendition_output_path_claims"."rendition_id"
      =excluded."rendition_id";

drop trigger if exists "zy_enforce_media_rendition_source_and_path_binding"
  on public."media_renditions";
create trigger "zy_enforce_media_rendition_source_and_path_binding"
  before insert or update of
    "source_type","source_id","video_id","creator_id",
    "public_playback_path","manifest_path","variant_playlist_path"
  on public."media_renditions"
  for each row execute function public."enforce_media_rendition_source_and_path_binding"();

drop trigger if exists "zz_release_media_rendition_output_path_claims"
  on public."media_renditions";
create trigger "zz_release_media_rendition_output_path_claims"
  after update of "public_playback_path","manifest_path","variant_playlist_path"
    or delete
  on public."media_renditions"
  for each row execute function public."release_media_rendition_output_path_claims"();

create or replace function public."video_rendition_binding_valid"(
  p_video_id uuid,p_owner_id uuid
)
returns boolean language sql stable security definer set search_path=''
as $$
  select p_video_id is not null and p_owner_id is not null and exists (
    select 1 from public."videos" video
    where video."id"=p_video_id and video."owner_id"=p_owner_id
  );
$$;
revoke all on function public."video_rendition_binding_valid"(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."video_rendition_binding_valid"(uuid,uuid)
  to anon,authenticated,service_role;

create or replace function public."video_rendition_output_paths_valid"(
  p_rendition_id uuid,p_storage_path text,p_manifest_path text
)
returns boolean language sql stable security definer set search_path=''
as $$
  with supplied_paths as (
    select distinct supplied."path"
    from pg_catalog.unnest(array[p_storage_path,p_manifest_path]) supplied("path")
    where nullif(pg_catalog.btrim(coalesce(supplied."path",'')),'') is not null
  )
  select p_rendition_id is not null and not exists (
    select 1 from supplied_paths supplied where not exists (
      select 1 from public."media_rendition_output_path_claims" claim
      where claim."output_path"=supplied."path"
        and claim."rendition_kind"='video_rendition'
        and claim."rendition_id"=p_rendition_id
    )
  );
$$;
revoke all on function public."video_rendition_output_paths_valid"(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public."video_rendition_output_paths_valid"(uuid,text,text)
  to anon,authenticated,service_role;

create or replace function public."enforce_video_rendition_binding_and_paths"()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_paths text[]; v_path text; v_claimed boolean;
begin
  if not public."video_rendition_binding_valid"(new."video_id",new."owner_id") then
    raise exception 'video_rendition_owner_binding_invalid';
  end if;
  select pg_catalog.array_agg(candidate."path" order by candidate."path") into v_paths
  from (
    select distinct supplied."path"
    from pg_catalog.unnest(array[new."storage_path",new."manifest_path"]) supplied("path")
    where nullif(pg_catalog.btrim(coalesce(supplied."path",'')),'') is not null
  ) candidate;
  if coalesce(pg_catalog.cardinality(v_paths),0)>0 then
    foreach v_path in array v_paths loop
      v_claimed:=false;
      insert into public."media_rendition_output_path_claims"(
        "output_path","rendition_kind","rendition_id"
      ) values (v_path,'video_rendition',new."id")
      on conflict ("output_path") do update set "rendition_id"=excluded."rendition_id"
      where public."media_rendition_output_path_claims"."rendition_kind"=excluded."rendition_kind"
        and public."media_rendition_output_path_claims"."rendition_id"=excluded."rendition_id"
      returning true into v_claimed;
      if not coalesce(v_claimed,false) then
        raise exception 'media_rendition_output_path_reused';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public."enforce_video_rendition_binding_and_paths"()
  from public,anon,authenticated,service_role;

create or replace function public."release_video_rendition_output_path_claims"()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='DELETE' then
    delete from public."media_rendition_output_path_claims" claim
    where claim."rendition_kind"='video_rendition' and claim."rendition_id"=old."id";
    return old;
  end if;
  delete from public."media_rendition_output_path_claims" claim
  where claim."rendition_kind"='video_rendition' and claim."rendition_id"=new."id"
    and claim."output_path"<>all(array[
      coalesce(new."storage_path",''),coalesce(new."manifest_path",'')]);
  return new;
end;
$$;
revoke all on function public."release_video_rendition_output_path_claims"()
  from public,anon,authenticated,service_role;

drop trigger if exists "aa_enforce_video_rendition_binding_and_paths"
  on public."video_renditions";
create trigger "aa_enforce_video_rendition_binding_and_paths"
  before insert or update of "video_id","owner_id","storage_path","manifest_path"
  on public."video_renditions" for each row
  execute function public."enforce_video_rendition_binding_and_paths"();
drop trigger if exists "zz_release_video_rendition_output_path_claims"
  on public."video_renditions";
create trigger "zz_release_video_rendition_output_path_claims"
  after update of "storage_path","manifest_path" or delete
  on public."video_renditions" for each row
  execute function public."release_video_rendition_output_path_claims"();

-- Rendition rows contain reusable source, manifest, and object paths. Direct
-- Data API ownership is therefore not enough: a still-valid JWT must belong to
-- the exact current Wave 1 session and an unrestricted account. Staff preview
-- is intentionally not a direct-table exception because SELECT RLS cannot
-- produce the required per-object moderation audit; staff use the audited
-- media-storage endpoint instead.
create or replace function public."creator_rendition_direct_owner_authorized"(
  p_creator_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_creator_id is not null
    and auth.uid()=p_creator_id
    and public."wave1_current_caller_authority_internal"()
    and not public."is_account_access_restricted"(auth.uid()::text);
$$;
revoke all on function public."creator_rendition_direct_owner_authorized"(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."creator_rendition_direct_owner_authorized"(uuid)
  to authenticated;
comment on function public."creator_rendition_direct_owner_authorized"(uuid) is
  'Boolean-only direct rendition owner gate. Requires the exact current Wave 1 session and an unrestricted exact owner; staff must use the audited media endpoint.';

create or replace function public."creator_video_rendition_parent_read_safe"(
  p_video_id uuid,
  p_creator_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_video_id is not null
    and p_creator_id is not null
    and public."creator_rendition_direct_owner_authorized"(p_creator_id)
    and exists (
      select 1
      from public."videos" video
      where video."id"=p_video_id
        and video."owner_id"=p_creator_id
        and video."quarantined_at" is null
        and video."moderation_status" in ('clean','reported')
        and public."media_scan_public_safe"(video."scan_status")
    );
$$;
revoke all on function public."creator_video_rendition_parent_read_safe"(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."creator_video_rendition_parent_read_safe"(uuid,uuid)
  to authenticated;
comment on function public."creator_video_rendition_parent_read_safe"(uuid,uuid) is
  'Boolean-only direct-read parent gate. Requires an exact creator/video binding plus current clean scan, non-quarantined state, and allowed moderation state.';

drop policy if exists "video_renditions_select_owner_operator"
  on public."video_renditions";
create policy "video_renditions_select_owner_operator"
  on public."video_renditions" for select to authenticated using (
    public."creator_rendition_direct_owner_authorized"("owner_id")
    and "status"='ready'
    and "quality_label"<>'original'
    and "quarantined_at" is null
    and public."media_scan_public_safe"("scan_status")
    and public."video_rendition_binding_valid"("video_id","owner_id")
    and public."video_rendition_output_paths_valid"(
      "id","storage_path","manifest_path"
    )
    and public."creator_video_rendition_parent_read_safe"(
      "video_id","owner_id"
    )
  );

-- Policies are permissive/OR-combined, so both the public path and the creator
-- owner path must reject a malformed creator/video binding.
drop policy if exists "media_renditions_select_owner_operator"
  on public."media_renditions";
create policy "media_renditions_select_owner_operator"
  on public."media_renditions"
  for select
  to authenticated
  using (
    public."creator_rendition_direct_owner_authorized"("creator_id")
    and "is_ready"=true
    and "is_original"=false
    and public."media_scan_public_safe"("scan_status")
    and "moderation_status" in ('clean','approved','allowed')
    and "source_type"='creator_video'
    and public."creator_video_rendition_binding_valid"(
      "video_id","source_id","creator_id"
    )
    and public."creator_video_rendition_parent_read_safe"(
      "video_id","creator_id"
    )
    and public."media_rendition_output_paths_valid"(
      "id","public_playback_path","manifest_path","variant_playlist_path"
    )
  );

drop policy if exists "media_renditions_select_public_safe_metadata"
  on public."media_renditions";
create policy "media_renditions_select_public_safe_metadata"
  on public."media_renditions"
  for select
  to anon,authenticated
  using (
    "is_ready"=true
    and "is_public_playback_safe"=true
    and "visibility"='public'
    and "is_original"=false
    and "delivery_provider"='cloudflare_r2_custom_domain'
    and "storage_provider"='cloudflare_r2'
    and "bucket_role"='public_playback'
    and "scan_status" in ('clean','approved')
    and "moderation_status" in ('clean','approved','allowed')
    and "public_playback_path" like 'playback/public/%'
    and "public_playback_path"
      !~ '(^|/)(originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned)(/|$)'
    and public."media_rendition_output_paths_valid"(
      "id","public_playback_path","manifest_path","variant_playlist_path"
    )
    and (
      "source_type"='proof_demo'
      or (
        "source_type"='creator_video'
        and public."creator_video_rendition_binding_valid"(
          "video_id","source_id","creator_id"
        )
        and public."creator_video_commerce_access_allowed"("video_id")
      )
    )
  );

-- Storage policies are another permissive authorization path and must prove
-- the same legacy row/path binding before disclosing an object.
drop policy if exists "creator_videos_storage_select_visibility_access"
  on storage."objects";
create policy "creator_videos_storage_select_visibility_access"
  on storage."objects" for select to public using (
    "bucket_id"='creator-videos' and (
      (auth.uid() is not null and (storage."foldername"("name"))[1]=auth.uid()::text)
      or exists (
        select 1 from public."videos" video
        where (video."storage_path"=storage."objects"."name"
          or video."storage_object_key"=storage."objects"."name"
          or video."thumb_storage_path"=storage."objects"."name"
          or video."playback_url"=storage."objects"."name")
          and public."can_read_creator_video_row"(
            video."owner_id"::text,video."visibility",video."moderation_status",video."scan_status",
            video."storage_path",video."storage_object_key",video."playback_url",auth.uid()::text)
      )
      or exists (
        select 1 from public."video_renditions" rendition
        join public."videos" video on video."id"=rendition."video_id"
        where rendition."storage_bucket"=storage."objects"."bucket_id"
          and (rendition."storage_path"=storage."objects"."name"
            or rendition."manifest_path"=storage."objects"."name")
          and rendition."status"='ready' and rendition."quality_label"<>'original'
          and public."media_scan_public_safe"(rendition."scan_status")
          and public."video_rendition_binding_valid"(
            rendition."video_id",rendition."owner_id")
          and public."video_rendition_output_paths_valid"(
            rendition."id",rendition."storage_path",rendition."manifest_path")
          and public."can_read_creator_video_row"(
            video."owner_id"::text,video."visibility",video."moderation_status",video."scan_status",
            video."storage_path",video."storage_object_key",video."playback_url",auth.uid()::text)
      )
      or public."has_platform_role"(array['owner'::text,'operator'::text])
    )
  );

drop policy if exists "creator_videos_storage_select_premium_renditions"
  on storage."objects";
create policy "creator_videos_storage_select_premium_renditions"
  on storage."objects" for select to authenticated using (
    "bucket_id"='creator-videos' and exists (
      select 1 from public."video_renditions" rendition
      join public."videos" video on video."id"=rendition."video_id"
      where rendition."storage_bucket"=storage."objects"."bucket_id"
        and (rendition."storage_path"=storage."objects"."name"
          or rendition."manifest_path"=storage."objects"."name")
        and rendition."status"='ready' and rendition."quality_label"<>'original'
        and rendition."access_tier"='premium'
        and public."media_scan_public_safe"(rendition."scan_status")
        and public."video_rendition_binding_valid"(
          rendition."video_id",rendition."owner_id")
        and public."video_rendition_output_paths_valid"(
          rendition."id",rendition."storage_path",rendition."manifest_path")
        and public."premium_subject_has_finite_authority_internal"(auth.uid()::text)
        and public."can_read_creator_video_row"(
          video."owner_id"::text,video."visibility",video."moderation_status",video."scan_status",
          video."storage_path",video."storage_object_key",video."playback_url",auth.uid()::text)
    )
  );
