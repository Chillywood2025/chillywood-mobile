-- Historical evidence only. No new obligation, route qualification, provider
-- call, financial switch, receipt or access grant is created by these readers.
alter function private.google_refund_tax_context(uuid)
 rename to google_refund_tax_context_before_paid_video;
revoke all on function private.google_refund_tax_context_before_paid_video(uuid) from public,anon,authenticated,service_role;

create function private.google_refund_tax_context(p_transaction_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t private.google_play_external_transactions; context jsonb;
begin
 select * into t from private.google_play_external_transactions where id=p_transaction_id;
 if t.feature is distinct from 'paid_video' then
  return private.google_refund_tax_context_before_paid_video(p_transaction_id);
 end if;
 select jsonb_build_object('transaction_id',t.id,'feature','paid_video','quote_id',o.id,
  'buyer_id',o.buyer_id,'creator_id',o.creator_id,'checkout_id',o.checkout_session_id,
  'payment_intent_id',o.payment_intent_id,'gross_minor',o.amount_minor,'tax_minor',t.original_tax_minor,
  'currency',o.currency,'recipient_account_id',null,'platform_account_id',o.stripe_account_id,
  'video_id',o.video_id,'price_id',o.price_id,'price_revision',o.price_revision,'tax_policy_id',o.tax_policy_id)
 into context
 from private.google_play_external_launch_bindings b
 join private.stripe_paid_video_orders o on o.id=t.quote_id and o.id=b.quote_id
 join private.stripe_video_native_admissions a on a.id=b.paid_video_admission_id and a.id=o.native_admission_id
 join private.stripe_video_native_routes r on r.id=a.route_id
 join private.google_play_external_program_config g on g.id=b.program_id and g.id=r.google_program_id
 join private.commerce_tax_checkout_bindings tax on tax.feature='paid_video' and tax.identity_id=o.id
  and tax.policy_id=o.tax_policy_id and tax.product_id=o.stripe_product_id
  and tax.account_id=o.stripe_account_id and tax.environment='test'
 where b.id=t.binding_id and b.feature='paid_video' and b.capability_id is null
 and o.environment='sandbox' and o.checkout_platform='android' and o.status in('refunded','held')
 and o.checkout_session_id ~ '^cs_test_[A-Za-z0-9_]+$' and o.payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'
 and o.charge_id ~ '^ch_[A-Za-z0-9_]+$' and o.price_revision>0
 and b.buyer_id=o.buyer_id and b.session_id=o.session_id and b.amount_minor=o.amount_minor and b.currency=o.currency
 and a.order_id=o.id and a.buyer_id=o.buyer_id and a.session_id=o.session_id
 and a.video_id=o.video_id and a.creator_id=o.creator_id and a.price_id=o.price_id
 and a.price_revision=o.price_revision and a.amount_minor=o.amount_minor and a.currency=o.currency
 and a.platform='android' and a.token_hash=b.token_hash and a.external_transaction_token=b.external_transaction_token
 and r.platform='android' and r.environment='test' and r.country='US'
 and r.stripe_account_id=o.stripe_account_id and r.stripe_product_id=o.stripe_product_id
 and g.package_name='com.chillywood.mobile' and g.environment='test'
 and t.original_tax_minor>0 and t.original_pre_tax_minor>=0
 and t.original_tax_minor::bigint+t.original_pre_tax_minor::bigint=o.amount_minor
 and exists(select 1 from private.google_play_external_report_outbox ob where ob.transaction_id=t.id and ob.operation='refund')
 and exists(select 1 from private.stripe_paid_video_observations obs where obs.order_id=o.id and obs.kind='paid'
  and obs.checkout_session_id=o.checkout_session_id and obs.payment_intent_id=o.payment_intent_id and obs.charge_id=o.charge_id
  and obs.amount_minor=o.amount_minor and obs.currency=o.currency and obs.stripe_account_id=o.stripe_account_id)
 and exists(select 1 from private.stripe_paid_video_observations obs where obs.order_id=o.id and obs.kind='refund'
  and obs.checkout_session_id=o.checkout_session_id and obs.payment_intent_id=o.payment_intent_id and obs.charge_id=o.charge_id
  and obs.amount_minor=o.amount_minor and obs.currency=o.currency and obs.stripe_account_id=o.stripe_account_id
  and obs.refund_amount_minor>0);
 -- Qualification expiry/revocation and creator/source changes stop NEW sales,
 -- never erase an already-incurred reporting obligation or refund identity.
 return context;
end $$;
revoke all on function private.google_refund_tax_context(uuid) from public,anon,authenticated,service_role;

alter function private.lock_google_refund_tax_history_context(uuid)
 rename to lock_google_refund_tax_history_context_before_paid_video;
revoke all on function private.lock_google_refund_tax_history_context_before_paid_video(uuid) from public,anon,authenticated,service_role;
create function private.lock_google_refund_tax_history_context(p_transaction_id uuid) returns jsonb
language plpgsql set search_path='' as $$
declare source uuid;
begin
 select quote_id into source from private.google_play_external_transactions where id=p_transaction_id and feature='paid_video';
 if source is not null then
  -- Match paid-video financial processing: source order -> Google advisory ->
  -- reporting transaction, rather than taking these locks in reverse order.
  perform 1 from private.stripe_paid_video_orders where id=source for share;
 end if;
 return private.lock_google_refund_tax_history_context_before_paid_video(p_transaction_id);
end $$;
revoke all on function private.lock_google_refund_tax_history_context(uuid) from public,anon,authenticated,service_role;
