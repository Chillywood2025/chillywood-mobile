revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from public;
revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from anon;
revoke all on function public.get_or_create_direct_chat_thread(text, text, text, text) from service_role;
grant execute on function public.get_or_create_direct_chat_thread(text, text, text, text) to authenticated;

comment on function public.get_or_create_direct_chat_thread(text, text, text, text) is
  'Authenticated direct Chi''lly Chat open/create repair. It only operates on the caller and requested target pair, denies account-restricted, unavailable, blocked, and unauthorized targets before thread creation, preserves platform-owner chat restrictions, repairs missing direct-thread memberships, and returns only the thread id for normal RLS readback.';
