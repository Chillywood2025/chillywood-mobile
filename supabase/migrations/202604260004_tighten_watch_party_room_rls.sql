create or replace function public.user_has_active_entitlement(
  target_user_id text,
  required_entitlement_keys text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    nullif(trim(coalesce(target_user_id, '')), '') is not null
    and coalesce(array_length(required_entitlement_keys, 1), 0) > 0
    and (
      target_user_id = (auth.uid())::text
      or public.has_platform_role(array['owner'::text, 'operator'::text])
    )
    and exists (
      select 1
      from public."user_entitlements" entitlement
      where entitlement."user_id" = target_user_id
        and entitlement."entitlement_key" = any(required_entitlement_keys)
        and entitlement."status" in ('active', 'trialing', 'grace_period')
        and entitlement."revoked_at" is null
        and (
          entitlement."expires_at" is null
          or entitlement."expires_at" > timezone('utc'::text, now())
        )
    );
$$;

revoke all on function public.user_has_active_entitlement(text, text[]) from public;
grant execute on function public.user_has_active_entitlement(text, text[]) to "authenticated";
grant execute on function public.user_has_active_entitlement(text, text[]) to "service_role";

drop policy if exists "allow_anon_insert_watch_party" on public."watch_party_rooms";
drop policy if exists "watch_party_rooms_select_policy" on public."watch_party_rooms";

drop policy if exists "watch_party_room_memberships_self_insert_policy" on public."watch_party_room_memberships";
create policy "watch_party_room_memberships_self_insert_policy"
  on public."watch_party_room_memberships"
  for insert
  to public
  with check (
    auth.uid() is not null
    and "user_id" = (auth.uid())::text
    and exists (
      select 1
      from public."watch_party_rooms" room
      where room."party_id" = watch_party_room_memberships."party_id"
        and (
          room."host_user_id" = auth.uid()
          or (
            room."join_policy" = 'open'
            and (
              room."content_access_rule" = 'open'
              or (
                room."content_access_rule" = 'party_pass'
                and public.user_has_active_entitlement(
                  (auth.uid())::text,
                  array['premium_watch_party'::text, 'premium'::text]
                )
              )
              or (
                room."content_access_rule" = 'premium'
                and (
                  (
                    room."room_type" = 'live'
                    and public.user_has_active_entitlement(
                      (auth.uid())::text,
                      array['premium_live'::text, 'premium'::text]
                    )
                  )
                  or (
                    room."room_type" = 'title'
                    and public.user_has_active_entitlement(
                      (auth.uid())::text,
                      array['paid_content'::text, 'premium'::text]
                    )
                  )
                  or public.user_has_active_entitlement(
                    (auth.uid())::text,
                    array['premium'::text]
                  )
                )
              )
            )
          )
        )
    )
  );
