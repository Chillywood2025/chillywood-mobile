insert into public."creator_payout_accounts" (
  "id",
  "creator_user_id",
  "provider",
  "status",
  "default_currency",
  "metadata"
) values (
  '0d32c2fd-3af1-4e55-9ee2-1879794c8011',
  'finance_foundation_proof_creator',
  'manual',
  'not_active',
  'usd',
  jsonb_build_object(
    'finance_foundation_proof', true,
    'created_by', 'codex_finance_f2e_proof',
    'not_live_money', true
  )
)
on conflict ("id") do update set
  "status" = excluded."status",
  "metadata" = excluded."metadata",
  "updated_at" = timezone('utc'::text, now());

insert into public."creator_payout_batches" (
  "id",
  "batch_reference",
  "status",
  "currency",
  "total_amount_minor",
  "entry_count",
  "metadata"
) values (
  '98dc0320-4030-46d6-9c45-fb187498e082',
  'finance_f2e_foundation_proof',
  'not_active',
  'usd',
  0,
  0,
  jsonb_build_object(
    'finance_foundation_proof', true,
    'created_by', 'codex_finance_f2e_proof',
    'not_live_money', true
  )
)
on conflict ("id") do update set
  "status" = excluded."status",
  "total_amount_minor" = excluded."total_amount_minor",
  "entry_count" = excluded."entry_count",
  "metadata" = excluded."metadata",
  "updated_at" = timezone('utc'::text, now());

insert into public."creator_payout_provider_transfers" (
  "id",
  "batch_id",
  "creator_user_id",
  "payout_account_id",
  "provider",
  "amount_minor",
  "currency",
  "status",
  "metadata"
) values (
  '9f3b64d2-59aa-468a-95e0-a26ff4a868b5',
  '98dc0320-4030-46d6-9c45-fb187498e082',
  'finance_foundation_proof_creator',
  '0d32c2fd-3af1-4e55-9ee2-1879794c8011',
  'manual',
  0,
  'usd',
  'not_active',
  jsonb_build_object(
    'finance_foundation_proof', true,
    'created_by', 'codex_finance_f2e_proof',
    'not_live_money', true
  )
)
on conflict ("id") do update set
  "status" = excluded."status",
  "amount_minor" = excluded."amount_minor",
  "metadata" = excluded."metadata",
  "updated_at" = timezone('utc'::text, now());

insert into public."creator_payout_holds" (
  "id",
  "creator_user_id",
  "batch_id",
  "reason",
  "status",
  "admin_note",
  "metadata"
) values (
  '575b6383-9350-44ad-9c0b-66c05512c282',
  'finance_foundation_proof_creator',
  '98dc0320-4030-46d6-9c45-fb187498e082',
  'finance_foundation_proof',
  'not_active',
  'Foundation proof row only; no payout hold enforcement is active.',
  jsonb_build_object(
    'finance_foundation_proof', true,
    'created_by', 'codex_finance_f2e_proof',
    'not_live_money', true
  )
)
on conflict ("id") do update set
  "status" = excluded."status",
  "admin_note" = excluded."admin_note",
  "metadata" = excluded."metadata",
  "updated_at" = timezone('utc'::text, now());

insert into public."creator_payout_audit_log" (
  "id",
  "actor_role",
  "action",
  "target_table",
  "target_id",
  "creator_user_id",
  "next_status",
  "reason",
  "metadata"
) values (
  'ed78b93a-f88e-4853-9f6b-b052f84cce8d',
  'foundation_proof',
  'foundation_proof_recorded',
  'creator_payout_accounts',
  '0d32c2fd-3af1-4e55-9ee2-1879794c8011',
  'finance_foundation_proof_creator',
  'not_active',
  'Finance F2E proof row only; no live payout action.',
  jsonb_build_object(
    'finance_foundation_proof', true,
    'created_by', 'codex_finance_f2e_proof',
    'not_live_money', true
  )
)
on conflict ("id") do nothing;
