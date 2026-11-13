-- Make initial transport selection atomic with order creation. No configuration
-- or provider action. The existing order remains the only financial identity.
create function public.prepare_stripe_video_native_order(p_buyer_id uuid,p_session_id uuid,p_video_id uuid,p_request_id uuid,
 p_account_id text,p_product_id text,p_route uuid,p_platform text,p_api_version integer,
 p_country text default null,p_external_transaction_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders;admission jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 if p_buyer_id is null or p_session_id is null or p_video_id is null or p_request_id is null or p_route is null
 or p_platform is null or p_platform not in('ios','android') or p_account_id is null or p_product_id is null
 or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
 then raise exception 'native_order_authority_required';end if;
 -- Exact lock used by prepare_stripe_sandbox_video_order, including web callers.
 perform pg_advisory_xact_lock(hashtextextended('stripe-video:'||p_buyer_id::text||':'||p_video_id::text,0));
 select * into o from private.stripe_paid_video_orders where buyer_id=p_buyer_id and request_id=p_request_id for update;
 if o.id is not null and (o.checkout_platform<>p_platform or o.video_id<>p_video_id or o.session_id<>p_session_id
  or o.stripe_account_id<>p_account_id or o.stripe_product_id<>p_product_id or o.status<>'prepared')
 then raise exception 'native_order_transport_or_identity_mismatch';end if;
 perform public.prepare_stripe_sandbox_video_order(p_buyer_id,p_session_id,p_video_id,p_request_id,p_account_id,p_product_id);
 select * into o from private.stripe_paid_video_orders where buyer_id=p_buyer_id and request_id=p_request_id for update;
 admission:=public.admit_stripe_video_native_order(o.id,p_buyer_id,p_session_id,p_route,p_platform,p_api_version,p_country,p_external_transaction_token);
 select * into o from private.stripe_paid_video_orders where id=o.id;
 return jsonb_build_object('order',to_jsonb(o),'admission',admission);
end $$;
revoke all on function public.prepare_stripe_video_native_order(uuid,uuid,uuid,uuid,text,text,uuid,text,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_stripe_video_native_order(uuid,uuid,uuid,uuid,text,text,uuid,text,integer,text,text) to service_role;
-- API callers cannot convert a separately prepared web order into native.
-- The security-definer atomic wrapper remains able to invoke this helper.
revoke all on function public.admit_stripe_video_native_order(uuid,uuid,uuid,uuid,text,integer,text,text) from public,anon,authenticated,service_role;
