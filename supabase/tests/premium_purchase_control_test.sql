begin;
select plan(10);

select ok(
  not has_function_privilege('anon', 'public.set_platform_money_kill_switch_state(text,text,text,text,jsonb)', 'EXECUTE'),
  'anonymous clients cannot change platform money switches'
);
select ok(
  has_function_privilege('authenticated', 'public.set_platform_money_kill_switch_state(text,text,text,text,jsonb)', 'EXECUTE'),
  'authenticated owner/operator path may invoke the audited setter'
);
select ok(
  has_function_privilege('service_role', 'public.set_platform_money_kill_switch_state(text,text,text,text,jsonb)', 'EXECUTE'),
  'service role may invoke the audited setter'
);

select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$select public.set_platform_money_kill_switch_state(
    'revenuecat_app_store_enabled',
    'sandbox_only',
    'Bounded iOS App Store sandbox purchase QA; live money and payouts remain off.',
    'Owner-approved internal TestFlight sandbox lane only.',
    '{"platform":"ios","environment":"sandbox","live_money_action":false}'::jsonb
  )$$,
  'App Store switch can use the supported audited setter'
);
select is(
  (select state from public.platform_money_kill_switches where key = 'revenuecat_app_store_enabled'),
  'sandbox_only',
  'App Store switch enters only bounded sandbox state'
);
select ok(
  (select coalesce((metadata->>'high_risk_switch')::boolean, false)
   from public.platform_money_kill_switch_audit
   where switch_key = 'revenuecat_app_store_enabled'
   order by created_at desc
   limit 1),
  'App Store switch change is classified high risk and audited'
);
select is(
  (select state from public.platform_money_kill_switches where key = 'live_money_enabled'),
  'off',
  'App Store sandbox activation does not enable live money'
);
select is(
  (select state from public.platform_money_kill_switches where key = 'payouts_enabled'),
  'off',
  'App Store sandbox activation does not enable payouts'
);
select throws_ok(
  $$select public.set_platform_money_kill_switch_state(
    'invented_purchase_switch', 'sandbox_only', 'This key must be rejected.', null, '{}'::jsonb
  )$$,
  'P0001',
  'money_kill_switch_key_invalid',
  'arbitrary switch keys remain rejected'
);
select lives_ok(
  $$select public.set_platform_money_kill_switch_state(
    'revenuecat_app_store_enabled',
    'off',
    'Rollback the bounded App Store sandbox test rail.',
    null,
    '{"platform":"ios","rollback":true,"live_money_action":false}'::jsonb
  )$$,
  'App Store sandbox switch has an audited rollback path'
);

select * from finish();
rollback;
