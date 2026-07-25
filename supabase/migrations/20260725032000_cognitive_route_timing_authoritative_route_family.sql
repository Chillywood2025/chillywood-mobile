-- Forward-only closure for the authoritative route-family P2.
--
-- The prior rich route-timing contract bound a caller-supplied route family to
-- its own hash. A caller could therefore choose a different family and submit
-- a self-consistent hash. This migration requires the immutable Option-C
-- route/component mapping contract as a second, independent authority. The
-- existing stage, timing, installed-proof, evaluator, triage, and scheduler
-- requirements remain unchanged and fail closed.

create function
  public.product_experience_baseline_v1_mapping_route(
    p_mapping_id text
  )
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_mapping_id
    when 'home_standard_discovery_rows' then 'Home'
    when 'home_featured_hero' then 'Home'
    when 'home_creator_media_rows' then 'Home'
    when 'home_activity_discovery_cards' then 'Home'
    when 'explore_title_discovery_rows' then 'Explore'
    when 'explore_creator_video_results' then 'Explore'
    when 'explore_live_discovery_rows' then 'Explore'
    when 'search_media_results' then 'Search'
    when 'search_people_results' then 'Search'
    when 'library_title_media_rows' then 'Library'
    when 'library_creator_media_rows' then 'Library'
    when 'library_redirect_shell' then 'Library'
    when 'title_primary_artwork' then 'Title'
    when 'player_full_surface' then 'Player'
    when 'player_recommendation_rows' then 'Player'
    when 'public_channel_featured_media' then 'PublicChannel'
    when 'public_channel_creator_media_rows' then 'PublicChannel'
    when 'public_profile_creator_media_rows' then 'PublicProfile'
    when 'live_discovery_cards' then 'Live'
    when 'watch_party_discovery_rows' then 'WatchParty'
    when 'watch_party_entry_controls' then 'WatchParty'
    when 'watch_party_room_controls' then 'WatchParty'
    when 'watch_party_live_stage_surface' then 'WatchPartyLiveStage'
    when 'vertical_social_attachment' then 'VerticalPost'
    when 'compact_communication_media_preview' then 'CompactMedia'
    else null
  end
$$;

revoke all on function
  public.product_experience_baseline_v1_mapping_route(text)
from public,anon,authenticated,service_role;

create function
  public.product_experience_baseline_v1_route_family_id(
    p_route_or_surface text
  )
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_route_or_surface
    when 'Home' then 'home.main'
    when 'Explore' then 'explore.main'
    when 'Search' then 'search.main'
    when 'Library' then 'library.main'
    when 'Title' then 'title.main'
    when 'Player' then 'player.main'
    when 'PublicChannel' then 'public-channel.main'
    when 'PublicProfile' then 'public-profile.main'
    when 'Live' then 'live.main'
    when 'WatchParty' then 'watch-party.main'
    when 'WatchPartyLiveStage' then 'watch-party-live-stage.main'
    when 'VerticalPost' then 'vertical-post.main'
    when 'CompactMedia' then 'compact-media.main'
    else null
  end
$$;

revoke all on function
  public.product_experience_baseline_v1_route_family_id(text)
from public,anon,authenticated,service_role;

create function
  public.product_experience_route_timing_authoritative_family_is_valid(
    p_metric_manifest jsonb
  )
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  metrics jsonb;
  mapping_id_value text;
  mapping_route_value text;
  route_family_id_value text;
begin
  if jsonb_typeof(p_metric_manifest) <> 'object'
     or p_metric_manifest->>'observationKind' <> 'route_timing'
     or jsonb_typeof(p_metric_manifest->'metrics') <> 'object' then
    return false;
  end if;

  metrics := p_metric_manifest->'metrics';
  if not metrics ?& array[
       'routeFamilyMappingId','routeFamilyMappingHash','surfaceFamily',
       'exceptionContractId','exceptionContractHash','exceptionVersioned'
     ]
     or jsonb_typeof(metrics->'routeFamilyMappingId') <> 'string'
     or metrics->>'routeFamilyMappingId' !~
       '^[a-z0-9][a-z0-9_]{2,79}$'
     or jsonb_typeof(metrics->'routeFamilyMappingHash') <> 'string'
     or metrics->>'routeFamilyMappingHash' !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(metrics->'surfaceFamily') <> 'string'
     or metrics->>'surfaceFamily' not in (
       'standard_streaming_card',
       'live_streaming_card',
       'creator_streaming_card',
       'featured_hero_card',
       'vertical_post_card',
       'compact_media_list_item',
       'non_media_interactive_surface'
     )
     or jsonb_typeof(metrics->'exceptionVersioned') <> 'boolean'
     or jsonb_typeof(metrics->'exceptionContractId')
       not in ('null','string')
     or jsonb_typeof(metrics->'exceptionContractHash')
       not in ('null','string') then
    return false;
  end if;

  mapping_id_value := metrics->>'routeFamilyMappingId';
  mapping_route_value :=
    public.product_experience_baseline_v1_mapping_route(mapping_id_value);
  route_family_id_value :=
    public.product_experience_baseline_v1_route_family_id(
      mapping_route_value
    );

  return
    mapping_route_value is not null
    and mapping_route_value = metrics->>'routeOrSurface'
    and route_family_id_value is not null
    and route_family_id_value = metrics->>'routeFamilyId'
    and
      public.product_experience_baseline_v1_mapping_contract(
        mapping_id_value
      ) is not null
    and
      public.product_experience_baseline_v1_evidence_binding_is_valid(
        metrics
      )
    and metrics->>'routeFamilyBindingHash' =
      public.product_experience_route_family_binding_hash(
        (metrics->>'platform')::public.cognitive_platform,
        mapping_route_value,
        route_family_id_value
      );
exception
  when others then
    return false;
end;
$$;

revoke all on function
  public.product_experience_route_timing_authoritative_family_is_valid(
    jsonb
  )
from public,anon,authenticated,service_role;

alter function
  public.product_experience_route_timing_no_finding_is_valid(jsonb)
rename to
  product_experience_route_timing_no_finding_is_valid_pre_authoritative_family;

revoke all on function
  public.product_experience_route_timing_no_finding_is_valid_pre_authoritative_family(
    jsonb
  )
from public,anon,authenticated,service_role;

create function
  public.product_experience_route_timing_no_finding_is_valid(
    p_metric_manifest jsonb
  )
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  return
    public.product_experience_route_timing_no_finding_is_valid_pre_authoritative_family(
      p_metric_manifest
    )
    and
    public.product_experience_route_timing_authoritative_family_is_valid(
      p_metric_manifest
    );
exception
  when others then
    return false;
end;
$$;

revoke all on function
  public.product_experience_route_timing_no_finding_is_valid(jsonb)
from public,anon,authenticated,service_role;

create or replace function
  public.product_experience_route_timing_no_finding_binding_is_valid(
    p_platform public.cognitive_platform,
    p_route_or_surface text,
    p_runtime_identity_hash text,
    p_source_build_hash text,
    p_evidence_manifest_hash text,
    p_physical_proof_status text,
    p_metric_manifest jsonb
  )
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when not
      public.product_experience_route_timing_no_finding_is_valid(
        p_metric_manifest
      )
      then false
    else
      p_metric_manifest->'metrics'->>'platform' = p_platform::text
      and p_metric_manifest->'metrics'->>'routeOrSurface' =
        p_route_or_surface
      and p_metric_manifest->'metrics'->>'runtimeIdentityHash' =
        p_runtime_identity_hash
      and p_metric_manifest->'metrics'->>'buildRuntimeHash' =
        p_source_build_hash
      and p_metric_manifest->'metrics'->>'sanitizedEvidenceHash' =
        p_evidence_manifest_hash
      and p_metric_manifest->'metrics'->>'installedProofStatus' =
        p_physical_proof_status
      and exists (
        select 1
        from jsonb_array_elements_text(
          p_metric_manifest->'evidenceHashes'
        ) evidence_hash(value)
        where evidence_hash.value = p_evidence_manifest_hash
      )
  end
$$;

revoke all on function
  public.product_experience_route_timing_no_finding_binding_is_valid(
    public.cognitive_platform,text,text,text,text,text,jsonb
  )
from public,anon,authenticated,service_role;

-- Rebind this SQL-language dependency to the new wrapper OID. PostgreSQL
-- preserves the predecessor OID across the rename above, so leaving this
-- function untouched would let its bounded-manifest check continue to call
-- only the pre-authoritative validator.
create or replace function public.product_experience_metric_manifest_is_bounded(
  p_sentinel_key text,
  p_evidence_manifest_hash text,
  p_metric_manifest jsonb
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select
    jsonb_typeof(p_metric_manifest) = 'object'
    and pg_column_size(p_metric_manifest) <= 65536
    and (
      public.cognitive_json_is_sanitized(p_metric_manifest)
      or (
        public.product_experience_route_timing_no_finding_is_valid(
          p_metric_manifest
        )
        and public.cognitive_json_is_sanitized(
          jsonb_set(
            p_metric_manifest,
            '{metrics}',
            (p_metric_manifest->'metrics')
              - 'appVersion'
              - 'appBuild'
              - 'runtimeVersion'
              - 'channel'
          )
        )
      )
    )
    and p_metric_manifest->>'schemaVersion' = 'product-sentinel-v1'
    and p_metric_manifest->>'sanitizationVersion' =
      'bounded-nonpersonal-v1'
    and jsonb_typeof(p_metric_manifest->'observationKind') = 'string'
    and jsonb_typeof(p_metric_manifest->'metrics') = 'object'
    and (
      select count(*)
      from jsonb_object_keys(p_metric_manifest->'metrics')
    ) between 1 and 64
    and pg_column_size(p_metric_manifest->'metrics') <= 49152
    and jsonb_typeof(p_metric_manifest->'evidenceHashes') = 'array'
    and jsonb_array_length(p_metric_manifest->'evidenceHashes')
      between 1 and 32
    and not exists (
      select 1
      from jsonb_array_elements(
        p_metric_manifest->'evidenceHashes'
      ) item
      where jsonb_typeof(item) <> 'string'
        or trim(both '"' from item::text) !~ '^[a-f0-9]{64}$'
    )
    and exists (
      select 1
      from jsonb_array_elements_text(
        p_metric_manifest->'evidenceHashes'
      ) item(value)
      where item.value = p_evidence_manifest_hash
    )
    and case p_sentinel_key
      when 'livekit_experience_sentinel' then
        p_metric_manifest->>'observationKind' = 'livekit_experience'
      when 'visual_product_experience_sentinel' then
        p_metric_manifest->>'observationKind' in (
          'visual_layout',
          'touch_target'
        )
      when 'installed_journey_sentinel' then
        p_metric_manifest->>'observationKind' in (
          'installed_journey',
          'route_timing',
          'search_accessibility',
          'crash_anr'
        )
      else false
    end
$$;

revoke all on function
  public.product_experience_metric_manifest_is_bounded(text,text,jsonb)
from public,anon,authenticated,service_role;

alter table public.product_experience_sentinel_runs
  drop constraint product_experience_sentinel_runs_metric_manifest_check;
alter table public.product_experience_sentinel_runs
  add constraint product_experience_sentinel_runs_metric_manifest_check
  check (
    jsonb_typeof(metric_manifest) = 'object'
    and pg_column_size(metric_manifest) <= 65536
    and (
      public.cognitive_json_is_sanitized(metric_manifest)
      or (
        public.product_experience_route_timing_no_finding_is_valid(
          metric_manifest
        )
        and public.cognitive_json_is_sanitized(
          jsonb_set(
            metric_manifest,
            '{metrics}',
            (metric_manifest->'metrics')
              - 'appVersion'
              - 'appBuild'
              - 'runtimeVersion'
              - 'channel'
          )
        )
      )
    )
  );

comment on function
  public.product_experience_route_timing_no_finding_is_valid(jsonb)
is
  'Canonical rich route-timing no-finding schema plus exact immutable Option-C route/component mapping, family, exception, and binding-hash authority.';

comment on function
  public.product_experience_route_timing_authoritative_family_is_valid(jsonb)
is
  'Rejects caller-chosen route families unless the route, mapping ID/hash, surface family, exception contract, and canonical route-family hash match the immutable Option-C mapping contract.';
