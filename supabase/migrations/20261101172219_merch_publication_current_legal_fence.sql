-- Current legal/eligibility checks cannot race a revocation during publish.
do $$declare t text;definition text;needle text;begin
 foreach t in array array['public.wave1_creator_eligibility','public.wave1_legal_acceptances','public.wave1_legal_document_versions'] loop
  execute format('create trigger merch_publish_authority_changed after insert or update or delete on %s for each statement execute function private.merch_publish_authority_changed()',t);
 end loop;
 definition:=pg_get_functiondef('private.merch_live_publication_authority(public.merch_products)'::regprocedure);
 needle:=chr(10)||'begin'||chr(10);
 if position(needle in definition)=0 then raise exception 'merch_publish_authority_body_changed';end if;
 execute replace(definition,needle,needle||$patch$
 -- Match the existing reservation/evaluator creator-advisory order before
 -- taking eligibility locks, never row/table first then creator advisory.
 perform pg_advisory_xact_lock(hashtextextended('merch-tax-authority',0));
 perform pg_advisory_xact_lock(hashtextextended('wave1-creator:'||p.creator_id::text,0));
 lock table public.wave1_creator_eligibility,public.wave1_legal_acceptances,public.wave1_legal_document_versions in share mode;
 if auth.uid()=p.creator_id then
  perform 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=p.creator_id for share;
  perform public.wave1_assert_current_creator_money_authority_internal();
 end if;
$patch$);
end $$;

do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.confirm_creator_merch_live_publication(uuid)'::regprocedure);
 needle:='if authority->>''ready''<>''true'' or authority is distinct from r.authority or epoch<>r.authority_epoch then';
 if position(needle in definition)=0 then raise exception 'merch_publish_final_guard_changed';end if;
 execute replace(definition,needle,'if r.expires_at<=clock_timestamp() or authority->>''ready''<>''true'' or authority is distinct from r.authority or epoch<>r.authority_epoch then');
end $$;
