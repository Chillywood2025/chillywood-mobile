-- Public title discovery previously inherited the baseline `using (true)`
-- policy, allowing draft, archived, unpublished, and future-scheduled rows to
-- reach release-facing clients. Keep content programming available to exact
-- current-session Owner/Operator identities while making ordinary reads
-- release-eligible and fail-closed at the authoritative row boundary.

drop policy if exists "Enable read access for all users"
  on public."titles";
drop policy if exists "titles_public_release_select"
  on public."titles";
drop policy if exists "titles_programming_select"
  on public."titles";

create policy "titles_public_release_select"
  on public."titles"
  for select
  to anon, authenticated
  using (
    "is_published" is true
    and lower(trim(coalesce("status", ''))) = 'published'
    and ("release_at" is null or "release_at" <= now())
    and ("release_date" is null or "release_date" <= now())
  );

create policy "titles_programming_select"
  on public."titles"
  for select
  to authenticated
  using (
    public."has_platform_role"(array['owner'::text, 'operator'::text])
  );

comment on policy "titles_public_release_select"
  on public."titles" is
  'Ordinary clients may read only explicitly published titles whose release boundaries have arrived.';

comment on policy "titles_programming_select"
  on public."titles" is
  'Exact current-session Owner/Operator identities retain draft, scheduled, and archived title readback for the canonical programming console.';
