-- Prospective default only. Other earning issuers omit created_at; transaction
-- start time can predate a fee adjustment recorded earlier in the same long
-- transaction. Preserve explicit historical timestamps and every existing row.
alter table public.creator_earnings_ledger alter column created_at set default clock_timestamp();
