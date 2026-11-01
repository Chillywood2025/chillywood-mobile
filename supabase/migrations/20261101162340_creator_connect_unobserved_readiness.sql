-- Missing live observation is false readiness, never SQL NULL and never a
-- reason to abort safe creation of an unverified account binding.
do $fix$
declare definition text;
begin
 select pg_get_functiondef('private.project_creator_connect_observed_eligibility()'::regprocedure) into definition;
 if position('  v_reported_ready := v_kyc_ready' in definition)=0 or position('  v_ready := v_reported_ready' in definition)=0
 then raise exception 'connect_observation_projector_shape_changed'; end if;
 definition:=replace(definition,'  v_reported_ready := v_kyc_ready','  v_kyc_ready := coalesce(v_kyc_ready,false);'||chr(10)||'  v_reported_ready := v_kyc_ready');
 definition:=replace(definition,'  v_ready := v_reported_ready','  v_reported_ready := coalesce(v_reported_ready,false);'||chr(10)||'  v_ready := v_reported_ready');
 execute definition;
end $fix$;
