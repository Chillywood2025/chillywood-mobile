create table public."user_friendships" (
    "user_low_id" text not null,
    "user_high_id" text not null,
    "requested_by_user_id" text not null,
    "status" text default 'pending'::text not null,
    "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
    "responded_at" timestamp with time zone,
    "actioned_by_user_id" text,
    "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table only public."user_friendships"
    add constraint "user_friendships_pkey" PRIMARY KEY (user_low_id, user_high_id);
alter table only public."user_friendships"
    add constraint "user_friendships_pair_check" CHECK (user_low_id < user_high_id);
alter table only public."user_friendships"
    add constraint "user_friendships_requested_by_check" CHECK (requested_by_user_id = ANY (ARRAY[user_low_id, user_high_id]));
alter table only public."user_friendships"
    add constraint "user_friendships_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'declined'::text, 'canceled'::text, 'removed'::text]));
alter table only public."user_friendships"
    add constraint "user_friendships_actioned_by_check" CHECK ((actioned_by_user_id IS NULL) OR (actioned_by_user_id = ANY (ARRAY[user_low_id, user_high_id])));

create index "user_friendships_low_status_idx"
    ON public."user_friendships" USING btree (user_low_id, status, updated_at DESC);
create index "user_friendships_high_status_idx"
    ON public."user_friendships" USING btree (user_high_id, status, updated_at DESC);
create index "user_friendships_requester_status_idx"
    ON public."user_friendships" USING btree (requested_by_user_id, status, updated_at DESC);

alter table public."user_friendships" enable row level security;

create policy "user_friendships_select_participants"
    on public."user_friendships"
    for select
    to "authenticated"
    using (
        (auth.uid() IS NOT NULL)
        AND (
            user_low_id = (auth.uid())::text
            OR user_high_id = (auth.uid())::text
        )
    );

create or replace function public.request_friendship(target_user_id text)
returns public.user_friendships
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_user_id text := (auth.uid())::text;
    normalized_target_user_id text := nullif(btrim(coalesce(target_user_id, '')), '');
    pair_low_id text;
    pair_high_id text;
    friendship_row public.user_friendships%rowtype;
begin
    if actor_user_id is null or actor_user_id = '' then
        raise exception 'Chi''llywood friendship requires a signed-in user.';
    end if;

    if normalized_target_user_id is null then
        raise exception 'Target user id is required.';
    end if;

    if actor_user_id = normalized_target_user_id then
        raise exception 'You cannot friend yourself.';
    end if;

    if actor_user_id = 'platform_rachi_official'::text or normalized_target_user_id = 'platform_rachi_official'::text then
        raise exception 'Official platform accounts are not part of the native friend graph.';
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
            status
        )
        values (
            pair_low_id,
            pair_high_id,
            actor_user_id,
            'pending'::text
        )
        returning *
        into friendship_row;

        return friendship_row;
    end if;

    if friendship_row.status = 'pending'::text then
        if friendship_row.requested_by_user_id = actor_user_id then
            return friendship_row;
        end if;

        raise exception 'An incoming friend request is already waiting for your response.';
    end if;

    if friendship_row.status = 'active'::text then
        return friendship_row;
    end if;

    update public."user_friendships"
    set requested_by_user_id = actor_user_id,
        status = 'pending'::text,
        created_at = timezone('utc'::text, now()),
        responded_at = null,
        actioned_by_user_id = null,
        updated_at = timezone('utc'::text, now())
    where user_low_id = pair_low_id
      and user_high_id = pair_high_id
    returning *
    into friendship_row;

    return friendship_row;
end;
$$;

create or replace function public.respond_to_friendship(target_user_id text, next_action text)
returns public.user_friendships
language plpgsql
security definer
set search_path = public
as $$
declare
    actor_user_id text := (auth.uid())::text;
    normalized_target_user_id text := nullif(btrim(coalesce(target_user_id, '')), '');
    normalized_action text := lower(btrim(coalesce(next_action, '')));
    pair_low_id text;
    pair_high_id text;
    friendship_row public.user_friendships%rowtype;
begin
    if actor_user_id is null or actor_user_id = '' then
        raise exception 'Chi''llywood friendship requires a signed-in user.';
    end if;

    if normalized_target_user_id is null then
        raise exception 'Target user id is required.';
    end if;

    if actor_user_id = normalized_target_user_id then
        raise exception 'You cannot update friendship with yourself.';
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
        raise exception 'No native friendship exists for this pair yet.';
    end if;

    if normalized_action = 'accept'::text then
        if friendship_row.status <> 'pending'::text then
            raise exception 'Only pending friend requests can be accepted.';
        end if;
        if friendship_row.requested_by_user_id = actor_user_id then
            raise exception 'Only the recipient can accept a pending friend request.';
        end if;

        update public."user_friendships"
        set status = 'active'::text,
            responded_at = timezone('utc'::text, now()),
            actioned_by_user_id = actor_user_id,
            updated_at = timezone('utc'::text, now())
        where user_low_id = pair_low_id
          and user_high_id = pair_high_id
        returning *
        into friendship_row;

        return friendship_row;
    end if;

    if normalized_action = 'decline'::text then
        if friendship_row.status <> 'pending'::text then
            raise exception 'Only pending friend requests can be declined.';
        end if;
        if friendship_row.requested_by_user_id = actor_user_id then
            raise exception 'Only the recipient can decline a pending friend request.';
        end if;

        update public."user_friendships"
        set status = 'declined'::text,
            responded_at = timezone('utc'::text, now()),
            actioned_by_user_id = actor_user_id,
            updated_at = timezone('utc'::text, now())
        where user_low_id = pair_low_id
          and user_high_id = pair_high_id
        returning *
        into friendship_row;

        return friendship_row;
    end if;

    if normalized_action = 'cancel'::text then
        if friendship_row.status <> 'pending'::text then
            raise exception 'Only pending friend requests can be canceled.';
        end if;
        if friendship_row.requested_by_user_id <> actor_user_id then
            raise exception 'Only the sender can cancel a pending friend request.';
        end if;

        update public."user_friendships"
        set status = 'canceled'::text,
            responded_at = timezone('utc'::text, now()),
            actioned_by_user_id = actor_user_id,
            updated_at = timezone('utc'::text, now())
        where user_low_id = pair_low_id
          and user_high_id = pair_high_id
        returning *
        into friendship_row;

        return friendship_row;
    end if;

    if normalized_action = 'remove'::text then
        if friendship_row.status <> 'active'::text then
            raise exception 'Only active friends can be removed.';
        end if;

        update public."user_friendships"
        set status = 'removed'::text,
            responded_at = timezone('utc'::text, now()),
            actioned_by_user_id = actor_user_id,
            updated_at = timezone('utc'::text, now())
        where user_low_id = pair_low_id
          and user_high_id = pair_high_id
        returning *
        into friendship_row;

        return friendship_row;
    end if;

    raise exception 'Unsupported friendship action: %', normalized_action;
end;
$$;

revoke all on function public.request_friendship(text) from public;
revoke all on function public.respond_to_friendship(text, text) from public;

grant select on table public."user_friendships" to "authenticated";
grant all on table public."user_friendships" to "postgres";
grant all on table public."user_friendships" to "service_role";
grant execute on function public.request_friendship(text) to "authenticated";
grant execute on function public.request_friendship(text) to "postgres";
grant execute on function public.request_friendship(text) to "service_role";
grant execute on function public.respond_to_friendship(text, text) to "authenticated";
grant execute on function public.respond_to_friendship(text, text) to "postgres";
grant execute on function public.respond_to_friendship(text, text) to "service_role";
