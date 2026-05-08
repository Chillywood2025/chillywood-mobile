alter table public."creator_payout_ledger_entries" enable row level security;

drop policy if exists "creator_payout_ledger_entries_select_own_creator"
  on public."creator_payout_ledger_entries";

create policy "creator_payout_ledger_entries_select_own_creator"
  on public."creator_payout_ledger_entries"
  for select
  to "authenticated"
  using ("creator_user_id" = (auth.uid())::text);

grant select on table public."creator_payout_ledger_entries" to "authenticated";
