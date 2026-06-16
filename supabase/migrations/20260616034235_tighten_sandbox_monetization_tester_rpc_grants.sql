-- Tighten sandbox monetization tester RPC execute grants after production
-- readback showed default PUBLIC/anon EXECUTE entries. The functions already
-- fail closed, but public-v1 tester access should expose only authenticated
-- mobile calls plus service-role proof scripts.

revoke all on function public."resolve_sandbox_monetization_tester"(text, text) from public;
revoke all on function public."resolve_sandbox_monetization_tester"(text, text) from anon;
revoke all on function public."resolve_sandbox_monetization_tester"(text, text) from authenticated;

revoke all on function public."list_sandbox_monetization_testers"() from public;
revoke all on function public."list_sandbox_monetization_testers"() from anon;
revoke all on function public."list_sandbox_monetization_testers"() from authenticated;

revoke all on function public."grant_sandbox_monetization_tester"(text, text, timestamptz, text) from public;
revoke all on function public."grant_sandbox_monetization_tester"(text, text, timestamptz, text) from anon;
revoke all on function public."grant_sandbox_monetization_tester"(text, text, timestamptz, text) from authenticated;

revoke all on function public."revoke_sandbox_monetization_tester"(uuid, text, text) from public;
revoke all on function public."revoke_sandbox_monetization_tester"(uuid, text, text) from anon;
revoke all on function public."revoke_sandbox_monetization_tester"(uuid, text, text) from authenticated;

grant execute on function public."resolve_sandbox_monetization_tester"(text, text) to authenticated;
grant execute on function public."resolve_sandbox_monetization_tester"(text, text) to service_role;

grant execute on function public."list_sandbox_monetization_testers"() to authenticated;
grant execute on function public."list_sandbox_monetization_testers"() to service_role;

grant execute on function public."grant_sandbox_monetization_tester"(text, text, timestamptz, text) to authenticated;
grant execute on function public."grant_sandbox_monetization_tester"(text, text, timestamptz, text) to service_role;

grant execute on function public."revoke_sandbox_monetization_tester"(uuid, text, text) to authenticated;
grant execute on function public."revoke_sandbox_monetization_tester"(uuid, text, text) to service_role;
