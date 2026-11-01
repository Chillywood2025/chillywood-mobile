begin;
-- Setup is independent of money rails, never independent of creator, adult,
-- current-session and current-terms authority. Include legacy test fallback.
do $patch$
declare d text;old text;
begin
 d:=pg_get_functiondef('public.get_creator_connect_onboarding_route(uuid,uuid)'::regprocedure);
 old:='if p.id is null and a.id is null then return jsonb_build_object(''mode'',''test''); end if;';
 if position(old in d)=0 then raise exception 'connect_all_mode_admission_patch_missing'; end if;
 execute replace(d,old,'if not private.creator_connect_onboarding_subject(p_creator,p_session) then
  return jsonb_build_object(''mode'',case when p.id is null and a.id is null then ''test'' else ''live'' end,
    ''status'',''creator_onboarding_eligibility_required''); end if;
 if p.id is null and a.id is null then
  if not (public.platform_subject_has_role_internal(p_creator::text,array[''owner'',''operator''])
   or exists(select 1 from public.beta_access_memberships b where b.user_id=p_creator::text and b.access_status=''active'')
   or exists(select 1 from public.sandbox_monetization_testers approved_tester where approved_tester.user_id=p_creator::text and approved_tester.status=''active''
    and (approved_tester.expires_at is null or approved_tester.expires_at>clock_timestamp()))) then
   return jsonb_build_object(''mode'',''test'',''status'',''not_configured'',''reason'',''live_setup_required'');
  end if;
  return jsonb_build_object(''mode'',''test''); end if;');
end $patch$;
commit;
