begin;
select no_plan();

select has_function(
  'cognitive_runtime',
  'preflight_visual_generic_manifest_predicates',
  array['text','text','jsonb'],
  'the collector-bound generic-manifest predicate diagnostic exists'
);

select ok(
  (
    select procedure.prosecdef
      and procedure.provolatile = 'v'
      and procedure.proconfig @> array['search_path=""']
    from pg_catalog.pg_proc procedure
    where procedure.oid =
      'cognitive_runtime.preflight_visual_generic_manifest_predicates(text,text,jsonb)'::regprocedure
  ),
  'the runtime diagnostic is a locked volatile security-definer boundary'
);

select ok(
  has_function_privilege(
    'cognitive_sentinel_collector',
    'cognitive_runtime.preflight_visual_generic_manifest_predicates(text,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'cognitive_runtime.preflight_visual_generic_manifest_predicates(text,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'cognitive_runtime.preflight_visual_generic_manifest_predicates(text,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'cognitive_product_quality_evaluator',
    'cognitive_runtime.preflight_visual_generic_manifest_predicates(text,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'cognitive_product_quality_triage',
    'cognitive_runtime.preflight_visual_generic_manifest_predicates(text,text,jsonb)',
    'EXECUTE'
  ),
  'only the sentinel collector principal can execute the runtime diagnostic'
);

select ok(
  cognitive_runtime.runtime_operation_allowed(
    'cognitive_sentinel_collector',
    'preflight_visual_generic_manifest_predicates'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_product_quality_evaluator',
    'preflight_visual_generic_manifest_predicates'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_product_quality_triage',
    'preflight_visual_generic_manifest_predicates'
  ),
  'the runtime operation is exact and collector-only'
);

select ok(
  lower(pg_get_functiondef(
    'cognitive_runtime.preflight_visual_generic_manifest_predicates(text,text,jsonb)'::regprocedure
  )) not like '%insert into%'
  and lower(pg_get_functiondef(
    'cognitive_runtime.preflight_visual_generic_manifest_predicates(text,text,jsonb)'::regprocedure
  )) not like '%update %'
  and lower(pg_get_functiondef(
    'cognitive_runtime.preflight_visual_generic_manifest_predicates(text,text,jsonb)'::regprocedure
  )) not like '%delete from%'
  and lower(pg_get_functiondef(
    'public.product_experience_generic_manifest_predicates(text,text,jsonb)'::regprocedure
  )) not like '%insert into%'
  and lower(pg_get_functiondef(
    'public.product_experience_generic_manifest_predicates(text,text,jsonb)'::regprocedure
  )) not like '%update %'
  and lower(pg_get_functiondef(
    'public.product_experience_generic_manifest_predicates(text,text,jsonb)'::regprocedure
  )) not like '%delete from%',
  'the diagnostic implementation contains no mutation'
);

create temporary table generic_manifest_fixture(
  fixture_key text primary key,
  evidence_manifest_hash text not null,
  manifest jsonb not null
) on commit drop;

insert into generic_manifest_fixture(
  fixture_key,
  evidence_manifest_hash,
  manifest
) values (
  'repaired_android_build84',
  'f7cf764c8d7e5b81189f48f2a097189f417113b56179c8a324380d26b83e8a1e',
  '{
    "schemaVersion":"product-sentinel-v1",
    "sanitizationVersion":"bounded-nonpersonal-v1",
    "observationKind":"touch_target",
    "evidenceHashes":[
      "f7cf764c8d7e5b81189f48f2a097189f417113b56179c8a324380d26b83e8a1e"
    ],
    "metrics":{
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
      "evidenceQualityHash":"8d786d48d11cb2b8525ec38221d74bbb974ecb1878d07bbdb41733244c59eec5",
      "componentIdentityHash":"b6b6e64a3375935b849019fbeedd8fd07f02e7a76e938aea3b6e1a0189a7fddc",
      "routeFamilyMappingId":"home_main_tab_navigation_control",
      "routeFamilyMappingHash":"3b6e2cf28d5041e97de6ab4eec5d006c2c5ae7b37b74823904a8645bc923d6e0",
      "automationStatus":"observed",
      "providerState":"not_applicable",
      "contentState":"not_applicable",
      "exceptionVersioned":true,
      "exceptionType":"non_media_surface",
      "exceptionContractId":"non_streaming_discovery_route_v1",
      "exceptionContractHash":"18a3bb4c47a9f78849f15249776daea979abf11b9446f3773dc59d1a74f9894e"
    }
  }'::jsonb
);

select ok(
  public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    manifest
  )
  and public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel',
    'android',
    'failed',
    manifest
  ),
  'the exact repaired Android manifest passes generic and detailed validation'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select ok(
  (
    result->>'failedSubpredicate' is null
    and jsonb_typeof(result->'checks') = 'object'
    and (select count(*) from jsonb_object_keys(result->'checks')) = 14
    and not exists (
      select 1
      from jsonb_each_text(result->'checks') check_result
      where check_result.value <> 'PASS'
    )
    and not exists (
      select 1
      from jsonb_object_keys(result) result_key
      where result_key not in ('checks','failedSubpredicate')
    )
  ),
  'the repaired manifest returns fourteen PASS results and no submitted value'
)
from generic_manifest_fixture fixture
cross join lateral public.product_experience_generic_manifest_predicates(
  'visual_product_experience_sentinel',
  fixture.evidence_manifest_hash,
  fixture.manifest
) result
where fixture.fixture_key = 'repaired_android_build84';

select ok(
  not public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    jsonb_set(
      manifest,
      '{schemaVersion}',
      to_jsonb('wrong-version'::text)
    )
  )
  and (
    public.product_experience_generic_manifest_predicates(
      'visual_product_experience_sentinel',
      evidence_manifest_hash,
      jsonb_set(
        manifest,
        '{schemaVersion}',
        to_jsonb('wrong-version'::text)
      )
    )->'checks'->>'04_schema_version'
  ) = 'FAIL',
  'a wrong schema version fails its exact generic check'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select ok(
  not public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    jsonb_set(
      manifest,
      '{sanitizationVersion}',
      to_jsonb('wrong-version'::text)
    )
  )
  and (
    public.product_experience_generic_manifest_predicates(
      'visual_product_experience_sentinel',
      evidence_manifest_hash,
      jsonb_set(
        manifest,
        '{sanitizationVersion}',
        to_jsonb('wrong-version'::text)
      )
    )->'checks'->>'05_sanitization_version'
  ) = 'FAIL',
  'a wrong sanitization version fails its exact generic check'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select ok(
  not public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    jsonb_set(manifest, '{evidenceHashes}', '[]'::jsonb)
  ),
  'a missing evidence hash fails generic validation'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select ok(
  not public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    jsonb_set(
      manifest,
      '{evidenceHashes}',
      jsonb_build_array(repeat('A', 64))
    )
  )
  and (
    public.product_experience_generic_manifest_predicates(
      'visual_product_experience_sentinel',
      evidence_manifest_hash,
      jsonb_set(
        manifest,
        '{evidenceHashes}',
        jsonb_build_array(repeat('A', 64))
      )
    )->'checks'->>'12_evidence_hash_format'
  ) = 'FAIL',
  'an uppercase evidence hash fails exact lowercase hexadecimal validation'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select ok(
  not public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    jsonb_set(
      manifest,
      '{evidenceHashes}',
      jsonb_build_array(repeat('b', 64))
    )
  )
  and (
    public.product_experience_generic_manifest_predicates(
      'visual_product_experience_sentinel',
      evidence_manifest_hash,
      jsonb_set(
        manifest,
        '{evidenceHashes}',
        jsonb_build_array(repeat('b', 64))
      )
    )->'checks'->>'13_evidence_manifest_hash_bound'
  ) = 'FAIL',
  'an evidence hash mismatch fails exact top-level binding'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select ok(
  not public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    jsonb_set(
      manifest,
      '{metrics,boundedPadding}',
      to_jsonb(repeat('x', 70000)),
      true
    )
  )
  and (
    public.product_experience_generic_manifest_predicates(
      'visual_product_experience_sentinel',
      evidence_manifest_hash,
      jsonb_set(
        manifest,
        '{metrics,boundedPadding}',
        to_jsonb(repeat('x', 70000)),
        true
      )
    )->'checks'->>'02_total_manifest_size_bounded'
  ) = 'FAIL',
  'an oversized manifest fails the exact total-size check'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select ok(
  not public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    jsonb_set(
      manifest,
      '{metrics}',
      (manifest->'metrics') || (
        select jsonb_object_agg(
          'boundedField' || lpad(value::text, 2, '0'),
          to_jsonb(value)
        )
        from generate_series(1, 40) value
      )
    )
  )
  and (
    public.product_experience_generic_manifest_predicates(
      'visual_product_experience_sentinel',
      evidence_manifest_hash,
      jsonb_set(
        manifest,
        '{metrics}',
        (manifest->'metrics') || (
          select jsonb_object_agg(
            'boundedField' || lpad(value::text, 2, '0'),
            to_jsonb(value)
          )
          from generate_series(1, 40) value
        )
      )
    )->'checks'->>'08_metrics_key_count_bounded'
  ) = 'FAIL',
  'more than 64 metric keys fails the exact count check'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select ok(
  not public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    jsonb_set(
      manifest,
      '{metrics,apiKey}',
      to_jsonb('bounded-test-value'::text),
      true
    )
  )
  and (
    public.product_experience_generic_manifest_predicates(
      'visual_product_experience_sentinel',
      evidence_manifest_hash,
      jsonb_set(
        manifest,
        '{metrics,apiKey}',
        to_jsonb('bounded-test-value'::text),
        true
      )
    )->'checks'->>'03_cognitive_json_is_sanitized'
  ) = 'FAIL',
  'a secret-like field fails the unchanged sanitizer'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select ok(
  not public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    jsonb_set(
      manifest,
      '{metrics,ownerContact}',
      to_jsonb('fixture@example.invalid'::text),
      true
    )
  )
  and (
    public.product_experience_generic_manifest_predicates(
      'visual_product_experience_sentinel',
      evidence_manifest_hash,
      jsonb_set(
        manifest,
        '{metrics,ownerContact}',
        to_jsonb('fixture@example.invalid'::text),
        true
      )
    )->'checks'->>'03_cognitive_json_is_sanitized'
  ) = 'FAIL',
  'a private-identifier-like field fails the unchanged sanitizer'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select ok(
  not public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    jsonb_set(
      manifest,
      '{observationKind}',
      to_jsonb('route_timing'::text)
    )
  )
  and (
    public.product_experience_generic_manifest_predicates(
      'visual_product_experience_sentinel',
      evidence_manifest_hash,
      jsonb_set(
        manifest,
        '{observationKind}',
        to_jsonb('route_timing'::text)
      )
    )->'checks'->>'14_visual_observation_kind'
  ) = 'FAIL',
  'a wrong visual observation kind fails its exact check'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select ok(
  not public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    jsonb_set(manifest, '{metrics}', '[]'::jsonb)
  )
  and (
    public.product_experience_generic_manifest_predicates(
      'visual_product_experience_sentinel',
      evidence_manifest_hash,
      jsonb_set(manifest, '{metrics}', '[]'::jsonb)
    )->'checks'->>'07_metrics_is_json_object'
  ) = 'FAIL',
  'a malformed metrics type fails its exact generic check'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select ok(
  public.product_experience_metric_manifest_is_bounded(
    'visual_product_experience_sentinel',
    evidence_manifest_hash,
    jsonb_set(
      manifest,
      '{metrics,interactiveTargetHeight}',
      to_jsonb(60)
    )
  )
  and not public.product_experience_detailed_metric_manifest_is_valid(
    'visual_product_experience_sentinel',
    'android',
    'failed',
    jsonb_set(
      manifest,
      '{metrics,interactiveTargetHeight}',
      to_jsonb(60)
    )
  ),
  'a contradictory touch-target failure still fails detailed validation'
)
from generic_manifest_fixture
where fixture_key = 'repaired_android_build84';

select is(
  (select count(*)::integer from public.product_experience_sentinel_runs),
  0,
  'installing and exercising the diagnostic creates zero evidence'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_provider_independent_visual_canary_authorizations
  ),
  0,
  'the diagnostic creates no blind visual authorization'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches
    where enabled
  ),
  0,
  'the diagnostic enables no switch'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_level01_schedule_definitions
    where enabled
  ),
  0,
  'the diagnostic enables no schedule'
);

select * from finish();
rollback;
