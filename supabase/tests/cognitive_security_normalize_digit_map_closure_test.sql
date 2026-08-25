begin;

select plan(12);

select has_function(
  'public',
  'cognitive_security_normalize',
  array['text'],
  '1. cognitive security normalization remains installed'
);

select ok(
  (
    select procedure.provolatile = 'i'
      and not procedure.prosecdef
      and procedure.proconfig = array['search_path=""']
    from pg_catalog.pg_proc procedure
    where procedure.oid = 'public.cognitive_security_normalize(text)'::regprocedure
  ),
  '2. normalization remains immutable, invoker-security, and empty-search-path'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.cognitive_security_normalize(text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_security_normalize(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.cognitive_security_normalize(text)',
    'EXECUTE'
  ),
  '3. normalization ACL remains service-role-only'
);

select ok(
  pg_get_functiondef('public.cognitive_security_normalize(text)'::regprocedure)
    like '%digit_characters constant text%'
  and pg_get_functiondef('public.cognitive_security_normalize(text)'::regprocedure)
    not like '%string_agg(chr(block_start%'
  and pg_get_functiondef('public.cognitive_security_normalize(text)'::regprocedure)
    not like '%generate_series(0, 9)%',
  '4. the installed function uses a precomputed digit map without per-call generation'
);

create temporary table cognitive_digit_normalization_cases on commit drop as
select
  block_order,
  digit_offset,
  chr(block_start + digit_offset) as unicode_digit
from unnest(array[
    48,1632,1776,1984,2406,2534,2662,2790,2918,3046,3174,3302,3430,3558,
    3664,3792,3872,4160,4240,6112,6160,6470,6608,6784,6800,6992,7088,7232,
    7248,42528,43216,43264,43472,43504,43600,44016,66720,68912,69734,69872,
    69942,70096,70384,70736,70864,71248,71360,71472,71904,72016,72784,73040,
    73120,73552,92768,92864,93008,120782,120792,120802,120812,120822,
    123200,123632,124144,125264,130032
  ]) with ordinality as digit_block(block_start, block_order)
cross join generate_series(0,9) digit_offset;

select is(
  (select count(*)::integer from cognitive_digit_normalization_cases),
  670,
  '5. the reviewed map covers all 67 Unicode decimal-digit blocks'
);

select is(
  (
    select count(*)::integer
    from cognitive_digit_normalization_cases
    where public.cognitive_security_normalize(unicode_digit) <> digit_offset::text
  ),
  0,
  '6. every mapped Unicode decimal digit normalizes to its exact ASCII digit'
);

select is(
  (
    select count(*)::integer
    from (
      values
        (null::text, ''),
        ('Client_Secret=synthetic-value', 'Client_Secret=synthetic-value'),
        (U&'person@example\3002invalid', 'person@example.invalid'),
        (U&'oauth_client_se\200Bcr\0435t=x', 'oauth_client_secret=x'),
        ('oauth_client_se' || chr(917505) || 'cret=x', 'oauth_client_secret=x'),
        (U&'client_s\0415cret=x', 'client_sEcret=x'),
        (U&'passwor\0501=x', 'password=x'),
        ('pɑssword=x ᴘassword=x toᴋen=x ᴛoken=x ꜱecret=x',
         'password=x password=x token=x token=x secret=x'),
        (U&'\0661\0662\0663\0664\0665\0666\0667\0668\0669\0660', '1234567890'),
        ('ключ=value', 'kлюч=value'),
        (U&'client_secre\0301t=x', 'client_secret=x')
    ) as corpus(payload, expected)
    where public.cognitive_security_normalize(payload) is distinct from expected
  ),
  0,
  '7. the reviewed normalization and confusable corpus remains byte-identical'
);

select ok(
  (
    select bool_and(public.cognitive_text_has_secret(value))
    from (
      values
        (U&'oauth_client_se\FE0Fcret=synthetic-value'),
        ('oauth_client_se' || chr(917505) || 'cret=synthetic-value'),
        (U&'client_secre\0301t=synthetic-value'),
        (U&'client_\0455ecret=synthetic-value'),
        (U&'passwor\0501=synthetic-value'),
        ('pɑssword=x'),
        ('ᴘassword=x'),
        ('toᴋen=x')
    ) variants(value)
  ),
  '8. secret labels remain fail-closed across ignored and confusable characters'
);

select ok(
  public.cognitive_text_has_private_identifier('person@例子' || U&'\3002' || '测试')
  and public.cognitive_text_has_private_identifier('person' || U&'\200B' || '@example.invalid')
  and public.cognitive_text_has_private_identifier(U&'\0661\0662\0663\0664\0665\0666\0667\0668\0669\0660'),
  '9. private identifiers remain fail-closed across separators, ignored characters, and digits'
);

select ok(
  not public.cognitive_text_has_secret('ключ=value')
  and not public.cognitive_text_has_secret('authorizationStatus=x')
  and not public.cognitive_text_has_private_identifier('{"Version":"2012-10-17","Effect":"Allow"}'),
  '10. reviewed benign international and policy text remains usable'
);

select is(
  public.cognitive_json_is_sanitized(
    (
      select jsonb_agg(
        jsonb_build_object('position', n, 'value', 'safe')
        order by n
      )
      from generate_series(0,127) n
    )
  ),
  true,
  '11. the maximum allowed positioned payload preserves its safe result'
);

select performs_ok(
  $$select public.cognitive_json_is_sanitized(
    (select jsonb_agg(jsonb_build_object('position',n,'value','safe') order by n)
     from generate_series(0,127) n)
  )$$,
  5000,
  '12. the maximum allowed positioned payload remains below the reviewed statement timeout'
);

select * from finish();
rollback;
