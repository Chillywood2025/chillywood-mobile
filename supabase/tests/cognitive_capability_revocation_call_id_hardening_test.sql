begin;

select plan(3);

select ok(
  not public.cognitive_text_has_private_identifier('revocation-event')
  and not public.cognitive_text_has_secret('revocation-event'),
  'the deterministic revocation event key is sanitized'
);

select ok(
  strpos(
    pg_catalog.pg_get_functiondef(
      'public.cognitive_revoke_capability(text,text,text)'::regprocedure
    ),
    '''revocation-event'''
  ) > 0,
  'capability revocation uses the deterministic per-capability event key'
);

select ok(
  strpos(
    pg_catalog.pg_get_functiondef(
      'public.cognitive_revoke_capability(text,text,text)'::regprocedure
    ),
    'gen_random_uuid'
  ) = 0,
  'capability revocation no longer creates classifier-sensitive random IDs'
);

select * from finish();

rollback;
