create table if not exists public."sponsor_brand_records" (
  "id" uuid primary key default gen_random_uuid(),
  "display_name" text not null,
  "contact_email" text,
  "website_url" text,
  "status" text default 'foundation'::text not null,
  "external_customer_reference" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "sponsor_brand_records_status_check"
    check ("status" in ('foundation', 'draft', 'pending_review', 'approved_later', 'rejected', 'paused', 'cancelled'))
);

alter table public."sponsor_deal_records"
  add column if not exists "brand_id" uuid references public."sponsor_brand_records"("id") on delete set null;

alter table public."sponsor_deal_records"
  add column if not exists "channel_user_id" text;

alter table public."sponsor_deal_records"
  add column if not exists "gross_amount_cents" integer default 0 not null;

alter table public."sponsor_deal_records"
  add column if not exists "platform_share_bps" integer default 2000 not null;

alter table public."sponsor_deal_records"
  add column if not exists "creator_share_bps" integer default 8000 not null;

alter table public."sponsor_deal_records"
  drop constraint if exists "sponsor_deal_records_type_check";

alter table public."sponsor_deal_records"
  add constraint "sponsor_deal_records_type_check"
  check (
    "deal_type" in (
      'creator_sold',
      'platform_served',
      'unknown',
      'creator_sold_sponsor_slot',
      'platform_served_creator_page_ad',
      'originals_sponsor',
      'network_sponsor',
      'manual_foundation'
    )
  );

alter table public."sponsor_deal_records"
  drop constraint if exists "sponsor_deal_records_status_check";

alter table public."sponsor_deal_records"
  add constraint "sponsor_deal_records_status_check"
  check (
    "status" in (
      'foundation',
      'draft',
      'submitted',
      'submitted_later',
      'under_review',
      'under_review_later',
      'approved',
      'approved_later',
      'rejected',
      'scheduled_later',
      'active',
      'active_later',
      'completed',
      'completed_later',
      'canceled',
      'cancelled'
    )
  );

alter table public."sponsor_deal_records"
  drop constraint if exists "sponsor_deal_records_currency_check";

alter table public."sponsor_deal_records"
  add constraint "sponsor_deal_records_currency_check" check ("currency" ~ '^[A-Za-z]{3}$');

alter table public."sponsor_deal_records"
  drop constraint if exists "sponsor_deal_records_gross_amount_cents_check";

alter table public."sponsor_deal_records"
  add constraint "sponsor_deal_records_gross_amount_cents_check" check ("gross_amount_cents" >= 0);

alter table public."sponsor_deal_records"
  drop constraint if exists "sponsor_deal_records_platform_share_bps_check";

alter table public."sponsor_deal_records"
  add constraint "sponsor_deal_records_platform_share_bps_check" check ("platform_share_bps" between 0 and 10000);

alter table public."sponsor_deal_records"
  drop constraint if exists "sponsor_deal_records_creator_share_bps_check";

alter table public."sponsor_deal_records"
  add constraint "sponsor_deal_records_creator_share_bps_check" check ("creator_share_bps" between 0 and 10000);

create table if not exists public."sponsor_creative_records" (
  "id" uuid primary key default gen_random_uuid(),
  "sponsor_deal_id" bigint not null references public."sponsor_deal_records"("id") on delete cascade,
  "creative_type" text not null,
  "status" text default 'foundation'::text not null,
  "title" text,
  "asset_url" text,
  "destination_url" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "sponsor_creative_records_type_check"
    check ("creative_type" in ('image', 'video', 'link', 'copy', 'placement_note', 'manual_foundation')),
  constraint "sponsor_creative_records_status_check"
    check ("status" in ('foundation', 'draft', 'submitted_later', 'under_review_later', 'approved_later', 'rejected'))
);

create table if not exists public."sponsor_placement_records" (
  "id" uuid primary key default gen_random_uuid(),
  "sponsor_deal_id" bigint not null references public."sponsor_deal_records"("id") on delete cascade,
  "placement_type" text not null,
  "target_type" text,
  "target_id" text,
  "scheduled_start_at" timestamp with time zone,
  "scheduled_end_at" timestamp with time zone,
  "status" text default 'foundation'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "sponsor_placement_records_type_check"
    check ("placement_type" in ('creator_channel_page', 'public_channel_video', 'chi_llywood_originals', 'network_content', 'native_feed_later', 'ctv_later', 'manual_foundation')),
  constraint "sponsor_placement_records_status_check"
    check ("status" in ('foundation', 'draft', 'scheduled_later', 'active_later', 'completed_later', 'cancelled'))
);

create table if not exists public."sponsor_disclosure_records" (
  "id" uuid primary key default gen_random_uuid(),
  "sponsor_deal_id" bigint not null references public."sponsor_deal_records"("id") on delete cascade,
  "disclosure_text" text not null,
  "status" text default 'foundation'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "sponsor_disclosure_records_status_check"
    check ("status" in ('foundation', 'draft', 'required_later', 'approved_later', 'missing_later', 'rejected'))
);

create table if not exists public."sponsor_review_logs" (
  "id" uuid primary key default gen_random_uuid(),
  "sponsor_deal_id" bigint not null references public."sponsor_deal_records"("id") on delete cascade,
  "actor_user_id" text,
  "review_action" text not null,
  "reason" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "sponsor_review_logs_action_check"
    check ("review_action" in ('foundation_proof_created', 'review_note', 'safety_review_required', 'disclosure_review_required', 'unsafe_product_flagged_later', 'scam_review_required_later'))
);

create table if not exists public."sponsor_payment_records" (
  "id" uuid primary key default gen_random_uuid(),
  "sponsor_deal_id" bigint not null references public."sponsor_deal_records"("id") on delete cascade,
  "provider" text,
  "provider_reference" text,
  "status" text default 'foundation'::text not null,
  "currency" text default 'USD'::text not null,
  "gross_amount_cents" integer default 0 not null,
  "net_amount_cents" integer,
  "platform_fee_cents" integer,
  "creator_share_cents" integer,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "sponsor_payment_records_status_check"
    check ("status" in ('foundation', 'draft', 'checkout_not_connected', 'payment_not_connected', 'held_later', 'cancelled')),
  constraint "sponsor_payment_records_currency_check" check ("currency" ~ '^[A-Z]{3}$'),
  constraint "sponsor_payment_records_amount_check" check (
    "gross_amount_cents" >= 0
    and ("net_amount_cents" is null or "net_amount_cents" >= 0)
    and ("platform_fee_cents" is null or "platform_fee_cents" >= 0)
    and ("creator_share_cents" is null or "creator_share_cents" >= 0)
  )
);

create table if not exists public."sponsor_payout_split_records" (
  "id" uuid primary key default gen_random_uuid(),
  "sponsor_deal_id" bigint not null references public."sponsor_deal_records"("id") on delete cascade,
  "payment_record_id" uuid references public."sponsor_payment_records"("id") on delete set null,
  "creator_user_id" text,
  "platform_share_bps" integer default 2000 not null,
  "creator_share_bps" integer default 8000 not null,
  "gross_amount_cents" integer default 0 not null,
  "platform_share_cents" integer default 0 not null,
  "creator_share_cents" integer default 0 not null,
  "status" text default 'foundation'::text not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "sponsor_payout_split_records_status_check"
    check ("status" in ('foundation', 'draft', 'calculation_not_active', 'held_later', 'cancelled')),
  constraint "sponsor_payout_split_records_bps_check"
    check ("platform_share_bps" between 0 and 10000 and "creator_share_bps" between 0 and 10000),
  constraint "sponsor_payout_split_records_amount_check"
    check ("gross_amount_cents" >= 0 and "platform_share_cents" >= 0 and "creator_share_cents" >= 0)
);

create index if not exists "sponsor_brand_records_status_idx"
  on public."sponsor_brand_records" using btree ("status");

create index if not exists "sponsor_deal_records_status_idx"
  on public."sponsor_deal_records" using btree ("status");

create index if not exists "sponsor_deal_records_brand_idx"
  on public."sponsor_deal_records" using btree ("brand_id");

create index if not exists "sponsor_deal_records_channel_user_idx"
  on public."sponsor_deal_records" using btree ("channel_user_id");

create index if not exists "sponsor_creative_records_deal_idx"
  on public."sponsor_creative_records" using btree ("sponsor_deal_id");

create index if not exists "sponsor_placement_records_deal_idx"
  on public."sponsor_placement_records" using btree ("sponsor_deal_id");

create index if not exists "sponsor_disclosure_records_deal_idx"
  on public."sponsor_disclosure_records" using btree ("sponsor_deal_id");

create index if not exists "sponsor_review_logs_deal_created_idx"
  on public."sponsor_review_logs" using btree ("sponsor_deal_id", "created_at" desc);

create index if not exists "sponsor_payment_records_deal_idx"
  on public."sponsor_payment_records" using btree ("sponsor_deal_id");

create index if not exists "sponsor_payout_split_records_deal_idx"
  on public."sponsor_payout_split_records" using btree ("sponsor_deal_id");

alter table public."sponsor_brand_records" enable row level security;
alter table public."sponsor_creative_records" enable row level security;
alter table public."sponsor_placement_records" enable row level security;
alter table public."sponsor_disclosure_records" enable row level security;
alter table public."sponsor_review_logs" enable row level security;
alter table public."sponsor_payment_records" enable row level security;
alter table public."sponsor_payout_split_records" enable row level security;

drop policy if exists "sponsor_brand_records_select_owner_operator" on public."sponsor_brand_records";
create policy "sponsor_brand_records_select_owner_operator"
  on public."sponsor_brand_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_brand_records_insert_owner_operator" on public."sponsor_brand_records";
create policy "sponsor_brand_records_insert_owner_operator"
  on public."sponsor_brand_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_brand_records_update_owner_operator" on public."sponsor_brand_records";
create policy "sponsor_brand_records_update_owner_operator"
  on public."sponsor_brand_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_creative_records_select_owner_operator" on public."sponsor_creative_records";
create policy "sponsor_creative_records_select_owner_operator"
  on public."sponsor_creative_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_creative_records_insert_owner_operator" on public."sponsor_creative_records";
create policy "sponsor_creative_records_insert_owner_operator"
  on public."sponsor_creative_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_creative_records_update_owner_operator" on public."sponsor_creative_records";
create policy "sponsor_creative_records_update_owner_operator"
  on public."sponsor_creative_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_placement_records_select_owner_operator" on public."sponsor_placement_records";
create policy "sponsor_placement_records_select_owner_operator"
  on public."sponsor_placement_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_placement_records_insert_owner_operator" on public."sponsor_placement_records";
create policy "sponsor_placement_records_insert_owner_operator"
  on public."sponsor_placement_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_placement_records_update_owner_operator" on public."sponsor_placement_records";
create policy "sponsor_placement_records_update_owner_operator"
  on public."sponsor_placement_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_disclosure_records_select_owner_operator" on public."sponsor_disclosure_records";
create policy "sponsor_disclosure_records_select_owner_operator"
  on public."sponsor_disclosure_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_disclosure_records_insert_owner_operator" on public."sponsor_disclosure_records";
create policy "sponsor_disclosure_records_insert_owner_operator"
  on public."sponsor_disclosure_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_disclosure_records_update_owner_operator" on public."sponsor_disclosure_records";
create policy "sponsor_disclosure_records_update_owner_operator"
  on public."sponsor_disclosure_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_review_logs_select_owner_operator" on public."sponsor_review_logs";
create policy "sponsor_review_logs_select_owner_operator"
  on public."sponsor_review_logs"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_review_logs_insert_owner_operator" on public."sponsor_review_logs";
create policy "sponsor_review_logs_insert_owner_operator"
  on public."sponsor_review_logs"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_payment_records_select_owner_operator" on public."sponsor_payment_records";
create policy "sponsor_payment_records_select_owner_operator"
  on public."sponsor_payment_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_payment_records_insert_owner_operator" on public."sponsor_payment_records";
create policy "sponsor_payment_records_insert_owner_operator"
  on public."sponsor_payment_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_payment_records_update_owner_operator" on public."sponsor_payment_records";
create policy "sponsor_payment_records_update_owner_operator"
  on public."sponsor_payment_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_payout_split_records_select_owner_operator" on public."sponsor_payout_split_records";
create policy "sponsor_payout_split_records_select_owner_operator"
  on public."sponsor_payout_split_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_payout_split_records_insert_owner_operator" on public."sponsor_payout_split_records";
create policy "sponsor_payout_split_records_insert_owner_operator"
  on public."sponsor_payout_split_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "sponsor_payout_split_records_update_owner_operator" on public."sponsor_payout_split_records";
create policy "sponsor_payout_split_records_update_owner_operator"
  on public."sponsor_payout_split_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

grant select, insert, update on table public."sponsor_brand_records" to "authenticated";
grant select, insert, update on table public."sponsor_creative_records" to "authenticated";
grant select, insert, update on table public."sponsor_placement_records" to "authenticated";
grant select, insert, update on table public."sponsor_disclosure_records" to "authenticated";
grant select, insert on table public."sponsor_review_logs" to "authenticated";
grant select, insert, update on table public."sponsor_payment_records" to "authenticated";
grant select, insert, update on table public."sponsor_payout_split_records" to "authenticated";

do $$
declare
  proof_metadata jsonb := jsonb_build_object(
    'sponsor_checkout_foundation_proof', true,
    'created_by', 'codex_sponsor_checkout_foundation',
    'foundation_only', true,
    'live_money_action', false
  );
  foundation_brand_id uuid;
  foundation_deal_id bigint;
  foundation_payment_id uuid;
begin
  select "id"
    into foundation_brand_id
    from public."sponsor_brand_records"
    where "metadata"->>'created_by' = 'codex_sponsor_checkout_foundation'
    limit 1;

  if foundation_brand_id is null then
    insert into public."sponsor_brand_records" (
      "display_name",
      "status",
      "metadata"
    )
    values (
      'Sponsor Checkout Foundation Brand',
      'foundation',
      proof_metadata
    )
    returning "id" into foundation_brand_id;
  else
    update public."sponsor_brand_records"
      set
        "display_name" = 'Sponsor Checkout Foundation Brand',
        "status" = 'foundation',
        "metadata" = "metadata" || proof_metadata,
        "updated_at" = timezone('utc'::text, now())
      where "id" = foundation_brand_id;
  end if;

  select "id"
    into foundation_deal_id
    from public."sponsor_deal_records"
    where "metadata"->>'created_by' = 'codex_sponsor_checkout_foundation'
    limit 1;

  if foundation_deal_id is null then
    insert into public."sponsor_deal_records" (
      "brand_id",
      "brand_name",
      "creator_user_id",
      "channel_user_id",
      "deal_title",
      "deal_type",
      "status",
      "gross_amount_minor",
      "gross_amount_cents",
      "currency",
      "platform_share_bps",
      "creator_share_bps",
      "disclosure_required",
      "metadata"
    )
    values (
      foundation_brand_id,
      'Sponsor Checkout Foundation Brand',
      null,
      null,
      'Sponsor Checkout Foundation Proof Deal',
      'manual_foundation',
      'foundation',
      0,
      0,
      'usd',
      2000,
      8000,
      true,
      proof_metadata || jsonb_build_object(
        'brand_pays_chillywood_first', true,
        'checkout_connected', false,
        'payment_link_connected', false,
        'payout_split_execution_connected', false
      )
    )
    returning "id" into foundation_deal_id;
  else
    update public."sponsor_deal_records"
      set
        "brand_id" = foundation_brand_id,
        "brand_name" = 'Sponsor Checkout Foundation Brand',
        "deal_title" = 'Sponsor Checkout Foundation Proof Deal',
        "deal_type" = 'manual_foundation',
        "status" = 'foundation',
        "gross_amount_minor" = 0,
        "gross_amount_cents" = 0,
        "currency" = 'usd',
        "platform_share_bps" = 2000,
        "creator_share_bps" = 8000,
        "disclosure_required" = true,
        "metadata" = "metadata" || proof_metadata || jsonb_build_object(
          'brand_pays_chillywood_first', true,
          'checkout_connected', false,
          'payment_link_connected', false,
          'payout_split_execution_connected', false
        ),
        "updated_at" = timezone('utc'::text, now())
      where "id" = foundation_deal_id;
  end if;

  insert into public."sponsor_creative_records" (
    "sponsor_deal_id",
    "creative_type",
    "status",
    "title",
    "metadata"
  )
  select
    foundation_deal_id,
    'manual_foundation',
    'foundation',
    'Sponsor Checkout Foundation Creative',
    proof_metadata || jsonb_build_object('asset_upload_connected', false)
  where not exists (
    select 1
      from public."sponsor_creative_records"
      where "sponsor_deal_id" = foundation_deal_id
        and "metadata"->>'created_by' = 'codex_sponsor_checkout_foundation'
  );

  insert into public."sponsor_placement_records" (
    "sponsor_deal_id",
    "placement_type",
    "target_type",
    "status",
    "metadata"
  )
  select
    foundation_deal_id,
    'manual_foundation',
    'foundation',
    'foundation',
    proof_metadata || jsonb_build_object('placement_rendering_connected', false)
  where not exists (
    select 1
      from public."sponsor_placement_records"
      where "sponsor_deal_id" = foundation_deal_id
        and "metadata"->>'created_by' = 'codex_sponsor_checkout_foundation'
  );

  insert into public."sponsor_disclosure_records" (
    "sponsor_deal_id",
    "disclosure_text",
    "status",
    "metadata"
  )
  select
    foundation_deal_id,
    'Paid partnership disclosure required before this sponsor deal can go live.',
    'foundation',
    proof_metadata || jsonb_build_object('disclosure_required_before_live', true)
  where not exists (
    select 1
      from public."sponsor_disclosure_records"
      where "sponsor_deal_id" = foundation_deal_id
        and "metadata"->>'created_by' = 'codex_sponsor_checkout_foundation'
  );

  insert into public."sponsor_review_logs" (
    "sponsor_deal_id",
    "review_action",
    "reason",
    "metadata"
  )
  select
    foundation_deal_id,
    'foundation_proof_created',
    'Sponsor checkout foundation proof row only; no live sponsor approval action.',
    proof_metadata || jsonb_build_object(
      'safety_review_required_later', true,
      'disclosure_review_required_later', true,
      'fraud_review_required_later', true
    )
  where not exists (
    select 1
      from public."sponsor_review_logs"
      where "sponsor_deal_id" = foundation_deal_id
        and "metadata"->>'created_by' = 'codex_sponsor_checkout_foundation'
  );

  select "id"
    into foundation_payment_id
    from public."sponsor_payment_records"
    where "sponsor_deal_id" = foundation_deal_id
      and "metadata"->>'created_by' = 'codex_sponsor_checkout_foundation'
    limit 1;

  if foundation_payment_id is null then
    insert into public."sponsor_payment_records" (
      "sponsor_deal_id",
      "provider",
      "provider_reference",
      "status",
      "currency",
      "gross_amount_cents",
      "net_amount_cents",
      "platform_fee_cents",
      "creator_share_cents",
      "metadata"
    )
    values (
      foundation_deal_id,
      null,
      null,
      'foundation',
      'USD',
      0,
      0,
      0,
      0,
      proof_metadata || jsonb_build_object(
        'checkout_connected', false,
        'payment_provider_connected', false,
        'paid_status', false
      )
    )
    returning "id" into foundation_payment_id;
  else
    update public."sponsor_payment_records"
      set
        "provider" = null,
        "provider_reference" = null,
        "status" = 'foundation',
        "currency" = 'USD',
        "gross_amount_cents" = 0,
        "net_amount_cents" = 0,
        "platform_fee_cents" = 0,
        "creator_share_cents" = 0,
        "metadata" = "metadata" || proof_metadata || jsonb_build_object(
          'checkout_connected', false,
          'payment_provider_connected', false,
          'paid_status', false
        ),
        "updated_at" = timezone('utc'::text, now())
      where "id" = foundation_payment_id;
  end if;

  insert into public."sponsor_payout_split_records" (
    "sponsor_deal_id",
    "payment_record_id",
    "creator_user_id",
    "platform_share_bps",
    "creator_share_bps",
    "gross_amount_cents",
    "platform_share_cents",
    "creator_share_cents",
    "status",
    "metadata"
  )
  select
    foundation_deal_id,
    foundation_payment_id,
    null,
    2000,
    8000,
    0,
    0,
    0,
    'foundation',
    proof_metadata || jsonb_build_object(
      'split_calculation_connected', false,
      'creator_payable_balance_created', false,
      'payout_execution_connected', false
    )
  where not exists (
    select 1
      from public."sponsor_payout_split_records"
      where "sponsor_deal_id" = foundation_deal_id
        and "metadata"->>'created_by' = 'codex_sponsor_checkout_foundation'
  );
end $$;
