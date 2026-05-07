revoke all on table public."user_account_legal_acceptances" from anon;
revoke all on table public."user_account_legal_acceptances" from public;

grant select, insert, update on table public."user_account_legal_acceptances" to authenticated;
grant all on table public."user_account_legal_acceptances" to service_role;
