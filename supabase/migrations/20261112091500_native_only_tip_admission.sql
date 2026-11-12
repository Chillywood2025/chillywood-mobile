-- Source-only until separately deployed. Drain in-flight external dispatches
-- before deployment; no SQL change can recall a provider request already sent.
begin;
lock table private.creator_tip_checkout_attempts, private.creator_tip_route_selections in share row exclusive mode;

create function private.reject_new_stripe_tip_admission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name = 'creator_tip_checkout_attempts' then
  if exists(select 1 from public.creator_tip_transactions t where t.id=new.tip_id and t.provider='stripe_connect') then
   raise exception 'native_tip_checkout_required';
  end if;
 elsif new.provider = 'stripe_connect' then
  raise exception 'native_tip_checkout_required';
 end if;
 return new;
end;
$$;
revoke all on function private.reject_new_stripe_tip_admission() from public,anon,authenticated,service_role;
create trigger reject_new_stripe_tip_checkout before insert on private.creator_tip_checkout_attempts
for each row execute function private.reject_new_stripe_tip_admission();
create trigger reject_new_stripe_tip_route before insert on private.creator_tip_route_selections
for each row execute function private.reject_new_stripe_tip_admission();

alter function public.read_creator_tip_checkout_dispatch_authority(uuid,uuid,uuid)
rename to read_creator_tip_checkout_dispatch_authority_pre_native_only;
revoke all on function public.read_creator_tip_checkout_dispatch_authority_pre_native_only(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.read_creator_tip_checkout_dispatch_authority(p_buyer_id uuid,p_session_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.read_creator_tip_checkout_dispatch_authority_pre_native_only(p_buyer_id,p_session_id,p_request_id);
 if exists(select 1 from private.creator_tip_checkout_attempts a join public.creator_tip_transactions t on t.id=a.tip_id
  where a.buyer_id=p_buyer_id and a.request_id=p_request_id and t.provider='stripe_connect') then
  return jsonb_build_object('allowed',false,'reason','native_tip_checkout_required');
 end if;
 return result;
end;
$$;
revoke all on function public.read_creator_tip_checkout_dispatch_authority(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_tip_checkout_dispatch_authority(uuid,uuid,uuid) to service_role;
-- Known-session GET/record and verified webhook/refund functions are unchanged.
-- Unknown-session attempts retain their exact record but cannot obtain POST
-- authority. Native intent admission and its existing session gates are untouched.
commit;
