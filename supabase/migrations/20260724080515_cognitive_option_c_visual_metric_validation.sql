-- Forward-only Option C metric validation for the installed visual sentinel.
--
-- Preserve the previously reviewed LiveKit and installed-journey contracts,
-- but replace the generic visual-layout and Android-only touch-target shapes
-- with the Owner-selected creator-balanced baseline contract.  This is a
-- measurement boundary only: it grants no UI, source, release, or deployment
-- authority.

alter function public.product_experience_detailed_metric_manifest_is_valid(
  text, public.cognitive_platform, text, jsonb
) rename to product_experience_metric_manifest_is_valid_pre_option_c;

revoke all on function
  public.product_experience_metric_manifest_is_valid_pre_option_c(
    text, public.cognitive_platform, text, jsonb
  )
from public, anon, authenticated, service_role;

create function public.product_experience_option_c_visual_layout_is_valid(
  p_platform public.cognitive_platform,
  p_result_status text,
  p_metrics jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  metric_name text;
  unit_value text;
  preferred_threshold numeric;
  applicable_minimum numeric;
  media_width numeric;
  media_height numeric;
  container_width numeric;
  container_height numeric;
  viewport_width numeric;
  viewport_height numeric;
  metadata_height numeric;
  width_ratio numeric;
  height_ratio numeric;
  surface_family text;
  baseline_applicability text;
  reference_viewport text;
  exception_type text;
  baseline_hash constant text :=
    '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184';
begin
  if p_platform not in ('android', 'ios', 'web')
     or p_result_status not in (
       'passed', 'failed', 'blocked', 'finding_created'
     )
     or jsonb_typeof(p_metrics) <> 'object'
     or not p_metrics ?& array[
       'platform','measurementUnit','surfaceFamily',
       'baselineApplicability','referenceViewport','orientation',
       'windowClass','layoutMode','mediaFrameWidth','mediaFrameHeight',
       'totalCardContainerWidth','totalCardContainerHeight',
       'metadataBandHeight','viewportWidth','viewportHeight',
       'cardViewportWidthRatio','cardViewportHeightRatio',
       'horizontalCardsVisible','cardsAboveFold','aspectRatioClass',
       'horizontalMargin','horizontalGap','columnGap','verticalRowGap',
       'columnCount','creatorIdentityVisible','liveStateVisible',
       'liveContent','titleLineCount','metadataLineCount',
       'interactiveTargetWidth','interactiveTargetHeight',
       'interactivePreferredThreshold','interactiveApplicableMinimumThreshold',
       'accessibilityNamePresent','accessibilityRolePresent',
       'baselineId','baselineVersion','baselineState',
       'baselineComparisonHash','evidenceQuality','evidenceQualityHash',
       'componentIdentityHash','routeFamilyMappingHash',
       'automationStatus','providerState','contentState',
       'observedClassification','exceptionVersioned','exceptionType',
       'exceptionContractHash','featuredPlacement','screenDensityDpi'
     ]
     or exists (
       select 1
       from jsonb_object_keys(p_metrics) key(value)
       where key.value ~* (
         '(^|_)(expected(result|classification)?|seed(ed|edresult)?|'
         || 'ownercomplaint|shouldfail|desiredresult)($|_)'
       )
     ) then
    return false;
  end if;

  if p_metrics->>'platform' <> p_platform::text then
    return false;
  end if;

  unit_value := case p_platform
    when 'android' then 'dp'
    when 'ios' then 'pt'
    when 'web' then 'css_px'
    else null
  end;
  preferred_threshold := case p_platform
    when 'android' then 48
    when 'ios' then 44
    when 'web' then 44
    else null
  end;
  applicable_minimum := case p_platform
    when 'android' then 48
    when 'ios' then 44
    when 'web' then 24
    else null
  end;

  if p_metrics->>'measurementUnit' <> unit_value
     or jsonb_typeof(p_metrics->'interactivePreferredThreshold') <> 'number'
     or (p_metrics->>'interactivePreferredThreshold')::numeric
        <> preferred_threshold
     or jsonb_typeof(
          p_metrics->'interactiveApplicableMinimumThreshold'
        ) <> 'number'
     or (p_metrics->>'interactiveApplicableMinimumThreshold')::numeric
        <> applicable_minimum then
    return false;
  end if;

  foreach metric_name in array array[
    'mediaFrameWidth','mediaFrameHeight','totalCardContainerWidth',
    'totalCardContainerHeight','metadataBandHeight','viewportWidth',
    'viewportHeight','cardViewportWidthRatio','cardViewportHeightRatio',
    'horizontalCardsVisible','cardsAboveFold','horizontalMargin',
    'horizontalGap','columnGap','verticalRowGap','columnCount',
    'titleLineCount','metadataLineCount','interactiveTargetWidth',
    'interactiveTargetHeight'
  ] loop
    if jsonb_typeof(p_metrics->metric_name) <> 'number' then
      return false;
    end if;
  end loop;

  media_width := (p_metrics->>'mediaFrameWidth')::numeric;
  media_height := (p_metrics->>'mediaFrameHeight')::numeric;
  container_width := (p_metrics->>'totalCardContainerWidth')::numeric;
  container_height := (p_metrics->>'totalCardContainerHeight')::numeric;
  metadata_height := (p_metrics->>'metadataBandHeight')::numeric;
  viewport_width := (p_metrics->>'viewportWidth')::numeric;
  viewport_height := (p_metrics->>'viewportHeight')::numeric;
  width_ratio := (p_metrics->>'cardViewportWidthRatio')::numeric;
  height_ratio := (p_metrics->>'cardViewportHeightRatio')::numeric;
  surface_family := p_metrics->>'surfaceFamily';
  baseline_applicability := p_metrics->>'baselineApplicability';
  reference_viewport := p_metrics->>'referenceViewport';
  exception_type := p_metrics->>'exceptionType';

  if media_width not between 0 and 4096
     or media_height not between 0 and 4096
     or container_width not between 1 and 8192
     or container_height not between 1 and 8192
     or metadata_height not between 0 and 2048
     or viewport_width not between 1 and 8192
     or viewport_height not between 1 and 8192
     or width_ratio not between 0 and 2
     or height_ratio not between 0 and 2
     or abs(width_ratio - container_width / viewport_width) > 0.02
     or abs(height_ratio - container_height / viewport_height) > 0.02
     or (p_metrics->>'horizontalCardsVisible')::numeric
        not between 0 and 20
     or (p_metrics->>'cardsAboveFold')::numeric not between 0 and 100
     or (p_metrics->>'horizontalMargin')::numeric not between 0 and 512
     or (p_metrics->>'horizontalGap')::numeric not between 0 and 512
     or (p_metrics->>'columnGap')::numeric not between 0 and 512
     or (p_metrics->>'verticalRowGap')::numeric not between 0 and 512
     or (p_metrics->>'columnCount')::numeric not between 1 and 12
     or (p_metrics->>'columnCount')::numeric
        <> trunc((p_metrics->>'columnCount')::numeric)
     or (p_metrics->>'titleLineCount')::numeric not between 0 and 20
     or (p_metrics->>'titleLineCount')::numeric
        <> trunc((p_metrics->>'titleLineCount')::numeric)
     or (p_metrics->>'metadataLineCount')::numeric not between 0 and 20
     or (p_metrics->>'metadataLineCount')::numeric
        <> trunc((p_metrics->>'metadataLineCount')::numeric)
     or (p_metrics->>'interactiveTargetWidth')::numeric
        not between 0 and 2048
     or (p_metrics->>'interactiveTargetHeight')::numeric
        not between 0 and 2048
     or jsonb_typeof(p_metrics->'creatorIdentityVisible') <> 'boolean'
     or jsonb_typeof(p_metrics->'liveStateVisible') <> 'boolean'
     or jsonb_typeof(p_metrics->'liveContent') <> 'boolean'
     or jsonb_typeof(p_metrics->'accessibilityNamePresent') <> 'boolean'
     or jsonb_typeof(p_metrics->'accessibilityRolePresent') <> 'boolean'
     or jsonb_typeof(p_metrics->'exceptionVersioned') <> 'boolean'
     or surface_family not in (
       'standard_streaming_card','live_streaming_card',
       'creator_streaming_card','featured_hero_card',
       'vertical_post_card','compact_media_list_item',
       'non_media_interactive_surface'
     )
     or p_metrics->>'orientation' not in ('portrait','landscape')
     or p_metrics->>'windowClass' not in (
       'compact','medium','expanded'
     )
     or p_metrics->>'layoutMode' not in (
       'horizontal_row','grid','full_width','compact_list','non_media'
     )
     or p_metrics->>'aspectRatioClass' not in (
       '16:9','9:16','4:5','1:1','not_applicable'
     )
     or reference_viewport not in (
       'phone_portrait_390x844','tablet_portrait_1024x1366',
       'non_reference'
     )
     or baseline_applicability not in (
       'option_c_default','explicit_versioned_exception'
     )
     or p_metrics->>'evidenceQuality' not in (
       'measured_installed','measured_simulator',
       'bounded_source_only','insufficient'
     )
     or p_metrics->>'automationStatus' not in (
       'observed','partial','failed','not_available'
     )
     or p_metrics->>'providerState' not in (
       'healthy','degraded','blocked','unknown','not_applicable'
     )
     or p_metrics->>'contentState' not in (
       'loaded','partial','empty','loading','error','not_applicable'
     )
     or p_metrics->>'observedClassification' not in (
       'within_baseline','confirmed_baseline_violation',
       'accessibility_violation','route_specific_exception',
       'content_data_absence','provider_blocked','automation_failure',
       'baseline_ambiguity'
     )
     or p_metrics->>'baselineId' <>
        'chillywood-product-experience-baseline-v1'
     or jsonb_typeof(p_metrics->'baselineVersion') <> 'number'
     or (p_metrics->>'baselineVersion')::numeric <> 1
     or p_metrics->>'baselineState' not in (
       'needs_product_baseline_review','approved_baseline'
     )
     or p_metrics->>'evidenceQualityHash' !~ '^[a-f0-9]{64}$'
     or p_metrics->>'componentIdentityHash' !~ '^[a-f0-9]{64}$'
     or p_metrics->>'routeFamilyMappingHash' !~ '^[a-f0-9]{64}$'
     or (
       p_metrics->>'baselineState' = 'approved_baseline'
       and (
         jsonb_typeof(p_metrics->'baselineComparisonHash') <> 'string'
         or p_metrics->>'baselineComparisonHash' <> baseline_hash
       )
     )
     or (
       p_metrics->>'baselineState' = 'needs_product_baseline_review'
       and p_metrics->'baselineComparisonHash' <> 'null'::jsonb
     )
     or (
       p_platform = 'android'
       and (
         jsonb_typeof(p_metrics->'screenDensityDpi') <> 'number'
         or (p_metrics->>'screenDensityDpi')::numeric
            not between 72 and 1000
       )
     )
     or (
       p_platform in ('ios','web')
       and p_metrics->'screenDensityDpi' <> 'null'::jsonb
     ) then
    return false;
  end if;

  -- Media-frame geometry remains separate from the total card container and
  -- its metadata band.  Non-media controls explicitly measure a zero media
  -- frame instead of borrowing a media-card ratio.
  if surface_family = 'non_media_interactive_surface' then
    if media_width <> 0
       or media_height <> 0
       or metadata_height <> 0
       or p_metrics->>'aspectRatioClass' <> 'not_applicable' then
      return false;
    end if;
  elsif media_width <= 0
        or media_height <= 0
        or container_width < media_width
        or container_height < media_height + metadata_height then
    return false;
  end if;

  -- Default Option C streaming/discovery families may not silently opt into a
  -- route-local exception.  Every excluded family carries a versioned,
  -- hash-bound exception; featured content is restricted to the first row.
  if surface_family in (
       'standard_streaming_card','live_streaming_card',
       'creator_streaming_card'
     ) then
    if baseline_applicability <> 'option_c_default'
       or p_metrics->'exceptionVersioned' <> 'false'::jsonb
       or exception_type <> 'none'
       or p_metrics->'exceptionContractHash' <> 'null'::jsonb
       or p_metrics->>'featuredPlacement' <> 'not_applicable' then
      return false;
    end if;
  else
    if baseline_applicability <> 'explicit_versioned_exception'
       or p_metrics->'exceptionVersioned' <> 'true'::jsonb
       or jsonb_typeof(p_metrics->'exceptionContractHash') <> 'string'
       or p_metrics->>'exceptionContractHash' !~ '^[a-f0-9]{64}$'
       or exception_type <> (case surface_family
         when 'featured_hero_card' then 'featured_hero'
         when 'vertical_post_card' then 'vertical_short_form'
         when 'compact_media_list_item' then 'compact_media_list'
         when 'non_media_interactive_surface' then 'non_media_surface'
         else null
       end)
       or (
         surface_family = 'featured_hero_card'
         and p_metrics->>'featuredPlacement' <> 'first_row'
       )
       or (
         surface_family <> 'featured_hero_card'
         and p_metrics->>'featuredPlacement' <> 'not_applicable'
       ) then
      return false;
    end if;
  end if;

  if surface_family = 'live_streaming_card'
     and p_metrics->'liveContent' <> 'true'::jsonb then
    return false;
  end if;

  -- A run may record bounded deviations, ambiguity, provider blocks, or
  -- automation failure.  It may be called a pass only after measured evidence
  -- demonstrates the approved baseline, the platform-preferred target, and
  -- the exact result classification.
  if p_result_status = 'passed' then
    if p_metrics->>'baselineState' <> 'approved_baseline'
       or p_metrics->>'evidenceQuality' not in (
         'measured_installed','measured_simulator'
       )
       or p_metrics->>'automationStatus' <> 'observed'
       or p_metrics->>'providerState' not in (
         'healthy','not_applicable'
       )
       or p_metrics->>'contentState' not in (
         'loaded','partial','not_applicable'
       )
       or p_metrics->>'observedClassification' not in (
         'within_baseline','route_specific_exception'
       )
       or (p_metrics->>'interactiveTargetWidth')::numeric <
          preferred_threshold
       or (p_metrics->>'interactiveTargetHeight')::numeric <
          preferred_threshold
       or p_metrics->'accessibilityNamePresent' <> 'true'::jsonb
       or p_metrics->'accessibilityRolePresent' <> 'true'::jsonb then
      return false;
    end if;

    if surface_family in (
         'standard_streaming_card','live_streaming_card',
         'creator_streaming_card'
       ) and (
         p_metrics->>'aspectRatioClass' <> '16:9'
         or abs(media_width / media_height - 16::numeric / 9) > 0.02
         or (p_metrics->>'titleLineCount')::numeric > 2
         or (p_metrics->>'metadataLineCount')::numeric > 2
         or p_metrics->'creatorIdentityVisible' <> 'true'::jsonb
         or (
           p_metrics->'liveContent' = 'true'::jsonb
           and p_metrics->'liveStateVisible' <> 'true'::jsonb
         )
       ) then
      return false;
    end if;

    if reference_viewport = 'phone_portrait_390x844' then
      if viewport_width <> 390
         or viewport_height <> 844
         or p_metrics->>'orientation' <> 'portrait'
         or p_metrics->>'windowClass' <> 'compact'
         or p_metrics->>'layoutMode' <> 'horizontal_row'
         or media_width not between 248 and 256
         or media_height not between 138 and 146
         or (p_metrics->>'horizontalMargin')::numeric
            not between 14 and 18
         or (p_metrics->>'horizontalGap')::numeric not between 10 and 14
         or (p_metrics->>'verticalRowGap')::numeric not between 18 and 22
         or (p_metrics->>'horizontalCardsVisible')::numeric
            not between 1.35 and 1.49
         or (p_metrics->>'cardsAboveFold')::numeric not between 3 and 4
         or (p_metrics->>'columnCount')::numeric <> 1 then
        return false;
      end if;
    elsif reference_viewport = 'tablet_portrait_1024x1366' then
      if viewport_width <> 1024
         or viewport_height <> 1366
         or p_metrics->>'orientation' <> 'portrait'
         or p_metrics->>'windowClass' not in ('medium','expanded')
         or p_metrics->>'layoutMode' <> 'grid'
         or media_width not between 303 and 311
         or media_height not between 169 and 177
         or (p_metrics->>'horizontalMargin')::numeric
            not between 30 and 34
         or (p_metrics->>'columnGap')::numeric not between 18 and 22
         or (p_metrics->>'verticalRowGap')::numeric not between 22 and 26
         or (p_metrics->>'horizontalCardsVisible')::numeric
            not between 2.9 and 3.1
         or (p_metrics->>'cardsAboveFold')::numeric not between 6 and 9
         or (p_metrics->>'columnCount')::numeric <> 3 then
        return false;
      end if;
    elsif baseline_applicability = 'option_c_default' then
      if (
           p_metrics->>'windowClass' = 'compact'
           and p_metrics->>'orientation' = 'portrait'
           and (
             p_metrics->>'layoutMode' <> 'horizontal_row'
             or (p_metrics->>'columnCount')::numeric <> 1
           )
         )
         or (
           p_metrics->>'windowClass' = 'compact'
           and p_metrics->>'orientation' = 'landscape'
           and (
             p_metrics->>'layoutMode' <> 'grid'
             or (p_metrics->>'columnCount')::numeric <> 2
           )
         )
         or (
           p_metrics->>'windowClass' in ('medium','expanded')
           and (
             p_metrics->>'layoutMode' <> 'grid'
             or (p_metrics->>'columnCount')::numeric not between 3 and 4
           )
         ) then
        return false;
      end if;
    end if;
  elsif p_result_status in ('failed','finding_created') then
    if p_metrics->>'baselineState' <> 'approved_baseline'
       or p_metrics->>'evidenceQuality' not in (
         'measured_installed','measured_simulator'
       )
       or p_metrics->>'automationStatus' <> 'observed'
       or p_metrics->>'observedClassification' not in (
         'confirmed_baseline_violation','accessibility_violation'
       ) then
      return false;
    end if;
  elsif p_result_status = 'blocked'
        and p_metrics->>'observedClassification' not in (
          'content_data_absence','provider_blocked','automation_failure',
          'baseline_ambiguity'
        ) then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.product_experience_option_c_visual_layout_is_valid(
  public.cognitive_platform, text, jsonb
) from public, anon, authenticated, service_role;

create function public.product_experience_option_c_touch_target_is_valid(
  p_platform public.cognitive_platform,
  p_result_status text,
  p_metrics jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  unit_value text;
  preferred_threshold numeric;
  applicable_minimum numeric;
  effective_width numeric;
  effective_height numeric;
  target_classification text;
  baseline_hash constant text :=
    '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184';
begin
  if p_platform not in ('android','ios','web')
     or p_result_status not in (
       'passed','failed','blocked','finding_created'
     )
     or jsonb_typeof(p_metrics) <> 'object'
     or not p_metrics ?& array[
       'platform','measurementUnit','surfaceFamily',
       'interactiveTargetWidth','interactiveTargetHeight',
       'interactiveAncestorPresent','interactiveAncestorWidth',
       'interactiveAncestorHeight','isActuallyInteractive',
       'preferredThreshold','applicableMinimumThreshold',
       'accessibilityNamePresent','accessibilityRolePresent',
       'screenDensityDpi','targetClassification','baselineId',
       'baselineVersion','baselineState','baselineComparisonHash',
       'evidenceQuality','evidenceQualityHash','componentIdentityHash',
       'routeFamilyMappingHash','automationStatus','providerState',
       'contentState','exceptionVersioned','exceptionType',
       'exceptionContractHash'
     ]
     or exists (
       select 1
       from jsonb_object_keys(p_metrics) key(value)
       where key.value ~* (
         '(^|_)(expected(result|classification)?|seed(ed|edresult)?|'
         || 'ownercomplaint|shouldfail|desiredresult)($|_)'
       )
     ) then
    return false;
  end if;

  unit_value := case p_platform
    when 'android' then 'dp'
    when 'ios' then 'pt'
    when 'web' then 'css_px'
    else null
  end;
  preferred_threshold := case p_platform
    when 'android' then 48
    when 'ios' then 44
    when 'web' then 44
    else null
  end;
  applicable_minimum := case p_platform
    when 'android' then 48
    when 'ios' then 44
    when 'web' then 24
    else null
  end;

  if p_metrics->>'platform' <> p_platform::text
     or p_metrics->>'measurementUnit' <> unit_value
     or p_metrics->>'surfaceFamily' not in (
       'standard_streaming_card','live_streaming_card',
       'creator_streaming_card','featured_hero_card',
       'vertical_post_card','compact_media_list_item',
       'non_media_interactive_surface'
     )
     or jsonb_typeof(p_metrics->'interactiveTargetWidth') <> 'number'
     or (p_metrics->>'interactiveTargetWidth')::numeric
        not between 0 and 2048
     or jsonb_typeof(p_metrics->'interactiveTargetHeight') <> 'number'
     or (p_metrics->>'interactiveTargetHeight')::numeric
        not between 0 and 2048
     or jsonb_typeof(p_metrics->'interactiveAncestorPresent') <> 'boolean'
     or jsonb_typeof(p_metrics->'isActuallyInteractive') <> 'boolean'
     or jsonb_typeof(p_metrics->'preferredThreshold') <> 'number'
     or (p_metrics->>'preferredThreshold')::numeric <> preferred_threshold
     or jsonb_typeof(p_metrics->'applicableMinimumThreshold') <> 'number'
     or (p_metrics->>'applicableMinimumThreshold')::numeric
        <> applicable_minimum
     or jsonb_typeof(p_metrics->'accessibilityNamePresent') <> 'boolean'
     or jsonb_typeof(p_metrics->'accessibilityRolePresent') <> 'boolean'
     or jsonb_typeof(p_metrics->'exceptionVersioned') <> 'boolean'
     or p_metrics->>'baselineId' <>
        'chillywood-product-experience-baseline-v1'
     or jsonb_typeof(p_metrics->'baselineVersion') <> 'number'
     or (p_metrics->>'baselineVersion')::numeric <> 1
     or p_metrics->>'baselineState' not in (
       'needs_product_baseline_review','approved_baseline'
     )
     or p_metrics->>'evidenceQuality' not in (
       'measured_installed','measured_simulator',
       'bounded_source_only','insufficient'
     )
     or p_metrics->>'evidenceQualityHash' !~ '^[a-f0-9]{64}$'
     or p_metrics->>'componentIdentityHash' !~ '^[a-f0-9]{64}$'
     or p_metrics->>'routeFamilyMappingHash' !~ '^[a-f0-9]{64}$'
     or p_metrics->>'automationStatus' not in (
       'observed','partial','failed','not_available'
     )
     or p_metrics->>'providerState' not in (
       'healthy','degraded','blocked','unknown','not_applicable'
     )
     or p_metrics->>'contentState' not in (
       'loaded','partial','empty','loading','error','not_applicable'
     )
     or (
       p_metrics->>'baselineState' = 'approved_baseline'
       and (
         jsonb_typeof(p_metrics->'baselineComparisonHash') <> 'string'
         or p_metrics->>'baselineComparisonHash' <> baseline_hash
       )
     )
     or (
       p_metrics->>'baselineState' = 'needs_product_baseline_review'
       and p_metrics->'baselineComparisonHash' <> 'null'::jsonb
     )
     or (
       p_platform = 'android'
       and (
         jsonb_typeof(p_metrics->'screenDensityDpi') <> 'number'
         or (p_metrics->>'screenDensityDpi')::numeric
            not between 72 and 1000
       )
     )
     or (
       p_platform in ('ios','web')
       and p_metrics->'screenDensityDpi' <> 'null'::jsonb
     ) then
    return false;
  end if;

  if p_metrics->>'surfaceFamily' in (
       'standard_streaming_card','live_streaming_card',
       'creator_streaming_card'
     ) then
    if p_metrics->'exceptionVersioned' <> 'false'::jsonb
       or p_metrics->>'exceptionType' <> 'none'
       or p_metrics->'exceptionContractHash' <> 'null'::jsonb then
      return false;
    end if;
  else
    if p_metrics->'exceptionVersioned' <> 'true'::jsonb
       or p_metrics->>'exceptionType' <> (
         case p_metrics->>'surfaceFamily'
           when 'featured_hero_card' then 'featured_hero'
           when 'vertical_post_card' then 'vertical_short_form'
           when 'compact_media_list_item' then 'compact_media_list'
           when 'non_media_interactive_surface' then 'non_media_surface'
           else null
         end
       )
       or jsonb_typeof(p_metrics->'exceptionContractHash') <> 'string'
       or p_metrics->>'exceptionContractHash' !~ '^[a-f0-9]{64}$' then
      return false;
    end if;
  end if;

  if p_metrics->'interactiveAncestorPresent' = 'true'::jsonb then
    if jsonb_typeof(p_metrics->'interactiveAncestorWidth') <> 'number'
       or jsonb_typeof(p_metrics->'interactiveAncestorHeight') <> 'number'
       or (p_metrics->>'interactiveAncestorWidth')::numeric
          not between 0 and 2048
       or (p_metrics->>'interactiveAncestorHeight')::numeric
          not between 0 and 2048 then
      return false;
    end if;
    effective_width := (p_metrics->>'interactiveAncestorWidth')::numeric;
    effective_height := (p_metrics->>'interactiveAncestorHeight')::numeric;
  else
    if p_metrics->'interactiveAncestorWidth' <> 'null'::jsonb
       or p_metrics->'interactiveAncestorHeight' <> 'null'::jsonb then
      return false;
    end if;
    effective_width := (p_metrics->>'interactiveTargetWidth')::numeric;
    effective_height := (p_metrics->>'interactiveTargetHeight')::numeric;
  end if;

  target_classification := case
    when p_metrics->'isActuallyInteractive' <> 'true'::jsonb
      then 'not_interactive'
    when p_platform = 'web'
         and effective_width >= 44
         and effective_height >= 44
      then 'meets_platform_preferred'
    when p_platform = 'web'
         and effective_width >= 24
         and effective_height >= 24
      then 'meets_wcag_aa_minimum_only'
    when p_platform = 'web'
      then 'below_wcag_aa_minimum'
    when effective_width >= preferred_threshold
         and effective_height >= preferred_threshold
      then 'meets_platform_minimum'
    else 'below_platform_minimum'
  end;

  if p_metrics->>'targetClassification' <> target_classification then
    return false;
  end if;

  if p_result_status = 'passed' then
    if p_metrics->>'baselineState' <> 'approved_baseline'
       or p_metrics->>'evidenceQuality' not in (
         'measured_installed','measured_simulator'
       )
       or p_metrics->>'automationStatus' <> 'observed'
       or p_metrics->'isActuallyInteractive' <> 'true'::jsonb
       or p_metrics->'accessibilityNamePresent' <> 'true'::jsonb
       or p_metrics->'accessibilityRolePresent' <> 'true'::jsonb
       or target_classification not in (
         'meets_platform_minimum','meets_platform_preferred'
       ) then
      return false;
    end if;
  elsif p_result_status in ('failed','finding_created') then
    if p_metrics->>'baselineState' <> 'approved_baseline'
       or p_metrics->>'evidenceQuality' not in (
         'measured_installed','measured_simulator'
       )
       or p_metrics->>'automationStatus' <> 'observed'
       or p_metrics->'isActuallyInteractive' <> 'true'::jsonb
       or target_classification not in (
         'below_platform_minimum','meets_wcag_aa_minimum_only',
         'below_wcag_aa_minimum'
       ) then
      return false;
    end if;
  elsif p_result_status = 'blocked'
        and p_metrics->>'automationStatus' not in (
          'partial','failed','not_available'
        )
        and p_metrics->'isActuallyInteractive' = 'true'::jsonb then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.product_experience_option_c_touch_target_is_valid(
  public.cognitive_platform, text, jsonb
) from public, anon, authenticated, service_role;

create function public.product_experience_detailed_metric_manifest_is_valid(
  p_sentinel_key text,
  p_platform public.cognitive_platform,
  p_result_status text,
  p_metric_manifest jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_sentinel_key = 'visual_product_experience_sentinel' then
    if jsonb_typeof(p_metric_manifest) <> 'object'
       or jsonb_typeof(p_metric_manifest->'metrics') <> 'object' then
      return false;
    end if;
    case p_metric_manifest->>'observationKind'
      when 'visual_layout' then
        return public.product_experience_option_c_visual_layout_is_valid(
          p_platform, p_result_status, p_metric_manifest->'metrics'
        );
      when 'touch_target' then
        return public.product_experience_option_c_touch_target_is_valid(
          p_platform, p_result_status, p_metric_manifest->'metrics'
        );
      else
        return false;
    end case;
  end if;

  return public.product_experience_metric_manifest_is_valid_pre_option_c(
    p_sentinel_key, p_platform, p_result_status, p_metric_manifest
  );
exception
  when others then
    return false;
end;
$$;

revoke all on function public.product_experience_detailed_metric_manifest_is_valid(
  text, public.cognitive_platform, text, jsonb
) from public, anon, authenticated, service_role;

comment on function public.product_experience_detailed_metric_manifest_is_valid(
  text, public.cognitive_platform, text, jsonb
) is
  'Validates Option C creator-balanced visual evidence with platform-correct dp, pt, and CSS-pixel thresholds, and delegates unchanged LiveKit and installed-journey packets to the prior reviewed validator.';
