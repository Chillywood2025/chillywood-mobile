begin;

-- The reviewed live publication transaction validates the original sandbox
-- draft with the existing photo/variant/rights writer BEFORE atomically
-- promoting its stored environment. Its private transaction/product context
-- is created only after exact current production authority and review checks.
-- Require production authority in that context, without relabeling the draft
-- or changing the later stored-environment race check. Ordinary sandbox saves
-- have no such context and retain their strict current-mode requirement.
do $patch$
declare definition text; needle text;
begin
 definition:=pg_get_functiondef('public.save_creator_merch_product_before_variants(uuid,text,text,text,integer,integer,text,timestamp with time zone)'::regprocedure);
 needle:='if p_publication_status=''published'' then perform private.assert_current_creator_for_mode(authority_environment); end if;';
 if length(definition)-length(replace(definition,needle,''))<>length(needle)
 then raise exception 'reviewed_merch_mode_patch_changed'; end if;
 execute replace(definition,needle,$replacement$
 if p_publication_status='published' then
  perform private.assert_current_creator_for_mode(case when exists(
   select 1 from private.merch_publication_confirmation_context
   where transaction_id=txid_current() and product_id=p_product_id
  ) then 'production' else authority_environment end);
 end if;
$replacement$);
end $patch$;

commit;
