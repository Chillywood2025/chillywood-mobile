begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column(
  'public','paid_live_watch_party_passes','requested_at',
  'Live Stage Seat Pass requests have a persisted request timestamp'
);
select ok(exists(
  select 1 from pg_constraint
  where conrelid='public.paid_live_watch_party_passes'::regclass
    and conname='paid_live_watch_party_passes_request_type_check' and contype='c'
),'only seat passes may carry a speaking-seat request');
select ok(exists(
  select 1 from pg_constraint
  where conrelid='public.paid_live_watch_party_passes'::regclass
    and conname='paid_live_watch_party_passes_pending_request_check' and contype='c'
),'pending seat requests cannot masquerade as a reviewed outcome');
select has_function('public','request_my_live_watch_party_seat',array['text'],
  'viewer seat-request RPC exists');
select has_function('public','review_live_watch_party_seat_request',array['text','uuid','text'],
  'host seat-rejection RPC exists');
select has_function('public','list_live_watch_party_seat_states_for_host',array['text'],
  'exact host seat-state readback RPC exists');
select has_trigger('public','money_purchase_intents','enforce_live_stage_entry_before_seat_intent',
  'seat purchase intents have a database entry-first backstop');
select has_trigger('public','paid_live_watch_party_offers','sync_live_stage_offer_display_config',
  'Live Stage display configs follow offer disablement');
select has_trigger('public','paid_watch_party_offers','sync_party_room_offer_display_config',
  'Party Room display configs follow offer disablement');
select has_trigger('public','paid_creator_events','sync_event_offer_display_config',
  'Event display configs follow offer disablement');

select ok(has_function_privilege('authenticated','public.request_my_live_watch_party_seat(text)','EXECUTE'),
  'authenticated viewer may request a seat through the exact RPC');
select ok(not has_function_privilege('anon','public.request_my_live_watch_party_seat(text)','EXECUTE'),
  'anonymous users cannot request a seat');
select ok(has_function_privilege('authenticated','public.review_live_watch_party_seat_request(text,uuid,text)','EXECUTE'),
  'authenticated exact host may invoke seat review');
select ok(not has_function_privilege('anon','public.review_live_watch_party_seat_request(text,uuid,text)','EXECUTE'),
  'anonymous users cannot review seat requests');
select ok(has_function_privilege('authenticated','public.list_live_watch_party_seat_states_for_host(text)','EXECUTE'),
  'authenticated exact host may read provider-backed seat states');
select ok(not has_function_privilege('anon','public.list_live_watch_party_seat_states_for_host(text)','EXECUTE'),
  'anonymous users cannot read seat states');
select ok(not has_function_privilege('authenticated','public.has_exact_live_watch_party_pass_internal(text,uuid,text)','EXECUTE'),
  'exact-pass helper is not client executable');
select ok(not has_function_privilege('service_role','public.enforce_live_stage_entry_before_seat_intent_internal()','EXECUTE'),
  'entry-first trigger function is not directly executable');

select ok(
  position('live_stage_entry_required_before_seat_pass' in pg_get_functiondef(
    'public.enforce_live_stage_entry_before_seat_intent_internal()'::regprocedure
  ))>0
  and position('live_watch_party_access_pass' in pg_get_functiondef(
    'public.enforce_live_stage_entry_before_seat_intent_internal()'::regprocedure
  ))>0,
  'entry-first trigger names the exact paid-entry dependency'
);
select ok(
  position('wave1_current_caller_authority_internal' in pg_get_functiondef(
    'public.request_my_live_watch_party_seat(text)'::regprocedure
  ))>0
  and position('active_live_stage_viewer_membership_required' in pg_get_functiondef(
    'public.request_my_live_watch_party_seat(text)'::regprocedure
  ))>0
  and position('live_stage_entry_required_before_seat_request' in pg_get_functiondef(
    'public.request_my_live_watch_party_seat(text)'::regprocedure
  ))>0,
  'seat request requires current caller, exact membership, exact entry, and exact seat pass'
);
select ok(
  position('v_decision<>''reject''' in pg_get_functiondef(
    'public.review_live_watch_party_seat_request(text,uuid,text)'::regprocedure
  ))>0
  and position('exact_live_stage_host_required' in pg_get_functiondef(
    'public.review_live_watch_party_seat_request(text,uuid,text)'::regprocedure
  ))>0
  and position('has_exact_live_watch_party_pass_internal' in pg_get_functiondef(
    'public.review_live_watch_party_seat_request(text,uuid,text)'::regprocedure
  ))>0,
  'seat review RPC persists rejection only for the exact Live Stage host and exact active pass'
);
select ok(
  position('new."stage_role"=''speaker''' in pg_get_functiondef(
    'public.record_watch_party_money_pass_use_internal()'::regprocedure
  ))>0
  and position('new."membership_state" in (''active'',''reconnecting'')' in pg_get_functiondef(
    'public.record_watch_party_money_pass_use_internal()'::regprocedure
  ))>0
  and position('has_exact_live_watch_party_pass_internal' in pg_get_functiondef(
    'public.record_watch_party_money_pass_use_internal()'::regprocedure
  ))>0,
  'approval state comes only from canonical current speaker membership and an exact active pass'
);
select ok(
  position('''authority_granted'',false' in pg_get_functiondef(
    'public.request_my_live_watch_party_seat(text)'::regprocedure
  ))>0
  and position('''authority_granted'',false' in pg_get_functiondef(
    'public.review_live_watch_party_seat_request(text,uuid,text)'::regprocedure
  ))>0,
  'seat request and rejection explicitly grant no room or media authority'
);
select ok(
  position('exact_live_stage_host_required' in pg_get_functiondef(
    'public.list_live_watch_party_seat_states_for_host(text)'::regprocedure
  ))>0
  and position('has_exact_live_watch_party_pass_internal' in pg_get_functiondef(
    'public.list_live_watch_party_seat_states_for_host(text)'::regprocedure
  ))>0
  and position('"stage_role"=''speaker''' in pg_get_functiondef(
    'public.list_live_watch_party_seat_states_for_host(text)'::regprocedure
  ))>0,
  'host seat-state labels require exact host, exact provider-backed pass, and canonical speaker membership'
);
select ok(
  position('resolve_live_watch_party_money_access_as_service_internal' in pg_get_functiondef(
    'public.set_watch_party_participant_authority(text,text,text,boolean,text)'::regprocedure
  ))>0
  and position('speakerEligible' in pg_get_functiondef(
    'public.set_watch_party_participant_authority(text,text,text,boolean,text)'::regprocedure
  ))>0
  and position('resolve_live_watch_party_livekit_authority_internal' in pg_get_functiondef(
    'public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid)'::regprocedure
  ))>0,
  'speaker mutation still consumes exact paid eligibility before server LiveKit membership resolution'
);

-- Exercise the new entry-first trigger independently of unrelated purchase
-- intent triggers. Fixtures and trigger-state changes roll back with this test.
set local session_replication_role=replica;
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values
  ('aa200000-0000-4000-8000-000000000001',false,false,timezone('utc'::text,now())),
  ('bb200000-0000-4000-8000-000000000001',false,false,timezone('utc'::text,now()))
on conflict (id) do nothing;
insert into public.watch_party_rooms(party_id,host_user_id,room_type,is_active) values
  ('UX-RFGC-LIVE-PAID','aa200000-0000-4000-8000-000000000001','live',true),
  ('UX-RFGC-LIVE-FREE','aa200000-0000-4000-8000-000000000001','live',true);
insert into public.paid_live_watch_party_offers(
  id,party_id,creator_id,host_user_id,pass_type,product_id,provider,provider_product_id,
  price_cents,currency,environment,status
) values
  ('cc200000-0000-4000-8000-000000000001','UX-RFGC-LIVE-PAID','aa200000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001',
    'live_watch_party_access_pass',(select id from public.monetization_products where product_key='live_watch_party_access_pass_sandbox_099'),
    'revenuecat_google_play','cw_live_watch_party_access_sandbox_099',99,'usd','sandbox','sandbox'),
  ('cc200000-0000-4000-8000-000000000002','UX-RFGC-LIVE-PAID','aa200000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001',
    'live_watch_party_seat_pass',(select id from public.monetization_products where product_key='live_watch_party_seat_pass_sandbox_099'),
    'revenuecat_google_play','cw_live_watch_party_seat_sandbox_099',99,'usd','sandbox','sandbox'),
  ('cc200000-0000-4000-8000-000000000003','UX-RFGC-LIVE-FREE','aa200000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001',
    'live_watch_party_seat_pass',(select id from public.monetization_products where product_key='live_watch_party_seat_pass_sandbox_099'),
    'revenuecat_google_play','cw_live_watch_party_seat_sandbox_099',99,'usd','sandbox','sandbox');
set local session_replication_role=origin;

alter table public.money_purchase_intents disable trigger user;
alter table public.money_purchase_intents enable trigger enforce_live_stage_entry_before_seat_intent;

select throws_ok($$
  insert into public.money_purchase_intents(
    id,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,
    creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,session_generation,metadata
  ) values (
    'dd200000-0000-4000-8000-000000000001','bb200000-0000-4000-8000-000000000001',
    (select id from public.monetization_products where product_key='live_watch_party_seat_pass_sandbox_099'),
    'live_watch_party_seat_pass_sandbox_099','live_watch_party_seat_pass','revenuecat_google_play','cw_live_watch_party_seat_sandbox_099',
    'live_watch_party_seat','cc200000-0000-4000-8000-000000000002','aa200000-0000-4000-8000-000000000001',
    'sandbox','pending',99,'usd','ux-rfgc-paid-seat-without-entry',timezone('utc'::text,now())+interval '15 minutes','ux-rfgc-session','{}'
  )
$$,'P0001','live_stage_entry_required_before_seat_pass',
  'paid Live Stage rejects Seat Pass intent before charge when entry is missing');

select lives_ok($$
  insert into public.money_purchase_intents(
    id,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,
    creator_id,environment,status,amount_minor,currency,idempotency_key,expires_at,session_generation,metadata
  ) values (
    'dd200000-0000-4000-8000-000000000002','bb200000-0000-4000-8000-000000000001',
    (select id from public.monetization_products where product_key='live_watch_party_seat_pass_sandbox_099'),
    'live_watch_party_seat_pass_sandbox_099','live_watch_party_seat_pass','revenuecat_google_play','cw_live_watch_party_seat_sandbox_099',
    'live_watch_party_seat','cc200000-0000-4000-8000-000000000003','aa200000-0000-4000-8000-000000000001',
    'sandbox','pending',99,'usd','ux-rfgc-free-entry-seat',timezone('utc'::text,now())+interval '15 minutes','ux-rfgc-session','{}'
  )
$$,'free-entry Live Stage permits its optional Seat Pass intent');

alter table public.money_purchase_intents enable trigger user;

select * from finish();
rollback;
