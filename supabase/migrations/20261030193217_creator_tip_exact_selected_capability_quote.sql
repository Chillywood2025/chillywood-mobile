-- Forward compatible overload: keep the existing two-argument manual quote.
-- Exact selected routes never silently fall back to a newer capability.
create function public.get_creator_tip_amount_quote(p_creator_id uuid,p_amount_cents integer,p_capability_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare capability jsonb; buyer uuid:=auth.uid(); session_id uuid; settings public.creator_tip_settings;
begin
  if buyer is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
  then return jsonb_build_object('available',false,'reason','buyer_authority_required'); end if;
  if p_capability_id is null then
    return jsonb_build_object('available',false,'reason','approved_route_unavailable');
  end if;
  session_id:=(auth.jwt()->>'session_id')::uuid;
  select * into settings from public.creator_tip_settings where creator_id=p_creator_id;
  if settings.tips_enabled is distinct from true or settings.status is distinct from 'active'
    or settings.provider_charges_enabled is distinct from true or settings.provider_payouts_enabled is distinct from true
    or not exists(select 1 from public.platform_money_kill_switches where key='tips_enabled' and state in ('on','sandbox_only'))
    or not exists(select 1 from public.platform_money_kill_switches where key='provider_webhooks_enabled' and state in ('on','sandbox_only'))
    or exists(select 1 from public.platform_money_kill_switches where key='live_money_enabled' and state='on')
    or not public.wave1_creator_money_subject_authorized_internal(p_creator_id)
    or exists(select 1 from public.channel_audience_blocks where
      (channel_user_id=p_creator_id::text and blocked_user_id=buyer::text)
      or (channel_user_id=buyer::text and blocked_user_id=p_creator_id::text))
  then return jsonb_build_object('available',false,'reason','creator_unavailable'); end if;
  begin
    capability:=private.resolve_creator_external_payment_capability(buyer,session_id,'creator_tip',p_creator_id,p_amount_cents,'usd','test',p_capability_id);
  exception when raise_exception then
    return jsonb_build_object('available',false,'reason','approved_route_unavailable');
  end;
  if (capability->>'expiresAt')::timestamptz<=clock_timestamp()+interval '31 minutes'
  then return jsonb_build_object('available',false,'reason','approved_route_expiring'); end if;
  return (capability-'providerAccountId'-'eligibilityId') || jsonb_build_object('available',true,'buyerId',buyer,
    'sessionId',session_id,'amountCents',p_amount_cents,'noAccessGranted',true,'liveMoneyAction',false);
end;
$$;
revoke all on function public.get_creator_tip_amount_quote(uuid,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_creator_tip_amount_quote(uuid,integer,uuid) to authenticated;
