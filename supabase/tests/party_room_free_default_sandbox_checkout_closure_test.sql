begin;
select plan(19);

select has_function('public','resolve_paid_watch_party_ticket_access',array['text'],
  '1. exact Party Room entry resolver exists');
select ok(has_function_privilege('authenticated','public.resolve_paid_watch_party_ticket_access(text)','EXECUTE'),
  '2. authenticated customers may resolve exact Party Room entry');
select ok(not has_function_privilege('anon','public.resolve_paid_watch_party_ticket_access(text)','EXECUTE'),
  '3. anonymous clients cannot invoke room money authority');
select ok(position('''free_room''' in pg_get_functiondef(
  'public.resolve_paid_watch_party_ticket_access(text)'::regprocedure))>0,
  '4. no-offer active title rooms resolve through an explicit free-room branch');
select ok(position('source_type' in pg_get_functiondef(
  'public.resolve_paid_watch_party_ticket_access(text)'::regprocedure))=0
  and position('content_access_rule' in pg_get_functiondef(
  'public.resolve_paid_watch_party_ticket_access(text)'::regprocedure))=0,
  '5. content type and content entitlement do not silently price Party Room entry');
select ok(position('wave1_current_caller_authority_internal' in pg_get_functiondef(
  'public.resolve_paid_watch_party_ticket_access(text)'::regprocedure))>0
  and position('is_account_access_restricted' in pg_get_functiondef(
  'public.resolve_paid_watch_party_ticket_access(text)'::regprocedure))>0
  and position('watch_party_room_actor_blocked_by_host' in pg_get_functiondef(
  'public.resolve_paid_watch_party_ticket_access(text)'::regprocedure))>0,
  '6. restoring free entry preserves current-session, account, and room-block authority');

set local session_replication_role=replica;
insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values
  ('a6000000-0000-4000-8000-000000000001',false,false,timezone('utc'::text,now())),
  ('a6000000-0000-4000-8000-000000000002',false,false,timezone('utc'::text,now()))
on conflict (id) do nothing;
insert into auth.sessions(id,user_id,not_after) values
  ('b6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001',now()+interval '1 day'),
  ('b6000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000002',now()+interval '1 day');
insert into public.wave1_legal_acceptances(
  user_id,subject_hash,document_key,document_version,market,role_key,
  capability,session_generation,authority_source
)
select authority.user_id,public.wave1_sha256(authority.user_id::text),
  document.document_key,document.version,document.market,'member',
  document.capability,authority.session_generation,'service_reconciliation'
from (values
  ('a6000000-0000-4000-8000-000000000001'::uuid,'b6000000-0000-4000-8000-000000000001'::text),
  ('a6000000-0000-4000-8000-000000000002'::uuid,'b6000000-0000-4000-8000-000000000002'::text)
) authority(user_id,session_generation)
cross join public.wave1_legal_document_versions document
where document.active and document.market='UNITED_STATES'
  and document.capability='account';
insert into public.watch_party_rooms(
  party_id,host_user_id,room_type,is_active,title_id,source_type,source_id,content_access_rule
) values
  ('POLISH-FREE-PLATFORM','a6000000-0000-4000-8000-000000000001','title',true,'platform-free','platform_title','platform-free','open'),
  ('POLISH-FREE-PREMIUM','a6000000-0000-4000-8000-000000000001','title',true,'platform-premium','platform_title','platform-premium','premium'),
  ('POLISH-FREE-PASS-CONTENT','a6000000-0000-4000-8000-000000000001','title',true,'platform-pass','platform_title','platform-pass','party_pass'),
  ('POLISH-FREE-CANCELED','a6000000-0000-4000-8000-000000000001','title',true,'platform-canceled','platform_title','platform-canceled','open'),
  ('POLISH-PAID-EXACT','a6000000-0000-4000-8000-000000000001','title',true,'platform-paid','platform_title','platform-paid','open'),
  ('POLISH-INACTIVE','a6000000-0000-4000-8000-000000000001','title',false,'platform-ended','platform_title','platform-ended','open'),
  ('POLISH-LIVE','a6000000-0000-4000-8000-000000000001','live',true,null,null,null,'open');
insert into public.paid_watch_party_offers(
  id,party_id,creator_id,host_id,title,price_cents,currency,status,provider,
  provider_product_key,provider_product_id,metadata
) values
  ('e6000000-0000-4000-8000-000000000001','POLISH-PAID-EXACT',
   'a6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001',
   'Exact Party Room Pass',99,'usd','sandbox','revenuecat_google_play',
   'watch_party_live_ticket_sandbox_099','cw_watch_party_ticket_sandbox_099','{}'),
  ('e6000000-0000-4000-8000-000000000002','POLISH-FREE-CANCELED',
   'a6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001',
   'Canceled historical Party Room Pass',99,'usd','canceled','revenuecat_google_play',
   'watch_party_live_ticket_sandbox_099','cw_watch_party_ticket_sandbox_099','{}');
set local session_replication_role=origin;

select is(public.resolve_paid_watch_party_ticket_access('POLISH-FREE-PLATFORM')->>'reason','auth_required',
  '7. a free room still requires an authenticated customer');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a6000000-0000-4000-8000-000000000002","session_id":"b6000000-0000-4000-8000-000000000002"}',true);
select is(public.resolve_paid_watch_party_ticket_access('POLISH-FREE-PLATFORM')->>'reason','free_room',
  '8. a fresh ordinary platform-title Party Room is free');
select is(public.resolve_paid_watch_party_ticket_access('POLISH-FREE-PREMIUM')->>'reason','free_room',
  '9. Premium content authority does not create a Party Room Pass');
select is(public.resolve_paid_watch_party_ticket_access('POLISH-FREE-PASS-CONTENT')->>'reason','free_room',
  '10. underlying content authority remains independent from room-entry monetization');
select is(public.resolve_paid_watch_party_ticket_access('POLISH-FREE-CANCELED')->>'reason','free_room',
  '11. disabling paid entry stops the purchase gate without deleting history');
reset role;

update auth.users set banned_until=now()+interval '1 day'
where id='a6000000-0000-4000-8000-000000000002';
set local role authenticated;
select is(public.resolve_paid_watch_party_ticket_access('POLISH-FREE-PLATFORM')->>'reason','session_authority_not_current',
  '12. a restricted account loses current-session authority before free-room admission');
reset role;
update auth.users set banned_until=null
where id='a6000000-0000-4000-8000-000000000002';
insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id,reason)
values (
  'a6000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000002',
  'a6000000-0000-4000-8000-000000000001',
  'party-room-free-entry-regression'
);
set local role authenticated;
select is(public.resolve_paid_watch_party_ticket_access('POLISH-FREE-PLATFORM')->>'reason','blocked_by_host',
  '13. restoring free entry never bypasses the exact room host block');
reset role;
delete from public.channel_audience_blocks
where channel_user_id='a6000000-0000-4000-8000-000000000001'
  and blocked_user_id='a6000000-0000-4000-8000-000000000002';

select set_config('request.jwt.claims','{}',true);
select is(public.resolve_paid_watch_party_ticket_access('POLISH-PAID-EXACT')->>'reason','auth_required',
  '14. only the intentionally monetized exact room enters the paid resolver');
select is((public.resolve_paid_watch_party_ticket_access('POLISH-PAID-EXACT')->>'requiresPurchase')::boolean,true,
  '15. the exact paid room still requires its exact Party Room Pass');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a6000000-0000-4000-8000-000000000001","session_id":"b6000000-0000-4000-8000-000000000001"}',true);
select ok((public.resolve_paid_watch_party_ticket_access('POLISH-PAID-EXACT')->>'allowed')::boolean
  and public.resolve_paid_watch_party_ticket_access('POLISH-PAID-EXACT')->>'reason'='host_or_admin',
  '16. the exact room host is never forced to buy a viewer Party Room Pass');
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"a6000000-0000-4000-8000-000000000002","session_id":"b6000000-0000-4000-8000-000000000002"}',true);
select is(public.resolve_paid_watch_party_ticket_access('POLISH-FREE-PLATFORM')->>'reason','free_room',
  '17. a paid sibling cannot leak into another room');
select is(public.resolve_paid_watch_party_ticket_access('POLISH-INACTIVE')->>'reason','room_unavailable',
  '18. an ended room cannot masquerade as free active access');
select is(public.resolve_paid_watch_party_ticket_access('POLISH-LIVE')->>'reason','room_unavailable',
  '19. the Party Room resolver never grants Live Stage entry');
reset role;

select * from finish();
rollback;
