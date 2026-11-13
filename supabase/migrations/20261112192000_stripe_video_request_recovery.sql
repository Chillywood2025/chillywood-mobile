-- Current-session, same-buyer recovery of an immutable earlier dispatch.
-- This lookup cannot create a checkout, replace its session or issue access.
create function public.read_stripe_sandbox_video_order_by_request(
 p_request_id uuid,p_video_id uuid,p_buyer_id uuid,p_session_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders;
begin
 if auth.role() is distinct from 'service_role'
 or not public.creator_tip_buyer_session_authority_internal(p_buyer_id,p_session_id)
 then raise exception 'buyer_authority_required'; end if;
 select * into o from private.stripe_paid_video_orders
 where buyer_id=p_buyer_id and request_id=p_request_id and video_id=p_video_id;
 if o.id is null then return null; end if;
 return to_jsonb(o)||jsonb_build_object('canAccess',private.stripe_video_access_current(p_buyer_id,p_video_id));
end $$;
revoke all on function public.read_stripe_sandbox_video_order_by_request(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_stripe_sandbox_video_order_by_request(uuid,uuid,uuid,uuid) to service_role;
