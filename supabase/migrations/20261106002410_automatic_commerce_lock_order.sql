begin;
-- The retained merch/global latch must precede the new creator-subject locks.
-- Limit this change to merch entrypoints: unrelated creator capabilities can
-- already own room/event locks when they invoke the common assertion.
do $patch$
declare signature text; definition text; needle text;
begin
 needle:='perform public.wave1_assert_current_creator_money_authority_internal();';
 foreach signature in array array[
  'public.review_creator_merch_live_publication(uuid,timestamp with time zone)',
  'public.confirm_creator_merch_live_publication(uuid)',
  'public.copy_creator_merch_live_draft(uuid,timestamp with time zone)',
  'public.select_creator_merch_tax_category(uuid,uuid,timestamp with time zone,text)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position(needle in definition)=0 then raise exception 'automatic_merch_entry_lock_patch_missing: %',signature; end if;
  execute replace(definition,needle,'perform private.platform_brand_retention_lock();'||chr(10)||' '||needle);
 end loop;
end $patch$;

-- Cashout's retained source-before-reservation ordering is still required for
-- refunds. Take Premium authority before those source rows as well: canonical
-- Premium processors own the owner mutex before writing source/ledger rows.
-- These are locks, not eligibility checks. Historical cancellation, returns,
-- status and reconciliation do not acquire a new Premium requirement.
do $patch$
declare definition text; needle text:=E'begin\n';
begin
 definition:=pg_get_functiondef('private.lock_sandbox_cashout_creator(uuid)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'automatic_cashout_lock_patch_missing'; end if;
 execute replace(definition,needle,needle||$replacement$
 perform private.platform_brand_retention_lock();
 perform 1 from auth.users where id=p_creator for share;
 perform 1 from auth.sessions where user_id=p_creator order by id for share;
 perform private.lock_ordinary_commerce_premium_subjects(array[p_creator]);
$replacement$);
end $patch$;

-- The current creator assertion owns auth-user/session and Premium locks before
-- the creator mutex. Never call it for the first time while holding that mutex
-- or a publication table SHARE lock. The helper itself remains private.
do $patch$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('private.merch_live_publication_authority(public.merch_products)'::regprocedure);
 needle:=$needle$ if auth.uid()=p.creator_id then
  perform 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=p.creator_id for share;
  perform public.wave1_assert_current_creator_money_authority_internal();
 end if;$needle$;
 if position(needle in definition)=0 then raise exception 'automatic_publication_assertion_lock_patch_missing'; end if;
 definition:=replace(definition,needle,'');
 needle:=E'begin\n';
 if position(needle in definition)=0 then raise exception 'automatic_publication_body_lock_patch_missing'; end if;
 execute replace(definition,needle,needle||$replacement$
 if auth.uid()=p.creator_id then
  perform public.wave1_assert_current_creator_money_authority_internal();
 end if;
$replacement$);
end $patch$;
-- The legacy eligibility record is one shared restriction row per creator.
-- Its projector deliberately keeps its live-account pointer once a live row
-- exists; that pointer cannot select the account for a later sandbox request.
-- Every mode-specific fact remains required on the independently bound account
-- and its observation job. Keep ALL common false/hold/admin flags fail-closed:
-- the legacy row cannot distinguish provider-derived false from operator false.
do $patch$
declare definition text;
 needle text:='e.payout_account_id=a.id and e.creator_user_id=a.creator_user_id';
begin
 definition:=pg_get_functiondef('private.ordinary_creator_provider_ready(uuid,text)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'automatic_provider_mode_restriction_patch_missing'; end if;
 execute replace(definition,needle,'e.creator_user_id=a.creator_user_id');
end $patch$;
commit;
