-- Narrow metadata for verified Stripe buyers; raw source-bearing video RLS stays closed.
begin;
create function public.read_stripe_sandbox_video_player_metadata(p_video_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.videos;
begin
 if auth.uid() is null or public.whole_app_exact_current_session_authority_internal() is distinct from true then raise exception 'current_session_required'; end if;
 select * into v from public.videos where id=p_video_id;
 if v.id is null or not exists(select 1 from private.stripe_paid_video_prices where video_id=v.id)
 or private.stripe_video_source_current(v.id,v.owner_id) is distinct from true
 or private.stripe_video_access_current(auth.uid(),v.id) is distinct from true then return null; end if;
 return jsonb_build_object('videoId',v.id,'creatorId',v.owner_id,'title',v.title,
 'description',coalesce(v.description,''),'createdAt',v.created_at,'updatedAt',v.updated_at);
end $$;
revoke all on function public.read_stripe_sandbox_video_player_metadata(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_stripe_sandbox_video_player_metadata(uuid) to authenticated;
create or replace function public.resolve_stripe_sandbox_video_access(p_video_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.stripe_paid_video_prices; allowed boolean:=false;
begin
 select * into p from private.stripe_paid_video_prices where video_id=p_video_id;
 if p.id is null then return jsonb_build_object('available',false,'canAccess',false,'checkoutAllowed',false,'videoId',p_video_id,'reason','stripe_price_not_configured'); end if;
 if auth.uid() is null or not public.wave1_current_caller_authority_internal()
 or not private.stripe_video_source_current(p.video_id,p.creator_id) then
 return jsonb_build_object('available',true,'canAccess',false,'checkoutAllowed',false,'reason','content_unavailable'); end if;
 allowed:=auth.uid()=p.creator_id or private.stripe_video_access_current(auth.uid(),p_video_id);
 return jsonb_build_object('available',true,'canAccess',allowed,'checkoutAllowed',not allowed and p.status='sandbox' and private.stripe_video_delivery_ready(p.video_id),
 'reason',case when auth.uid()=p.creator_id then 'owner' when allowed then 'sandbox_grant' when p.status='paused' then 'offer_paused' else 'purchase_required' end,
 'videoId',p.video_id,'creatorId',p.creator_id,'priceId',p.id,'priceRevision',p.revision,
 'amountMinor',p.amount_minor,'currency',p.currency,'environment','sandbox','provider','stripe');
end $$;
revoke all on function public.resolve_stripe_sandbox_video_access(uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_stripe_sandbox_video_access(uuid) to authenticated;

commit;
