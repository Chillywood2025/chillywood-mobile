-- Dormant first-live Party admission source. No provider writes or activation.
alter table public.paid_watch_party_offers drop constraint paid_watch_party_offers_provider_check;
alter table public.paid_watch_party_offers add constraint paid_watch_party_offers_provider_check
 check(provider in('revenuecat_google_play','google_play','revenuecat','stripe_room_auction'));
create function private.promote_live_party_auction_source(p_party_id text,p_room_session_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare offer public.paid_watch_party_offers; product public.monetization_products;
begin
 perform public.wave1_assert_current_creator_money_authority_internal();
 -- Caller already follows offer -> room -> auction inventory order; taking the
 -- same locks here also makes this private helper safe for future internal use.
 perform private.lock_creator_room_inventory(p_party_id);
 if private.auction_creator_mode('room_seat_auction',auth.uid())<>'live'
  or not exists(select 1 from private.creator_room_sessions s join public.watch_party_rooms r on r.party_id=s.party_id
   where s.id=p_room_session_id and s.party_id=p_party_id and r.host_user_id=auth.uid()
    and r.room_type='title' and private.creator_room_session_current(s.id))
 then raise exception 'party_auction_source_authority_required'; end if;
 select * into offer from public.paid_watch_party_offers where party_id=p_party_id and creator_id=auth.uid() for update;
 if offer.id is null or offer.status not in('sandbox','active') or offer.seat_limit is null
 then raise exception 'party_auction_source_offer_required'; end if;
 if (select count(distinct row(v.product_id,v.platform_account_id)) from private.auction_platform_qualifications v
  join private.creator_external_payment_capabilities c on c.id=v.capability_id
  where c.creator_id=auth.uid() and c.feature='room_seat_auction' and c.environment='live'
   and c.enabled and c.revoked_at is null and c.verified_at<=clock_timestamp() and c.expires_at>clock_timestamp()
   and v.environment='live' and v.enabled and v.revoked_at is null and v.verified_at<=clock_timestamp() and v.expires_at>clock_timestamp()
   and v.id=(select latest.id from private.auction_platform_qualifications latest where latest.capability_id=c.id and latest.environment='live'
    order by latest.verified_at desc,latest.id desc limit 1))<>1 then raise exception 'auction_qualified_product_required'; end if;
 select p.* into product from private.auction_platform_qualifications v
  join private.creator_external_payment_capabilities c on c.id=v.capability_id
  join private.creator_room_auction_product_bindings b on b.capability_id=c.id and b.product_id=v.product_id
  join public.monetization_products p on p.id=v.product_id
  where c.creator_id=auth.uid() and c.feature='room_seat_auction' and c.environment='live'
   and c.enabled and c.revoked_at is null and c.verified_at<=clock_timestamp() and c.expires_at>clock_timestamp()
   and v.environment='live' and v.enabled and v.revoked_at is null and v.verified_at<=clock_timestamp() and v.expires_at>clock_timestamp()
   and v.id=(select latest.id from private.auction_platform_qualifications latest where latest.capability_id=c.id and latest.environment='live'
    order by latest.verified_at desc,latest.id desc limit 1)
   and p.provider='stripe_room_auction' and p.environment='production' and p.status='active' and p.product_type='room_seat_pass'
   and not p.is_physical_good and not p.is_android_digital and p.provider_product_id=v.platform_product_id limit 1;
 if product.id is null then raise exception 'auction_qualified_product_required'; end if;
 if offer.status='active' then
  if row(offer.provider,offer.provider_product_key,offer.provider_product_id)
   is distinct from row(product.provider,product.product_key,product.provider_product_id)
  then raise exception 'party_auction_source_provider_mismatch'; end if;
  return;
 end if;
 -- Price/title/capacity are not rewritten, and generic catalog-price binding is
 -- not invoked: this is auction admission, never a fixed-price store checkout.
 update public.paid_watch_party_offers set status='active',provider=product.provider,
  provider_product_key=product.product_key,provider_product_id=product.provider_product_id,
  metadata=metadata||jsonb_build_object('live_money_enabled_at_activation',true,'sandbox_only',false,'auction_only',true)
 where id=offer.id;
end; $$;
revoke all on function private.promote_live_party_auction_source(text,uuid) from public,anon,authenticated,service_role;
do $patch$ declare definition text; needle text; begin
 definition:=pg_get_functiondef('public.create_creator_room_seat_auction(text,text,integer,integer,timestamptz,timestamptz,text,uuid,uuid)'::regprocedure);
 needle:='if rs.id is distinct from p_expected_room_session_id then raise exception ''room_session_changed''; end if;';
 if position(needle in definition)=0 then raise exception 'party_auction_session_source_changed'; end if;
 execute replace(definition,needle,needle||$new$
 if p_environment='live' and p_source_kind='party_admission' then
  perform private.promote_live_party_auction_source(p_party_id,rs.id);
 end if;
$new$);
end; $patch$;
