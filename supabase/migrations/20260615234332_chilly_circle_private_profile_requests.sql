create or replace function public.request_friendship(target_user_id text)
returns public.user_friendships
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_user_id text := (auth.uid())::text;
    normalized_target_user_id text := nullif(btrim(coalesce(target_user_id, '')), '');
    target_profile_visibility text := 'everyone';
    next_status text := 'active';
    next_responded_at timestamptz := timezone('utc'::text, now());
    pair_low_id text;
    pair_high_id text;
    friendship_row public.user_friendships%rowtype;
begin
    if actor_user_id is null or actor_user_id = '' then
        raise exception 'Chi''lly Circle requires a signed-in user.';
    end if;

    if normalized_target_user_id is null then
        raise exception 'Target user id is required.';
    end if;

    if actor_user_id = normalized_target_user_id then
        raise exception 'You cannot add yourself to Chi''lly Circle.';
    end if;

    if actor_user_id = 'platform_rachi_official'::text or normalized_target_user_id = 'platform_rachi_official'::text then
        raise exception 'Official platform accounts are not part of normal Chi''lly Circle adds.';
    end if;

    if exists (
        select 1
        from public."channel_audience_blocks"
        where (
            channel_user_id = actor_user_id
            and blocked_user_id = normalized_target_user_id
        ) or (
            channel_user_id = normalized_target_user_id
            and blocked_user_id = actor_user_id
        )
        limit 1
    ) then
        raise exception 'Chi''lly Circle is unavailable while a channel audience block exists between these accounts.';
    end if;

    select coalesce(nullif(profile_visibility, ''), 'everyone'::text)
    into target_profile_visibility
    from public."user_profiles"
    where user_id = normalized_target_user_id
    limit 1;

    if target_profile_visibility in ('private'::text, 'chilly_circle_only'::text) then
        next_status := 'pending';
        next_responded_at := null;
    end if;

    pair_low_id := least(actor_user_id, normalized_target_user_id);
    pair_high_id := greatest(actor_user_id, normalized_target_user_id);

    select *
    into friendship_row
    from public."user_friendships"
    where user_low_id = pair_low_id
      and user_high_id = pair_high_id
    limit 1;

    if not found then
        insert into public."user_friendships" (
            user_low_id,
            user_high_id,
            requested_by_user_id,
            status,
            responded_at,
            actioned_by_user_id
        )
        values (
            pair_low_id,
            pair_high_id,
            actor_user_id,
            next_status,
            next_responded_at,
            case when next_status = 'active'::text then actor_user_id else null end
        )
        returning *
        into friendship_row;

        return friendship_row;
    end if;

    if friendship_row.status = 'active'::text then
        return friendship_row;
    end if;

    update public."user_friendships"
    set requested_by_user_id = actor_user_id,
        status = next_status,
        created_at = case when friendship_row.status in ('declined'::text, 'canceled'::text, 'removed'::text)
            then timezone('utc'::text, now())
            else created_at
        end,
        responded_at = next_responded_at,
        actioned_by_user_id = case when next_status = 'active'::text then actor_user_id else null end,
        updated_at = timezone('utc'::text, now())
    where user_low_id = pair_low_id
      and user_high_id = pair_high_id
    returning *
    into friendship_row;

    return friendship_row;
end;
$$;

revoke all on function public.request_friendship(text) from public;

grant execute on function public.request_friendship(text) to "authenticated";
grant execute on function public.request_friendship(text) to "postgres";
grant execute on function public.request_friendship(text) to "service_role";
