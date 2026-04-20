alter table public.user_profiles
  add column if not exists channel_layout_preset text not null default 'spotlight';

update public.user_profiles
set channel_layout_preset = 'spotlight'
where channel_layout_preset is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_channel_layout_preset_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_channel_layout_preset_check
      check (channel_layout_preset in ('spotlight', 'live_first', 'library_first'));
  end if;
end
$$;
