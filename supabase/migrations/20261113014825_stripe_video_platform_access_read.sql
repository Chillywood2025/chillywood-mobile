-- Read-only candidate readiness, not deployment readiness or payment authority.
-- The checkout edge must still intersect its exact configured route/account/
-- product and default-off flags. No route, tax evidence or switch is seeded.
create function private.stripe_video_native_checkout_candidate(p_platform text,p_route uuid default null,p_account_id text default null,p_product_id text default null) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.stripe_video_native_routes r
 cross join lateral(select * from private.commerce_tax_qualifications t
  where t.feature='paid_video' and t.environment='test' and t.account_id=r.stripe_account_id
   and t.product_id=r.stripe_product_id order by t.verified_at desc,t.id desc limit 1) q
 where r.platform=p_platform and r.environment='test' and r.country='US'
 and (p_route is null or r.id=p_route) and (p_account_id is null or r.stripe_account_id=p_account_id)
 and (p_product_id is null or r.stripe_product_id=p_product_id)
 and private.stripe_video_native_route_current(r.id)
 and q.enabled and q.revoked_at is null and q.verified_at<=clock_timestamp() and q.expires_at>clock_timestamp()
 and q.tax_behavior='inclusive' and q.full_permitted_scope_reviewed and q.permitted_scope='worldwide'
 and nullif(btrim(q.professional_basis_reference),'') is not null
 and nullif(btrim(q.coverage_evidence_reference),'') is not null
 and q.collection_mode in('automatic','verified_no_collection') and q.liability_type is not null and q.tax_code is not null
 and nullif(btrim(q.provider_settings_evidence_reference),'') is not null
 and nullif(btrim(q.provider_product_evidence_reference),'') is not null
 and q.provider_verified_at<=clock_timestamp() and q.provider_expires_at>clock_timestamp()
 and ((q.collection_mode='automatic' and nullif(btrim(q.registration_evidence_reference),'') is not null)
  or (q.collection_mode='verified_no_collection' and nullif(btrim(q.no_collection_basis_reference),'') is not null))
 and (p_platform<>'android' or q.collection_mode='automatic'));
$$;
revoke all on function private.stripe_video_native_checkout_candidate(text,uuid,text,text) from public,anon,authenticated,service_role;

-- No default on this overload: existing one-argument callers retain exactly
-- their web contract and PostgREST resolves distinct named-argument sets.
create function public.resolve_stripe_sandbox_video_access(p_video_id uuid,p_platform text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_platform is null or p_platform not in('web','ios','android') then raise exception 'checkout_platform_invalid'; end if;
 result:=public.resolve_stripe_sandbox_video_access(p_video_id);
 if p_platform<>'web' and coalesce((result->>'checkoutAllowed')::boolean,false)
  and not private.stripe_video_native_checkout_candidate(p_platform) then
  result:=result||jsonb_build_object('checkoutAllowed',false,'reason','native_route_unqualified');
 end if;
 -- Historical canAccess remains independent of route revocation/expiry.
 return result||jsonb_build_object('checkoutPlatform',p_platform);
end $$;
revoke all on function public.resolve_stripe_sandbox_video_access(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_stripe_sandbox_video_access(uuid,text) to authenticated;

create function public.read_stripe_video_native_checkout_eligibility(p_buyer_id uuid,p_session_id uuid,p_video_id uuid,
 p_platform text,p_route uuid,p_account_id text,p_product_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.stripe_paid_video_prices; allowed boolean; candidate boolean;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_platform is null or p_platform not in('ios','android') or p_route is null or p_account_id is null or p_product_id is null
 then raise exception 'native_route_identity_required'; end if;
 if p_buyer_id is null or p_session_id is null
  or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id) then raise exception 'buyer_authority_required'; end if;
 select * into p from private.stripe_paid_video_prices where video_id=p_video_id;
 if p.id is null then return jsonb_build_object('available',false,'canAccess',false,'checkoutAllowed',false,
  'videoId',p_video_id,'checkoutPlatform',p_platform,'reason','stripe_price_not_configured'); end if;
 if not private.stripe_video_source_current(p.video_id,p.creator_id) then
  return jsonb_build_object('available',true,'canAccess',false,'checkoutAllowed',false,'checkoutPlatform',p_platform,'reason','content_unavailable'); end if;
 allowed:=p_buyer_id=p.creator_id or private.stripe_video_access_current(p_buyer_id,p_video_id);
 candidate:=private.stripe_video_native_checkout_candidate(p_platform,p_route,p_account_id,p_product_id);
 return jsonb_build_object('available',true,'canAccess',allowed,'checkoutAllowed',not allowed and p.status='sandbox'
  and private.stripe_video_delivery_ready(p.video_id) and candidate,
  'reason',case when p_buyer_id=p.creator_id then 'owner' when allowed then 'sandbox_grant'
   when p.status='paused' then 'offer_paused' when not candidate then 'native_route_unqualified' else 'purchase_required' end,
  'videoId',p.video_id,'creatorId',p.creator_id,'priceId',p.id,'priceRevision',p.revision,
  'amountMinor',p.amount_minor,'currency',p.currency,'environment','sandbox','provider','stripe','checkoutPlatform',p_platform);
end $$;
revoke all on function public.read_stripe_video_native_checkout_eligibility(uuid,uuid,uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_stripe_video_native_checkout_eligibility(uuid,uuid,uuid,text,uuid,text,text) to service_role;
