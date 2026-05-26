drop policy if exists "profile_media_storage_insert_official_rachi_operator" on storage.objects;
create policy "profile_media_storage_insert_official_rachi_operator"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-media'
    and name like 'official/rachi/%'
    and public.has_platform_role(array['owner'::text, 'operator'::text])
  );

drop policy if exists "profile_media_storage_delete_official_rachi_operator" on storage.objects;
create policy "profile_media_storage_delete_official_rachi_operator"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-media'
    and name like 'official/rachi/%'
    and public.has_platform_role(array['owner'::text, 'operator'::text])
  );
