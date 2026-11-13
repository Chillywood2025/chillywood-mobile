-- An honest mechanics rehearsal, NOT legal tax qualification or exemption.
-- No rows, configuration, credentials or enablement are seeded.
create table private.stripe_video_web_test_policies (
 id uuid primary key default gen_random_uuid(),
 account_id text not null check(account_id ~ '^acct_[A-Za-z0-9]+$'),
 product_id text not null check(product_id ~ '^prod_[A-Za-z0-9]+$'),
 buyer_id uuid not null, creator_id uuid not null, video_id uuid not null,
 environment text not null default 'test' check(environment='test'),
 platform text not null default 'web' check(platform='web'),
 evidence_kind text not null default 'synthetic_test_no_collection' check(evidence_kind='synthetic_test_no_collection'),
 disclosure text not null check(disclosure='Synthetic test only; no tax compliance or exemption qualification'),
 max_amount_minor integer not null check(max_amount_minor between 1 and 100000),
 max_orders integer not null check(max_orders between 1 and 20),
 enabled boolean not null default false, revoked_at timestamptz,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 check(isfinite(created_at) and isfinite(expires_at) and expires_at>created_at and expires_at<=created_at+interval '24 hours'),
 check(buyer_id<>creator_id)
);
create table private.stripe_video_web_test_bindings (
 order_id uuid primary key references private.stripe_paid_video_orders(id),
 policy_id uuid not null references private.stripe_video_web_test_policies(id),
 bound_at timestamptz not null default clock_timestamp()
);
create index stripe_video_web_test_bindings_policy on private.stripe_video_web_test_bindings(policy_id);
alter table private.stripe_video_web_test_policies enable row level security;
alter table private.stripe_video_web_test_policies force row level security;
alter table private.stripe_video_web_test_bindings enable row level security;
alter table private.stripe_video_web_test_bindings force row level security;
revoke all on private.stripe_video_web_test_policies,private.stripe_video_web_test_bindings from public,anon,authenticated,service_role;
create trigger stripe_video_web_test_binding_immutable before update or delete on private.stripe_video_web_test_bindings
 for each row execute function private.guard_event_ticket_terms_immutable();
-- Policy identity and budget cannot be enlarged after a run starts. Revocation
-- is the only update; a different rehearsal requires a new explicit record.
create function private.guard_stripe_video_web_test_policy() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at')
  or old.revoked_at is not null or new.revoked_at is null then raise exception 'test_policy_immutable'; end if;
 return new;
end $$;
revoke all on function private.guard_stripe_video_web_test_policy() from public,anon,authenticated,service_role;
create trigger stripe_video_web_test_policy_immutable before update or delete on private.stripe_video_web_test_policies
 for each row execute function private.guard_stripe_video_web_test_policy();
alter table private.stripe_paid_video_orders add column tax_evidence_kind text not null default 'qualified'
 check(tax_evidence_kind in('qualified','synthetic_test_no_collection'));

alter function public.bind_stripe_video_tax_checkout_policy(text,uuid,text,text,text,text)
 rename to bind_stripe_video_tax_checkout_policy_before_test_fixture;
revoke all on function public.bind_stripe_video_tax_checkout_policy_before_test_fixture(text,uuid,text,text,text,text) from public,anon,authenticated,service_role;
create function public.bind_stripe_video_tax_checkout_policy(p_feature text,p_identity_id uuid,p_product_id text,
 p_account_id text,p_environment text,p_permitted_scope text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders; p private.stripe_video_web_test_policies; bound uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into o from private.stripe_paid_video_orders where id=p_identity_id for update;
 -- Native and every ordinary qualification keep their original contract.
 if o.id is null or o.checkout_platform is distinct from 'web' or o.environment is distinct from 'sandbox'
  or p_feature is distinct from 'paid_video' or p_environment is distinct from 'test'
  or p_permitted_scope is distinct from 'worldwide' or p_account_id is distinct from o.stripe_account_id
  or p_product_id is distinct from o.stripe_product_id then
  return public.bind_stripe_video_tax_checkout_policy_before_test_fixture(p_feature,p_identity_id,p_product_id,p_account_id,p_environment,p_permitted_scope);
 end if;
 select policy_id into bound from private.stripe_video_web_test_bindings where order_id=o.id;
 select * into p from private.stripe_video_web_test_policies
 where account_id=o.stripe_account_id and product_id=o.stripe_product_id
  and buyer_id=o.buyer_id and creator_id=o.creator_id and video_id=o.video_id
  and (bound is null or id=bound) order by created_at desc,id desc limit 1 for update;
 if p.id is null then
  return public.bind_stripe_video_tax_checkout_policy_before_test_fixture(p_feature,p_identity_id,p_product_id,p_account_id,p_environment,p_permitted_scope);
 end if;
 -- Never fall back when an explicit fixture exists but is revoked/exhausted.
 if not p.enabled or p.revoked_at is not null or p.created_at>clock_timestamp() or p.expires_at<=clock_timestamp()
  or o.amount_minor>p.max_amount_minor or o.currency<>'usd' or o.status<>'prepared' or o.expires_at<=clock_timestamp()
  or not public.creator_tip_buyer_session_authority_internal(o.buyer_id,o.session_id)
  or exists(select 1 from private.commerce_tax_checkout_bindings where feature='paid_video' and identity_id=o.id)
 then return jsonb_build_object('ready',false,'reason','synthetic_test_policy_unavailable'); end if;
 if bound is null then
  if (select count(*) from private.stripe_video_web_test_bindings where policy_id=p.id)>=p.max_orders
  then return jsonb_build_object('ready',false,'reason','synthetic_test_budget_exhausted'); end if;
  insert into private.stripe_video_web_test_bindings(order_id,policy_id) values(o.id,p.id);
 end if;
 update private.stripe_paid_video_orders set tax_evidence_kind='synthetic_test_no_collection' where id=o.id;
 return jsonb_build_object('ready',true,'policyId',p.id,'taxBehavior','inclusive',
  'collectionMode','synthetic_test_no_collection','evidenceKind','synthetic_test_no_collection',
  'environment','test','platform','web','orderId',o.id,'accountId',o.stripe_account_id,'productId',o.stripe_product_id,
  'disclosure',p.disclosure);
end $$;
revoke all on function public.bind_stripe_video_tax_checkout_policy(text,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.bind_stripe_video_tax_checkout_policy(text,uuid,text,text,text,text) to service_role;

alter function public.get_stripe_video_cost_context(uuid) rename to get_stripe_video_cost_context_before_test_fixture;
revoke all on function public.get_stripe_video_cost_context_before_test_fixture(uuid) from public,anon,authenticated,service_role;
create function public.get_stripe_video_cost_context(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.stripe_paid_video_orders; reports jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 select * into strict o from private.stripe_paid_video_orders where id=p_order_id;
 if o.tax_evidence_kind<>'synthetic_test_no_collection' then
  return public.get_stripe_video_cost_context_before_test_fixture(p_order_id);
 end if;
 -- Historical refunds/reconciliation remain possible after expiry/revocation.
 -- This reads the immutable original binding, never grants new purchases.
 if o.environment<>'sandbox' or o.checkout_platform<>'web' or o.status not in('paid','refunded','held') or o.charge_id is null
  or not exists(select 1 from private.stripe_video_web_test_bindings b join private.stripe_video_web_test_policies p on p.id=b.policy_id
   where b.order_id=o.id and p.id=o.tax_policy_id and p.account_id=o.stripe_account_id and p.product_id=o.stripe_product_id
    and p.buyer_id=o.buyer_id and p.creator_id=o.creator_id and p.video_id=o.video_id and o.amount_minor<=p.max_amount_minor)
 then raise exception 'video_cost_test_binding_required'; end if;
 select e.reports into reports from private.stripe_video_cost_evidence e where e.order_id=o.id order by e.created_at desc,e.id desc limit 1;
 return to_jsonb(o)||jsonb_build_object('previousReports',coalesce(reports,'[]'::jsonb),'taxCollectionMode','synthetic_test_no_collection');
end $$;
revoke all on function public.get_stripe_video_cost_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_stripe_video_cost_context(uuid) to service_role;
