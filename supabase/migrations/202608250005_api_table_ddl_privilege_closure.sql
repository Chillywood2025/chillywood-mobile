-- Whole-app closure: PostgREST API roles must never hold table-level DDL or
-- maintenance authority. Row-level security does not apply to TRUNCATE, and
-- REFERENCES/TRIGGER/MAINTAIN are not application data-plane privileges.

revoke truncate, references, trigger, maintain
on all tables in schema public
from public, anon, authenticated;

-- Keep the same fail-closed boundary for tables created by later migrations
-- under the migration role. A future migration that needs an exceptional API
-- grant must name and review that exact table/privilege explicitly.
alter default privileges in schema public
revoke truncate, references, trigger, maintain on tables
from public, anon, authenticated;
