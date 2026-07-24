-- Forward-only accessibility finding independence for measured touch targets.
--
-- Visual-layout passes remain baseline-governed. A touch-target observation
-- may pass independently when measured evidence meets the objective platform
-- target, while product-policy deviations such as a web target that meets
-- WCAG 2.2 AA's 24 CSS-pixel floor but remains below Chi'llywood's preferred
-- 44 CSS pixels stay baseline-governed. A reproducible, actually-interactive
-- target below the objective platform floor may also be recorded before visual
-- baseline approval:
--
--   Android: below 48dp
--   iOS:     below 44pt
--   web:     below the applicable WCAG AA 24 CSS-pixel minimum
--
-- This validator does not create a finding.  The existing independent
-- evaluator proof and triage capability path remain required downstream.

alter function public.product_experience_option_c_touch_target_is_valid(
  public.cognitive_platform, text, jsonb
) rename to product_experience_touch_target_is_valid_pre_independence;

revoke all on function
  public.product_experience_touch_target_is_valid_pre_independence(
    public.cognitive_platform, text, jsonb
  )
from public, anon, authenticated, service_role;

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
  normalized_metrics jsonb;
  option_c_hash constant text :=
    '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184';
begin
  -- The prior reviewed validator continues to own every approved-baseline
  -- comparison and all ordinary cases.
  if public.product_experience_touch_target_is_valid_pre_independence(
       p_platform, p_result_status, p_metrics
     ) then
    return true;
  end if;

  -- A pending visual baseline cannot supply baseline-deviation authority.
  -- Measured evidence may either pass at the objective target or record an
  -- actually-interactive target below the objective platform floor.
  if jsonb_typeof(p_metrics) <> 'object'
     or p_metrics->>'baselineState' <>
        'needs_product_baseline_review'
     or p_metrics->'baselineComparisonHash' <> 'null'::jsonb
     or p_metrics->>'evidenceQuality' not in (
       'measured_installed','measured_simulator'
     )
     or p_metrics->>'automationStatus' <> 'observed'
     or p_metrics->'isActuallyInteractive' <> 'true'::jsonb then
    return false;
  end if;

  if p_result_status in ('failed','finding_created') then
    if not (
       (
         p_platform in ('android','ios')
         and p_metrics->>'targetClassification' =
             'below_platform_minimum'
       )
       or (
         p_platform = 'web'
         and p_metrics->>'targetClassification' =
             'below_wcag_aa_minimum'
       )
     ) then
      return false;
    end if;
  elsif p_result_status = 'passed' then
    if p_metrics->'accessibilityNamePresent' <> 'true'::jsonb
       or p_metrics->'accessibilityRolePresent' <> 'true'::jsonb
       or not (
         (
           p_platform in ('android','ios')
           and p_metrics->>'targetClassification' =
               'meets_platform_minimum'
         )
         or (
           p_platform = 'web'
           and p_metrics->>'targetClassification' =
               'meets_platform_preferred'
         )
       ) then
      return false;
    end if;
  else
    return false;
  end if;

  -- Normalize only in memory so the prior validator can re-check the complete
  -- closed metric contract.  The stored packet remains pending-baseline with
  -- a null comparison hash.
  normalized_metrics := jsonb_set(
    jsonb_set(
      p_metrics,
      '{baselineState}',
      to_jsonb('approved_baseline'::text),
      false
    ),
    '{baselineComparisonHash}',
    to_jsonb(option_c_hash),
    false
  );

  return public.product_experience_touch_target_is_valid_pre_independence(
    p_platform, p_result_status, normalized_metrics
  );
exception
  when others then
    return false;
end;
$$;

revoke all on function public.product_experience_option_c_touch_target_is_valid(
  public.cognitive_platform, text, jsonb
) from public, anon, authenticated, service_role;

comment on function public.product_experience_option_c_touch_target_is_valid(
  public.cognitive_platform, text, jsonb
) is
  'Validates platform-correct touch targets. Measured objective passes and below-floor failures may be recorded while the visual baseline is pending; visual-layout and preferred-policy deviations remain baseline-bound.';
