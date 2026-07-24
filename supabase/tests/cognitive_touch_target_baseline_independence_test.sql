begin;
select no_plan();

create temporary table touch_independence_fixture (
  fixture_key text primary key,
  metrics jsonb not null
) on commit drop;

insert into touch_independence_fixture(fixture_key, metrics) values
(
  'android_pending_below_floor',
  '{
    "platform":"android",
    "measurementUnit":"dp",
    "surfaceFamily":"non_media_interactive_surface",
    "interactiveTargetWidth":102.86,
    "interactiveTargetHeight":23.24,
    "interactiveAncestorPresent":false,
    "interactiveAncestorWidth":null,
    "interactiveAncestorHeight":null,
    "interactiveAncestorActuallyInteractive":false,
    "interactiveAncestorRolePresent":false,
    "interactiveAncestorClickActionPresent":false,
    "interactiveAncestorIsTargetContainer":false,
    "isActuallyInteractive":true,
    "preferredThreshold":48,
    "applicableMinimumThreshold":48,
    "accessibilityNamePresent":true,
    "accessibilityRolePresent":true,
    "screenDensityDpi":420,
    "targetClassification":"below_platform_minimum",
    "baselineId":"chillywood-product-experience-baseline-v1",
    "baselineVersion":1,
    "baselineState":"needs_product_baseline_review",
    "baselineComparisonHash":null,
    "evidenceQuality":"measured_installed",
    "evidenceQualityHash":"1111111111111111111111111111111111111111111111111111111111111111",
    "componentIdentityHash":"2222222222222222222222222222222222222222222222222222222222222222",
    "routeFamilyMappingId":"watch_party_entry_controls",
    "routeFamilyMappingHash":"900ec3a06999a1a7afcb88da0580d829902a1839cf26b54446cfa99e87aa2300",
    "automationStatus":"observed",
    "providerState":"not_applicable",
    "contentState":"not_applicable",
    "exceptionVersioned":true,
    "exceptionType":"non_media_surface",
    "exceptionContractId":"non_streaming_discovery_route_v1",
    "exceptionContractHash":"18a3bb4c47a9f78849f15249776daea979abf11b9446f3773dc59d1a74f9894e"
  }'::jsonb
),
(
  'ios_pending_below_floor',
  '{
    "platform":"ios",
    "measurementUnit":"pt",
    "surfaceFamily":"standard_streaming_card",
    "interactiveTargetWidth":43,
    "interactiveTargetHeight":43,
    "interactiveAncestorPresent":false,
    "interactiveAncestorWidth":null,
    "interactiveAncestorHeight":null,
    "interactiveAncestorActuallyInteractive":false,
    "interactiveAncestorRolePresent":false,
    "interactiveAncestorClickActionPresent":false,
    "interactiveAncestorIsTargetContainer":false,
    "isActuallyInteractive":true,
    "preferredThreshold":44,
    "applicableMinimumThreshold":44,
    "accessibilityNamePresent":true,
    "accessibilityRolePresent":true,
    "screenDensityDpi":null,
    "targetClassification":"below_platform_minimum",
    "baselineId":"chillywood-product-experience-baseline-v1",
    "baselineVersion":1,
    "baselineState":"needs_product_baseline_review",
    "baselineComparisonHash":null,
    "evidenceQuality":"measured_simulator",
    "evidenceQualityHash":"5555555555555555555555555555555555555555555555555555555555555555",
    "componentIdentityHash":"6666666666666666666666666666666666666666666666666666666666666666",
    "routeFamilyMappingId":"home_standard_discovery_rows",
    "routeFamilyMappingHash":"1da877c4587ae6389b78f5c57dd212b473fbeae22a9db4885000a8b961f6a44d",
    "automationStatus":"observed",
    "providerState":"not_applicable",
    "contentState":"loaded",
    "exceptionVersioned":false,
    "exceptionType":"none",
    "exceptionContractId":null,
    "exceptionContractHash":null
  }'::jsonb
),
(
  'web_pending_below_wcag',
  '{
    "platform":"web",
    "measurementUnit":"css_px",
    "surfaceFamily":"standard_streaming_card",
    "interactiveTargetWidth":23,
    "interactiveTargetHeight":23,
    "interactiveAncestorPresent":false,
    "interactiveAncestorWidth":null,
    "interactiveAncestorHeight":null,
    "interactiveAncestorActuallyInteractive":false,
    "interactiveAncestorRolePresent":false,
    "interactiveAncestorClickActionPresent":false,
    "interactiveAncestorIsTargetContainer":false,
    "isActuallyInteractive":true,
    "preferredThreshold":44,
    "applicableMinimumThreshold":24,
    "accessibilityNamePresent":true,
    "accessibilityRolePresent":true,
    "screenDensityDpi":null,
    "targetClassification":"below_wcag_aa_minimum",
    "baselineId":"chillywood-product-experience-baseline-v1",
    "baselineVersion":1,
    "baselineState":"needs_product_baseline_review",
    "baselineComparisonHash":null,
    "evidenceQuality":"measured_installed",
    "evidenceQualityHash":"8888888888888888888888888888888888888888888888888888888888888888",
    "componentIdentityHash":"9999999999999999999999999999999999999999999999999999999999999999",
    "routeFamilyMappingId":"home_standard_discovery_rows",
    "routeFamilyMappingHash":"1da877c4587ae6389b78f5c57dd212b473fbeae22a9db4885000a8b961f6a44d",
    "automationStatus":"observed",
    "providerState":"not_applicable",
    "contentState":"loaded",
    "exceptionVersioned":false,
    "exceptionType":"none",
    "exceptionContractId":null,
    "exceptionContractHash":null
  }'::jsonb
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.product_experience_option_c_touch_target_is_valid(public.cognitive_platform,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.product_experience_touch_target_is_valid_pre_independence(public.cognitive_platform,text,jsonb)',
    'EXECUTE'
  ),
  'touch-target validators remain unavailable to service-role callers'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','failed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',(select metrics from touch_independence_fixture
                 where fixture_key = 'android_pending_below_floor')
    )
  ),
  'measured Android target below 48dp is recordable before baseline approval'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','finding_created',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',(select metrics from touch_independence_fixture
                 where fixture_key = 'android_pending_below_floor')
    )
  ),
  'evaluated Android finding remains recordable before baseline approval'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','ios','failed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',(select metrics from touch_independence_fixture
                 where fixture_key = 'ios_pending_below_floor')
    )
  ),
  'measured iOS target below 44pt is recordable before baseline approval'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','web','failed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',(select metrics from touch_independence_fixture
                 where fixture_key = 'web_pending_below_wcag')
    )
  ),
  'measured web target below WCAG AA 24 CSS pixels is recordable before approval'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','web','failed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',
      jsonb_set(
        jsonb_set(
          jsonb_set(
            (select metrics from touch_independence_fixture
             where fixture_key = 'web_pending_below_wcag'),
            '{interactiveTargetWidth}','30'::jsonb
          ),
          '{interactiveTargetHeight}','30'::jsonb
        ),
        '{targetClassification}',
        to_jsonb('meets_wcag_aa_minimum_only'::text)
      )
    )
  ),
  'pending baseline cannot turn web preferred-size policy into a finding'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','passed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',
      jsonb_set(
        jsonb_set(
          jsonb_set(
            (select metrics from touch_independence_fixture
             where fixture_key = 'android_pending_below_floor'),
            '{interactiveTargetWidth}','48'::jsonb
          ),
          '{interactiveTargetHeight}','48'::jsonb
        ),
        '{targetClassification}',
        to_jsonb('meets_platform_minimum'::text)
      )
    )
  ),
  'measured Android touch-target pass is independent of visual baseline approval'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','ios','passed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',
      jsonb_set(
        jsonb_set(
          jsonb_set(
            (select metrics from touch_independence_fixture
             where fixture_key = 'ios_pending_below_floor'),
            '{interactiveTargetWidth}','44'::jsonb
          ),
          '{interactiveTargetHeight}','44'::jsonb
        ),
        '{targetClassification}',
        to_jsonb('meets_platform_minimum'::text)
      )
    )
  ),
  'measured iOS touch-target pass requires the objective 44pt target'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','web','passed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',
      jsonb_set(
        jsonb_set(
          jsonb_set(
            (select metrics from touch_independence_fixture
             where fixture_key = 'web_pending_below_wcag'),
            '{interactiveTargetWidth}','44'::jsonb
          ),
          '{interactiveTargetHeight}','44'::jsonb
        ),
        '{targetClassification}',
        to_jsonb('meets_platform_preferred'::text)
      )
    )
  ),
  'measured web touch-target pass requires the preferred 44 CSS pixels'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','passed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              (select metrics from touch_independence_fixture
               where fixture_key = 'android_pending_below_floor'),
              '{interactiveTargetWidth}','48'::jsonb
            ),
            '{interactiveTargetHeight}','48'::jsonb
          ),
          '{targetClassification}',
          to_jsonb('meets_platform_minimum'::text)
        ),
        '{accessibilityNamePresent}','false'::jsonb
      )
    )
  ),
  'pending touch-target pass requires an accessibility name'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','failed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',
      jsonb_set(
        (select metrics from touch_independence_fixture
         where fixture_key = 'android_pending_below_floor'),
        '{automationStatus}',to_jsonb('partial'::text)
      )
    )
  ),
  'partial automation cannot create a pending-baseline accessibility finding'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','failed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',
      jsonb_set(
        (select metrics from touch_independence_fixture
         where fixture_key = 'android_pending_below_floor'),
        '{evidenceQuality}',to_jsonb('bounded_source_only'::text)
      )
    )
  ),
  'source-only evidence cannot create a pending-baseline accessibility finding'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','failed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',
      jsonb_set(
        jsonb_set(
          (select metrics from touch_independence_fixture
           where fixture_key = 'android_pending_below_floor'),
          '{isActuallyInteractive}','false'::jsonb
        ),
        '{targetClassification}',to_jsonb('not_interactive'::text)
      )
    )
  ),
  'non-interactive geometry cannot create a touch-target finding'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','failed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',
      jsonb_set(
        (select metrics from touch_independence_fixture
         where fixture_key = 'android_pending_below_floor'),
        '{baselineComparisonHash}',to_jsonb(repeat('f',64))
      )
    )
  ),
  'pending-baseline accessibility packet requires a null comparison hash'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','web','failed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                (select metrics from touch_independence_fixture
                 where fixture_key = 'web_pending_below_wcag'),
                '{interactiveTargetWidth}','30'::jsonb
              ),
              '{interactiveTargetHeight}','30'::jsonb
            ),
            '{targetClassification}',
            to_jsonb('meets_wcag_aa_minimum_only'::text)
          ),
          '{baselineState}',to_jsonb('approved_baseline'::text)
        ),
        '{baselineComparisonHash}',
        to_jsonb(
          '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'::text
        )
      )
    )
  ),
  'approved baseline may still evaluate the 44 CSS-pixel preferred policy'
);

select ok(
  not public.product_experience_option_c_touch_target_is_valid(
    'android',
    'failed',
    jsonb_set(
      (select metrics from touch_independence_fixture
       where fixture_key = 'android_pending_below_floor'),
      '{routeFamilyMappingHash}',
      to_jsonb(repeat('f',64))
    )
  ),
  'an arbitrary well-formed route mapping hash is rejected'
);

select ok(
  not public.product_experience_option_c_touch_target_is_valid(
    'android',
    'failed',
    (select metrics from touch_independence_fixture
     where fixture_key = 'android_pending_below_floor')
      || '{
        "interactiveAncestorPresent":true,
        "interactiveAncestorWidth":102.86,
        "interactiveAncestorHeight":48,
        "interactiveAncestorActuallyInteractive":false,
        "interactiveAncestorRolePresent":true,
        "interactiveAncestorClickActionPresent":true,
        "interactiveAncestorIsTargetContainer":true
      }'::jsonb
  ),
  'ancestor bounds cannot substitute without actual interactivity proof'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','failed',
    '{
      "observationKind":"touch_target",
      "metrics":{
        "thresholdDp":48,
        "minimumWidthDp":102.86,
        "minimumHeightDp":23.24,
        "isActuallyInteractive":true,
        "clickableAncestorPresent":false,
        "screenDensityDpi":420
      }
    }'::jsonb
  ),
  'obsolete generic Android touch-target packets remain rejected'
);

select * from finish();
rollback;
