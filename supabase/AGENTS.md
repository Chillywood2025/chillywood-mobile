# Supabase assurance boundary

Read remote migration history before planning database work. Production access
is read-only unless a separate Level D authorization names the mutation.
Deployed migrations are immutable: exact version, name, statement body, and hash
must exist in Git, and corrections are forward-only.

Database changes require focused pgTAP, RLS/FORCE RLS and grant review,
deterministic transaction/concurrency proof, migration parity, rollback, and the
full database suite at the frozen head. Never weaken auth, RLS, rights, roles, or
grants to make a test pass. Do not create or update `deno.lock` incidentally.
