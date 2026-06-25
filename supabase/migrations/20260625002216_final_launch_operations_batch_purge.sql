-- Final launch operations: refund manual/external closeout, controlled batch
-- purge automation, and manual-review queue support.
--
-- This migration does not call provider refund APIs, does not enable live money,
-- does not enable a broad production batch purge by default, and does not delete
-- creator media/storage/provider/legal records automatically.

set check_function_bodies = false;

alter table public."account_purge_runtime_config"
  add column if not exists "proof_batch_enabled" boolean not null default true;

update public."account_purge_runtime_config"
set
  "proof_batch_enabled" = true,
  "batch_enabled" = false,
  "updated_at" = timezone('utc'::text, now()),
  "note" = 'Single-user purge is enabled. Proof-only batch purge is enabled. Production batch purge remains disabled by default.'
where "id" is true;

create table if not exists public."account_purge_batch_runs" (
  "id" uuid primary key default gen_random_uuid(),
  "mode" text not null,
  "status" text not null default 'started',
  "actor_user_id" text,
  "started_at" timestamptz not null default timezone('utc'::text, now()),
  "completed_at" timestamptz,
  "eligible_count" integer not null default 0,
  "processed_count" integer not null default 0,
  "skipped_count" integer not null default 0,
  "failed_count" integer not null default 0,
  "manual_review_count" integer not null default 0,
  "max_batch_size" integer not null default 10,
  "result_summary" jsonb not null default '{}'::jsonb,
  "failure_reason" text,
  "metadata" jsonb not null default '{}'::jsonb,
  constraint "account_purge_batch_runs_mode_check"
    check ("mode" in ('dry_run', 'proof_only', 'production')),
  constraint "account_purge_batch_runs_status_check"
    check ("status" in ('started', 'completed', 'failed', 'disabled')),
  constraint "account_purge_batch_runs_counts_check"
    check (
      "eligible_count" >= 0
      and "processed_count" >= 0
      and "skipped_count" >= 0
      and "failed_count" >= 0
      and "manual_review_count" >= 0
      and "max_batch_size" between 1 and 25
    ),
  constraint "account_purge_batch_runs_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object'),
  constraint "account_purge_batch_runs_summary_object_check"
    check (jsonb_typeof("result_summary") = 'object')
);

create index if not exists "account_purge_batch_runs_started_idx"
  on public."account_purge_batch_runs" ("started_at" desc);
create index if not exists "account_purge_batch_runs_mode_status_idx"
  on public."account_purge_batch_runs" ("mode", "status", "started_at" desc);

alter table public."account_purge_batch_runs" enable row level security;

drop policy if exists "account_purge_batch_runs_select_owner_operator"
  on public."account_purge_batch_runs";
create policy "account_purge_batch_runs_select_owner_operator"
  on public."account_purge_batch_runs"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "account_purge_batch_runs_insert_owner_operator"
  on public."account_purge_batch_runs";
create policy "account_purge_batch_runs_insert_owner_operator"
  on public."account_purge_batch_runs"
  for insert
  to authenticated
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "account_purge_batch_runs_update_owner_operator"
  on public."account_purge_batch_runs";
create policy "account_purge_batch_runs_update_owner_operator"
  on public."account_purge_batch_runs"
  for update
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."account_purge_batch_runs" from anon, authenticated;
grant select, insert, update on table public."account_purge_batch_runs" to authenticated;
grant all on table public."account_purge_batch_runs" to service_role;

create table if not exists public."account_purge_manual_review_items" (
  "id" uuid primary key default gen_random_uuid(),
  "target_user_id" uuid not null,
  "category" text not null,
  "source_type" text not null,
  "source_id" text,
  "reason" text not null,
  "status" text not null default 'pending_review',
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "reviewed_by" text,
  "reviewed_at" timestamptz,
  "resolution" text,
  "audit_log_id" uuid,
  "batch_run_id" uuid references public."account_purge_batch_runs"("id") on delete set null,
  "metadata" jsonb not null default '{}'::jsonb,
  constraint "account_purge_manual_review_items_category_check"
    check ("category" in (
      'creator_media',
      'storage_references',
      'provider_records',
      'legal_support_dmca',
      'payment_access_grants',
      'abuse_security_records',
      'admin_audit_logs'
    )),
  constraint "account_purge_manual_review_items_status_check"
    check ("status" in (
      'pending_review',
      'retained',
      'deidentified',
      'deleted',
      'legal_hold',
      'provider_required',
      'unsupported/manual'
    )),
  constraint "account_purge_manual_review_items_metadata_object_check"
    check (jsonb_typeof("metadata") = 'object')
);

create index if not exists "account_purge_manual_review_items_target_idx"
  on public."account_purge_manual_review_items" ("target_user_id", "created_at" desc);
create index if not exists "account_purge_manual_review_items_status_idx"
  on public."account_purge_manual_review_items" ("status", "created_at" desc);
create index if not exists "account_purge_manual_review_items_category_idx"
  on public."account_purge_manual_review_items" ("category", "status", "created_at" desc);

alter table public."account_purge_manual_review_items" enable row level security;

drop policy if exists "account_purge_manual_review_items_select_owner_operator"
  on public."account_purge_manual_review_items";
create policy "account_purge_manual_review_items_select_owner_operator"
  on public."account_purge_manual_review_items"
  for select
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "account_purge_manual_review_items_insert_owner_operator"
  on public."account_purge_manual_review_items";
create policy "account_purge_manual_review_items_insert_owner_operator"
  on public."account_purge_manual_review_items"
  for insert
  to authenticated
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "account_purge_manual_review_items_update_owner_operator"
  on public."account_purge_manual_review_items";
create policy "account_purge_manual_review_items_update_owner_operator"
  on public."account_purge_manual_review_items"
  for update
  to authenticated
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."account_purge_manual_review_items" from anon, authenticated;
grant select, insert, update on table public."account_purge_manual_review_items" to authenticated;
grant all on table public."account_purge_manual_review_items" to service_role;

create or replace function public."account_purge_is_proof_account"(p_target_user_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_target_uuid uuid;
  v_email text;
  v_username text;
begin
  begin
    v_target_uuid := nullif(btrim(coalesce(p_target_user_id, '')), '')::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  select lower(coalesce(auth_user.email, ''))
    into v_email
    from auth.users auth_user
    where auth_user.id = v_target_uuid;

  select lower(coalesce(profile."username", ''))
    into v_username
    from public."user_profiles" profile
    where profile."user_id" = v_target_uuid::text;

  return coalesce(v_email, '') like '%@chillywood.test'
    and (
      coalesce(v_email, '') like '%purge%'
      or coalesce(v_username, '') like 'purgeproof%'
      or coalesce(v_username, '') like 'purgeprod%'
      or coalesce(v_username, '') like 'purgebatch%'
    );
end;
$$;

create or replace function public."account_purge_deidentification_counts"(p_target_user_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
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

  return jsonb_build_object(
    'createdCount', v_created,
    'categories', coalesce(v_categories, array[]::text[])
  );
end;
$$;

create or replace function public."list_account_purge_manual_review_items"(
  p_target_user_id text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor text := nullif((auth.uid())::text, '');
  v_target text := nullif(btrim(coalesce(p_target_user_id, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_items jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role'
    and (v_actor is null or not public.has_platform_role(array['owner'::text, 'operator'::text]))
  then
    raise exception 'owner_or_operator_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item."id",
    'targetUserIdSuffix', right(item."target_user_id"::text, 8),
    'category', item."category",
    'sourceType', item."source_type",
    'status', item."status",
    'reason', item."reason",
    'createdAt', item."created_at",
    'reviewed', item."reviewed_at" is not null,
    'resolutionPresent', nullif(btrim(coalesce(item."resolution", '')), '') is not null,
    'batchRunIdSuffix', right(coalesce(item."batch_run_id"::text, ''), 8)
  ) order by item."created_at" desc), '[]'::jsonb)
    into v_items
    from (
      select *
      from public."account_purge_manual_review_items" item
      where v_target is null or item."target_user_id"::text = v_target
      order by item."created_at" desc
      limit v_limit
    ) item;

  return jsonb_build_object(
    'targetUserIdSuffix', case when v_target is null then null else right(v_target, 8) end,
    'items', v_items,
    'count', jsonb_array_length(v_items)
  );
end;
$$;

create or replace function public."admin_update_account_purge_manual_review_item_status"(
  p_item_id uuid,
  p_status text,
  p_resolution text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := nullif((auth.uid())::text, '');
  v_actor_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_resolution text := left(nullif(btrim(coalesce(p_resolution, '')), ''), 1000);
  v_item public."account_purge_manual_review_items"%rowtype;
begin
  if auth.role() <> 'service_role'
    and (v_actor is null or not public.has_platform_role(array['owner'::text, 'operator'::text]))
  then
    raise exception 'owner_or_operator_required';
  end if;

  if v_status not in ('pending_review', 'retained', 'deidentified', 'deleted', 'legal_hold', 'provider_required', 'unsupported/manual') then
    raise exception 'unsupported_manual_review_status';
  end if;

  update public."account_purge_manual_review_items"
    set
      "status" = v_status,
      "reviewed_by" = coalesce(v_actor, 'service_role'),
      "reviewed_at" = timezone('utc'::text, now()),
      "resolution" = v_resolution,
      "metadata" = coalesce("metadata", '{}'::jsonb)
        || jsonb_build_object('lastReviewedBy', coalesce(v_actor, 'service_role'), 'lastReviewedAt', timezone('utc'::text, now()))
    where "id" = p_item_id
    returning * into v_item;

  if v_item."id" is null then
    raise exception 'manual_review_item_not_found';
  end if;

  insert into public."platform_admin_audit_logs" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "target_id",
    "target_user_id",
    "reason",
    "severity",
    "after_state",
    "metadata"
  ) values (
    v_actor,
    v_actor_email,
    case
      when public.has_platform_role(array['owner'::text]) then 'owner'
      when public.has_platform_role(array['operator'::text]) then 'operator'
      when auth.role() = 'service_role' then 'service_role'
      else 'unknown'
    end,
    'account_purge_manual_review_status_updated',
    'system',
    'account_purge_manual_review_item',
    v_item."id"::text,
    v_item."target_user_id"::text,
    coalesce(v_resolution, 'Account purge manual-review item status updated.'),
    'info',
    jsonb_build_object(
      'category', v_item."category",
      'status', v_item."status",
      'targetUserIdSuffix', right(v_item."target_user_id"::text, 8)
    ),
    jsonb_build_object(
      'source', 'final_launch_operations',
      'providerRefundExecuted', false,
      'liveMoneyAction', false
    )
  );

  return jsonb_build_object(
    'status', 'updated',
    'itemIdSuffix', right(v_item."id"::text, 8),
    'targetUserIdSuffix', right(v_item."target_user_id"::text, 8),
    'reviewStatus', v_item."status",
    'providerRefundExecuted', false,
    'liveMoneyAction', false
  );
end;
$$;

create or replace function public."admin_run_account_purge_batch"(
  p_dry_run boolean default true,
  p_limit integer default 10,
  p_enable boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor text := nullif((auth.uid())::text, '');
  v_actor_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_config public."account_purge_runtime_config"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 25);
  v_mode text := 'dry_run';
  v_run_id uuid;
  v_eligible_count integer := 0;
  v_proof_eligible_count integer := 0;
  v_already_purged_count integer := 0;
  v_target_suffixes text[] := array[]::text[];
  v_processed integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_manual_review_count integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_failures jsonb := '[]'::jsonb;
  v_counts jsonb;
  v_result jsonb;
  v_manual jsonb;
  v_candidate record;
begin
  if auth.role() <> 'service_role'
    and (v_actor is null or not public.has_platform_role(array['owner'::text, 'operator'::text]))
  then
    raise exception 'owner_or_operator_required';
  end if;

  select *
    into v_config
    from public."account_purge_runtime_config"
    where "id" is true;

  if coalesce(v_config."emergency_stop", true) then
    raise exception 'account_purge_disabled';
  end if;

  v_limit := least(v_limit, coalesce(v_config."max_batch_size", 10));

  with eligible as (
    select deletion."user_id"::text as user_id
    from public."account_deletion_requests" deletion
    join auth.users auth_user on auth_user.id = deletion."user_id"
    where deletion."status" = 'scheduled'
      and coalesce(deletion."restore_deadline", deletion."delete_after") <= v_now
      and coalesce(auth_user.raw_app_meta_data, '{}'::jsonb) ->> 'accountDeidentified' is distinct from 'true'
      and not exists (
        select 1
        from public."platform_role_memberships" membership
        where membership."status" = 'active'
          and (
            membership."user_id" = deletion."user_id"::text
            or lower(coalesce(membership."email", '')) = lower(coalesce(auth_user.email, ''))
          )
          and membership."role" in ('owner', 'operator', 'moderator')
      )
      and not exists (
        select 1
        from public."sandbox_monetization_testers" tester
        where tester."status" = 'active'
          and (tester."expires_at" is null or tester."expires_at" > v_now)
          and (
            tester."user_id" = deletion."user_id"::text
            or lower(coalesce(tester."email", '')) = lower(coalesce(auth_user.email, ''))
          )
      )
  )
  select
    count(*)::integer,
    count(*) filter (where public."account_purge_is_proof_account"(eligible.user_id))::integer,
    coalesce(array_agg(right(eligible.user_id, 8) order by eligible.user_id) filter (where eligible.user_id is not null), array[]::text[])
    into v_eligible_count, v_proof_eligible_count, v_target_suffixes
    from (
      select user_id
      from eligible
      order by user_id
      limit v_limit
    ) eligible;

  select count(*)::integer
    into v_already_purged_count
    from public."account_deletion_requests" deletion
    join auth.users auth_user on auth_user.id = deletion."user_id"
    where deletion."status" = 'completed'
      and coalesce(auth_user.raw_app_meta_data, '{}'::jsonb) ->> 'accountDeidentified' = 'true';

  if coalesce(p_dry_run, true) then
    return jsonb_build_object(
      'status', 'dry_run',
      'mutationPerformed', false,
      'batchEnabled', coalesce(v_config."batch_enabled", false),
      'proofBatchEnabled', coalesce(v_config."proof_batch_enabled", false),
      'explicitEnableProvided', coalesce(p_enable, false),
      'boundedLimit', v_limit,
      'eligibleCountWithinLimit', coalesce(v_eligible_count, 0),
      'proofEligibleCountWithinLimit', coalesce(v_proof_eligible_count, 0),
      'alreadyPurgedCount', coalesce(v_already_purged_count, 0),
      'targetSuffixes', coalesce(v_target_suffixes, array[]::text[]),
      'providerRefundExecuted', false,
      'liveMoneyAction', false
    );
  end if;

  if coalesce(v_config."batch_enabled", false) and coalesce(p_enable, false) then
    v_mode := 'production';
  elsif coalesce(v_config."proof_batch_enabled", false) and coalesce(p_enable, false) then
    v_mode := 'proof_only';
  else
    return jsonb_build_object(
      'status', 'batch_disabled',
      'mutationPerformed', false,
      'batchEnabled', coalesce(v_config."batch_enabled", false),
      'proofBatchEnabled', coalesce(v_config."proof_batch_enabled", false),
      'explicitEnableProvided', coalesce(p_enable, false),
      'boundedLimit', v_limit,
      'eligibleCountWithinLimit', coalesce(v_eligible_count, 0),
      'providerRefundExecuted', false,
      'liveMoneyAction', false
    );
  end if;

  insert into public."account_purge_batch_runs" (
    "mode",
    "actor_user_id",
    "eligible_count",
    "max_batch_size",
    "metadata"
  ) values (
    v_mode,
    v_actor,
    case when v_mode = 'proof_only' then v_proof_eligible_count else v_eligible_count end,
    v_limit,
    jsonb_build_object(
      'source', 'final_launch_operations',
      'proofOnly', v_mode = 'proof_only',
      'providerRefundExecuted', false,
      'liveMoneyAction', false
    )
  )
  returning "id" into v_run_id;

  for v_candidate in
    with eligible as (
      select deletion."user_id"::text as user_id
      from public."account_deletion_requests" deletion
      join auth.users auth_user on auth_user.id = deletion."user_id"
      where deletion."status" = 'scheduled'
        and coalesce(deletion."restore_deadline", deletion."delete_after") <= v_now
        and coalesce(auth_user.raw_app_meta_data, '{}'::jsonb) ->> 'accountDeidentified' is distinct from 'true'
        and (v_mode <> 'proof_only' or public."account_purge_is_proof_account"(deletion."user_id"::text))
        and not exists (
          select 1
          from public."platform_role_memberships" membership
          where membership."status" = 'active'
            and (
              membership."user_id" = deletion."user_id"::text
              or lower(coalesce(membership."email", '')) = lower(coalesce(auth_user.email, ''))
            )
            and membership."role" in ('owner', 'operator', 'moderator')
        )
        and not exists (
          select 1
          from public."sandbox_monetization_testers" tester
          where tester."status" = 'active'
            and (tester."expires_at" is null or tester."expires_at" > v_now)
            and (
              tester."user_id" = deletion."user_id"::text
              or lower(coalesce(tester."email", '')) = lower(coalesce(auth_user.email, ''))
            )
        )
      order by deletion."delete_after" asc nulls last, deletion."requested_at" asc
      limit v_limit
    )
    select user_id
    from eligible
  loop
    begin
      v_manual := null;
      v_counts := public."account_purge_deidentification_counts"(v_candidate.user_id);
      v_result := public."admin_deidentify_deleted_account"(
        v_candidate.user_id,
        'Batch account purge/de-identification after restore window.',
        false
      );

      if v_result ->> 'status' = 'deidentified' then
        v_manual := public."create_account_purge_manual_review_items"(v_candidate.user_id, v_run_id, v_counts);
        v_processed := v_processed + 1;
        v_manual_review_count := v_manual_review_count + coalesce((v_manual ->> 'createdCount')::integer, 0);
      else
        v_skipped := v_skipped + 1;
      end if;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'targetUserIdSuffix', right(v_candidate.user_id, 8),
        'status', v_result ->> 'status',
        'manualReviewCreated', coalesce((v_manual ->> 'createdCount')::integer, 0)
      ));
    exception
      when others then
        v_failed := v_failed + 1;
        v_failures := v_failures || jsonb_build_array(jsonb_build_object(
          'targetUserIdSuffix', right(v_candidate.user_id, 8),
          'error', left(sqlerrm, 160)
        ));
    end;
  end loop;

  update public."account_purge_batch_runs"
    set
      "status" = case when v_failed > 0 then 'failed' else 'completed' end,
      "completed_at" = timezone('utc'::text, now()),
      "processed_count" = v_processed,
      "skipped_count" = v_skipped,
      "failed_count" = v_failed,
      "manual_review_count" = v_manual_review_count,
      "result_summary" = jsonb_build_object(
        'results', v_results,
        'failures', v_failures,
        'providerRefundExecuted', false,
        'liveMoneyAction', false
      )
    where "id" = v_run_id;

  insert into public."platform_admin_audit_logs" (
    "actor_user_id",
    "actor_email",
    "actor_role",
    "action",
    "action_category",
    "target_type",
    "target_id",
    "reason",
    "severity",
    "after_state",
    "metadata"
  ) values (
    v_actor,
    v_actor_email,
    case
      when public.has_platform_role(array['owner'::text]) then 'owner'
      when public.has_platform_role(array['operator'::text]) then 'operator'
      when auth.role() = 'service_role' then 'service_role'
      else 'unknown'
    end,
    'account_purge_batch_run',
    'system',
    'account_purge_batch_run',
    v_run_id::text,
    'Account purge batch run completed with bounded, auditable processing.',
    case when v_failed > 0 then 'warning' else 'info' end,
    jsonb_build_object(
      'mode', v_mode,
      'processedCount', v_processed,
      'skippedCount', v_skipped,
      'failedCount', v_failed,
      'manualReviewCount', v_manual_review_count
    ),
    jsonb_build_object(
      'source', 'final_launch_operations',
      'providerRefundExecuted', false,
      'liveMoneyAction', false,
      'batchAutoPurge', v_mode = 'production',
      'proofOnly', v_mode = 'proof_only'
    )
  );

  return jsonb_build_object(
    'status', case when v_failed > 0 then 'completed_with_failures' else 'completed' end,
    'mutationPerformed', v_processed > 0,
    'mode', v_mode,
    'batchRunIdSuffix', right(v_run_id::text, 8),
    'boundedLimit', v_limit,
    'eligibleCountWithinLimit', case when v_mode = 'proof_only' then v_proof_eligible_count else v_eligible_count end,
    'processedCount', v_processed,
    'skippedCount', v_skipped,
    'failedCount', v_failed,
    'manualReviewCount', v_manual_review_count,
    'results', v_results,
    'failures', v_failures,
    'providerRefundExecuted', false,
    'liveMoneyAction', false
  );
end;
$$;

revoke all on function public."account_purge_is_proof_account"(text) from public;
revoke all on function public."account_purge_deidentification_counts"(text) from public;
revoke all on function public."create_account_purge_manual_review_items"(text, uuid, jsonb) from public;
revoke all on function public."list_account_purge_manual_review_items"(text, integer) from public;
revoke all on function public."admin_update_account_purge_manual_review_item_status"(uuid, text, text) from public;
revoke all on function public."admin_run_account_purge_batch"(boolean, integer, boolean) from public;

grant execute on function public."account_purge_is_proof_account"(text) to service_role;
grant execute on function public."account_purge_deidentification_counts"(text) to service_role;
grant execute on function public."create_account_purge_manual_review_items"(text, uuid, jsonb) to service_role;
grant execute on function public."list_account_purge_manual_review_items"(text, integer) to authenticated, service_role;
grant execute on function public."admin_update_account_purge_manual_review_item_status"(uuid, text, text) to authenticated, service_role;
grant execute on function public."admin_run_account_purge_batch"(boolean, integer, boolean) to authenticated, service_role;

comment on table public."account_purge_batch_runs" is
  'Sanitized audit table for controlled account purge batch runs. Batch production mode is config gated; proof mode is disposable-account scoped.';

comment on table public."account_purge_manual_review_items" is
  'Owner/operator manual-review queue for account purge categories that must not be automatically deleted, including creator media, storage, provider, legal, support, DMCA, payment, security, and audit records.';

comment on function public."admin_run_account_purge_batch"(boolean, integer, boolean) is
  'Owner/operator controlled account purge batch RPC. Dry-run by default. Proof-only mutation processes disposable proof accounts while production batch requires explicit runtime config and call enablement. Performs no provider refund or live-money action.';

comment on function public."admin_update_account_purge_manual_review_item_status"(uuid, text, text) is
  'Owner/operator sanitized status transition for account purge manual-review items. Does not delete provider, legal, storage, payment, support, DMCA, or audit records.';
