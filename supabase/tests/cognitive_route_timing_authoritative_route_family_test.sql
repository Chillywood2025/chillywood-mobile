begin;
select no_plan();

create function pg_temp.authoritative_route_timing_manifest(
  p_route text,
  p_route_family_id text,
  p_mapping_id text,
  p_surface_family text,
  p_exception_contract_id text,
  p_exception_contract_hash text,
  p_exception_versioned boolean
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', 'product-sentinel-v1',
    'sanitizationVersion', 'bounded-nonpersonal-v1',
    'observationKind', 'route_timing',
    'evidenceHashes', jsonb_build_array(repeat('a',64)),
    'metrics', jsonb_build_object(
      'appVersion', '1.0.0',
      'appBuild', '84',
      'runtimeVersion', '1.0.0-android84',
      'channel', 'play-internal',
      'platform', 'android',
      'routeOrSurface', p_route,
      'routeFamilyId', p_route_family_id,
      'routeFamilyBindingHash',
        public.product_experience_route_family_binding_hash(
          'android', p_route, p_route_family_id
        ),
      'routeFamilyMappingId', p_mapping_id,
      'routeFamilyMappingHash',
        public.product_experience_baseline_v1_mapping_contract(
          p_mapping_id
        )->>'hash',
      'surfaceFamily', p_surface_family,
      'exceptionContractId', p_exception_contract_id,
      'exceptionContractHash', p_exception_contract_hash,
      'exceptionVersioned', p_exception_versioned,
      'runtimeIdentityHash', repeat('c',64),
      'buildRuntimeHash', repeat('d',64),
      'syntheticAccount', true,
      'networkReadyBeforeNavigation', true,
      'networkState', 'ready',
      'navigationStartMonotonicMs', 1000,
      'firstRenderedMonotonicMs', 1100,
      'firstInteractiveMonotonicMs', 1200,
      'resolvedStateMonotonicMs', 3400,
      'resolutionKind', 'content_state',
      'finalObservedState', 'content_loaded',
      'reviewedErrorState', false,
      'unresolvedStateCount', 0,
      'timeoutObserved', false,
      'maximumDurationMs', 10000,
      'elapsedDurationMs', 2400,
      'interactionEvidenceKind', 'both',
      'interactionEvidenceHash', repeat('b',64),
      'sanitizedEvidenceHash', repeat('a',64),
      'installedProofStatus', 'installed_ui_observed',
      'findingDisposition', 'no_finding'
    )
  )
$$;

select ok(
  public.product_experience_route_timing_no_finding_is_valid(
    pg_temp.authoritative_route_timing_manifest(
      'Home',
      'home.main',
      'home_standard_discovery_rows',
      'standard_streaming_card',
      null,
      null,
      false
    )
  ),
  'canonical Home route timing accepts the exact Option-C mapping'
);

select ok(
  public.product_experience_route_timing_no_finding_binding_is_valid(
    'android',
    'Home',
    repeat('c',64),
    repeat('d',64),
    repeat('a',64),
    'installed_ui_observed',
    pg_temp.authoritative_route_timing_manifest(
      'Home',
      'home.main',
      'home_standard_discovery_rows',
      'standard_streaming_card',
      null,
      null,
      false
    )
  ),
  'outer run binding accepts only the exact authoritative route packet'
);

select ok(
  not public.product_experience_route_timing_no_finding_is_valid(
    pg_temp.authoritative_route_timing_manifest(
      'Home',
      'caller-chosen.main',
      'home_standard_discovery_rows',
      'standard_streaming_card',
      null,
      null,
      false
    )
  ),
  'a caller-chosen route family is rejected even with its matching hash'
);

select ok(
  not public.product_experience_metric_manifest_is_bounded(
    'installed_journey_sentinel',
    repeat('a',64),
    pg_temp.authoritative_route_timing_manifest(
      'Home',
      'caller-chosen.main',
      'home_standard_discovery_rows',
      'standard_streaming_card',
      null,
      null,
      false
    )
  ),
  'collector bounded-manifest validation is rebound to authoritative family'
);

select ok(
  not public.product_experience_route_timing_no_finding_is_valid(
    pg_temp.authoritative_route_timing_manifest(
      'Home',
      'home.main',
      'explore_live_discovery_rows',
      'live_streaming_card',
      null,
      null,
      false
    )
  ),
  'a self-consistent approved family from another route is rejected'
);

select ok(
  not public.product_experience_route_timing_no_finding_is_valid(
    jsonb_set(
      pg_temp.authoritative_route_timing_manifest(
        'Home',
        'home.main',
        'home_standard_discovery_rows',
        'standard_streaming_card',
        null,
        null,
        false
      ),
      '{metrics,surfaceFamily}',
      '"live_streaming_card"'::jsonb
    )
  ),
  'a caller cannot relabel an exact mapping with a different family'
);

select ok(
  not public.product_experience_route_timing_no_finding_is_valid(
    jsonb_set(
      pg_temp.authoritative_route_timing_manifest(
        'Home',
        'home.main',
        'home_standard_discovery_rows',
        'standard_streaming_card',
        null,
        null,
        false
      ),
      '{metrics,routeFamilyMappingHash}',
      to_jsonb(repeat('f',64))
    )
  ),
  'a caller cannot substitute the immutable route/component mapping hash'
);

select ok(
  public.product_experience_route_timing_no_finding_is_valid(
    pg_temp.authoritative_route_timing_manifest(
      'Home',
      'home.main',
      'home_featured_hero',
      'featured_hero_card',
      'full_width_featured_banner_v1',
      public.product_experience_baseline_v1_exception_hash(
        'full_width_featured_banner_v1'
      ),
      true
    )
  ),
  'an exact versioned featured exception remains valid on its approved route'
);

select ok(
  not public.product_experience_route_timing_no_finding_is_valid(
    pg_temp.authoritative_route_timing_manifest(
      'Home',
      'home.main',
      'home_featured_hero',
      'featured_hero_card',
      null,
      null,
      false
    )
  ),
  'a featured mapping cannot silently omit its versioned exception'
);

select ok(
  not public.product_experience_route_timing_no_finding_is_valid(
    pg_temp.authoritative_route_timing_manifest(
      'UnknownRoute',
      'unknown-route.main',
      'home_standard_discovery_rows',
      'standard_streaming_card',
      null,
      null,
      false
    )
  ),
  'an unapproved route cannot manufacture a route-family attestation'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.product_experience_route_timing_authoritative_family_is_valid(jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.product_experience_baseline_v1_mapping_route(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.product_experience_baseline_v1_route_family_id(text)',
    'EXECUTE'
  ),
  'authoritative mapping helpers do not create a client or service-role API'
);

select ok(
  strpos(
    pg_get_functiondef(
      'public.product_quality_no_finding_assessment_hash(uuid)'::regprocedure
    ),
    'product_experience_route_timing_no_finding_binding_is_valid'
  ) > 0,
  'the evaluator assessment hash remains fail-closed on route binding'
);

select ok(
  strpos(
    pg_get_functiondef(
      'public.product_experience_scheduler_evaluation_is_ready(uuid)'::regprocedure
    ),
    'product_experience_sentinel_no_finding_events'
  ) > 0
  and strpos(
    pg_get_functiondef(
      'public.product_experience_scheduler_evaluation_is_ready(uuid)'::regprocedure
    ),
    'product_quality_no_finding_assessment_hash'
  ) > 0,
  'weekly UX readiness still requires evaluated and triaged no-finding evidence'
);

select * from finish();
rollback;
