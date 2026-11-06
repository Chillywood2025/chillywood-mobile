begin;

-- Store tips do not use the creator's Connect account. Keep their admission
-- separate from external checkout readiness, with no live financial authority.
create function private.creator_tip_native_sandbox_available(p_creator uuid,p_platform text)
returns boolean language sql volatile security definer set search_path='' as $$
 select coalesce(p_platform in ('ios','android')
  and private.ordinary_creator_subject_for_mode(p_creator,'sandbox')
  and exists(select 1 from public.creator_tip_settings where creator_id=p_creator and tips_enabled
   and status in ('active','setup_incomplete') and provider_environment='test' and currency='usd')
  and (select count(*) from public.platform_money_kill_switches where key in
   ('tips_enabled','creator_monetization_enabled','provider_webhooks_enabled',
    case p_platform when 'ios' then 'revenuecat_app_store_enabled' else 'revenuecat_google_play_enabled' end)
   and state='sandbox_only')=4
  and exists(select 1 from public.creator_money_supported_prices_internal('creator_tip',p_platform,'sandbox')),false)
$$;
revoke all on function private.creator_tip_native_sandbox_available(uuid,text) from public,anon,authenticated,service_role;

-- Test capability is separate from verified live eligibility. Every operation
-- below supplies its stored/selected provider mode; the strict legacy helpers
-- remain unchanged for production publication, settlements and recovery.
do $patch$
declare item record; definition text;
begin
 for item in select * from (values
  ('public.upsert_my_creator_tip_settings(boolean,integer[],integer,integer,integer,text)',
   'public."wave1_assert_current_creator_money_authority_internal"()',
   'private.assert_current_creator_for_mode(''sandbox'')',1),
  ('public.get_creator_tip_public_status(uuid)',
   'public."wave1_creator_money_subject_authorized_internal"(p_creator_id)',
   'private.ordinary_creator_subject_for_mode(p_creator_id,''sandbox'')',1),
  ('public.get_creator_tip_amount_quote(uuid,integer,uuid)',
   'public.wave1_creator_money_subject_authorized_internal(p_creator_id)',
   'private.ordinary_creator_subject_for_mode(p_creator_id,''sandbox'')',1),
  ('private.read_creator_tip_route_costs_for_subject(uuid,uuid,uuid,integer,text)',
   'public.wave1_creator_money_subject_authorized_internal(p_creator_id)',
   'private.ordinary_creator_subject_for_mode(p_creator_id,''sandbox'')',1),
  ('public.admit_google_play_external_session(text,uuid,integer,uuid,text,integer,uuid)',
   'public.wave1_creator_money_subject_authorized_internal(p_creator_id)',
   'private.ordinary_creator_subject_for_mode(p_creator_id,''sandbox'')',1),
  ('private.resolve_creator_external_payment_capability(uuid,uuid,text,uuid,integer,text,text,uuid)',
   'public.wave1_creator_money_subject_authorized_internal(p_creator_id)',
   'private.ordinary_creator_subject_for_mode(p_creator_id,case p_environment when ''test'' then ''sandbox'' when ''live'' then ''production'' end)',1),
  ('public.create_creator_event_auction(uuid,uuid,integer,integer,timestamptz,timestamptz,text)',
   'public.wave1_assert_current_creator_money_authority_internal()',
   'private.assert_current_creator_for_mode(case p_environment when ''test'' then ''sandbox'' when ''live'' then ''production'' end)',2),
  ('public.create_creator_room_seat_auction(text,text,integer,integer,timestamptz,timestamptz,text,uuid,uuid)',
   'public.wave1_assert_current_creator_money_authority_internal()',
   'private.assert_current_creator_for_mode(case p_environment when ''test'' then ''sandbox'' when ''live'' then ''production'' end)',2),
  ('private.creator_event_auction_source_valid(private.creator_event_auctions)',
   'public.wave1_creator_money_subject_authorized_internal(a.creator_id)',
   'private.ordinary_creator_subject_for_mode(a.creator_id,case a.environment when ''test'' then ''sandbox'' when ''live'' then ''production'' end)',1),
  ('private.creator_event_auction_grant_identity(uuid,uuid,uuid)',
   'public.wave1_creator_money_subject_authorized_internal(i.creator_id)',
   'private.ordinary_creator_subject_for_mode(i.creator_id,i.environment)',1),
  ('public.process_stripe_event_auction_receipt(jsonb,text)',
   'public.wave1_creator_money_subject_authorized_internal(i.creator_id)',
   'private.ordinary_creator_subject_for_mode(i.creator_id,i.environment)',1),
  ('public.process_stripe_room_auction_receipt(jsonb,text)',
   'public.wave1_creator_money_subject_authorized_internal(i.creator_id)',
   'private.ordinary_creator_subject_for_mode(i.creator_id,i.environment)',1),
  ('public.prepare_creator_room_seat_auction_pre_explicit_mode(text)',
   'public.wave1_assert_current_creator_money_authority_internal()',
   'private.assert_current_creator_for_mode(case private.auction_creator_mode(''room_seat_auction'',auth.uid()) when ''test'' then ''sandbox'' when ''live'' then ''production'' end)',2)
 ) as changes(signature,needle,replacement,expected)
 loop
  definition:=pg_get_functiondef(item.signature::regprocedure);
  if length(definition)-length(replace(definition,item.needle,''))<>length(item.needle)*item.expected
  then raise exception 'sandbox_tip_auction_patch_changed: %',item.signature; end if;
  execute replace(definition,item.needle,item.replacement);
 end loop;
end $patch$;

-- A common restriction projection may point at the creator's live account.
-- Never use that pointer to select a test recipient or borrow its readiness:
-- require the independently bound test account's own provider/KYC facts, while
-- retaining every shared explicit false/hold/admin restriction below.
do $patch$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('private.resolve_creator_external_payment_capability(uuid,uuid,text,uuid,integer,text,text,uuid)'::regprocedure);
 needle:='and recipient_eligibility.payout_account_id=recipient.id';
 if position(needle in definition)=0 then raise exception 'sandbox_external_recipient_mode_patch_changed'; end if;
 definition:=replace(definition,needle,
  'and (capability.environment=''test'' or recipient_eligibility.payout_account_id=recipient.id)');
 needle:='    and recipient.charges_enabled and recipient.payouts_enabled and recipient.onboarding_status=''ready_for_payouts''';
 if position(needle in definition)=0 then raise exception 'sandbox_external_recipient_facts_patch_changed'; end if;
 execute replace(definition,needle,needle||$replacement$
    and (capability.environment<>'test' or (recipient.details_submitted
      and nullif(btrim(recipient.disabled_reason),'') is null
      and recipient.requirements_currently_due='[]'::jsonb and recipient.requirements_past_due='[]'::jsonb
      and exists(select 1 from private.creator_connect_mode_bindings binding
        where binding.payout_account_id=recipient.id and binding.creator_id=recipient.creator_user_id
          and binding.environment='test' and binding.provider_account_id=recipient.provider_account_id)))
$replacement$);
end $patch$;

do $patch$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('public.get_creator_tip_public_status(uuid)'::regprocedure);
 needle:='    ''policyCopy'',';
 if position(needle in definition)=0 then raise exception 'sandbox_native_tip_status_patch_changed'; end if;
 execute replace(definition,needle,$replacement$
    'nativeSandboxAvailable',private.creator_tip_native_sandbox_available(p_creator_id,'ios')
      or private.creator_tip_native_sandbox_available(p_creator_id,'android'),
    'nativeSandboxEnvironment','sandbox','nativeFinancialAuthority',false,
    'nativeSandboxPlatforms',jsonb_build_object(
      'ios',private.creator_tip_native_sandbox_available(p_creator_id,'ios'),
      'android',private.creator_tip_native_sandbox_available(p_creator_id,'android')),
    'policyCopy',$replacement$);

 definition:=pg_get_functiondef('public.begin_creator_money_checkout(uuid,uuid)'::regprocedure);
 needle:='select tips_enabled and status=''active'' into source_valid';
 if position(needle in definition)=0 then raise exception 'sandbox_native_tip_dispatch_patch_changed'; end if;
 execute replace(definition,needle,$replacement$select tips_enabled and (status='active' or
       (status='setup_incomplete' and i.environment='sandbox'
        and i.provider in ('revenuecat_app_store','revenuecat_google_play')
        and private.creator_tip_native_sandbox_available(i.creator_id,
         case i.provider when 'revenuecat_app_store' then 'ios' when 'revenuecat_google_play' then 'android' end))) into source_valid$replacement$);

 definition:=pg_get_functiondef('public.create_money_purchase_intent_pre_protected_video_closeout(text,text,uuid,jsonb)'::regprocedure);
 needle:='and settings."status" = ''active''';
 if position(needle in definition)=0 then raise exception 'sandbox_native_tip_android_source_patch_changed'; end if;
 definition:=replace(definition,needle,$replacement$and (settings."status" = 'active' or
       (settings."status"='setup_incomplete' and v_product.environment='sandbox'
        and v_product.provider='revenuecat_google_play'
        and private.creator_tip_native_sandbox_available(settings.creator_id,'android')))$replacement$);
 needle:=$needle$or not exists (
      select 1 from public."wave1_creator_eligibility" eligibility
      where eligibility."creator_user_id" = v_creator
        and eligibility."state" = 'VERIFIED'
        and eligibility."account_status" = 'ACTIVE'
        and eligibility."age_18_plus" and eligibility."legal_accepted" and eligibility."creator_role"
        and eligibility."moderation_state" = 'CLEAR' and eligibility."market" = 'UNITED_STATES'
        and eligibility."rollout_eligible" and eligibility."platform_capability"
        and eligibility."provider_eligible" and eligibility."kyc_complete" and eligibility."tax_complete"
        and eligibility."sanctions_clear" and eligibility."payout_eligible"
    )$needle$;
 if position(needle in definition)=0 then raise exception 'sandbox_native_google_creator_patch_changed'; end if;
 execute replace(definition,needle,'or not private.ordinary_creator_subject_for_mode(v_creator,v_product.environment)');

 definition:=pg_get_functiondef('private.read_creator_tip_route_costs_for_subject(uuid,uuid,uuid,integer,text)'::regprocedure);
 needle:=$needle$settings.status is distinct from 'active'
    or settings.provider_charges_enabled is distinct from true or settings.provider_payouts_enabled is distinct from true$needle$;
 if position(needle in definition)=0 then raise exception 'sandbox_native_tip_routes_settings_patch_changed'; end if;
 definition:=replace(definition,needle,'settings.status not in (''active'',''setup_incomplete'')');
 needle:='  if p_platform in (''ios'',''android'')';
 if position(needle in definition)=0 then raise exception 'sandbox_native_tip_routes_native_patch_changed'; end if;
 definition:=replace(definition,needle,needle||' and private.creator_tip_native_sandbox_available(p_creator_id,p_platform)');
 needle:='  if settings.provider_charges_enabled and settings.provider_payouts_enabled';
 if position(needle in definition)=0 then raise exception 'sandbox_native_tip_routes_external_patch_changed'; end if;
 execute replace(definition,needle,'  if settings.status=''active'' and settings.provider_charges_enabled and settings.provider_payouts_enabled');
end $patch$;

-- iOS auction admissions may be live. Resolve the exact source mode before
-- checking creator authority; the tip source remains explicitly test-only.
do $patch$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('public.admit_ios_external_session(text,uuid,integer,uuid,text,integer,uuid)'::regprocedure);
 needle:='    or not public.wave1_creator_money_subject_authorized_internal(p_creator_id)';
 if position(needle in definition)=0 then raise exception 'sandbox_ios_admission_creator_patch_changed'; end if;
 definition:=replace(definition,needle,'');
 needle:='  if p_feature in(''event_auction'',''room_seat_auction'') and not private.auction_checkout_mode_allowed(source_environment)';
 if position(needle in definition)=0 then raise exception 'sandbox_ios_admission_mode_patch_changed'; end if;
 definition:=replace(definition,needle,
  '  if not private.ordinary_creator_subject_for_mode(p_creator_id,case source_environment when ''test'' then ''sandbox'' when ''live'' then ''production'' end)
  then raise exception ''ios_external_storefront_observation_required''; end if;
'||needle);
 execute definition;
end $patch$;

create or replace function public.read_creator_auction_creation_mode(p_feature text)
returns text language plpgsql volatile security definer set search_path='' as $$
declare mode text;
begin
 mode:=private.auction_creator_mode(p_feature,auth.uid());
 perform private.assert_current_creator_for_mode(case mode when 'test' then 'sandbox' when 'live' then 'production' end);
 return mode;
end $$;

-- Room-seat source checks also carry an explicit mode. Do not broaden the
-- retained two-argument helper, whose other callers may lack such evidence.
do $patch$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('private.creator_room_seat_subject_allowed(text,uuid)'::regprocedure);
 needle:='(p_party_id text, p_user_id uuid)';
 if position(needle in definition)=0 then raise exception 'sandbox_room_subject_signature_changed'; end if;
 definition:=replace(definition,needle,'(p_party_id text, p_user_id uuid, p_environment text)');
 needle:='public.wave1_creator_money_subject_authorized_internal(r.host_user_id)';
 if position(needle in definition)=0 then raise exception 'sandbox_room_subject_predicate_changed'; end if;
 execute replace(definition,needle,'private.ordinary_creator_subject_for_mode(r.host_user_id,p_environment)');
end $patch$;
revoke all on function private.creator_room_seat_subject_allowed(text,uuid,text) from public,anon,authenticated,service_role;

do $patch$
declare item record; definition text;
begin
 for item in select * from (values
  ('private.creator_room_seat_auction_source_valid(private.creator_room_seat_auctions)',
   'private.creator_room_seat_subject_allowed(a.party_id,a.creator_id)',
   'private.creator_room_seat_subject_allowed(a.party_id,a.creator_id,case a.environment when ''test'' then ''sandbox'' when ''live'' then ''production'' end)'),
  ('private.assert_creator_room_seat_auction_buyer(private.creator_room_seat_auctions,uuid)',
   'private.creator_room_seat_subject_allowed(a.party_id,p_buyer_id)',
   'private.creator_room_seat_subject_allowed(a.party_id,p_buyer_id,case a.environment when ''test'' then ''sandbox'' when ''live'' then ''production'' end)'),
  ('public.read_creator_room_seat_auction(uuid)',
   'private.creator_room_seat_subject_allowed(a.party_id,auth.uid())',
   'private.creator_room_seat_subject_allowed(a.party_id,auth.uid(),case a.environment when ''test'' then ''sandbox'' when ''live'' then ''production'' end)'),
  ('public.read_creator_room_seat_auction_bid_eligibility(uuid,integer)',
   'private.creator_room_seat_subject_allowed(a.party_id,auth.uid())',
   'private.creator_room_seat_subject_allowed(a.party_id,auth.uid(),case a.environment when ''test'' then ''sandbox'' when ''live'' then ''production'' end)'),
  ('public.process_stripe_room_auction_receipt(jsonb,text)',
   'private.creator_room_seat_subject_allowed(a.party_id,i.user_id)',
   'private.creator_room_seat_subject_allowed(a.party_id,i.user_id,i.environment)')
 ) as changes(signature,needle,replacement)
 loop
  definition:=pg_get_functiondef(item.signature::regprocedure);
  if length(definition)-length(replace(definition,item.needle,''))<>length(item.needle)
  then raise exception 'sandbox_room_auction_patch_changed: %',item.signature; end if;
  execute replace(definition,item.needle,item.replacement);
 end loop;
end $patch$;

create or replace function public.list_creator_room_seat_auctions(p_party_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:='[]'::jsonb; a record;
begin
 if auth.uid() is null or not public.wave1_current_caller_authority_internal() or public.is_account_access_restricted(auth.uid()::text)
 then raise exception 'auction_not_found'; end if;
 for a in select id from private.creator_room_seat_auctions
  where party_id=p_party_id and private.creator_room_seat_subject_allowed(p_party_id,auth.uid(),
   case environment when 'test' then 'sandbox' when 'live' then 'production' end)
  order by created_at desc,id limit 50
 loop result:=result||jsonb_build_array(public.read_creator_room_seat_auction(a.id)); end loop;
 return result;
end $$;

create or replace function private.creator_room_paid_seat_claim(p_party_id text,p_user_id uuid)
returns private.creator_room_seat_claims language plpgsql stable security definer set search_path='' as $$
declare c private.creator_room_seat_claims;
begin
 select claim.* into c from private.creator_room_seat_claims claim
  join private.creator_room_sessions s on s.id=claim.room_session_id
  join private.creator_room_seat_auctions a on a.id=claim.auction_id
  where claim.party_id=p_party_id and claim.buyer_id=p_user_id and s.ended_at is null
   and private.creator_room_seat_subject_allowed(p_party_id,p_user_id,
    case a.environment when 'test' then 'sandbox' when 'live' then 'production' end)
   and claim.state in('paid_reserved','available') and claim.paid_at is not null
   and private.creator_room_session_current(s.id) and private.creator_room_seat_payment_verified(claim.id)
  order by claim.created_at,claim.id limit 1;
 return c;
end $$;

commit;
