-- Creator Access Product Doctrine Amendment.
--
-- VIP is one exact creator's non-renewing 30-day pass. Channel Subscription
-- remains recurring and may authorize that exact creator's ordinary Paid
-- Videos without creating a per-video grant, transaction, or ledger event.
-- VIP-only video authority remains exclusive to exact-creator VIP.

create or replace function public."canonicalize_creator_vip_grant_period"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_event public."provider_events"%rowtype;
begin
  if new."grant_type"<>'vip_pass' then return new; end if;

  if tg_op='UPDATE' then
    -- Activation is immutable for one provider-bound purchase. Refund,
    -- revocation, and expiry events may remove authority but cannot extend it.
    new."starts_at":=old."starts_at";
    new."expires_at":=old."starts_at"+interval '30 days';
    return new;
  end if;

  select provider_event.* into v_provider_event
  from public."provider_events" provider_event
  where provider_event."id"=new."provider_event_id";
  if v_provider_event."id" is null
    or v_provider_event."user_id" is distinct from new."user_id"
    or v_provider_event."provider" is distinct from new."provider"
    or v_provider_event."occurred_at" is null
    or upper(pg_catalog.btrim(coalesce(v_provider_event."event_type",'')))
      not in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE')
  then
    raise exception 'vip_verified_activation_required';
  end if;

  new."starts_at":=v_provider_event."occurred_at";
  new."expires_at":=v_provider_event."occurred_at"+interval '30 days';
  return new;
end;
$$;
revoke all on function public."canonicalize_creator_vip_grant_period"()
  from public,anon,authenticated,service_role;

-- Repair historical VIP grants from their immutable verified activation.
-- Reported provider expiry is intentionally ignored for this one-time pass.
update public."access_grants" grant_row
set "starts_at"=provider_event."occurred_at",
    "expires_at"=provider_event."occurred_at"+interval '30 days',
    "updated_at"=timezone('utc'::text,now())
from public."provider_events" provider_event
where grant_row."grant_type"='vip_pass'
  and provider_event."id"=grant_row."provider_event_id"
  and provider_event."user_id"=grant_row."user_id"
  and provider_event."provider"=grant_row."provider"
  and provider_event."occurred_at" is not null
  and (
    grant_row."starts_at" is distinct from provider_event."occurred_at"
    or grant_row."expires_at" is distinct from
      provider_event."occurred_at"+interval '30 days'
  );

drop trigger if exists "aa_canonicalize_creator_vip_grant_period"
  on public."access_grants";
create trigger "aa_canonicalize_creator_vip_grant_period"
before insert or update of
  "grant_type","provider_event_id","starts_at","expires_at","status",
  "refunded_at","revoked_at"
on public."access_grants"
for each row execute function public."canonicalize_creator_vip_grant_period"();

-- The legacy projector runs first. This final projector preserves the exact
-- canonical period on the creator-facing pass read model and makes a later
-- purchase begin a genuinely new period.
create or replace function public."project_creator_vip_canonical_period"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."grant_type"<>'vip_pass' then return new; end if;
  update public."creator_vip_passes" pass_row
  set "activated_at"=new."starts_at",
      "expires_at"=new."expires_at",
      "status"=case
        when new."status"='refunded' or new."refunded_at" is not null then 'refunded'
        when new."status"='revoked' or new."revoked_at" is not null then 'revoked'
        when new."expires_at"<=timezone('utc'::text,now()) then 'expired'
        else 'active' end,
      "refunded_at"=new."refunded_at",
      "revoked_at"=case
        when new."status"='revoked' then coalesce(new."revoked_at",timezone('utc'::text,now()))
        else new."revoked_at" end
  where pass_row."access_grant_id"=new."id"
     or (
       pass_row."offer_id"=new."source_id"
       and pass_row."fan_id"=new."user_id"
       and pass_row."status"='active'
     );
  return new;
end;
$$;
revoke all on function public."project_creator_vip_canonical_period"()
  from public,anon,authenticated,service_role;

drop trigger if exists "zz_project_creator_vip_canonical_period"
  on public."access_grants";
create trigger "zz_project_creator_vip_canonical_period"
after insert or update of
  "grant_type","provider_event_id","starts_at","expires_at","status",
  "refunded_at","revoked_at"
on public."access_grants"
for each row execute function public."project_creator_vip_canonical_period"();

update public."creator_vip_passes" pass_row
set "activated_at"=grant_row."starts_at",
    "expires_at"=grant_row."expires_at",
    "status"=case
      when grant_row."status"='refunded' or grant_row."refunded_at" is not null then 'refunded'
      when grant_row."status"='revoked' or grant_row."revoked_at" is not null then 'revoked'
      when grant_row."expires_at"<=timezone('utc'::text,now()) then 'expired'
      else 'active' end,
    "refunded_at"=grant_row."refunded_at",
    "revoked_at"=grant_row."revoked_at"
from public."access_grants" grant_row
where grant_row."id"=pass_row."access_grant_id"
  and grant_row."grant_type"='vip_pass';

alter table public."creator_vip_passes"
  drop constraint if exists "creator_vip_passes_finite_30_day_period_check";
alter table public."creator_vip_passes"
  add constraint "creator_vip_passes_finite_30_day_period_check"
  check (
    "access_grant_id" is null
    or (
      "activated_at" is not null
      and "expires_at" is not null
      and "expires_at"="activated_at"+interval '30 days'
    )
  );

create index if not exists "creator_vip_passes_fan_creator_period_idx"
  on public."creator_vip_passes"(
    "fan_id","creator_id","status","expires_at" desc
  );

alter function public."resolve_creator_vip_pass_access"(uuid)
  rename to "resolve_creator_vip_pass_access_pre_30_day_doctrine";
alter function public."resolve_creator_vip_pass_access_pre_30_day_doctrine"(uuid)
  set search_path = '';
revoke all on function public."resolve_creator_vip_pass_access_pre_30_day_doctrine"(uuid)
  from public,anon,authenticated,service_role;

create or replace function public."resolve_creator_vip_pass_access"(
  p_creator_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_offer public."creator_vip_pass_offers"%rowtype;
  v_pass public."creator_vip_passes"%rowtype;
  v_identity jsonb;
begin
  if p_creator_id is null then
    return jsonb_build_object('allowed',false,'reason','creator_id_required','requiresPurchase',false);
  end if;
  if v_user is null then
    select offer.* into v_offer
    from public."creator_vip_pass_offers" offer
    where offer."creator_id"=p_creator_id
      and offer."status" in ('sandbox','active','paused','blocked')
    order by offer."updated_at" desc limit 1;
    return case when v_offer."id" is null
      then jsonb_build_object('allowed',false,'reason','vip_not_available','requiresPurchase',false)
      else jsonb_build_object(
        'allowed',false,'reason','auth_required','requiresPurchase',true,
        'offer',public."creator_vip_pass_offer_safe_row"(v_offer)
      ) end;
  end if;
  if not public."wave1_current_caller_authority_internal"() then
    return jsonb_build_object('allowed',false,'reason','session_authority_not_current','requiresPurchase',false);
  end if;
  if public."is_account_access_restricted"(v_user::text)
    or public."is_account_access_restricted"(p_creator_id::text)
  then
    return jsonb_build_object('allowed',false,'reason','account_restricted','requiresPurchase',false);
  end if;
  if exists (
    select 1 from public."channel_audience_blocks" block_row
    where (block_row."channel_user_id"=p_creator_id::text
        and block_row."blocked_user_id"=v_user::text)
       or (block_row."channel_user_id"=v_user::text
        and block_row."blocked_user_id"=p_creator_id::text)
  ) then
    return jsonb_build_object('allowed',false,'reason','blocked_by_creator','requiresPurchase',false);
  end if;

  select pass_row.* into v_pass
  from public."creator_vip_passes" pass_row
  join public."creator_vip_pass_offers" offer
    on offer."id"=pass_row."offer_id"
   and offer."creator_id"=pass_row."creator_id"
  where pass_row."creator_id"=p_creator_id
    and pass_row."fan_id"=v_user
    and pass_row."status"='active'
    and pass_row."access_grant_id" is not null
    and pass_row."activated_at" is not null
    and pass_row."expires_at"=pass_row."activated_at"+interval '30 days'
    and pass_row."activated_at"<=timezone('utc'::text,now())
    and pass_row."expires_at">timezone('utc'::text,now())
    and pass_row."refunded_at" is null
    and pass_row."revoked_at" is null
    and offer."status"<>'blocked'
  order by pass_row."activated_at" desc,pass_row."id" desc
  limit 1;
  if v_pass."id" is not null then
    select offer.* into v_offer
    from public."creator_vip_pass_offers" offer
    where offer."id"=v_pass."offer_id"
      and offer."creator_id"=v_pass."creator_id";
    begin
      v_identity:=public."creator_money_historical_purchase_identity_internal"(
        v_user,'vip_pass',v_pass."offer_id",v_pass."access_grant_id"
      );
    exception when others then v_identity:=null;
    end;
    if v_identity is not null then
      return jsonb_build_object(
        'allowed',true,'reason','vip_active','requiresPurchase',false,
        'vipPassId',v_pass."id",'activatedAt',v_pass."activated_at",
        'expiresAt',v_pass."expires_at",
        'offer',public."creator_vip_pass_offer_safe_row"(v_offer)
      );
    end if;
  end if;

  select offer.* into v_offer
  from public."creator_vip_pass_offers" offer
  where offer."creator_id"=p_creator_id
    and offer."status" in ('sandbox','active','paused','blocked')
  order by offer."updated_at" desc limit 1;
  if v_offer."id" is null then
    return jsonb_build_object('allowed',false,'reason','vip_not_available','requiresPurchase',false);
  end if;
  if v_user=p_creator_id
    or public."has_platform_role"(array['owner'::text,'operator'::text])
  then
    return jsonb_build_object(
      'allowed',true,'reason','creator_or_admin','requiresPurchase',false,
      'previewAuthority',true,
      'offer',public."creator_vip_pass_offer_safe_row"(v_offer)
    );
  end if;
  if not public."wave1_creator_money_subject_authorized_internal"(p_creator_id) then
    return jsonb_build_object(
      'allowed',false,'reason','creator_authority_not_current','requiresPurchase',false,
      'offer',public."creator_vip_pass_offer_safe_row"(v_offer)
    );
  end if;
  if v_offer."status"='paused' then
    return jsonb_build_object(
      'allowed',false,'reason','offer_paused','requiresPurchase',false,
      'offer',public."creator_vip_pass_offer_safe_row"(v_offer)
    );
  end if;
  if v_offer."status"='blocked' then
    return jsonb_build_object(
      'allowed',false,'reason','offer_blocked','requiresPurchase',false,
      'offer',public."creator_vip_pass_offer_safe_row"(v_offer)
    );
  end if;
  return jsonb_build_object(
    'allowed',false,'reason','vip_required','requiresPurchase',true,
    'priceCents',v_offer."price_cents",'currency',v_offer."currency",
    'creatorId',v_offer."creator_id",'provider',v_offer."provider",
    'providerProductId',v_offer."provider_product_id",
    'providerProductKey',v_offer."provider_product_key",
    'durationDays',30,
    'offer',public."creator_vip_pass_offer_safe_row"(v_offer)
  );
exception when others then
  return jsonb_build_object(
    'allowed',false,'reason','vip_authority_unresolved','requiresPurchase',false
  );
end;
$$;
revoke all on function public."resolve_creator_vip_pass_access"(uuid)
  from public,anon;
grant execute on function public."resolve_creator_vip_pass_access"(uuid)
  to authenticated,service_role;

-- Subscription-derived Paid Video access is a read-time alternate authority.
-- It never writes paid_content_access, provider, transaction, or ledger rows.
create or replace function public."creator_video_subscription_access_internal"(
  p_video_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid:=auth.uid();
  v_owner uuid;
  v_subscription jsonb;
begin
  if v_viewer is null
    or not public."wave1_current_caller_authority_internal"()
    or public."is_account_access_restricted"(v_viewer::text)
  then return jsonb_build_object('allowed',false); end if;

  select video."owner_id" into v_owner
  from public."videos" video
  where video."id"=p_video_id
    and video."visibility"='public'
    and coalesce(video."moderation_status",'clean') in ('clean','reported')
    and video."quarantined_at" is null
    and public."media_scan_public_safe"(video."scan_status")
    and not coalesce(video."vip_access_required",false)
    and exists (
      select 1 from public."creator_content_prices" price
      where price."content_type"='creator_video'
        and price."content_id"=video."id"
        and price."creator_id"=video."owner_id"
        and coalesce(price."is_paid",false)
    );
  if v_owner is null
    or public."is_account_access_restricted"(v_owner::text)
    or public."is_creator_video_viewer_blocked"(v_owner::text,v_viewer::text)
  then return jsonb_build_object('allowed',false); end if;

  begin
    v_subscription:=public."resolve_creator_channel_subscription_access"(v_owner);
  exception when others then v_subscription:=null;
  end;
  if v_subscription is null
    or not coalesce((v_subscription->>'allowed')::boolean,false)
    or v_subscription->>'reason' not in (
      'subscription_active','subscription_cancel_pending'
    )
    or nullif(v_subscription->'offer'->>'creatorId','')::uuid
      is distinct from v_owner
    or not public."creator_video_playable_source_after_authority_internal"(
      p_video_id
    )
  then return jsonb_build_object('allowed',false); end if;

  return jsonb_build_object(
    'allowed',true,'creatorId',v_owner,
    'subscriptionId',v_subscription->>'subscriptionId',
    'currentPeriodEnd',v_subscription->>'currentPeriodEnd'
  );
exception when others then
  return jsonb_build_object('allowed',false);
end;
$$;
revoke all on function public."creator_video_subscription_access_internal"(uuid)
  from public,anon,authenticated,service_role;

alter function public."resolve_creator_content_access"(text,uuid)
  rename to "resolve_creator_content_access_pre_subscription_doctrine";
alter function public."resolve_creator_content_access_pre_subscription_doctrine"(text,uuid)
  set search_path = '';
revoke all on function public."resolve_creator_content_access_pre_subscription_doctrine"(text,uuid)
  from public,anon,authenticated,service_role;

create or replace function public."resolve_creator_content_access"(
  p_content_type text,
  p_content_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_direct jsonb;
  v_subscription jsonb;
begin
  v_direct:=public."resolve_creator_content_access_pre_subscription_doctrine"(
    p_content_type,p_content_id
  );
  if coalesce((v_direct->>'allowed')::boolean,false)
    or p_content_type<>'creator_video'
  then return v_direct; end if;

  v_subscription:=public."creator_video_subscription_access_internal"(
    p_content_id
  );
  if coalesce((v_subscription->>'allowed')::boolean,false) then
    return jsonb_build_object(
      'allowed',true,'reason','active_creator_subscription',
      'requiresPurchase',false,
      'creatorId',v_subscription->>'creatorId',
      'subscriptionId',v_subscription->>'subscriptionId',
      'currentPeriodEnd',v_subscription->>'currentPeriodEnd'
    );
  end if;
  return v_direct;
exception when others then
  return jsonb_build_object(
    'allowed',false,'reason','access_resolution_failed',
    'requiresPurchase',false
  );
end;
$$;
revoke all on function public."resolve_creator_content_access"(text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."resolve_creator_content_access"(text,uuid)
  to anon,authenticated;

comment on function public."resolve_creator_content_access"(text,uuid) is
  'Canonical creator-video authority: exact direct Paid Video grant OR current exact-creator Channel Subscription for ordinary Paid Video; VIP-only content requires exact-creator VIP. Subscription-derived access creates no per-video financial row.';

update public."monetization_products"
set "description"='Reusable one-time provider product. Each verified purchase creates exactly 30 days of VIP access for one exact creator.',
    "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object(
      'duration_days',30,
      'duration_authority','verified_activation_at_plus_30_days',
      'auto_renew',false,
      'channel_subscription_unlock',false,
      'paid_video_ownership_unlock',false
    ),
    "updated_at"=timezone('utc'::text,now())
where "product_type"='vip_pass';
