create or replace function public."account_purge_deidentification_counts"(p_target_user_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'creatorEligibilityDeclarations', (select count(*) from private.creator_eligibility_declarations where creator_id::text = p_target_user_id),
    'profiles', (select count(*) from public."user_profiles" where "user_id" = p_target_user_id),
    'pushTokens', (select count(*) from public."user_push_tokens" where "user_id"::text = p_target_user_id),
    'notifications', (
      select count(*)
      from public."notifications"
      where "user_id"::text = p_target_user_id or "actor_user_id"::text = p_target_user_id
    ),
    'accountDeletionRequests', (
      select count(*)
      from public."account_deletion_requests"
      where "user_id"::text = p_target_user_id and "status" = 'scheduled'
    ),
    'completedDeletionRequests', (
      select count(*)
      from public."account_deletion_requests"
      where "user_id"::text = p_target_user_id and "status" = 'completed'
    ),
    'chatMessages', (select count(*) from public."chat_messages" where "sender_user_id" = p_target_user_id),
    'communicationRoomsHosted', (select count(*) from public."communication_rooms" where "host_user_id" = p_target_user_id),
    'watchPartyRoomsHosted', (select count(*) from public."watch_party_rooms" where "host_user_id"::text = p_target_user_id),
    'creatorVideos', (select count(*) from public."videos" where "owner_id"::text = p_target_user_id),
    'creatorVideoComments', (select count(*) from public."creator_video_comments" where "user_id" = p_target_user_id),
    'profilePostComments', (select count(*) from public."profile_post_comments" where "user_id" = p_target_user_id),
    'safetyReports', (select count(*) from public."safety_reports" where "reporter_user_id" = p_target_user_id),
    'dmcaCases', (select count(*) from public."dmca_cases" where "reporter_user_id" = p_target_user_id),
    'adminAuditLogs', (select count(*) from public."platform_admin_audit_logs" where "target_user_id" = p_target_user_id or "actor_user_id" = p_target_user_id),
    'premiumEntitlements', (select count(*) from public."user_entitlements" where "user_id" = p_target_user_id),
    'accessGrants', (select count(*) from public."access_grants" where "user_id"::text = p_target_user_id),
    'moneyPurchaseIntents', (select count(*) from public."money_purchase_intents" where "user_id"::text = p_target_user_id)
  );
$$;

create or replace function public."create_account_purge_manual_review_items"(
  p_target_user_id text,
  p_batch_run_id uuid,
  p_counts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_uuid uuid;
  v_created integer := 0;
  v_categories text[] := array[]::text[];
  v_now timestamptz := timezone('utc'::text, now());
begin
  begin
    v_target_uuid := nullif(btrim(coalesce(p_target_user_id, '')), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'invalid_target_user';
  end;

  if coalesce((p_counts ->> 'creatorVideos')::integer, 0) > 0 then
    insert into public."account_purge_manual_review_items" (
      "target_user_id",
      "category",
      "source_type",
      "source_id",
      "reason",
      "status",
      "batch_run_id",
      "metadata"
    ) values (
      v_target_uuid,
      'creator_media',
      'account_purge_batch',
      p_batch_run_id::text,
      'Creator media requires rights, DMCA, safety, and retention review before object deletion.',
      'pending_review',
      p_batch_run_id,
      jsonb_build_object('counts', p_counts, 'createdBy', 'account_purge_batch', 'createdAt', v_now)
    );
    v_created := v_created + 1;
    v_categories := array_append(v_categories, 'creator_media');

    insert into public."account_purge_manual_review_items" (
      "target_user_id",
      "category",
      "source_type",
      "source_id",
      "reason",
      "status",
      "batch_run_id",
      "metadata"
    ) values (
      v_target_uuid,
      'storage_references',
      'account_purge_batch',
      p_batch_run_id::text,
      'Storage/provider object references require manual legal/safety retention review.',
      'pending_review',
      p_batch_run_id,
      jsonb_build_object('counts', p_counts, 'createdBy', 'account_purge_batch', 'createdAt', v_now)
    );
    v_created := v_created + 1;
    v_categories := array_append(v_categories, 'storage_references');
  end if;

  if coalesce((p_counts ->> 'accessGrants')::integer, 0) > 0
    or coalesce((p_counts ->> 'premiumEntitlements')::integer, 0) > 0
    or coalesce((p_counts ->> 'moneyPurchaseIntents')::integer, 0) > 0
  then
    insert into public."account_purge_manual_review_items" (
      "target_user_id",
      "category",
      "source_type",
      "source_id",
      "reason",
      "status",
      "batch_run_id",
      "metadata"
    ) values (
      v_target_uuid,
      'provider_records',
      'account_purge_batch',
      p_batch_run_id::text,
      'Provider, receipt, access-grant, refund, chargeback, and entitlement records remain manual/external.',
      'provider_required',
      p_batch_run_id,
      jsonb_build_object('counts', p_counts, 'createdBy', 'account_purge_batch', 'providerRefundExecuted', false, 'createdAt', v_now)
    );
    v_created := v_created + 1;
    v_categories := array_append(v_categories, 'provider_records');

    insert into public."account_purge_manual_review_items" (
      "target_user_id",
      "category",
      "source_type",
      "source_id",
      "reason",
      "status",
      "batch_run_id",
      "metadata"
    ) values (
      v_target_uuid,
      'payment_access_grants',
      'account_purge_batch',
      p_batch_run_id::text,
      'Local access-grant and payment-adjacent rows are retained for disputes, refunds, chargebacks, and audit.',
      'retained',
      p_batch_run_id,
      jsonb_build_object('counts', p_counts, 'createdBy', 'account_purge_batch', 'liveMoneyAction', false, 'createdAt', v_now)
    );
    v_created := v_created + 1;
    v_categories := array_append(v_categories, 'payment_access_grants');
  end if;

  if coalesce((p_counts ->> 'safetyReports')::integer, 0) > 0
    or coalesce((p_counts ->> 'dmcaCases')::integer, 0) > 0
  then
    insert into public."account_purge_manual_review_items" (
      "target_user_id",
      "category",
      "source_type",
      "source_id",
      "reason",
      "status",
      "batch_run_id",
      "metadata"
    ) values (
      v_target_uuid,
      'legal_support_dmca',
      'account_purge_batch',
      p_batch_run_id::text,
      'Support, safety, report, and DMCA records are retained privately for legal and safety handling.',
      'legal_hold',
      p_batch_run_id,
      jsonb_build_object('counts', p_counts, 'createdBy', 'account_purge_batch', 'createdAt', v_now)
    );
    v_created := v_created + 1;
    v_categories := array_append(v_categories, 'legal_support_dmca');
  end if;

  if coalesce((p_counts ->> 'adminAuditLogs')::integer, 0) > 0 then
    insert into public."account_purge_manual_review_items" (
      "target_user_id",
      "category",
      "source_type",
      "source_id",
      "reason",
      "status",
      "batch_run_id",
      "metadata"
    ) values (
      v_target_uuid,
      'admin_audit_logs',
      'account_purge_batch',
      p_batch_run_id::text,
      'Admin audit records are retained append-only and surfaced only through authorized review.',
      'retained',
      p_batch_run_id,
      jsonb_build_object('counts', p_counts, 'createdBy', 'account_purge_batch', 'createdAt', v_now)
    );
    v_created := v_created + 1;
    v_categories := array_append(v_categories, 'admin_audit_logs');
  end if;

  if coalesce((p_counts ->> 'creatorEligibilityDeclarations')::bigint, 0) > 0 then
    insert into public.account_purge_manual_review_items(target_user_id,category,source_type,source_id,reason,status,batch_run_id,metadata)
    values(v_target_uuid,'abuse_security_records','creator_eligibility_declarations',p_batch_run_id::text,
      'Creator declarations remain private for abuse and security review. Only a retained count is exposed.',
      'retained',p_batch_run_id,jsonb_build_object('retainedCount',(p_counts->>'creatorEligibilityDeclarations')::bigint));
    v_created:=v_created+1;
    v_categories:=array_append(v_categories,'abuse_security_records');
  end if;

  return jsonb_build_object(
    'createdCount', v_created,
    'categories', coalesce(v_categories, array[]::text[])
  );
end;
$$;
revoke all on function public.account_purge_deidentification_counts(text),public.create_account_purge_manual_review_items(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.account_purge_deidentification_counts(text),public.create_account_purge_manual_review_items(text,uuid,jsonb) to service_role;
