-- Synthetic minimum column fixture for the REAL source-derived adapter.
-- Not a Supabase migration/bootstrap, Auth implementation or deployed-schema proof.
create schema auth;
revoke all on schema auth from public;
create table auth.users(id uuid primary key, deleted_at timestamptz,
 email_confirmed_at timestamptz, raw_app_meta_data jsonb, banned_until timestamptz,
 is_anonymous boolean not null default false);
create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
create table public.account_deletion_requests(user_id uuid,status text);
create table public.user_profiles(user_id text primary key,channel_role text);
create table public.wave1_legal_document_versions(document_key text,capability text,
 active boolean,market text,version text,effective_at timestamptz);
create table public.wave1_legal_acceptances(user_id uuid,session_generation text,
 document_key text,document_version text,market text,capability text,role_key text,invalidated_at timestamptz);
create table public.wave1_creator_eligibility(creator_user_id uuid primary key,state text,
 account_status text,age_18_plus boolean,market text,moderation_state text,creator_role boolean,
 platform_capability boolean,provider_eligible boolean,kyc_complete boolean,tax_complete boolean,
 sanctions_clear boolean,payout_eligible boolean);
create table public.creator_payout_eligibility_records(creator_user_id text,fraud_hold_active boolean,
 admin_review_status text,eligibility_status text);
create table public.creator_payout_accounts(creator_user_id text,provider_environment text,disabled_reason text,status text);
create table public.platform_money_kill_switches(key text primary key,state text);
create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,
 declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);
create schema authority_fixture;
create function authority_fixture.reset() returns void language plpgsql as $$
begin
 truncate auth.users,auth.sessions,public.account_deletion_requests,public.user_profiles,
 public.wave1_legal_document_versions,public.wave1_legal_acceptances,
 public.wave1_creator_eligibility,public.creator_payout_eligibility_records,
 public.creator_payout_accounts,public.platform_money_kill_switches,sandbox_commerce_v1.declarations;
 insert into auth.users(id,email_confirmed_at,raw_app_meta_data)
 values('11111111-1111-4111-8111-111111111111',clock_timestamp(),'{}');
 insert into auth.sessions values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',clock_timestamp()+interval '1 hour');
 insert into public.wave1_legal_document_versions
 select key,cap,true,'UNITED_STATES','1',clock_timestamp()-interval '1 day'
 from (values('terms','account'),('privacy','account'),('community_guidelines','account'),('creator_terms','creator'),('money_terms','creator_money')) d(key,cap);
 insert into public.wave1_legal_acceptances
 select '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
 document_key,version,market,capability,'member',null from public.wave1_legal_document_versions;
 insert into public.platform_money_kill_switches values('live_money_enabled','off'),('payouts_enabled','off'),('cashout_enabled','off');
 insert into sandbox_commerce_v1.declarations values('11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',true,'US','CA','adult-us-creator-v1',clock_timestamp());
 perform premium_fixture.reset('11111111-1111-4111-8111-111111111111');
end; $$;
