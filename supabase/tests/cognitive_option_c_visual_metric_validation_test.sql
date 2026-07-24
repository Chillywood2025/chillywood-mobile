begin;
select no_plan();

create temporary table option_c_metric_fixture (
  fixture_key text primary key,
  metrics jsonb not null
) on commit drop;

insert into option_c_metric_fixture(fixture_key, metrics) values
(
  'phone_android',
  '{
    "platform":"android",
    "measurementUnit":"dp",
    "surfaceFamily":"standard_streaming_card",
    "baselineApplicability":"option_c_default",
    "referenceViewport":"phone_portrait_390x844",
    "orientation":"portrait",
    "windowClass":"compact",
    "layoutMode":"horizontal_row",
    "mediaFrameWidth":252,
    "mediaFrameHeight":142,
    "totalCardContainerWidth":252,
    "totalCardContainerHeight":222,
    "metadataBandHeight":80,
    "viewportWidth":390,
    "viewportHeight":844,
    "cardViewportWidthRatio":0.64615,
    "cardViewportHeightRatio":0.26303,
    "horizontalCardsVisible":1.42,
    "cardsAboveFold":4,
    "aspectRatioClass":"16:9",
    "horizontalMargin":16,
    "horizontalGap":12,
    "columnGap":0,
    "verticalRowGap":20,
    "columnCount":1,
    "creatorIdentityVisible":true,
    "liveStateVisible":false,
    "liveContent":false,
    "titleLineCount":2,
    "metadataLineCount":2,
    "interactiveTargetWidth":252,
    "interactiveTargetHeight":222,
    "interactivePreferredThreshold":48,
    "interactiveApplicableMinimumThreshold":48,
    "accessibilityNamePresent":true,
    "accessibilityRolePresent":true,
    "baselineId":"chillywood-product-experience-baseline-v1",
    "baselineVersion":1,
    "baselineState":"approved_baseline",
    "baselineComparisonHash":"34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba",
    "evidenceQuality":"measured_installed",
    "evidenceQualityHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "componentIdentityHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "routeFamilyMappingId":"home_standard_discovery_rows",
    "routeFamilyMappingHash":"1da877c4587ae6389b78f5c57dd212b473fbeae22a9db4885000a8b961f6a44d",
    "automationStatus":"observed",
    "providerState":"healthy",
    "contentState":"loaded",
    "observedClassification":"within_baseline",
    "exceptionVersioned":false,
    "exceptionType":"none",
    "exceptionContractId":null,
    "exceptionContractHash":null,
    "featuredPlacement":"not_applicable",
    "screenDensityDpi":420
  }'::jsonb
),
(
  'tablet_ios',
  '{
    "platform":"ios",
    "measurementUnit":"pt",
    "surfaceFamily":"creator_streaming_card",
    "baselineApplicability":"option_c_default",
    "referenceViewport":"tablet_portrait_1024x1366",
    "orientation":"portrait",
    "windowClass":"expanded",
    "layoutMode":"grid",
    "mediaFrameWidth":307,
    "mediaFrameHeight":173,
    "totalCardContainerWidth":307,
    "totalCardContainerHeight":253,
    "metadataBandHeight":80,
    "viewportWidth":1024,
    "viewportHeight":1366,
    "cardViewportWidthRatio":0.29980,
    "cardViewportHeightRatio":0.18521,
    "horizontalCardsVisible":3,
    "cardsAboveFold":9,
    "aspectRatioClass":"16:9",
    "horizontalMargin":32,
    "horizontalGap":0,
    "columnGap":20,
    "verticalRowGap":24,
    "columnCount":3,
    "creatorIdentityVisible":true,
    "liveStateVisible":false,
    "liveContent":false,
    "titleLineCount":2,
    "metadataLineCount":2,
    "interactiveTargetWidth":307,
    "interactiveTargetHeight":253,
    "interactivePreferredThreshold":44,
    "interactiveApplicableMinimumThreshold":44,
    "accessibilityNamePresent":true,
    "accessibilityRolePresent":true,
    "baselineId":"chillywood-product-experience-baseline-v1",
    "baselineVersion":1,
    "baselineState":"approved_baseline",
    "baselineComparisonHash":"34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba",
    "evidenceQuality":"measured_simulator",
    "evidenceQualityHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    "componentIdentityHash":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "routeFamilyMappingId":"home_creator_media_rows",
    "routeFamilyMappingHash":"f0a9eeec1e2c67a79d4255b0a4eb985e3ce088a4672c2bd65139880f1bd2f889",
    "automationStatus":"observed",
    "providerState":"healthy",
    "contentState":"loaded",
    "observedClassification":"within_baseline",
    "exceptionVersioned":false,
    "exceptionType":"none",
    "exceptionContractId":null,
    "exceptionContractHash":null,
    "featuredPlacement":"not_applicable",
    "screenDensityDpi":null
  }'::jsonb
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.product_experience_option_c_visual_layout_is_valid(public.cognitive_platform,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.product_experience_option_c_touch_target_is_valid(public.cognitive_platform,text,jsonb)',
    'EXECUTE'
  ),
  'Option C metric helpers are not directly executable by service-role runtime'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'installed_journey_sentinel','android','failed',
    '{
      "observationKind":"route_timing",
      "metrics":{
        "elapsedDurationMs":12000,
        "networkState":"ready",
        "timeoutObserved":true
      }
    }'::jsonb
  ),
  'non-visual installed-journey validation delegates to the prior contract'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','passed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',(select metrics from option_c_metric_fixture
                 where fixture_key = 'phone_android')
    )
  ),
  'Android phone reference pass satisfies exact Option C target ranges'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','passed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                (select metrics from option_c_metric_fixture
                 where fixture_key = 'phone_android'),
                '{mediaFrameWidth}','256'::jsonb
              ),
              '{mediaFrameHeight}','144'::jsonb
            ),
            '{totalCardContainerWidth}','256'::jsonb
          ),
          '{totalCardContainerHeight}','224'::jsonb
        ),
        '{cardViewportWidthRatio}','0.65641'::jsonb
      ) || '{"cardViewportHeightRatio":0.26540}'::jsonb
    )
  ),
  'phone media dimensions accept the versioned four-unit variance'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','passed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',
      jsonb_set(
        jsonb_set(
          (select metrics from option_c_metric_fixture
           where fixture_key = 'phone_android'),
          '{mediaFrameWidth}','257'::jsonb
        ),
        '{totalCardContainerWidth}','257'::jsonb
      ) || '{"cardViewportWidthRatio":0.65897}'::jsonb
    )
  ),
  'phone media dimensions reject values beyond versioned variance'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','ios','passed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',(select metrics from option_c_metric_fixture
                 where fixture_key = 'tablet_ios')
    )
  ),
  'iOS tablet reference pass satisfies exact Option C target ranges'
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
  'the generic predecessor touch-target shape cannot bypass Option C evidence'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','passed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',jsonb_set(
        (select metrics from option_c_metric_fixture
         where fixture_key = 'phone_android'),
        '{baselineComparisonHash}',
        to_jsonb(repeat('f',64))
      )
    )
  ),
  'approved-baseline comparisons reject every hash except canonical Option C'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','passed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',jsonb_set(
        (select metrics from option_c_metric_fixture
         where fixture_key = 'phone_android'),
        '{mediaFrameHeight}','100'::jsonb
      )
    )
  ),
  'a pass rejects media geometry outside the 16:9 Option C reference range'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','passed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',jsonb_set(
        (select metrics from option_c_metric_fixture
         where fixture_key = 'phone_android'),
        '{totalCardContainerHeight}','130'::jsonb
      )
    )
  ),
  'media-frame and metadata dimensions cannot exceed total card container'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','passed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',jsonb_set(
        (select metrics from option_c_metric_fixture
         where fixture_key = 'phone_android'),
        '{creatorIdentityVisible}','false'::jsonb
      )
    )
  ),
  'default streaming-card passes require visible creator identity'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','passed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',jsonb_set(
        jsonb_set(
          (select metrics from option_c_metric_fixture
           where fixture_key = 'phone_android'),
          '{surfaceFamily}',to_jsonb('live_streaming_card'::text)
        ),
        '{liveContent}','true'::jsonb
      )
    )
  ),
  'a live streaming-card pass cannot omit the visible Live state'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','failed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                (select metrics from option_c_metric_fixture
                 where fixture_key = 'phone_android'),
                '{surfaceFamily}',to_jsonb('live_streaming_card'::text)
              ),
              '{routeFamilyMappingId}',
              to_jsonb('live_discovery_cards'::text)
            ),
            '{routeFamilyMappingHash}',
            to_jsonb(
              'cdeb267f422b121bb3d51f0e6d59bad419d65dd21e62b9a87ad39a50e26409af'::text
            )
          ),
          '{liveContent}','true'::jsonb
        ),
        '{observedClassification}',
        to_jsonb('confirmed_baseline_violation'::text)
      )
    )
  ),
  'missing Live-state visibility remains persistable as measured failure'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','passed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',jsonb_set(
        (select metrics from option_c_metric_fixture
         where fixture_key = 'phone_android'),
        '{seededResult}',to_jsonb('pass'::text)
      )
    )
  ),
  'sentinel result seeding keys are rejected'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','failed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              (select metrics from option_c_metric_fixture
               where fixture_key = 'phone_android'),
              '{mediaFrameWidth}','330'::jsonb
            ),
            '{totalCardContainerWidth}','330'::jsonb
          ),
          '{cardViewportWidthRatio}','0.84615'::jsonb
        ),
        '{observedClassification}',
        to_jsonb('confirmed_baseline_violation'::text)
      )
    )
  ),
  'bounded measured deviations remain recordable for evaluated findings'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','blocked',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              (select metrics from option_c_metric_fixture
               where fixture_key = 'phone_android'),
              '{automationStatus}',to_jsonb('failed'::text)
            ),
            '{evidenceQuality}',to_jsonb('insufficient'::text)
          ),
          '{observedClassification}',to_jsonb('automation_failure'::text)
        ),
        '{baselineState}',to_jsonb(
          'needs_product_baseline_review'::text
        )
      ) || '{"baselineComparisonHash":null}'::jsonb
    )
  ),
  'automation failure is preserved as blocked evidence, not a seeded defect'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','ios','passed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          jsonb_set(
                            jsonb_set(
                              jsonb_set(
                                jsonb_set(
                                  jsonb_set(
                                    (select metrics
                                     from option_c_metric_fixture
                                     where fixture_key = 'tablet_ios'),
                                    '{surfaceFamily}',
                                    to_jsonb('featured_hero_card'::text)
                                  ),
                                  '{baselineApplicability}',
                                  to_jsonb(
                                    'explicit_versioned_exception'::text
                                  )
                                ),
                                '{referenceViewport}',
                                to_jsonb('non_reference'::text)
                              ),
                              '{layoutMode}',
                              to_jsonb('full_width'::text)
                            ),
                            '{columnCount}','1'::jsonb
                          ),
                          '{horizontalCardsVisible}','1'::jsonb
                        ),
                        '{mediaFrameWidth}','960'::jsonb
                      ),
                      '{mediaFrameHeight}','540'::jsonb
                    ),
                    '{totalCardContainerWidth}','960'::jsonb
                  ),
                  '{totalCardContainerHeight}','620'::jsonb
                ),
                '{cardViewportWidthRatio}','0.9375'::jsonb
              ),
              '{cardViewportHeightRatio}','0.45388'::jsonb
            ),
            '{exceptionVersioned}','true'::jsonb
          ),
          '{exceptionType}',to_jsonb('featured_hero'::text)
        ),
        '{exceptionContractHash}',
        to_jsonb(
          '731a0b271122e60b5576c3d04729ab1866334ebb9827a84b8cfe9a19ccf4d5ac'::text
        )
      )
      || '{"featuredPlacement":"first_row",
           "routeFamilyMappingId":"home_featured_hero",
           "routeFamilyMappingHash":"9d813e473c5eeca5965812fcbc4cc2f8cf3e07871325a4ac95fb51258fd9af41",
           "exceptionContractId":"full_width_featured_banner_v1",
           "observedClassification":"route_specific_exception"}'::jsonb
    )
  ),
  'a featured card uses an explicit versioned first-row exception'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','ios','passed',
    jsonb_build_object(
      'observationKind','visual_layout',
      'metrics',jsonb_set(
        (select metrics from option_c_metric_fixture
         where fixture_key = 'tablet_ios'),
        '{surfaceFamily}',to_jsonb('featured_hero_card'::text)
      )
    )
  ),
  'a featured family cannot silently inherit default discovery dimensions'
);

insert into option_c_metric_fixture(fixture_key, metrics) values
(
  'android_touch_failure',
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
    "baselineState":"approved_baseline",
    "baselineComparisonHash":"34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba",
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
  'web_touch_wcag_only',
  '{
    "platform":"web",
    "measurementUnit":"css_px",
    "surfaceFamily":"standard_streaming_card",
    "interactiveTargetWidth":30,
    "interactiveTargetHeight":30,
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
    "targetClassification":"meets_wcag_aa_minimum_only",
    "baselineId":"chillywood-product-experience-baseline-v1",
    "baselineVersion":1,
    "baselineState":"approved_baseline",
    "baselineComparisonHash":"34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba",
    "evidenceQuality":"measured_installed",
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
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','android','failed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',(select metrics from option_c_metric_fixture
                 where fixture_key = 'android_touch_failure')
    )
  ),
  'Android 23.24dp height is classified below the 48dp platform target'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','ios','failed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',(select metrics from option_c_metric_fixture
                 where fixture_key = 'android_touch_failure')
    )
  ),
  'Android dp evidence cannot be relabeled as iOS point evidence'
);

select ok(
  public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','web','failed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',(select metrics from option_c_metric_fixture
                 where fixture_key = 'web_touch_wcag_only')
    )
  ),
  'web 30 CSS px is truthfully classified above WCAG AA 24 but below preferred 44'
);

select ok(
  not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel','web','passed',
    jsonb_build_object(
      'observationKind','touch_target',
      'metrics',(select metrics from option_c_metric_fixture
                 where fixture_key = 'web_touch_wcag_only')
    )
  ),
  'web product pass requires the preferred 44 CSS px target'
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
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          (select metrics from option_c_metric_fixture
                           where fixture_key = 'web_touch_wcag_only'),
                          '{platform}',to_jsonb('ios'::text)
                        ),
                        '{measurementUnit}',to_jsonb('pt'::text)
                      ),
                      '{interactiveTargetWidth}','44'::jsonb
                    ),
                    '{interactiveTargetHeight}','44'::jsonb
                  ),
                  '{preferredThreshold}','44'::jsonb
                ),
                '{applicableMinimumThreshold}','44'::jsonb
              ),
              '{targetClassification}',
              to_jsonb('meets_platform_minimum'::text)
            ),
            '{evidenceQuality}',to_jsonb('measured_simulator'::text)
          ),
          '{screenDensityDpi}','null'::jsonb
        ),
        '{contentState}',to_jsonb('not_applicable'::text)
      )
    )
  ),
  'iOS touch-target pass uses 44pt without Android density units'
);

select * from finish();
rollback;
