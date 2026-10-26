-- Synthetic authority evidence in a disposable full-schema database. No
-- application function is stubbed and no real provider is contacted.
create schema event_reservation_fixture;
create table event_reservation_fixture.actors(user_id uuid primary key,session_id uuid not null,kind text not null);
insert into event_reservation_fixture.actors
select creator_id,md5('event-reservation-session:'||creator_id::text)::uuid,'creator'
from (select md5('event-reservation-creator:'||n::text)::uuid creator_id from generate_series(1,1000)n) candidates
where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||creator_id::text,20260814),100)=0 limit 1;
insert into event_reservation_fixture.actors
select md5('event-reservation-buyer:'||n::text)::uuid,md5('event-reservation-session:'||n::text)::uuid,'buyer'||n::text
from generate_series(1,20)n;
insert into auth.users(id,is_sso_user,is_anonymous,email,email_confirmed_at)
select user_id,false,false,kind||'@event-reservation.example',now() from event_reservation_fixture.actors;
insert into auth.sessions(id,user_id) select session_id,user_id from event_reservation_fixture.actors;
insert into public.sandbox_monetization_testers(user_id,status,note)
select user_id::text,'active','Synthetic local reservation fixture' from event_reservation_fixture.actors;
insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,
  role_key,capability,session_generation,authority_source)
select a.user_id,public.wave1_sha256(a.user_id::text),d.document_key,d.version,d.market,
  'member',d.capability,a.session_id::text,'service_reconciliation'
from event_reservation_fixture.actors a cross join public.wave1_legal_document_versions d
where d.active and d.market='UNITED_STATES' and (d.capability='account' or
  (a.kind='creator' and d.capability in('creator','creator_money')));
select public.wave1_evaluate_creator_eligibility(user_id,jsonb_build_object(
  'accountStatus','ACTIVE','age18Plus',true,'legalAccepted',true,'creatorRole',true,
  'moderationState','CLEAR','market','UNITED_STATES','rolloutEligible',false,
  'platformCapability',true,'providerEligible',true,'kycComplete',true,'taxComplete',true,
  'sanctionsClear',true,'payoutEligible',true,'inputVersions',jsonb_build_object('evaluationSequence',1)),
  'event-reservation-synthetic','local_pgtap') from event_reservation_fixture.actors where kind='creator';
-- Existing sandbox rail state in this isolated fixture only; no catalog rows
-- are inserted, prices changed, or production/store settings accessed.
update public.platform_money_kill_switches set state=case
  when key in('live_money_enabled','payouts_enabled') then 'off' else 'sandbox_only' end
where key in('revenuecat_app_store_enabled','revenuecat_google_play_enabled','provider_webhooks_enabled',
  'digital_sales_enabled','creator_monetization_enabled','live_money_enabled','payouts_enabled');
create table event_reservation_fixture.events(id uuid primary key,name text not null);
insert into event_reservation_fixture.events select md5('event-reservation-show:'||n::text)::uuid,'show'||n::text
from generate_series(1,16)n;
insert into public.creator_events(id,host_user_id,event_title,event_type,status,starts_at,ends_at,time_zone,replay_policy)
select e.id,a.user_id,'Sunday at 8 – '||e.name,'live_first','scheduled',now()+interval '7 days',
  now()+interval '7 days 2 hours','America/New_York','none'
from event_reservation_fixture.events e cross join event_reservation_fixture.actors a where a.kind='creator';
grant usage on schema event_reservation_fixture to authenticated,service_role;
grant select on event_reservation_fixture.actors,event_reservation_fixture.events to authenticated,service_role;
