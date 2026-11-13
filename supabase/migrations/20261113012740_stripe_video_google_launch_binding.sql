-- Source-only extension of the existing Google reporting queue. No active
-- routes, synthetic provider evidence, credentials or transactions are seeded.
alter table private.google_play_external_launch_bindings alter column capability_id drop not null;
alter table private.google_play_external_launch_bindings add column paid_video_admission_id uuid references private.stripe_video_native_admissions(id);
alter table private.google_play_external_launch_bindings drop constraint google_play_external_launch_bindings_feature_check;
alter table private.google_play_external_launch_bindings add constraint google_play_external_launch_bindings_feature_check
 check(feature in('creator_tip','event_auction','room_seat_auction','paid_video'));
alter table private.google_play_external_launch_bindings add constraint google_external_binding_domain check(
 (feature='paid_video' and capability_id is null and paid_video_admission_id is not null) or
 (feature in('creator_tip','event_auction','room_seat_auction') and capability_id is not null and paid_video_admission_id is null));

-- Both legacy and paid-video intake share the same serialization point. The
-- original admission functions keep their exact policy/identity checks.
create function private.guard_google_native_token_domain() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.token_hash is null then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('google-external-admission:'||new.token_hash,0));
 if tg_table_name='google_play_external_admissions' then
  if exists(select 1 from private.stripe_video_native_admissions where token_hash=new.token_hash)
  then raise exception 'google_external_token_domain_reused';end if;
 elsif tg_table_name='stripe_video_native_admissions' then
  if exists(select 1 from private.google_play_external_admissions where token_hash=new.token_hash)
   or exists(select 1 from private.google_play_external_launch_bindings where token_hash=new.token_hash)
  then raise exception 'google_external_token_domain_reused';end if;
 else raise exception 'google_external_token_domain_invalid';end if;
 return new;
end $$;
revoke all on function private.guard_google_native_token_domain() from public,anon,authenticated,service_role;
create trigger google_external_admission_domain before insert on private.google_play_external_admissions
 for each row execute function private.guard_google_native_token_domain();
create trigger stripe_video_native_admission_domain before insert on private.stripe_video_native_admissions
 for each row execute function private.guard_google_native_token_domain();

create function public.bind_stripe_video_google_checkout(p_order uuid,p_buyer uuid,p_session uuid,p_admission uuid,
 p_external_transaction_token text,p_api_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders;a private.stripe_video_native_admissions;r private.stripe_video_native_routes;
 b private.google_play_external_launch_bindings;h text;tax jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required';end if;
 if p_order is null or p_buyer is null or p_session is null or p_admission is null
 or p_api_version is distinct from 1 or p_external_transaction_token is null or length(p_external_transaction_token) not between 1 and 16384
 then raise exception 'google_video_binding_identity_invalid';end if;
 select * into o from private.stripe_paid_video_orders where id=p_order for update;
 if o.id is null or o.buyer_id<>p_buyer or o.session_id<>p_session or o.status<>'prepared' or o.expires_at<=clock_timestamp()
 or o.checkout_platform<>'android' or o.native_admission_id is distinct from p_admission
 then raise exception 'google_video_order_unavailable';end if;
 select * into a from private.stripe_video_native_admissions where id=p_admission for share;
 select * into r from private.stripe_video_native_routes where id=a.route_id for share;
 perform 1 from private.google_play_external_program_config where id=r.google_program_id for share;
 perform 1 from private.stripe_paid_video_prices where id=o.price_id for share;
 if not private.stripe_video_native_admission_current(o.id) then raise exception 'native_admission_required';end if;
 h:=encode(extensions.digest(p_external_transaction_token,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('google-external-admission:'||h,0));
 if a.token_hash is distinct from h or a.external_transaction_token is distinct from p_external_transaction_token
 or exists(select 1 from private.google_play_external_admissions where token_hash=h)
 then raise exception 'google_external_token_domain_reused';end if;
 if exists(select 1 from private.google_play_external_transactions where feature='paid_video' and quote_id=o.id)
 then raise exception 'google_video_order_already_reported';end if;
 tax:=public.bind_stripe_video_tax_checkout_policy('paid_video',o.id,o.stripe_product_id,o.stripe_account_id,'test','worldwide');
 if tax->>'ready' is distinct from 'true' or tax->>'collectionMode' is distinct from 'automatic' or tax->>'taxBehavior' is distinct from 'inclusive'
 then raise exception 'google_video_automatic_tax_required';end if;
 select * into b from private.google_play_external_launch_bindings where token_hash=h;
 if b.id is not null then
  if b.feature<>'paid_video' or b.quote_id<>o.id or b.buyer_id<>o.buyer_id or b.session_id<>o.session_id
   or b.paid_video_admission_id is distinct from a.id or b.capability_id is not null or b.program_id<>r.google_program_id
   or b.amount_minor<>o.amount_minor or b.currency<>o.currency
  then raise exception 'google_external_token_reused';end if;
 else
  insert into private.google_play_external_launch_bindings(feature,quote_id,buyer_id,session_id,capability_id,paid_video_admission_id,
   program_id,amount_minor,currency,external_transaction_token,token_hash)
  values('paid_video',o.id,o.buyer_id,o.session_id,null,a.id,r.google_program_id,o.amount_minor,o.currency,p_external_transaction_token,h)
  returning * into b;
 end if;
 return jsonb_build_object('bindingId',b.id,'orderId',o.id,'admissionId',a.id,'routeKind','android_external_content_link',
  'financialAuthority',false,'accessGranted',false);
end $$;
revoke all on function public.bind_stripe_video_google_checkout(uuid,uuid,uuid,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.bind_stripe_video_google_checkout(uuid,uuid,uuid,uuid,text,integer) to service_role;

do $repair$
declare body text;old text:='and b.program_id=r.google_program_id and b.token_hash=a.token_hash';
begin
 body:=pg_get_functiondef('public.dispatch_stripe_sandbox_video_order(uuid,uuid,uuid)'::regprocedure);
 if position(old in body)=0 then raise exception 'stripe_video_dispatch_predecessor_changed';end if;
 execute replace(body,old,old||' and b.paid_video_admission_id=a.id and b.capability_id is null');
end $repair$;
