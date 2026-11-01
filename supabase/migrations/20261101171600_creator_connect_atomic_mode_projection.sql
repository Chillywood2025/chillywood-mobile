begin;
create function private.prevent_connect_binding_history_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'connect_binding_history_immutable'; end $$;
revoke all on function private.prevent_connect_binding_history_mutation() from public,anon,authenticated,service_role;
create trigger creator_connect_mode_binding_history_immutable before update or delete on private.creator_connect_mode_bindings
 for each row execute function private.prevent_connect_binding_history_mutation();
create trigger creator_connect_live_setup_consent_immutable before update or delete on private.creator_connect_live_setup_consents
 for each row execute function private.prevent_connect_binding_history_mutation();
-- Account observers already hold their account row. Never acquire the creator
-- setup mutex from an AFTER-row trigger: setup RPCs use creator -> account.
-- The conflicting eligibility tuple supplies the atomic mode preference even
-- when an observer's statement snapshot predates a concurrent live insert.
do $patch$
declare d text; old text;
begin
 d:=pg_get_functiondef('private.project_creator_connect_observed_eligibility()'::regprocedure);
 old:='  perform pg_advisory_xact_lock(hashtextextended(''connect-creator:''||new.creator_user_id,0));';
 if position(old in d)=0 then raise exception 'connect_projection_mutex_patch_missing'; end if;
 d:=replace(d,old,'');
 old:='metadata=existing.metadata || excluded.metadata, updated_at=now();';
 if position(old in d)=0 then raise exception 'connect_projection_atomic_guard_patch_missing'; end if;
 d:=replace(d,old,'tax_ready=case when existing.payout_account_id is not distinct from excluded.payout_account_id then existing.tax_ready else false end,
    hold_period_cleared=case when existing.payout_account_id is not distinct from excluded.payout_account_id then existing.hold_period_cleared else false end,
    minimum_payout_met=case when existing.payout_account_id is not distinct from excluded.payout_account_id then existing.minimum_payout_met else false end,
    admin_review_status=case when existing.payout_account_id is not distinct from excluded.payout_account_id
      or existing.admin_review_status in (''pending_review'',''rejected'',''on_hold'') then existing.admin_review_status else ''not_started'' end,
    metadata=case when existing.payout_account_id is not distinct from excluded.payout_account_id then existing.metadata || excluded.metadata
      else excluded.metadata || jsonb_build_object(''previous_payout_account_id'',existing.payout_account_id) end, updated_at=now()
    where not (excluded.metadata->>''provider_environment'' is not distinct from ''test''
      and existing.metadata->>''provider_environment'' is not distinct from ''live'');');
 execute d;
end $patch$;
commit;
