create table if not exists public."user_account_legal_acceptances" (
  "user_id" text not null,
  "age_confirmed_at" timestamp with time zone,
  "age_confirmed_version" text,
  "terms_accepted_at" timestamp with time zone,
  "terms_accepted_version" text,
  "privacy_accepted_at" timestamp with time zone,
  "privacy_accepted_version" text,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "user_account_legal_acceptances_pkey" primary key ("user_id")
);

alter table public."user_account_legal_acceptances" enable row level security;

revoke all on table public."user_account_legal_acceptances" from public;
grant select, insert, update on table public."user_account_legal_acceptances" to authenticated;
grant all on table public."user_account_legal_acceptances" to service_role;

drop policy if exists "user_account_legal_acceptances_select_own"
  on public."user_account_legal_acceptances";
create policy "user_account_legal_acceptances_select_own"
  on public."user_account_legal_acceptances"
  for select
  to authenticated
  using ("user_id" = (auth.uid())::text);

drop policy if exists "user_account_legal_acceptances_insert_own"
  on public."user_account_legal_acceptances";
create policy "user_account_legal_acceptances_insert_own"
  on public."user_account_legal_acceptances"
  for insert
  to authenticated
  with check ("user_id" = (auth.uid())::text);

drop policy if exists "user_account_legal_acceptances_update_own"
  on public."user_account_legal_acceptances";
create policy "user_account_legal_acceptances_update_own"
  on public."user_account_legal_acceptances"
  for update
  to authenticated
  using ("user_id" = (auth.uid())::text)
  with check ("user_id" = (auth.uid())::text);
